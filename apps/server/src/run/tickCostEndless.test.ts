import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, NEUTRAL_INPUT, TICK_DT_S, loadBalance, zombieTypeIndex } from "@topdown/shared";
import { loadavg } from "node:os";
import { RunController } from "./RunController";

/**
 * Story 6.12 (T6; brief 16, 25): the tick cost of an endless wave next to wave 10. Wave 19 at 4
 * players (600 zombies, wave 9's mix, 11 Brutes with ≤ 6 alive, × 1.24 HP) at the 150-alive cap,
 * on Downtown at stage 5 (`DEV_START_WAVE=19` sets endless), 4 god-mode players circling and firing.
 * Recorded with the load; timing asserts only with `PERF_ASSERT=1`.
 */
const balance = loadBalance();
const MAX_WARMUP_TICKS = 1500;
const MEASURED_TICKS = 600;
const PERF_ASSERT = process.env.PERF_ASSERT === "1";
const TICK_MS = TICK_DT_S * 1000;
const BRUTE = zombieTypeIndex("brute");

function measure(startWave: number) {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 61, players, map: DOWNTOWN_MAP, startWave });
  const world = c.world;
  world.debug.godMode = true;
  world.debug.bossWaves = [];
  for (const p of players) c.setBuildReady(p.playerId, true);
  const times: number[] = [];
  let peakAlive = 0;
  let peakBrutes = 0;
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
    const z = world.zombies;
    peakAlive = Math.max(peakAlive, z.aliveCount);
    let b = 0;
    for (let i = 0; i < z.aliveCount; i++) if (z.type[z.aliveIds[i] as number] === BRUTE) b++;
    peakBrutes = Math.max(peakBrutes, b);
    if (measuring) times.push(ms);
    else if (z.aliveCount >= balance.waves.maxAlive) warm = t;
  }
  times.sort((a, b) => a - b);
  return { p99: times[Math.floor(times.length * 0.99)] ?? 0, mean: times.reduce((s, v) => s + v, 0) / Math.max(1, times.length), peakAlive, peakBrutes, wave: world.waves.number, endless: world.run.endless, size: world.waves.size, hpMult: world.waves.hpMult, measured: times.length };
}

describe("tick cost of an endless wave (Story 6.12, brief 16 / 25)", () => {
  it("wave 19 (endless, 600 zombies, ≤ 6 Brutes) at 150 alive: tick p99 recorded next to wave 10", () => {
    const w10 = measure(10);
    const w19 = measure(19);
    console.log(
      `[tick cost 6.12] load ${loadavg()[0]?.toFixed(2)}; wave 10 p99 ${w10.p99.toFixed(3)} ms (mean ${w10.mean.toFixed(3)}); ` +
        `wave ${w19.wave} endless size ${w19.size} hp ×${w19.hpMult.toFixed(2)} peak alive ${w19.peakAlive}, peak Brutes ${w19.peakBrutes}: p99 ${w19.p99.toFixed(3)} ms (mean ${w19.mean.toFixed(3)}); ` +
        `endless over wave 10 ${(w19.p99 - w10.p99).toFixed(3)} ms`,
    );
    expect(w19.wave).toBe(19);
    expect(w19.endless).toBe(true);
    expect(w19.size).toBe(600);
    expect(w19.measured).toBe(MEASURED_TICKS);
    expect(w19.peakAlive).toBe(balance.waves.maxAlive);
    expect(w19.peakBrutes).toBeLessThanOrEqual(balance.waves.endless.brutesMaxAlive);
    if (PERF_ASSERT) expect(w19.p99).toBeLessThan(TICK_MS / 2);
  }, 240_000);
});
