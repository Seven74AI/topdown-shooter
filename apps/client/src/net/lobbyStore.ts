import {
  C2S,
  MAX_PLAYERS,
  S2C,
  startBlocker,
  type RunJoined,
  type RunPhase,
  type RunStateView,
} from "@topdown/shared";
import type { RunConnection } from "./connection";
import { lostReason, type LostReason } from "./serverNotice";
import { RunInbox, type NetRoomLike } from "./session";

export interface LobbyPlayer {
  readonly playerId: string;
  readonly slot: number;
  readonly name: string;
  readonly ready: boolean;
}

/** Plain data for the lobby screen (never schema instances in Preact state). */
export interface LobbySnapshot {
  readonly code: string;
  readonly phase: RunPhase;
  readonly hostSlot: number;
  readonly players: readonly LobbyPlayer[];
  /** This client's player id from `run.joined`; null until it arrives. */
  readonly localPlayerId: string | null;
}

const EMPTY: LobbySnapshot = { code: "", phase: "lobby", hostSlot: 0, players: [], localPlayerId: null };

/** Copies the lobby part of the room state, players in slot order. */
export function snapshotLobby(code: string, state: RunStateView, localPlayerId: string | null = null): LobbySnapshot {
  const players: LobbyPlayer[] = [];
  state.players.forEach((p, playerId) => players.push({ playerId, slot: p.slot, name: p.name, ready: p.ready }));
  players.sort((a, b) => a.slot - b.slot);
  return { code, phase: state.phase, hostSlot: state.hostSlot, players, localPlayerId };
}

/** Text under the host's Start button (AC 4). */
export const START_HINT = {
  notReady: "Waiting for everyone to be Ready",
  tooFew: "Need at least 2 players",
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
}

export function lobbyView(s: LobbySnapshot, allowSolo: boolean): LobbyView {
  const rows: (LobbyPlayer | null)[] = Array.from({ length: MAX_PLAYERS }, () => null);
  for (const p of s.players) if (p.slot >= 0 && p.slot < MAX_PLAYERS) rows[p.slot] = p;
  const me = s.players.find((p) => p.playerId === s.localPlayerId) ?? null;
  const isHost = me !== null && me.slot === s.hostSlot;
  const blocker = startBlocker(s.players, isHost, allowSolo);
  const startHint =
    !isHost || blocker === null ? null : blocker === "too_few" ? START_HINT.tooFew : START_HINT.notReady;
  return { rows, me, isHost, canStart: blocker === null, startHint };
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
  private unwatch: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();

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
  attach(room: RunConnection, { watch, onLost, onPhase, fight }: AttachOptions): void {
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
      this.set(snapshotLobby(room.roomId, room.state, this.joined?.playerId ?? null));
      if (room.state.phase !== phase) {
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
    room.onMessage(S2C.RUN_JOINED, (m: RunJoined) => {
      if (this.room !== room) return;
      this.joined = m;
      schedule();
    });
    // Story 2.2: a stop or redeploy announces itself before the room closes.
    let shuttingDown = false;
    let shutdownText: string | undefined;
    room.onMessage(S2C.SERVER_SHUTDOWN_STARTED, (m: { message?: unknown }) => {
      shuttingDown = true;
      // The server says why ("Server restarting", or a room error): show its words.
      if (typeof m?.message === "string" && m.message.length > 0 && m.message.length <= 200) shutdownText = m.message;
    });
    this.unwatch = watch(room, schedule);
    schedule();
    room.onLeave((code) => {
      if (this.room !== room) return; // we left on purpose
      this.detach();
      this.set(EMPTY);
      onLost(lostReason(code, shuttingDown), shutdownText);
    });
  }

  /** Sets this player's Ready flag (lobby only; the server ignores it otherwise). */
  setReady(ready: boolean): void {
    this.room?.send(C2S.LOBBY_SET_READY, { ready });
  }

  /** Results (Story 2.8): Back to lobby, for the whole room (the server takes it from any member). */
  returnToLobby(): void {
    this.room?.send(C2S.LOBBY_RETURN, {});
  }

  /** Host: asks the server to start the run (it checks the same rule as `lobbyView().canStart`). */
  start(): void {
    this.room?.send(C2S.RUN_START, {});
  }

  /** Leaves the room for good (consented: no reconnection). */
  leave(): void {
    const room = this.room;
    this.detach();
    this.set(EMPTY);
    void room?.leave(true);
  }

  private detach(): void {
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
