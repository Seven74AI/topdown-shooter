import { MAX_PLAYERS, lerpHeading, type PlayerStateView, type RunStateView } from "@topdown/shared";

/** Snapshots kept (Story 2.4): 800 ms at 20 Hz, enough for the 100–150 ms delay plus jitter. */
export const SNAPSHOT_RING_SIZE = 16;

interface Snapshot {
  tick: number;
  /** Per slot 0–3: 1 when that player is in this snapshot. */
  readonly present: Uint8Array;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly heading: Float64Array;
}

const newSnapshot = (): Snapshot => ({
  tick: 0,
  present: new Uint8Array(MAX_PLAYERS),
  x: new Float64Array(MAX_PLAYERS),
  y: new Float64Array(MAX_PLAYERS),
  heading: new Float64Array(MAX_PLAYERS),
});

export interface SampledPose {
  x: number;
  y: number;
  /** Fractional heading in [0, 256). */
  heading: number;
}

/**
 * Player positions per server tick, for interpolation (Story 2.4). `push` copies `tick` and each
 * player's `x`, `y`, `heading` into a preallocated ring: never a reference to a schema object.
 */
export class SnapshotRing {
  private readonly ring: Snapshot[] = Array.from({ length: SNAPSHOT_RING_SIZE }, newSnapshot);
  private head = 0;
  private count = 0;
  private filling: Snapshot | null = null;
  private readonly copyPlayer = (p: PlayerStateView): void => {
    const s = this.filling;
    if (!s || p.slot >= MAX_PLAYERS) return;
    s.present[p.slot] = 1;
    s.x[p.slot] = p.x;
    s.y[p.slot] = p.y;
    s.heading[p.slot] = p.heading;
  };

  get size(): number {
    return this.count;
  }

  /** Tick of the newest snapshot; -1 when empty. */
  get latestTick(): number {
    return this.count === 0 ? -1 : (this.at(this.count - 1).tick);
  }

  /** Copies the state's tick and players. A tick not newer than the latest is ignored. */
  push(state: RunStateView): void {
    if (this.count > 0 && state.tick <= this.latestTick) return;
    if (this.count === SNAPSHOT_RING_SIZE) {
      this.head = (this.head + 1) % SNAPSHOT_RING_SIZE;
      this.count--;
    }
    const s = this.ring[(this.head + this.count) % SNAPSHOT_RING_SIZE] as Snapshot;
    this.count++;
    s.tick = state.tick;
    s.present.fill(0);
    this.filling = s;
    state.players.forEach(this.copyPlayer);
    this.filling = null;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /**
   * The pose of the player in `slot` at a (fractional) render tick: interpolated between the two
   * snapshots around it; before the oldest, the oldest; past the newest, the newest (never
   * extrapolated). Returns false when no snapshot has this player.
   */
  sample(slot: number, renderTick: number, out: SampledPose): boolean {
    let before: Snapshot | null = null;
    let after: Snapshot | null = null;
    for (let i = 0; i < this.count; i++) {
      const s = this.at(i);
      if (s.present[slot] !== 1) continue;
      if (s.tick <= renderTick) before = s;
      else {
        after = s;
        break;
      }
    }
    if (before && after) {
      const t = (renderTick - before.tick) / (after.tick - before.tick);
      out.x = (before.x[slot] as number) + ((after.x[slot] as number) - (before.x[slot] as number)) * t;
      out.y = (before.y[slot] as number) + ((after.y[slot] as number) - (before.y[slot] as number)) * t;
      out.heading = lerpHeading(before.heading[slot] as number, after.heading[slot] as number, t);
      return true;
    }
    const only = before ?? after;
    if (!only) return false;
    out.x = only.x[slot] as number;
    out.y = only.y[slot] as number;
    out.heading = only.heading[slot] as number;
    return true;
  }

  private at(i: number): Snapshot {
    return this.ring[(this.head + i) % SNAPSHOT_RING_SIZE] as Snapshot;
  }
}
