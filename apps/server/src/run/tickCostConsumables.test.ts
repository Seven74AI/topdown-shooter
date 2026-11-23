import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, NEUTRAL_INPUT, igniteMolotov, loadBalance, molotovStats, spawnZombie, startWave } from "@topdown/shared";
import { loadavg } from "node:os";
import { RunController } from "./RunController";

/**
 * Story 5.12 (AC 9, brief line 16): 4 players + 150 Walkers on Downtown with 8 live molotov zones
 * kept burning on the crowd (relit as they end) and a grenade every 2 s, against 150 Walkers alone.
 * Timing asserts only with `PERF_ASSERT=1` (record `uptime`); added p99 ≤ 0.3 ms.
 */
const balance = loadBalance();
const ZOMBIES = 150;
const WARMUP_TICKS = 100;
const MEASURED_TICKS = 600;
const PERF_ASSERT = process.env.PERF_ASSERT === "1";
const MOLOTOV = 2;

function measure(fire: boolean) {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  // No wave director (the crowd is topped up here), but not `pauseWaves`: that dev switch also holds every fire (4.8 review L6).
  const c = new RunController({ balance, seed: 77, players, systems: { waves: () => {} }, map: DOWNTOWN_MAP });
  const world = c.world;
  world.debug.godMode = true;
  if (world.run.phase === "build") startWave(world);
  const points = world.map.spawnPoints;
  let spawnAt = 0;
  const times: number[] = [];
  const hits0 = molotovStats.zombieHits;
  for (let t = 1; t <= WARMUP_TICKS + MEASURED_TICKS; t++) {
    while (world.zombies.aliveCount < ZOMBIES) {
      const sp = points[spawnAt++ % points.length];
      if (!sp || spawnZombie(world, "walker", sp.x, sp.y, true) < 0) break;
    }
    if (fire) {
      // keep 8 zones burning on the crowd (on zombies: they burn every pulse)
      const z = world.zombies;
      for (let k = 0; world.molotovs.areas.count < 8 && k < z.aliveCount; k += 17) igniteMolotov(world, MOLOTOV, z.x[z.aliveIds[k] as number] as number, z.y[z.aliveIds[k] as number] as number, "p0");
    }
    for (let i = 0; i < 4; i++) {
      const p = world.players.get(`p${i}`);
      if (fire && p && i === 0 && t % 40 === 0) {
        p.consumable = "grenades";
        p.consumableCount = 1;
      }
      const a = t * 0.05 + i * 1.6;
      c.queueInput(`p${i}`, { ...NEUTRAL_INPUT, seq: t, moveX: Math.cos(a) * 0.7, moveY: Math.sin(a) * 0.7, aimX: -Math.sin(a), aimY: Math.cos(a), fire: true, consumable: fire && i === 0 && t % 40 === 0 });
    }
    const t0 = performance.now();
    c.tick();
    const ms = performance.now() - t0;
    if (t > WARMUP_TICKS) times.push(ms);
  }
  times.sort((a, b) => a - b);
  return { p99: times[Math.floor(times.length * 0.99)] ?? 0, mean: times.reduce((s, v) => s + v, 0) / times.length, burns: molotovStats.zombieHits - hits0 };
}

describe("tick cost of consumables (Story 5.12, brief line 16)", () => {
  it("8 live molotov zones on 150 Walkers + a grenade every 2 s add ≤ 0.3 ms to the tick p99", () => {
    const runs = [measure(false), measure(true), measure(false), measure(true)];
    const pick = <T extends { p99: number }>(a: T, b: T): T => (a.p99 <= b.p99 ? a : b);
    const base = pick(runs[0] as ReturnType<typeof measure>, runs[2] as ReturnType<typeof measure>);
    const withFire = pick(runs[1] as ReturnType<typeof measure>, runs[3] as ReturnType<typeof measure>);
    console.log(
      `[tick cost 5.12] load ${loadavg()[0]?.toFixed(2)}; 150 Walkers p99 ${base.p99.toFixed(3)} ms (mean ${base.mean.toFixed(3)}); + 8 molotov zones + grenades p99 ${withFire.p99.toFixed(3)} ms (mean ${withFire.mean.toFixed(3)}); ` +
        `added p99 ${(withFire.p99 - base.p99).toFixed(3)} ms; ${withFire.burns} burns`,
    );
    expect(withFire.burns).toBeGreaterThan(500); // liveness: the zones really burned the crowd
    if (PERF_ASSERT) expect(withFire.p99 - base.p99).toBeLessThanOrEqual(0.3);
  }, 180_000);
});
