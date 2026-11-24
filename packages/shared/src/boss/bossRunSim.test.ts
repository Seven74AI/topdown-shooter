import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { runHeadless } from "../bots/headlessRun";
import { bossDamageStats } from "./bossDamage";
import { BOSS_STATE } from "./bossState";
import { bossStats } from "./telegraph";

/**
 * Story 6.5 (T10, brief 9 / 15): the real 10-wave run (Story 6.1) with its real wave-10 Behemoth and
 * every real system, 4 god-mode bots (brief 15: bot survival is not difficulty evidence; god mode
 * lets them reach wave 10). Liveness: the boss arrived in wave 10, slammed, took damage from ≥ 3
 * sources and died; wave 10 ended only once it was dead (F11); every run held out (Results).
 */
const balance = loadBalance();

describe("Behemoth run sim (Story 6.5)", () => {
  it("4 god-mode bots, the real wave-10 Behemoth: arrives, slams, is hurt by ≥ 3 sources, dies; every run reaches Results", () => {
    bossDamageStats.byWeapon.clear();
    const slams0 = bossStats.slams;
    let arrived = 0;
    let died = 0;
    for (const seed of [1, 2, 3]) {
      let sawBoss = false;
      const r = runHeadless({
        balance,
        seed,
        players: 4,
        god: true,
        setup: (w) => {
          w.events.subscribe((e) => {
            if (e.type === "boss.arrived") {
              sawBoss = true;
              expect(w.waves.number).toBe(10);
            }
            if (e.type === "wave.ended" && e.number === 10) {
              expect(w.boss.state).toBe(BOSS_STATE.DEAD); // F11: only once it is dead
              died++;
            }
          });
        },
      });
      expect(r.timedOut).toBe(false);
      expect(r.heldOut).toBe(true);
      if (sawBoss) arrived++;
    }
    const sources = [...bossDamageStats.byWeapon.entries()].filter(([, v]) => v > 0).map(([k]) => k);
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[boss run sim] arrived in ${arrived}/3 runs, died in ${died}; ${bossStats.slams - slams0} slams; damage by ${sources.join(", ")}`);
    expect(arrived).toBe(3);
    expect(died).toBe(3);
    expect(bossStats.slams - slams0).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThanOrEqual(3);
  }, 600_000);
});
