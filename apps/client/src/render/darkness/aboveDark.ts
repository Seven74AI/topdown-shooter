/**
 * Story 6.3: the depth band above the blackout darkness (DD7). The darkness layer draws at
 * `DARKNESS_DEPTH`; everything that must read in the dark (brief line 24) draws in one of the named
 * slots between it and the rain (11.8). Rule: a view that must read in the dark draws in a slot;
 * nothing else goes above 11.7. Today's highest world depths (embers, lobbed rounds' air marks,
 * ≤ 11.62) stay under the darkness.
 */
export const DARKNESS_DEPTH = 11.7;

/** Named depth slots above the darkness, below the rain (11.8), vignette (11.9) and build UI (≥ 12). */
export const ABOVE_DARK = {
  /** Rain sparkles inside beams and floodlight pools (6.3). */
  sparkle: 11.705,
  /** Zombie eyes within 14 m (6.3; the Behemoth's eyes: 6.5). */
  eyes: 11.71,
  /** The Behemoth's outline and eyes (6.5). */
  boss: 11.72,
  /** Every boss telegraph (6.5–6.7). */
  telegraph: 11.73,
  /** Survivors: body, slot ring, name (6.3). */
  teammate: 11.74,
  /** Pick-ups: the supply crate, the survivor NPC (6.9, 6.10). */
  pickup: 11.75,
  /** Event map markers and the safe point (6.8–6.10). */
  marker: 11.76,
  /** The red rush chevrons over the wave's last zombies (FR30; review L4: kept above the dark). */
  rush: 11.765,
  /** Pings (Epic 8.7). */
  ping: 11.77,
} as const;

export type AboveDarkSlot = keyof typeof ABOVE_DARK;

/** Anything with a Phaser-style `setDepth` (images, graphics, texts, containers). */
export interface HasDepth {
  setDepth(value: number): unknown;
}

/** Puts `obj` in an above-the-darkness slot (call once when the object is made, or on `blackoutChanged`). */
export function aboveDarkness<T extends HasDepth>(obj: T, slot: AboveDarkSlot): T {
  obj.setDepth(ABOVE_DARK[slot]);
  return obj;
}
