import type { SimEvent } from "@topdown/shared";
import { FxRandom } from "./city/fireParticles";

/**
 * Story 5.8: the client's cosmetic copy of Bloater bursts and their gas clouds (FR-F: the slow is
 * server truth; the client only draws where the server says), fed by `bloater.burst` in both modes
 * (online the server's events, solo the local World's, through `drainEvents`):
 *
 * - a cloud lives exactly `gasS` from its burst at exactly `gasRadiusM` (the slow's edge), at most
 *   `maxClouds` (the oldest is replaced, like the server's pool); it fades in fast and out over its
 *   last second; `build.started` drops every cloud and particle (no ghost clouds after a hidden tab
 *   slept across a build start); an event drained late (`ageS`) starts that much earlier and is
 *   dropped once older than `gasS`;
 * - each burst throws a fixed handful of particles (bile drops that fly, land and stay as splats,
 *   cloth scraps in the look's colours, gas puffs drifting inside the cloud) into ONE pool of
 *   `maxParticles` (`controls.json › fx.maxBloaterParticles`): a chain of 8 bursts a tick takes what
 *   is free and never allocates.
 *
 * Pure (no Phaser): `BloaterView` puts the numbers on pooled images.
 */

/** Particle kinds. */
export const BURST_DROP = 0;
export const BURST_SCRAP = 1;
export const BURST_PUFF = 2;
export const BURST_SPLAT = 3;

/** Per burst (the round-C drawing: 40 drops, 10 scraps, 16 puffs; trimmed for phones). */
export const BURST_DROPS = 14;
export const BURST_SCRAPS = 5;
export const BURST_PUFFS = 8;
/** The flash and the shock ring that runs out to the blast's edge (s). */
export const BURST_FLASH_S = 0.14;
export const BURST_RING_S = 0.1;
export const BURST_RING_FADE_S = 0.6;
/** A cloud fades in over this (s) and out over its last `CLOUD_FADE_OUT_S`. */
export const CLOUD_FADE_IN_S = 0.25;
export const CLOUD_FADE_OUT_S = 1;
/** Gravity on flying drops and scraps (m/s²; cosmetic height `z`). */
const GRAVITY = 9;

export class BloaterFx {
  // clouds
  readonly cloudX: Float64Array;
  readonly cloudY: Float64Array;
  readonly cloudStartS: Float64Array;
  /** 1 while the slot holds a cloud. */
  readonly cloudOn: Uint8Array;
  cloudCount = 0;
  // particles
  readonly kind: Uint8Array;
  readonly on: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly rot: Float32Array;
  readonly vr: Float32Array;
  readonly size: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly tone: Uint8Array;
  /** The cloud slot a particle belongs to (it ends with it). */
  readonly owner: Int16Array;
  particleCount = 0;
  private cursor = 0;
  private readonly rnd = new FxRandom(0x5b1a7e);
  /** The last update's time (s). */
  private lastS = Number.NaN;

  constructor(
    readonly maxClouds: number,
    readonly maxParticles: number,
    readonly gasRadiusM: number,
    readonly gasS: number,
  ) {
    this.cloudX = new Float64Array(maxClouds);
    this.cloudY = new Float64Array(maxClouds);
    this.cloudStartS = new Float64Array(maxClouds);
    this.cloudOn = new Uint8Array(maxClouds);
    this.kind = new Uint8Array(maxParticles);
    this.on = new Uint8Array(maxParticles);
    this.x = new Float32Array(maxParticles);
    this.y = new Float32Array(maxParticles);
    this.z = new Float32Array(maxParticles);
    this.vx = new Float32Array(maxParticles);
    this.vy = new Float32Array(maxParticles);
    this.vz = new Float32Array(maxParticles);
    this.rot = new Float32Array(maxParticles);
    this.vr = new Float32Array(maxParticles);
    this.size = new Float32Array(maxParticles);
    this.age = new Float32Array(maxParticles);
    this.life = new Float32Array(maxParticles);
    this.tone = new Uint8Array(maxParticles);
    this.owner = new Int16Array(maxParticles).fill(-1);
  }

  /** Routes one drained event (others are ignored). Returns true for a burst (it played) or a build start. */
  handle(e: SimEvent, nowS: number): boolean {
    if (e.type === "bloater.burst") {
      const age = e.ageS ?? 0;
      if (age >= this.gasS) return false; // a woken tab's backlog: that cloud is gone on the server too
      this.burst(e.x, e.y, nowS - age);
      return true;
    }
    if (e.type === "build.started") {
      this.clear();
      return true;
    }
    return false;
  }

  /** A burst at (x, y) that happened at `startS`: a cloud slot (the oldest replaced at the cap) and its particles. */
  burst(x: number, y: number, startS: number): number {
    let slot = -1;
    let oldest = Infinity;
    let oldestSlot = 0;
    for (let i = 0; i < this.maxClouds; i++) {
      if (this.cloudOn[i] === 0) {
        slot = i;
        break;
      }
      if ((this.cloudStartS[i] as number) < oldest) {
        oldest = this.cloudStartS[i] as number;
        oldestSlot = i;
      }
    }
    if (slot < 0) {
      slot = oldestSlot;
      this.endCloud(slot);
    }
    this.cloudX[slot] = x;
    this.cloudY[slot] = y;
    this.cloudStartS[slot] = startS;
    this.cloudOn[slot] = 1;
    this.cloudCount++;
    const r = this.rnd;
    const R = this.gasRadiusM;
    for (let k = 0; k < BURST_DROPS; k++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(1.2, 4.8);
      this.put(slot, BURST_DROP, x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, Math.cos(a) * sp, Math.sin(a) * sp, 0.6, r.range(0.5, 3), r.range(0.07, 0.14), 99, k & 3);
    }
    for (let k = 0; k < BURST_SCRAPS; k++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(1, 3.2);
      const i = this.put(slot, BURST_SCRAP, x + Math.cos(a) * 0.2, y + Math.sin(a) * 0.2, Math.cos(a) * sp, Math.sin(a) * sp, 0.7, r.range(1.5, 3.5), r.range(0.06, 0.1), r.range(3, 3.6), k);
      if (i >= 0) this.vr[i] = r.range(-12, 12);
    }
    for (let k = 0; k < BURST_PUFFS; k++) {
      const a = r.range(0, Math.PI * 2);
      const d = R * 0.55 * Math.sqrt(r.next());
      const i = this.put(slot, BURST_PUFF, x + Math.cos(a) * d * 0.3, y + Math.sin(a) * d * 0.3, Math.cos(a) * d * 2.2, Math.sin(a) * d * 2.2, 0, 0, r.range(1.2, 1.6), r.range(this.gasS * 0.8, this.gasS), k & 1);
      if (i >= 0) this.vr[i] = r.range(-0.3, 0.3);
    }
    return slot;
  }

  private put(owner: number, kind: number, x: number, y: number, vx: number, vy: number, z: number, vz: number, size: number, life: number, tone: number): number {
    if (this.particleCount >= this.maxParticles) return -1;
    for (let k = 0; k < this.maxParticles; k++) {
      const i = (this.cursor + k) % this.maxParticles;
      if (this.on[i] === 1) continue;
      this.cursor = (i + 1) % this.maxParticles;
      this.on[i] = 1;
      this.kind[i] = kind;
      this.owner[i] = owner;
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      this.rot[i] = this.rnd.range(0, Math.PI * 2);
      this.vr[i] = 0;
      this.size[i] = size;
      this.age[i] = 0;
      this.life[i] = life;
      this.tone[i] = tone;
      this.particleCount++;
      return i;
    }
    return -1;
  }

  private endCloud(slot: number): void {
    if (this.cloudOn[slot] === 0) return;
    this.cloudOn[slot] = 0;
    this.cloudCount--;
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.on[i] === 1 && this.owner[i] === slot) this.kill(i);
    }
  }

  private kill(i: number): void {
    this.on[i] = 0;
    this.owner[i] = -1;
    this.particleCount--;
  }

  /** Steps the particles to `nowS` and ends clouds older than `gasS`. */
  update(nowS: number): void {
    const dt = Number.isNaN(this.lastS) ? 0 : Math.max(0, Math.min(0.05, nowS - this.lastS));
    this.lastS = nowS;
    for (let c = 0; c < this.maxClouds; c++) {
      if (this.cloudOn[c] === 1 && nowS - (this.cloudStartS[c] as number) >= this.gasS) this.endCloud(c);
    }
    if (dt <= 0 || this.particleCount === 0) return;
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.on[i] === 0) continue;
      const age = (this.age[i] as number) + dt;
      this.age[i] = age;
      if (age >= (this.life[i] as number)) {
        this.kill(i);
        continue;
      }
      const k = this.kind[i] as number;
      if (k === BURST_SPLAT) continue;
      if (k === BURST_PUFF) {
        // drift: slows to a crawl inside the cloud, never past its edge
        const dd = Math.max(0, 1 - 2.2 * dt);
        this.vx[i] = (this.vx[i] as number) * dd;
        this.vy[i] = (this.vy[i] as number) * dd;
      } else {
        this.vz[i] = (this.vz[i] as number) - GRAVITY * dt * (k === BURST_SCRAP ? 0.35 : 1);
        if (k === BURST_SCRAP) this.vz[i] = Math.max(this.vz[i] as number, -1.2);
        let z = (this.z[i] as number) + (this.vz[i] as number) * dt;
        if (z <= 0) {
          z = 0;
          this.vx[i] = 0;
          this.vy[i] = 0;
          this.vz[i] = 0;
          if (k === BURST_DROP) {
            // landed: a splat for the rest of its cloud's life (`endCloud` removes it with the cloud)
            this.kind[i] = BURST_SPLAT;
            this.size[i] = (this.size[i] as number) * 3;
          }
        }
        this.z[i] = z;
      }
      this.x[i] = (this.x[i] as number) + (this.vx[i] as number) * dt;
      this.y[i] = (this.y[i] as number) + (this.vy[i] as number) * dt;
      this.rot[i] = (this.rot[i] as number) + (this.vr[i] as number) * dt;
    }
  }

  /** Cloud `c`'s alpha 0–1 at `nowS` (0 when off): fade in, hold, fade out over the last second. */
  cloudAlpha(c: number, nowS: number): number {
    if (this.cloudOn[c] === 0) return 0;
    const t = nowS - (this.cloudStartS[c] as number);
    if (t < 0 || t >= this.gasS) return 0;
    if (t < CLOUD_FADE_IN_S) return t / CLOUD_FADE_IN_S;
    return Math.min(1, (this.gasS - t) / CLOUD_FADE_OUT_S);
  }

  /** Seconds since cloud `c`'s burst. */
  cloudAge(c: number, nowS: number): number {
    return nowS - (this.cloudStartS[c] as number);
  }

  /** The circle (x, y, r) overlaps a live cosmetic cloud (the local gas tint; the slow itself is the server's). */
  inCloud(x: number, y: number, r: number, nowS: number): boolean {
    for (let c = 0; c < this.maxClouds; c++) {
      if (this.cloudAlpha(c, nowS) <= 0) continue;
      const dx = x - (this.cloudX[c] as number);
      const dy = y - (this.cloudY[c] as number);
      const rr = this.gasRadiusM + r;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }

  clear(): void {
    this.cloudOn.fill(0);
    this.cloudCount = 0;
    this.on.fill(0);
    this.owner.fill(-1);
    this.particleCount = 0;
  }
}
