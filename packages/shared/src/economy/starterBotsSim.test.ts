/**
 * Story 7.4 (T5): four starter-only bots (a new player's pool) still play a whole 10-wave run: waves end and cards
 * are bought from the starter deck. Story 7.5 (Beat the rule 6): the same seed with every bot at Training 5 vs 0 is
 * logged for the balance read (log only, no assert: brief 15 / R7 — bots are not difficulty evidence).
 */
import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { formatRunLine, runHeadless } from "../bots/headlessRun";
import { STARTER_ONLY, inPool } from "../meta/pool";
import type { TrainingLevels } from "../meta/training";

const balance = loadBalance();
const info = (msg: string): void => (globalThis as unknown as { console: { info(m: string): void } }).console.info(msg);
const T5: TrainingLevels = { maxHp: 5, damage: 5, startMoney: 5, reload: 5 };

describe("Story 7.4 T5: starter-only bots", () => {
  it("4 bots on the starter pool play all 10 waves (god mode) and buy only starter cards", { timeout: 240_000 }, () => {
    let masks: number[] = [];
    const r = runHeadless({ balance, seed: 1234, players: 4, god: true, inits: Array.from({ length: 4 }, () => ({ unlocks: STARTER_ONLY })), onEnd: (w) => void (masks = [...w.players.values()].map((p) => p.unlocks)) });
    expect(masks).toEqual([0, 0, 0, 0]);
    expect(r.timedOut).toBe(false);
    expect(r.wavesCleared).toBe(10); // liveness: every wave ended
    const bought = r.purchases.flat();
    expect(bought.length).toBeGreaterThan(0); // liveness: cards / items really bought
    for (const b of bought) expect(inPool(STARTER_ONLY, b.split("@")[0] as string), b).toBe(true);
    info(`starter bots: ${formatRunLine(r)}`);
  });

  it("Training 5 vs 0 on the same seed (log only, brief 15)", { timeout: 240_000 }, () => {
    const t0 = runHeadless({ balance, seed: 77, players: 4 });
    const t5 = runHeadless({ balance, seed: 77, players: 4, inits: Array.from({ length: 4 }, () => ({ training: T5 })) });
    expect(t0.wallet.length).toBe(4);
    info(`training 0: ${formatRunLine(t0)}`);
    info(`training 5: ${formatRunLine(t5)}`);
  });
});
