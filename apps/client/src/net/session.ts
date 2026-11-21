import type { RunJoined, RunStateView } from "@topdown/shared";

/**
 * The slice of the SDK `Room` the networked host uses (Story 2.4). NetSimHost depends on this,
 * never on the SDK class, so unit tests pass a fake and this module never loads the SDK.
 */
export interface NetRoomLike {
  /** Decoded room state; empty until the first full state arrives. */
  readonly state: RunStateView;
  send(type: string, message: unknown): void;
  /** Returns the unsubscribe. */
  onMessage<T>(type: string, cb: (message: T) => void): () => void;
  /** Fires after each decoded patch. */
  readonly onStateChange: {
    (cb: (state: RunStateView) => void): unknown;
    remove(cb: (state: RunStateView) => void): void;
  };
  leave(consented?: boolean): unknown;
}

/**
 * An online run seen from this device (Story 2.4): the room, and the player id and slot from
 * `run.joined` (taken from `lobbyStore.joinedInfo()`, which got it long before the start).
 * `leave` ends the run for this device (it goes through the lobby store, which owns the room).
 */
export class NetSession {
  readonly playerId: string;
  readonly slot: number;
  private left = false;

  constructor(
    readonly room: NetRoomLike,
    joined: RunJoined,
    private readonly onLeave: () => void,
  ) {
    this.playerId = joined.playerId;
    this.slot = joined.slot;
  }

  /** Leaves the room for good (consented). Safe to call twice. */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.onLeave();
  }
}
