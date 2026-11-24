import { describe, expect, it } from "vitest";
import { BOSS_STATE, DOWNTOWN_MAP, NEUTRAL_INPUT, bossStats, loadBalance, pickBossEntry, spawnZombie, startWave, bossEntry } from "@topdown/shared";
import { loadavg } from "node:os";
import { RunController } from "./RunController";

/**
 * Story 6.5 (T10, brief 16): 4 players + 110 zombies + the walking, slamming Behemoth (its 4th flow
 * field in the round-robin) on Downtown, against 110 zombies without it. Added p99 ≤ 1 ms of the
 * Epic 6 2 ms budget. Timing asserts only with `PERF_ASSERT=1` (record `uptime`).
 */
const balance = loadBalance();
const ZOMBIES = 110;
const WARMUP_TICKS = 100;
const MEASURED_TICKS = 600;
const PERF_ASSERT = process.env.PERF_ASSERT === "1";

function measure(boss: boolean) {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 65, players, pauseWaves: true, map: DOWNTOWN_MAP });
  const world = c.world;
  world.debug.godMode = true;
  if (world.run.phase === "build") startWave(world);
  if (boss) {
    pickBossEntry(world);
    const b = world.boss;
    b.state = BOSS_STATE.WALK;
    b.x = bossEntry.x;
    b.y = bossEntry.y;
    b.hp = b.maxHp = 1e9;
    b.wave = world.waves.number;
  }
  const points = world.map.spawnPoints;
  let spawnAt = 0;
  const times: number[] = [];
  const slams0 = bossStats.slams;
  for (let t = 1; t <= WARMUP_TICKS + MEASURED_TICKS; t++) {
    while (world.zombies.aliveCount < ZOMBIES) {
      const sp = points[spawnAt++ % points.length];
      if (!sp || spawnZombie(world, "walker", sp.x, sp.y, true) < 0) break;
    }
    for (let i = 0; i < 4; i++) {
      const a = t * 0.05 + i * 1.6;
      c.queueInput(`p${i}`, { ...NEUTRAL_INPUT, seq: t, moveX: Math.cos(a) * 0.7, moveY: Math.sin(a) * 0.7, aimX: -Math.sin(a), aimY: Math.cos(a), fire: true });
    }
    const t0 = performance.now();
    c.tick();
    if (t > WARMUP_TICKS) times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { p99: times[Math.floor(times.length * 0.99)] ?? 0, mean: times.reduce((s, v) => s + v, 0) / times.length, slams: bossStats.slams - slams0, rebuilds: world.pathing.bossChase.rebuilds };
}

describe("tick cost of the Behemoth (Story 6.5, brief 16)", () => {
  it("110 zombies + the boss (4th field, slams, body push) add ≤ 1 ms to the tick p99 over 110 zombies alone", () => {
    const runs = [measure(false), measure(true), measure(false), measure(true)];
    const base = (runs[0] as ReturnType<typeof measure>).p99 <= (runs[2] as ReturnType<typeof measure>).p99 ? runs[0] : runs[2];
    const boss = (runs[1] as ReturnType<typeof measure>).p99 <= (runs[3] as ReturnType<typeof measure>).p99 ? runs[1] : runs[3];
    if (!base || !boss) throw new Error("no runs");
    const added = boss.p99 - base.p99;
    console.log(`[tick cost boss] base p99 ${base.p99.toFixed(3)} ms, with boss ${boss.p99.toFixed(3)} ms (added ${added.toFixed(3)} ms); mean ${base.mean.toFixed(3)} → ${boss.mean.toFixed(3)}; ${boss.slams} slams, ${boss.rebuilds} field rebuilds; load ${loadavg()[0]?.toFixed(2)}`);
    expect(boss.rebuilds).toBeGreaterThan(10); // liveness: the 4th field really ran
    if (PERF_ASSERT) expect(added).toBeLessThanOrEqual(1);
  }, 120_000);
});
