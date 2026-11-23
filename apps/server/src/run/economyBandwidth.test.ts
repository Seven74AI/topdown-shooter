import { describe, expect, it } from "vitest";
import { Encoder, schema, t as st } from "@colyseus/schema";
import { pack } from "msgpackr";
import {
  NET_EVENT_KIND,
  TICK_DT_S,
  botConfigOf,
  botInput,
  botViewFromWorld,
  createBotView,
  encodeNetEvent,
  loadBalance,
  setBuildReady,
  upgradeWeapon,
  NEUTRAL_INPUT,
  type NetEvent,
  type NetEventContext,
  type PlayerInput,
} from "@topdown/shared";
import { RunController } from "./RunController";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";

const balance = loadBalance();

/**
 * Story 3.10 (retro R3/A8; the open items of Stories 3.2 and 3.1), measured like `tickCost.test.ts`:
 * the bytes per second that one client receives because of
 * - the wallets: `wallet` / `earned` in the patches and the `money.earned` events, in a real wave 3
 *   with 4 bots fighting (god mode keeps them up), and
 * - the build timer: `buildTicksLeft` in the patches during a 30 s build phase.
 * Patch bytes: the measured fields are copied (on change, like `syncState`) into a small schema with
 * the same field types and the same map shape, and its encoded patches are counted: what those
 * fields add to the real patch (± the 1–2 bytes of map/ref switching). Events: the msgpack'd batch
 * with and without the money tuples. Patches and events go to every client: per-client rates.
 * The full real patch is encoded alongside for scale.
 */
const MoneyPlayer = schema({ wallet: st.uint32().default(0), earned: st.uint32().default(0) }, "MoneyPlayer");
const MoneyState = schema({ players: st.map(MoneyPlayer), buildTicksLeft: st.uint16().default(0) }, "MoneyState");

function newState(ids: readonly string[]): RunState {
  const s = new RunState({ phase: "build", hostSlot: 0 });
  ids.forEach((id, slot) => s.players.set(id, new PlayerState({ slot, name: id, ready: true })));
  return s;
}

describe("economy and build-timer bandwidth (Story 3.10, NFR4)", () => {
  it("wallets cost well under 0.5 KB/s per client in a 4-bot wave; buildTicksLeft ≈ 60 B/s in a build", () => {
    const ids = ["p0", "p1", "p2", "p3"];
    const c = new RunController({ balance, seed: 21, players: ids.map((playerId, slot) => ({ playerId, slot })) });
    const world = c.world;
    world.debug.godMode = true;
    const full = newState(ids);
    const fieldsState = new MoneyState();
    for (const id of ids) fieldsState.players.set(id, new MoneyPlayer());
    const encFull = new Encoder(full);
    const encMoney = new Encoder(fieldsState);
    const ctx: NetEventContext = { balance, zombieNetId: (id) => id | ((world.zombies.generation[id] ?? 0) << 8) };
    const cfg = botConfigOf(balance);
    const views = ids.map(() => createBotView());
    const input: PlayerInput = { ...NEUTRAL_INPUT };
    let seq = 0;
    const tick = (measure: "money" | "build"): { patch: number; fields: number; events: number; eventsNoMoney: number; money: number } => {
      seq++;
      ids.forEach((id, i) => {
        botViewFromWorld(world, id, views[i] as (typeof views)[number]);
        botInput(views[i] as (typeof views)[number], cfg, seq, input);
        c.queueInput(id, input);
      });
      const events = c.tick();
      syncState(full, c);
      if (measure === "money") {
        for (const id of ids) {
          const src = full.players.get(id);
          const dst = fieldsState.players.get(id);
          if (!src || !dst) continue;
          if (dst.wallet !== src.wallet) dst.wallet = src.wallet;
          if (dst.earned !== src.earned) dst.earned = src.earned;
        }
      } else if (fieldsState.buildTicksLeft !== full.buildTicksLeft) {
        fieldsState.buildTicksLeft = full.buildTicksLeft;
      }
      const tuples: NetEvent[] = [];
      let money = 0;
      for (const e of events) {
        const t = encodeNetEvent(e, ctx);
        if (!t) continue;
        tuples.push(t);
        if (t[0] === NET_EVENT_KIND.MONEY_EARNED) money++;
      }
      const noMoney = tuples.filter((t) => t[0] !== NET_EVENT_KIND.MONEY_EARNED);
      const patch = encFull.encode().length;
      encFull.discardChanges();
      const fields = encMoney.hasChanges ? encMoney.encode().length : 0;
      encMoney.discardChanges();
      const batch = (ts: NetEvent[]) => (ts.length === 0 ? 0 : pack({ tick: world.tick, events: ts }).length);
      return { patch, fields, events: batch(tuples), eventsNoMoney: batch(noMoney), money };
    };

    // 1. The first build phase, 30 s (no one Ready): the timer counts down every tick.
    let buildBytes = 0;
    let buildTicks = 0;
    tick("build"); // the first patch carries everything once
    const phase = (): string => world.run.phase; // read fresh (no narrowing across ticks)
    while (phase() === "build") {
      const t = tick("build");
      buildBytes += t.fields;
      buildTicks++;
    }
    const buildBps = buildBytes / (buildTicks * TICK_DT_S);

    // 2. Wave 3 (jumped to: waves 1–2 skipped) with 4 bots fighting, 40 s.
    world.waves.number = 2;
    while (phase() !== "build") tick("money");
    for (const id of ids) setBuildReady(world, id, true);
    while (phase() === "build") tick("money");
    expect(world.waves.number).toBe(3);
    let patchMoney = 0;
    let eventMoney = 0;
    let moneyEvents = 0;
    let fullBytes = 0;
    tick("money"); // the buildTicksLeft → 0 switch is not money
    const WAVE_TICKS = 40 / TICK_DT_S;
    for (let i = 0; i < WAVE_TICKS && phase() === "wave"; i++) {
      const t = tick("money");
      patchMoney += t.fields;
      eventMoney += t.events - t.eventsNoMoney;
      moneyEvents += t.money;
      fullBytes += t.patch + t.events;
    }
    const seconds = WAVE_TICKS * TICK_DT_S;
    const line =
      `[economy bandwidth] wave 3, 4 bots: ${moneyEvents} money.earned in ${seconds} s; wallet/earned patches ${(patchMoney / seconds).toFixed(0)} B/s, ` +
      `money events ${(eventMoney / seconds).toFixed(0)} B/s (of ${(fullBytes / seconds).toFixed(0)} B/s patches + events, horde stream not included); ` +
      `build phase: buildTicksLeft ${buildBps.toFixed(0)} B/s over ${buildTicks} ticks`;
    console.log(line);
    expect(moneyEvents).toBeGreaterThan(20); // the bots really fought and earned
    expect(patchMoney).toBeGreaterThan(0);
    expect(eventMoney).toBeGreaterThan(0);
    expect((patchMoney + eventMoney) / seconds).toBeLessThan(500);
    expect(buildTicks).toBe(599); // the 600th went with the first tick (every field sent once)
    expect(buildBps).toBeGreaterThan(0);
    expect(buildBps).toBeLessThan(100);
  }, 60_000);

  it("Story 5.1: weapon levels add ≈ 0 B/s (a few bytes per upgrade, nothing per tick) and one small event per upgrade", () => {
    const ids = ["p0", "p1", "p2", "p3"];
    const c = new RunController({ balance, seed: 21, players: ids.map((playerId, slot) => ({ playerId, slot })) });
    const world = c.world;
    world.debug.godMode = true;
    const LevelPlayer = schema({ level0: st.uint8().default(0), level1: st.uint8().default(0) }, "LevelPlayer");
    const LevelState = schema({ players: st.map(LevelPlayer) }, "LevelState");
    const full = newState(ids);
    const levels = new LevelState();
    for (const id of ids) levels.players.set(id, new LevelPlayer());
    const enc = new Encoder(levels);
    const ctx: NetEventContext = { balance, zombieNetId: (id) => id };
    const cfg = botConfigOf(balance);
    const views = ids.map(() => createBotView());
    const input: PlayerInput = { ...NEUTRAL_INPUT };
    let seq = 0;
    let upgradeEventBytes = 0;
    let upgradeEvents = 0;
    const tick = (): number => {
      seq++;
      ids.forEach((id, i) => {
        botViewFromWorld(world, id, views[i] as (typeof views)[number]);
        botInput(views[i] as (typeof views)[number], cfg, seq, input);
        c.queueInput(id, input);
      });
      for (const e of c.tick()) {
        const t = encodeNetEvent(e, ctx);
        if (t && t[0] === NET_EVENT_KIND.WEAPON_UPGRADED) {
          upgradeEvents++;
          upgradeEventBytes += pack(t).length;
        }
      }
      syncState(full, c);
      for (const id of ids) {
        const src = full.players.get(id);
        const dst = levels.players.get(id);
        if (!src || !dst) continue;
        if (dst.level0 !== src.level0) dst.level0 = src.level0;
        if (dst.level1 !== src.level1) dst.level1 = src.level1;
      }
      const bytes = enc.hasChanges ? enc.encode().length : 0;
      enc.discardChanges();
      return bytes;
    };
    tick(); // the first patch carries every field once
    // Each player upgrades the Pistol twice in the build phase, then everyone is Ready.
    for (const id of ids) {
      const p = world.players.get(id);
      if (p) p.wallet = 1000;
      expect(upgradeWeapon(world, id, "pistol").ok).toBe(true);
      expect(upgradeWeapon(world, id, "pistol").ok).toBe(true);
    }
    const upgradeTickBytes = tick();
    for (const id of ids) setBuildReady(world, id, true);
    let waveBytes = 0;
    let ticks = 0;
    const phase = (): string => world.run.phase;
    while (phase() === "build" && ticks < 100) tick();
    for (ticks = 0; ticks < 40 / TICK_DT_S && phase() === "wave"; ticks++) waveBytes += tick();
    const seconds = ticks * TICK_DT_S;
    console.log(
      `[upgrade bandwidth] 8 upgrades (4 players × 2): level0/level1 patch ${upgradeTickBytes} B once, ${upgradeEvents} weapon.upgraded events ${upgradeEventBytes} B (msgpack tuples); ` +
        `in the next ${seconds} s of wave: ${(waveBytes / seconds).toFixed(1)} B/s`,
    );
    expect(upgradeEvents).toBe(8); // liveness: the upgrades really happened and went on the wire
    expect(upgradeTickBytes).toBeGreaterThan(0);
    expect(upgradeTickBytes).toBeLessThan(40);
    expect(upgradeEventBytes / upgradeEvents).toBeLessThanOrEqual(8);
    expect(seconds).toBeGreaterThan(10);
    expect(waveBytes).toBe(0); // nothing per tick
  }, 60_000);
});
