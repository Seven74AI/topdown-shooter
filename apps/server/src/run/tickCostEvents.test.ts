import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, EVENT_KINDS, EVENT_PHASE, NEUTRAL_INPUT, loadBalance, spawnZombie, startWave } from "@topdown/shared";
import { loadavg } from "node:os";
import { RunController } from "./RunController";

/**
 * Story 6.8 (T7, brief 16): server tick cost with 150 zombies + a stampede (up to 180 alive) and with
 * a car alarm (its two lure fields built in the round-robin, then 15 s of lured zombies), against 150
 * zombies with no event. Added p99 recorded; asserted (≤ 1 ms of the Epic 6 2 ms budget) only with
 * `PERF_ASSERT=1` (record `uptime`).
 */
const balance = loadBalance();
const ZOMBIES = 150;
const WARMUP = 60;
const MEASURED = 20 * 14;
const PERF_ASSERT = process.env.PERF_ASSERT === "1";

function measure(kind: "none" | "car_alarm" | "stampede") {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 68, players, pauseWaves: true, map: DOWNTOWN_MAP });
  const w = c.world;
  w.debug.godMode = true;
  if (w.run.phase === "build") startWave(w);
  w.special.scheduled = true;
  const points = w.map.spawnPoints;
  let sp = 0;
  const fill = (): void => {
    while (w.zombies.aliveCount < ZOMBIES) {
      const p = points[sp++ % points.length];
      if (!p || spawnZombie(w, "walker", p.x, p.y, true) < 0) break;
    }
  };
  const times: number[] = [];
  let most = 0;
  let lured = 0;
  for (let t = 1; t <= WARMUP + MEASURED; t++) {
    if (kind === "none" || w.special.active.kind === -1 || t < WARMUP) fill();
    if (t === WARMUP && kind !== "none") {
      w.special.extra.kind = EVENT_KINDS.indexOf(kind);
      w.special.extra.wave = w.waves.number;
      w.special.extra.startFraction = 0;
      w.special.extraDone = false;
    }
    if (kind === "car_alarm" && w.special.active.phase === EVENT_PHASE.ARMED && w.pathing.lureBuild === 3) w.special.active.phaseTick = w.tick - 400; // sound it once the fields are built
    for (let i = 0; i < 4; i++) {
      const a = t * 0.05 + i * 1.6;
      c.queueInput(`p${i}`, { ...NEUTRAL_INPUT, seq: t, moveX: Math.cos(a) * 0.5, moveY: Math.sin(a) * 0.5, aimX: -Math.sin(a), aimY: Math.cos(a), fire: true });
    }
    const t0 = performance.now();
    c.tick();
    const dt = performance.now() - t0;
    if (t > WARMUP) times.push(dt);
    most = Math.max(most, w.zombies.aliveCount);
    for (let i = 0; i < w.zombies.aliveCount; i++) if ((w.zombies.lureTicks[w.zombies.aliveIds[i]!] as number) > 0) lured++;
  }
  times.sort((a, b) => a - b);
  return { p99: times[Math.floor(times.length * 0.99)] ?? 0, mean: times.reduce((a, b) => a + b, 0) / times.length, most, lured, log: w.special.log };
}

describe("Story 6.8 tick cost (brief 16)", () => {
  it("150 zombies + a stampede (≤ 180 alive) / + a car alarm's lure: added p99 recorded (≤ 1 ms asserted with PERF_ASSERT=1)", () => {
    // JIT warm-up: each path once (the first run of a new code path costs ~1 ms of p99 alone)
    measure("none");
    measure("stampede");
    measure("car_alarm");
    const base = measure("none");
    const st = measure("stampede");
    const ca = measure("car_alarm");
    const load = loadavg()[0] ?? 0;
    console.log(
      `[events tick cost] load ${load.toFixed(2)}; base p99 ${base.p99.toFixed(2)} ms (mean ${base.mean.toFixed(2)}); stampede p99 ${st.p99.toFixed(2)} ms (+${(st.p99 - base.p99).toFixed(2)}; ${st.most} alive at most, ${st.log.stampedeSpawned} Runners); car alarm p99 ${ca.p99.toFixed(2)} ms (+${(ca.p99 - base.p99).toFixed(2)}; ${ca.lured} lured zombie-ticks)`,
    );
    expect(st.log.stampedeSpawned).toBeGreaterThan(0); // liveness
    expect(st.most).toBeGreaterThan(ZOMBIES);
    expect(st.most).toBeLessThanOrEqual(ZOMBIES + balance.events.stampede.overCap);
    expect(ca.lured).toBeGreaterThan(0);
    if (PERF_ASSERT) {
      expect(st.p99 - base.p99).toBeLessThanOrEqual(1);
      expect(ca.p99 - base.p99).toBeLessThanOrEqual(1);
    }
  }, 120_000);
});
