import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { pack } from "msgpackr";
import { DOWNTOWN_MAP, EVENT_KINDS, HORDE_HEADER_BYTES, HORDE_RECORD_BYTES, NET_EVENT_KIND, TICK_DT_S, ZOMBIE_STATE, loadBalance, spawnZombie, startWave, type NetEvent, type NetEventContext, type SimEvent } from "@topdown/shared";
import { RunController } from "./RunController";
import { EventInterest } from "../net/eventInterest";
import { HordeEncoder } from "../net/hordeEncoder";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";

/**
 * Story 6.8 (brief 11; network audit F8): what the special events add per client — the event
 * messages (`event.*`, ≤ 4 per event) and the room state's event record (on change only) — and the
 * worst horde frame of a stampede: 150 alive + its 30 over-cap Runners all in one view.
 *
 * Decision 6.8 B1 (designer: A): the 180-in-view worst case is 6 + 8 × 180 = 1,446 B × 20 Hz =
 * 28.2 KB/s, over the 24 KB/s horde budget (it breaks from 153 in view); accepted until Story 8.10's
 * half-size horde stream ("Story 8.10 owes this"), never hiding a zombie that can bite. The test
 * bounds the worst case at 28.5 KB/s and keeps 150 in view ≤ 24 KB/s.
 */
const balance = loadBalance();
const EVENT_NET = new Set<number>([NET_EVENT_KIND.EVENT_TRIGGERED, NET_EVENT_KIND.EVENT_PHASE_CHANGED, NET_EVENT_KIND.EVENT_ENDED, NET_EVENT_KIND.EVENT_SKIPPED]);

function controller(): RunController {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 5, players, pauseWaves: true, map: DOWNTOWN_MAP });
  c.world.debug.godMode = true;
  if (c.world.run.phase === "build") startWave(c.world);
  return c;
}

function start(c: RunController, kind: "car_alarm" | "stampede"): void {
  const w = c.world;
  w.special.scheduled = true;
  w.special.extra.kind = EVENT_KINDS.indexOf(kind);
  w.special.extra.wave = w.waves.number;
  w.special.extra.startFraction = 0;
  w.special.extraDone = false;
}

describe("Special events bandwidth (Story 6.8, brief 11)", () => {
  it("a car alarm and a stampede: events + state record ≤ 0.2 KB/s per client over their lives; both really ran", () => {
    const c = controller();
    const w = c.world;
    const state = new RunState({ phase: "wave", hostSlot: 0 });
    for (const p of ["p0", "p1", "p2", "p3"].map((id, slot) => ({ id, slot }))) state.players.set(p.id, new PlayerState({ slot: p.slot, name: p.id, ready: true }));
    const enc = new Encoder(state);
    syncState(state, c);
    enc.encode();
    enc.discardChanges();
    const ctx: NetEventContext = { balance, zombieNetId: (id) => id };
    const interest = new EventInterest();
    let eventBytes = 0;
    let recordBytes = 0;
    let ticks = 0;
    const seen = new Set<string>();
    for (const kind of ["car_alarm", "stampede"] as const) {
      start(c, kind);
      for (let t = 0; t < 40 * 20; t++) {
        const events = c.tick() as readonly SimEvent[];
        ticks++;
        for (const e of events) if (e.type.startsWith("event.")) seen.add(`${e.type}:${(e as { kind: string }).kind}`);
        interest.prepare(w, events, ctx);
        const mine: NetEvent[] = interest.eventsFor(w, 24, 16).filter((tu) => EVENT_NET.has(tu[0] as number));
        if (mine.length > 0) eventBytes += pack(mine).length;
        // the record's share: sync, encode, minus an encode of the same tick without event changes is
        // not separable here, so count every patch byte while the event fields change (an upper bound)
        const before = { k: state.eventKind, p: state.eventPhase, x: state.eventX };
        syncState(state, c);
        const bytes = enc.encode().length;
        enc.discardChanges();
        if (state.eventKind !== before.k || state.eventPhase !== before.p || state.eventX !== before.x) recordBytes += bytes;
        if (w.special.active.kind === -1 && t > 5) break;
      }
    }
    for (const k of ["event.triggered:car_alarm", "event.phase_changed:car_alarm", "event.ended:car_alarm", "event.triggered:stampede", "event.phase_changed:stampede", "event.ended:stampede"]) expect(seen.has(k), k).toBe(true);
    const seconds = ticks * TICK_DT_S;
    const bps = (eventBytes + recordBytes) / seconds;
    console.log(`[event bandwidth] events ${eventBytes} B + record patches ≤ ${recordBytes} B over ${seconds.toFixed(1)} s → ≤ ${bps.toFixed(0)} B/s`);
    expect(bps).toBeLessThan(200);
  }, 60_000);

  it("the stampede's worst horde frame: 150 + 30 Runners in one view = 6 + 8 × n bytes; ≤ 24 KB/s at 150 in view, 28.2 KB/s at 180 (Story 8.10 owes the rest: decision 6.8 B1)", () => {
    const c = controller();
    const w = c.world;
    const z = w.zombies;
    // 150 walkers round the centre (inside p0's view), then a stampede down the main street through them
    for (let i = 0; i < 150; i++) spawnZombie(w, "walker", 18 + (i % 15) * 0.8, 12.6 + Math.floor(i / 15) * 0.7, true);
    start(c, "stampede");
    const horde = new HordeEncoder();
    let worst = 0;
    let worstStampede = 0;
    for (let t = 0; t < 14 * 20; t++) {
      c.tick();
      for (let i = 0; i < z.aliveCount; i++) z.x[z.aliveIds[i]!] = Math.min(Math.max(z.x[z.aliveIds[i]!]!, 14), 34); // keep them all in view
      horde.prepare(w);
      const bytes = horde.encode(w, 24, 16).length;
      worst = Math.max(worst, bytes);
      let n = 0;
      for (let i = 0; i < z.aliveCount; i++) if (z.state[z.aliveIds[i]!] === ZOMBIE_STATE.STAMPEDE) n++;
      worstStampede = Math.max(worstStampede, n);
    }
    const at150 = (HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * 150) * 20;
    console.log(`[stampede horde] worst frame ${worst} B (${((worst * 20) / 1024).toFixed(1)} KB/s; ${worstStampede} Runners), 150 in view = ${(at150 / 1024).toFixed(1)} KB/s`);
    expect(worstStampede).toBeGreaterThan(0); // liveness: the Runners really ran
    expect(at150).toBeLessThanOrEqual(24 * 1024);
    expect(worst).toBeLessThanOrEqual(HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * (balance.waves.maxAlive + balance.events.stampede.overCap));
    expect(worst * 20).toBeLessThanOrEqual(28.5 * 1024);
  }, 60_000);
});
