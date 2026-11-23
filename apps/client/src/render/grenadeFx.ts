import { EXPLOSION_KINDS, TICK_DT_S, type SimEvent } from "@topdown/shared";

/**
 * Story 5.5: the client's cosmetic copy of lobbed rounds (FR-E/F: hits are server truth; the client
 * only draws where the server says). Fed by events in both modes — online the server's
 * (`grenade.launched`, `explosion.happened`, `build.started`) plus my own instant launch (2.7: the
 * local fire clock's shot, id 0, aimed at the locally computed landing point), solo the local
 * World's, through the same `drainEvents` path:
 *
 * - a round flies from the muzzle to its landing point in `flightTicks` server ticks from the moment
 *   its event is drawn (a woken tab's late event starts that much earlier: `ageS`), along a
 *   cosmetic arc (`lobArcM`: scale + shadow offset; never a different track);
 * - my server `grenade.launched` replaces my local copy (the oldest unmatched one): it takes the
 *   server's id and is snapped to the server's landing point if the clip differs;
 * - `explosion.happened` with its id hides it (the blast visual waits for that event: pending until
 *   the server agrees); a round whose event never came lies on the ground at its landing point and
 *   is hidden `lostEventTicks` after its landing (no round stuck on screen);
 * - `build.started` drops every round (the server clears its pool there: no ghost blasts after a
 *   hidden tab slept across a build start); a late Game scene start sees only later launches.
 *
 * Fixed pools, no allocation per event or frame. Phaser-free (unit-tested).
 */
export class GrenadeFlights {
  /** Server round id (1–255), 0 = my unmatched local copy, -1 = a free slot. */
  readonly id: Int32Array;
  readonly owner: (string | null)[];
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly tx: Float64Array;
  readonly ty: Float64Array;
  readonly startS: Float64Array;
  readonly landS: Float64Array;
  count = 0;
  /** Rounds my server echo snapped to a different landing point (the browser check reads it). */
  snaps = 0;

  constructor(
    readonly capacity: number,
    private readonly localPlayerId: string,
    /** Seconds a landed round waits for its explosion event before it is hidden. */
    private readonly lostS: number,
  ) {
    this.id = new Int32Array(capacity).fill(-1);
    this.owner = new Array<string | null>(capacity).fill(null);
    this.x0 = new Float64Array(capacity);
    this.y0 = new Float64Array(capacity);
    this.tx = new Float64Array(capacity);
    this.ty = new Float64Array(capacity);
    this.startS = new Float64Array(capacity);
    this.landS = new Float64Array(capacity);
  }

  /** Routes one drained event (others are ignored). Returns the slot freed by an explosion (-1: none). */
  handle(e: SimEvent, nowS: number): number {
    if (e.type === "grenade.launched") {
      this.launched(e.playerId, e.grenadeId, e.x, e.y, e.tx, e.ty, e.flightTicks, nowS - (e.ageS ?? 0));
    } else if (e.type === "explosion.happened") {
      return e.grenadeId > 0 ? this.burst(e.grenadeId) : -1;
    } else if (e.type === "build.started") this.clear();
    return -1;
  }

  /** A round in flight (my id-0 event is my local instant copy). */
  launched(owner: string, id: number, x0: number, y0: number, tx: number, ty: number, flightTicks: number, startS: number): void {
    if (id > 0 && owner === this.localPlayerId) {
      // My server echo: adopt my oldest local copy.
      let best = -1;
      for (let i = 0; i < this.capacity; i++) if (this.id[i] === 0 && this.owner[i] === owner && (best < 0 || (this.startS[i] as number) < (this.startS[best] as number))) best = i;
      if (best >= 0) {
        this.id[best] = id;
        if (Math.abs((this.tx[best] as number) - tx) > 0.01 || Math.abs((this.ty[best] as number) - ty) > 0.01) this.snaps++;
        this.tx[best] = tx;
        this.ty[best] = ty;
        return;
      }
    }
    let slot = -1;
    let oldest = Infinity;
    let oldestSlot = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.id[i] === -1) {
        slot = i;
        break;
      }
      if ((this.startS[i] as number) < oldest) {
        oldest = this.startS[i] as number;
        oldestSlot = i;
      }
    }
    if (slot < 0) slot = oldestSlot;
    else this.count++;
    this.id[slot] = id;
    this.owner[slot] = owner;
    this.x0[slot] = x0;
    this.y0[slot] = y0;
    this.tx[slot] = tx;
    this.ty[slot] = ty;
    this.startS[slot] = startS;
    this.landS[slot] = startS + Math.max(1, flightTicks) * TICK_DT_S;
  }

  /** The round `id` burst (its explosion event): hidden. Returns its slot or -1. */
  burst(id: number): number {
    for (let i = 0; i < this.capacity; i++) {
      if (this.id[i] === id) {
        this.free(i);
        return i;
      }
    }
    return -1;
  }

  /** Hides rounds whose explosion never came (`lostS` after landing). */
  update(nowS: number): void {
    for (let i = 0; i < this.capacity; i++) if (this.id[i] !== -1 && nowS > (this.landS[i] as number) + this.lostS) this.free(i);
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) if (this.id[i] !== -1) this.free(i);
  }

  private free(i: number): void {
    this.id[i] = -1;
    this.owner[i] = null;
    this.count--;
  }

  /**
   * Where round `i` is drawn at `nowS`: ground point (x, y), height z (m) on the arc of peak
   * `arcM`, and its heading. After landing it lies at the landing point (z 0) until its event.
   */
  pose(i: number, nowS: number, arcM: number, out: RoundPose): RoundPose {
    const s0 = this.startS[i] as number;
    const s1 = this.landS[i] as number;
    const u = s1 > s0 ? Math.min(1, Math.max(0, (nowS - s0) / (s1 - s0))) : 1;
    const x0 = this.x0[i] as number;
    const y0 = this.y0[i] as number;
    const dx = (this.tx[i] as number) - x0;
    const dy = (this.ty[i] as number) - y0;
    out.x = x0 + dx * u;
    out.y = y0 + dy * u;
    out.z = 4 * arcM * u * (1 - u);
    out.heading = Math.atan2(dy, dx);
    out.landed = u >= 1;
    return out;
  }
}

export interface RoundPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  landed: boolean;
}

// ======================= explosion particles (EX1 fireball, EX2 shockwave) =======================

/** Particle kinds (the view picks the frame, blend and tint from the kind). */
export const P_FLAME = 1;
export const P_SMOKE = 2;
export const P_EMBER = 3;
export const P_DEBRIS = 4;
export const P_DUST = 5;

/** The two looks (designer, round C): EX1 fireball = the Grenade Launcher; EX2 shockwave + debris = the mine (and 5.12's hand grenade). */
export type BlastLook = "fireball" | "shockwave";

/** An explosion event older than this when drawn (a woken tab's backlog) shows no blast (its hits already happened). */
export const STALE_EXPLOSION_S = 0.5;

/** The look per explosion kind (designer, round C): grenade EX1 fireball; mine EX2 shockwave (5.8/5.12 add theirs). */
export function blastLookFor(kind: number): BlastLook {
  return EXPLOSION_KINDS[kind] === "grenade" ? "fireball" : "shockwave";
}

/** A small seeded generator (cosmetic only: never the sim's streams). */
function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ParticleDraw {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  alpha: number;
  /** Shape variant (frame index within its kind). */
  variant: number;
  /** 0–1 along the particle's life (tint ramps). */
  t: number;
}

/**
 * The shared explosion particle pool (`combat.json › explosion.fx.maxExplosionParticles`): one
 * ring of slots; a new blast takes the next slots, overwriting the oldest when full (the newest
 * blast always shows). Struct-of-arrays, allocation-free. Flames and dust keep their bright part
 * inside the blast circle (they "stop at its edge", the designer's look); embers and debris fly out.
 */
export class BlastParticles {
  readonly kind: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly z: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly s0: Float32Array;
  readonly s1: Float32Array;
  readonly rot: Float32Array;
  readonly vr: Float32Array;
  readonly a: Float32Array;
  readonly variant: Uint8Array;
  /** The blast centre and radius each particle belongs to (the edge rule). */
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  readonly cr: Float32Array;
  private cursor = 0;
  private readonly rnd: () => number;

  constructor(readonly capacity: number, seed = 0x5eed5) {
    const f = () => new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.x = f();
    this.y = f();
    this.vx = f();
    this.vy = f();
    this.z = f();
    this.vz = f();
    this.age = f();
    this.life = f();
    this.s0 = f();
    this.s1 = f();
    this.rot = f();
    this.vr = f();
    this.a = f();
    this.variant = new Uint8Array(capacity);
    this.cx = f();
    this.cy = f();
    this.cr = f();
    this.rnd = mulberry(seed);
  }

  private rr(a: number, b: number): number {
    return a + this.rnd() * (b - a);
  }

  /** Live particles (tests, the browser check). */
  live(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.kind[i] !== 0) n++;
    return n;
  }

  clear(): void {
    this.kind.fill(0);
  }

  private put(kind: number, cx: number, cy: number, R: number, x: number, y: number, vx: number, vy: number, s0: number, s1: number, life: number, variants: number): number {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    this.kind[i] = kind;
    this.cx[i] = cx;
    this.cy[i] = cy;
    this.cr[i] = R;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.z[i] = 0;
    this.vz[i] = 0;
    this.age[i] = 0;
    this.life[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.rot[i] = this.rr(0, Math.PI * 2);
    this.vr[i] = this.rr(-2, 2);
    this.a[i] = 1;
    this.variant[i] = Math.floor(this.rnd() * variants) % Math.max(1, variants);
    return i;
  }

  /** Spawns one blast's particles at (x, y) for a blast of radius R (ported from round C looks, trimmed to the cap). */
  burst(look: BlastLook, x: number, y: number, R: number, flameVariants: number, smokeVariants: number): void {
    const TAU = Math.PI * 2;
    const k = R / 2; // the looks are drawn for a 2 m blast
    if (look === "fireball") {
      for (let n = 0; n < 34; n++) {
        const a = this.rr(0, TAU);
        const d = R * 0.4 * Math.sqrt(this.rnd());
        const sp = this.rr(1.2, 4) * k;
        const i = this.put(P_FLAME, x, y, R, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * sp, Math.sin(a) * sp, this.rr(0.6, 1.25) * k, 0, this.rr(0.35, 0.8), flameVariants);
        this.a[i] = this.rr(0.5, 0.75);
      }
      for (let n = 0; n < 10; n++) {
        const a = this.rr(0, TAU);
        const d = this.rr(0, 1.4) * k;
        this.put(P_SMOKE, x, y, R, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * 0.9, Math.sin(a) * 0.9 - 0.3, this.rr(0.9, 1.2) * k, this.rr(2.0, 2.8) * k, this.rr(2.4, 3.2), smokeVariants);
      }
      for (let n = 0; n < 16; n++) {
        const a = this.rr(0, TAU);
        const sp = this.rr(4, 10);
        this.put(P_EMBER, x, y, R, x, y, Math.cos(a) * sp, Math.sin(a) * sp, this.rr(0.04, 0.07), 0, this.rr(0.4, 1.0), 1);
      }
      for (let n = 0; n < 6; n++) this.debris(x, y, R, 2, 5, 2, 4);
      return;
    }
    // EX2 shockwave + debris: a hard flash (the view), a dust ring that rolls out and stops on the edge, chunks and sparks, little fire.
    for (let n = 0; n < 8; n++) {
      const a = this.rr(0, TAU);
      const d = this.rr(0, 0.5) * k;
      const sp = this.rr(1, 3) * k;
      this.put(P_FLAME, x, y, R, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * sp, Math.sin(a) * sp, this.rr(0.5, 0.9) * k, 0, this.rr(0.2, 0.4), flameVariants);
    }
    for (let n = 0; n < 24; n++) {
      const a = (n / 24) * TAU + this.rr(-0.06, 0.06);
      const i = this.put(P_DUST, x, y, R, x, y, a, 0, this.rr(0.45, 0.7) * k, this.rr(1.0, 1.4) * k, this.rr(1.4, 2.0), smokeVariants);
      this.a[i] = this.rr(0.8, 1);
    }
    for (let n = 0; n < 18; n++) this.debris(x, y, R, 3, 8.5, 1.5, 4.5);
    for (let n = 0; n < 14; n++) {
      const a = this.rr(0, TAU);
      const sp = this.rr(6, 13);
      this.put(P_EMBER, x, y, R, x, y, Math.cos(a) * sp, Math.sin(a) * sp, this.rr(0.035, 0.06), 0, this.rr(0.25, 0.6), 1);
    }
    for (let n = 0; n < 4; n++) {
      const a = this.rr(0, TAU);
      const d = this.rr(0, 0.8) * k;
      this.put(P_SMOKE, x, y, R, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a) * 0.5, Math.sin(a) * 0.5, this.rr(0.7, 1.0) * k, this.rr(1.6, 2.2) * k, this.rr(2, 2.8), smokeVariants);
    }
  }

  private debris(x: number, y: number, R: number, sp0: number, sp1: number, vz0: number, vz1: number): void {
    const a = this.rr(0, Math.PI * 2);
    const sp = this.rr(sp0, sp1);
    const i = this.put(P_DEBRIS, x, y, R, x + Math.cos(a) * 0.2, y + Math.sin(a) * 0.2, Math.cos(a) * sp, Math.sin(a) * sp, this.rr(0.04, 0.09), 0, this.rr(1.5, 2.5), 1);
    this.vz[i] = this.rr(vz0, vz1);
    this.z[i] = 0.05;
    this.vr[i] = this.rr(-15, 15);
  }

  /** Advances every live particle by `dt` s (0 = paused). */
  step(dt: number): void {
    if (dt <= 0) return;
    for (let i = 0; i < this.capacity; i++) {
      const kind = this.kind[i] as number;
      if (kind === 0) continue;
      const age = (this.age[i] as number) + dt;
      this.age[i] = age;
      if (age >= (this.life[i] as number)) {
        this.kind[i] = 0;
        continue;
      }
      if (kind === P_DUST) {
        // kinematic: each puff rolls out on its own ray and stops with its edge on the circle
        const a = this.vx[i] as number;
        const R = this.cr[i] as number;
        const sz = this.size(i);
        const rEnd = R - sz * 0.42;
        const r = rEnd * (1 - Math.pow(1 - Math.min(1, age / 0.32), 3));
        this.x[i] = (this.cx[i] as number) + Math.cos(a) * r;
        this.y[i] = (this.cy[i] as number) + Math.sin(a) * r;
        continue;
      }
      const drag = kind === P_FLAME ? 1.6 : kind === P_EMBER ? 0.9 : kind === P_SMOKE ? 0.6 : 0.4;
      const dd = Math.max(0, 1 - drag * dt);
      this.vx[i] = (this.vx[i] as number) * dd;
      this.vy[i] = (this.vy[i] as number) * dd + (kind === P_FLAME ? -1.4 * dt : kind === P_SMOKE ? -0.25 * dt : 0);
      this.x[i] = (this.x[i] as number) + (this.vx[i] as number) * dt;
      this.y[i] = (this.y[i] as number) + (this.vy[i] as number) * dt;
      this.rot[i] = (this.rot[i] as number) + (this.vr[i] as number) * dt;
      if (kind === P_FLAME) {
        // the bright core stays inside the blast circle (the look "stops at its edge")
        const dx = (this.x[i] as number) - (this.cx[i] as number);
        const dy = (this.y[i] as number) - (this.cy[i] as number);
        const d = Math.hypot(dx, dy);
        const maxD = Math.max(0, (this.cr[i] as number) - this.size(i) * FLAME_CORE_FRAC * 0.5);
        if (d > maxD && d > 1e-6) {
          this.x[i] = (this.cx[i] as number) + (dx / d) * maxD;
          this.y[i] = (this.cy[i] as number) + (dy / d) * maxD;
        }
      } else if (kind === P_DEBRIS) {
        let vz = (this.vz[i] as number) - 9.8 * dt;
        let z = (this.z[i] as number) + vz * dt;
        if (z < 0) {
          z = 0;
          vz = -vz * 0.35;
          this.vx[i] = (this.vx[i] as number) * 0.5;
          this.vy[i] = (this.vy[i] as number) * 0.5;
          this.vr[i] = (this.vr[i] as number) * 0.5;
        }
        this.z[i] = z;
        this.vz[i] = vz;
      }
    }
  }

  /** The particle's size now (m). */
  size(i: number): number {
    const kind = this.kind[i] as number;
    const t = Math.min(1, (this.age[i] as number) / Math.max(1e-6, this.life[i] as number));
    if (kind === P_FLAME) return (this.s0[i] as number) * (t < 0.18 ? 0.5 + 0.5 * (t / 0.18) : 1 - 0.62 * ((t - 0.18) / 0.82));
    if (kind === P_SMOKE) return (this.s0[i] as number) + ((this.s1[i] as number) - (this.s0[i] as number)) * Math.min(1, t * 1.6);
    if (kind === P_DUST) return (this.s0[i] as number) + ((this.s1[i] as number) - (this.s0[i] as number)) * Math.min(1, (this.age[i] as number) / 0.5);
    return this.s0[i] as number;
  }

  /** Draw data of particle `i` (false: free). */
  draw(i: number, out: ParticleDraw): boolean {
    const kind = this.kind[i] as number;
    if (kind === 0) return false;
    const t = Math.min(1, (this.age[i] as number) / Math.max(1e-6, this.life[i] as number));
    const s = this.size(i);
    out.x = this.x[i] as number;
    out.y = this.y[i] as number;
    out.variant = this.variant[i] as number;
    out.t = t;
    out.rot = this.rot[i] as number;
    if (kind === P_FLAME) {
      out.w = out.h = s;
      out.alpha = (t < 0.08 ? t / 0.08 : 1 - t * 0.9) * (this.a[i] as number);
    } else if (kind === P_SMOKE) {
      out.w = out.h = s;
      out.alpha = Math.min(0.55, (t < 0.1 ? t / 0.1 : 1 - t) * 0.6);
    } else if (kind === P_DUST) {
      out.w = out.h = s;
      out.alpha = Math.min(0.7, (1 - t) * 0.75) * (this.a[i] as number);
    } else if (kind === P_EMBER) {
      const vx = this.vx[i] as number;
      const vy = this.vy[i] as number;
      const sp = Math.hypot(vx, vy);
      out.w = s * (1 + Math.min(6, sp * 0.5));
      out.h = s;
      out.rot = sp > 0.05 ? Math.atan2(vy, vx) : 0;
      out.alpha = 1 - t;
    } else {
      // debris: a chunk lifted by z (drawn a little up the screen and bigger)
      const z = this.z[i] as number;
      out.w = s * (1 + z * 0.3);
      out.h = s * 0.7 * (1 + z * 0.3);
      out.y -= z * 0.15;
      out.alpha = t > 0.8 ? (1 - t) / 0.2 : 1;
    }
    if (out.alpha < 0) out.alpha = 0;
    return true;
  }
}

/** The flame sprite's bright-core fraction used by the edge rule (the 4.12 masks reach ≈ 0.62 of the half size at 50 % alpha). */
export const FLAME_CORE_FRAC = 0.62;

// ======================= live explosions (flash, glow, rings) and scorch decals =======================

/** Seconds of each layer per look. */
export const BLAST_TIMES = {
  fireball: { flashS: 0.18, glowS: 0.7, ringS: 0.5, ringGrowS: 0 },
  shockwave: { flashS: 0.12, glowS: 0.3, ringS: 0.45, ringGrowS: 0.25 },
} as const;
/** A scorch decal fades over this long (the end of a wave at the latest: build starts clear them). */
export const SCORCH_FADE_S = 30;

/**
 * Live explosions (`fx.maxLiveExplosions`, the oldest reused) and scorch decals
 * (`fx.maxScorchDecals`, the oldest reused). Pure state; the view draws it.
 */
export class Explosions {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly r: Float64Array;
  readonly startS: Float64Array;
  readonly look: Uint8Array;
  /** 1 = live. */
  readonly active: Uint8Array;
  readonly scorchX: Float64Array;
  readonly scorchY: Float64Array;
  readonly scorchR: Float64Array;
  readonly scorchS: Float64Array;
  readonly scorchRot: Float64Array;
  readonly scorchOn: Uint8Array;
  private next = 0;
  private nextScorch = 0;
  /** Explosions started (the browser check reads it: once per server explosion). */
  started = 0;

  constructor(readonly capacity: number, readonly scorchCapacity: number) {
    this.x = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
    this.r = new Float64Array(capacity);
    this.startS = new Float64Array(capacity);
    this.look = new Uint8Array(capacity);
    this.active = new Uint8Array(capacity);
    this.scorchX = new Float64Array(scorchCapacity);
    this.scorchY = new Float64Array(scorchCapacity);
    this.scorchR = new Float64Array(scorchCapacity);
    this.scorchS = new Float64Array(scorchCapacity);
    this.scorchRot = new Float64Array(scorchCapacity);
    this.scorchOn = new Uint8Array(scorchCapacity);
  }

  /** Starts one (returns its slot). */
  start(look: BlastLook, x: number, y: number, r: number, nowS: number): number {
    const i = this.next;
    this.next = (i + 1) % this.capacity;
    this.x[i] = x;
    this.y[i] = y;
    this.r[i] = r;
    this.startS[i] = nowS;
    this.look[i] = look === "fireball" ? 0 : 1;
    this.active[i] = 1;
    this.started++;
    const s = this.nextScorch;
    this.nextScorch = (s + 1) % this.scorchCapacity;
    this.scorchX[s] = x;
    this.scorchY[s] = y;
    this.scorchR[s] = r;
    this.scorchS[s] = nowS;
    this.scorchRot[s] = (x * 7.13 + y * 3.71) % (Math.PI * 2);
    this.scorchOn[s] = 1;
    return i;
  }

  lookOf(i: number): BlastLook {
    return this.look[i] === 0 ? "fireball" : "shockwave";
  }

  /** Ends explosions past their longest layer and scorches past their fade. */
  update(nowS: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.active[i] !== 1) continue;
      const t = BLAST_TIMES[this.lookOf(i)];
      if (nowS - (this.startS[i] as number) > Math.max(t.flashS, t.glowS, t.ringS + t.ringGrowS)) this.active[i] = 0;
    }
    for (let s = 0; s < this.scorchCapacity; s++) if (this.scorchOn[s] === 1 && nowS - (this.scorchS[s] as number) > SCORCH_FADE_S) this.scorchOn[s] = 0;
  }

  /** A build start: the scorches fade out within a second (the street is "cleaned" with the wave). */
  fadeScorches(nowS: number): void {
    for (let s = 0; s < this.scorchCapacity; s++) if (this.scorchOn[s] === 1) this.scorchS[s] = Math.min(this.scorchS[s] as number, nowS - SCORCH_FADE_S + 1);
  }

  /** The scorch decal's alpha at `nowS`. */
  scorchAlpha(s: number, nowS: number): number {
    const age = nowS - (this.scorchS[s] as number);
    if (age < 0.15) return 0.85 * Math.max(0, age / 0.15);
    return 0.85 * Math.max(0, 1 - Math.max(0, age - (SCORCH_FADE_S - 6)) / 6);
  }

  /**
   * The edge ring of explosion `i` at `nowS`: its radius (m; EX2 grows from 0 to R then holds, EX1
   * sits on R) and alpha. The ring always ends on the exact blast radius (the damage edge).
   */
  ring(i: number, nowS: number, out: { r: number; alpha: number }): { r: number; alpha: number } {
    const look = this.lookOf(i);
    const t = BLAST_TIMES[look];
    const age = nowS - (this.startS[i] as number);
    const R = this.r[i] as number;
    if (t.ringGrowS > 0 && age < t.ringGrowS) {
      const u = age / t.ringGrowS;
      out.r = R * (1 - Math.pow(1 - u, 3));
      out.alpha = 0.9;
      return out;
    }
    out.r = R;
    const fade = (age - t.ringGrowS) / t.ringS;
    out.alpha = fade >= 1 ? 0 : (look === "fireball" ? 0.55 : 0.75) * (1 - Math.max(0, fade));
    return out;
  }
}
