import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, NEUTRAL_INPUT, ZOMBIE_TYPES, applyZombieDamage, bloaterStats, loadBalance, spawnZombie, startWave } from "@topdown/shared";
import { loadavg } from "node:os";
import { RunController } from "./RunController";

/**
 * Story 5.8 (AC 10, brief line 16): 4 players + 150 zombies of which 40 Bloaters on Downtown (they
 * swell on contact, burst, chain, gas the players: god mode), and a forced 20-Bloater chain in one
 * crowd every 2 s, against 150 Walkers. Timing asserts only with `PERF_ASSERT=1` (record `uptime`).
 */
const balance = loadBalance();
const ZOMBIES = 150;
const WARMUP_TICKS = 100;
const MEASURED_TICKS = 600;
const PERF_ASSERT = process.env.PERF_ASSERT === "1";
const BLOATER = ZOMBIE_TYPES.indexOf("bloater");

function measure(bloaters: number, chain: boolean) {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 99, players, pauseWaves: true, map: DOWNTOWN_MAP });
  const world = c.world;
  world.debug.godMode = true;
  if (world.run.phase === "build") startWave(world);
  const points = world.map.spawnPoints;
  let spawnAt = 0;
  const times: number[] = [];
  let worst = 0;
  const blasts0 = bloaterStats.blasts;
  const count = (): number => {
    let n = 0;
    for (let i = 0; i < world.zombies.aliveCount; i++) if (world.zombies.type[world.zombies.aliveIds[i] as number] === BLOATER) n++;
    return n;
  };
  for (let t = 1; t <= WARMUP_TICKS + MEASURED_TICKS; t++) {
    let need = bloaters > 0 ? bloaters - count() : 0;
    while (world.zombies.aliveCount < ZOMBIES) {
      const sp = points[spawnAt++ % points.length];
      if (!sp || spawnZombie(world, need > 0 ? "bloater" : "walker", sp.x, sp.y, true) < 0) break;
      need--;
    }
    if (chain && t % 40 === 0) {
      // 20 Bloaters packed 1.05 m apart near the crossing; one is shot: the chain runs ≤ 8 a tick.
      let first = -1;
      for (let k = 0; k < 20; k++) {
        const id = spawnZombie(world, "bloater", 20 + (k % 5) * 1.05, 12 + Math.floor(k / 5) * 1.05, true);
        if (first < 0) first = id;
      }
      if (first >= 0) applyZombieDamage(world, first, 1000, 1, 0, 0, "p0", "pistol");
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
      worst = Math.max(worst, ms);
    }
  }
  times.sort((a, b) => a - b);
  return { p99: times[Math.floor(times.length * 0.99)] ?? 0, mean: times.reduce((s, v) => s + v, 0) / times.length, worst, blasts: bloaterStats.blasts - blasts0 };
}

describe("tick cost of Bloaters (Story 5.8, brief line 16)", () => {
  it("4 players + 110 Walkers + 40 Bloaters (swells, bursts, gas) and a forced 20-Bloater chain every 2 s add ≤ 2 ms to the tick p99 over 150 Walkers", () => {
    const runs = [measure(0, false), measure(40, true), measure(0, false), measure(40, true)];
    const pick = <T extends { p99: number }>(a: T, b: T): T => (a.p99 <= b.p99 ? a : b);
    const walkers = pick(runs[0] as ReturnType<typeof measure>, runs[2] as ReturnType<typeof measure>);
    const mixed = pick(runs[1] as ReturnType<typeof measure>, runs[3] as ReturnType<typeof measure>);
    console.log(
      `[tick cost 5.8] load ${loadavg()[0]?.toFixed(2)}; 150 Walkers p99 ${walkers.p99.toFixed(3)} ms (mean ${walkers.mean.toFixed(3)}); 110 + 40 Bloaters + chains p99 ${mixed.p99.toFixed(3)} ms (mean ${mixed.mean.toFixed(3)}, worst ${mixed.worst.toFixed(3)}); ` +
        `added p99 ${(mixed.p99 - walkers.p99).toFixed(3)} ms; ${mixed.blasts} blasts`,
    );
    expect(mixed.blasts).toBeGreaterThan(100); // liveness: the chains and swells really burst
    if (PERF_ASSERT) expect(mixed.p99 - walkers.p99).toBeLessThanOrEqual(2);
  }, 180_000);
});
