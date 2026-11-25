import { PROGRESSION, type RunRewards } from "@topdown/shared";
import { formatSupplies } from "../net/rewardsStore";

/**
 * Story 7.2 (AC 5, brief 26, layout RW1 in Lumen LF5): what the Results "Run rewards" panel shows, and where the two
 * Results cards sit. Pure (tested); `ResultsScreen.tsx` draws it and `overlay.css › .rw*` uses exactly these numbers
 * (cross-checked in tools/checks/resultsLayoutCss.test.ts).
 *
 * Panel rows, FIXED ORDER (later stories append inside their group, never reorder; an empty group takes no space):
 *   1. supplies — "+N Supplies", the breakdown rows, the "Rookie bonus × 2" badge, "Total"; or one status line;
 *   2. items    — 7.11 "New item: …" (M1–M10 order), then 7.12 "Found in wave N: …" / "Collector";
 *   3. unlocks  — 7.4 "You used the <weapon>: unlock it for <price>", 7.7 "Unlocked: District 2";
 *   4. nudge    — 7.6 "Save my progress".
 */
export type RewardsState = "saving" | "saved" | "failed" | "not_saved" | "practice";

export const REWARDS_TEXT = {
  saving: "Saving…",
  failed: "Couldn't save this run",
  not_saved: "Not saved (playing offline from your progress)",
  practice: "Practice runs don't earn rewards",
} as const;

export interface RewardLine {
  readonly key: "waves" | "boss" | "extract" | "endless" | "endlessBoss";
  readonly label: string;
  readonly amount: number;
  /** Bar fill 0–1: the line's share of the biggest line. */
  readonly frac: number;
}

export interface RewardsView {
  readonly state: RewardsState;
  /** "+500" (saved only). */
  readonly headline: string;
  readonly lines: readonly RewardLine[];
  readonly rookie: boolean;
  /** The account's Supplies after this run, "1,240" (saved only). */
  readonly total: string;
  /** The status line for every state but `saved` ("" when saved). */
  readonly status: string;
  /** Review L4: "Banked when you left (wave N)" when this seat banked on a Leave and came back ("" otherwise). */
  readonly note: string;
  /** Brief 26: the four row groups in their fixed order; groups 2–4 are filled by later stories. */
  readonly groups: readonly ["supplies", "items", "unlocks", "nudge"];
}

export const REWARD_GROUPS = ["supplies", "items", "unlocks", "nudge"] as const;

/**
 * The panel for this Results screen: `online` false = practice solo (decision 7.2 D1: banks nothing, says so);
 * `rewards` null = not arrived yet ("Saving…"); a message whose seed is not this run's is treated as not arrived.
 */
export function rewardsView(rewards: RunRewards | null, online: boolean, seed: number, cfg = PROGRESSION.supplies): RewardsView {
  const base = { headline: "", lines: [] as RewardLine[], rookie: false, total: "", note: "", groups: REWARD_GROUPS };
  if (!online) return { ...base, state: "practice", status: REWARDS_TEXT.practice };
  if (rewards === null || rewards.seed !== seed) return { ...base, state: "saving", status: REWARDS_TEXT.saving };
  if (rewards.status !== "saved") return { ...base, state: rewards.status, status: REWARDS_TEXT[rewards.status] };
  const l = rewards.lines;
  const all: RewardLine[] = [
    { key: "waves", label: `Waves ${rewards.waveCount} × ${cfg.perWave}`, amount: l.waves, frac: 0 },
    { key: "boss", label: "Behemoth", amount: l.boss, frac: 0 },
    { key: "extract", label: "Extract", amount: l.extract, frac: 0 },
    { key: "endless", label: `Endless ${rewards.endlessWaveCount}×${cfg.perEndlessWave}`, amount: l.endless, frac: 0 },
    { key: "endlessBoss", label: "Endless boss", amount: l.endlessBoss, frac: 0 },
  ];
  const shown = all.filter((x) => x.key === "waves" || x.amount > 0);
  const max = Math.max(1, ...shown.map((x) => x.amount));
  return {
    ...base,
    state: "saved",
    headline: `+${formatSupplies(rewards.total)}`,
    lines: shown.map((x) => ({ ...x, frac: x.amount / max })),
    rookie: rewards.rookie,
    total: formatSupplies(rewards.newTotal),
    status: "",
    // Review L4 / re-review N-R2: a Leave before wave 1 started (leftWave 0) still says when it banked.
    note: rewards.ending === "quit" ? ((rewards.leftWave ?? 0) > 0 ? `Banked when you left (wave ${rewards.leftWave})` : "Banked when you left (before wave 1)") : "",
  };
}

/** "+100" for a breakdown amount. */
export const lineAmount = (n: number): string => `+${formatSupplies(n)}`;

// ---------------------------------------------------------------------------------------------------------------
// Layout (R9: 568×320, 640×360, 800×360, 844×390 with insets 44/21: no overlap, inside the safe area, text ≥ 11 px)
// ---------------------------------------------------------------------------------------------------------------

/** Space around the cards (px), on top of the safe-area insets. */
export const RW_PAD = 8;
/** Between the two cards. */
export const RW_GAP = 8;
/** The two cards together are never wider than this (centred on wide screens). */
export const RW_MAX_W = 760;
/** The Back to lobby / Restart button. */
export const RW_BTN_H = 44;
export const RW_BTN_MIN_W = 160;
/** Text sizes used by the panel (px): the smallest is the label size; R9 asks ≥ 11. */
export const RW_TEXT_PX = { label: 11, line: 13, head: 20, big: 40, total: 22 } as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ResultsLayout {
  team: Box;
  rewards: Box;
  button: Box;
}

/**
 * The Results cards: the team card (title, table, button) left, the Run rewards card right, each half of the safe
 * area (minus the gap), at most RW_MAX_W together; full height of the safe area minus RW_PAD. The button sits at the
 * team card's bottom-left, inside its padding.
 */
export function layoutResults(w: number, h: number, inset: { left: number; right: number; bottom: number; top?: number }): ResultsLayout {
  const left = Math.max(RW_PAD, inset.left);
  const right = Math.max(RW_PAD, inset.right);
  const top = Math.max(RW_PAD, inset.top ?? 0);
  const bottom = Math.max(RW_PAD, inset.bottom);
  const availW = Math.min(RW_MAX_W, w - left - right);
  const x0 = left + (w - left - right - availW) / 2;
  const cardW = (availW - RW_GAP) / 2;
  const cardH = h - top - bottom;
  const team = { x: x0, y: top, w: cardW, h: cardH };
  const rewards = { x: x0 + cardW + RW_GAP, y: top, w: cardW, h: cardH };
  const button = { x: team.x + RW_PAD, y: team.y + cardH - RW_PAD - RW_BTN_H, w: Math.min(RW_BTN_MIN_W, cardW - 2 * RW_PAD), h: RW_BTN_H };
  return { team, rewards, button };
}
