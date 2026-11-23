import { FLAME_STEPS, FLAME_TINTS, FLAME_VARIANTS } from "./city/fireSprites";
import { FxRandom } from "./city/fireParticles";

/**
 * Story 5.4: the flame stream as particles (pure: no Phaser), the 4.12 particle approach with the
 * round C looks: FS1 "fuel jet" (the Flamethrower: a tight bright jet that blooms into rolling fire
 * at its far end) and FS2 "gas torch cone" (the Gas torch: a roaring cone, blue-white at the
 * nozzle, yellow, then orange at its edge).
 *
 * ONE shared pool for every flamer (`combat.json › fx.maxFlameParticles`), emitted at
 * `fx.flameParticlesPerS` per flamer (frame-rate independent, a carry per flamer). Each particle
 * flies along one ray of the cone; at spawn its ray is cut at the first shot blocker (`clip`: the
 * sim's `shotBlockT` on the mirror World), so the drawn fire stops at a car's face exactly where
 * the damage does (FR-B), and never past the cone's reach (FR-A). The bright part of a particle
 * stays inside the cone: its width grows with distance at most as the cone does.
 *
 * Positions are relative to nothing: world metres. No allocation after construction.
 */
export const FLAME_STYLE = { JET: 0, TORCH: 1 } as const;
export type FlameStyle = (typeof FLAME_STYLE)[keyof typeof FLAME_STYLE];

/** Look numbers per style (cosmetic only; the damage geometry comes from balance). */
const STYLE = [
  // FS1 fuel jet: a narrow, fast core (rays mostly within 60 % of the half-angle) that blooms late.
  { lifeS: [0.42, 0.55], spread: 0.6, w0: 0.14, bloom: 0.85, alpha: 0.85, blueFrac: 0 },
  // FS2 gas torch: fills the whole cone at once, short-lived, blue core at the nozzle.
  { lifeS: [0.3, 0.42], spread: 1.0, w0: 0.16, bloom: 0.8, alpha: 0.72, blueFrac: 0.28 },
] as const;

/** The blue-white of a gas torch's core (FS2), before the yellow ramp starts. */
export const TORCH_BLUE = 0x9cc4ff;

/** Clips a ray: the share t ∈ [0, 1] of (x0, y0) → (x1, y1) before the first shot blocker, or < 0 for none. */
export type RayClip = (x0: number, y0: number, x1: number, y1: number) => number;

/** One drawn particle (world metres; `rot` radians; `tint` 0xRRGGBB; `frame` a flame variant). */
export interface JetDraw {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  alpha: number;
  tint: number;
  frame: number;
}

export class FlameJets {
  n = 0;
  readonly cap: number;
  readonly alive: Uint8Array;
  /** Ray origin (the cone's apex: the sim's muzzle), unit direction, start and end distance on it. */
  readonly ox: Float32Array;
  readonly oy: Float32Array;
  readonly dx: Float32Array;
  readonly dy: Float32Array;
  readonly d0: Float32Array;
  readonly d1: Float32Array;
  /** The cone's reach (the bloom's reference), half-angle tangent and half-angle, and the ray's angle off the aim. */
  readonly reach: Float32Array;
  readonly tanH: Float32Array;
  readonly half: Float32Array;
  readonly ra: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly seed: Float32Array;
  readonly style: Uint8Array;
  private cur = 0;
  private readonly carry = new Float32Array(8);
  private readonly rnd = new FxRandom(0x5a4f17);

  constructor(cap: number) {
    this.cap = cap;
    this.alive = new Uint8Array(cap);
    this.ox = new Float32Array(cap);
    this.oy = new Float32Array(cap);
    this.dx = new Float32Array(cap);
    this.dy = new Float32Array(cap);
    this.d0 = new Float32Array(cap);
    this.d1 = new Float32Array(cap);
    this.reach = new Float32Array(cap);
    this.tanH = new Float32Array(cap);
    this.half = new Float32Array(cap);
    this.ra = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.seed = new Float32Array(cap);
    this.style = new Uint8Array(cap);
  }

  /**
   * Emits flamer `k`'s particles for `dtS` s: cone apex (ox, oy), unit aim (dirX, dirY), reach and
   * half-angle (rad), particles start `nozzleM` along their ray (the drawn nozzle). Returns how many.
   */
  emit(k: number, dtS: number, ratePerS: number, style: FlameStyle, ox: number, oy: number, dirX: number, dirY: number, reachM: number, halfRad: number, nozzleM: number, clip: RayClip): number {
    const slot = k & 7;
    const a = (this.carry[slot] as number) + ratePerS * Math.max(0, Math.min(0.1, dtS));
    let count = Math.floor(a);
    this.carry[slot] = a - count;
    const S = STYLE[style];
    const r = this.rnd;
    let made = 0;
    while (count-- > 0) {
      const i = this.free();
      if (i < 0) break;
      // a ray inside the cone (the jet keeps most of its fuel near the axis)
      const u = (r.next() * 2 - 1) * S.spread;
      const ang = u * Math.abs(u) ** 0.35 * halfRad;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const rx = dirX * c - dirY * s;
      const ry = dirX * s + dirY * c;
      const t = clip(ox, oy, ox + rx * reachM, oy + ry * reachM);
      const end = t >= 0 ? t * reachM : reachM;
      if (end <= nozzleM + 0.05) continue; // the nozzle is at a car's face: nothing flies (FR-B)
      this.alive[i] = 1;
      this.n++;
      this.ox[i] = ox;
      this.oy[i] = oy;
      this.dx[i] = dirX; // the aim; the ray is the aim turned by `ra`
      this.dy[i] = dirY;
      this.ra[i] = ang;
      this.half[i] = halfRad;
      this.d0[i] = nozzleM;
      this.d1[i] = end;
      this.reach[i] = reachM;
      this.tanH[i] = Math.tan(halfRad);
      this.age[i] = 0;
      this.life[i] = r.range(S.lifeS[0], S.lifeS[1]);
      this.seed[i] = r.next();
      this.style[i] = style;
      made++;
    }
    return made;
  }

  private free(): number {
    if (this.n >= this.cap) return -1;
    for (let k = 0; k < this.cap; k++) {
      const i = (this.cur + k) % this.cap;
      if (!this.alive[i]) {
        this.cur = (i + 1) % this.cap;
        return i;
      }
    }
    return -1;
  }

  /** Ages every particle (`dtS` clamped: a woken tab never fast-forwards). */
  step(dtS: number): void {
    const dt = Math.max(0, Math.min(0.05, dtS));
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const a = (this.age[i] as number) + dt;
      this.age[i] = a;
      if (a >= (this.life[i] as number)) {
        this.alive[i] = 0;
        this.n--;
      }
    }
  }

  /** Distance of particle `i` from the apex along its ray (eased: fast out of the nozzle, slowing). */
  dist(i: number): number {
    const u = Math.min(1, (this.age[i] as number) / (this.life[i] as number));
    const e = 1 - (1 - u) * (1 - u);
    const d0 = this.d0[i] as number;
    const reach = this.reach[i] as number;
    return Math.min(this.d1[i] as number, d0 + (reach - d0) * e);
  }

  /** Particle `i` → `out` (false when not drawn). The bright core stays inside the cone and the clip. */
  draw(i: number, T: number, out: JetDraw): boolean {
    if (!this.alive[i]) return false;
    const S = STYLE[this.style[i] as number] ?? STYLE[0];
    const u = (this.age[i] as number) / (this.life[i] as number);
    const d = this.dist(i);
    const reach = this.reach[i] as number;
    const frac = d / reach; // 0 at the apex, 1 at the reach
    const seed = this.seed[i] as number;
    // across: grows with distance, never wider than the cone there (the bright part inside it)
    const coneW = 2 * d * (this.tanH[i] as number);
    const bloom = frac > S.bloom ? 1 + (frac - S.bloom) * 3 : 1;
    const w = Math.max(0.06, Math.min(coneW * 0.95, (S.w0 + d * 0.22) * bloom));
    // the bright core (about half the drawn length) ends on the ray's clip at the latest
    const d1 = this.d1[i] as number;
    const dc = Math.max(0.05, Math.min(d, d1 - w * 0.8 * 0.5));
    // turbulence: the ray sways a little, never out of the cone
    const half = this.half[i] as number;
    const ra = this.ra[i] as number;
    // (a clipped ray keeps its exact line: its end is the blocker's face on THAT ray)
    const sway = d1 < reach - 1e-3 ? 0 : Math.sin(T * 13 + seed * 40 + d * 3) * Math.min(0.12, half * 0.4);
    const a = Math.max(-half, Math.min(half, ra + sway));
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ax = this.dx[i] as number;
    const ay = this.dy[i] as number;
    const rx = ax * ca - ay * sa;
    const ry = ax * sa + ay * ca;
    out.x = (this.ox[i] as number) + rx * dc;
    out.y = (this.oy[i] as number) + ry * dc;
    const wc = Math.min(w, Math.max(0.03, 2 * dc * (this.tanH[i] as number) * 0.95));
    out.w = wc * 1.6; // along the ray
    out.h = wc;
    out.rot = Math.atan2(ry, rx);
    // stopped at a car's face: the flame splashes and fades there
    const blocked = d1 < reach - 1e-3 && d >= d1 - 1e-3;
    out.alpha = S.alpha * (u < 0.1 ? u / 0.1 : 1) * (1 - u * u) * (blocked ? 0.7 : 1);
    if (S.blueFrac > 0 && frac < S.blueFrac) out.tint = TORCH_BLUE;
    else out.tint = FLAME_TINTS[Math.min(FLAME_STEPS - 1, Math.floor((0.08 + u * 0.92) * FLAME_STEPS))] as number;
    out.frame = Math.floor(seed * 97 + T * 9) % FLAME_VARIANTS;
    return true;
  }

  clear(): void {
    this.alive.fill(0);
    this.n = 0;
  }
}
