import { GHOST_KEEPALIVE_MS, GHOST_MIN_INTERVAL_MS, GHOST_TIMEOUT_MS, MAX_PLAYERS } from "@topdown/shared";

/**
 * Story 5.24 (BX-10): teammates' ghosts on this device. Cosmetic only (ux-spec F7, D9): this store
 * lives outside the World; no placement check, pending box, Predictor or block reason reads it.
 */

/** One teammate's held building as last relayed (`typeIdx` −1 = none). */
export interface GhostEntry {
  typeIdx: number;
  gx: number;
  gy: number;
  rot: number;
  /** When it arrived (the store's clock, ms); `-Infinity` = never. */
  atMs: number;
}

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * The latest `building.ghosted` per slot (preallocated, one entry per slot; no allocation per
 * message). An entry is live while it holds a type and arrived at most `GHOST_TIMEOUT_MS` ago.
 */
export class TeammateGhosts {
  readonly entries: readonly GhostEntry[];

  constructor(private readonly now: () => number = () => performance.now()) {
    const e: GhostEntry[] = [];
    for (let i = 0; i < MAX_PLAYERS; i++) e.push({ typeIdx: -1, gx: 0, gy: 0, rot: 0, atMs: Number.NEGATIVE_INFINITY });
    this.entries = e;
  }

  /** A `building.ghosted` payload `[slot, typeIdx, gx, gy, rot]`; anything malformed is ignored. */
  receive(m: unknown): void {
    if (!Array.isArray(m) || m.length !== 5) return;
    const [slot, typeIdx, gx, gy, rot] = m as unknown[];
    if (!isInt(slot, 0, MAX_PLAYERS - 1) || !isInt(typeIdx, -1, 255) || !isInt(gx, 0, 255) || !isInt(gy, 0, 255) || !isInt(rot, 0, 3)) return;
    const e = this.entries[slot] as GhostEntry;
    e.typeIdx = typeIdx;
    e.gx = gx;
    e.gy = gy;
    e.rot = rot;
    e.atMs = this.now();
  }

  /** The entry of `slot` when live now, else null. */
  live(slot: number): Readonly<GhostEntry> | null {
    const e = this.entries[slot];
    if (!e || e.typeIdx < 0) return null;
    return this.now() - e.atMs <= GHOST_TIMEOUT_MS ? e : null;
  }

  /** That player left (`player.left`). */
  clearSlot(slot: number): void {
    const e = this.entries[slot];
    if (e) e.typeIdx = -1;
  }

  /** A phase other than build, the lobby, the end of the session. */
  clearAll(): void {
    for (const e of this.entries) e.typeIdx = -1;
  }
}

/**
 * Story 5.24 (AC 2, D2): when my client sends `building.ghost`. A change goes out at most every
 * `GHOST_MIN_INTERVAL_MS` (a change inside the gap goes when it ends, so the last spot arrives), an
 * unchanged held ghost every `GHOST_KEEPALIVE_MS`, and one `""` when my hand empties. Outside a
 * build phase nothing is sent (receivers hide every ghost then) and the sender forgets what it sent.
 */
export class GhostSender {
  /** The ghost to send after `step` returned true (reused). */
  readonly out = { type: "", gx: 0, gy: 0, rot: 0 };
  private lastMs = Number.NEGATIVE_INFINITY;
  /** Messages sent (tests, the online check). */
  sent = 0;

  /** `type` "" = my hand is empty (or the spot is off the wire). Returns true when `out` should be sent now. */
  step(nowMs: number, build: boolean, type: string, gx: number, gy: number, rot: number): boolean {
    const o = this.out;
    if (!build) {
      o.type = "";
      o.gx = o.gy = o.rot = 0;
      return false;
    }
    if (type === "") {
      gx = gy = rot = 0;
    }
    const changed = o.type !== type || o.gx !== gx || o.gy !== gy || o.rot !== rot;
    const since = nowMs - this.lastMs;
    if (since < GHOST_MIN_INTERVAL_MS) return false;
    if (!changed && (type === "" || since < GHOST_KEEPALIVE_MS)) return false;
    o.type = type;
    o.gx = gx;
    o.gy = gy;
    o.rot = rot;
    this.lastMs = nowMs;
    this.sent++;
    return true;
  }
}
