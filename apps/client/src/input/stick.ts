export interface StickVector {
  x: number;
  y: number;
  /** 0 inside the dead zone, rising linearly to 1 at the stick's rim. */
  magnitude: number;
}

/**
 * Floating-stick math (pure). The base stays where the thumb landed.
 * Below `deadZone` (fraction of the radius) → zero; from there to the rim, magnitude
 * rescales linearly from 0 to 1 (GDD: dead zone 10%, full speed at 100%). Past the rim it stays 1.
 * `fullSpeed` (the "Always full speed" setting): past the dead zone the magnitude is always 1.
 */
export function stickVector(
  originX: number,
  originY: number,
  x: number,
  y: number,
  radiusPx: number,
  deadZone: number,
  out: StickVector = { x: 0, y: 0, magnitude: 0 },
  fullSpeed = false,
): StickVector {
  const dx = x - originX;
  const dy = y - originY;
  const d = Math.sqrt(dx * dx + dy * dy);
  const m = radiusPx > 0 ? Math.min(d / radiusPx, 1) : 0;
  if (d === 0 || m < deadZone) {
    out.x = 0;
    out.y = 0;
    out.magnitude = 0;
    return out;
  }
  const scaled = fullSpeed || deadZone >= 1 ? 1 : (m - deadZone) / (1 - deadZone);
  out.x = (dx / d) * scaled;
  out.y = (dy / d) * scaled;
  out.magnitude = scaled;
  return out;
}

/** Raw direction and deflection (0..1, no dead zone): used to aim without firing (Story 1.5). */
export function stickDeflection(originX: number, originY: number, x: number, y: number, radiusPx: number): number {
  const d = Math.hypot(x - originX, y - originY);
  return radiusPx > 0 ? Math.min(d / radiusPx, 1) : 0;
}
