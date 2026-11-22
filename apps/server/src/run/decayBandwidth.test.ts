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
 * barricade on a cell the stage blocks (worst case: every one is destroyed and refunded), then a
 * real build start into stage 2. Decay goes out on change only: the stage field in the patch and the
 * events of that one tick (`decay.stage_changed`, `building.destroyed`, the refunds). A 5-wave run
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
    // Liveness: the stage really changed and every barricade on blocked cells went, with its refund.
    expect(world.decay.stage).toBe(2);
    expect(state.decayStage).toBe(2);
    const destroyed = decayTuples.filter((t) => t[0] === NET_EVENT_KIND.BUILDING_DESTROYED).length;
    expect(destroyed).toBeGreaterThan(0);
    expect(decayTuples.filter((t) => t[0] === NET_EVENT_KIND.MONEY_EARNED).length).toBe(destroyed);
    expect(decayTuples.filter((t) => t[0] === NET_EVENT_KIND.DECAY_STAGE_CHANGED)).toEqual([[NET_EVENT_KIND.DECAY_STAGE_CHANGED, 2, 1]]);
    expect(decayEventBytes).toBeLessThan(200);
    expect(idle).toBeLessThan(12);
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
      `[bandwidth] decay change tick: ${decayEventBytes} B of decay events (stage event ${pack([NET_EVENT_KIND.DECAY_STAGE_CHANGED, 2, 1]).length} B, ${destroyed}/${placed} barricades destroyed + refunds), whole patch ${patch} B (stage field +2 B; rest = phase/wave/wallets/removed buildings), next idle patch ${idle} B; 2 changes per 5-wave run ≈ 0 B/s`,
    );
  });
});
