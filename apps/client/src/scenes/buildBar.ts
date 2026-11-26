import { ALL_UNLOCKED, buildingStats, inPoolOnly, shopBuildings, turretStats, type Balance } from "@topdown/shared";
import {
  BUILD_BADGE_OUT_X_CSS_PX,
  BUILD_BADGE_OUT_Y_CSS_PX,
  BUILD_BAR_INSET_CSS_PX,
  BUILD_BTN_CSS_PX,
  BUILD_PANEL_COLS,
  BUILD_PANEL_HEADER_CSS_PX,
  BUILD_PANEL_HEADER_MIN_CSS_PX,
  BUILD_PANEL_PAD_CSS_PX,
  BUILD_PANEL_ROWS,
  BUILD_PANEL_TOP_CLEAR_CSS_PX,
  BUILD_TILE_CSS_PX,
  BUILD_TILE_GAP_CSS_PX,
  MENU_BUTTON_CSS_PX,
  MENU_BUTTON_INSET_CSS_PX,
  READY_BAR_GAP_CSS_PX,
  READY_SHIFT_LEFT_CSS_PX,
  SHOP_CHIP_CSS_PX,
  SHOP_CHIP_GAP_CSS_PX,
} from "../ui/sizes";
import { CENTRE_CLEAR_CSS_PX } from "./consumableButton";

/**
 * Story 5.16 (BX-2, ux-spec §3–§4): the build bar, the right-thumb cluster's "hands empty" state in
 * a build phase. Pure helpers (no Phaser): the tile list from balance, which item each slot shows,
 * the layout, and the pick rule (cap before money, as `placementError`). The HudScene draws it, the
 * GameScene decides when it shows and runs the pick.
 */

/**
 * Item slots (Story 5.16's 8: up to 7 types + Shop, "More ▸" past 7). Story 10.10: they are the open
 * panel's first 8 cells of its 3 × 3; the 9th (bottom right, Build's own spot) is Close.
 */
export const PANEL_CELLS = BUILD_PANEL_COLS * BUILD_PANEL_ROWS;
export const BUILD_BAR_SLOTS = PANEL_CELLS - 1;
/** Slot contents other than an item index (≥ 0). */
export const SLOT_EMPTY = -1;
export const SLOT_SHOP = -2;
export const SLOT_MORE = -3;
/** Building tiles on one page when the types don't fit (the 7th slot turns into "More ▸"). */
export const PAGE_ITEMS = BUILD_BAR_SLOTS - 2;

/** One building tile: what the shop list gives, plus what the icon needs (the HUD never reads balance). */
export interface BuildTile {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  /** Drawn as the turret's plate + head (no atlas frame). */
  readonly turret: boolean;
  /** The footprint at rot 0 (m): the icon's aspect when there is no atlas frame. */
  readonly widthM: number;
  readonly depthM: number;
}

const itemCache = new WeakMap<Balance, Map<number, readonly BuildTile[]>>();

/**
 * The building tiles, in balance order: `shopBuildings` (every priced type except upgrade-only tiers
 * and, Story 5.10, `inShop: false` types — the floodlight until 6.3; the dev switch `?shopall=1`
 * builds a balance with every `inShop` true, so the floodlight shows then). Cached per balance (no
 * allocation per call). Story 7.4 (K5): only the buildings in the pool of `unlocks` (the local player's mask; default
 * every unlock), cached per balance and mask.
 */
export function buildBarItems(balance: Balance, unlocks: number = ALL_UNLOCKED): readonly BuildTile[] {
  let byMask = itemCache.get(balance);
  if (!byMask) {
    byMask = new Map();
    itemCache.set(balance, byMask);
  }
  const mask = unlocks >>> 0;
  let list = byMask.get(mask);
  if (!list) {
    const out: BuildTile[] = [];
    for (const b of inPoolOnly(shopBuildings(balance), mask)) {
      const stats = buildingStats(balance, b.id);
      out.push(Object.freeze({ id: b.id, name: b.name, price: b.price, turret: turretStats(balance, b.id) !== undefined, widthM: stats?.widthM ?? 1, depthM: stats?.depthM ?? 1 }));
    }
    list = Object.freeze(out);
    byMask.set(mask, list);
  }
  return list;
}

/** Pages needed for `count` building types (1 when they fit: up to 7 tiles + Shop). */
export function buildBarPages(count: number): number {
  return count <= BUILD_BAR_SLOTS - 1 ? 1 : Math.ceil(count / PAGE_ITEMS);
}

/**
 * What each of the 8 slots shows (row by row from the top-left), written into `out`: an item index,
 * `SLOT_EMPTY`, `SLOT_MORE` or `SLOT_SHOP`. Shop is always the last slot (bottom right, under the
 * thumb: D1). Up to 7 types fill slots 0–6; more than that page six at a time with "More ▸" in slot 6.
 * `page` wraps.
 */
export function buildBarSlots(count: number, page: number, out: Int16Array): Int16Array {
  out.fill(SLOT_EMPTY);
  out[BUILD_BAR_SLOTS - 1] = SLOT_SHOP;
  const pages = buildBarPages(count);
  if (pages === 1) {
    for (let i = 0; i < count; i++) out[i] = i;
    return out;
  }
  const p = ((page % pages) + pages) % pages;
  for (let i = 0; i < PAGE_ITEMS; i++) {
    const item = p * PAGE_ITEMS + i;
    if (item < count) out[i] = item;
  }
  out[BUILD_BAR_SLOTS - 2] = SLOT_MORE;
  return out;
}

/**
 * Story 10.10 (review 9, B13): what the open panel's first 8 cells show (row by row from the top-left;
 * the 9th is Close). Cell 7 — the quick tile's own spot — always holds the quick type, so the same spot
 * repeats the last building whether the panel is open or not; the other types fill cells 0–5 in balance
 * order and Shop takes cell 6. More than 6 other types page five at a time with "More ▸" in cell 5.
 * Without a quick type (`quick` < 0) it is Story 5.16's order (`buildBarSlots`). `page` wraps.
 */
export const PANEL_QUICK_CELL = 7;
const PANEL_SHOP_CELL = 6;
const PANEL_OTHER_CELLS = 6;

export function buildPanelSlots(count: number, quick: number, page: number, out: Int16Array): Int16Array {
  if (quick < 0 || quick >= count) return buildBarSlots(count, page, out);
  out.fill(SLOT_EMPTY);
  out[PANEL_QUICK_CELL] = quick;
  out[PANEL_SHOP_CELL] = SLOT_SHOP;
  const others = count - 1;
  const perPage = others <= PANEL_OTHER_CELLS ? PANEL_OTHER_CELLS : PANEL_OTHER_CELLS - 1;
  const pages = Math.max(1, Math.ceil(others / perPage));
  const p = ((page % pages) + pages) % pages;
  for (let i = 0; i < perPage; i++) {
    const n = p * perPage + i; // the n-th type that isn't the quick one
    if (n >= others) break;
    out[i] = n < quick ? n : n + 1;
  }
  if (pages > 1) out[PANEL_OTHER_CELLS - 1] = SLOT_MORE;
  return out;
}

/**
 * Story 10.10 (BU-5, B9): the quick tile's type — the type of my last confirmed building this run (the
 * server's `building.placed` for me, never the Place itself), or the
 * first unlocked type in balance order before any placement or when that type is no longer in the
 * list (an unlock mask change). "" when there are no types.
 */
export function quickType(items: readonly BuildTile[], lastPlaced: string): string {
  if (lastPlaced !== "") for (let i = 0; i < items.length; i++) if ((items[i] as BuildTile).id === lastPlaced) return lastPlaced;
  return items.length > 0 ? (items[0] as BuildTile).id : "";
}

/** Story 10.10 (BU-3): with this many unlocked types or fewer the tiles sit in the corner themselves (no Build, no panel). */
export const SHORT_LIST_MAX = 2;

export function panelAllowed(itemCount: number): boolean {
  return itemCount > SHORT_LIST_MAX;
}

/** Story 10.10: the closed Build cluster (canvas px; one reused object). */
export interface BuildClusterLayout {
  /** Tile / Build size and the Shop chip's diameter. */
  tile: number;
  chip: number;
  /** Build (the corner; the 2nd short-list tile in BU-3), the quick tile 8 px left of it (the 1st short-list tile), the Shop chip 12 px above Build. */
  buildX: number;
  buildY: number;
  quickX: number;
  quickY: number;
  chipX: number;
  chipY: number;
  /** The count badge's top-right anchor (it sticks out of Build's top-right corner). */
  badgeX: number;
  badgeY: number;
  /** The cluster's box for its neighbours (AC 8): left = the quick tile, top = the Shop chip, right = Build's right edge. */
  left: number;
  top: number;
  right: number;
}

export function newBuildClusterLayout(): BuildClusterLayout {
  return { tile: 0, chip: 0, buildX: 0, buildY: 0, quickX: 0, quickY: 0, chipX: 0, chipY: 0, badgeX: 0, badgeY: 0, left: 0, top: 0, right: 0 };
}

/**
 * Story 10.10 (BU-1 = B, AC 1): from the bottom-right safe-area corner with the 16 px inset (insets in
 * CSS px, `k` = dpr): Build 56 px in the corner, the quick tile 8 px left of it, the 48 px Shop chip
 * 12 px above Build (centred on it), the count badge on Build's top-right corner. Written into `out`.
 */
export function layoutBuildCluster(width: number, height: number, insetRight: number, insetBottom: number, k: number, out: BuildClusterLayout): BuildClusterLayout {
  const tile = BUILD_BTN_CSS_PX * k;
  const chip = SHOP_CHIP_CSS_PX * k;
  const right = width - (BUILD_BAR_INSET_CSS_PX + insetRight) * k;
  const bottom = height - (BUILD_BAR_INSET_CSS_PX + insetBottom) * k;
  out.tile = tile;
  out.chip = chip;
  out.buildX = right - tile;
  out.buildY = bottom - tile;
  out.quickX = out.buildX - BUILD_TILE_GAP_CSS_PX * k - BUILD_TILE_CSS_PX * k;
  out.quickY = out.buildY;
  out.chipX = out.buildX + (tile - chip) / 2;
  out.chipY = out.buildY - SHOP_CHIP_GAP_CSS_PX * k - chip;
  out.badgeX = right + BUILD_BADGE_OUT_X_CSS_PX * k;
  out.badgeY = out.buildY - BUILD_BADGE_OUT_Y_CSS_PX * k;
  out.left = out.quickX;
  out.top = out.chipY;
  out.right = right;
  return out;
}

/** Story 10.10: the open panel (canvas px; one reused object). */
export interface BuildPanelLayout {
  /** Cell top-left corners, row by row from the top-left: 0–7 = Story 5.16's slots, 8 = Close (Build's spot). */
  readonly x: Float32Array;
  readonly y: Float32Array;
  tile: number;
  /** The card behind the cells (not pressable) and its header line's centre height (title left, count right). */
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  headerY: number;
}

/** Story 10.10: the panel's cells never shrink below this (CSS px; the touch-target floor). */
export const MIN_PANEL_CELL_CSS_PX = 48;

export function newBuildPanelLayout(): BuildPanelLayout {
  return { x: new Float32Array(PANEL_CELLS), y: new Float32Array(PANEL_CELLS), tile: 0, cardX: 0, cardY: 0, cardW: 0, cardH: 0, headerY: 0 };
}

/**
 * Story 10.10 (BU-4, AC 3, 5): the 3 × 3 panel over the thumb corner — 56 px cells, 8 px gaps, the
 * bottom-right cell on Build's own spot (Close), the same cells on every phone. Only where 3 × 56 px
 * (or the card round them) would come within 48 px of the screen centre (568 × 320 with 44 px side
 * insets), or the card would come within 12 px of ping / ☰ (a short screen with a top inset), the
 * cells shrink to fit, never under 48 px (B-code 10.10-B3). The card pads the cells by 8 px and carries a 24 px header
 * (Build · n/6), shrunk to keep 12 px below ping / ☰ (min 18 px).
 */
export function layoutBuildPanel(width: number, height: number, insetRight: number, insetBottom: number, k: number, out: BuildPanelLayout, insetTop = 0): BuildPanelLayout {
  const gap = BUILD_TILE_GAP_CSS_PX * k;
  const right = width - (BUILD_BAR_INSET_CSS_PX + insetRight) * k;
  const bottom = height - (BUILD_BAR_INSET_CSS_PX + insetBottom) * k;
  const room = (right - (width / 2 + (CENTRE_CLEAR_CSS_PX + BUILD_PANEL_PAD_CSS_PX) * k) - (BUILD_PANEL_COLS - 1) * gap) / BUILD_PANEL_COLS; // the card too keeps the survivor's 48 px
  const pad = BUILD_PANEL_PAD_CSS_PX * k;
  const topRow = (insetTop + MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX + BUILD_PANEL_TOP_CLEAR_CSS_PX) * k;
  // Review 7: and the card (with its smallest header) keeps 12 px under ping / ☰ (a short screen with a top inset).
  const roomV = (bottom - topRow - pad - BUILD_PANEL_HEADER_MIN_CSS_PX * k - (BUILD_PANEL_ROWS - 1) * gap) / BUILD_PANEL_ROWS;
  const tile = Math.max(MIN_PANEL_CELL_CSS_PX * k, Math.min(BUILD_TILE_CSS_PX * k, Math.floor(room), Math.floor(roomV)));
  const left = right - BUILD_PANEL_COLS * tile - (BUILD_PANEL_COLS - 1) * gap;
  const top = bottom - BUILD_PANEL_ROWS * tile - (BUILD_PANEL_ROWS - 1) * gap;
  out.tile = tile;
  for (let c = 0; c < PANEL_CELLS; c++) {
    out.x[c] = left + (c % BUILD_PANEL_COLS) * (tile + gap);
    out.y[c] = top + Math.floor(c / BUILD_PANEL_COLS) * (tile + gap);
  }
  const header = Math.max(BUILD_PANEL_HEADER_MIN_CSS_PX * k, Math.min(BUILD_PANEL_HEADER_CSS_PX * k, top - pad - topRow));
  out.cardX = left - pad;
  out.cardY = top - pad - header;
  out.cardW = right - left + 2 * pad;
  out.cardH = bottom + pad - out.cardY;
  out.headerY = out.cardY + (pad + header) / 2;
  return out;
}

/**
 * Ready's left edge (canvas px): centred 40 px left of the screen centre (5.15), or further left when
 * that would bring its right edge within 12 px of `gridLeft` (D4: below ~640 px wide). Story 10.10:
 * `gridLeft` = the open panel's card (`layoutBuildPanel().cardX`), so Ready never moves when the panel opens.
 */
export function readyLeftX(width: number, readyW: number, gridLeft: number, k: number): number {
  const centred = (width - readyW) / 2 - READY_SHIFT_LEFT_CSS_PX * k;
  return Math.min(centred, gridLeft - READY_BAR_GAP_CSS_PX * k - readyW);
}

/**
 * Story 10.10 (B4): the left edge Ready keeps 12 px from — the open panel's card (fixed per layout, so
 * Ready never jumps when the panel opens). ↶'s one spot (`layoutUndoChip`) sits above Ready's row.
 */
export function readyClearLeft(p: Readonly<BuildPanelLayout>): number {
  return p.cardX;
}

/** Why a tile can't be picked now, or null. The cap first, then money (`placementError`'s order). */
export type PickError = "limit" | "money";

export function pickError(owned: number, cap: number, wallet: number, price: number): PickError | null {
  if (owned >= cap) return "limit";
  if (wallet < price) return "money";
  return null;
}

/** The toast for a refused pick (ux-spec §7.2 wording). Built on a tap only. */
export function pickRefusalText(e: PickError, price: number, wallet: number, cap: number): string {
  return e === "limit" ? `Building limit reached (${cap})` : `Need $${price} (you have $${wallet})`;
}

/** A tile's look bits: 1 = too expensive (40 % + red price), 2 = at the cap (40 %). */
export const TILE_SHORT = 1;
export const TILE_CAP = 2;

export function tileState(owned: number, cap: number, wallet: number, price: number): number {
  return (wallet < price ? TILE_SHORT : 0) | (owned >= cap ? TILE_CAP : 0);
}

/** What the GameScene feeds `stepBuildBar` each frame (one reused object). */
export interface BuildBarFrame {
  /** Placement is possible now (`canPlace`: a build phase, a run on screen, menu and shop closed, I'm alive). */
  can: boolean;
  /** I hold a building (5.15) / a building is selected (the repair panel; BX-7's action bar). */
  holding: boolean;
  selected: boolean;
  /** My buildings, the cap and my wallet, from this frame's World (server truth online). */
  owned: number;
  cap: number;
  wallet: number;
  /** Story 5.18 (Q2): the hand emptied less than `controls.build.barQuietMs` ago: a tap picks nothing (it was meant for Place). */
  quiet?: boolean;
}

/** `stepBuildBar`'s answer (one reused object): show the bar, pick this type ("" = none), toast this ("" = none). */
export interface BuildBarStep {
  show: boolean;
  pick: string;
  toast: string;
}

/**
 * Story 5.16: one frame of the build bar, before the input goes to the host. Consumes the HUD's
 * `buildPick`; a pick counts only if the bar was on screen when it was tapped (`buildBar` from the
 * last frame) and still may show now (AC 10). Cap, then money (AC 7) → a toast; otherwise the GameScene
 * starts the 5.15 hold with `pick`. Writes the model's bar fields (`buildBar` is then set by the caller
 * once it knows whether the hold started). Nothing is sent or charged here (AC 8).
 */
export function stepBuildBar(
  m: { buildBar: boolean; buildPick: string; buildItems: readonly BuildTile[]; buildOwned: number; buildCap: number },
  f: Readonly<BuildBarFrame>,
  out: BuildBarStep,
): BuildBarStep {
  const pick = m.buildPick;
  m.buildPick = "";
  const wasShown = m.buildBar;
  out.show = f.can && !f.holding && !f.selected;
  out.pick = "";
  out.toast = "";
  m.buildOwned = f.owned;
  m.buildCap = f.cap;
  if (pick === "" || !wasShown || !out.show || f.quiet === true) return out;
  const items = m.buildItems;
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as BuildTile;
    if (item.id !== pick) continue;
    const err = pickError(f.owned, f.cap, f.wallet, item.price);
    if (err !== null) out.toast = pickRefusalText(err, item.price, f.wallet, f.cap);
    else out.pick = pick;
    break;
  }
  return out;
}

/**
 * Story 10.10 (AC 6; review 4, 5): a touch while the panel is open.
 * - On a panel cell or Close (`ptile…`, `build`): nothing here (the button handles it).
 * - On the card itself (header, padding, an empty cell): consumed, the panel stays open.
 * - On another HUD button (Ready, ping, ☰, …): the panel closes and the button still gets the press.
 * - A touch in the move-stick half: the panel closes and the touch still starts the move stick.
 * - Anything else (a right-half touch, a world tap, a mouse click): the panel closes and the touch is
 *   consumed (no aim stick, no fire, no building selected).
 */
export const PANEL_TAP_NONE = 0;
export const PANEL_TAP_CLOSE = 1;
export const PANEL_TAP_CONSUME = 2;
export const PANEL_TAP_KEEP = 3;

export function panelTapOutside(open: boolean, hitId: string | null, onCard = false, moveStickTouch = false): number {
  if (!open) return PANEL_TAP_NONE;
  if (hitId !== null && (hitId === "build" || hitId.startsWith("ptile"))) return PANEL_TAP_NONE;
  if (onCard) return PANEL_TAP_KEEP;
  if (hitId !== null || moveStickTouch) return PANEL_TAP_CLOSE;
  return PANEL_TAP_CONSUME;
}

/** Story 10.10 (review 5): (x, y) on the open panel's card (canvas px). */
export function onPanelCard(p: Readonly<BuildPanelLayout>, x: number, y: number): boolean {
  return x >= p.cardX && x <= p.cardX + p.cardW && y >= p.cardY && y <= p.cardY + p.cardH;
}

/**
 * Story 10.10 (review 1, 2): right after a Place or ✕ empties my hands (5.18's `barQuietMs`), the next
 * thumb tap was meant for the hand cluster: swap, quick-use, Build and (re-review 1: 568 × 320 with insets,
 * under ⟳) Ready sit where Place, ⟳ and ✕ were, so their presses are dropped then — like the build tiles'
 * (`stepBuildBar`'s `quiet`) and the Shop chip's. ↶ too (belt and braces: its one spot is clear of all three).
 */
/**
 * Story 10.10 (re-review 2, M): ↶'s one spot (B15) lies under the open panel's cells 0 and 3. A pick there
 * closes the panel and starts the hold, and ↶ shows in the hand cluster on that same spot, so a double tap
 * on a pick would sell my last building. ↶'s press is dropped within `quietMs` of a hold started from the
 * panel or the quick tile (`sincePickMs`: time since that pick; Infinity = none).
 */
export function dropUndoAfterPick(m: { undoPressed: boolean }, sincePickMs: number, quietMs: number): void {
  if (sincePickMs < quietMs) m.undoPressed = false;
}

export function dropQuietPresses(m: { undoPressed: boolean; swapPressed: boolean; consumablePressed: boolean; buildPanelPressed: boolean; readyPressed: boolean }, quiet: boolean): void {
  if (!quiet) return;
  m.undoPressed = m.swapPressed = m.consumablePressed = m.buildPanelPressed = m.readyPressed = false;
}

/**
 * Story 10.10 (AC 6): whether the open panel stays open this frame. It closes when the cluster is no
 * longer up (`shown` = `HudModel.buildBar`: the phase ended, I'm downed, the menu or the shop opened, I
 * hold a building, a building got selected, I'm waiting), on a pick, when the ping wheel opens, and
 * when there is no panel (BU-3: ≤ 2 types). Close / Build, B, Esc and a tap outside close it elsewhere.
 */
export function panelStaysOpen(open: boolean, shown: boolean, picked: boolean, wheelOpen: boolean, itemCount: number): boolean {
  return open && shown && !picked && !wheelOpen && panelAllowed(itemCount);
}

/** Story 10.10 (AC 9): B toggles the panel — only while the cluster is on screen and there is a panel (BU-3). */
export function togglePanelKey(m: { buildPanelOpen: boolean; buildBar: boolean; buildItems: readonly BuildTile[] }): void {
  if (!m.buildBar || !panelAllowed(m.buildItems.length)) return;
  m.buildPanelOpen = !m.buildPanelOpen;
}
