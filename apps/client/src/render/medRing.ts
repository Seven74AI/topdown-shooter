/**
 * Story 5.10 (AC 10): how a med station's reach reads. A soft green ring at EXACTLY the heal edge:
 * the sim heals a body whose circle overlaps the heal circle (centre distance < radius + body
 * radius, `updateMedStations`), so the ring is drawn at the heal radius itself — **your body touches
 * the ring = you heal** (the 4.8 fire-ring rule). Look from the MS10 card (looks.html › healRing): a
 * crisp ~2 px line on the edge, a softer ~6 px band just inside it, a faint green wash inside.
 */
export const MED_RING_WIDTH_PX = 2;
export const MED_RING_COLOR = 0x8dffb0;
export const MED_RING_ALPHA = 0.9;
/** The soft band just inside the line (~6 px, centred 3 px inside the edge). */
export const MED_RING_BAND_PX = 6;
export const MED_RING_BAND_COLOR = 0x7dffa0;
export const MED_RING_BAND_ALPHA = 0.25;
/** A faint fill inside the ring (the "safe spot" reads from afar). */
export const MED_RING_FILL_COLOR = 0x5adc82;
export const MED_RING_FILL_ALPHA = 0.06;

/** The ring's radius (m): the heal radius — a body touching it overlaps the heal circle. */
export function medRingRadiusM(healRadiusM: number): number {
  return healRadiusM;
}

/** The sim's rule, for the test that pins the ring to it: a body at `d` from the centre heals. */
export function bodyHeals(d: number, healRadiusM: number, bodyRadiusM: number): boolean {
  return d < healRadiusM + bodyRadiusM;
}

/** The ring's line width in metres for a camera zoom (device px per metre): always ~2 px on screen. */
export function medRingWidthM(zoomPxPerM: number): number {
  return MED_RING_WIDTH_PX / Math.max(1e-6, zoomPxPerM);
}
