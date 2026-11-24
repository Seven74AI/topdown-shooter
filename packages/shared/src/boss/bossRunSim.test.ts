import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { runHeadless } from "../bots/headlessRun";
import { bossDamageStats } from "./bossDamage";
import { bossStats } from "./telegraph";

/**
 * Story 6.5 (T10, brief 9 / 15): the real run with bots and `DEV_BOSS_WAVES=3` (the 6-wave run until
 * 6.1 makes it 10), every real system. Liveness: the boss arrived, slammed, and took damage from ≥ 3
 * sources; every run ends in Results (no stuck run); a boss wave ends only once its boss is dead.
 * Bot survival is not difficulty evidence (brief 15): the boss's HP is scaled to 0.15 (`?bosshp`) so
 * some runs get past it and the wave-end rule is exercised.
 */
const balance = loadBalance();

describe("Behemoth run sim (Story 6.5)", () => {
  it("4 bots, boss in wave 3: arrives, slams, is hurt by ≥ 3 sources; every run reaches Results", () => {
    bossDamageStats.byWeapon.clear();
    const slams0 = bossStats.slams;
    let arrived = 0;
    let bossWaveCleared = 0;
    for (const seed of [1, 2, 3]) {
      let sawBoss = false;
      let ended = false;
      const r = runHeadless({
        balance,
        seed,
        players: 4,
        setup: (w) => {
          w.debug.bossWaves = [3];
          w.debug.bossHpScale = 0.15;
          w.events.subscribe((e) => {
            if (e.type === "boss.arrived") sawBoss = true;
            if (e.type === "wave.ended" && e.number === 3) {
              ended = true;
              expect(w.boss.state === 8 || w.boss.state === 0).toBe(true); // F11: only once it is dead
            }
          });
        },
      });
      expect(r.timedOut).toBe(false);
      expect(r.heldOut !== r.wiped).toBe(true);
      if (r.reached >= 3) expect(sawBoss).toBe(true);
      if (sawBoss) arrived++;
      if (ended) bossWaveCleared++;
    }
    const sources = [...bossDamageStats.byWeapon.entries()].filter(([, v]) => v > 0).map(([k]) => k);
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[boss run sim] arrived in ${arrived}/3 runs, wave 3 cleared in ${bossWaveCleared}; ${bossStats.slams - slams0} slams; damage by ${sources.join(", ")}`);
    expect(arrived).toBeGreaterThan(0);
    expect(bossStats.slams - slams0).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThanOrEqual(3);
  }, 300_000);
});
