import { RECONNECT, SeatRecovery, Watchdog, configureReconnection, type RecoveryJoin, type ReconnectionLike } from "@topdown/shared";
import { clientLog } from "../debug/clientLog";

/** Story 8.1: what the phone's link to its seat is doing (the reconnecting overlay reads it). */
export type LinkStatus = "ok" | "reconnecting" | "seat_kept";

export interface LinkSnapshot {
  readonly status: LinkStatus;
  /** Client ms (performance.now) when the current status began. */
  readonly sinceMs: number;
}

type LinkListener = (s: LinkSnapshot) => void;

/** Story 8.1: the link status for the UI (one per page; the current room's monitor writes it). */
class LinkStore {
  private snap: LinkSnapshot = { status: "ok", sinceMs: 0 };
  /**
   * Review L3: when this tab last adopted a LATE takeover (an attempt that answered after a newer
   * one, or after the token reconnect): only then can a 4021 soon after be its own crossed takeovers.
   * A normal recovery never sets it, so a newly opened tab always wins (D5).
   */
  lateAdoptedAtMs = Number.NEGATIVE_INFINITY;
  private readonly listeners = new Set<LinkListener>();
  get(): LinkSnapshot {
    return this.snap;
  }
  set(status: LinkStatus, sinceMs: number): void {
    if (this.snap.status === status) return;
    clientLog.note("link", { status }); // Story 10.6
    this.snap = { status, sinceMs };
    for (const l of this.listeners) l(this.snap);
  }
  subscribe(l: LinkListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const linkStore = new LinkStore();

/** The slice of an SDK `Room` the monitor uses (a fake in tests). */
export interface LinkRoom {
  readonly reconnection: ReconnectionLike;
  onDrop(cb: (code: number, reason?: string) => void): unknown;
  onReconnect(cb: () => void): unknown;
  /** The socket (absent on fakes): closed non-consented by the watchdog so the SDK's reconnection starts. */
  readonly connection?: { close(code?: number, reason?: string): void };
}

export interface LinkDeps<R> {
  now(): number;
  schedule(fn: () => void, ms: number): () => void;
  /** A run phase (build / wave / vote): only then is a silent line a drop. */
  inRun(): boolean;
  /** A fresh join by guest token (the takeover, AC 6). */
  rejoin(): Promise<RecoveryJoin<R>>;
  /** The seat came back on a NEW room (a takeover or a remembered seat). */
  onRecovered(room: R): void;
  /** No seat to take back. */
  /** `removed`: the host removed my seat (Story 8.3 review M3). */
  onGone(removed?: boolean): void;
  /** A late takeover's room after the player pressed Leave: leave it, consented (the Leave stands). */
  leaveForGood(room: R): void;
  onStatus(status: LinkStatus, sinceMs: number): void;
}

/** SDK close code that makes the SDK reconnect (the browser's offline event uses it too). */
const MAY_TRY_RECONNECT = 4010;

/**
 * Story 8.1 (AC 4–6): one room's link. The SDK's own token reconnect is configured (F7: no offline
 * queue) and followed (`onDrop` / `onReconnect`); the no-data watchdog (3 s of no message of any
 * kind, AC 5) closes the socket itself because a browser may never report the close (WebKit
 * 247943); and if the token reconnect hasn't brought the seat back `takeoverAfterMs` after the
 * drop, or the SDK gave up, `SeatRecovery` takes the seat over with a fresh join by guest token.
 * `tick(now)` is called by the owner a few times a second.
 */
export class LinkMonitor<R> {
  private readonly watchdog = new Watchdog();
  private readonly recovery: SeatRecovery<R>;
  private status: LinkStatus = "ok";
  private sinceMs = 0;
  private closed = false;
  /** Drops seen (the overlay's "reconnects" counter). */
  drops = 0;
  /** Seat returns on the same room (SDK token reconnect). */
  reconnects = 0;

  /** The player pressed Leave (a late takeover is then left, not adopted). */
  private left = false;

  constructor(
    private readonly room: LinkRoom,
    private readonly deps: LinkDeps<R>,
  ) {
    configureReconnection(room.reconnection);
    room.onDrop(() => this.dropped(false));
    room.onReconnect(() => this.back());
    this.recovery = new SeatRecovery<R>(
      {
        join: () => this.deps.rejoin(),
        onRecovered: (r) => this.adopt(r, false),
        onSeatKept: () => this.set("seat_kept"),
        onGone: (removed) => {
          this.close();
          this.deps.onGone(removed);
        },
        now: () => this.deps.now(),
        schedule: (fn, ms) => this.deps.schedule(fn, ms),
      },
      // A takeover that landed after the token reconnect won (or after Leave): it holds the seat now (D5: newest wins).
      (late) => (this.left ? this.deps.leaveForGood(late) : this.adopt(late, true)),
    );
  }

  /** A takeover attempt is waiting for its answer (a 4021 on the current room is then our own takeover). */
  get recoveryInFlight(): boolean {
    return this.recovery.inFlight;
  }

  private adopt(r: R, late: boolean): void {
    if (late) linkStore.lateAdoptedAtMs = this.deps.now();
    this.set("ok");
    this.closed = true;
    this.recovery.cancel();
    this.watchdog.disarm();
    this.deps.onRecovered(r);
  }

  get current(): LinkStatus {
    return this.status;
  }

  /** Any message of any kind (state patch, event batch, horde frame, ping). */
  heard(nowMs: number): void {
    if (this.status === "ok") this.watchdog.heard(nowMs);
  }

  tick(nowMs: number): void {
    if (this.closed) return;
    if (this.status === "ok") {
      if (!this.deps.inRun()) {
        this.watchdog.disarm();
        return;
      }
      if (this.watchdog.fired(nowMs)) this.dropped(true);
      return;
    }
    if (this.status === "reconnecting" && !this.recovery.active && nowMs - this.sinceMs >= RECONNECT.takeoverAfterMs) this.recovery.start();
  }

  /** The SDK ended the room without a consented leave while in a run (it gave up, or was refused): take the seat over now. */
  sdkGaveUp(): void {
    if (this.closed) return;
    if (this.status === "ok") this.set("reconnecting");
    this.recovery.start();
  }

  /** The owner is done with this room (`left`: the player pressed Leave; else a newer room, the end of the page). */
  close(left = false): void {
    if (left) this.left = true;
    this.closed = true;
    this.recovery.cancel();
    this.watchdog.disarm();
  }

  private dropped(fromWatchdog: boolean): void {
    if (this.closed || this.status !== "ok") return;
    this.drops++;
    this.set("reconnecting");
    this.watchdog.disarm();
    if (fromWatchdog) {
      try {
        this.room.connection?.close(MAY_TRY_RECONNECT, "no data"); // non-consented: the server holds the seat
      } catch {
        // a socket that can't even close: the takeover path takes over
      }
    }
  }

  private back(): void {
    if (this.closed) return;
    this.recovery.cancel();
    this.reconnects++;
    this.set("ok");
    this.watchdog.heard(this.deps.now());
  }

  private set(status: LinkStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.sinceMs = this.deps.now();
    this.deps.onStatus(status, this.sinceMs);
  }
}
