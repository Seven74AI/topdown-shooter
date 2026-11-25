import { PROGRESSION, TRAINING_BOOSTS, playerSlotOf, type RunRewards, type TrainingLevels } from "@topdown/shared";
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
  /** Story 7.4 (K7, group 3 "unlocks"): "You used the Grenade Launcher: unlock it for 500" ("" none). */
  readonly unlockLine: string;
  /** Group 2 (7.11 then 7.12): new items, my find / Collector, a teammate's find (D1). Empty = no space. */
  readonly items: readonly ItemRow[];
  /** Group 3 (7.7): "Unlocked: District 2". */
  readonly unlocks: readonly UnlockRow[];
}

/** One item row (group 2). `key` = the part (`slot:id`) for its picture; null = none (Collector). */
export interface ItemRow {
  readonly kind: "new" | "found" | "collector" | "team" | "lost";
  readonly text: string;
  readonly sub: string;
  readonly key: string | null;
  /** 7.12 D1: the finder's own line is the bigger one. */
  readonly big: boolean;
  /** The teammate's slot (team rows: the name's colour); −1 otherwise. */
  readonly slot: number;
}

export interface UnlockRow {
  readonly id: string;
  readonly text: string;
  readonly sub: string;
}

export const COLLECTOR_TEXT = "Collector: you have every surprise item";
/** B33 (designer override): the finder's bank failed (worded like `REWARDS_TEXT.failed`). */
export const LOOT_FAILED_TEXT = "Couldn't save the bag's item";

/** Groups 2 and 3 from the message (Stories 7.7, 7.11, 7.12). `nameOf(slot)` = the Results table's name. */
export function metaRows(rewards: RunRewards, nameOf: (slot: number) => string): { items: ItemRow[]; unlocks: UnlockRow[] } {
  const items: ItemRow[] = [];
  for (const n of rewards.newItems ?? []) items.push({ kind: "new", text: `New item: ${n.name}`, sub: n.reason ? `(${n.reason})` : "", key: n.key, big: false, slot: -1 });
  const l = rewards.loot;
  // B33 (designer override 2026-11-25): my bank failed → the bag's item is lost; said in 7.2's "Couldn't save" words and style
  if (l && rewards.status === "failed") items.push({ kind: "lost", text: LOOT_FAILED_TEXT, sub: `(found in wave ${l.wave})`, key: null, big: true, slot: -1 });
  else if (l) items.push(l.key === null ? { kind: "collector", text: COLLECTOR_TEXT, sub: "", key: null, big: true, slot: -1 } : { kind: "found", text: `Found in wave ${l.wave}: ${l.name}`, sub: "", key: l.key, big: true, slot: -1 });
  const t = rewards.teamLoot;
  if (t) {
    const slot = playerSlotOf(t.playerId);
    const who = (slot >= 0 && slot < 4 ? nameOf(slot) : "") || "A teammate";
    items.push(t.key === null ? { kind: "team", text: `${who} found the bag`, sub: "(Collector: they have every surprise item)", key: null, big: false, slot: slot < 4 ? slot : -1 } : { kind: "team", text: `${who} found: ${t.name}`, sub: `(wave ${t.wave})`, key: t.key, big: false, slot: slot < 4 ? slot : -1 });
  }
  const unlocks: UnlockRow[] = (rewards.newDistricts ?? []).map((d) => {
    const playable = PROGRESSION.districts.find((x) => x.id === d.id)?.playable === true;
    return { id: d.id, text: `Unlocked: ${d.name}`, sub: playable ? "" : "coming soon" };
  });
  return { items, unlocks };
}

/** Story 7.4 (K7): the supply-drop / borrowed-card unlock hint. */
export const unlockHint = (name: string, price: number): string => `You used the ${name}: unlock it for ${formatSupplies(price)}`;

export const REWARD_GROUPS = ["supplies", "items", "unlocks", "nudge"] as const;

/**
 * The panel for this Results screen: `online` false = practice solo (decision 7.2 D1: banks nothing, says so);
 * `rewards` null = not arrived yet ("Saving…"); a message whose seed is not this run's is treated as not arrived.
 */
export function rewardsView(rewards: RunRewards | null, online: boolean, seed: number, cfg = PROGRESSION.supplies, nameOf: (slot: number) => string = () => ""): RewardsView {
  const none = { headline: "", lines: [] as RewardLine[], rookie: false, total: "", note: "", groups: REWARD_GROUPS, unlockLine: "", items: [] as ItemRow[], unlocks: [] as UnlockRow[] };
  if (!online) return { ...none, state: "practice", status: REWARDS_TEXT.practice };
  if (rewards === null || rewards.seed !== seed) return { ...none, state: "saving", status: REWARDS_TEXT.saving };
  // Story 7.4 (K7): the hint shows whatever the bank did (an unsaved player can still unlock it later).
  // Stories 7.7 / 7.11 / 7.12: an unsaved or failed bank still shows the find (the server sends only that then).
  const used = rewards.lockedUsed;
  const base = { ...none, unlockLine: used ? unlockHint(used.name, used.price) : "", ...metaRows(rewards, nameOf) };
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
    ...metaRows(rewards, nameOf),
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

// ---------------------------------------------------------------------------------------------------------------
// Story 7.5 (T4; designer pick TL3): one "Train" column on the Results table
// ---------------------------------------------------------------------------------------------------------------

export interface TrainingCell {
  /** "10/20", or "MAX" at every boost maxed. */
  readonly text: string;
  readonly maxed: boolean;
  /** Each boost's fill 0–1 (max HP, damage, start money, reload): the four small bars under the number. */
  readonly bars: readonly number[];
  /** "Training · HP 3 · Damage 2 · Money 5 · Reload 0" (the cell's label and tooltip). */
  readonly label: string;
}

/** Story 7.5 (T4): the Training cell of one Results row (absent levels = 0). */
export function trainingCell(t: TrainingLevels | undefined, maxLevel = PROGRESSION.training.maxLevel): TrainingCell {
  const lv = [t?.maxHp ?? 0, t?.damage ?? 0, t?.startMoney ?? 0, t?.reload ?? 0].map((x) => Math.max(0, Math.min(maxLevel, Math.floor(x))));
  const sum = lv.reduce((a, b) => a + b, 0);
  const max = maxLevel * TRAINING_BOOSTS.length;
  return {
    text: sum >= max ? "MAX" : `${sum}/${max}`,
    maxed: sum >= max,
    bars: lv.map((x) => x / maxLevel),
    label: `Training · HP ${lv[0]} · Damage ${lv[1]} · Money ${lv[2]} · Reload ${lv[3]}`,
  };
}
