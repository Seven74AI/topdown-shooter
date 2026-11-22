import { describe, expect, it } from "vitest";
import {
  DOWNTOWN_MAP,
  NEUTRAL_INPUT,
  PLACEHOLDER_MAP,
  TICK_DT_S,
  applyCoverStage,
  createRng,
  createWorld,
  loadBalance,
  shotBlockT,
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
    world.debug.decayStage = stage; // Story 4.2: every cover object active (worst case)
    applyCoverStage(world);
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
