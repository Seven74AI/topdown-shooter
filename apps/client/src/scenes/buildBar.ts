import { ALL_UNLOCKED, buildingStats, inPoolOnly, shopBuildings, turretStats, type Balance } from "@topdown/shared";
import {
  BUILD_BAR_COLS,
  BUILD_BAR_INSET_CSS_PX,
  BUILD_BAR_ROWS,
  BUILD_COUNT_GAP_CSS_PX,
  BUILD_TILE_CSS_PX,
  BUILD_TILE_GAP_CSS_PX,
  READY_BAR_GAP_CSS_PX,
  READY_SHIFT_LEFT_CSS_PX,
} from "../ui/sizes";

/**
 * Story 5.16 (BX-2, ux-spec §3–§4): the build bar, the right-thumb cluster's "hands empty" state in
 * a build phase. Pure helpers (no Phaser): the tile list from balance, which item each slot shows,
 * the layout, and the pick rule (cap before money, as `placementError`). The HudScene draws it, the
 * GameScene decides when it shows and runs the pick.
 */

/** Slots in the grid (4 × 2). */
export const BUILD_BAR_SLOTS = BUILD_BAR_COLS * BUILD_BAR_ROWS;
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

export interface BuildBarLayout {
  /** Tile top-left corners (canvas px), slot order; every tile is `tile` × `tile`. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  tile: number;
  /** The grid's left and top edges, and the count line's bottom-right anchor (canvas px). */
  left: number;
  top: number;
  countX: number;
  countY: number;
}

export function newBuildBarLayout(): BuildBarLayout {
  return { x: new Float32Array(BUILD_BAR_SLOTS), y: new Float32Array(BUILD_BAR_SLOTS), tile: 0, left: 0, top: 0, countX: 0, countY: 0 };
}

/**
 * The grid's tiles, measured from the bottom-right safe-area corner (insets in CSS px, `k` = dpr()):
 * 4 × 2 tiles of 56 px with 8 px gaps, 16 px inside the insets; the count line right-aligned 4 px
 * above the grid. Written into `out` (layout only, no allocation).
 */
export function layoutBuildBar(width: number, height: number, insetRight: number, insetBottom: number, k: number, out: BuildBarLayout): BuildBarLayout {
  const tile = BUILD_TILE_CSS_PX * k;
  const gap = BUILD_TILE_GAP_CSS_PX * k;
  const right = width - (BUILD_BAR_INSET_CSS_PX + insetRight) * k;
  const bottom = height - (BUILD_BAR_INSET_CSS_PX + insetBottom) * k;
  out.tile = tile;
  out.left = right - BUILD_BAR_COLS * tile - (BUILD_BAR_COLS - 1) * gap;
  out.top = bottom - BUILD_BAR_ROWS * tile - (BUILD_BAR_ROWS - 1) * gap;
  for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
    const col = s % BUILD_BAR_COLS;
    const row = Math.floor(s / BUILD_BAR_COLS);
    out.x[s] = out.left + col * (tile + gap);
    out.y[s] = out.top + row * (tile + gap);
  }
  out.countX = right;
  out.countY = out.top - BUILD_COUNT_GAP_CSS_PX * k;
  return out;
}

/**
 * Ready's left edge (canvas px): centred 40 px left of the screen centre (5.15), or further left when
 * that would bring its right edge within 12 px of the grid (D4: below ~640 px wide).
 */
export function readyLeftX(width: number, readyW: number, gridLeft: number, k: number): number {
  const centred = (width - readyW) / 2 - READY_SHIFT_LEFT_CSS_PX * k;
  return Math.min(centred, gridLeft - READY_BAR_GAP_CSS_PX * k - readyW);
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
