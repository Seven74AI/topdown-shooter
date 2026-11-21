import { S2C, type RunStateView } from "@topdown/shared";
import type { RunConnection } from "./connection";
import { lostReason, type LostReason } from "./serverNotice";

export interface LobbyPlayer {
  readonly playerId: string;
  readonly slot: number;
  readonly name: string;
}

/** Plain data for the lobby screen (never schema instances in Preact state). */
export interface LobbySnapshot {
  readonly code: string;
  readonly hostSlot: number;
  readonly players: readonly LobbyPlayer[];
}

const EMPTY: LobbySnapshot = { code: "", hostSlot: 0, players: [] };

/** Copies the lobby part of the room state, players in slot order. */
export function snapshotLobby(code: string, state: RunStateView): LobbySnapshot {
  const players: LobbyPlayer[] = [];
  state.players.forEach((p, playerId) => players.push({ playerId, slot: p.slot, name: p.name }));
  players.sort((a, b) => a.slot - b.slot);
  return { code, hostSlot: state.hostSlot, players };
}

type Listener = (s: LobbySnapshot) => void;

/** Holds the current run room and a plain snapshot of its lobby; the lobby screen subscribes. */
class LobbyStore {
  private room: RunConnection | null = null;
  private snapshot: LobbySnapshot = EMPTY;
  private readonly listeners = new Set<Listener>();

  get(): LobbySnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Follows a joined room. `onLost` runs when the connection ends without the player leaving,
   * with `server_restarting` on a stop or redeploy (Story 2.2) and `connection_lost` otherwise.
   */
  attach(room: RunConnection, onLost: (reason: LostReason) => void): void {
    this.room = room;
    let shuttingDown = false;
    const update = (state: RunStateView): void => {
      if (this.room === room) this.set(snapshotLobby(room.roomId, state));
    };
    room.onStateChange(update);
    // The SDK decodes state by reflection: until the first full state arrives, `state` is empty.
    if (room.state?.players) update(room.state);
    room.onMessage(S2C.SERVER_SHUTDOWN_STARTED, () => (shuttingDown = true));
    room.onLeave((code) => {
      if (this.room !== room) return; // we left on purpose
      this.room = null;
      this.set(EMPTY);
      onLost(lostReason(code, shuttingDown));
    });
  }

  /** Leaves the room for good (consented: no reconnection). */
  leave(): void {
    const room = this.room;
    this.room = null;
    this.set(EMPTY);
    void room?.leave(true);
  }

  private set(s: LobbySnapshot): void {
    this.snapshot = s;
    for (const l of this.listeners) l(s);
  }
}

export const lobbyStore = new LobbyStore();
