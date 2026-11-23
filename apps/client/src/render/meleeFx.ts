/**
 * Story 5.2: the Phaser-free parts of the heavy melee effects (unit-tested):
 *
 * - `SparkPool`: the Chainsaw's spark / blood spray, a fixed-size pool of particles in typed arrays
 *   (`controls.json › fx.maxChainsawSparks`, brief line 12: the oldest is reused when full; no
 *   allocation per spawn or per frame). FxView draws the live ones into one Graphics per frame.
 * - `SawClock`: when each player's Chainsaw last cut (from `melee.swung`), so the survivor shows the
 *   running-blade frame and my rev loop runs only while swings keep arriving (≤ `chainsawRevHoldMs`
 *   apart) and stops otherwise.
 */

import { circleOverlapsSector, zombieTypeOf, type World } from "@topdown/shared";

const DEG = Math.PI / 180;

/**
 * Zombies of `world` (the drawn mirror online) whose body touches the swing's sector: the sim's own
 * test (`circleOverlapsSector` to the zombie's edge), for the sparks of my own Chainsaw swings online
 * (local events carry no server hit count). Cosmetic only; no allocation.
 */
export function countInArc(world: Readonly<World>, x: number, y: number, dirX: number, dirY: number, arcDeg: number, rangeM: number): number {
  const z = world.zombies;
  const half = (arcDeg / 2) * DEG;
  const cosH = Math.cos(half);
  const sinH = Math.sin(half);
  let n = 0;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    if (circleOverlapsSector(z.x[id] as number, z.y[id] as number, r, x, y, dirX, dirY, rangeM, cosH, sinH)) n++;
  }
  return n;
}

/** Spark kinds: steel sparks (always) and blood (when the blade cuts a zombie). */
export const SPARK_STEEL = 0;
export const SPARK_BLOOD = 1;

export class SparkPool {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** Remaining life (ms); ≤ 0 = free. */
  readonly lifeMs: Float32Array;
  readonly kind: Uint8Array;
  private next = 0;
  /** Spawn counter: a cheap deterministic spread (no Math.random, no allocation). */
  private seed = 1;

  constructor(
    readonly cap: number,
    private readonly sparkMs: number,
  ) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.lifeMs = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
  }

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /**
   * `n` sparks from the blade tip (x, y) thrown forward-sideways off the unit (dirX, dirY): a spray
   * fanning ±60° around the blade's side, 2–5 m/s. The oldest slot is reused when the pool is full.
   */
  spawn(x: number, y: number, dirX: number, dirY: number, n: number, kind: number): void {
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (k + 1) % this.cap;
      const side = this.rand() < 0.5 ? -1 : 1;
      const a = (this.rand() - 0.5) * 2.1;
      // around the blade's side (perpendicular), leaning back toward the wielder
      const px = -dirY * side;
      const py = dirX * side;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ux = px * c - py * s - dirX * 0.35;
      const uy = px * s + py * c - dirY * 0.35;
      const sp = 2 + this.rand() * 3;
      this.x[k] = x;
      this.y[k] = y;
      this.vx[k] = ux * sp;
      this.vy[k] = uy * sp;
      this.lifeMs[k] = this.sparkMs * (0.6 + this.rand() * 0.4);
      this.kind[k] = kind;
    }
  }

  /** Moves and ages every live spark (drag slows them); returns how many are alive. */
  update(dtMs: number): number {
    const dt = dtMs / 1000;
    const drag = Math.max(0, 1 - dt * 6);
    let live = 0;
    for (let k = 0; k < this.cap; k++) {
      if ((this.lifeMs[k] as number) <= 0) continue;
      this.lifeMs[k] = (this.lifeMs[k] as number) - dtMs;
      if ((this.lifeMs[k] as number) <= 0) continue;
      this.x[k] = (this.x[k] as number) + (this.vx[k] as number) * dt;
      this.y[k] = (this.y[k] as number) + (this.vy[k] as number) * dt;
      this.vx[k] = (this.vx[k] as number) * drag;
      this.vy[k] = (this.vy[k] as number) * drag;
      live++;
    }
    return live;
  }

  /** Remaining share of a live spark's life (0–1), for its alpha. */
  alpha(k: number): number {
    return Math.max(0, Math.min(1, (this.lifeMs[k] as number) / this.sparkMs));
  }

  clear(): void {
    this.lifeMs.fill(0);
  }
}

/** When each player's Chainsaw last cut (ms, the scene clock), and my rev loop's state. */
export class SawClock {
  private readonly last = new Map<string, number>();
  /** My rev loop is playing. */
  revving = false;
  /**
   * The last frame's length (ms, set by GameScene each frame): a slow frame (a busy phone, a
   * headless browser) stamps all its swings at once, so the hold stretches by one frame.
   */
  frameMs = 0;

  constructor(private readonly holdMs: number) {}

  /** A Chainsaw `melee.swung` of `playerId` at `nowMs`. */
  swung(playerId: string, nowMs: number): void {
    this.last.set(playerId, nowMs);
  }

  /** The Chainsaw of `playerId` is running (a swing within `holdMs`). */
  running(playerId: string, nowMs: number): boolean {
    const t = this.last.get(playerId);
    return t !== undefined && nowMs - t <= this.holdMs + this.frameMs;
  }

  /**
   * Once per frame for my player: "start" when my Chainsaw runs and the loop doesn't, "stop" when
   * the loop plays but no swing came within `holdMs`, else "none" (never a start or stop per swing).
   */
  revStep(localId: string, nowMs: number): "start" | "stop" | "none" {
    const run = this.running(localId, nowMs);
    if (run && !this.revving) {
      this.revving = true;
      return "start";
    }
    if (!run && this.revving) {
      this.revving = false;
      return "stop";
    }
    return "none";
  }

  clear(): void {
    this.last.clear();
    this.revving = false;
  }
}
