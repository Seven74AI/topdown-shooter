import { buildingById, type Box, type World } from "@topdown/shared";
import { MAX_FRAME_GAP_MS, REFUSE_ANIM_MS } from "./pendingPlacements";

/**
 * Story 5.22 (AC 13, D6): my moves sent and not answered yet. Phaser-free, so it is unit-tested; the
 * scene drives it once per frame after the host stepped (`update`), adds a box at each move Place
 * (`add`) and hands every `building.move_refused` to `refuse`. A box is done when the World (online:
 * the state) shows the building at the box's spot (it *became* the move), or the building is gone; it
 * turns red (5.18's refusal look: `pendingLook`) on a refusal by id or after `timeoutMs` of running
 * time (5.18 review M1's capped clock: a hidden tab never times a box out early). A phase change or a
 * new wave number clears everything. At most one box per building. The World is never changed
 * (F1). No allocation per frame.
 */
export const PENDING_MOVES = 6;

export interface PendingMoveEntry {
  /** The slot holds a box (waiting or showing its refusal). */
  live: boolean;
  /** Waiting for the answer (5.18's look: dashed + spinner). */
  counted: boolean;
  /** The building being moved and where to. */
  id: number;
  gx: number;
  gy: number;
  rot: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Running clock at the send. */
  sentClock: number;
  /** Scene clock when the refusal look started (NaN = not refused). */
  refusedMs: number;
}

const newEntry = (): PendingMoveEntry => ({ live: false, counted: false, id: 0, gx: 0, gy: 0, rot: 0, minX: 0, minY: 0, maxX: 0, maxY: 0, sentClock: 0, refusedMs: Number.NaN });

export class PendingMoves {
  readonly entries: PendingMoveEntry[] = [];
  /** Bumped whenever a box appears, goes or changes look (views redraw on it). */
  version = 0;
  /** Running time (ms): frame gaps, each capped at `MAX_FRAME_GAP_MS`. */
  clockMs = 0;
  private lastNowMs = Number.NaN;
  private phase = "";
  private wave = -1;

  constructor(size = PENDING_MOVES) {
    for (let i = 0; i < size; i++) this.entries.push(newEntry());
  }

  /** A move of building `id` is waiting (the action bar's Move reads "Moving…"). */
  waiting(id: number): boolean {
    for (const e of this.entries) if (e.live && e.counted && e.id === id) return true;
    return false;
  }

  /** How many moves are waiting. */
  get count(): number {
    let n = 0;
    for (const e of this.entries) if (e.live && e.counted) n++;
    return n;
  }

  /**
   * A move Place: a box for building `id` at (gx, gy, rot) with footprint `box`, sent now. Returns
   * false (send nothing) when a move of that building is already waiting or no slot is free.
   */
  add(id: number, gx: number, gy: number, rot: number, box: Readonly<Box>, phase: string, wave: number): boolean {
    this.belongTo(phase, wave);
    if (this.waiting(id)) return false;
    let slot: PendingMoveEntry | undefined;
    for (const e of this.entries) {
      if (e.live && e.id === id) slot = e; // its old refusal look: replaced
      else if (!slot && !e.live) slot = e;
    }
    if (!slot) return false;
    slot.live = true;
    slot.counted = true;
    slot.id = id;
    slot.gx = gx;
    slot.gy = gy;
    slot.rot = rot;
    slot.minX = box.minX;
    slot.minY = box.minY;
    slot.maxX = box.maxX;
    slot.maxY = box.maxY;
    slot.sentClock = this.clockMs;
    slot.refusedMs = Number.NaN;
    this.version++;
    return true;
  }

  /**
   * Once per frame after the host stepped: the clock, the phase/wave clear, done boxes (the World
   * shows the move, or the building is gone), timeouts (→ refusal look) and finished looks. Returns
   * how many boxes timed out now (the scene toasts "No answer from the server").
   */
  update(world: Readonly<World>, nowMs: number, timeoutMs: number): number {
    const gap = Number.isNaN(this.lastNowMs) ? 0 : Math.min(MAX_FRAME_GAP_MS, Math.max(0, nowMs - this.lastNowMs));
    this.lastNowMs = nowMs;
    this.clockMs += gap;
    this.belongTo(world.run.phase, world.waves.number);
    let timedOut = 0;
    for (const e of this.entries) {
      if (!e.live) continue;
      if (e.counted) {
        const b = buildingById(world, e.id);
        if (!b || (b.gx === e.gx && b.gy === e.gy && b.rot === e.rot)) {
          this.free(e);
          continue;
        }
        if (this.clockMs - e.sentClock >= timeoutMs) {
          this.startRefusal(e, nowMs);
          timedOut++;
        }
      } else if (!Number.isNaN(e.refusedMs) && nowMs - e.refusedMs >= REFUSE_ANIM_MS) this.free(e);
    }
    return timedOut;
  }

  /** A refusal for building `id`: its waiting box shows the refusal look. Returns whether one was waiting. */
  refuse(id: number, nowMs: number): boolean {
    for (const e of this.entries) {
      if (e.live && e.counted && e.id === id) {
        this.startRefusal(e, nowMs);
        return true;
      }
    }
    return false;
  }

  /** Run start / scene restart. */
  clear(): void {
    for (const e of this.entries) if (e.live) this.free(e);
    this.phase = "";
    this.wave = -1;
    this.lastNowMs = Number.NaN;
  }

  private belongTo(phase: string, wave: number): void {
    if (phase === this.phase && wave === this.wave) return;
    this.phase = phase;
    this.wave = wave;
    for (const e of this.entries) if (e.live) this.free(e);
  }

  private startRefusal(e: PendingMoveEntry, nowMs: number): void {
    e.counted = false;
    e.refusedMs = nowMs;
    this.version++;
  }

  private free(e: PendingMoveEntry): void {
    e.live = false;
    e.counted = false;
    e.refusedMs = Number.NaN;
    this.version++;
  }
}
