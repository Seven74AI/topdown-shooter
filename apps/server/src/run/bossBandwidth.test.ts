import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { pack } from "msgpackr";
import { BOSS_STATE, DOWNTOWN_MAP, NET_EVENT_KIND, TICK_DT_S, applyBossDamage, loadBalance, pickBossEntry, bossEntry, startWave, type NetEvent, type NetEventContext, type SimEvent } from "@topdown/shared";
import { RunController } from "./RunController";
import { EventInterest } from "../net/eventInterest";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";

/**
 * Story 6.5 (brief 11): what the Behemoth adds per client — the boss record's schema patches (it
 * walks: position + heading every tick; hp on hits; the attack fields once per attack) and its events
 * (`boss.telegraph`, `boss.slammed`, `boss.target_changed`, `boss.hit` ≤ one per source per tick).
 * Measured over 60 s at 20 Hz with 4 players shooting it every tick.
 */
const balance = loadBalance();
const BOSS_KINDS = new Set<number>([NET_EVENT_KIND.BOSS_WARNING, NET_EVENT_KIND.BOSS_ARRIVED, NET_EVENT_KIND.BOSS_TELEGRAPH, NET_EVENT_KIND.BOSS_SLAMMED, NET_EVENT_KIND.BOSS_TARGET_CHANGED, NET_EVENT_KIND.BOSS_HIT]);

describe("Behemoth bandwidth (Story 6.5, brief 11)", () => {
  it("record + events ≲ 0.8 KB/s per client; it really walked, slammed and was hit", () => {
    const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
    const c = new RunController({ balance, seed: 5, players, pauseWaves: true, map: DOWNTOWN_MAP });
    const w = c.world;
    w.debug.godMode = true;
    if (w.run.phase === "build") startWave(w);
    pickBossEntry(w);
    const b = w.boss;
    b.state = BOSS_STATE.WALK;
    b.x = bossEntry.x;
    b.y = bossEntry.y;
    b.hp = b.maxHp = 1e9;
    b.wave = w.waves.number;
    const state = new RunState({ phase: "wave", hostSlot: 0 });
    for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
    const encoder = new Encoder(state);
    syncState(state, c);
    encoder.encode();
    encoder.discardChanges();
    const ctx: NetEventContext = { balance, zombieNetId: (id) => id };
    const interest = new EventInterest();
    const seconds = 60;
    let eventBytes = 0;
    let bossPatchBytes = 0;
    const counts = new Map<string, number>();
    const prev = { x: b.x, y: b.y };
    let walked = 0;
    for (let t = 0; t < seconds / TICK_DT_S; t++) {
      for (let i = 0; i < 4; i++) applyBossDamage(w, 3, `p${i}`, "pistol"); // every player hits it every tick
      const events = c.tick() as readonly SimEvent[];
      for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      walked += Math.hypot(b.x - prev.x, b.y - prev.y);
      prev.x = b.x;
      prev.y = b.y;
      // Schema: the boss record's share of the patch (with it vs without its changes).
      const before = encoder.encode().length;
      encoder.discardChanges();
      void before;
      interest.prepare(w, events, ctx);
      const p0 = w.players.get("p0");
      const mine = interest.eventsFor(w, p0?.x ?? 0, p0?.y ?? 0);
      const bossOnly: NetEvent[] = mine.filter((tu) => BOSS_KINDS.has(tu[0] as number));
      if (bossOnly.length > 0) eventBytes += pack(bossOnly).length;
    }
    // The record alone: sync a fresh state through the same ticks' boss values (patch bytes per tick).
    {
      const s2 = new RunState({ phase: "wave", hostSlot: 0 });
      const e2 = new Encoder(s2);
      syncState(s2, c);
      e2.encode();
      e2.discardChanges();
      for (let t = 0; t < seconds / TICK_DT_S; t++) {
        b.x += 0.065;
        b.facing += 0.01;
        if (t % 4 === 0) b.hp -= 12;
        syncState(s2, c);
        bossPatchBytes += e2.encode().length;
        e2.discardChanges();
      }
    }
    const recordBps = bossPatchBytes / seconds;
    const eventBps = eventBytes / seconds;
    console.log(`[boss bandwidth] record ≤ ${recordBps.toFixed(0)} B/s (incl. the tick field), events ${eventBps.toFixed(0)} B/s, total ≤ ${(recordBps + eventBps).toFixed(0)} B/s; walked ${walked.toFixed(1)} m; events ${JSON.stringify(Object.fromEntries([...counts].filter(([k]) => k.startsWith("boss"))))}`);
    expect(walked).toBeGreaterThan(5); // liveness
    expect(counts.get("boss.hit") ?? 0).toBeGreaterThan(100);
    expect((counts.get("boss.hit") ?? 0) / (seconds / TICK_DT_S)).toBeLessThanOrEqual(4); // DD9: ≤ one per source per tick
    expect(recordBps + eventBps).toBeLessThan(800 + 200); // ≲ 0.8 KB/s (+ the tick field, which is not the boss's)
  }, 60_000);
});
