import type { Box, Building, PlaceError, PlaceRequest, World } from "@topdown/shared";

/**
 * Story 5.18 (BX-4, ux-spec §6.4): placements this device sent (or is about to send) and has no
 * answer for yet. Phaser-free, so it is unit-tested. The scene, once per frame:
 *
 * 1. `update(world, ownerId, now)`: a phase change or a new wave number clears everything (AC 9);
 *    a box whose building is now in the World goes (it *became* the building, AC 7); a sent box
 *    with no answer after `pendingTimeoutMs` starts its refusal look (it stays as an invisible
 *    "ghost" that can still take its late answer, D6); finished animations free their slot.
 * 2. the placement step may `add` a box (the spot shown at the press, its price, the newest
 *    building id I know);
 * 3. `pump(now, send)` sends the oldest queued box once `chainSendGapMs` has passed since the last
 *    send (≤ 4/s, AC 6); then `update` again (solo applies a placement at once);
 * 4. each refusal the host hands on goes to `refuse` → the oldest unanswered box (AC 8: the host
 *    hands a refusal on only once the World holds every building the server accepted before it).
 *
 * While a box is *counted* (queued or sent, not answered, not timed out) it is occupied ground for
 * my next ghost (`overlaps`), counts toward my cap (`count`) and its price is off the shown wallet
 * (`money`). The World is never changed: the server decides (F1). No allocation after construction.
 */

/** Pool size: `maxPerPlayer` (6) counted boxes plus fading and ghost ones. */
export const PENDING_POOL = 16;
/** D6: a timed-out box waits this long (from its send) for a late answer, then is forgotten. */
export const GHOST_KEEP_MS = 10_000;
/** ux-spec §6.4: the refusal look, 3 shakes × 150 ms (±0.1 m), then a 300 ms fade. */
export const SHAKE_COUNT = 3;
export const SHAKE_MS = 150;
export const SHAKE_M = 0.1;
export const FADE_MS = 300;
export const REFUSE_ANIM_MS = SHAKE_COUNT * SHAKE_MS + FADE_MS;

export interface PendingEntry {
  /** The slot holds a box (any state). */
  live: boolean;
  /** Queued or sent, not answered and not timed out: occupied, on the cap, off the shown wallet. */
  counted: boolean;
  /** Sent (false = queued, waiting for the send gap). */
  sent: boolean;
  /** Sent and no answer yet (a refusal or the building may still come; true for a timed-out ghost too). */
  awaiting: boolean;
  /** Increasing per add: FIFO order (the server answers one client's places in order). */
  order: number;
  type: string;
  gx: number;
  gy: number;
  rot: number;
  price: number;
  /** The footprint (m). */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** The newest building id this device knew at the press: my new building's id is larger. */
  afterId: number;
  sentMs: number;
  /** Scene clock when the refusal look started (NaN = not refused). */
  refusedMs: number;
}

/** How one refusal was taken (the scene toasts only `"shown"`). */
export type RefuseResult = "shown" | "ghost" | "none";

function newEntry(): PendingEntry {
  return { live: false, counted: false, sent: false, awaiting: false, order: 0, type: "", gx: 0, gy: 0, rot: 0, price: 0, minX: 0, minY: 0, maxX: 0, maxY: 0, afterId: 0, sentMs: 0, refusedMs: Number.NaN };
}

/** The newest building id in `world` (the list is sorted by id). */
export function newestBuildingId(world: Readonly<World>): number {
  const list = world.buildings.list;
  return list.length > 0 ? (list[list.length - 1] as Building).id : 0;
}

export class PendingPlacements {
  /** Fixed pool (no allocation after construction); `live` marks the used slots. */
  readonly entries: readonly PendingEntry[];
  /** Counted boxes (queued + sent, unanswered, not timed out). */
  count = 0;
  /** Sum of their prices: off the shown wallet. */
  money = 0;
  /** Bumped whenever a box appears, goes or changes look (views redraw slots on it). */
  version = 0;
  private nextOrder = 1;
  private lastSendMs = Number.NEGATIVE_INFINITY;
  /** The building id the last matched box became (my accepted buildings come in send order). */
  private lastMatchedId = 0;
  /** Phase and wave number the boxes belong to ("" = none yet). */
  private phase = "";
  private wave = -1;
  /** Timeout (ms) and send gap (ms), from `controls.build` (`configure`). */
  private timeoutMs = 2000;
  private gapMs = 250;
  /** Request handed to `send` (reused). */
  private readonly req: { type: string; gx: number; gy: number; rot: number } = { type: "", gx: 0, gy: 0, rot: 0 };

  constructor() {
    const list: PendingEntry[] = [];
    for (let i = 0; i < PENDING_POOL; i++) list.push(newEntry());
    this.entries = list;
  }

  configure(timeoutMs: number, gapMs: number): void {
    this.timeoutMs = timeoutMs;
    this.gapMs = gapMs;
  }

  /** A new run (Phaser reuses the scene): nothing pending, nothing remembered. */
  reset(): void {
    this.clear();
    this.lastSendMs = Number.NEGATIVE_INFINITY;
    this.lastMatchedId = 0;
  }

  /** Every box goes (queued ones are never sent). */
  clear(): void {
    for (const e of this.entries) if (e.live) this.free(e);
    this.phase = "";
    this.wave = -1;
  }

  /**
   * A Place: a counted box at `box` for `req` (copied), queued for `pump`. `phase`/`wave` are the
   * World's now (a change clears the boxes). Returns false when the pool is full (the oldest ghost
   * or fading box is dropped first; never a counted one).
   */
  add(req: Readonly<PlaceRequest>, price: number, box: Readonly<Box>, afterId: number, phase: string, wave: number): boolean {
    if (this.phase !== phase || this.wave !== wave) {
      this.clear();
      this.phase = phase;
      this.wave = wave;
    }
    let slot = this.freeSlot();
    if (!slot) {
      slot = this.oldestUncounted();
      if (!slot) return false;
      this.free(slot);
    }
    const e = slot;
    e.live = true;
    e.counted = true;
    e.sent = false;
    e.awaiting = false;
    e.order = this.nextOrder++;
    e.type = req.type;
    e.gx = req.gx;
    e.gy = req.gy;
    e.rot = req.rot;
    e.price = price;
    e.minX = box.minX;
    e.minY = box.minY;
    e.maxX = box.maxX;
    e.maxY = box.maxY;
    e.afterId = afterId;
    e.sentMs = 0;
    e.refusedMs = Number.NaN;
    this.count++;
    this.money += price;
    this.version++;
    return true;
  }

  /** Sends the oldest queued box if `chainSendGapMs` has passed since the last send (at most one per call). */
  pump(nowMs: number, send: (req: PlaceRequest) => void): boolean {
    if (nowMs - this.lastSendMs < this.gapMs) return false;
    let head: PendingEntry | null = null;
    for (const e of this.entries) if (e.live && e.counted && !e.sent && (!head || e.order < head.order)) head = e;
    if (!head) return false;
    head.sent = true;
    head.awaiting = true;
    head.sentMs = nowMs;
    this.lastSendMs = nowMs;
    const r = this.req;
    r.type = head.type;
    r.gx = head.gx;
    r.gy = head.gy;
    r.rot = head.rot;
    send(r);
    return true;
  }

  /**
   * Once per frame: the phase/wave clear (AC 9), boxes that became buildings (AC 7), timeouts, and the
   * end of refusal looks and ghosts. Returns how many boxes started their refusal look by timing out now.
   */
  update(world: Readonly<World>, ownerId: string, nowMs: number): number {
    if (this.phase !== "" && (world.run.phase !== this.phase || world.waves.number !== this.wave)) this.clear();
    this.matchBuildings(world, ownerId);
    let timedOut = 0;
    for (const e of this.entries) {
      if (!e.live) continue;
      if (e.counted && e.sent && nowMs - e.sentMs >= this.timeoutMs) {
        this.startRefusal(e, nowMs); // stays awaiting: a ghost for its late answer (D6)
        timedOut++;
        continue;
      }
      const animDone = Number.isNaN(e.refusedMs) || nowMs - e.refusedMs >= REFUSE_ANIM_MS;
      if (!e.counted && animDone && (!e.awaiting || nowMs - e.sentMs >= GHOST_KEEP_MS)) this.free(e);
    }
    return timedOut;
  }

  /**
   * A refusal (in the server's order): the oldest awaiting box takes it. "shown": it was counted
   * (shake, fade, money back: toast the reason); "ghost": it had timed out already (no second
   * toast, D7); "none": no box was waiting (a phase change cleared it: toast as before).
   */
  refuse(_reason: PlaceError, nowMs: number): RefuseResult {
    let head: PendingEntry | null = null;
    for (const e of this.entries) if (e.live && e.awaiting && (!head || e.order < head.order)) head = e;
    if (!head) return "none";
    head.awaiting = false;
    if (!head.counted) {
      this.version++;
      return "ghost";
    }
    this.startRefusal(head, nowMs);
    return "shown";
  }

  /** A counted box overlaps `box` (m; touching edges don't overlap, as the shared footprint test). */
  overlaps(box: Readonly<Box>): boolean {
    for (const e of this.entries) {
      if (e.live && e.counted && box.minX < e.maxX && box.maxX > e.minX && box.minY < e.maxY && box.maxY > e.minY) return true;
    }
    return false;
  }

  /** My buildings in the World that are a box's spot (type, gx, gy, rot), newer than the box and than the last match. */
  private matchBuildings(world: Readonly<World>, ownerId: string): void {
    const list = world.buildings.list;
    for (;;) {
      // Oldest awaiting box first: my accepted buildings get increasing ids in my send order.
      let best: PendingEntry | null = null;
      let bestId = 0;
      for (const e of this.entries) {
        if (!e.live || !e.awaiting || (best && e.order > best.order)) continue;
        const min = Math.max(e.afterId, this.lastMatchedId);
        for (let i = list.length - 1; i >= 0; i--) {
          const b = list[i] as Building;
          if (b.id <= min) break;
          if (b.ownerId === ownerId && b.type === e.type && b.gx === e.gx && b.gy === e.gy && b.rot === e.rot) {
            // the oldest matching id for this box (the list is sorted: keep walking down)
            best = e;
            bestId = b.id;
          }
        }
      }
      if (!best) return;
      this.lastMatchedId = bestId;
      this.free(best);
    }
  }

  private startRefusal(e: PendingEntry, nowMs: number): void {
    this.uncount(e);
    e.refusedMs = nowMs;
    this.version++;
  }

  private uncount(e: PendingEntry): void {
    if (!e.counted) return;
    e.counted = false;
    this.count--;
    this.money -= e.price;
  }

  private free(e: PendingEntry): void {
    this.uncount(e);
    e.live = false;
    e.awaiting = false;
    e.sent = false;
    e.refusedMs = Number.NaN;
    this.version++;
  }

  private freeSlot(): PendingEntry | null {
    for (const e of this.entries) if (!e.live) return e;
    return null;
  }

  private oldestUncounted(): PendingEntry | null {
    let o: PendingEntry | null = null;
    for (const e of this.entries) if (e.live && !e.counted && (!o || e.order < o.order)) o = e;
    return o;
  }
}
