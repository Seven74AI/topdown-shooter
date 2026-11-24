import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { pack } from "msgpackr";
import { loadavg } from "node:os";
import {
  PLACEHOLDER_MAP,
  BUILD_GRID_M,
  addBuildingAt,
  loadBalance,
  mineCounters,
  spawnZombie,
  startWave,
  trapCounters,
  updateMines,
  updateTraps,
  TICK_DT_S,
  type Building,
  type NetEventContext,
  BEAR_TRAP_STATE,
  bearTrapCounters,
  resetBearTrapCounters,
} from "@topdown/shared";
import { RunController } from "./RunController";
import { EventInterest } from "../net/eventInterest";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";

const balance = loadBalance();
const SECONDS = 30;
const TICKS = SECONDS / TICK_DT_S;
/** The story's worst-case estimate (24 busy traps ≈ 1.9 KB/s, mines' events on top): per client, patches + events. */
const ESTIMATE_BPS = 2 * 1024;

/**
 * Story 5.9 (AC 14, brief 11): the cap's floor buildings (4 players × 6: 12 spike traps + 12 mines on
 * a 6 × 4 grid) through a crowded wave. Every trap has 3 Walkers standing on it (none can die: the
 * worst case for the trap HP patches, ~6 hits/s per trap); every 2.5 s a Walker appears next to the
 * next mine and sets it off. Per client: `sim.events_flushed` bytes after the interest filter (the
 * client's view in its quarter) + the shared patch. The players stand still; zombies don't walk.
 */
function measure(withBuildings: boolean) {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 9, players, pauseWaves: true, systems: { zombies: () => {}, player: () => {} }, map: PLACEHOLDER_MAP });
  const world = c.world;
  world.debug.godMode = true; // blasts near a player cost no HP patches the floor didn't cause
  const views = [
    [12, 8],
    [36, 8],
    [12, 24],
    [36, 24],
  ] as const;
  views.forEach(([x, y], i) => {
    const p = world.players.get(`p${i}`);
    if (p) {
      p.x = x;
      p.y = y;
    }
  });
  startWave(world);
  const state = new RunState({ phase: "wave", hostSlot: 0 });
  for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
  const encoder = new Encoder(state);
  const mines: [number, number][] = [];
  let id = 1;
  let first: Building | null = null;
  for (const y of [3, 11, 19, 27]) {
    for (const x of [4, 12, 20, 28, 36, 44]) {
      const trap = id % 2 === 1;
      const type = trap ? "spike_trap" : "mine";
      if (withBuildings) {
        const b = addBuildingAt(world, { id, type, ownerId: `p${id % 4}`, gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: balance.buildings.types[type]?.hp ?? 1 }) as Building;
        if (trap) {
          first ??= b;
          for (let k = 0; k < 3; k++) world.zombies.hp[spawnZombie(world, "walker", x + 0.4 + k * 0.6, y + 1)] = 1e9;
        }
      }
      if (!trap) mines.push([x + 0.25, y + 0.25]);
      id++;
    }
  }
  if (first) first.hp = 20; // liveness: one trap wears out inside the run
  c.tick();
  syncState(state, c);
  encoder.encode();
  encoder.discardChanges();
  trapCounters.pulses = trapCounters.kills = trapCounters.wornOut = 0;
  mineCounters.exploded = 0;
  const ctx: NetEventContext = { balance, zombieNetId: (zid) => zid | ((world.zombies.generation[zid] ?? 0) << 8) };
  const interest = new EventInterest();
  const perClient = [0, 0, 0, 0];
  let patch = 0;
  let nextMine = 0;
  for (let t = 0; t < TICKS; t++) {
    if (t % 50 === 25 && nextMine < mines.length) {
      const [mx, my] = mines[nextMine++] as [number, number];
      spawnZombie(world, "walker", mx + 1, my); // touches the 1 m trigger circle: blast next tick
    }
    const events = c.tick();
    syncState(state, c);
    patch += encoder.encode().length;
    encoder.discardChanges();
    interest.prepare(world, events, ctx);
    if (interest.all.length === 0) continue;
    for (let i = 0; i < 4; i++) {
      const [vx, vy] = views[i] as readonly [number, number];
      const mine = interest.eventsFor(world, vx, vy);
      if (mine.length > 0) perClient[i] = (perClient[i] as number) + pack({ tick: world.tick, events: mine }).length;
    }
  }
  const patchBps = patch / SECONDS;
  return { perClientBps: perClient.map((b) => b / SECONDS + patchBps), patchBps, pulses: trapCounters.pulses, wornOut: trapCounters.wornOut, exploded: mineCounters.exploded };
}

describe("Floor building bandwidth (Story 5.9, AC 14)", () => {
  it("24 traps and mines through a crowded wave: added B/s per client ≤ the estimate × 1.5; liveness: blasts, pulses, a worn-out trap", () => {
    const base = measure(false);
    const busy = measure(true);
    const added = busy.perClientBps.map((v, i) => v - (base.perClientBps[i] as number));
    const f = (v: number) => v.toFixed(0);
    console.log(
      `[floor bandwidth] 12 traps × 3 Walkers, 12 mines: ${busy.pulses} trap pulses, ${busy.wornOut} worn out, ${busy.exploded} mines exploded in ${SECONDS} s; ` +
        `patches ${f(base.patchBps)} → ${f(busy.patchBps)} B/s; per client added ${added.map(f).join(" / ")} B/s (estimate ${ESTIMATE_BPS} B/s)`,
    );
    expect(busy.exploded).toBeGreaterThanOrEqual(1);
    expect(busy.pulses).toBeGreaterThanOrEqual(100);
    expect(busy.wornOut).toBeGreaterThanOrEqual(1);
    for (const v of added) expect(v).toBeLessThanOrEqual(ESTIMATE_BPS * 1.5);
  });

  it("the trap and mine passes: 24 floor buildings, 150 Walkers, < 0.3 ms a tick", () => {
    const c = new RunController({ balance, seed: 6, players: [{ playerId: "p0", slot: 0 }], pauseWaves: true, map: PLACEHOLDER_MAP });
    const world = c.world;
    startWave(world);
    for (let i = 0; i < 24; i++) {
      const type = i % 2 === 0 ? "spike_trap" : "mine";
      addBuildingAt(world, { id: i + 1, type, ownerId: "p0", gx: 4 + (i % 6) * 14, gy: 4 + Math.floor(i / 6) * 14, rot: 0, hp: balance.buildings.types[type]?.hp ?? 1 });
    }
    for (let i = 0; i < 150; i++) world.zombies.hp[spawnZombie(world, "walker", 2.4 + (i % 15) * 3, 3.4 + Math.floor(i / 15) * 3)] = 1e9;
    const runs = 400;
    world.run.phase = "build"; // mines armed but quiet: the trigger scan runs only in waves, so time it in a wave without blasts
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      updateTraps(world);
      world.run.phase = "wave";
      updateMines(world);
      world.run.phase = "build";
      world.events.flush();
    }
    const ms = (performance.now() - t0) / runs;
    console.log(`[floor pass] 12 traps + 12 mines, 150 zombies: ${ms.toFixed(4)} ms per tick (load ${loadavg()[0]?.toFixed(2)})`);
    expect(world.buildings.list.length).toBeGreaterThan(0);
    if (process.env.PERF_ASSERT === "1") expect(ms).toBeLessThan(0.3);
  });
});

/**
 * Story 5.14 (AC 17, brief 11): the cap's worth of bear traps (24, a 6 × 4 grid) each with a Walker
 * on its plate, cycling as fast as the rules allow: caught → held 3 s → released (worn) → re-armed
 * at once (the stand-on re-arm, stood in for) → caught again. Per client: the local snap events in
 * its view + the shared patch (the `trap` field and HP on change). Worst-case estimate: per trap and
 * cycle ≈ one 6 B event + three 1-field patches + one HP patch ≈ 30 B, 24 traps / 3 s ≈ 240 B/s.
 */
const BEAR_ESTIMATE_BPS = 300;
function measureBear(withTraps: boolean) {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 9, players, pauseWaves: true, systems: { player: () => {} }, map: PLACEHOLDER_MAP });
  const world = c.world;
  world.debug.godMode = true;
  const views = [
    [12, 8],
    [36, 8],
    [12, 24],
    [36, 24],
  ] as const;
  views.forEach(([x, y], i) => {
    const p = world.players.get(`p${i}`);
    if (p) {
      p.x = x;
      p.y = y;
    }
  });
  startWave(world);
  const state = new RunState({ phase: "wave", hostSlot: 0 });
  for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
  const encoder = new Encoder(state);
  const traps: Building[] = [];
  let id = 1;
  for (const y of [3, 11, 19, 27]) {
    for (const x of [4, 12, 20, 28, 36, 44]) {
      if (withTraps) {
        const b = addBuildingAt(world, { id, type: "bear_trap", ownerId: `p${id % 4}`, gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: 60000 }) as Building;
        traps.push(b);
      }
      world.zombies.hp[spawnZombie(world, "walker", x + 0.5, y + 0.5)] = 1e9; // the same crowd either way
      id++;
    }
  }
  c.tick();
  syncState(state, c);
  encoder.encode();
  encoder.discardChanges();
  resetBearTrapCounters();
  const ctx: NetEventContext = { balance, zombieNetId: (zid) => zid | ((world.zombies.generation[zid] ?? 0) << 8) };
  const interest = new EventInterest();
  const perClient = [0, 0, 0, 0];
  let patch = 0;
  for (let t = 0; t < TICKS; t++) {
    for (const b of traps) {
      if (b.trapState === BEAR_TRAP_STATE.SPRUNG) {
        b.trapState = BEAR_TRAP_STATE.ARMED; // the stand-on re-arm, at once
        world.buildings.version++;
      }
    }
    // The held Walkers walk back onto their plate after each release (they chase the players otherwise).
    for (let i = 0; i < traps.length; i++) {
      const b = traps[i] as Building;
      if (b.trapState !== BEAR_TRAP_STATE.ARMED) continue;
      const z = world.zombies.aliveIds[i] as number;
      world.zombies.x[z] = (b.minX + b.maxX) / 2;
      world.zombies.y[z] = (b.minY + b.maxY) / 2;
    }
    const events = c.tick();
    syncState(state, c);
    patch += encoder.encode().length;
    encoder.discardChanges();
    interest.prepare(world, events, ctx);
    if (interest.all.length === 0) continue;
    for (let i = 0; i < 4; i++) {
      const [vx, vy] = views[i] as readonly [number, number];
      const mine = interest.eventsFor(world, vx, vy);
      if (mine.length > 0) perClient[i] = (perClient[i] as number) + pack({ tick: world.tick, events: mine }).length;
    }
  }
  const patchBps = patch / SECONDS;
  return { perClientBps: perClient.map((b) => b / SECONDS + patchBps), patchBps, catches: bearTrapCounters.catches, releases: bearTrapCounters.releases };
}

describe("Bear trap bandwidth (Story 5.14, AC 17)", () => {
  it("24 bear traps catching, releasing and re-arming non-stop: added B/s per client ≤ the estimate × 1.5; liveness: catches and releases", () => {
    const base = measureBear(false);
    const busy = measureBear(true);
    const added = busy.perClientBps.map((v, i) => v - (base.perClientBps[i] as number));
    const f = (v: number) => v.toFixed(0);
    console.log(
      `[bear trap bandwidth] 24 traps: ${busy.catches} catches, ${busy.releases} releases in ${SECONDS} s; patches ${f(base.patchBps)} → ${f(busy.patchBps)} B/s; ` +
        `per client added ${added.map(f).join(" / ")} B/s (estimate ${BEAR_ESTIMATE_BPS} B/s)`,
    );
    expect(busy.catches).toBeGreaterThanOrEqual(24 * 5);
    expect(busy.releases).toBeGreaterThanOrEqual(24 * 4);
    for (const v of added) expect(v).toBeLessThanOrEqual(BEAR_ESTIMATE_BPS * 1.5);
  });
});
