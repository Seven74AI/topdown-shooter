import { describe, expect, it } from "vitest";
import type { RunRewards } from "@topdown/shared";
import { REWARD_GROUPS, REWARDS_TEXT, RW_BTN_H, RW_TEXT_PX, layoutResults, rewardsView, type Box } from "./rewardsModel";

/** Story 7.2 (AC 5, brief 26, R9): the Run rewards panel's content and the Results layout. */
const msg = (over: Partial<RunRewards> = {}): RunRewards => ({
  runId: "0f1e2d3c-4b5a-4968-8776-655443322110",
  seed: 2207,
  status: "saved",
  lines: { waves: 90, boss: 50, extract: 100, endless: 0, endlessBoss: 0 },
  waveCount: 9,
  endlessWaveCount: 0,
  rookie: false,
  total: 240,
  newTotal: 1240,
  ...over,
});

describe("Story 7.2: rewardsView", () => {
  it("saved: +N headline, the breakdown rows in order (zero lines hidden, waves always), the account total", () => {
    const v = rewardsView(msg(), true, 2207);
    expect(v.state).toBe("saved");
    expect(v.headline).toBe("+240");
    expect(v.lines.map((l) => [l.label, l.amount])).toEqual([
      ["Waves 9 × 10", 90],
      ["Behemoth", 50],
      ["Extract", 100],
    ]);
    expect(v.lines.find((l) => l.key === "extract")?.frac).toBe(1);
    expect(v.total).toBe("1,240");
    expect(v.rookie).toBe(false);
    expect(v.status).toBe("");
  });

  it("review L3 (B9): a saved run with 0 waves still lists the Waves line (Waves 0 × 10, +0)", () => {
    const v = rewardsView(msg({ lines: { waves: 0, boss: 0, extract: 0, endless: 0, endlessBoss: 0 }, waveCount: 0, total: 0 }), true, 2207);
    expect(v.lines.map((l) => [l.label, l.amount])).toEqual([["Waves 0 × 10", 0]]);
    expect(v.headline).toBe("+0");
  });

  it("review L4 (B5): a seat that banked on a Leave and came back reads 'Banked when you left (wave N)'; otherwise no note", () => {
    expect(rewardsView(msg({ ending: "quit", leftWave: 4 }), true, 2207).note).toBe("Banked when you left (wave 4)");
    expect(rewardsView(msg({ ending: "quit", leftWave: 1 }), true, 2207).note).toBe("Banked when you left (wave 1)"); // N-R1
    expect(rewardsView(msg({ ending: "quit", leftWave: 0 }), true, 2207).note).toBe("Banked when you left (before wave 1)"); // N-R2
    expect(rewardsView(msg({ ending: "extracted", leftWave: 0 }), true, 2207).note).toBe("");
    expect(rewardsView(msg(), true, 2207).note).toBe(""); // an older server without the fields
  });

  it("S5: the rookie badge shows when the server says so; the lines stay unscaled", () => {
    const v = rewardsView(msg({ rookie: true, total: 480 }), true, 2207);
    expect(v.rookie).toBe(true);
    expect(v.headline).toBe("+480");
    expect(v.lines[0]?.amount).toBe(90);
  });

  it("endless lines appear on an extract with endless waves", () => {
    const v = rewardsView(msg({ lines: { waves: 100, boss: 50, extract: 100, endless: 60, endlessBoss: 50 }, waveCount: 10, endlessWaveCount: 3 }), true, 2207);
    expect(v.lines.map((l) => l.label)).toEqual(["Waves 10 × 10", "Behemoth", "Extract", "Endless 3×20", "Endless boss"]);
  });

  it("states: Saving… (nothing yet, or another run's seed), Couldn't save, Not saved, Practice", () => {
    expect(rewardsView(null, true, 2207)).toMatchObject({ state: "saving", status: REWARDS_TEXT.saving });
    expect(rewardsView(msg({ seed: 99 }), true, 2207)).toMatchObject({ state: "saving" });
    expect(rewardsView(msg({ status: "failed" }), true, 2207)).toMatchObject({ state: "failed", status: "Couldn't save this run", lines: [] });
    expect(rewardsView(msg({ status: "not_saved" }), true, 2207)).toMatchObject({ state: "not_saved", status: "Not saved (playing offline from your progress)" });
    expect(rewardsView(msg(), false, 2207)).toMatchObject({ state: "practice", status: "Practice runs don't earn rewards" });
  });

  it("S7 / D1: practice solo never shows Supplies, even if a message is in the store", () => {
    expect(rewardsView(msg(), false, 2207).headline).toBe("");
  });

  it("brief 26: the row groups are in the fixed order supplies, items, unlocks, nudge", () => {
    expect(REWARD_GROUPS).toEqual(["supplies", "items", "unlocks", "nudge"]);
    expect(rewardsView(null, true, 1).groups).toEqual(REWARD_GROUPS);
  });
});

describe("Story 7.2 (R9): the Results layout at 568×320, 640×360, 800×360, 844×390 with insets 44/21", () => {
  const SIZES = [
    [568, 320],
    [640, 360],
    [800, 360],
    [844, 390],
  ] as const;
  const INSET = { left: 44, right: 44, bottom: 21 };
  const inside = (b: Box, w: number, h: number) => b.x >= INSET.left - 1e-6 && b.x + b.w <= w - INSET.right + 1e-6 && b.y >= 0 && b.y + b.h <= h - INSET.bottom + 1e-6;
  const contains = (o: Box, i: Box) => i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h;
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  for (const [w, h] of SIZES) {
    it(`${w}×${h}: both cards inside the safe area, side by side without overlap; the button ≥ 44 px inside the team card`, () => {
      const l = layoutResults(w, h, INSET);
      expect(inside(l.team, w, h)).toBe(true);
      expect(inside(l.rewards, w, h)).toBe(true);
      expect(overlaps(l.team, l.rewards)).toBe(false);
      expect(l.rewards.x).toBeGreaterThan(l.team.x);
      expect(contains(l.team, l.button)).toBe(true);
      expect(l.button.h).toBeGreaterThanOrEqual(44);
      expect(l.button.w).toBeGreaterThanOrEqual(44);
      expect(l.rewards.w).toBeGreaterThanOrEqual(220); // the 568 card in the RW1 sheet is ~236 px wide
      expect(l.rewards.h).toBeGreaterThanOrEqual(280);
    });
  }

  it("a fine width sweep (1 px, 568 → 1400) keeps every rule, and the cards stay centred and capped at 760", () => {
    for (let w = 568; w <= 1400; w++) {
      const l = layoutResults(w, 320, INSET);
      expect(inside(l.team, w, 320) && inside(l.rewards, w, 320)).toBe(true);
      expect(overlaps(l.team, l.rewards)).toBe(false);
      const span = l.rewards.x + l.rewards.w - l.team.x;
      expect(span).toBeLessThanOrEqual(760 + 1e-6);
      expect(Math.abs(l.team.x - (w - (l.rewards.x + l.rewards.w)))).toBeLessThan(1e-6); // centred
    }
  });

  it("text ≥ 11 px everywhere; the button is RW_BTN_H (44)", () => {
    expect(Math.min(...Object.values(RW_TEXT_PX))).toBeGreaterThanOrEqual(11);
    expect(RW_BTN_H).toBe(44);
  });
});

describe("Story 7.2 (AC 7): the vote line", () => {
  it("reads 'Extract now: +100 · Stay: +20 a wave, lost if you wipe' from progression.json", async () => {
    const { voteStakesLine } = await import("./EvacVote");
    expect(voteStakesLine()).toBe("Extract now: +100 · Stay: +20 a wave, lost if you wipe");
    expect(voteStakesLine({ extract: 7, perEndlessWave: 3 } as never)).toBe("Extract now: +7 · Stay: +3 a wave, lost if you wipe");
  });
});
