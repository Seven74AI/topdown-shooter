import {
  PROGRESSION,
  TRAINING_BOOSTS,
  UNLOCK_CATEGORIES,
  boostValue,
  levelOf,
  trainingCost,
  type TrainResponse,
  type TrainingBoostId,
  goodNextPick,
  itemCategories,
  loadBalance,
  type Progression,
  type ProgressView,
  districtList,
  districtName,
  type UnlockCategory,
  type UnlockResponse,
} from "@topdown/shared";
import { formatSupplies } from "../net/rewardsStore";
import { UNLOCK_TIMEOUT_MS } from "../net/unlockTiming";

/**
 * Story 7.3 (AC 6–8; U1–U5; layout PH1 in Lumen LF5): what the Progress hub and its Unlocks tab show, the Unlock →
 * Confirm → spinner step, and where the hub's parts sit. Pure (tested); `ProgressScreen.tsx` draws it and
 * `overlay.css › .ph*` uses exactly these numbers (tools/checks/hubLayoutCss.test.ts).
 */

export const HUB_TEXT = {
  title: "Progress",
  /** U1: the header line. */
  rule: "Unlocks add cards to your shop, not power",
  offline: "Offline · can't unlock now",
  loading: "Loading…",
  unlocked: "Unlocked",
  starter: "Starter",
  goodPick: "Good next pick",
  tapAgain: "Tap again · 3 s",
  unlocking: "Unlocking…",
  failed: "Couldn't reach the save server · try again",
  rateLimited: "Too many taps · wait a moment",
  back: "Back",
} as const;

/** U3: "Not enough Supplies · need 60 more". */
export const notEnoughText = (need: number): string => `Not enough Supplies · need ${formatSupplies(need)} more`;
/** "Unlock · 100" and "Confirm 300". */
export const unlockLabel = (price: number): string => `Unlock · ${formatSupplies(price)}`;
export const confirmLabel = (price: number): string => `Confirm ${formatSupplies(price)}`;

/** Decision 7.3 D3: how long the "Confirm 300" step waits for the second tap. */
export const CONFIRM_MS = 3000;

export const SECTION_LABELS: Readonly<Record<UnlockCategory, string>> = { weapon: "Weapons", building: "Buildings", gear: "Gear", consumable: "Consumables" };

// ---------------------------------------------------------------------------------------------------------------
// Tabs (data-driven: 7.5 adds Training, 7.10 Survivor; the bar is laid out for HUB_TAB_SLOTS tabs)
// ---------------------------------------------------------------------------------------------------------------

export interface HubTab {
  readonly id: string;
  readonly label: string;
}
/** The tabs in order. 7.5 appends `{ id: "training", label: "Training" }`, 7.10 `{ id: "survivor", label: "Survivor" }`. */
export const HUB_TABS: readonly HubTab[] = Object.freeze([
  { id: "unlocks", label: "Unlocks" },
  { id: "training", label: "Training" }, // Story 7.5 (TR1)
]);
/** The tab bar is sized for three tabs (Unlocks · Training · Survivor). */
export const HUB_TAB_SLOTS = 3;

// ---------------------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------------------

export type RowState = "owned" | "buy" | "short";

export interface HubRow {
  /** Row key: the unlock id, or `starter:<item>`. */
  readonly key: string;
  /** The unlock id (null for a starter item). */
  readonly unlockId: string | null;
  /** The item whose icon is drawn (the first item of an unlock). */
  readonly iconItem: string;
  readonly name: string;
  readonly line: string;
  readonly starter: boolean;
  readonly price: number;
  /** owned (starter or bought), buy (affordable), short (not enough: `need` more). */
  readonly state: RowState;
  readonly need: number;
  readonly goodPick: boolean;
}

export interface HubSection {
  readonly category: UnlockCategory;
  readonly label: string;
  readonly rows: readonly HubRow[];
}

type Names = Readonly<Record<string, string>>;

let cached: { names: Names; categories: ReadonlyMap<string, UnlockCategory> } | null = null;
/** Item names and categories from the bundled balance (read once; names and categories never change in dev overrides). */
export function balanceInfo(): { names: Names; categories: ReadonlyMap<string, UnlockCategory> } {
  if (cached) return cached;
  const b = loadBalance();
  const names: Record<string, string> = {};
  for (const [id, w] of Object.entries(b.weapons)) names[id] = w.name ?? id;
  for (const [id, g] of Object.entries(b.gear.items)) names[id] = g.name;
  for (const [id, t] of Object.entries(b.buildings.types)) names[id] = t.name;
  for (const [id, c] of Object.entries(b.consumables.items)) names[id] = c.name;
  cached = { names, categories: itemCategories(b) };
  return cached;
}

/** "barricade_upgrades" → "Barricade upgrades" (an unlock of several items has no balance name). */
const humanize = (id: string): string => {
  const s = id.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * The Unlocks tab: four sections (Weapons · Buildings · Gear · Consumables). In each, locked unlocks first (cheapest
 * first, list order on a tie), then what I own (bought unlocks in list order, then starter items). Every number comes
 * from `progress` (the server's) and `progression.json`.
 */
export function hubSections(
  progress: ProgressView | null,
  p: Pick<Readonly<Progression>, "starterPool" | "unlocks" | "starterLines"> = PROGRESSION,
  info = balanceInfo(),
): HubSection[] {
  const unlocks = progress?.unlocks ?? [];
  const supplies = progress?.supplies ?? 0;
  const owned = new Set(unlocks);
  const pick = progress ? goodNextPick(p, unlocks, info.categories) : null;
  return UNLOCK_CATEGORIES.map((category) => {
    const locked: (HubRow & { index: number })[] = [];
    const bought: HubRow[] = [];
    p.unlocks.forEach((u, index) => {
      if (u.category !== category) return;
      const first = u.items[0] as string;
      const name = u.items.length === 1 ? (info.names[first] ?? humanize(u.id)) : humanize(u.id);
      const have = owned.has(u.id);
      const need = have ? 0 : Math.max(0, u.price - supplies);
      const row: HubRow = {
        key: u.id,
        unlockId: u.id,
        iconItem: first,
        name,
        line: u.line,
        starter: false,
        price: u.price,
        state: have ? "owned" : need > 0 ? "short" : "buy",
        need,
        goodPick: u.id === pick,
      };
      if (have) bought.push(row);
      else locked.push({ ...row, index });
    });
    locked.sort((a, b) => a.price - b.price || a.index - b.index);
    const starters: HubRow[] = p.starterPool
      .filter((id) => info.categories.get(id) === category)
      .map((id) => ({
        key: `starter:${id}`,
        unlockId: null,
        iconItem: id,
        name: info.names[id] ?? humanize(id),
        line: p.starterLines[id] ?? "",
        starter: true,
        price: 0,
        state: "owned",
        need: 0,
        goodPick: false,
      }));
    return { category, label: SECTION_LABELS[category], rows: [...locked.map(stripIndex), ...bought, ...starters] };
  });
}

const stripIndex = (r: HubRow & { index: number }): HubRow => {
  const { index, ...row } = r;
  void index;
  return row;
};

/**
 * Story 7.7 (AC 7, D2): the hub's "Districts" line — "District 2: unlocked · coming soon" once unlocked, else how to
 * unlock it ("" before progress is known). One phrase per district past the first (data-driven).
 */
export function districtsLine(progress: ProgressView | null): string {
  if (!progress) return "";
  const have = progress.districts ?? [];
  return districtList()
    .filter((d) => d.unlock !== null)
    .map((d) => (have.includes(d.id) ? `${d.name}: unlocked${d.playable ? "" : " · coming soon"}` : `${d.name}: extract from ${districtName(d.unlock?.extractFrom ?? "")} to unlock`))
    .join(" · ");
}

/** Header: "1,240" (or "–" before any progress is known). */
export const suppliesText = (progress: ProgressView | null): string => (progress ? formatSupplies(progress.supplies) : "–");

// ---------------------------------------------------------------------------------------------------------------
// Unlock → Confirm (3 s) → spinner (decision 7.3 D3; U3)
// ---------------------------------------------------------------------------------------------------------------

export type BuyStep =
  | { kind: "idle" }
  | { kind: "confirm"; unlockId: string; untilMs: number }
  | { kind: "sending"; unlockId: string; requestId: string };

/** A message under one row (not enough from the server, couldn't reach it, too many taps). */
export interface RowNote {
  readonly unlockId: string;
  readonly text: string;
}

export interface BuyState {
  readonly step: BuyStep;
  readonly note: RowNote | null;
}

export const IDLE: BuyState = { step: { kind: "idle" }, note: null };

/**
 * One tap on a row's Unlock button. First tap → "Confirm 300" for 3 s (nothing sent); a second tap on the same row
 * within 3 s → `send` with a fresh request id (one per confirmed tap: a network retry reuses it); while a request is
 * in flight every tap is ignored. `offline` (no server copy) ignores taps too.
 */
export function tapUnlock(state: BuyState, unlockId: string, nowMs: number, newId: () => string, offline: boolean): { state: BuyState; send: { unlockId: string; requestId: string } | null } {
  if (offline || state.step.kind === "sending") return { state, send: null };
  const s = state.step;
  if (s.kind === "confirm" && s.unlockId === unlockId && nowMs < s.untilMs) {
    const requestId = newId();
    return { state: { step: { kind: "sending", unlockId, requestId }, note: null }, send: { unlockId, requestId } };
  }
  return { state: { step: { kind: "confirm", unlockId, untilMs: nowMs + CONFIRM_MS }, note: null }, send: null };
}

/** The 3 s ran out: back to the Unlock button. */
export function expireConfirm(state: BuyState, nowMs: number): BuyState {
  return state.step.kind === "confirm" && nowMs >= state.step.untilMs ? { ...state, step: { kind: "idle" } } : state;
}

/** What to do with an answer: the next state and the server progress to show (U5: never a local guess). */
export function answerUnlock(
  state: BuyState,
  requestId: string,
  call: { kind: "answer"; body: UnlockResponse } | { kind: "failed"; status: number },
): { state: BuyState; progress: ProgressView | null; offline: boolean } {
  if (state.step.kind !== "sending" || state.step.requestId !== requestId) return { state, progress: null, offline: false };
  const unlockId = state.step.unlockId;
  if (call.kind === "failed") {
    const text = call.status === 429 ? HUB_TEXT.rateLimited : HUB_TEXT.failed;
    return { state: { step: { kind: "idle" }, note: { unlockId, text } }, progress: null, offline: call.status === 0 || call.status >= 500 };
  }
  const b = call.body;
  const note = !b.ok && b.reason === "not_enough" ? { unlockId, text: notEnoughText(b.need ?? 1) } : null;
  return { state: { step: { kind: "idle" }, note }, progress: b.progress, offline: false };
}

/**
 * Re-review RR-L1: after a failed unlock, when to ask the server again: not before UNLOCK_TIMEOUT_MS after the request
 * was sent (past the route's worst case), so the refresh never reads the row from before a late commit.
 */
export function refreshAfterFailureMs(sentAtMs: number, nowMs: number): number {
  return Math.max(0, sentAtMs + UNLOCK_TIMEOUT_MS - nowMs);
}

/** What a row's action area shows. */
export type RowAction =
  | { kind: "owned"; starter: boolean }
  | { kind: "short"; price: number; text: string }
  | { kind: "buy"; label: string; disabled: boolean }
  | { kind: "confirm"; label: string; sub: string }
  | { kind: "sending" };

export function rowAction(row: HubRow, state: BuyState, offline: boolean): RowAction {
  if (row.state === "owned") return { kind: "owned", starter: row.starter };
  if (row.state === "short") return { kind: "short", price: row.price, text: notEnoughText(row.need) };
  const s = state.step;
  if (s.kind === "sending" && s.unlockId === row.unlockId) return { kind: "sending" };
  if (s.kind === "confirm" && s.unlockId === row.unlockId) return { kind: "confirm", label: confirmLabel(row.price), sub: HUB_TEXT.tapAgain };
  return { kind: "buy", label: unlockLabel(row.price), disabled: offline || s.kind === "sending" };
}

// ---------------------------------------------------------------------------------------------------------------
// Layout (R9: 568×320, 640×360, 800×360, 844×390 with insets 44/21: no overlap, inside the safe area, text ≥ 11 px)
// ---------------------------------------------------------------------------------------------------------------

/** Space around the hub frame (px), on top of the safe-area insets. */
export const PH_PAD = 8;
/** The hub is never wider than this (centred on wide screens). */
export const PH_MAX_W = 760;
/** Back key, tabs and the Unlock button: tap targets (≥ 44 px). */
export const PH_BACK = 44;
export const PH_TAB_H = 44;
export const PH_TAB_W = 128;
export const PH_GAP = 4;
/** "SUPPLIES" + crate + "10,000" in the header. */
export const PH_SUPPLIES_W = 160;
/** The rule line under the header. */
export const PH_RULE_H = 16;
/** One list row: icon box, action column, height. */
export const PH_ROW_H = 56;
export const PH_ICON_W = 56;
export const PH_ICON_H = 36;
export const PH_ACTION_W = 144;
export const PH_BTN_H = 44;
/** Text sizes (px): the smallest is the label size; R9 asks ≥ 11. */
export const PH_TEXT_PX = { label: 11, line: 12, name: 15, title: 20, supplies: 20, button: 13 } as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HubLayout {
  frame: Box;
  back: Box;
  title: Box;
  supplies: Box;
  rule: Box;
  tabs: Box[];
  list: Box;
  /** The first list row's parts (the rest repeat every PH_ROW_H). */
  row: { icon: Box; text: Box; action: Box; button: Box };
}

/**
 * The hub frame fills the safe area (minus PH_PAD), at most PH_MAX_W wide, centred. Header row: Back (44 × 44),
 * the title and the Supplies total; the rule line; the tab bar (HUB_TAB_SLOTS slots of PH_TAB_W × 44); then the
 * scrolling list to the bottom. A row: icon left, the name and line, the action column right (the 44 px button
 * centred in a PH_ROW_H row).
 */
export function layoutHub(w: number, h: number, inset: { left: number; right: number; bottom: number; top?: number }): HubLayout {
  const left = Math.max(PH_PAD, inset.left);
  const right = Math.max(PH_PAD, inset.right);
  const top = Math.max(PH_PAD, inset.top ?? 0);
  const bottom = Math.max(PH_PAD, inset.bottom);
  const fw = Math.min(PH_MAX_W, w - left - right);
  const x0 = left + (w - left - right - fw) / 2;
  const frame = { x: x0, y: top, w: fw, h: h - top - bottom };
  const back = { x: x0, y: top, w: PH_BACK, h: PH_BACK };
  const title = { x: x0 + PH_BACK + 12, y: top + (PH_BACK - 24) / 2, w: 120, h: 24 };
  const supplies = { x: title.x + title.w + 8, y: title.y, w: PH_SUPPLIES_W, h: 24 };
  const rule = { x: x0, y: top + PH_BACK + PH_GAP, w: fw, h: PH_RULE_H };
  const tabY = rule.y + PH_RULE_H + PH_GAP;
  const tabs = Array.from({ length: HUB_TAB_SLOTS }, (_, i) => ({ x: x0 + i * (PH_TAB_W + PH_GAP), y: tabY, w: PH_TAB_W, h: PH_TAB_H }));
  const listY = tabY + PH_TAB_H + PH_GAP;
  const list = { x: x0, y: listY, w: fw, h: frame.y + frame.h - listY };
  const inner = { x: list.x + PH_PAD, y: list.y + PH_PAD, w: list.w - 2 * PH_PAD };
  const icon = { x: inner.x, y: inner.y + (PH_ROW_H - PH_ICON_H) / 2, w: PH_ICON_W, h: PH_ICON_H };
  const action = { x: inner.x + inner.w - PH_ACTION_W, y: inner.y, w: PH_ACTION_W, h: PH_ROW_H };
  const text = { x: icon.x + PH_ICON_W + 8, y: inner.y, w: action.x - 8 - (icon.x + PH_ICON_W + 8), h: PH_ROW_H };
  const button = { x: action.x, y: action.y + (PH_ROW_H - PH_BTN_H) / 2, w: PH_ACTION_W, h: PH_BTN_H };
  return { frame, back, title, supplies, rule, tabs, list, row: { icon, text, action, button } };
}

// ---------------------------------------------------------------------------------------------------------------
// Story 7.5 (AC 8; designer pick TR1): the Training tab: four rows, 5 pips, Now / Next · price, Train → Confirm
// ---------------------------------------------------------------------------------------------------------------

export const TRAIN_TEXT = {
  /** AC 8: the header line of the tab. */
  header: "Small boosts, capped. They always apply in full.",
  offline: "Offline · can't train now",
  train: "Train",
  maxed: "Maxed",
  nothing: "Now: nothing yet",
  training: "Training…",
} as const;

/** The row key a Training row uses in the shared Buy → Confirm → spinner state (`train:max_hp`). */
export const trainKey = (boost: TrainingBoostId): string => `train:${boost}`;

/** "+6 % max HP", "+5 % damage", "+$30 at the start", "3 % faster reload" (a boost's effect at `level`). */
export function boostEffect(boost: TrainingBoostId, level: number): string {
  const v = boostValue(boost, level);
  switch (boost) {
    case "max_hp":
      return `+${v} % max HP`;
    case "damage":
      return `+${v} % damage`;
    case "start_money":
      return "+$" + String(v) + " at the start";
    case "reload":
      return `${v} % faster reload`;
  }
}

export interface TrainRow {
  readonly key: string;
  readonly boost: TrainingBoostId;
  readonly name: string;
  readonly line: string;
  readonly level: number;
  readonly maxLevel: number;
  /** "Now: +6 % max HP" / "Now: nothing yet". */
  readonly now: string;
  /** "Next: +8 % max HP" ("Maxed" at the cap). */
  readonly next: string;
  /** The next level's price (0 at the cap). */
  readonly price: number;
  readonly state: "buy" | "short" | "maxed";
  readonly need: number;
}

/** The four Training rows from the server's progress (absent levels = 0). Every number from `progression.json`. */
export function trainingRows(progress: ProgressView | null, t = PROGRESSION.training): TrainRow[] {
  const supplies = progress?.supplies ?? 0;
  return TRAINING_BOOSTS.map((boost, i) => {
    const b = t.boosts[i] as (typeof t.boosts)[number];
    const level = levelOf(progress?.training, boost);
    const maxed = level >= t.maxLevel;
    const price = maxed ? 0 : trainingCost(level + 1, t);
    const need = maxed ? 0 : Math.max(0, price - supplies);
    return {
      key: trainKey(boost),
      boost,
      name: b.name,
      line: b.line,
      level,
      maxLevel: t.maxLevel,
      now: level === 0 ? TRAIN_TEXT.nothing : `Now: ${boostEffect(boost, level)}`,
      next: maxed ? TRAIN_TEXT.maxed : `Next: ${boostEffect(boost, level + 1)}`,
      price,
      state: maxed ? "maxed" : need > 0 ? "short" : "buy",
      need,
    };
  });
}

/** What a Training row's action area shows. */
export type TrainAction =
  | { kind: "maxed" }
  | { kind: "short"; text: string }
  | { kind: "buy"; label: string; disabled: boolean }
  | { kind: "confirm"; label: string; sub: string }
  | { kind: "sending" };

export function trainAction(row: TrainRow, state: BuyState, offline: boolean): TrainAction {
  if (row.state === "maxed") return { kind: "maxed" };
  if (row.state === "short") return { kind: "short", text: notEnoughText(row.need) };
  const s = state.step;
  if (s.kind === "sending" && s.unlockId === row.key) return { kind: "sending" };
  if (s.kind === "confirm" && s.unlockId === row.key) return { kind: "confirm", label: confirmLabel(row.price), sub: HUB_TEXT.tapAgain };
  return { kind: "buy", label: TRAIN_TEXT.train, disabled: offline || s.kind === "sending" };
}

/** A Training answer → the next state and the server's progress (U5: never a local guess). Same rules as an unlock. */
export function answerTrain(
  state: BuyState,
  requestId: string,
  call: { kind: "answer"; body: TrainResponse } | { kind: "failed"; status: number },
): { state: BuyState; progress: ProgressView | null; offline: boolean } {
  if (state.step.kind !== "sending" || state.step.requestId !== requestId) return { state, progress: null, offline: false };
  const key = state.step.unlockId;
  if (call.kind === "failed") {
    const text = call.status === 429 ? HUB_TEXT.rateLimited : HUB_TEXT.failed;
    return { state: { step: { kind: "idle" }, note: { unlockId: key, text } }, progress: null, offline: call.status === 0 || call.status >= 500 };
  }
  const b = call.body;
  const note = !b.ok && b.reason === "not_enough" ? { unlockId: key, text: notEnoughText(b.need ?? 1) } : null;
  return { state: { step: { kind: "idle" }, note }, progress: b.progress, offline: false };
}
