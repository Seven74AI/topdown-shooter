import {
  districtName,
  BYTES,
  C2S,
  CLOSE_REMOVED,
  CLOSE_RUN_SAVED,
  CLOSE_TAKEN_OVER,
  MAX_PLAYERS,
  RECONNECT,
  S2C,
  type RecoveryJoin,
  startBlocker,
  type RunJoined,
  type RunPhase,
  type RunStateView,
} from "@topdown/shared";
import type { RunConnection } from "./connection";
import { lostReason, type LostReason } from "./serverNotice";
import { RunInbox, type NetRoomLike } from "./session";
import { LinkMonitor, linkStore, type LinkRoom } from "./linkMonitor";
import { seatStore } from "./seatStore";
import { rewardsStore } from "./rewardsStore";

/**
 * Story 7.2 (D4, re-review 2 N-RR2-2): how long a Leave mid-run keeps the socket open for its `run.rewards`. A bank
 * is normally a few ms; 2.5 s covers a lock wait plus the budget (`db/boundedTx.ts`). A slower bank still completes on
 * the server; only the start screen's one-time line is missed.
 */
export const LEAVE_REWARDS_WAIT_MS = 2500;

/**
 * Stories 8.5 review M4: how long "Saving…" waits for `run.saved` / `run.save_failed` before it says "Couldn't save the
 * run" (the server's write is bounded at ≈ 2 s plus a lock wait; a lost answer must never strand the host).
 */
export const SAVE_QUIT_TIMEOUT_MS = 8000;

/** Consented leave (4000) and server shutdown (4001): never a drop. */
const CONSENTED = 4000;
const SERVER_SHUTDOWN = 4001;
const inRunPhase = (phase: RunPhase | undefined): boolean => phase === "build" || phase === "wave" || phase === "vote" || phase === "extract"; // Story 12.2
/** Story 8.1: how often the link monitor's watchdog is checked (ms). */
const LINK_TICK_MS = 250;

export interface LobbyPlayer {
  readonly playerId: string;
  readonly slot: number;
  readonly name: string;
  readonly ready: boolean;
  /** Story 7.9: the look code from the room state (the lobby card's survivor picture). */
  readonly look: string;
  /** Story 8.2 (J4): a late joiner watching the wave (not in the World yet). Absent = false. */
  readonly waiting?: boolean;
  /** Story 8.1/8.3: the seat is held (reconnecting). Absent = false. */
  readonly held?: boolean;
}

/** Plain data for the lobby screen (never schema instances in Preact state). */
export interface LobbySnapshot {
  readonly code: string;
  readonly phase: RunPhase;
  readonly hostSlot: number;
  readonly players: readonly LobbyPlayer[];
  /** This client's player id from `run.joined`; null until it arrives. */
  readonly localPlayerId: string | null;
  /** Story 7.7: the run's district (the host's pick) and the open districts' bitmask (bit i = list index). */
  readonly district: string;
  readonly districtsOpen: number;
  /** Story 7.7 R3: the last "back to Downtown" notice (its district's name; "" none) and a counter that changes with each. */
  readonly districtReset: string;
  readonly districtResetSeq: number;
  /** Story 8.3 (AC 11): the run's remembered seats (left, or a hold ran out): the host's Players list can remove them. */
  readonly left: readonly LeftSeat[];
  /** Story 8.6 (E8-R1): a resumed run's lobby: its saved wave ("Resuming · Downtown · wave 6"); 0 = a fresh run. */
  readonly resumeWave: number;
}

/** Story 8.3: a remembered seat from `state.leftSeats`. */
export interface LeftSeat {
  readonly playerId: string;
  readonly name: string;
}

/** Story 8.3: `state.leftSeats` (JSON `[[playerId, name], …]`, "" none) → the list; anything malformed → none. */
export function parseLeftSeats(json: string | undefined): readonly LeftSeat[] {
  if (!json) return [];
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    const out: LeftSeat[] = [];
    for (const e of raw) if (Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string" && /^p[0-3]$/.test(e[0])) out.push({ playerId: e[0], name: e[1] });
    return out;
  } catch {
    return [];
  }
}

const EMPTY: LobbySnapshot = { code: "", phase: "lobby", hostSlot: 0, players: [], localPlayerId: null, district: "downtown", districtsOpen: 1, districtReset: "", districtResetSeq: 0, left: [], resumeWave: 0 };

/** Copies the lobby part of the room state, players in slot order. */
export function snapshotLobby(code: string, state: RunStateView, localPlayerId: string | null = null): LobbySnapshot {
  const players: LobbyPlayer[] = [];
  state.players.forEach((p, playerId) => players.push({ playerId, slot: p.slot, name: p.name, ready: p.ready, look: p.look, waiting: p.waiting === true, held: (p.heldUntilTick ?? 0) > 0 }));
  players.sort((a, b) => a.slot - b.slot);
  return { code, phase: state.phase, hostSlot: state.hostSlot, players, localPlayerId, district: state.district ?? "downtown", districtsOpen: state.districtsOpen ?? 1, districtReset: "", districtResetSeq: 0, left: parseLeftSeats(state.leftSeats), resumeWave: state.resumeWave ?? 0 };
}

/** Text under the host's Start button (AC 4). */
export const START_HINT = {
  notReady: "Waiting for everyone to be Ready",
  tooFew: "Need at least 1 player",
} as const;
/** Story 7.9 review L6: the same reasons short enough for the Start button's second line (≥ 112 px at 11 px). */
export const START_HINT_SHORT = {
  notReady: "Waiting for Ready",
  tooFew: "Need 1 player",
} as const;

/** What the lobby screen shows, derived from a snapshot. */
export interface LobbyView {
  /** One entry per slot 0–3: the player there, or null for an open slot. */
  readonly rows: readonly (LobbyPlayer | null)[];
  readonly me: LobbyPlayer | null;
  readonly isHost: boolean;
  /** The host's Start button is enabled (same rule as the server, `startBlocker`). */
  readonly canStart: boolean;
  /** Why Start is disabled, for the host; null when it is enabled or for guests. */
  readonly startHint: string | null;
  /** Story 7.9 review L6: `startHint` short enough for the Start button (the full text stays its tooltip / label). */
  readonly startHintShort: string | null;
}

export function lobbyView(s: LobbySnapshot, allowSolo: boolean): LobbyView {
  const rows: (LobbyPlayer | null)[] = Array.from({ length: MAX_PLAYERS }, () => null);
  for (const p of s.players) if (p.slot >= 0 && p.slot < MAX_PLAYERS) rows[p.slot] = p;
  const me = s.players.find((p) => p.playerId === s.localPlayerId) ?? null;
  const isHost = me !== null && me.slot === s.hostSlot;
  const blocker = startBlocker(s.players, isHost, allowSolo);
  const startHint =
    !isHost || blocker === null ? null : blocker === "too_few" ? START_HINT.tooFew : START_HINT.notReady;
  const startHintShort = startHint === null ? null : blocker === "too_few" ? START_HINT_SHORT.tooFew : START_HINT_SHORT.notReady;
  return { rows, me, isHost, canStart: blocker === null, startHint, startHintShort };
}

/** Subscribes to lobby field changes of a room (`watchLobby` in connection.ts); returns the unsubscribe. */
export type LobbyWatcher = (room: RunConnection, onChange: () => void) => () => void;

export interface AttachOptions {
  watch: LobbyWatcher;
  /** The connection ended without the player leaving. */
  /** The connection ended without the player leaving: `server_restarting` (Story 2.2) or `connection_lost`. */
  onLost: (reason: LostReason, serverText?: string) => void;
  /** `phase` changed (e.g. `"wave"` when the host started). */
  onPhase: (phase: RunPhase) => void;
  /**
   * The room the fight reads through (Story 2.6): the dev throttle around `room` when `?lag` is on.
   * The RunInbox listens on it from the join, so pings and early event batches are delayed alike.
   * Lobby fields are always read from `room` itself.
   */
  fight?: NetRoomLike;
  /**
   * Story 8.1 (AC 6): a fresh join of this room by guest token (the takeover). Without it (tests,
   * fakes) a lost connection is reported through `onLost` at once, as before.
   */
  rejoin?: () => Promise<RecoveryJoin<RunConnection>>;
  /** Story 8.1: the seat came back on a NEW room object (takeover or remembered seat): follow it. */
  onRecovered?: (room: RunConnection) => void;
}

type Listener = (s: LobbySnapshot) => void;

/** Holds the current run room and a plain snapshot of its lobby; the lobby screen subscribes. */
class LobbyStore {
  private room: RunConnection | null = null;
  private joined: RunJoined | null = null;
  /** Fight messages of the current room, buffered from the join on (Story 2.4 review). */
  private runInbox: RunInbox | null = null;
  private fight: NetRoomLike | null = null;
  private snapshot: LobbySnapshot = EMPTY;
  /** Review M4: Save and quit's answer timeout. */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private unwatch: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();
  /** Story 8.1: the current room's link (watchdog, drop, takeover); null without `rejoin`. */
  private link: LinkMonitor<RunConnection> | null = null;
  private linkTimer: ReturnType<typeof setInterval> | null = null;

  /** Story 8.1: my name in the current room (the takeover join sends it again). */
  myName(): string | null {
    const id = this.joined?.playerId;
    return id ? (this.snapshot.players.find((p) => p.playerId === id)?.name ?? null) : null;
  }

  /** Story 8.1: the current room's link monitor (the overlay's counters; NetSimHost's send gate). */
  linkMonitor(): LinkMonitor<RunConnection> | null {
    return this.link;
  }

  get(): LobbySnapshot {
    return this.snapshot;
  }

  /** `run.joined` of the current room (Story 2.4's `NetSession` takes it from here). */
  joinedInfo(): RunJoined | null {
    return this.joined;
  }

  /** The current room's `RunInbox` (the `NetSession` takes it at the start). */
  inbox(): RunInbox | null {
    return this.runInbox;
  }

  /** The room the fight reads through (the room, or the dev throttle around it); the `NetSession` takes it. */
  fightRoom(): NetRoomLike | null {
    return this.fight;
  }

  /** The current room, if any. */
  current(): RunConnection | null {
    return this.room;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Follows a joined room. Call right after the join resolves, before `run.joined` can arrive. */
  attach(room: RunConnection, { watch, onLost, onPhase, fight, rejoin, onRecovered }: AttachOptions): void {
    this.detach();
    this.room = room;
    this.joined = null;
    this.fight = fight ?? room;
    this.runInbox = new RunInbox(this.fight);
    let phase: RunPhase = "lobby";
    let queued = false;
    const update = (): void => {
      queued = false;
      // The SDK decodes state by reflection: until the first full state arrives, `state` is empty.
      if (this.room !== room || !room.state?.players) return;
      this.set({ ...snapshotLobby(room.roomId, room.state, this.joined?.playerId ?? null), districtReset: resetName, districtResetSeq: resetSeq });
      // Story 8.1: a room joined mid-run (a recovered seat) reports its run phase only once `run.joined`
      // is here (the session needs my player id); the full state arrives just before it.
      if (room.state.phase !== phase && (this.joined !== null || !inRunPhase(room.state.phase))) {
        phase = room.state.phase;
        onPhase(phase);
      }
    };
    // Several callbacks fire per patch; snapshot once.
    const schedule = (): void => {
      if (queued) return;
      queued = true;
      queueMicrotask(update);
    };
    // Story 7.7 R3: "Back to Downtown: nobody here has District 2" (shown in the lobby's notice line).
    let resetName = "";
    let resetSeq = 0;
    room.onMessage(S2C.LOBBY_DISTRICT_RESET, (m: { from?: unknown }) => {
      if (this.room !== room) return;
      resetName = typeof m?.from === "string" ? districtName(m.from.slice(0, 32)) : "";
      resetSeq++;
      schedule();
    });
    room.onMessage(S2C.RUN_JOINED, (m: RunJoined) => {
      if (this.room !== room) return;
      this.joined = m;
      saveSeat();
      schedule();
    });
    // Story 8.1 (AC 6): the seat is kept in sessionStorage (room code + the SDK's token + my name) so a reload can take it back.
    const saveSeat = (): void => {
      const name = this.joined ? room.state?.players?.get(this.joined.playerId)?.name : undefined;
      const token = (room as { reconnectionToken?: string }).reconnectionToken;
      if (typeof token === "string" && token.length > 0) seatStore.save({ roomId: room.roomId, token, name: name ?? "" });
    };
    if (rejoin && isLinkRoom(room)) {
      const link = new LinkMonitor<RunConnection>(
        room,
        {
          now: () => performance.now(),
          schedule: (fn, ms) => {
            const t = setTimeout(fn, ms);
            return () => clearTimeout(t);
          },
          inRun: () => inRunPhase(room.state?.phase),
          rejoin,
          onRecovered: (r) => onRecovered?.(r),
          onGone: (removed) => {
            if (this.room !== room) return;
            this.detach();
            this.set(EMPTY);
            seatStore.clear();
            onLost(removed === true ? "removed" : "connection_lost"); // Story 8.3 review M3: a held seat the host removed
          },
          leaveForGood: (late) => void late.leave(true),
          onStatus: (status, sinceMs) => {
            if (this.room === room) linkStore.set(status, sinceMs);
            if (status === "ok") saveSeat(); // a reconnect gets a new token
          },
        },
      );
      this.link = link;
      linkStore.set("ok", performance.now());
      const heard = (): void => link.heard(performance.now());
      // AC 5: ANY message counts (patches, horde frames, events, pings; extra listeners, the inbox keeps its own).
      room.onStateChange(heard);
      room.onMessage(BYTES.HORDE_FRAME, heard);
      room.onMessage(S2C.NET_PINGED, heard);
      room.onMessage(S2C.SIM_EVENTS_FLUSHED, heard);
      this.linkTimer = setInterval(() => link.tick(performance.now()), LINK_TICK_MS);
    }
    // Story 2.2: a stop or redeploy announces itself before the room closes.
    let shuttingDown = false;
    let shutdownText: string | undefined;
    // Story 8.3 (H3): the host removed me; the server closes with 4022 right after. Terminal either way.
    let removed = false;
    room.onMessage(S2C.PLAYER_REMOVED, () => {
      removed = true;
    });
    // Story 8.5 (AC 9): the host saved and quit; every socket closes with 4023 right after. Terminal either way.
    let saved = false;
    room.onMessage(S2C.RUN_SAVED, () => {
      saved = true;
      saveQuitStore.set("saved");
    });
    room.onMessage(S2C.RUN_SAVE_FAILED, () => {
      if (this.room === room) saveQuitStore.set("failed"); // S8: the room plays on
    });
    room.onMessage(S2C.SERVER_SHUTDOWN_STARTED, (m: { message?: unknown }) => {
      shuttingDown = true;
      // The server says why ("Server restarting", or a room error): show its words.
      if (typeof m?.message === "string" && m.message.length > 0 && m.message.length <= 200) shutdownText = m.message;
    });
    this.unwatch = watch(room, schedule);
    schedule();
    room.onLeave((code) => {
      if (this.room !== room) return; // we left on purpose
      // Story 8.3 (AC 12): removed by the host: never a reconnect or a takeover (4022 is terminal, never like 4000).
      if (removed || code === CLOSE_REMOVED) {
        this.detach();
        this.set(EMPTY);
        seatStore.clear();
        return onLost("removed");
      }
      // Story 8.5 (AC 9): the run was saved (4023): never a reconnect, never a takeover (no hold on the server either).
      if (saved || code === CLOSE_RUN_SAVED) {
        this.detach();
        this.set(EMPTY);
        seatStore.clear();
        saveQuitStore.set("idle");
        return onLost("saved");
      }
      // Story 8.1 (brief 21): mid-run, an end that isn't a Leave or a shutdown is a drop the SDK
      // couldn't repair (it gave up, or the token was refused): take the seat over by guest token.
      const link = this.link;
      // Our own takeover is in flight: this 4021 is it closing the token-reconnected socket; its room is adopted next.
      if (link && code === CLOSE_TAKEN_OVER && link.recoveryInFlight) return;
      // Just adopted a LATE takeover of mine: two of my own takeovers crossed (the server kept the other): take it again (review L3).
      if (link && code === CLOSE_TAKEN_OVER && performance.now() - linkStore.lateAdoptedAtMs < RECONNECT.ownTakeoverMs) {
        link.sdkGaveUp();
        return;
      }
      if (link && inRunPhase(room.state?.phase) && !shuttingDown && code !== CONSENTED && code !== SERVER_SHUTDOWN && code !== CLOSE_TAKEN_OVER) {
        link.sdkGaveUp();
        return;
      }
      this.detach();
      this.set(EMPTY);
      if (code === CLOSE_TAKEN_OVER) return onLost("taken_over"); // the seat is open in another tab now (D5)
      seatStore.clear();
      onLost(lostReason(code, shuttingDown), shutdownText);
    });
  }

  /** Sets this player's Ready flag (lobby only; the server ignores it otherwise). */
  setReady(ready: boolean): void {
    this.room?.send(C2S.LOBBY_SET_READY, { ready });
  }

  /** Story 7.10 (D3): my new look, shown on my card for everyone before Start (the server ignores it outside the lobby). */
  setLook(look: string): void {
    if (this.get().phase === "lobby") this.room?.send(C2S.LOBBY_SET_LOOK, { look });
  }

  /** Story 7.7: the host picks the run's district (the server checks host, lobby and the open rule). */
  pickDistrict(id: string): void {
    this.room?.send(C2S.LOBBY_DISTRICT, { id });
  }

  /** Story 8.5 (AC 9, 10): the host's Save and quit (one request: the button shows "Saving…" until the answer). */
  saveQuit(): void {
    if (!this.room || saveQuitStore.get() === "saving") return;
    saveQuitStore.set("saving");
    this.room.send(C2S.RUN_SAVE_QUIT, {});
    // Review M4: no answer within SAVE_QUIT_TIMEOUT_MS → "Couldn't save the run" (the host can try again or Cancel).
    const room = this.room;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.room === room && saveQuitStore.get() === "saving") saveQuitStore.set("failed");
    }, SAVE_QUIT_TIMEOUT_MS);
  }

  /** Story 8.3 (H2): the host removes a player (the server checks host, phase and target; a refusal is only logged). */
  remove(playerId: string): void {
    this.room?.send(C2S.HOST_REMOVE, { playerId });
  }

  /** Results (Story 2.8): Back to lobby, for the whole room (the server takes it from any member). */
  returnToLobby(): void {
    this.room?.send(C2S.LOBBY_RETURN, {});
  }

  /** Host: asks the server to start the run (it checks the same rule as `lobbyView().canStart`). */
  start(): void {
    this.room?.send(C2S.RUN_START, {});
  }

  /**
   * Leaves the room for good (consented: no reconnection). With `only`, leaves only if that is
   * still the current room (Story 2.4 review, fixed in 2.11): a stale session's late leave never
   * leaves a room joined after it. Returns whether it left.
   */
  leave(only?: RunConnection): boolean {
    if (only !== undefined && this.room !== only) return false;
    const room = this.room;
    const linkDown = linkStore.get().status !== "ok"; // Story 7.2: a socket being reconnected can't carry run.leave
    this.link?.close(true); // Story 8.1: a takeover landing after this Leave is left too, never adopted
    this.detach();
    this.set(EMPTY);
    seatStore.clear(); // Story 8.1: a Leave is for good (consented): a reload must not take the seat back
    if (room && linkDown) void room.leave(true);
    else if (room) leaveAfterRewards(room);
    return room !== null;
  }

  private detach(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (saveQuitStore.get() !== "saved") saveQuitStore.set("idle");
    this.link?.close();
    this.link = null;
    if (this.linkTimer !== null) clearInterval(this.linkTimer);
    this.linkTimer = null;
    linkStore.set("ok", 0);
    this.unwatch?.();
    this.unwatch = null;
    this.room = null;
    this.joined = null;
    this.runInbox?.close();
    this.runInbox = null;
    this.fight = null;
  }

  private set(s: LobbySnapshot): void {
    this.snapshot = s;
    for (const l of this.listeners) l(s);
  }
}

export const lobbyStore = new LobbyStore();

/** Story 8.5: Save and quit's state on this phone: idle, waiting for the server, saved (4023 follows), failed (S8). */
export type SaveQuitState = "idle" | "saving" | "saved" | "failed";
class SaveQuitStore {
  private state: SaveQuitState = "idle";
  private readonly listeners = new Set<(s: SaveQuitState) => void>();
  get(): SaveQuitState {
    return this.state;
  }
  set(s: SaveQuitState): void {
    if (this.state === s) return;
    this.state = s;
    for (const l of this.listeners) l(s);
  }
  subscribe(l: (s: SaveQuitState) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
export const saveQuitStore = new SaveQuitStore();

/** Story 8.1: a room with the SDK's reconnection API (a fake room in tests has none). */
function isLinkRoom(room: unknown): room is LinkRoom {
  const r = room as Partial<LinkRoom> | null;
  return !!r && typeof r.onDrop === "function" && typeof r.onReconnect === "function" && typeof r.reconnection === "object" && r.reconnection !== null;
}

/**
 * Story 7.2 (S3, D4): a Leave mid-run first sends `run.leave` (the server banks this seat now, ending `quit`) and keeps
 * the socket open until `run.rewards` arrives (kept for the start screen's one-time line) or LEAVE_REWARDS_WAIT_MS
 * passes; then the consented leave as before. Outside a run (lobby, Results) it leaves at once. The screen has already
 * moved on: nothing waits for this.
 */
export function leaveAfterRewards(room: Pick<RunConnection, "leave" | "send" | "onMessage" | "state">, waitMs = LEAVE_REWARDS_WAIT_MS): void {
  if (!inRunPhase(room.state?.phase)) {
    void room.leave(true);
    return;
  }
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    off?.();
    void room.leave(true);
  };
  const timer = setTimeout(finish, waitMs);
  const off = room.onMessage(S2C.RUN_REWARDS, (m: unknown) => {
    rewardsStore.receive(m, true);
    finish();
  }) as (() => void) | undefined;
  try {
    room.send(C2S.RUN_LEAVE, {});
  } catch {
    finish();
  }
}
