import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { runHeadless } from "../bots/headlessRun";
import { holdPlayer, returnPlayer } from "./hold";
import type { World } from "../core/world";

const balance = loadBalance();

/**
 * Story 8.1 (T8, brief 6): the whole 10-wave run with one bot dropping twice mid-wave (held 30 s
 * each time, then back next to a teammate): every wave still ends and the team extracts. God mode
 * (as the Story 6.1 earnings sim) so the bots' own deaths can't end the run. Liveness: both holds
 * really happened mid-wave, and the held bot was really out of the World meanwhile.
 */
describe("Story 8.1 10-wave run with one bot dropping twice", () => {
  it("all waves end; the bot was held twice and is back at the end; nothing stays on hold", () => {
    const HOLD_TICKS = 30 * 20;
    const holds: { wave: number; at: number }[] = [];
    let heldSince = -1;
    let missingTicks = 0;
    const onTick = (w: World): void => {
      if (heldSince >= 0) {
        if (w.players.has("p1")) throw new Error("held player visible in the World");
        missingTicks++;
        if (w.tick - heldSince >= HOLD_TICKS || w.run.phase !== "wave") {
          returnPlayer(w, "p1");
          heldSince = -1;
        }
        return;
      }
      const wave = w.waves.number;
      if (w.run.phase === "wave" && (wave === 3 || wave === 7) && !holds.some((h) => h.wave === wave) && w.waves.remaining > 5) {
        if (holdPlayer(w, "p1")) {
          holds.push({ wave, at: w.tick });
          heldSince = w.tick;
        }
      }
    };
    let end: World | null = null;
    const log = runHeadless({ balance, seed: 8101, players: 4, god: true, onTick, onEnd: (w) => (end = w) });
    expect(holds.map((h) => h.wave)).toEqual([3, 7]);
    expect(missingTicks).toBeGreaterThan(HOLD_TICKS); // really out of the World for > 30 s in total
    expect(log.wavesCleared).toBeGreaterThanOrEqual(balance.waves.runWaves);
    expect(log.ending).toBe("extracted");
    const w = end as unknown as World;
    expect(w.heldPlayers.size).toBe(0);
    expect(w.players.has("p1")).toBe(true);
  }, 120_000);
});
