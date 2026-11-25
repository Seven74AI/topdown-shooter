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
import { BUILD_GRID_M } from "../config/constants";
import { addBuildingAt, removeBuilding } from "../buildings/buildings";
import { lightsOf } from "../decay/lightState";
import { runSupplies } from "../meta/supplies";

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

/**
 * Review M3 (brief 25): every list or pool count that COULD grow over endless, read unmasked at the
 * same phase point (the first tick of a wave) — wave 11 and wave 30 must match.
 */
function sizes(world: World) {
  return {
    lights: world.lights.list.length,
    lightPool: world.lights.pool.length,
    fires: world.decay.fires.length,
    grenades: world.grenades.count,
    spits: world.spits.count,
    acid: world.areas.count,
    gas: world.gas.count,
    molotovs: world.molotovs.areas.count,
    blasts: world.blasts.count,
    buildings: world.buildings.list.length,
    eventHandlers: (world.events as unknown as { handlers: readonly unknown[] }).handlers.length,
    eventsPending: world.events.pendingCount,
    pendingInputs: world.pendingInputs.size,
    lastAppliedSeq: world.lastAppliedSeq.size,
    players: world.players.size,
    zombieCapacity: world.zombies.capacity,
    fixedAtList: world.waves.fixedAtList.length,
    recentSpawns: world.waves.recentSpawns.length,
  };
}

/** p99 of a list of ms values. */
const p99Of = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.99)] ?? 0;
};

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
    const early: number[] = []; // tick ms in waves 11–15
    const late: number[] = []; // tick ms in waves 26–30
    let maxBrutes = 0;
    let at11: ReturnType<typeof sizes> | null = null;
    let at30: ReturnType<typeof sizes> | null = null;
    let heap11 = 0;
    let lightRebuilds0 = 0;
    const capWaves = new Set([16, 17]); // these two waves run up to the 150-alive cap before the kills start
    let capReached = false;
    let peakAlive = 0;
    let floodId = 0;
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
      if (phase === "build" && lastPhase !== "build") {
        // A floodlight for each build phase, gone at the wave start: the light list rebuilds every wave.
        floodId = 9000 + world.waves.number;
        const me = world.players.get(ids[0] as string);
        addBuildingAt(world, { id: floodId, type: "floodlight", ownerId: ids[0] as string, gx: Math.round(((me?.x ?? 24) + 3) / BUILD_GRID_M), gy: Math.round((me?.y ?? 16) / BUILD_GRID_M), rot: 0, hp: balance.buildings.types.floodlight?.hp ?? 1 });
      }
      if (phase === "wave" && lastPhase !== "wave") {
        removeBuilding(world, floodId);
        lightsOf(world);
        capReached = false;
        // The same phase point every wave: its first tick (no rounds, acid or blasts left from the build).
        if (world.waves.number === 11) {
          at11 = sizes(world);
          heap11 = heapMb();
          lightRebuilds0 = world.lights.rebuilds;
        }
        if (world.waves.number === 30) at30 = sizes(world);
      }
      if (phase === "build") for (const id of ids) setBuildReady(world, id, true);
      if (phase === "vote" && lastPhase !== "vote") for (const id of ids) castVote(world, id, world.waves.number < 30 ? "stay" : "extract");
      lastPhase = phase;
      for (const id of ids) setInput(world, id, { ...NEUTRAL_INPUT, seq: t });
      const t0 = g.performance.now();
      step(world, TICK_DT_S);
      const ms = g.performance.now() - t0;
      const n = world.waves.number;
      if (world.run.phase === "wave" && n >= 11 && n <= 15) early.push(ms);
      if (world.run.phase === "wave" && n >= 26 && n <= 30) late.push(ms);
      const z = world.zombies;
      let brutes = 0;
      for (let i = 0; i < z.aliveCount; i++) if (z.type[z.aliveIds[i] as number] === BRUTE) brutes++;
      maxBrutes = Math.max(maxBrutes, brutes);
      if (capWaves.has(n)) {
        peakAlive = Math.max(peakAlive, z.aliveCount);
        if (z.aliveCount >= balance.waves.maxAlive) capReached = true;
      }
      const holdKills = capWaves.has(n) && !capReached;
      if (world.run.phase === "wave" && t % 6 === 0 && !holdKills) {
        for (let i = z.aliveCount - 1; i >= 0; i--) {
          const id = z.aliveIds[i] as number;
          if (z.waveZombie[id] === 1) killZombie(world, id, "p0", "pistol");
        }
      }
      if (bossBodyOn(world.boss) && world.boss.stateTicks > 40) killBoss(world, "p0", "pistol");
    }
    const heap30 = heapMb();
    expect(world.run.phase).toBe("results");
    expect(world.run.ending).toBe("extracted");
    expect(world.waves.number).toBe(30);
    expect(votes).toEqual([10, 15, 20, 25, 30]);
    expect(bossWaves).toEqual([10, 15, 20, 25, 30]); // wave 10 is played (the start wave), then every 5th endless wave
    // F4 / D1: 6,000 × (1 + 0.25 k) at 4 players (k = 0 at wave 10), never × the zombies' hpMult
    expect(bossHp).toEqual([1, 1.25, 1.5, 1.75, 2].map((g) => bossMaxHp(balance, 4, 1, g)));
    // Story 7.2 (T6): every player's run record = the waves and Behemoths that really happened (the run starts at wave
    // 10: 1 run wave, 20 endless waves, 5 Behemoths of which 4 in endless); the extract pays all of it (S4, D5).
    for (const p of world.players.values()) {
      expect([p.wavesIn, p.endlessWavesIn, p.bossesIn, p.endlessBossesIn]).toEqual([1, 20, 5, 4]);
      expect(runSupplies(p, "extracted", 10_000)).toMatchObject({ waves: 10, boss: 50, extract: 100, endless: 400, endlessBoss: 200, total: 760 });
    }
    expect(maxBrutes).toBeLessThanOrEqual(6);
    expect(maxBrutes).toBeGreaterThan(0);
    // Review M3: flat — every growable list the same at the first tick of wave 11 and of wave 30 (unmasked),
    // and the light list really rebuilt in between (a floodlight placed and removed every wave).
    expect(at11).not.toBeNull();
    expect(at30).not.toBeNull();
    // Nothing grew (fires may burn out: ≤, never more), and nothing is unbounded by construction.
    for (const [k, v] of Object.entries(at30 as Record<string, number>)) expect(v, k).toBeLessThanOrEqual((at11 as Record<string, number>)[k] as number);
    expect(at30?.lightPool).toBe(at11?.lightPool);
    expect(world.lights.rebuilds - lightRebuilds0).toBeGreaterThanOrEqual(19 * 2);
    expect(peakAlive).toBe(balance.waves.maxAlive); // some waves ran at the 150-alive cap
    const e99 = p99Of(early);
    const l99 = p99Of(late);
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(
      `[endless flow sim] ${world.tick} ticks, waves 11–30, Behemoths at ${bossWaves.join("/")}, max Brutes alive ${maxBrutes}, peak alive ${peakAlive}; tick p99 waves 11–15 ${e99.toFixed(3)} ms → 26–30 ${l99.toFixed(3)} ms; heap ${heap11.toFixed(1)} MB at wave 11 → ${heap30.toFixed(1)} MB at wave 30`,
    );
    expect(early.length).toBeGreaterThan(1000);
    expect(late.length).toBeGreaterThan(1000);
    if (g.process?.env.PERF_ASSERT === "1") {
      expect(l99).toBeLessThanOrEqual(e99 * 1.5 + 0.2); // flat tick cost (brief 25; timing behind PERF_ASSERT, load < 1)
      expect(heap30 - heap11).toBeLessThan(20); // flat memory (GC timing)
    }
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
      // Story 7.2 (T6, S4): endless waves were counted, and a wipe after Stay loses them: only wave 10 + its boss pay.
      expect(p.endlessWavesIn).toBeGreaterThanOrEqual(1);
      expect(runSupplies(p, "lost", 10_000)).toMatchObject({ endless: 0, endlessBoss: 0, extract: 0, total: p.wavesIn * 10 + Math.min(p.bossesIn - p.endlessBossesIn, 1) * 50 });
    }
  }, 300_000);
});
