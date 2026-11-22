import type { NetSession } from "./session";

/**
 * The online run the room is in right now (Story 2.8 review). Set by the online phase handler:
 * a fresh session at each `wave`, null at `lobby`. A Phaser scene start that was queued while the
 * tab was hidden (the loop sleeps) can run long after its run ended; the Game scene compares its
 * session with this one and moves on to the current run, or back to the lobby.
 */
let current: NetSession | null = null;

export const activeRun = {
  current(): NetSession | null {
    return current;
  },
  set(session: NetSession | null): void {
    current = session;
  },
};
