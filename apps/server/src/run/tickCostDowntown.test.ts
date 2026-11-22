import { describe, expect, it } from "vitest";
import {
  DOWNTOWN_MAP,
  NEUTRAL_INPUT,
  PLACEHOLDER_MAP,
  TICK_DT_S,
  applyDecayStage,
  createRng,
  createWorld,
  loadBalance,
  rebuildFlowFieldNow,
  shotBlockT,
  skipWave,
  spawnZombie,
  startWave,
  type DistrictMap,
} from "@topdown/shared";
import { RunController } from "./RunController";

/**
 * Story 4.1 (brief line 15): what the Downtown map adds to the server tick. The same run (4 players
 * circling at the intersection, 150 Walkers kept topped up from the map's spawn points, god mode, no
 * wave director) on the open street and on Downtown, whose 10 collision boxes join every push-out,
 * every zombie's line-of-sight test and the nav grid (zombies route round them by the flow field).
 * The map is static data: it adds no bandwidth (0 B/s; nothing is synced).
 * Timing asserts only with `PERF_ASSERT=1` (record `uptime` with the numbers).
 */
const balance = loadBalance();
const WALKERS = 150;
const WARMUP_TICKS = 100;
const MEASURED_TICKS = 600;
const PERF_ASSERT = process.env.PERF_ASSERT === "1";

function measure(map: DistrictMap, stage = 1) {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 99, players, pauseWaves: true, map });
  const world = c.world;
  world.debug.godMode = true;
  if (stage !== 1) {
    applyDecayStage(world, stage, world.decay.variants); // Story 4.2: every cover object active (worst case)
  }
  if (world.run.phase === "build") startWave(world);
  const points = world.map.spawnPoints;
  let spawnAt = 0;
  let fieldTicks = 0;
  const times: number[] = [];
  for (let t = 1; t <= WARMUP_TICKS + MEASURED_TICKS; t++) {
    while (world.zombies.aliveCount < WALKERS) {
      const sp = points[spawnAt++ % points.length];
      if (!sp || spawnZombie(world, "walker", sp.x, sp.y, true) < 0) break;
    }
    for (let i = 0; i < 4; i++) {
      const a = t * 0.05 + i * 1.6;
      c.queueInput(`p${i}`, { ...NEUTRAL_INPUT, seq: t, moveX: Math.cos(a) * 0.7, moveY: Math.sin(a) * 0.7, aimX: -Math.sin(a), aimY: Math.cos(a), fire: true });
    }
    const t0 = performance.now();
    c.tick();
    const ms = performance.now() - t0;
    if (t > WARMUP_TICKS) {
      times.push(ms);
      if (world.pathing.chase.sourceTick >= 0 && world.tick - world.pathing.chase.sourceTick <= 6) fieldTicks++;
    }
  }
  times.sort((a, b) => a - b);
  return {
    p99: times[Math.floor(times.length * 0.99)] ?? 0,
    mean: times.reduce((s, v) => s + v, 0) / times.length,
    kills: c.kills("p0") + c.kills("p1") + c.kills("p2") + c.kills("p3"),
    fieldTicks,
    seconds: MEASURED_TICKS * TICK_DT_S,
  };
}

describe("tick cost of the Downtown map (Story 4.1)", () => {
  it("4 players + 150 Walkers: Downtown adds ≤ 2 ms to the tick p99 over the open street", () => {
    // Each case twice, interleaved, keeping the lower p99 (a GC pause in one run is not the map's cost).
    const runs = [measure(PLACEHOLDER_MAP), measure(DOWNTOWN_MAP), measure(PLACEHOLDER_MAP), measure(DOWNTOWN_MAP)];
    const pick = <T extends { p99: number }>(a: T, b: T): T => (a.p99 <= b.p99 ? a : b);
    const open = pick(runs[0] as ReturnType<typeof measure>, runs[2] as ReturnType<typeof measure>);
    const downtown = pick(runs[1] as ReturnType<typeof measure>, runs[3] as ReturnType<typeof measure>);
    console.log(
      `[tick cost 4.1] open street p99 ${open.p99.toFixed(3)} ms (mean ${open.mean.toFixed(3)}); Downtown p99 ${downtown.p99.toFixed(3)} ms ` +
        `(mean ${downtown.mean.toFixed(3)}); added p99 ${(downtown.p99 - open.p99).toFixed(3)} ms; kills ${open.kills} / ${downtown.kills}; added bandwidth 0 B/s`,
    );
    // Liveness: the fight really ran (shots killed zombies) and the field kept up.
    expect(downtown.kills).toBeGreaterThan(0);
    expect(downtown.fieldTicks).toBe(MEASURED_TICKS);
    if (PERF_ASSERT) expect(downtown.p99 - open.p99).toBeLessThanOrEqual(2);
  }, 120_000);
});

describe("tick cost of cover (Story 4.2)", () => {
  it("4 players + 150 Walkers: cover at stage 3 (7 cover boxes for bodies, 5 cars as shot blockers) adds ≤ 2 ms to the tick p99 over Downtown without cover", () => {
    const bare: DistrictMap = { ...DOWNTOWN_MAP, cover: [] };
    const runs = [measure(bare), measure(DOWNTOWN_MAP, 3), measure(bare), measure(DOWNTOWN_MAP, 3)];
    const pick = <T extends { p99: number }>(a: T, b: T): T => (a.p99 <= b.p99 ? a : b);
    const without = pick(runs[0] as ReturnType<typeof measure>, runs[2] as ReturnType<typeof measure>);
    const withCover = pick(runs[1] as ReturnType<typeof measure>, runs[3] as ReturnType<typeof measure>);
    // The projectile-vs-cover test alone: shotBlockT on random 3 m sweeps across Downtown (15 shot blockers).
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP });
    const rng = createRng(5);
    const N = 200_000;
    const xs = new Float64Array(N * 4);
    for (let i = 0; i < N; i++) {
      const a = rng.range(0, 2 * Math.PI);
      xs[i * 4] = rng.range(0, 48);
      xs[i * 4 + 1] = rng.range(0, 32);
      xs[i * 4 + 2] = (xs[i * 4] as number) + Math.cos(a) * 3;
      xs[i * 4 + 3] = (xs[i * 4 + 1] as number) + Math.sin(a) * 3;
    }
    let blocked = 0;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) if (shotBlockT(world, xs[i * 4] as number, xs[i * 4 + 1] as number, xs[i * 4 + 2] as number, xs[i * 4 + 3] as number) >= 0) blocked++;
    const nsPerSweep = ((performance.now() - t0) * 1e6) / N;
    console.log(
      `[tick cost 4.2] Downtown without cover p99 ${without.p99.toFixed(3)} ms (mean ${without.mean.toFixed(3)}); with cover (stage 3) p99 ${withCover.p99.toFixed(3)} ms ` +
        `(mean ${withCover.mean.toFixed(3)}); added p99 ${(withCover.p99 - without.p99).toFixed(3)} ms, mean ${(withCover.mean - without.mean).toFixed(3)} ms; kills ${without.kills} / ${withCover.kills}; ` +
        `shotBlockT ${nsPerSweep.toFixed(0)} ns per projectile sweep (${world.obstacles.shotBlockers.length} blockers; ${((100 * blocked) / N).toFixed(0)} % of random sweeps blocked) → 512 shots (the pool) ${((nsPerSweep * 512) / 1e6).toFixed(3)} ms; added bandwidth 0 B/s`,
    );
    expect(withCover.kills).toBeGreaterThan(0); // liveness
    expect(withCover.fieldTicks).toBe(MEASURED_TICKS);
    expect(blocked).toBeGreaterThan(0);
    if (PERF_ASSERT) {
      expect(withCover.p99 - without.p99).toBeLessThanOrEqual(2);
      expect((nsPerSweep * 512) / 1e6).toBeLessThan(0.5); // a full projectile pool's cover tests per tick
    }
  }, 120_000);
});

describe("build-start spike of a decay stage change (Story 4.5)", () => {
  it("4 players + 150 Walkers + 24 buildings: mutations + building refunds + push-outs + both flow fields rebuilt stay well inside one 50 ms tick", () => {
    const REPEATS = 12;
    const spikes: number[] = [];
    const parts = { apply: 0, fields: 0 };
    let destroyed = 0;
    for (let r = 0; r < REPEATS; r++) {
      const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
      const c = new RunController({ balance, seed: 40 + r, players, pauseWaves: true, map: DOWNTOWN_MAP, decayStageByWave: [1, 1 + (r % 2) + 1] });
      const world = c.world;
      world.debug.godMode = true;
      for (const p of world.players.values()) p.wallet = 10_000;
      // 24 barricades (6 each), some on the cells stage 2 blocks (the dumpster), the rest on a street grid.
      const spots: [number, number, number][] = [[76, 52, 0], [76, 53, 0], [76, 54, 0]];
      for (let gx = 20; spots.length < 24 && gx < 80; gx += 5) spots.push([gx, 34, 0], [gx, 30, 0]);
      spots.slice(0, 24).forEach(([gx, gy, rot], i) => c.placeBuilding(`p${i % 4}`, { type: "wood_barricade", gx, gy, rot }));
      const rng = createRng(r + 1);
      const points = world.map.spawnPoints.filter((s) => s.minStage === 1);
      for (let i = 0; i < WALKERS; i++) {
        const sp = points[i % points.length] as { x: number; y: number };
        spawnZombie(world, "walker", sp.x + rng.range(-0.4, 0.4), sp.y + rng.range(-0.4, 0.4));
      }
      for (let t = 0; t < 60; t++) c.tick(); // fields built on the stage-1 map, zombies spread
      const before = world.buildings.list.length;
      startWave(world);
      const t0 = performance.now();
      skipWave(world); // the build start: DecaySystem steps 1–4 (skipWave's own kills are cheap and included)
      spikes.push(performance.now() - t0);
      destroyed += before - world.buildings.list.length;
      const lastStage = world.decay.stage;
      // The parts, on the same World (back to stage 1 and forward again: apply only, then fields only).
      const t1 = performance.now();
      applyDecayStage(world, 1, world.decay.variants);
      applyDecayStage(world, lastStage, world.decay.variants);
      parts.apply += (performance.now() - t1) / 2;
      const t2 = performance.now();
      rebuildFlowFieldNow(world.pathing.chase, world.pathing.nav, world);
      rebuildFlowFieldNow(world.pathing.flank, world.pathing.nav, world);
      parts.fields += performance.now() - t2;
      expect(world.decay.stage).toBeGreaterThanOrEqual(2);
    }
    spikes.sort((a, b) => a - b);
    const median = spikes[Math.floor(spikes.length / 2)] as number;
    const max = spikes[spikes.length - 1] as number;
    console.log(
      `[spike 4.5] decay stage change at the build start: median ${median.toFixed(2)} ms, max ${max.toFixed(2)} ms over ${REPEATS} runs ` +
        `(apply ${(parts.apply / REPEATS).toFixed(3)} ms, both fields ${(parts.fields / REPEATS).toFixed(2)} ms); ${destroyed} buildings destroyed + refunded; tick budget 50 ms`,
    );
    expect(destroyed).toBeGreaterThan(0); // liveness: buildings really went
    if (PERF_ASSERT) {
      expect(median).toBeLessThan(10);
      expect(max).toBeLessThan(25);
    }
  }, 120_000);
});
