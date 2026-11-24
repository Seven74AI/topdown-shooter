import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { createWorld, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { applyStartWave } from "../run/devStartWave";
import { startBuild, startWave } from "../run/runStateMachine";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { zombieTypeIndex } from "../zombies/zombieTypes";
import { endlessBrutes, waveHpMult, waveMixOf, waveSize } from "./waveDirector";
import { bossMaxHp, endlessBossHpMult, isBossWave } from "../boss/bossState";
import { bossGapTicks, bossTicks, recoverTicks, telegraphTicks, windupTicks } from "../boss/telegraph";
import { BOSS_ATTACK } from "../boss/bossState";

/**
 * Story 6.12 (F1–F4): endless waves grow by numbers you can count — size, mix, HP, Brutes, the
 * Behemoth's HP — and waves 1–10 are untouched (`endless` false and true alike).
 */
const balance = loadBalance();
const BRUTE = zombieTypeIndex("brute");

describe("Story 6.12 F1: endless wave sizes", () => {
  it("min(N × 40, 600) × the party scale; waves ≤ 10 unchanged by the flag", () => {
    const scales = balance.waves.playerCountScale;
    for (let n = 11; n <= 30; n++) {
      for (let p = 1; p <= 4; p++) {
        expect(waveSize(balance, n, p, true), `wave ${n} ${p}p`).toBe(Math.max(1, Math.round(Math.min(n * 40, 600) * (scales[p - 1] as number))));
      }
    }
    expect(waveSize(balance, 11, 4, true)).toBe(440);
    expect(waveSize(balance, 15, 4, true)).toBe(600);
    expect(waveSize(balance, 16, 4, true)).toBe(600);
    expect(waveSize(balance, 30, 4, true)).toBe(600);
    expect(waveSize(balance, 30, 4, false)).toBe(1200); // no Stay: the old formula (never played: a vote ends the run)
    for (let n = 1; n <= 10; n++) for (let p = 1; p <= 4; p++) expect(waveSize(balance, n, p, true)).toBe(waveSize(balance, n, p, false));
  });

  it("D5: odd endless waves use wave 9's mix, even waves wave 10's; waves ≤ 10 their own", () => {
    for (let n = 11; n <= 30; n++) expect(waveMixOf(balance, n, true)).toBe(balance.waves.mix[n % 2 === 1 ? 8 : 9]);
    for (let n = 1; n <= 10; n++) expect(waveMixOf(balance, n, true)).toBe(waveMixOf(balance, n, false));
  });
});

describe("Story 6.12 F2: HP growth past wave 15 (one multiply at spawn)", () => {
  it("hpMult 1 up to 15, then +6 % per wave", () => {
    for (let n = 1; n <= 15; n++) expect(waveHpMult(balance, n, true)).toBe(1);
    expect(waveHpMult(balance, 16, true)).toBeCloseTo(1.06, 10);
    expect(waveHpMult(balance, 20, true)).toBeCloseTo(1.3, 10);
    expect(waveHpMult(balance, 25, true)).toBeCloseTo(1.6, 10);
    expect(waveHpMult(balance, 25, false)).toBe(1);
  });

  it("a Walker spawned in wave 20 has 1.3 × HP; any zombie spawned in that wave too (stampede/Crawler path: spawnZombie)", () => {
    const world = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: { zombies: () => {} } });
    addPlayer(world, "p0", 24, 16);
    applyStartWave(world, 20);
    startBuild(world);
    startWave(world);
    expect(world.waves.hpMult).toBeCloseTo(1.3, 10);
    const w = spawnZombie(world, "walker", 10, 10);
    const c = spawnZombie(world, "crawler", 11, 10);
    expect(world.zombies.hp[w]).toBeCloseTo(balance.zombies.types.walker!.hp * 1.3, 4);
    expect(world.zombies.hp[c]).toBeCloseTo(balance.zombies.types.crawler!.hp * 1.3, 4);
    // the wave's own spawns too
    for (let i = 0; i < 10; i++) step(world, TICK_DT_S);
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      if (z.waveZombie[id] !== 1) continue;
      const type = Object.keys(balance.zombies.types).find((k) => zombieTypeIndex(k as "walker") === z.type[id]) as string;
      expect(z.hp[id]).toBeCloseTo((balance.zombies.types[type]?.hp ?? 0) * 1.3, 3);
    }
  });

  it("waves 1–10 spawn at the normal HP in a run that later goes endless", () => {
    const world = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: { zombies: () => {} } });
    addPlayer(world, "p0", 24, 16);
    applyStartWave(world, 10);
    world.run.endless = true; // even with the flag on
    startBuild(world);
    startWave(world);
    expect(world.waves.hpMult).toBe(1);
  });
});

/** Runs endless wave `n` with `players` players to its end, killing by `kill(world)` each tick; returns per-tick Brute counts. */
function runWave(n: number, players: number, kill: (world: World, t: number) => void) {
  const world = createWorld({ balance, seed: 5, map: DOWNTOWN_MAP, systems: { zombies: () => {}, boss: () => {} } });
  world.debug.godMode = true;
  for (let i = 0; i < players; i++) addPlayer(world, `p${i}`, 22 + i * 2, 16);
  applyStartWave(world, n);
  startBuild(world);
  startWave(world);
  let maxBrutes = 0;
  let t = 0;
  for (; t < 60_000 && world.run.phase === "wave"; t++) {
    step(world, TICK_DT_S);
    const z = world.zombies;
    let brutes = 0;
    for (let i = 0; i < z.aliveCount; i++) if (z.type[z.aliveIds[i] as number] === BRUTE) brutes++;
    maxBrutes = Math.max(maxBrutes, brutes);
    kill(world, t);
  }
  return { world, maxBrutes, ticks: t };
}

describe("Story 6.12 F3: one more Brute each wave, never more than 6 at once (D2)", () => {
  it("counts: wave 11 = 3, 14 = 6, 20 = 12, not scaled by party size; none in waves ≤ 10 by this rule", () => {
    expect(endlessBrutes(balance, 11, true)).toBe(3);
    expect(endlessBrutes(balance, 14, true)).toBe(6);
    expect(endlessBrutes(balance, 20, true)).toBe(12);
    expect(endlessBrutes(balance, 30, true)).toBe(22);
    expect(endlessBrutes(balance, 10, true)).toBe(0);
    expect(endlessBrutes(balance, 20, false)).toBe(0);
  });

  it("wave 19 (solo and 4p; 20 is a Behemoth wave): all 11 Brutes spawn, never more than 6 alive on any tick, the wave ends only after all of them died", () => {
    for (const players of [1, 4]) {
      let brutesKilled = 0;
      // Kill every non-Brute at once; kill one Brute every 200 ticks (slowly: the cap must hold the rest back).
      const r = runWave(19, players, (world, t) => {
        const z = world.zombies;
        for (let i = z.aliveCount - 1; i >= 0; i--) {
          const id = z.aliveIds[i] as number;
          if (z.type[id] !== BRUTE) killZombie(world, id, "p0", "pistol");
        }
        if (t % 200 === 199) {
          for (let i = z.aliveCount - 1; i >= 0; i--) {
            const id = z.aliveIds[i] as number;
            if (z.type[id] === BRUTE) {
              killZombie(world, id, "p0", "pistol");
              brutesKilled++;
              break;
            }
          }
        }
      });
      expect(r.world.run.phase, `${players}p`).toBe("build"); // the wave ended
      expect(r.maxBrutes, `${players}p`).toBe(6); // the cap was reached and held
      expect(brutesKilled, `${players}p`).toBe(11);
      expect(r.world.waves.number).toBe(19);
    }
  });

  it("thresholds between 25 % and 90 % of the wave (never in the opening burst)", () => {
    const world = createWorld({ balance, seed: 5, map: DOWNTOWN_MAP, systems: { zombies: () => {}, boss: () => {} } });
    world.debug.godMode = true;
    addPlayer(world, "p0", 22, 16);
    addPlayer(world, "p1", 24, 16);
    applyStartWave(world, 13);
    startBuild(world);
    startWave(world);
    const at: number[] = [];
    world.events.subscribe((e) => {
      if (e.type === "zombie.brute_spawned") at.push(world.waves.size - world.waves.queued);
    });
    for (let t = 0; t < 40_000 && world.run.phase === "wave"; t++) {
      step(world, TICK_DT_S);
      const z = world.zombies;
      for (let i = z.aliveCount - 1; i >= 0; i--) killZombie(world, z.aliveIds[i] as number, "p0", "pistol");
    }
    const size = waveSize(balance, 13, 2, true);
    expect(at.length).toBe(5);
    for (const a of at) {
      expect(a).toBeGreaterThanOrEqual(Math.round(size * 0.25));
      expect(a).toBeLessThanOrEqual(Math.round(size * 0.9) + 2); // + the batch it came in
    }
    expect(at[0]).toBeLessThan(at[4] as number); // spread
  });
});

describe("Story 6.12 F4: a Behemoth every 5th endless wave, tougher each time, fighting the same", () => {
  it("boss waves: 10, then 15, 20, 25 in endless only", () => {
    const waves = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(waves.filter((w) => isBossWave(balance, w))).toEqual([10]);
    expect(waves.filter((w) => isBossWave(balance, w, true))).toEqual([10, 15, 20, 25, 30]);
  });

  it("HP 6,000 × 1.25 / 1.5 / 1.75 × the party scale; the zombies' hpMult never applies (D1)", () => {
    expect(endlessBossHpMult(balance, 10, true)).toBe(1);
    expect(endlessBossHpMult(balance, 15, true)).toBe(1.25);
    expect(endlessBossHpMult(balance, 20, true)).toBe(1.5);
    expect(endlessBossHpMult(balance, 25, true)).toBe(1.75);
    expect(endlessBossHpMult(balance, 25, false)).toBe(1);
    expect(bossMaxHp(balance, 4, 1, endlessBossHpMult(balance, 25, true))).toBe(Math.round(balance.boss.hp * 1.75));
    expect(bossMaxHp(balance, 2, 1, 1.5)).toBe(Math.round(balance.boss.hp * 1.5 * (balance.waves.playerCountScale[1] as number)));
  });

  it("brief 21e: telegraph, windup, recovery and gap ticks at wave 25 (endless) equal wave 10's, enraged or not, 1–4 players", () => {
    const table = (wave: number, endless: boolean, players: number, enraged: boolean) => {
      const world = createWorld({ balance, seed: 9, map: DOWNTOWN_MAP });
      for (let i = 0; i < players; i++) addPlayer(world, `p${i}`, 20 + i * 2, 16);
      applyStartWave(world, wave);
      world.run.endless = endless;
      startBuild(world);
      startWave(world);
      world.boss.enraged = enraged;
      const kinds = [BOSS_ATTACK.SLAM, BOSS_ATTACK.CHARGE, BOSS_ATTACK.THROW];
      return {
        tele: kinds.map((k) => telegraphTicks(world, k)),
        wind: kinds.map((k) => windupTicks(world, k)),
        rec: kinds.map((k) => recoverTicks(world, k)),
        gap: bossGapTicks(world),
        cd: bossTicks(world, balance.boss.slam.cooldownS, "cooldown"),
      };
    };
    for (let p = 1; p <= 4; p++) {
      for (const enraged of [false, true]) {
        const base = table(10, false, p, enraged);
        expect(base.tele.every((t) => t > 0)).toBe(true);
        expect(table(25, true, p, enraged), `${p}p enraged ${enraged}`).toEqual(base);
        expect(table(15, true, p, enraged)).toEqual(base);
      }
    }
  });
});
