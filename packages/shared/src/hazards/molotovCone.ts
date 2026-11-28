import { ticksFor } from "../core/time";
import { headingToRad, quantizeHeading } from "../net/heading";

/**
 * Story 9.18 (MO-R, designer 2026-11-28): the molotov's fire zone is a teardrop pointing along the
 * throw — the page's "uneven capsule" `sdCone` (docs/art/photoreal-5/src/fire-r2.ts): a round back of
 * radius r0 = `backM` around the impact, widening at `halfAngleDeg` to a round front cap of radius
 * r1 = r0 + d·sin(half) centred d = (reachEnd − r0) / (1 + sin(half)) ahead, so its tip is `reachEndM`
 * ahead of the impact. It grows self-similarly from the impact (B1): scale
 * k(age) = (reachStart + (reachEnd − reachStart)·easeOut(age / grow)) / reachEnd, easeOut(x) = 1 − (1 − x)³.
 * It is cut by a half-plane at `clipM` along the throw (B3: the first shot blocker ahead).
 *
 * Pure and allocation-free after `molotovConeShape` (called once per balance). The sim
 * (`hazards/molotov.ts › molotovZoneAt`) and the client (its drawing, its aim marker) use these same
 * functions, so the fire is exactly where it is drawn (M-A).
 *
 * Frame: u along the throw from the impact, v across it (left or right: the shape is symmetric).
 */
export interface MolotovConeShape {
  readonly reachStartM: number;
  readonly reachEndM: number;
  /** `ticksFor(growS)`; 0 = full size at once. */
  readonly growTicks: number;
  /** Full-size back radius r0 (m). */
  readonly r0: number;
  /** Full-size front-circle centre d ahead (m) and its radius r1 (m). */
  readonly d: number;
  readonly r1: number;
  /** The capsule's side-line constants (Inigo Quilez's uneven capsule). */
  readonly sb: number;
  readonly sa: number;
  readonly saD: number;
  /** Full-size bounding circle: centre `boundU` ahead of the impact, radius `boundR` (B4). */
  readonly boundU: number;
  readonly boundR: number;
}

export interface MolotovConeConfig {
  readonly reachStartM: number;
  readonly reachEndM: number;
  readonly growS: number;
  readonly halfAngleDeg: number;
  readonly backM: number;
}

/** The precomputed constants of a cone config (call once; the consumables table caches it). */
export function molotovConeShape(c: MolotovConeConfig): MolotovConeShape {
  const sinA = Math.sin((c.halfAngleDeg * Math.PI) / 180);
  const r0 = c.backM;
  const d = (c.reachEndM - r0) / (1 + sinA);
  const r1 = r0 + d * sinA;
  const sb = (r0 - r1) / d;
  const sa = Math.sqrt(1 - sb * sb);
  return Object.freeze({
    reachStartM: c.reachStartM,
    reachEndM: c.reachEndM,
    growTicks: ticksFor(c.growS),
    r0,
    d,
    r1,
    sb,
    sa,
    saD: sa * d,
    boundU: d / 2,
    boundR: d / 2 + r1,
  });
}

/** The page's `easeOut` (kit.ts:156): 1 − (1 − clamp01(x))³. */
export function coneEaseOut(x: number): number {
  const c = x <= 0 ? 0 : x >= 1 ? 1 : x;
  const m = 1 - c;
  return 1 - m * m * m;
}

/** The zone's scale `ageTicks` after landing: reach(age) / reachEnd (0 < k ≤ 1). */
export function coneScaleAt(s: MolotovConeShape, ageTicks: number): number {
  const x = s.growTicks <= 0 ? 1 : ageTicks / s.growTicks;
  return (s.reachStartM + (s.reachEndM - s.reachStartM) * coneEaseOut(x)) / s.reachEndM;
}

/** Signed distance (m) from (u, v) to the FULL-SIZE teardrop; < 0 inside. Exact (the page's `sdCone`). */
export function sdConeFull(s: MolotovConeShape, u: number, v: number): number {
  const px = v < 0 ? -v : v;
  const py = u;
  const q = -s.sb * px + s.sa * py;
  if (q < 0) return Math.sqrt(px * px + py * py) - s.r0;
  if (q > s.saD) {
    const ey = py - s.d;
    return Math.sqrt(px * px + ey * ey) - s.r1;
  }
  return s.sa * px + s.sb * py - s.r0;
}

/**
 * Signed distance (m) from (u, v) to the zone at scale `k`, cut at `clipM` along the throw: the
 * intersection max(sdCone(p / k)·k, u − clipM). A body of radius r burns when this is < r (strict).
 */
export function sdMolotovZone(s: MolotovConeShape, k: number, clipM: number, u: number, v: number): number {
  const sd = sdConeFull(s, u / k, v / k) * k;
  const c = u - clipM;
  return c > sd ? c : sd;
}

/**
 * The throw direction the zone uses (B2): (dx, dy) quantised to the wire's u8 heading, so the sim and
 * every client hold the same vector to the bit. A zero vector gives heading 0, i.e. (1, 0).
 */
export function coneHeading(dx: number, dy: number): number {
  return quantizeHeading(dx, dy);
}
/** The unit vector of a u8 heading (the sim's and the client's one formula). */
export function coneDirX(heading: number): number {
  return Math.cos(headingToRad(heading));
}
export function coneDirY(heading: number): number {
  return Math.sin(headingToRad(heading));
}

/** `clipM` as it goes on the wire and in the sim: floored to whole centimetres (never longer than the free run). */
export function coneClipCm(clipM: number): number {
  return Math.max(0, Math.floor(clipM * 100 + 1e-9));
}
