/**
 * Story 4.8 review M3: how a burning zone reads. One crisp thin ring at EXACTLY the damage edge:
 * the sim burns a body whose circle overlaps the zone (centre within zone radius + body radius,
 * `circleInFire`), so the ring is drawn at the zone radius itself — **your body touches the ring =
 * you burn** (Story 4.12: the code fire's flames end on it, `fireParticles.ts`). The scorch stays near full strength out to
 * `SCORCH_FULL_FRAC` of the radius and falls off hard at the ring; the fire's light stays inside it.
 */
export const FIRE_RING_WIDTH_PX = 2;
export const FIRE_RING_COLOR = 0xff7828;
export const FIRE_RING_ALPHA = 0.55;
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

/**
 * Story 4.12 (fire-lab panel D): a soft band ~5 px wide just INSIDE the ring (its outer side on R),
 * additive, pulsing with the damage tick: alpha `FIRE_RING_GLOW_ALPHA` + `FIRE_RING_GLOW_PULSE` × pulse.
 */
export const FIRE_RING_GLOW_PX = 5;
export const FIRE_RING_GLOW_ALPHA = 0.1;
export const FIRE_RING_GLOW_PULSE = 0.08;

export function fireRingGlowAlpha(pulse: number): number {
  return FIRE_RING_GLOW_ALPHA + FIRE_RING_GLOW_PULSE * Math.min(1, Math.max(0, pulse));
}

/** Strokes the glow band of the first `max` zones, centred half a band inside R (its outer edge on R). */
export function strokeFireRingGlows(g: { strokeCircle(x: number, y: number, r: number): unknown }, fires: readonly FireZone[], max: number, zoomPxPerM: number): void {
  const half = FIRE_RING_GLOW_PX / 2 / Math.max(1e-6, zoomPxPerM);
  for (let i = 0; i < fires.length && i < max; i++) {
    const f = fires[i] as FireZone;
    g.strokeCircle(f.x, f.y, Math.max(0, fireRingRadiusM(f) - half));
  }
}

/**
 * The damage-tick pulse (0..1): a kick at each `pulseS` boundary of the view's clock that fades
 * over the pulse (cosmetic: the server's per-body burn clocks are not synced; the rhythm matches).
 */
export function damageTickPulse(tS: number, pulseS: number): number {
  if (!(pulseS > 0)) return 0;
  const ph = (tS % pulseS) / pulseS;
  return Math.exp(-ph * 5);
}
