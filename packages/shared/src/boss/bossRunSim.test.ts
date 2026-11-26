import { beforeAll, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { runHeadless } from "../bots/headlessRun";
import { bossDamageStats } from "./bossDamage";
import { BOSS_STATE } from "./bossState";
import { bossStats } from "./telegraph";

/**
 * Story 6.5 (T10, brief 9 / 15): the real 10-wave run (Story 6.1) with its real wave-10 Behemoth and
 * every real system, 4 god-mode bots (brief 15: bot survival is not difficulty evidence; god mode
 * lets them reach wave 10). Liveness: the boss arrived in wave 10, slammed, took damage from ≥ 3
 * sources and died; wave 10 ended only once it was dead (F11); every run extracted (Results).
 */
const balance = loadBalance();

describe("Behemoth run sim (Story 6.5)", () => {
  describe("4 god-mode bots, the real wave-10 Behemoth: arrives, slams, is hurt by ≥ 3 sources, dies; every run reaches Results", () => {
    // E8-A8 (no test over 30 s; was 26 s in CI): one test per seed, then the totals. Same runs, order and assertions as
    // the old single test; the shared counters and the boss-stat baselines (beforeAll) need every seed test to have run.
    let slams0 = 0;
    const atk0 = { charges: 0, throws: 0 };
    beforeAll(() => {
      bossDamageStats.byWeapon.clear();
      slams0 = bossStats.slams;
      atk0.charges = bossStats.charges;
      atk0.throws = bossStats.throws;
    });
    let arrived = 0;
    let died = 0;
    let enraged = 0;
    let dropped = 0;
    let killed = 0;
    let paidOk = 0;
    let casesRun = 0;
    it.each([1, 2, 3])("seed %i", (seed) => {
      let sawBoss = false;
      const paid = new Map<string, number>();
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
            // Stories 6.6 + 6.7: it charged / threw, enraged, dropped Crawlers, died and paid everyone 150.
            if (e.type === "boss.enraged") enraged++;
            if (e.type === "boss.crawler_dropped") dropped++;
            if (e.type === "boss.killed") killed++;
            if (e.type === "money.earned" && e.reason === "boss") paid.set(e.playerId, (paid.get(e.playerId) ?? 0) + e.amount);
            if (e.type === "wave.ended" && e.number === 10) {
              expect(w.boss.state).toBe(BOSS_STATE.DEAD); // F11: only once it is dead
              died++;
            }
          });
        },
      });
      expect(r.timedOut).toBe(false);
      expect((r.ending === "extracted")).toBe(true);
      if (sawBoss) arrived++;
      if (paid.size === 4 && [...paid.values()].every((v) => v === balance.boss.killPay)) paidOk++;
      casesRun++;
    }, 120_000);

    it("the 3 seeds together: it arrived, slammed, was hurt by ≥ 3 sources, charged or threw, enraged, dropped Crawlers, died and paid", () => {
      expect(casesRun, "every case above ran and passed").toBe(3);
      const sources = [...bossDamageStats.byWeapon.entries()].filter(([, v]) => v > 0).map(([k]) => k);
      (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[boss run sim] arrived in ${arrived}/3 runs, died in ${died}; ${bossStats.slams - slams0} slams; damage by ${sources.join(", ")}`);
      expect(arrived).toBe(3);
      expect(died).toBe(3);
      expect(bossStats.slams - slams0).toBeGreaterThan(0);
      expect(sources.length).toBeGreaterThanOrEqual(3);
      (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
        `[boss run sim] 6.6/6.7: ${bossStats.charges - atk0.charges} charges, ${bossStats.throws - atk0.throws} throws, ${enraged} roars, ${dropped} Crawlers dropped, ${killed} killed, paid 150 × 4 in ${paidOk}/3`,
      );
      expect(bossStats.charges - atk0.charges + bossStats.throws - atk0.throws).toBeGreaterThan(0);
      expect(enraged).toBe(3);
      expect(dropped).toBeGreaterThanOrEqual(1);
      expect(killed).toBe(3);
      expect(paidOk).toBe(3);
    });
  });
});
