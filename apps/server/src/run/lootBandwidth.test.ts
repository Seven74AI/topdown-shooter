import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { pack } from "msgpackr";
import { DOWNTOWN_MAP, LOOT_BAG, encodeNetEvent, loadBalance, startWave, type NetEventContext, type SimEvent } from "@topdown/shared";
import { RunController } from "./RunController";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";

/**
 * Story 7.12 (AC 5, brief 8/11): what the loot bag adds per client — the three reliable events and the
 * room's `lootBag*` record, written on drop / pick-up / expiry only. ≤ 60 B per run, 0 B per tick
 * while it lies (the timer is never synced), and the plan never on the room state (B2).
 */
const balance = loadBalance();

function run(take: boolean): { recordBytes: number; eventBytes: number; changes: number; outTicks: number; state: RunState; seen: string[] } {
  const players = [0, 1].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 9, players, pauseWaves: true, map: DOWNTOWN_MAP, lootSalt: 0xdeadbeef, devLoot: [1, 0.5] });
  c.world.debug.godMode = true;
  if (c.world.run.phase === "build") startWave(c.world);
  const state = new RunState({ phase: "wave", hostSlot: 0 });
  for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
  const enc = new Encoder(state);
  syncState(state, c);
  enc.encode();
  enc.discardChanges();
  const ctx: NetEventContext = { balance, zombieNetId: (id) => id };
  let eventBytes = 0;
  let recordBytes = 0;
  let changes = 0;
  let outTicks = 0;
  const seen: string[] = [];
  const w = c.world;
  // the planned wave (1; `startWave` emitted its `wave.started`) and enough kills to reach its kill index, near the team
  const p0 = w.players.get("p0");
  if (!p0) throw new Error("no p0");
  const spot = { x: p0.x, y: p0.y - 5 };
  for (let k = 0; k < w.waves.size; k++) w.events.emit({ type: "zombie.killed", zombieId: k, killerId: "p0", x: spot.x, y: spot.y, weapon: "pistol" });
  for (let t = 0; t < 500; t++) {
    if (take && t === 100) {
      p0.x = w.loot.x; // walks onto it
      p0.y = w.loot.y;
    }
    const events = c.tick() as readonly SimEvent[];
    for (const e of events) {
      if (!e.type.startsWith("loot.")) continue;
      seen.push(e.type);
      const tu = encodeNetEvent(e, ctx);
      if (tu) eventBytes += pack([tu]).length;
    }
    if (w.loot.state === LOOT_BAG.OUT) outTicks++;
    const before = [state.lootBagState, state.lootBagX, state.lootBagY, state.lootBagUntilTick, state.lootBagVariant].join();
    syncState(state, c);
    enc.encode();
    enc.discardChanges();
    const after = [state.lootBagState, state.lootBagX, state.lootBagY, state.lootBagUntilTick, state.lootBagVariant].join();
    if (before !== after) changes++;
  }
  // the record's own patch bytes: the same field writes on a fresh state, encoded alone
  const solo = new RunState({ phase: "wave", hostSlot: 0 });
  const se = new Encoder(solo);
  se.encode();
  se.discardChanges();
  solo.lootBagState = LOOT_BAG.OUT;
  solo.lootBagX = state.lootBagX || spot.x;
  solo.lootBagY = state.lootBagY || spot.y;
  solo.lootBagUntilTick = w.loot.untilTick;
  solo.lootBagVariant = w.loot.variant;
  recordBytes += se.encode().length;
  se.discardChanges();
  solo.lootBagState = take ? LOOT_BAG.FOUND : LOOT_BAG.GONE;
  recordBytes += se.encode().length;
  return { recordBytes, eventBytes, changes, outTicks, state, seen };
}

describe("Story 7.12: loot bag bandwidth", () => {
  it("taken or expired: ≤ 60 B per run (events + record), the record written exactly twice, 0 B per tick while it lies", () => {
    for (const take of [true, false]) {
      const r = run(take);
      expect(r.seen).toEqual(take ? ["loot.dropped", "loot.found"] : ["loot.dropped", "loot.expired"]); // liveness
      expect(r.outTicks).toBe(take ? 100 : balance.loot.bagTicks);
      expect(r.changes).toBe(2); // drop + found / expiry: nothing per tick
      const total = r.recordBytes + r.eventBytes;
      console.log(`[loot bandwidth] ${take ? "taken" : "expired"}: events ${r.eventBytes} B + record ${r.recordBytes} B = ${total} B per run; 0 B/s while it lies`);
      expect(total).toBeLessThanOrEqual(60);
    }
  });

  it("B2: the room state carries no plan, no salt, no kill count — before the drop the record is all defaults", () => {
    const state = new RunState({ phase: "wave", hostSlot: 0 });
    const keys = Object.keys(state.toJSON());
    for (const k of keys) expect(k).not.toMatch(/salt|plan|killFrac|itemRoll|lootWave|killIndex/i);
    const c = new RunController({ balance, seed: 3, players: [{ playerId: "p0", slot: 0 }], pauseWaves: true, map: DOWNTOWN_MAP, lootSalt: 1234, devLoot: [5, 0.5] });
    syncState(state, c);
    expect([state.lootBagState, state.lootBagX, state.lootBagY, state.lootBagUntilTick, state.lootBagVariant]).toEqual([0, 0, 0, 0, 0]);
    expect(c.world.loot.plan.has).toBe(true); // the server knows…
    expect(c.world.loot.salt).toBe(1234); // …with its secret salt
  });
});
