import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { pack } from "msgpackr";
import {
  NEUTRAL_INPUT,
  addBuildingAt,
  BUILD_GRID_M,
  addPlayer,
  createWorld,
  encodeNetEvent,
  flowFieldMaxAgeTicks,
  flowRefreshTicks,
  loadBalance,
  rebuildFlowFieldNow,
  spawnZombie,
  TICK_DT_S,
  type NetEventContext,
  type BuildingRotation,
  startWave,
} from "@topdown/shared";
import { RunController } from "./RunController";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";

const balance = loadBalance();
const WALKERS = 150;
const WARMUP_TICKS = 100;
const MEASURED_TICKS = 600; // 30 s of game time
const WOOD = "wood_barricade";

/**
 * 24 barricades (4 players × the cap of 6), min corners in metres: the two left-edge spawn points
 * are each shut in a pen (a rot 1 wall of three and a cap above and below, touching corners), so the
 * zombies spawned there must break out; fourteen more make open walls the others route round.
 */
const LAYOUT_M: { x: number; y: number; rot: BuildingRotation }[] = [];
for (const top of [8, 18]) {
  for (let k = 0; k < 3; k++) LAYOUT_M.push({ x: 2, y: top + k * 2, rot: 1 }); // [2, 2.5] × [top, top + 6]
  LAYOUT_M.push({ x: 0, y: top - 0.5, rot: 0 }, { x: 0, y: top + 6, rot: 0 }); // caps [0, 2] above and below
}
for (const x of [7, 9, 11, 13]) LAYOUT_M.push({ x, y: 4.5, rot: 0 });
for (const x of [33, 35, 37, 39]) LAYOUT_M.push({ x, y: 27, rot: 0 });
for (const y of [6, 8, 10]) LAYOUT_M.push({ x: 34, y, rot: 1 });
for (const y of [20, 22, 24]) LAYOUT_M.push({ x: 14, y, rot: 1 });
const LAYOUT = LAYOUT_M.map((l) => ({ gx: l.x / BUILD_GRID_M, gy: l.y / BUILD_GRID_M, rot: l.rot }));

interface Result {
  p99: number;
  mean: number;
  max: number;
  patchBps: number;
  eventBps: number;
  destroyed: number;
  maxAge: number;
  turretShots: number;
}

/**
 * One full room tick minus the socket (controller.tick + syncState + event encoding + one patch
 * encode), as `tickCost.test.ts`, with or without 24 buildings and the flow field. Destroyed
 * barricades are put back the next tick, so there are always 24 (and the field keeps rebuilding).
 */
/**
 * Story 3.6: `turrets` swaps the four barricades of the y = 27 wall for four Auto-turrets at their
 * min corners (still 24 buildings), all firing in the wave, to measure the turrets' added tick cost
 * and bandwidth (turret.fired + their hits and kills; no schema field is added).
 */
const TURRET_ROW_Y = 27;
function measure(withBuildings: boolean, turrets = false): Result {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({
    balance,
    seed: 99,
    players,
    pauseWaves: true,
    ...(withBuildings ? {} : { systems: { buildings: () => {} } }),
  });
  const world = c.world;
  world.debug.godMode = true;
  const state = new RunState({ phase: "wave", hostSlot: 0 });
  for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
  const encoder = new Encoder(state);
  encoder.encode();
  encoder.discardChanges();
  const ctx: NetEventContext = { balance, zombieNetId: (id) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  let nextId = 1;
  const standing = new Map<string, boolean>();
  const topUpBuildings = (): void => {
    if (!withBuildings) return;
    standing.clear();
    for (const b of world.buildings.list) standing.set(`${b.gx},${b.gy}`, true);
    for (const l of LAYOUT) {
      if (standing.get(`${l.gx},${l.gy}`)) continue;
      const turret = turrets && l.gy === TURRET_ROW_Y / BUILD_GRID_M;
      addBuildingAt(world, { id: nextId++, type: turret ? "auto_turret" : WOOD, ownerId: `p${nextId % 4}`, gx: l.gx, gy: l.gy, rot: turret ? 0 : l.rot, hp: turret ? 300 : 200 });
    }
  };
  const points = world.map.spawnPoints;
  let spawnAt = 0;
  const topUp = (): void => {
    while (world.zombies.aliveCount < WALKERS) {
      const sp = points[spawnAt++ % points.length];
      if (!sp || spawnZombie(world, "walker", sp.x, sp.y, true) < 0) break;
    }
  };
  if (world.run.phase === "build") startWave(world); // turrets fire only in a wave
  topUpBuildings();
  topUp();
  let turretShots = 0;
  const times: number[] = [];
  let patchBytes = 0;
  let eventBytes = 0;
  let destroyed = 0;
  let maxAge = 0;
  for (let t = 1; t <= WARMUP_TICKS + MEASURED_TICKS; t++) {
    topUp();
    topUpBuildings();
    for (let i = 0; i < 4; i++) {
      const a = t * 0.05 + i * 1.6;
      c.queueInput(`p${i}`, { ...NEUTRAL_INPUT, seq: t, moveX: Math.cos(a) * 0.7, moveY: Math.sin(a) * 0.7, aimX: -Math.sin(a), aimY: Math.cos(a), fire: true });
    }
    const t0 = performance.now();
    const events = c.tick();
    syncState(state, c);
    const tuples = [];
    for (const e of events) {
      const tu = encodeNetEvent(e, ctx);
      if (tu) tuples.push(tu);
    }
    const patch = encoder.encode();
    encoder.discardChanges();
    const ms = performance.now() - t0;
    if (t > WARMUP_TICKS) {
      times.push(ms);
      patchBytes += patch.length;
      eventBytes += tuples.length > 0 ? pack({ tick: world.tick, events: tuples }).length : 0;
      for (const e of events) {
        if (e.type === "building.destroyed") destroyed++;
        else if (e.type === "turret.fired") turretShots++;
      }
      if (withBuildings) maxAge = Math.max(maxAge, world.tick - world.pathing.chase.sourceTick);
    }
  }
  times.sort((a, b) => a - b);
  const seconds = MEASURED_TICKS * TICK_DT_S;
  return {
    p99: times[Math.floor(times.length * 0.99)] ?? 0,
    mean: times.reduce((s, v) => s + v, 0) / times.length,
    max: times[times.length - 1] ?? 0,
    patchBps: patchBytes / seconds,
    eventBps: eventBytes / seconds,
    destroyed,
    maxAge,
    turretShots,
  };
}

describe("tick cost with the flow field (Story 3.5, brief line 10)", () => {
  it("a full 48 × 32 m rebuild fits the tick budget when amortized over P ticks", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    for (const [i, l] of LAYOUT.entries()) addBuildingAt(world, { id: i + 1, type: WOOD, ownerId: "p0", gx: l.gx, gy: l.gy, rot: l.rot, hp: 200 });
    for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 18 + i * 4, 16);
    const { nav, chase } = world.pathing;
    for (let i = 0; i < 20; i++) rebuildFlowFieldNow(chase, nav, world); // warm up
    const runs = 200;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) rebuildFlowFieldNow(chase, nav, world);
    const fullMs = (performance.now() - t0) / runs;
    const P = flowRefreshTicks(world);
    console.log(
      `[flow field] full rebuild ${nav.cols}×${nav.rows} (${nav.cells} cells, 24 buildings): ${fullMs.toFixed(3)} ms; ` +
        `budget ${balance.zombies.pathing.rebuildCellsPerTick} cells/tick → P = ${P} ticks, ${(fullMs / P).toFixed(3)} ms/tick amortized; max age ${flowFieldMaxAgeTicks(world)} ticks`,
    );
    expect(fullMs / P).toBeLessThan(2); // the added-cost budget
    expect(fullMs).toBeLessThan(10);
  });

  it("4 players + 150 Walkers + 24 buildings: added tick p99 ≤ 2 ms; added bandwidth reported", () => {
    // Each case twice, interleaved, keeping the lower p99 (a GC pause in one run is not the field's cost).
    const runs = [measure(false), measure(true), measure(false), measure(true)];
    const pick = (a: Result, b: Result): Result => (a.p99 <= b.p99 ? a : b);
    const base = pick(runs[0] as Result, runs[2] as Result);
    const field = pick(runs[1] as Result, runs[3] as Result);
    const added = field.p99 - base.p99;
    console.log(
      `[tick cost 3.5] baseline p99 ${base.p99.toFixed(3)} ms (mean ${base.mean.toFixed(3)}); with 24 buildings + field p99 ${field.p99.toFixed(3)} ms ` +
        `(mean ${field.mean.toFixed(3)}, max ${field.max.toFixed(3)}); added p99 ${added.toFixed(3)} ms; ` +
        `patches ${base.patchBps.toFixed(0)} → ${field.patchBps.toFixed(0)} B/s, events ${base.eventBps.toFixed(0)} → ${field.eventBps.toFixed(0)} B/s; ` +
        `${field.destroyed} buildings destroyed (re-added); field max age ${field.maxAge} ticks`,
    );
    expect(LAYOUT).toHaveLength(24);
    expect(field.destroyed).toBeGreaterThan(0); // the pens were broken (and re-added)
    expect(added).toBeLessThanOrEqual(2);
    expect(field.maxAge).toBeLessThanOrEqual(2 * Math.ceil(6144 / balance.zombies.pathing.rebuildCellsPerTick));
  });

  it("Story 3.6: 4 of the 24 buildings Auto-turrets (firing): the turrets add ≤ 2 ms to the tick p99 over 24 barricades", () => {
    const runs = [measure(false), measure(true, true), measure(false), measure(true, true), measure(true), measure(true)];
    const pick = (a: Result, b: Result): Result => (a.p99 <= b.p99 ? a : b);
    const base = pick(runs[0] as Result, runs[2] as Result);
    const tur = pick(runs[1] as Result, runs[3] as Result);
    const field = pick(runs[4] as Result, runs[5] as Result);
    const added = tur.p99 - base.p99;
    console.log(
      `[tick cost 3.6] baseline p99 ${base.p99.toFixed(3)} ms; 24 buildings (4 turrets) + field p99 ${tur.p99.toFixed(3)} ms (mean ${tur.mean.toFixed(3)}); ` +
        `added p99 ${added.toFixed(3)} ms (barricades only: ${(field.p99 - base.p99).toFixed(3)} ms); ` +
        `turret shots ${(tur.turretShots / (MEASURED_TICKS * TICK_DT_S)).toFixed(1)}/s; ` +
        `patches ${field.patchBps.toFixed(0)} → ${tur.patchBps.toFixed(0)} B/s, events ${field.eventBps.toFixed(0)} → ${tur.eventBps.toFixed(0)} B/s ` +
        `(barricades only → with 4 turrets)`,
    );
    expect(tur.turretShots).toBeGreaterThan(0);
    // The turrets' own cost (the field's is 3.5's test above; on a loaded 2-core box both p99s are noisy).
    expect(tur.p99 - field.p99).toBeLessThanOrEqual(2);
  });
});
