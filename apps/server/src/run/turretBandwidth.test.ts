import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { pack } from "msgpackr";
import {
  BUILD_GRID_M,
  NET_EVENT_KIND,
  addBuildingAt,
  buildingCentreX,
  buildingCentreY,
  encodeNetEvent,
  loadBalance,
  spawnZombie,
  startWave,
  TICK_DT_S,
  updateTurrets,
  type Building,
  type NetEventContext,
} from "@topdown/shared";
import { RunController } from "./RunController";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";

const balance = loadBalance();
const SECONDS = 30;
const TICKS = SECONDS / TICK_DT_S;

interface Bw {
  eventBps: number;
  patchBps: number;
  turretBps: number;
  shots: number;
  kills: number;
}

/**
 * Story 3.6 (brief line 11): 4 players idle, 4 Auto-turrets (one per player) each with a Walker
 * standing 4 m away (a new one as soon as it dies), so all four fire 5/s for 30 s. Every event and
 * patch byte here is caused by the turrets (the players don't move or shoot): turret.fired, the
 * hits, the kills, the owner's money.earned, and the wallet in the patch.
 */
function measure(turrets: boolean): Bw {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 5, players, pauseWaves: true, systems: { zombies: () => {} } });
  const world = c.world;
  world.debug.godMode = true;
  startWave(world);
  const state = new RunState({ phase: "wave", hostSlot: 0 });
  for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
  const encoder = new Encoder(state);
  syncState(state, c);
  encoder.encode();
  encoder.discardChanges();
  const ctx: NetEventContext = { balance, zombieNetId: (id) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  const spots = [
    [10, 6],
    [30, 6],
    [10, 24],
    [30, 24],
  ] as const;
  const targets: number[] = [];
  const centres: [number, number][] = [];
  spots.forEach(([x, y], i) => {
    const b = turrets
      ? (addBuildingAt(world, { id: i + 1, type: "auto_turret", ownerId: `p${i}`, gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: 300 }) as Building)
      : null;
    centres.push(b ? [buildingCentreX(b) + 4, buildingCentreY(b)] : [x + 4.5, y + 0.5]);
    targets.push(-1);
  });
  // Buildings go into the schema once (placement) before measuring.
  c.tick();
  syncState(state, c);
  encoder.encode();
  encoder.discardChanges();
  let eventBytes = 0;
  let patchBytes = 0;
  let turretBytes = 0;
  let shots = 0;
  let kills = 0;
  for (let t = 0; t < TICKS; t++) {
    for (let i = 0; i < 4; i++) {
      const id = targets[i] as number;
      if (id < 0 || (world.zombies.alivePos[id] as number) < 0) {
        const [zx, zy] = centres[i] as [number, number];
        targets[i] = spawnZombie(world, "walker", zx, zy);
      }
    }
    const events = c.tick();
    syncState(state, c);
    const tuples = [];
    for (const e of events) {
      const tu = encodeNetEvent(e, ctx);
      if (!tu) continue;
      tuples.push(tu);
      if (tu[0] === NET_EVENT_KIND.TURRET_FIRED) {
        shots++;
        turretBytes += pack(tu).length;
      } else if (tu[0] === NET_EVENT_KIND.ZOMBIE_KILLED) kills++;
    }
    patchBytes += encoder.encode().length;
    encoder.discardChanges();
    eventBytes += tuples.length > 0 ? pack({ tick: world.tick, events: tuples }).length : 0;
  }
  return { eventBps: eventBytes / SECONDS, patchBps: patchBytes / SECONDS, turretBps: turretBytes / SECONDS, shots, kills };
}

describe("Auto-turret bandwidth (Story 3.6, brief line 11)", () => {
  it("4 turrets firing: added events and patches per second; turret aim is never in the patch", () => {
    const none = measure(false);
    const four = measure(true);
    console.log(
      `[turret bandwidth] 4 turrets × ${(four.shots / SECONDS).toFixed(1)} shots/s total, ${(four.kills / SECONDS).toFixed(2)} kills/s: ` +
        `turret.fired ${four.turretBps.toFixed(0)} B/s; all events ${none.eventBps.toFixed(0)} → ${four.eventBps.toFixed(0)} B/s ` +
        `(+${(four.eventBps - none.eventBps).toFixed(0)}); patches ${none.patchBps.toFixed(0)} → ${four.patchBps.toFixed(0)} B/s ` +
        `(+${(four.patchBps - none.patchBps).toFixed(0)}, the owners' wallets on kills + tick)`,
    );
    expect(four.shots).toBe(4 * 5 * SECONDS);
    expect(four.turretBps / (four.shots / SECONDS)).toBeLessThanOrEqual(5); // ≤ 5 B per shot
    // No per-tick turret state: the patch only grows by the wallets of kills (wallet + earned, ~13 B per kill).
    expect(four.patchBps - none.patchBps).toBeLessThan((four.kills / SECONDS) * 16);
  });

  it("the turret pass itself: 24 turrets, 150 Walkers in range, < 0.5 ms a tick", () => {
    const c = new RunController({ balance, seed: 6, players: [{ playerId: "p0", slot: 0 }], pauseWaves: true });
    const world = c.world;
    startWave(world);
    for (let i = 0; i < 24; i++) addBuildingAt(world, { id: i + 1, type: "auto_turret", ownerId: "p0", gx: 20 + (i % 6) * 6, gy: 20 + Math.floor(i / 6) * 6, rot: 0, hp: 300 });
    for (let i = 0; i < 150; i++) world.zombies.hp[spawnZombie(world, "walker", 8 + (i % 15) * 2.2, 8 + Math.floor(i / 15) * 1.6)] = 1e9;
    c.tick(); // builds the grid
    const runs = 400;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      for (const b of world.buildings.list) b.fireCooldownS = 0; // every turret fires every call
      updateTurrets(world, TICK_DT_S);
      world.events.flush();
      while (world.projectiles.aliveCount > 0) world.projectiles.alivePos[world.projectiles.aliveIds[--world.projectiles.aliveCount] as number] = -1;
      world.projectiles.freeCount = world.projectiles.capacity;
    }
    const ms = (performance.now() - t0) / runs;
    console.log(`[turret pass] 24 turrets firing, 150 zombies: ${ms.toFixed(4)} ms per tick`);
    expect(ms).toBeLessThan(0.5);
  });
});
