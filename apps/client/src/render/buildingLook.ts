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
