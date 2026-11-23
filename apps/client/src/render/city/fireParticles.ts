import { FLAME_STEPS, FLAME_TINTS, FLAME_VARIANTS, SMOKE_PALETTES, SMOKE_TONES, SMOKE_VARIANTS, flameCoreFracOf, flameRampColor, flameReachUpOf, type SmokePalette } from "./fireSprites";

/**
 * Story 4.12: the code-drawn fire as particles (designer pick: fire-lab panel "D — fuel flames, no
 * pool"; burning survivor: the lab's "Burning survivor" panel). Pure (no Phaser, no DOM): fixed
 * typed-array pools, a seeded generator per emitter (cosmetic only: no sim stream is touched), the
 * lab's motion (buoyant flames leaning with the wind, turbulent swirl, smoke drifting to the lower
 * right — the scene's shadow side — embers flung up) and the lab's draw rules, so a test can run the
 * exact numbers the view puts on its pooled images.
 *
 * THE EDGE RULE (4.11, kept): the visible bright flame (alpha > 50 %) never passes the zone radius
 * R (`fireRingRadiusM` = the sim's `circleInFire` edge): each flame is shrunk as it nears the edge
 * so its bright core ends on it (`flameDraw`), and most of the zone's flames are spawned right at
 * the edge, so a clear ring of flames marks it. Smoke and sparks may drift past it (they do not burn).
 */

/**
 * Caps per burning car (lab panel D: 130 + 44 + 24 = 198 ≈ 200). Review L3 (fill): smoke 44 → 26;
 * review M1: the edge ring is its own fixed set of slots (`EDGE_SLOTS_MAX`, never halved), so the
 * free flames drop to 110: at R = 2 m 110 + 49 edge + 26 + 24 = 209 (the edge slots scale with R).
 */
export const FIRE_FLAMES_MAX = 110;
export const FIRE_SMOKE_MAX = 26;
export const FIRE_EMBERS_MAX = 24;
/**
 * Review M1 (the reverse half of the edge rule: a body touching R stands in visible flame): fixed
 * angular edge slots, one flame per `EDGE_SPACING_M` of circumference, at most `EDGE_SLOTS_MAX`, the
 * same in `?fx=low`. They never rise (no buoyancy: a little tangential sway only), flicker in size,
 * shape and colour, and each sits so its OWN shape's bright edge (direction-aware) ends on R.
 */
export const EDGE_SPACING_M = 0.26;
/**
 * Re-review L2: the largest zone the balance schema allows (`decay.json › fire.radiusM` ≤ 8 m): the
 * slot cap keeps the spacing up to it (194 slots; R = 2 m uses 49). A map radius override above 8 m would space
 * its edge flames wider (none today: Downtown uses the 2 m balance radius).
 */
export const FIRE_RADIUS_MAX_M = 8;
export const EDGE_SLOTS_MAX = Math.ceil((2 * Math.PI * FIRE_RADIUS_MAX_M) / EDGE_SPACING_M);
export const EDGE_FLAME_M = 0.7;
/** Smaller zones get smaller, closer edge flames (a 1.4 m flame would wrap a 1 m ring): × min(1, R / this). */
const EDGE_REF_R = 2;
/**
 * Review M1: the free flames fit to R minus this (their bright cores end a little inside R): the edge
 * slots mark R, and the free flames' soft halos must not stack with theirs past it.
 */
export const FREE_FLAME_INSET_M = 0.08;
/** The radius the free (particle) flames of a zone of radius `R` are fitted to (`flameDraw`'s `fitR`). */
export const freeFlameFitR = (R: number): number => Math.max(0.05, R - FREE_FLAME_INSET_M);
/** Tangential size / normal size of an edge flame (wider along the ring). */
const EDGE_ASPECT = 2.0;
const EDGE_SWAY_RAD = 0.05;
const EDGE_FRAME_HZ = 7;
/** Edge flames overlap (additive): a lower alpha and an orange start of the ramp keep the ring flame-coloured, not white. */
const EDGE_ALPHA = 0.8;
const EDGE_RAMP_T = 0.38;
/** Caps per burning survivor (lab "Burning survivor"). */
export const BODY_FLAMES_MAX = 28;
export const BODY_SMOKE_MAX = 10;
export const BODY_EMBERS_MAX = 14;
/** Low quality (`?fx=low`): half of every cap and every spawn rate (review L3: particles NOT enlarged). */
export const LOW_FX_SIZE = 1;
/** The longest step simulated (s): a woken tab never fast-forwards a burst. */
export const FX_MAX_DT_S = 0.05;
/** Wind: smoke, flames and sparks lean to the lower right. */
export const WIND_X = 0.55;
export const WIND_Y = 0.32;
/** Lab panel D: spawn rates (per s) and the share of flames at the edge / on the car. */
const D_FLAME_RATE = 300;
const D_CAR_SHARE = 0.34;
const D_EDGE_SHARE = 0.35;
const D_SMOKE_RATE = 12;
const D_EMBER_RATE = 16;
/** Review L3: smoke grows to at most this size (m; the lab: 3.5). */
const SMOKE_END_MAX_M = 2.2;
/** Smoke peak alpha (car fire / survivor) and the lab's per-puff cap. */
const FIRE_SMOKE_ALPHA = 0.6;
const BODY_SMOKE_ALPHA = 0.45;
const SMOKE_ALPHA_CAP = 0.6;
/** Flames closer to the edge than this are not drawn (their core would have to shrink to nothing). */
export const EDGE_MIN_ALLOW_M = 0.025;
/** The survivor's burn level: rises in 0.2 s while burning, fades over 0.9 s after. */
const BURN_RISE_PER_S = 5;
const BURN_FADE_S = 0.9;
/** The lab survivor's radius: body spawn offsets scale from it. */
const LAB_BODY_R = 0.4;

export const halfCap = (cap: number, low: boolean): number => (low ? cap >> 1 : cap);

/** Seeded mulberry32 (cosmetic randomness: every client may differ, nothing reads it back). */
export class FxRandom {
  private s: number;
  constructor(seed: number) {
    this.s = seed | 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
}

/** A fixed pool of particles in structure-of-arrays form (no allocation after construction). */
export class ParticlePool {
  n = 0;
  private cur = 0;
  readonly al: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly s: Float32Array;
  readonly s1: Float32Array;
  readonly seed: Float32Array;
  readonly a: Float32Array;

  constructor(readonly cap: number) {
    this.al = new Uint8Array(cap);
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.s = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.seed = new Float32Array(cap);
    this.a = new Float32Array(cap);
  }

  /** A free slot (or -1 when `limit` are alive or the pool is full). */
  spawn(limit: number, rnd: FxRandom): number {
    if (this.n >= limit) return -1;
    for (let k = 0; k < this.cap; k++) {
      const i = (this.cur + k) % this.cap;
      if (this.al[i]) continue;
      this.al[i] = 1;
      this.n++;
      this.cur = (i + 1) % this.cap;
      this.age[i] = 0;
      this.seed[i] = rnd.next();
      this.a[i] = 1;
      return i;
    }
    return -1;
  }

  clear(): void {
    this.al.fill(0);
    this.n = 0;
  }
}

function put(P: ParticlePool, limit: number, rnd: FxRandom, low: boolean, x: number, y: number, vx: number, vy: number, s: number, s1: number, life: number): number {
  const i = P.spawn(limit, rnd);
  if (i < 0) return -1;
  if (s1 > 0) P.a[i] = 0.6 + 0.4 * rnd.next();
  P.x[i] = x;
  P.y[i] = y;
  P.vx[i] = vx;
  P.vy[i] = vy;
  P.s[i] = s * (low ? LOW_FX_SIZE : 1);
  P.s1[i] = s1;
  P.life[i] = life;
  return i;
}

function retire(P: ParticlePool, i: number, dt: number): boolean {
  const age = ((P.age[i] as number) + dt) as number;
  P.age[i] = age;
  if (age >= (P.life[i] as number)) {
    P.al[i] = 0;
    P.n--;
    return true;
  }
  return false;
}

/** Flames: buoyant (screen-up), leaning with the wind, a swirling turbulence field. */
function stepFlames(P: ParticlePool, dt: number, T: number, buoy: number, turb: number, lean: number, drag: number): void {
  const dd = Math.max(0, 1 - drag * dt);
  for (let i = 0; i < P.cap; i++) {
    if (!P.al[i] || retire(P, i, dt)) continue;
    const x = P.x[i] as number;
    const y = P.y[i] as number;
    const s = P.seed[i] as number;
    const tx = Math.sin(T * 5.3 + y * 3.1 + s * 40) + 0.6 * Math.sin(T * 11.7 + x * 5.3 + s * 17);
    const ty = Math.cos(T * 4.1 + x * 2.7 + s * 23);
    P.vx[i] = ((P.vx[i] as number) + (tx * turb + WIND_X * lean) * dt) * dd;
    P.vy[i] = ((P.vy[i] as number) + (ty * turb * 0.5 - buoy + WIND_Y * lean * 0.5) * dt) * dd;
    P.x[i] = x + (P.vx[i] as number) * dt;
    P.y[i] = y + (P.vy[i] as number) * dt;
  }
}

function stepSmoke(P: ParticlePool, dt: number, T: number): void {
  for (let i = 0; i < P.cap; i++) {
    if (!P.al[i] || retire(P, i, dt)) continue;
    const s = P.seed[i] as number;
    const tx = Math.sin(T * 0.9 + (P.y[i] as number) * 1.3 + s * 30) * 0.35 + (s - 0.5) * 0.5;
    P.vx[i] = (P.vx[i] as number) + (WIND_X + tx - (P.vx[i] as number)) * 0.9 * dt;
    P.vy[i] = (P.vy[i] as number) + (WIND_Y - 0.18 - (P.vy[i] as number)) * 0.7 * dt;
    P.x[i] = (P.x[i] as number) + (P.vx[i] as number) * dt;
    P.y[i] = (P.y[i] as number) + (P.vy[i] as number) * dt;
  }
}

function stepEmbers(P: ParticlePool, dt: number, T: number, turb: number): void {
  const dd = Math.max(0, 1 - 0.9 * dt);
  for (let i = 0; i < P.cap; i++) {
    if (!P.al[i] || retire(P, i, dt)) continue;
    const s = P.seed[i] as number;
    P.vx[i] = ((P.vx[i] as number) + (Math.sin(T * 7 + s * 50 + (P.y[i] as number) * 4) * turb + WIND_X * 0.8) * dt) * dd;
    P.vy[i] = ((P.vy[i] as number) + (Math.cos(T * 6 + s * 31) * turb * 0.6 - 0.35) * dt) * dd;
    P.x[i] = (P.x[i] as number) + (P.vx[i] as number) * dt;
    P.y[i] = (P.y[i] as number) + (P.vy[i] as number) * dt;
  }
}

/** How many to spawn this step for a rate (per s), with a carry (no drift in the long run). */
function emit(acc: Float32Array, slot: number, rate: number, dt: number, low: boolean): number {
  const a = (acc[slot] as number) + rate * dt * (low ? 0.5 : 1);
  const n = Math.floor(a);
  acc[slot] = a - n;
  return n;
}

/**
 * One burning car's fire (lab panel D), in metres RELATIVE to the zone centre (the view adds the
 * centre). `setCar` turns the car-shaped spawn areas to the car's facing.
 */
export class CarFire {
  readonly flames = new ParticlePool(FIRE_FLAMES_MAX);
  readonly smoke = new ParticlePool(FIRE_SMOKE_MAX);
  readonly embers = new ParticlePool(FIRE_EMBERS_MAX);
  private readonly acc = new Float32Array(3);
  private readonly rnd: FxRandom;
  private ca = 1;
  private sa = 0;
  /** Review M1: the edge ring's fixed slots (angle and phase per slot); `edgeN` used for the current R. */
  edgeN = 0;
  readonly edgeAngle = new Float32Array(EDGE_SLOTS_MAX);
  readonly edgePhase = new Float32Array(EDGE_SLOTS_MAX);
  /** Re-review M: 1 = the slot's edge point lies strictly inside ANOTHER burning zone (not an edge of the union): not drawn. */
  readonly edgeHidden = new Uint8Array(EDGE_SLOTS_MAX);
  private edgeR = -1;

  constructor(
    seed: number,
    readonly low = false,
  ) {
    this.rnd = new FxRandom(seed);
  }

  /** The car's front direction (radians; 0 = +x). */
  setCar(angle: number): void {
    this.ca = Math.cos(angle);
    this.sa = Math.sin(angle);
  }

  clear(): void {
    this.flames.clear();
    this.smoke.clear();
    this.embers.clear();
    this.acc.fill(0);
  }

  count(): number {
    return this.flames.n + this.smoke.n + this.embers.n;
  }

  /** Lays the edge slots for a zone of radius `R` (evenly round the ring, one per `EDGE_SPACING_M`). */
  layEdge(R: number): void {
    if (R === this.edgeR) return;
    this.edgeR = R;
    const n = Math.max(8, Math.min(EDGE_SLOTS_MAX, Math.ceil((2 * Math.PI * R) / (EDGE_SPACING_M * edgeScale(R)))));
    this.edgeN = n;
    for (let i = 0; i < n; i++) {
      this.edgeAngle[i] = ((i + 0.5) / n) * 2 * Math.PI;
      this.edgePhase[i] = this.rnd.next() * 100;
    }
  }

  /** One step (`dt` s, clamped to `FX_MAX_DT_S`) at clock `T` (s) for a zone of radius `R` (m). */
  update(dtIn: number, T: number, R: number): void {
    this.layEdge(R);
    const dt = Math.min(FX_MAX_DT_S, Math.max(0, dtIn));
    if (dt <= 0) return;
    const r = this.rnd;
    const low = this.low;
    const fl = halfCap(FIRE_FLAMES_MAX, low);
    for (let n = emit(this.acc, 0, D_FLAME_RATE, dt, low); n > 0; n--) {
      if (r.next() < D_CAR_SHARE) {
        // the car itself: flames out of the engine bay and the cabin
        const lx = r.range(-0.9, 1.4);
        const ly = r.range(-0.6, 0.6);
        const i = put(this.flames, fl, r, low, lx * this.ca - ly * this.sa, lx * this.sa + ly * this.ca, r.range(-0.2, 0.2), r.range(-1.5, -0.8), r.range(0.5, 0.85), 0, r.range(0.4, 0.7));
        if (i >= 0) this.flames.a[i] = 0.7;
      } else {
        // flames over the zone, most of them right at the edge (the ring that marks it)
        const edge = r.next() < D_EDGE_SHARE;
        const a = r.range(0, 2 * Math.PI);
        const se = edge ? r.range(0.26, 0.4) : r.range(0.3, 0.55);
        const rr = edge ? R - flameCoreFracOf(FLAME_VARIANTS - 1) * se * 0.5 - r.range(0, 0.06) : R * Math.sqrt(r.next()) * 0.95;
        put(this.flames, fl, r, low, Math.cos(a) * rr, Math.sin(a) * rr, r.range(-0.15, 0.15), r.range(-0.7, -0.3), se, 0, edge ? r.range(0.24, 0.4) : r.range(0.28, 0.5));
      }
    }
    const sm = halfCap(FIRE_SMOKE_MAX, low);
    for (let n = emit(this.acc, 1, D_SMOKE_RATE, dt, low); n > 0; n--) {
      const lx = r.range(-0.6, 1.6);
      const ly = r.range(-0.6, 0.6);
      put(this.smoke, sm, r, low, lx * this.ca - ly * this.sa, lx * this.sa + ly * this.ca, WIND_X * 1.6, WIND_Y * 1.4 - 0.2, r.range(0.7, 1.0), r.range(1.8, SMOKE_END_MAX_M), r.range(3.0, 4.2));
    }
    const em = halfCap(FIRE_EMBERS_MAX, low);
    for (let n = emit(this.acc, 2, D_EMBER_RATE, dt, low); n > 0; n--) {
      const lx = r.range(-1.6, 1.6);
      const ly = r.range(-1.2, 1.2);
      put(this.embers, em, r, low, lx * this.ca - ly * this.sa, lx * this.sa + ly * this.ca, r.range(-0.6, 0.6), r.range(-2.4, -1.0), r.range(0.05, 0.08), 0, r.range(0.7, 1.4));
    }
    stepFlames(this.flames, dt, T, 0.8, 1.4, 0.3, 1.2);
    stepEmbers(this.embers, dt, T, 3.0);
    stepSmoke(this.smoke, dt, T);
  }
}

/**
 * Flames, smoke and embers on one burning survivor (lab "Burning survivor"), in WORLD metres (they
 * trail behind a running survivor). `burning` comes from the server's fire-damage events only
 * (`FireCue`); the burn level rises fast and fades over `BURN_FADE_S` after the cue ends.
 */
export class BodyFire {
  readonly flames = new ParticlePool(BODY_FLAMES_MAX);
  readonly smoke = new ParticlePool(BODY_SMOKE_MAX);
  readonly embers = new ParticlePool(BODY_EMBERS_MAX);
  private readonly acc = new Float32Array(3);
  private readonly rnd: FxRandom;
  burn = 0;
  private px = NaN;
  private py = NaN;

  constructor(
    seed: number,
    readonly low = false,
  ) {
    this.rnd = new FxRandom(seed);
  }

  clear(): void {
    this.flames.clear();
    this.smoke.clear();
    this.embers.clear();
    this.acc.fill(0);
    this.burn = 0;
    this.px = NaN;
    this.py = NaN;
  }

  count(): number {
    return this.flames.n + this.smoke.n + this.embers.n;
  }

  /** Nothing left to show (the slot can be reused). */
  idle(): boolean {
    return this.burn <= 0 && this.count() === 0;
  }

  /** One step at the survivor's drawn position (m), body radius `r` (m). */
  update(dtIn: number, T: number, x: number, y: number, r: number, burning: boolean): void {
    const dt = Math.min(FX_MAX_DT_S, Math.max(0, dtIn));
    const vx = dt > 0 && Number.isFinite(this.px) ? Math.max(-8, Math.min(8, (x - this.px) / dt)) : 0;
    const vy = dt > 0 && Number.isFinite(this.py) ? Math.max(-8, Math.min(8, (y - this.py) / dt)) : 0;
    this.px = x;
    this.py = y;
    if (dt <= 0) return;
    this.burn = burning ? Math.min(1, this.burn + dt * BURN_RISE_PER_S) : Math.max(0, this.burn - dt / BURN_FADE_S);
    const b = this.burn;
    const k = r / LAB_BODY_R;
    const rnd = this.rnd;
    const low = this.low;
    const fl = halfCap(BODY_FLAMES_MAX, low);
    for (let n = emit(this.acc, 0, 60 * b, dt, low); n > 0; n--) {
      const a = rnd.range(0, 2 * Math.PI);
      const d = Math.sqrt(rnd.next()) * 0.32 * k;
      put(this.flames, fl, rnd, low, x + Math.cos(a) * d, y + Math.sin(a) * d, vx * 0.5 + rnd.range(-0.2, 0.2), vy * 0.5 + rnd.range(-1.1, -0.5), rnd.range(0.26, 0.42) * k * (0.6 + 0.4 * b), 0, rnd.range(0.28, 0.5));
    }
    for (let n = emit(this.acc, 1, 5 * b, dt, low); n > 0; n--) {
      put(this.smoke, halfCap(BODY_SMOKE_MAX, low), rnd, low, x + rnd.range(-0.2, 0.2) * k, y - 0.3 * k, vx * 0.4, vy * 0.4 - 0.4, 0.3 * k, rnd.range(1.1, 1.5) * k, rnd.range(1.6, 2.2));
    }
    for (let n = emit(this.acc, 2, 12 * b, dt, low); n > 0; n--) {
      put(this.embers, halfCap(BODY_EMBERS_MAX, low), rnd, low, x + rnd.range(-0.3, 0.3) * k, y + rnd.range(-0.3, 0.3) * k, vx * 0.3 + rnd.range(-0.4, 0.4), rnd.range(-2, -0.8), rnd.range(0.04, 0.065), 0, rnd.range(0.5, 1.1));
    }
    stepFlames(this.flames, dt, T, 1.2, 1.4, 0.2, 1.2);
    stepSmoke(this.smoke, dt, T);
    stepEmbers(this.embers, dt, T, 2.5);
  }
}

/** What the view puts on one pooled image (metres, radians; `tint` 0xRRGGBB; `frame` a variant index). */
export interface ParticleDraw {
  x: number;
  y: number;
  /** Size along the particle's motion (`rot`) and across it. */
  w: number;
  h: number;
  rot: number;
  alpha: number;
  tint: number;
  frame: number;
}

/** A flame's grow-then-shrink over its life (0..1). */
function flameGrow(t: number): number {
  return t < 0.18 ? 0.5 + 0.5 * (t / 0.18) : 1 - 0.62 * ((t - 0.18) / 0.82);
}

/**
 * Flame `i` of `P` (coordinates relative to the zone centre when `fitR` > 0) → `out`; false when not
 * drawn. With `fitR` > 0 THE EDGE RULE: the bright core (`flameCoreFrac() × w / 2`, w ≥ h) is
 * shrunk to end at `fitR` at most; a flame with under `EDGE_MIN_ALLOW_M` left is not drawn.
 */
export function flameDraw(P: ParticlePool, i: number, fitR: number, out: ParticleDraw): boolean {
  if (!P.al[i]) return false;
  const t = (P.age[i] as number) / (P.life[i] as number);
  const size = (P.s[i] as number) * flameGrow(t);
  const vx = P.vx[i] as number;
  const vy = P.vy[i] as number;
  const sp = Math.sqrt(vx * vx + vy * vy);
  const st = 1 + Math.min(0.9, sp * 0.55);
  let L = size * st;
  let H = size * (1 - (st - 1) * 0.25);
  const x = P.x[i] as number;
  const y = P.y[i] as number;
  const frame = Math.floor((P.seed[i] as number) * 97) % FLAME_VARIANTS;
  if (fitR > 0) {
    const allow = fitR - Math.sqrt(x * x + y * y);
    const core = flameCoreFracOf(frame) * L * 0.5; // review M1: this shape's own core
    if (core > allow) {
      if (allow < EDGE_MIN_ALLOW_M) return false;
      const f = allow / core;
      L *= f;
      H *= f;
    }
  }
  out.x = x;
  out.y = y;
  out.w = L;
  out.h = H;
  out.rot = sp > 0.05 ? Math.atan2(vy, vx) : -Math.PI / 2;
  out.alpha = (t < 0.08 ? t / 0.08 : 1) * (P.a[i] as number);
  out.tint = FLAME_TINTS[Math.min(FLAME_STEPS - 1, Math.floor(t * FLAME_STEPS))] as number;
  out.frame = frame;
  return true;
}

/** A zone (centre and radius, m): `FireRecord` fits. */
export interface ZoneLike {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
}

/**
 * Re-review M (4.11's `ringFlameMarksEdge`, restored for the edge slots): two cars burning side by
 * side — the edge of the UNION is what burns, so an edge slot of zone `self` whose point on the ring
 * lies strictly inside another zone is hidden. Lays the slots for `self`'s radius first. Call when
 * the set of fires changes (a bake), never per frame; no allocation.
 */
export function markHiddenEdges(fire: CarFire, zones: readonly ZoneLike[], self: number): void {
  const z = zones[self] as ZoneLike;
  fire.layEdge(z.radiusM);
  for (let i = 0; i < fire.edgeN; i++) {
    const a = fire.edgeAngle[i] as number;
    const x = z.x + Math.cos(a) * z.radiusM;
    const y = z.y + Math.sin(a) * z.radiusM;
    let inside = 0;
    for (let j = 0; j < zones.length; j++) {
      if (j === self) continue;
      const o = zones[j] as ZoneLike;
      const dx = x - o.x;
      const dy = y - o.y;
      if (dx * dx + dy * dy < o.radiusM * o.radiusM) inside = 1;
    }
    fire.edgeHidden[i] = inside;
  }
}

function edgeScale(R: number): number {
  return Math.min(1, R / EDGE_REF_R);
}

/**
 * Re-review L2: edge flames grow a little on large zones (a flatter ring overlaps its neighbours'
 * bright parts less): × (R / 2)^EDGE_GROW above 2 m, × R / 2 below.
 */
export const EDGE_GROW = 0.3;
function edgeSizeScale(R: number): number {
  return R < EDGE_REF_R ? R / EDGE_REF_R : Math.pow(R / EDGE_REF_R, EDGE_GROW);
}

/**
 * Review M1: edge flame `i` of `fire` (zone radius `R`, clock `T`) → `out` (relative to the centre).
 * Drawn with its −y side facing OUT (rot = angle + 90°), so its bright edge is
 * `flameReachUpOf(frame) × h / 2` from its centre: the centre sits exactly that far inside R. No
 * allocation; pure function of the slot and the clock (no buoyancy, no drift away from the edge).
 */
export function edgeFlameDraw(fire: CarFire, i: number, T: number, R: number, out: ParticleDraw): boolean {
  if (i >= fire.edgeN || fire.edgeHidden[i]) return false;
  const ph = fire.edgePhase[i] as number;
  const fr = Math.floor(T * EDGE_FRAME_HZ + ph) % FLAME_VARIANTS;
  const flick = 0.5 + 0.3 * Math.sin(T * 9.1 + ph * 7) + 0.2 * Math.sin(T * 23.3 + ph * 3);
  const h = EDGE_FLAME_M * edgeSizeScale(R) * (0.85 + 0.15 * flick);
  const a = (fire.edgeAngle[i] as number) + EDGE_SWAY_RAD * Math.sin(T * 2.3 + ph);
  const r = R - (flameReachUpOf(fr) * h) / 2;
  out.x = Math.cos(a) * r;
  out.y = Math.sin(a) * r;
  out.w = h * EDGE_ASPECT;
  out.h = h;
  out.rot = a + Math.PI / 2;
  out.alpha = EDGE_ALPHA + 0.15 * flick;
  out.tint = flameRampColor(EDGE_RAMP_T + 0.2 * (1 - flick));
  out.frame = fr;
  return true;
}

/**
 * Smoke puff `i` → `out` (normal blending). `cx, cy`: where the puffs thin out near the source
 * (the car fire: its centre, so the smoke never hides the flames' core; NaN: no thinning).
 */
export function smokeDraw(P: ParticlePool, i: number, palette: SmokePalette, cx: number, cy: number, out: ParticleDraw): boolean {
  if (!P.al[i]) return false;
  const t = (P.age[i] as number) / (P.life[i] as number);
  const u = 1 - t;
  const s0 = P.s[i] as number;
  const size = s0 + ((P.s1[i] as number) - s0) * (1 - u * u);
  const x = P.x[i] as number;
  const y = P.y[i] as number;
  let fz = 1;
  if (Number.isFinite(cx)) {
    const d = Math.hypot(x - cx, y - cy);
    fz = Math.max(0.18, Math.min(1, (d - 0.8) / 1.6));
  }
  const amax = palette === "black" ? FIRE_SMOKE_ALPHA : BODY_SMOKE_ALPHA;
  const a = amax * (P.a[i] as number) * fz * (t < 0.2 ? t / 0.2 : Math.pow(u / 0.8, 1.2));
  const sd = P.seed[i] as number;
  out.x = x;
  out.y = y;
  out.w = size;
  out.h = size;
  out.rot = sd * 2 * Math.PI + (P.age[i] as number) * (sd < 0.5 ? -0.3 : 0.3);
  out.alpha = Math.min(SMOKE_ALPHA_CAP, a);
  out.tint = SMOKE_PALETTES[palette][Math.min(SMOKE_TONES - 1, Math.floor(t * SMOKE_TONES * 1.15))] as number;
  out.frame = Math.floor(sd * 31) % SMOKE_VARIANTS;
  return true;
}

/** Ember `i` → `out` (additive). Past `dimR` from the origin (> 0) it is dimmer (it does not burn there). */
export function emberDraw(P: ParticlePool, i: number, dimR: number, out: ParticleDraw): boolean {
  if (!P.al[i]) return false;
  const t = (P.age[i] as number) / (P.life[i] as number);
  const x = P.x[i] as number;
  const y = P.y[i] as number;
  const vx = P.vx[i] as number;
  const vy = P.vy[i] as number;
  const sp = Math.sqrt(vx * vx + vy * vy);
  const st = 1 + Math.min(2.2, sp * 0.9);
  const size = (P.s[i] as number) * 5 * (1 - t * 0.5);
  let a = (0.55 + 0.45 * Math.sin((P.age[i] as number) * 26 + (P.seed[i] as number) * 40)) * Math.pow(1 - t, 0.7);
  if (dimR > 0 && x * x + y * y > dimR * dimR) a = Math.min(a, 0.45);
  out.x = x;
  out.y = y;
  out.w = size * st;
  out.h = size;
  out.rot = sp > 0.05 ? Math.atan2(vy, vx) : -Math.PI / 2;
  out.alpha = Math.max(0, a);
  out.tint = 0xffffff;
  out.frame = 0;
  return true;
}

/** A fire this far (m) outside the camera view is not simulated or drawn (smoke drifts ~6 m downwind). */
export const FIRE_CULL_MARGIN_M = 6;
/** True when a fire at (x, y) can show anything inside the view rectangle (m). */
export function fireInView(x: number, y: number, r: number, vx: number, vy: number, vw: number, vh: number): boolean {
  const m = r + FIRE_CULL_MARGIN_M;
  return x + m >= vx && x - m <= vx + vw && y + m >= vy && y - m <= vy + vh;
}

/** The lab's fire-light flicker (≈ 0.44..1.0). */
export function fireFlicker(T: number, s: number): number {
  return 0.72 + 0.14 * Math.sin(T * 13.1 + s) + 0.09 * Math.sin(T * 29.7 + s * 2.3) + 0.05 * Math.sin(T * 51.3 + s * 5.1);
}
