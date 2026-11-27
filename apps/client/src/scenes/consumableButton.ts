import { BUILD_COUNT_GAP_CSS_PX, BUILD_COUNT_TEXT_CSS_PX, HAND_CANCEL, MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX, UNDO_CHIP_CSS_PX, UNDO_HAND } from "../ui/sizes";
import { hudBandTop } from "./hudTopLayout";
/**
 * Story 5.12 (AC 1, 7): the consumable button's rules, pure (unit-tested; the HUD and GameScene only
 * call these).
 *
 * - **Visible** with a non-empty slot, my survivor standing, a run on screen, and neither placement
 *   mode (5.15: the hand cluster owns the right thumb), the shop nor the menu open.
 * - **Usable** (else greyed, a tap does nothing): the medkit below max HP in a build or wave phase;
 *   a throwable in a wave phase (D3).
 * - **Pending (brief 14):** a tap (or E) is sent only when usable and not pending; then the button
 *   dims and ignores taps until the synced slot changes (the count drops or the item changes: the
 *   server used it) or `timeoutMs` passes (the server refused or ignored it). No optimistic use:
 *   lag never shows a throw that did not happen.
 */
export interface ConsumablePending {
  active: boolean;
  atMs: number;
  item: string | null;
  count: number;
}

export const createConsumablePending = (): ConsumablePending => ({ active: false, atMs: 0, item: null, count: 0 });

/** AC 7: pending ends after this without a state change (the server refused / ignored the use). */
export const CONSUMABLE_PENDING_TIMEOUT_MS = 1000;

export type ConsumableKindLike = "heal" | "grenade" | "molotov";

export interface ConsumableButtonInput {
  item: string | null;
  count: number;
  kind: ConsumableKindLike | null;
  alive: boolean;
  running: boolean;
  placement: boolean;
  shopOpen: boolean;
  menuOpen: boolean;
  phase: string;
  hp: number;
  maxHp: number;
}

export function consumableVisible(s: Readonly<ConsumableButtonInput>): boolean {
  return s.item !== null && s.count > 0 && s.alive && s.running && !s.placement && !s.shopOpen && !s.menuOpen;
}

export function consumableUsable(s: Readonly<ConsumableButtonInput>): boolean {
  if (!consumableVisible(s) || s.kind === null) return false;
  if (s.kind === "heal") return (s.phase === "build" || s.phase === "wave") && s.hp < s.maxHp;
  return s.phase === "wave";
}

/** Ends a pending use when the synced slot moved or the timeout passed. Call every frame. */
export function updateConsumablePending(p: ConsumablePending, nowMs: number, item: string | null, count: number, timeoutMs = CONSUMABLE_PENDING_TIMEOUT_MS): void {
  if (!p.active) return;
  if (item !== p.item || count !== p.count || nowMs - p.atMs >= timeoutMs) p.active = false;
}

/** A tap / E press: true = send the edge flag (and start pending); false = ignored. */
export function tapConsumable(p: ConsumablePending, nowMs: number, s: Readonly<ConsumableButtonInput>): boolean {
  if (p.active || !consumableUsable(s)) return false;
  p.active = true;
  p.atMs = nowMs;
  p.item = s.item;
  p.count = s.count;
  return true;
}

/** Story 5.12 (D5): the round buttons near the right thumb (CSS px). */
export const RIGHT_BUTTON_CSS_PX = 64;
export const SWAP_RIGHT_CSS_PX = 24;
export const SWAP_BOTTOM_CSS_PX = 120;
/** D5: the consumable button sits this far left of swap at the same height. */
export const CONSUMABLE_GAP_CSS_PX = 16;
/** Main-session decision (2026-11-23, 5.16 D3): above the build bar, the buttons keep this gap to the grid and to each other. */
export const ABOVE_BAR_GAP_CSS_PX = 12;

export interface RightButtonsLayout {
  size: number;
  swapX: number;
  swapY: number;
  consX: number;
  consY: number;
}

export const newRightButtonsLayout = (): RightButtonsLayout => ({ size: 0, swapX: 0, swapY: 0, consX: 0, consY: 0 });

/**
 * Where swap and the consumable button go (canvas px; `k` = dpr, insets in CSS px). Normally swap is
 * at the bottom right and the consumable 16 px left of it (D5). While the build bar is up (5.16: it
 * takes the bottom right in a build phase) both sit in a row above the grid's top-left edge
 * (main-session decision 2026-11-23, after 5.16's D3), consumable then swap, 12 px apart and 12 px
 * above the tiles, so the medkit (and the swap) stay reachable on touch in a build phase. Pure: the
 * layout test checks 568×320 / 800×360 / 1024×768.
 */
export function layoutRightButtons(width: number, height: number, insetRight: number, insetBottom: number, k: number, buildBar: boolean, gridLeft: number, gridTop: number, out: RightButtonsLayout, gridRight = width - 16 * k): RightButtonsLayout {
  const size = RIGHT_BUTTON_CSS_PX * k;
  out.size = size;
  if (buildBar) {
    const gap = ABOVE_BAR_GAP_CSS_PX * k;
    out.consX = gridLeft;
    out.consY = gridTop - gap - size;
    out.swapX = gridLeft + size + gap;
    out.swapY = out.consY;
    // Review L6: on a narrow screen the row would crowd the survivor at the screen centre: right-align
    // it to the grid instead, above the build count line.
    const cx = width / 2;
    const cy = height / 2;
    if (rectCentreGap(out.consX, out.consY, out.swapX + size - out.consX, size, cx, cy) < CENTRE_CLEAR_CSS_PX * k) {
      out.swapX = gridRight - size;
      out.consX = out.swapX - gap - size;
      out.consY = out.swapY = gridTop - (BUILD_COUNT_GAP_CSS_PX + BUILD_COUNT_TEXT_CSS_PX * COUNT_LINE_HEIGHT) * k - gap - size;
    }
    return out;
  }
  out.swapX = width - (SWAP_RIGHT_CSS_PX + insetRight) * k - size;
  out.swapY = height - (SWAP_BOTTOM_CSS_PX + insetBottom) * k - size;
  out.consX = out.swapX - CONSUMABLE_GAP_CSS_PX * k - size;
  out.consY = out.swapY;
  return out;
}

/**
 * Story 10.10 (AC 8, review 2): the row (consumable then swap) with the Build cluster up. Where the
 * survivor's 48 px allows (800 × 360 and up), left of the hand cluster's ✕ and above its Place and ↶,
 * 12 px clear of them — a stray Place / ✕ tap right after the hold ends can't land on it. Otherwise (narrow
 * screens) 5.12's own `layoutRightButtons` with the cluster's box: right-aligned, 12 px above the Shop
 * chip, under ✕'s spot — its presses are dropped in 5.18's quiet window then (`dropQuietPresses`).
 */
export function layoutRowAboveCluster(width: number, height: number, insetRight: number, insetBottom: number, k: number, clusterTop: number, clusterRight: number, out: RightButtonsLayout, insetTop = 0): RightButtonsLayout {
  const size = RIGHT_BUTTON_CSS_PX * k;
  const gap = ABOVE_BAR_GAP_CSS_PX * k;
  out.size = size;
  out.swapX = width - (insetRight + HAND_CANCEL.rightCss + HAND_CANCEL.sizeCss / 2) * k - gap - size;
  out.consX = out.swapX - gap - size;
  out.consY = out.swapY = height - (insetBottom + UNDO_HAND.bottomCss + UNDO_CHIP_CSS_PX / 2) * k - gap - size; // 12 px above ↶ (itself above Place)
  if (rectCentreGap(out.consX, out.consY, 2 * size + gap, size, width / 2, height / 2) >= CENTRE_CLEAR_CSS_PX * k) return out;
  // Narrow screens: right-aligned to the cluster, 12 px above ↶'s line (re-review 1: ↶ sits above ⟳ now), but
  // never higher than just under ping / ☰ (568 × 320 with 44/21 insets: touching ping's bottom, 5 px from ↶).
  out.swapX = clusterRight - size;
  out.consX = out.swapX - gap - size;
  const pingBottom = (hudBandTop(insetTop) + MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX) * k;
  out.consY = out.swapY = Math.max(pingBottom, Math.min(clusterTop - gap - size, out.consY));
  return out;
}

/** Review L6: the round buttons keep at least this far from the screen centre (the survivor stands there). */
export const CENTRE_CLEAR_CSS_PX = 48;
/** The build count's text box height per CSS px of font size. */
const COUNT_LINE_HEIGHT = 1.3;

/** The distance from (cx, cy) to the rectangle (0 inside it). */
export function rectCentreGap(x: number, y: number, w: number, h: number, cx: number, cy: number): number {
  const dx = Math.max(x - cx, 0, cx - (x + w));
  const dy = Math.max(y - cy, 0, cy - (y + h));
  return Math.hypot(dx, dy);
}
