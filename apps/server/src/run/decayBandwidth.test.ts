import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { pack } from "msgpackr";
import { NET_EVENT_KIND, encodeNetEvent, loadBalance, skipWave, startWave, type NetEventContext } from "@topdown/shared";
import { RunController } from "./RunController";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";

const balance = loadBalance();

/**
 * Story 4.5 (brief line 14): what a decay stage change costs on the wire. 4 players, each owning a
 * barricade on a cell the stage blocks (worst case: every one is destroyed; Story 12.4: no refund), then a
 * real build start into stage 2. Decay goes out on change only: the stage field in the patch and the
 * events of that one tick (`decay.stage_changed`, `building.destroyed`; refunds until 12.4). A 5-wave run
 * has 2 such ticks.
 */
describe("Story 4.5 decay bandwidth", () => {
  it("a stage change costs a few dozen bytes once; idle ticks after it cost nothing extra", () => {
    const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
    const c = new RunController({ balance, seed: 5, players, pauseWaves: true, decayStageByWave: [1, 2] });
    const world = c.world;
    world.debug.godMode = true;
    for (const p of world.players.values()) p.wallet = 1000;
    const state = new RunState({ phase: "build", hostSlot: 0 });
    for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
    const encoder = new Encoder(state);
    // One barricade per player over the dumpster's rows / the cells next to them (all legal at stage 1).
    const spots = [
      [76, 52, 0],
      [76, 53, 0],
      [76, 54, 0],
      [77, 52, 1],
    ] as const;
    spots.forEach(([gx, gy, rot], i) => c.placeBuilding(`p${i}`, { type: "wood_barricade", gx, gy, rot }));
    const placed = world.buildings.list.length;
    c.tick();
    syncState(state, c);
    encoder.encode();
    encoder.discardChanges();
    const ctx: NetEventContext = { balance, zombieNetId: (id) => id };
    startWave(world);
    skipWave(world); // wave 1 ends → the build start before wave 2: stage 2
    const events = c.tick();
    syncState(state, c);
    const patch = encoder.encode().length;
    encoder.discardChanges();
    const all = events.map((e) => encodeNetEvent(e, ctx)).filter((t): t is number[] => t !== null);
    const decayKinds = new Set<number>([NET_EVENT_KIND.DECAY_STAGE_CHANGED, NET_EVENT_KIND.BUILDING_DESTROYED]);
    const decayTuples = all.filter((t) => decayKinds.has(t[0] as number) || (t[0] === NET_EVENT_KIND.MONEY_EARNED && t[3] === 4));
    const decayEventBytes = decayTuples.reduce((n, t) => n + pack(t).length, 0);
    c.tick();
    syncState(state, c);
    const idle = encoder.encode().length;
    encoder.discardChanges();
    // Liveness: the stage really changed and every barricade on blocked cells went (Story 12.4: no refund events).
    expect(world.decay.stage).toBe(2);
    expect(state.decayStage).toBe(2);
    const destroyed = decayTuples.filter((t) => t[0] === NET_EVENT_KIND.BUILDING_DESTROYED).length;
    expect(destroyed).toBeGreaterThan(0);
    expect(decayTuples.filter((t) => t[0] === NET_EVENT_KIND.MONEY_EARNED).length).toBe(0);
    expect(decayTuples.filter((t) => t[0] === NET_EVENT_KIND.DECAY_STAGE_CHANGED)).toEqual([[NET_EVENT_KIND.DECAY_STAGE_CHANGED, 2, 1]]);
    expect(decayEventBytes).toBeLessThan(200);
    expect(idle).toBeLessThan(12);
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
      `[bandwidth] decay change tick: ${decayEventBytes} B of decay events (stage event ${pack([NET_EVENT_KIND.DECAY_STAGE_CHANGED, 2, 1]).length} B, ${destroyed}/${placed} barricades destroyed, no refunds since 12.4), whole patch ${patch} B (stage field +2 B; rest = phase/wave/wallets/removed buildings), next idle patch ${idle} B; 2 changes per 5-wave run ≈ 0 B/s`,
    );
  });

  it("Story 4.8: fires cost nothing while nobody burns; a player standing in fire costs its damage events + HP field (2 per second); the expiry costs one field once", () => {
    const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
    const c = new RunController({ balance, seed: 5, players, pauseWaves: true, decayStageByWave: [3, 3, 3, 3, 3] });
    const world = c.world;
    world.waves.paused = false; // review L6: fire respects the dev pause; build phase, so no wave starts in these ticks
    expect(world.decay.fires).toHaveLength(2); // the first build start entered stage 3
    const state = new RunState({ phase: "build", hostSlot: 0 });
    for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
    const encoder = new Encoder(state);
    const ctx: NetEventContext = { balance, zombieNetId: (id) => id };
    const measure = (ticks: number) => {
      let patch = 0;
      let events = 0;
      let fireEvents = 0;
      for (let t = 0; t < ticks; t++) {
        const evs = c.tick();
        syncState(state, c);
        patch += encoder.encode().length;
        encoder.discardChanges();
        for (const e of evs) {
          const tuple = encodeNetEvent(e, ctx);
          if (!tuple) continue;
          events += pack(tuple).length;
          if (e.type === "player.damaged" && e.sourceZombieId < 0) fireEvents++;
        }
      }
      return { patch, events, fireEvents };
    };
    c.tick();
    syncState(state, c);
    encoder.encode();
    encoder.discardChanges();
    const idle = measure(20); // 1 s, fires burning, nobody inside
    const f = world.decay.fires[0];
    const p0 = world.players.get("p0");
    if (!f || !p0) throw new Error("setup");
    // Inside the zone, beside the car (the first of 16 directions clear of every box).
    const d = f.radiusM + p0.radiusM - 0.2;
    let spot: [number, number] | null = null;
    for (let k = 0; k < 16 && !spot; k++) {
      const x = f.x + Math.cos((k * Math.PI) / 8) * d;
      const y = f.y + Math.sin((k * Math.PI) / 8) * d;
      const clear = world.obstacles.solids.every((b) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minY - y, 0, y - b.maxY)) > p0.radiusM + 0.05);
      if (clear) spot = [x, y];
    }
    if (!spot) throw new Error("no spot beside the car");
    p0.x = p0.prevX = spot[0];
    p0.y = p0.prevY = spot[1];
    measure(1); // the move itself
    const burning = measure(20); // 1 s standing in fire
    // Expiry: waves 1 and 2 → the build start before wave 3.
    for (let w = 0; w < 2; w++) {
      startWave(world);
      skipWave(world);
    }
    const before = state.decayFiresOut;
    const expiry = measure(1);
    expect(before).toBe(0);
    expect(state.decayFiresOut).not.toBe(0);
    expect(idle.fireEvents).toBe(0);
    expect(burning.fireEvents).toBe(2); // liveness: two pulses hit p0
    const perS = burning.patch + burning.events - (idle.patch + idle.events);
    expect(perS).toBeLessThan(60);
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
      `[bandwidth] fire: burning with nobody inside ${idle.patch + idle.events} B/s (= idle), one player standing in fire +${perS} B/s (${burning.fireEvents} damage events ${pack([NET_EVENT_KIND.PLAYER_DAMAGED, 0, 50, -1]).length} B each + HP field), expiry tick patch ${expiry.patch} B (decayFiresOut once per fire set)`,
    );
  });
});
