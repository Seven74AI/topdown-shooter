import { describe, expect, it } from "vitest";
import { BOSS_STATE, BUILD_GRID_M, DOWNTOWN_MAP, NEUTRAL_INPUT, addBuildingAt, bossStats, loadBalance, pickBossEntry, spawnZombie, startWave, bossEntry } from "@topdown/shared";
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

/** Story 6.6: 24 player buildings in the street round the players (re-placed when a charge smashes them), outside the timed part. */
function keepBuildings(world: RunController["world"]): void {
  let id = 1000;
  for (let i = 0; world.buildings.list.length < 24 && i < 200; i++) {
    const gx = Math.round((18 + (i % 12) * 1.5) / BUILD_GRID_M);
    const gy = Math.round((19 + Math.floor(i / 12) * 2.5) / BUILD_GRID_M);
    while (world.buildings.list.some((b) => b.id === id)) id++;
    addBuildingAt(world, { id, type: i % 2 === 0 ? "wood_barricade" : "spike_trap", ownerId: "p0", gx, gy, rot: 0, hp: 100 });
  }
}

function measure(boss: boolean, rush = false) {
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
  const rushTimes: number[] = [];
  const charges0 = bossStats.charges;
  for (let t = 1; t <= WARMUP_TICKS + MEASURED_TICKS; t++) {
    if (rush) {
      keepBuildings(world);
      const b = world.boss;
      if (boss) {
        b.cooldown.slam = 1e9; // charges every cooldown
        b.cooldown.throw = 1e9;
        if (b.state === BOSS_STATE.WALK) {
          b.gapTicks = 0;
          b.cooldown.charge = 0;
        }
      }
    }
    while (world.zombies.aliveCount < ZOMBIES) {
      const sp = points[spawnAt++ % points.length];
      if (!sp || spawnZombie(world, "walker", sp.x, sp.y, true) < 0) break;
    }
    for (let i = 0; i < 4; i++) {
      const a = t * 0.05 + i * 1.6;
      c.queueInput(`p${i}`, { ...NEUTRAL_INPUT, seq: t, moveX: Math.cos(a) * 0.7, moveY: Math.sin(a) * 0.7, aimX: -Math.sin(a), aimY: Math.cos(a), fire: true });
    }
    const inRush = world.boss.state === BOSS_STATE.RUSH;
    const t0 = performance.now();
    c.tick();
    const dt = performance.now() - t0;
    if (t > WARMUP_TICKS) times.push(dt);
    if (t > WARMUP_TICKS && (inRush || world.boss.state === BOSS_STATE.RUSH)) rushTimes.push(dt);
  }
  times.sort((a, b) => a - b);
  rushTimes.sort((a, b) => a - b);
  return {
    p99: times[Math.floor(times.length * 0.99)] ?? 0,
    mean: times.reduce((s, v) => s + v, 0) / times.length,
    slams: bossStats.slams - slams0,
    rebuilds: world.pathing.bossChase.rebuilds,
    rushP99: rushTimes[Math.floor(rushTimes.length * 0.99)] ?? 0,
    rushTicks: rushTimes.length,
    charges: bossStats.charges - charges0,
  };
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

describe("tick cost of the charge (Story 6.6, brief 16)", () => {
  it("rush ticks with 110 zombies + 24 player buildings stay within the 6.5 budget (≤ 1 ms over 110 zombies alone)", () => {
    const runs = [measure(false, true), measure(true, true), measure(false, true), measure(true, true)];
    const base = (runs[0] as ReturnType<typeof measure>).p99 <= (runs[2] as ReturnType<typeof measure>).p99 ? runs[0] : runs[2];
    const boss = (runs[1] as ReturnType<typeof measure>).rushP99 <= (runs[3] as ReturnType<typeof measure>).rushP99 ? runs[1] : runs[3];
    if (!base || !boss) throw new Error("no runs");
    const added = boss.rushP99 - base.p99;
    console.log(`[tick cost charge] base p99 ${base.p99.toFixed(3)} ms; rush-tick p99 ${boss.rushP99.toFixed(3)} ms over ${boss.rushTicks} rush ticks (${boss.charges} charges; added ${added.toFixed(3)} ms); load ${loadavg()[0]?.toFixed(2)}`);
    expect(boss.charges).toBeGreaterThan(3); // liveness: it really charged
    expect(boss.rushTicks).toBeGreaterThan(20);
    if (PERF_ASSERT) expect(added).toBeLessThanOrEqual(1);
  }, 120_000);
});
