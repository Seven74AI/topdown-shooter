import type { SimEvent } from "@topdown/shared";

/**
 * Story 5.6: the client's cosmetic copy of spits and acid puddles (F7: damage is server truth; the
 * client only draws where the server says). Fed by events in both modes — online the server's
 * (`spitter.spat`, `acid.splashed`, `build.started`), solo the local World's, through the same
 * `drainEvents` path:
 *
 * - a glob starts at the spat's mouth point and flies straight toward (toX, toY) at the type's
 *   `speedMps` from the moment its event is drawn; `acid.splashed` with its id ends it (and puts the
 *   puddle at the server's exact point); a glob that reached its end without a splash yet waits
 *   there, hidden after `GLOB_GRACE_S` (a splash lost to interest filtering never leaves one hanging);
 * - a puddle lives `puddleS` from its splash event, at most `maxPuddles` (the oldest goes first,
 *   like the server's pool); `build.started` drops every glob and puddle (DD4; a hidden tab that
 *   slept across a build start shows nothing stale);
 * - a late Game scene start sees only events after it: only puddles made after it (D3).
 *
 * Fixed pools, no allocation per event or frame.
 */
export const GLOB_GRACE_S = 0.5;
/** Review M1: a spit or splash event older than this when drained (a woken tab) plays no sound. */
export const ACID_SOUND_MAX_AGE_S = 0.25;

export class AcidFx {
  readonly globId: Int32Array;
  readonly globX0: Float64Array;
  readonly globY0: Float64Array;
  readonly globX1: Float64Array;
  readonly globY1: Float64Array;
  readonly globStartS: Float64Array;
  /** Flight time to the end point (s). */
  readonly globDurS: Float64Array;
  readonly puddleId: Int32Array;
  readonly puddleX: Float64Array;
  readonly puddleY: Float64Array;
  readonly puddleStartS: Float64Array;
  /** Live slots (-1 id = free). */
  globCount = 0;
  puddleCount = 0;

  constructor(
    readonly maxGlobs: number,
    readonly maxPuddles: number,
    private readonly speedMps: number,
    readonly puddleS: number,
  ) {
    this.globId = new Int32Array(maxGlobs).fill(-1);
    this.globX0 = new Float64Array(maxGlobs);
    this.globY0 = new Float64Array(maxGlobs);
    this.globX1 = new Float64Array(maxGlobs);
    this.globY1 = new Float64Array(maxGlobs);
    this.globStartS = new Float64Array(maxGlobs);
    this.globDurS = new Float64Array(maxGlobs);
    this.puddleId = new Int32Array(maxPuddles).fill(-1);
    this.puddleX = new Float64Array(maxPuddles);
    this.puddleY = new Float64Array(maxPuddles);
    this.puddleStartS = new Float64Array(maxPuddles);
  }

  /** Routes one drained event (others are ignored). Returns true when it was a spit/acid/build event. */
  handle(e: SimEvent, nowS: number): boolean {
    // Review M1: an event drained late (a woken tab) starts as far back as it is old.
    if (e.type === "spitter.spat") this.spat(e.spitId, e.x, e.y, e.toX, e.toY, nowS - (e.ageS ?? 0));
    else if (e.type === "acid.splashed") this.splashed(e.puddleId, e.x, e.y, nowS - (e.ageS ?? 0));
    else if (e.type === "build.started") this.clear();
    else return false;
    return true;
  }

  spat(id: number, x: number, y: number, toX: number, toY: number, nowS: number): void {
    let slot = -1;
    let oldest = Infinity;
    let oldestSlot = 0;
    for (let i = 0; i < this.maxGlobs; i++) {
      if (this.globId[i] === -1) {
        slot = i;
        break;
      }
      if ((this.globStartS[i] as number) < oldest) {
        oldest = this.globStartS[i] as number;
        oldestSlot = i;
      }
    }
    if (slot < 0) slot = oldestSlot;
    else this.globCount++;
    this.globId[slot] = id;
    this.globX0[slot] = x;
    this.globY0[slot] = y;
    this.globX1[slot] = toX;
    this.globY1[slot] = toY;
    this.globStartS[slot] = nowS;
    this.globDurS[slot] = Math.hypot(toX - x, toY - y) / Math.max(1e-6, this.speedMps);
  }

  splashed(id: number, x: number, y: number, nowS: number): void {
    for (let i = 0; i < this.maxGlobs; i++) {
      if (this.globId[i] === id) {
        this.globId[i] = -1;
        this.globCount--;
        break;
      }
    }
    let slot = -1;
    let oldest = Infinity;
    let oldestSlot = 0;
    for (let i = 0; i < this.maxPuddles; i++) {
      if (this.puddleId[i] === -1) {
        slot = i;
        break;
      }
      if ((this.puddleStartS[i] as number) < oldest) {
        oldest = this.puddleStartS[i] as number;
        oldestSlot = i;
      }
    }
    if (slot < 0) slot = oldestSlot;
    else this.puddleCount++;
    this.puddleId[slot] = id;
    this.puddleX[slot] = x;
    this.puddleY[slot] = y;
    this.puddleStartS[slot] = nowS;
  }

  /** Frees ended puddles and globs past their end + grace. */
  update(nowS: number): void {
    for (let i = 0; i < this.maxPuddles; i++) {
      if (this.puddleId[i] !== -1 && nowS - (this.puddleStartS[i] as number) >= this.puddleS) {
        this.puddleId[i] = -1;
        this.puddleCount--;
      }
    }
    for (let i = 0; i < this.maxGlobs; i++) {
      if (this.globId[i] !== -1 && nowS - (this.globStartS[i] as number) >= (this.globDurS[i] as number) + GLOB_GRACE_S) {
        this.globId[i] = -1;
        this.globCount--;
      }
    }
  }

  /** Flight fraction 0…1 of glob slot `i` at `nowS` (1 = waiting at its end point). */
  globProgress(i: number, nowS: number): number {
    const d = this.globDurS[i] as number;
    return d <= 0 ? 1 : Math.min(1, Math.max(0, (nowS - (this.globStartS[i] as number)) / d));
  }

  clear(): void {
    this.globId.fill(-1);
    this.puddleId.fill(-1);
    this.globCount = 0;
    this.puddleCount = 0;
  }
}

/**
 * The puddle's drawn radius (m): exactly the server's `puddleRadiusM` — the frame's outer ring edge
 * is the damage edge (`circleInAcid`: a body touching the ring is in acid, 4.8 D16).
 */
export function acidRingRadiusM(puddleRadiusM: number): number {
  return puddleRadiusM;
}
