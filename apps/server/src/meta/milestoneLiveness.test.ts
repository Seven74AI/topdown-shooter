import { describe, expect, it } from "vitest";
import { hadWave, loadBalance, runHeadless, type World } from "@topdown/shared";
import { milestonesReached } from "./milestones";
import { runFacts, statsDelta } from "./runMeta";

/**
 * Story 7.11 (AC 11, brief 9 liveness): the real 10-wave run with bots (god mode: every wave is played, nobody goes
 * down) — every bot's record really reaches M1 (wave 5), M2 (the extract from Downtown), M3 (the Behemoth died while in)
 * and M10 (waves 1–10, never downed); kills and runs really count; nobody gets M8 with two players.
 */
const balance = loadBalance();

describe("Story 7.11: milestones in a real run", () => {
  it("2 bots, 10 waves, extract: M1, M2, M3, M10 for both; kills > 0; 1 run each; no M8", () => {
    let world: World | null = null;
    const r = runHeadless({ balance, seed: 4, players: 2, god: true, onEnd: (w) => (world = w) });
    expect(r.timedOut).toBe(false);
    const w = world as unknown as World;
    expect(w.run.ending).toBe("extracted");
    const facts = runFacts(w, "downtown");
    for (const p of w.players.values()) {
      expect(hadWave(p.waveMask, 5)).toBe(true);
      const stats = statsDelta(p);
      expect(stats.runs).toBe(1);
      expect(stats.kills).toBeGreaterThan(0);
      const got = milestonesReached({ waveMask: p.waveMask, bossKilledWhileIn: p.bossesIn > 0, extracted: true, district: facts.district, extractedAllFour: facts.extractedAllFour, downsWaves1to10: p.downs10 }, stats);
      expect(got, p.id).toEqual(expect.arrayContaining(["m1", "m2", "m3", "m10"]));
      expect(got).not.toContain("m8");
    }
  }, 240_000);
});
