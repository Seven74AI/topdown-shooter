/**
 * Story 4.8 review M3: how a burning zone reads. One crisp ember ring at EXACTLY the damage edge:
 * the sim burns a body whose circle overlaps the zone (centre within zone radius + body radius,
 * `circleInFire`), so the ring is drawn at the zone radius itself — **your body touches the ring =
 * you burn**. A few flickering ember dots ride on it. The scorch stays near full strength out to
 * `SCORCH_FULL_FRAC` of the radius and falls off hard at the ring; the fire's light stays inside it.
 */
export const FIRE_RING_WIDTH_PX = 2;
export const FIRE_RING_COLOR = 0xff7828;
export const FIRE_RING_ALPHA = 0.55;
export const FIRE_EMBERS = 8;
export const FIRE_EMBER_M = 0.22;
/** Ember drift round the ring (radians per second) and flicker rate. */
export const FIRE_EMBER_DRIFT = 0.15;
export const FIRE_EMBER_FLICKER_HZ = 7;
/** Scorch: near full strength to this fraction of the radius, then a hard falloff to 0 at the ring. */
export const SCORCH_FULL_FRAC = 0.9;

export interface FireZone {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
}

/** The ring's radius (metres): the zone radius — a body touching it overlaps the zone. */
export function fireRingRadiusM(f: FireZone): number {
  return f.radiusM;
}

/** Ember `i` of `n` on fire `f`'s ring at time `t` (seconds), into `out` (no allocation). */
export function emberSpot(f: FireZone, i: number, n: number, t: number, out: { x: number; y: number }): void {
  const a = (i / n) * 2 * Math.PI + t * FIRE_EMBER_DRIFT * (i % 2 === 0 ? 1 : -1);
  const r = fireRingRadiusM(f);
  out.x = f.x + Math.cos(a) * r;
  out.y = f.y + Math.sin(a) * r;
}

/** The ring's line width in metres for a camera zoom (device px per metre): always ~2 px on screen. */
export function fireRingWidthM(zoomPxPerM: number): number {
  return FIRE_RING_WIDTH_PX / Math.max(1e-6, zoomPxPerM);
}

/**
 * Story 4.8 re-review L3: strokes the ring of the first `max` zones on `g` (CityView's Graphics) at
 * `fireRingRadiusM`; pure over a `strokeCircle` sink so the radius drawn is pinned by a test.
 */
export function strokeFireRings(g: { strokeCircle(x: number, y: number, r: number): unknown }, fires: readonly FireZone[], max: number): void {
  for (let i = 0; i < fires.length && i < max; i++) {
    const f = fires[i] as FireZone;
    g.strokeCircle(f.x, f.y, fireRingRadiusM(f));
  }
}
