import { createHash } from "node:crypto";
import { MAX_PLAYERS } from "@topdown/shared";

/**
 * Lobby rules (Story 2.3), pure so they are unit-tested without a room.
 * Slots are stable for the session; the lowest free one is reused.
 */

/** The server-only record of a player in a room. Never in schema; never logged whole. */
export interface Member {
  /** `"p" + slot`: the id in the World and in room state. */
  readonly playerId: string;
  readonly slot: number;
  /** Colyseus session id; changes on rejoin (Epic 8), so it is not the identity. */
  readonly sessionId: string;
  readonly name: string;
  /** Hex SHA-256 of the guest token (Story 8.1 matches a reconnecting player with it). */
  readonly guestTokenHash: string;
  /** When they joined; the longest-connected member becomes host. */
  /** Join sequence number within the room (lower = joined earlier). */
  readonly joinOrder: number;
}

/** The lowest free slot 0 to MAX_PLAYERS − 1, or -1 when all are taken. */
export function assignSlot(taken: Iterable<number>): number {
  const used = new Set(taken);
  for (let slot = 0; slot < MAX_PLAYERS; slot++) if (!used.has(slot)) return slot;
  return -1;
}

/**
 * The member who becomes host: the longest-connected one (lowest `joinOrder`; on a tie, the
 * first in iteration order, which is join order for a Map). `undefined` when there is no one.
 */
export function nextHost<M extends Pick<Member, "joinOrder">>(members: Iterable<M>): M | undefined {
  let best: M | undefined;
  for (const m of members) if (best === undefined || m.joinOrder < best.joinOrder) best = m;
  return best;
}

/** Hex SHA-256 of a guest token. The raw token is never stored or logged. */
export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
