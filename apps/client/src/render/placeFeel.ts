import type { BuildingTypeStats } from "@topdown/shared";

/**
 * Story 5.23 (BX-9, ux-spec §10): the placement feel's pure rules and curves (no Phaser), shared by
 * `PlaceFxView`, `BuildingView` and the GameScene. Presentation constants (not gameplay); the pool
 * caps are in `controls.json › fx` (brief line 12).
 */

/** AC 1: the pick pop: the ghost grows from this scale to 1 over `PICK_POP_MS`. */
export const PICK_POP_FROM = 0.8;
export const PICK_POP_MS = 120;
/** AC 2: a placed building's art drops this far (m) to the ground over `DROP_MS`. */
export const DROP_FROM_M = 0.15;
export const DROP_MS = 120;
/** AC 2: dust per puff, its life (s), outward speed (m/s), sizes (m) and start alpha. */
export const DUST_PER_PUFF = 8;
export const DUST_LIFE_S = 0.4;
export const DUST_SPEED_MPS = 0.7;
export const DUST_SIZE_FROM_M = 0.12;
export const DUST_SIZE_TO_M = 0.05;
export const DUST_ALPHA = 0.7;
/** D6: wet dust under the night grade (a light grey-brown). */
export const DUST_COLOR = 0xa89c88;
/** AC 2 / D4: a teammate's placement farther than this (m) from my survivor plays at `FAR_VOLUME`. */
export const FAR_PLACE_M = 12;
export const FAR_VOLUME = 0.4;
/** AC 6: a `building.placed` older than this (s) is a woken tab's backlog: no sound, haptic or dust. */
export const STALE_PLACE_S = 1;
/** AC 4 / D7: the owner corner tab (3 s: full for 2.6 s, then fading), its arms and thickness (m). */
export const TAB_LIFE_MS = 3000;
export const TAB_FADE_MS = 400;
export const TAB_ARM_M = 0.4;
export const TAB_THICK_M = 0.08;
/** AC 4 / D7: the owner dot (diameter, inset of its centre from the min corner, outline; m). */
export const DOT_DIAMETER_M = 0.18;
export const DOT_INSET_M = 0.2;
export const DOT_OUTLINE_M = 0.03;
/** D7: an owner who left (slot −1). */
export const OWNER_LEFT_COLOR = 0x9e9e9e;
/** AC 2 / AC 3: the haptics (ms; Android only). */
export const PLACED_HAPTIC_MS = 12;
export const REFUSED_HAPTIC: readonly number[] = Object.freeze([30, 40, 30]);

export type PlaceSoundKind = "thunk" | "clank" | "click";

/** D3: floor types click; wooden walls thunk; every other solid type (metal, turret, lamp, med station) clanks. */
export function placeSoundKind(type: string, stats: Readonly<Pick<BuildingTypeStats, "solid">> | undefined): PlaceSoundKind {
  if (stats && !stats.solid) return "click";
  if (type === "wood_barricade" || type === "reinforced_barricade") return "thunk";
  return "clank";
}

/** AC 1 (D1): the ghost's scale `ms` after a pick (ease-out cubic), 1 once done; NaN / negative → 1. */
export function pickPopScale(ms: number): number {
  if (!(ms >= 0) || ms >= PICK_POP_MS) return 1;
  const t = ms / PICK_POP_MS;
  const e = 1 - (1 - t) * (1 - t) * (1 - t);
  return PICK_POP_FROM + (1 - PICK_POP_FROM) * e;
}

/** AC 2 (D5): how high (m) the art still floats `ms` after the placement (ease-in: it falls and lands), 0 once down. */
export function dropOffsetM(ms: number): number {
  if (!(ms >= 0) || ms >= DROP_MS) return 0;
  const t = ms / DROP_MS;
  return DROP_FROM_M * (1 - t * t);
}

/** AC 4 (D7): a tab's alpha `ms` after the placement: 1, then fading over the last `TAB_FADE_MS`, 0 after `TAB_LIFE_MS`. */
export function tabAlpha(ms: number): number {
  if (!(ms >= 0) || ms >= TAB_LIFE_MS) return 0;
  const fadeAt = TAB_LIFE_MS - TAB_FADE_MS;
  return ms <= fadeAt ? 1 : 1 - (ms - fadeAt) / TAB_FADE_MS;
}

/** AC 2 (D4): the volume of a placement's sound: mine 1; a teammate's beyond `FAR_PLACE_M` of my survivor `FAR_VOLUME`. */
export function placeVolume(mine: boolean, dx: number, dy: number): number {
  if (mine) return 1;
  return dx * dx + dy * dy > FAR_PLACE_M * FAR_PLACE_M ? FAR_VOLUME : 1;
}

/** AC 6: whether a placed event is fresh enough for sound, haptic and dust (`ageS` absent = solo / now). */
export function freshPlace(ageS: number | undefined, hidden: boolean): boolean {
  return !hidden && (ageS ?? 0) <= STALE_PLACE_S;
}

/** AC 4 (D7): the owner's ring colour (2.9 slot colours), grey for a left player or an unknown slot. */
export function ownerColor(slot: number, colors: readonly number[]): number {
  return slot >= 0 && slot < colors.length ? (colors[slot] as number) : OWNER_LEFT_COLOR;
}
