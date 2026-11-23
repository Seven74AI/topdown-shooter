import type { Building } from "@topdown/shared";

/** Story 3.5: pure helpers of `BuildingView` (no Phaser, so they can be unit-tested). */
/** Lost quarters of HP: 0 at full, 1 below 100 %, … 4 below 25 %. */
export function damageStage(frac: number): number {
  return frac >= 1 ? 0 : Math.min(4, 1 + Math.floor((1 - frac) * 4));
}

/** `color` (0xRRGGBB) darkened by `amount` (0–1). Plain math: no allocation. */
export function darken(color: number, amount: number): number {
  const k = 1 - Math.min(1, Math.max(0, amount));
  const r = Math.round(((color >> 16) & 0xff) * k);
  const gr = Math.round(((color >> 8) & 0xff) * k);
  const bl = Math.round((color & 0xff) * k);
  return (r << 16) | (gr << 8) | bl;
}


/**
 * Review L3: a checksum of every building's (id, HP) in list order, so one building losing X and
 * another gaining X in the same frame (a hit and a repair) still redraws. FNV-1a: no allocation.
 */
export function hpChecksum(list: readonly Building[]): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    h = Math.imul(h ^ b.id, 0x01000193);
    h = Math.imul(h ^ Math.round(b.hp * 16), 0x01000193);
  }
  return h >>> 0;
}

/** Story 5.9 (AC 16): the HP bar's steps (a 300 HP trap redraws every 15 HP, not on every spike). */
export const BAR_STEPS = 20;

/**
 * Story 5.9: the HP fraction as drawn: 1 at full HP, else rounded UP to the bar's step and never
 * above the last step below full (the first hit always shows; then one redraw per step).
 */
export function barFraction(b: Pick<Building, "hp" | "maxHp">): number {
  if (b.maxHp <= 0 || b.hp >= b.maxHp) return 1;
  const f = Math.max(0, b.hp / b.maxHp);
  return Math.min((BAR_STEPS - 1) / BAR_STEPS, Math.ceil(f * BAR_STEPS) / BAR_STEPS);
}

/**
 * Story 5.9 (AC 16): the buildings layer's redraw key: every building's (id, drawn bar step) in list
 * order (FNV-1a, no allocation). Raw HP changes inside a step (a trap worn by one spike) keep it.
 */
export function buildingDrawKey(list: readonly Building[]): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    h = Math.imul(h ^ b.id, 0x01000193);
    h = Math.imul(h ^ Math.round(barFraction(b) * BAR_STEPS), 0x01000193);
  }
  return h >>> 0;
}

/**
 * Story 5.9 review M1: the redraw key of the buildings drawn as plank boxes (no art frame: turrets),
 * whose wear is drawn into the shadow layer. Only their bar steps: traps and walls wearing never
 * change it, so a crowd on the spikes next to a turret never re-lays the layer.
 */
export function boxDrawKey(list: readonly Building[], isBox: (type: string) => boolean): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (!isBox(b.type)) continue;
    h = Math.imul(h ^ b.id, 0x01000193);
    h = Math.imul(h ^ Math.round(barFraction(b) * BAR_STEPS), 0x01000193);
  }
  return h >>> 0;
}
