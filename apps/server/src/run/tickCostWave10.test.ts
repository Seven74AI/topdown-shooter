import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, NEUTRAL_INPUT, TICK_DT_S, ZOMBIE_TYPES, loadBalance } from "@topdown/shared";
import { loadavg } from "node:os";
import { RunController } from "./RunController";

/**
 * Story 6.1 (Dev Notes › Phone FPS / Perf; brief line 16): the heaviest wave of the run yet, wave 10
 * at 4 players (400 zombies queued behind the 150-alive cap; the real mix: 60 Bloaters, 40 Spitters,
 * 2 Brutes …) on Downtown at stage 5, the real wave director (`DEV_START_WAVE=10`), 4 god-mode players
 * circling and firing. Its tick p99 is the baseline Stories 6.3–6.7 add to; recorded against 150
 * Walkers (the same wave as Walkers only, `DEV_WAVE_MIX=walker`). Timing asserts only with
 * `PERF_ASSERT=1` (record the load).
 */
const balance = loadBalance();
/** Warm-up: no fire until the wave is at the cap (8 spawns/s: ~19 s), at most this long. */
const MAX_WARMUP_TICKS = 1000;
const MEASURED_TICKS = 600;
const PERF_ASSERT = process.env.PERF_ASSERT === "1";
const TICK_MS = TICK_DT_S * 1000;

function measure(walkersOnly: boolean) {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 61, players, map: DOWNTOWN_MAP, startWave: 10, waveMix: walkersOnly ? ["walker"] : null });
  const world = c.world;
  world.debug.godMode = true;
  for (const p of players) c.setBuildReady(p.playerId, true);
  const times: number[] = [];
  let worst = 0;
  let peakAlive = 0;
  const seen = new Set<string>();
  let warm = 0;
  for (let t = 1; times.length < MEASURED_TICKS && t <= MAX_WARMUP_TICKS + MEASURED_TICKS && world.run.phase !== "results"; t++) {
    const measuring = warm > 0;
    for (let i = 0; i < 4; i++) {
      const a = t * 0.05 + i * 1.6;
      c.queueInput(`p${i}`, { ...NEUTRAL_INPUT, seq: t, moveX: Math.cos(a) * 0.5, moveY: Math.sin(a) * 0.5, aimX: -Math.sin(a), aimY: Math.cos(a), fire: measuring });
    }
    const t0 = performance.now();
    c.tick();
    const ms = performance.now() - t0;
    peakAlive = Math.max(peakAlive, world.zombies.aliveCount);
    for (let i = 0; i < world.zombies.aliveCount; i++) seen.add(ZOMBIE_TYPES[world.zombies.type[world.zombies.aliveIds[i] as number] as number] as string);
    if (measuring) {
      times.push(ms);
      worst = Math.max(worst, ms);
    } else if (world.zombies.aliveCount >= balance.waves.maxAlive) warm = t; // at the cap: measure from the next tick (firing, the queue refills)
  }
  times.sort((a, b) => a - b);
  return { p99: times[Math.floor(times.length * 0.99)] ?? 0, mean: times.reduce((s, v) => s + v, 0) / Math.max(1, times.length), worst, peakAlive, seen, wave: world.waves.number, stage: world.decay.stage, measured: times.length, warm };
}

describe("tick cost of wave 10 (Story 6.1, brief line 16)", () => {
  it("wave 10 at 4 players, 150 alive with the real mix: tick p99 recorded (the Epic 6 baseline) next to 150 Walkers", () => {
    const runs = [measure(true), measure(false), measure(true), measure(false)];
    const pick = <T extends { p99: number }>(a: T, b: T): T => (a.p99 <= b.p99 ? a : b);
    const walkers = pick(runs[0] as ReturnType<typeof measure>, runs[2] as ReturnType<typeof measure>);
    const mixed = pick(runs[1] as ReturnType<typeof measure>, runs[3] as ReturnType<typeof measure>);
    console.log(
      `[tick cost 6.1] load ${loadavg()[0]?.toFixed(2)}; wave ${mixed.wave} stage ${mixed.stage}, peak alive ${mixed.peakAlive}, types ${[...mixed.seen].sort().join(",")}; ` +
        `warm-up ${mixed.warm} ticks; real mix p99 ${mixed.p99.toFixed(3)} ms (mean ${mixed.mean.toFixed(3)}, worst ${mixed.worst.toFixed(3)}); 150 Walkers p99 ${walkers.p99.toFixed(3)} ms (mean ${walkers.mean.toFixed(3)}); ` +
        `mix over Walkers ${(mixed.p99 - walkers.p99).toFixed(3)} ms`,
    );
    // Liveness: the real wave 10 really ran at the cap with the full bestiary.
    expect(mixed.wave).toBe(10);
    expect(mixed.stage).toBe(5);
    expect(mixed.measured).toBe(MEASURED_TICKS);
    expect(mixed.peakAlive).toBe(balance.waves.maxAlive);
    for (const t of ["walker", "runner", "crawler", "spitter", "bloater"]) expect(mixed.seen.has(t), t).toBe(true);
    if (PERF_ASSERT) expect(mixed.p99).toBeLessThan(TICK_MS / 2); // well inside the 50 ms tick
  }, 180_000);
});
