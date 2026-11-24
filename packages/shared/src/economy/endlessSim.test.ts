import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { createWorld, setInput, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { applyStartWave } from "../run/devStartWave";
import { castVote, setBuildReady, startBuild } from "../run/runStateMachine";
import { killZombie } from "../zombies/zombiePool";
import { zombieTypeIndex } from "../zombies/zombieTypes";
import { bossBodyOn, bossMaxHp } from "../boss/bossState";
import { killBoss } from "../boss/death";

/**
 * Story 6.12 (T6, brief 9 / 25): the endless flow with every real system.
 *
 * (a) Flow sim: 4 god-mode players, seed 1, start at wave 10 (6.1's switch; the vote opens after
 * it), Stay at every vote until wave 30, then Extract. A test-only "kill" step clears the wave
 * zombies every few ticks and kills the Behemoth once its body is on the map, so the waves cycle
 * fast while the director, boss, run machine, economy and light rules all run for real.
 * Liveness: 20 endless waves played, Behemoths at 15/20/25/30, a vote after 10/15/20/25/30,
 * "extracted" at 30, ≤ 6 Brutes alive on every tick, and FLAT pooled sizes (brief 25) between
 * wave 11 and wave 30.
 *
 * (b) Wipe sim: Stay at 10, then nobody fights: the team falls in endless → "lost"; the earnings
 * before and after the first Stay add up.
 */
const balance = loadBalance();
const BRUTE = zombieTypeIndex("brute");

function makeWorld(players: number, seed: number, god: boolean): { world: World; ids: string[] } {
  const world = createWorld({ balance, seed, map: DOWNTOWN_MAP });
  world.debug.godMode = god;
  const at = { x: 0, y: 0 };
  const ids: string[] = [];
  for (let s = 0; s < players; s++) {
    teamSpawnPoint(world, s, at);
    addPlayer(world, `p${s}`, at.x, at.y);
    ids.push(`p${s}`);
  }
  applyStartWave(world, 10);
  startBuild(world);
  return { world, ids };
}

/** Pooled / list sizes that must not grow over endless (brief 25). */
function sizes(world: World) {
  return {
    zombieCapacity: world.zombies.capacity,
    projectileCapacity: world.projectiles.capacity,
    grenades: world.grenades.count,
    fires: world.decay.fires.length,
    lights: world.lights.list.length,
    lightPool: world.lights.pool.length,
    fixedAtList: world.waves.fixedAtList.length,
    recentSpawns: world.waves.recentSpawns.length,
    pendingInputs: world.pendingInputs.size,
    players: world.players.size,
  };
}

const g = globalThis as unknown as {
  gc?: () => void;
  performance: { now(): number };
  process?: { memoryUsage(): { heapUsed: number }; env: Record<string, string | undefined> };
};
const heapMb = (): number => {
  g.gc?.();
  return g.process ? g.process.memoryUsage().heapUsed / 1e6 : 0;
};

describe("Story 6.12: endless sims", () => {
  it("(a) flow: Stay until wave 30, 20 endless waves, Behemoths every 5th, ≤ 6 Brutes alive, flat sizes, Extract at 30", () => {
    const { world, ids } = makeWorld(4, 1, true);
    const bossWaves: number[] = [];
    const bossHp: number[] = [];
    const votes: number[] = [];
    const tickTimes: number[] = [];
    let maxBrutes = 0;
    let at11: ReturnType<typeof sizes> | null = null;
    let heap11 = 0;
    world.events.subscribe((e) => {
      if (e.type === "boss.arrived") {
        bossWaves.push(world.waves.number);
        bossHp.push(e.maxHp);
      }
      if (e.type === "run.vote_opened") votes.push(e.wave);
    });
    let lastPhase = "";
    for (let t = 0; t < 400_000 && world.run.phase !== "results"; t++) {
      const phase = world.run.phase;
      if (phase === "build") for (const id of ids) setBuildReady(world, id, true);
      if (phase === "vote" && lastPhase !== "vote") for (const id of ids) castVote(world, id, world.waves.number < 30 ? "stay" : "extract");
      if (phase === "wave" && world.waves.number === 11 && at11 === null && world.waves.queued < world.waves.size / 2) {
        at11 = sizes(world);
        heap11 = heapMb();
      }
      lastPhase = phase;
      for (const id of ids) setInput(world, id, { ...NEUTRAL_INPUT, seq: t });
      const t0 = g.performance.now();
      step(world, TICK_DT_S);
      tickTimes.push(g.performance.now() - t0);
      const z = world.zombies;
      let brutes = 0;
      for (let i = 0; i < z.aliveCount; i++) if (z.type[z.aliveIds[i] as number] === BRUTE) brutes++;
      maxBrutes = Math.max(maxBrutes, brutes);
      if (world.run.phase === "wave" && t % 6 === 0) {
        for (let i = z.aliveCount - 1; i >= 0; i--) {
          const id = z.aliveIds[i] as number;
          if (z.waveZombie[id] === 1) killZombie(world, id, "p0", "pistol");
        }
      }
      if (bossBodyOn(world.boss) && world.boss.stateTicks > 40) killBoss(world, "p0", "pistol");
    }
    const at30 = sizes(world);
    const heap30 = heapMb();
    expect(world.run.phase).toBe("results");
    expect(world.run.ending).toBe("extracted");
    expect(world.waves.number).toBe(30);
    expect(votes).toEqual([10, 15, 20, 25, 30]);
    expect(bossWaves).toEqual([10, 15, 20, 25, 30]); // wave 10 is played (the start wave), then every 5th endless wave
    // F4 / D1: 6,000 × (1 + 0.25 k) at 4 players (k = 0 at wave 10), never × the zombies' hpMult
    expect(bossHp).toEqual([1, 1.25, 1.5, 1.75, 2].map((g) => bossMaxHp(balance, 4, 1, g)));
    expect(maxBrutes).toBeLessThanOrEqual(6);
    expect(maxBrutes).toBeGreaterThan(0);
    expect(at11).not.toBeNull();
    expect({ ...at30, grenades: 0, fires: 0, lights: 0 }).toEqual({ ...at11!, grenades: 0, fires: 0, lights: 0 }); // fixed-size pools and lists
    expect(at30.lightPool).toBeLessThanOrEqual(64);
    const sorted = [...tickTimes].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(
      `[endless flow sim] ${world.tick} ticks, waves 11–30, Behemoths at ${bossWaves.join("/")}, max Brutes alive ${maxBrutes}; tick p99 ${p99.toFixed(3)} ms; heap ${heap11.toFixed(1)} MB at wave 11 → ${heap30.toFixed(1)} MB at wave 30`,
    );
    if (g.process?.env.PERF_ASSERT === "1") expect(heap30 - heap11).toBeLessThan(20); // flat memory (behind PERF_ASSERT: GC timing)
  }, 300_000);

  it("(b) wipe: Stay at 10, then the team falls in endless → \"lost\"; earnings before + after the Stay add up", () => {
    const { world, ids } = makeWorld(2, 3, false);
    let lastPhase = "";
    let killsOn = true;
    for (let t = 0; t < 200_000 && world.run.phase !== "results"; t++) {
      const phase = world.run.phase;
      if (phase === "build") for (const id of ids) setBuildReady(world, id, true);
      if (phase === "vote" && lastPhase !== "vote") {
        for (const id of ids) castVote(world, id, "stay");
        killsOn = false; // from now on nobody fights
      }
      lastPhase = phase;
      for (const id of ids) setInput(world, id, { ...NEUTRAL_INPUT, seq: t });
      step(world, TICK_DT_S);
      const z = world.zombies;
      if (killsOn && world.run.phase === "wave" && t % 6 === 0) {
        for (let i = z.aliveCount - 1; i >= 0; i--) {
          const id = z.aliveIds[i] as number;
          if (z.waveZombie[id] === 1) killZombie(world, id, "p0", "pistol");
        }
      }
      if (killsOn && bossBodyOn(world.boss) && world.boss.stateTicks > 40) killBoss(world, "p0", "pistol");
    }
    expect(world.run.phase).toBe("results");
    expect(world.run.endless).toBe(true);
    expect(world.run.ending).toBe("lost");
    expect(world.waves.number).toBeGreaterThan(10);
    for (const id of ids) {
      const p = world.players.get(id)!;
      expect(p.earnedAtEvac).toBeGreaterThan(0); // wave 10's kills, bonus and the boss pay
      expect(p.earnedAtEvac).toBeLessThanOrEqual(p.earned);
    }
  }, 300_000);
});
