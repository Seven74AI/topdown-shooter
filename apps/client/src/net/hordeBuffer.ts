import { HORDE_MAX_RECORDS, HORDE_MISSING_TICKS, zombieSlotOfNetId, type HordeSink } from "@topdown/shared";

/** Horde snapshots kept (Story 2.5): AC 3 asks for 3; 8 covers Story 2.6's 150 ms delay plus jitter. */
export const HORDE_RING_SIZE = 8;
/** `zombie.killed` net ids waiting for the render tick. */
export const HORDE_KILL_QUEUE_SIZE = 256;

const SLOTS = HORDE_MAX_RECORDS;

interface HordeSnapshot {
  tick: number;
  count: number;
  readonly netId: Uint16Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly heading: Uint8Array;
  readonly typeState: Uint8Array;
  /** Pool slot → record index in this snapshot, or −1. */
  readonly slotIndex: Int16Array;
}

const newSnapshot = (): HordeSnapshot => ({
  tick: 0,
  count: 0,
  netId: new Uint16Array(SLOTS),
  x: new Float32Array(SLOTS),
  y: new Float32Array(SLOTS),
  heading: new Uint8Array(SLOTS),
  typeState: new Uint8Array(SLOTS),
  slotIndex: new Int16Array(SLOTS).fill(-1),
});

/** The zombies to draw at one render tick (written by `HordeBuffer.sample`, reused every frame). */
export class HordeSample {
  count = 0;
  readonly netId = new Uint16Array(SLOTS);
  readonly x = new Float32Array(SLOTS);
  readonly y = new Float32Array(SLOTS);
  readonly heading = new Uint8Array(SLOTS);
  readonly typeState = new Uint8Array(SLOTS);
}

/**
 * Horde frames by server tick, for interpolation (Story 2.5). A preallocated ring of
 * HORDE_RING_SIZE snapshots; it is the `HordeSink` the decoder writes into, so a frame is copied
 * once and nothing is allocated per frame or per sample.
 *
 * - `sample(renderTick)`: A = newest snapshot with tick ≤ renderTick, B = the next one. Each
 *   record of B is drawn lerped from A when A has the same net id, else at B's position (a new
 *   generation is a different zombie: never lerped from the dead one). Past the newest frame A is
 *   held (no extrapolation); before the oldest, the oldest is shown.
 * - Missing rule (Story 8.9, D4): a slot absent from a frame remembers that frame's tick; it
 *   leaves the view once the render tick is HORDE_MISSING_TICKS (150 ms) past it (`dropMissing`),
 *   not after 3 arriving frames (a burst after a stall brings 3 at once). Until then it is held at
 *   its last sampled position, so a zombie crossing the margin edge doesn't flicker.
 * - Dead set: `markDead(netId)` (or `killAt` once the render tick reaches the kill) hides that net
 *   id in every snapshot, now and in later frames still carrying it.
 */
export class HordeBuffer implements HordeSink {
  private readonly ring: HordeSnapshot[] = Array.from({ length: HORDE_RING_SIZE }, newSnapshot);
  private head = 0;
  private count = 0;
  private writing: HordeSnapshot | null = null;

  /** Per slot: net id of the newest frames (−1 when out of view) and the tick of the first frame that lacked it (−1 none). */
  private readonly lastNetId = new Int32Array(SLOTS).fill(-1);
  private readonly firstMissTick = new Float64Array(SLOTS).fill(-1);
  /** Per slot: the net id marked dead (−1 none). */
  private readonly deadNetId = new Int32Array(SLOTS).fill(-1);
  /**
   * Per slot: a net id whose `zombie.killed` is queued but not rendered yet (−1 none). It stays
   * drawn (A's or the held pose) even after the missing rule dropped it, so it never vanishes
   * before its death FX (Story 2.5 review: with 2.6's 3-tick delay, every kill did).
   */
  private readonly pendingKillNetId = new Int32Array(SLOTS).fill(-1);
  /** Per slot: the last sampled pose, held while the zombie is missing (−1 none). */
  private readonly heldNetId = new Int32Array(SLOTS).fill(-1);
  private readonly heldX = new Float32Array(SLOTS);
  private readonly heldY = new Float32Array(SLOTS);
  private readonly heldHeading = new Uint8Array(SLOTS);
  private readonly heldTypeState = new Uint8Array(SLOTS);
  private readonly sampledAt = new Int32Array(SLOTS);
  private sampleId = 0;

  /** `zombie.killed` net ids by server tick, applied when the render tick reaches them. */
  private readonly killTicks = new Float64Array(HORDE_KILL_QUEUE_SIZE);
  private readonly killIds = new Int32Array(HORDE_KILL_QUEUE_SIZE);
  private killHead = 0;
  private killCount = 0;

  get size(): number {
    return this.count;
  }

  /** Tick of the newest snapshot; −1 when empty. */
  get latestTick(): number {
    return this.count === 0 ? -1 : this.at(this.count - 1).tick;
  }

  // HordeSink: one frame (the decoder checked the length and that the tick is newer).
  begin(tick: number, count: number): void {
    if (this.count > 0 && tick <= this.latestTick) {
      this.writing = null;
      return;
    }
    if (this.count === HORDE_RING_SIZE) {
      this.head = (this.head + 1) % HORDE_RING_SIZE;
      this.count--;
    }
    const s = this.ring[(this.head + this.count) % HORDE_RING_SIZE] as HordeSnapshot;
    for (let i = 0; i < s.count; i++) s.slotIndex[zombieSlotOfNetId(s.netId[i] as number)] = -1;
    s.tick = tick;
    s.count = Math.min(count, SLOTS);
    this.writing = s;
  }

  record(i: number, netId: number, x: number, y: number, heading: number, typeState: number): void {
    const s = this.writing;
    if (!s || i >= s.count) return;
    const slot = zombieSlotOfNetId(netId);
    s.netId[i] = netId;
    s.x[i] = x;
    s.y[i] = y;
    s.heading[i] = heading;
    s.typeState[i] = typeState;
    s.slotIndex[slot] = i;
    this.lastNetId[slot] = netId;
    this.firstMissTick[slot] = -1;
    const dead = this.deadNetId[slot] as number;
    if (dead >= 0 && dead !== netId) this.deadNetId[slot] = -1; // a new generation (or a wrapped one)
  }

  end(): void {
    const s = this.writing;
    this.writing = null;
    if (!s) return;
    this.count++;
    for (let slot = 0; slot < SLOTS; slot++) {
      if ((this.lastNetId[slot] as number) < 0 || (s.slotIndex[slot] as number) >= 0) continue;
      if ((this.firstMissTick[slot] as number) < 0) this.firstMissTick[slot] = s.tick;
    }
  }

  /**
   * Story 8.9 (D4): slots missing since a frame the render tick is HORDE_MISSING_TICKS past leave
   * the view (a pending kill keeps its zombie drawn until its death FX). One small function so the
   * delta decoder (Story 8.10) keeps the rule.
   */
  private dropMissing(renderTick: number): void {
    for (let slot = 0; slot < SLOTS; slot++) {
      const miss = this.firstMissTick[slot] as number;
      if (miss < 0 || renderTick < miss + HORDE_MISSING_TICKS) continue;
      this.firstMissTick[slot] = -1;
      const last = this.lastNetId[slot] as number;
      if (last < 0) continue;
      this.lastNetId[slot] = -1;
      if (this.pendingKillNetId[slot] !== last) this.heldNetId[slot] = -1;
    }
  }

  /** Hides `netId` at once and in every later frame that still carries it. */
  markDead(netId: number): void {
    const slot = zombieSlotOfNetId(netId);
    this.deadNetId[slot] = netId;
    if (this.pendingKillNetId[slot] === netId) this.pendingKillNetId[slot] = -1;
    if (this.heldNetId[slot] === netId) this.heldNetId[slot] = -1;
  }

  /** Still drawn while missing: in view by the missing rule, or its kill not rendered yet. */
  private keepsShowing(slot: number, netId: number): boolean {
    return this.lastNetId[slot] === netId || this.pendingKillNetId[slot] === netId;
  }

  /** A `zombie.killed` of server tick `tick`: `markDead` once the render tick reaches it. */
  killAt(tick: number, netId: number): void {
    if (this.killCount === HORDE_KILL_QUEUE_SIZE) {
      this.markDead(this.killIds[this.killHead] as number); // full (hidden tab): apply the oldest now
      this.killHead = (this.killHead + 1) % HORDE_KILL_QUEUE_SIZE;
      this.killCount--;
    }
    const i = (this.killHead + this.killCount) % HORDE_KILL_QUEUE_SIZE;
    this.killTicks[i] = tick;
    this.killIds[i] = netId;
    this.killCount++;
    this.pendingKillNetId[zombieSlotOfNetId(netId)] = netId;
  }

  /** Writes the zombies to draw at `renderTick` (fractional server tick) into `out`. */
  sample(renderTick: number, out: HordeSample): void {
    while (this.killCount > 0 && (this.killTicks[this.killHead] as number) <= renderTick) {
      this.markDead(this.killIds[this.killHead] as number);
      this.killHead = (this.killHead + 1) % HORDE_KILL_QUEUE_SIZE;
      this.killCount--;
    }
    this.dropMissing(renderTick);
    out.count = 0;
    if (this.count === 0) return;
    const id = ++this.sampleId;
    let ai = -1;
    for (let i = 0; i < this.count; i++) {
      if (this.at(i).tick <= renderTick) ai = i;
      else break;
    }
    let a: HordeSnapshot | null = null;
    let b: HordeSnapshot;
    let t = 0;
    if (ai < 0) b = this.at(0);
    else if (ai === this.count - 1) b = this.at(ai);
    else {
      a = this.at(ai);
      b = this.at(ai + 1);
      t = (renderTick - a.tick) / (b.tick - a.tick);
    }
    for (let k = 0; k < b.count; k++) {
      const netId = b.netId[k] as number;
      const slot = zombieSlotOfNetId(netId);
      if (this.deadNetId[slot] === netId || this.sampledAt[slot] === id) continue;
      let x = b.x[k] as number;
      let y = b.y[k] as number;
      let heading = b.heading[k] as number;
      const j = a ? (a.slotIndex[slot] as number) : -1;
      if (a && j >= 0 && a.netId[j] === netId) {
        x = (a.x[j] as number) + (x - (a.x[j] as number)) * t;
        y = (a.y[j] as number) + (y - (a.y[j] as number)) * t;
        if (t < 0.5) heading = a.heading[j] as number;
      }
      this.sampledAt[slot] = id;
      this.heldNetId[slot] = netId;
      this.heldX[slot] = x;
      this.heldY[slot] = y;
      this.heldHeading[slot] = heading;
      this.heldTypeState[slot] = b.typeState[k] as number;
      this.put(out, netId, x, y, heading, b.typeState[k] as number);
    }
    // In A but missing from B (left the view, or killed and the kill not rendered yet): A's pose.
    if (a) {
      for (let k = 0; k < a.count; k++) {
        const netId = a.netId[k] as number;
        const slot = zombieSlotOfNetId(netId);
        if (this.sampledAt[slot] === id || this.deadNetId[slot] === netId || !this.keepsShowing(slot, netId)) continue;
        this.sampledAt[slot] = id;
        this.heldNetId[slot] = netId;
        this.heldX[slot] = a.x[k] as number;
        this.heldY[slot] = a.y[k] as number;
        this.heldHeading[slot] = a.heading[k] as number;
        this.heldTypeState[slot] = a.typeState[k] as number;
        this.put(out, netId, a.x[k] as number, a.y[k] as number, a.heading[k] as number, a.typeState[k] as number);
      }
    }
    // Missing from B (and A) but still in view by the missing rule: hold the last sampled pose.
    for (let slot = 0; slot < SLOTS; slot++) {
      const held = this.heldNetId[slot] as number;
      if (held < 0 || this.sampledAt[slot] === id) continue;
      if (!this.keepsShowing(slot, held) || this.deadNetId[slot] === held) {
        this.heldNetId[slot] = -1;
        continue;
      }
      this.put(out, held, this.heldX[slot] as number, this.heldY[slot] as number, this.heldHeading[slot] as number, this.heldTypeState[slot] as number);
    }
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.writing = null;
    for (const s of this.ring) {
      s.count = 0;
      s.slotIndex.fill(-1);
    }
    this.lastNetId.fill(-1);
    this.firstMissTick.fill(-1);
    this.deadNetId.fill(-1);
    this.pendingKillNetId.fill(-1);
    this.heldNetId.fill(-1);
    this.killHead = 0;
    this.killCount = 0;
  }

  private put(out: HordeSample, netId: number, x: number, y: number, heading: number, typeState: number): void {
    const n = out.count;
    if (n >= SLOTS) return;
    out.netId[n] = netId;
    out.x[n] = x;
    out.y[n] = y;
    out.heading[n] = heading;
    out.typeState[n] = typeState;
    out.count = n + 1;
  }

  private at(i: number): HordeSnapshot {
    return this.ring[(this.head + i) % HORDE_RING_SIZE] as HordeSnapshot;
  }
}
