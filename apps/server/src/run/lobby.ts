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
  /** Story 7.1: the account behind this seat (a valid session ticket), or null (unsaved play). 7.2–7.7 read it. */
  readonly accountId: string | null;
  /**
   * Story 7.9: the seat's canonical look code (set at join; a takeover keeps it, the new connection's look is ignored).
   * Story 7.11: re-checked once in the lobby when the account's owned parts arrive (an owned milestone part stays).
   */
  look: string;
  /**
   * Story 8.1: the seat identity (`seatKey`): who this member IS across sockets. Every seat match
   * (already_joined, takeover, remembered seats) compares this key, never the hash directly.
   */
  readonly seatKey: string;
  /** When they joined; the longest-connected member becomes host. */
  /** Join sequence number within the room (lower = joined earlier). */
  readonly joinOrder: number;
  /** Round-trip time, EWMA of `net.pong` samples (Story 2.4); 0 until the first one. */
  rttMs: number;
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

/**
 * Story 8.1: THE seat identity — the one function every seat match uses (the lobby's
 * `already_joined`, the run's takeover of a held or still-open seat, the remembered seats after a
 * hold ran out). Story 7.1: `acct:<accountId>` when the join carried a valid session ticket, else a guest
 * seat `guest:<hash of the guest token>` (unsaved play). Seat matches go through `sameSeat` below.
 */
export function seatKey(auth: { readonly guestTokenHash: string; readonly accountId?: string | null }): string {
  return auth.accountId ? `acct:${auth.accountId}` : `guest:${auth.guestTokenHash}`;
}

/**
 * Story 7.1: is this joining player the seat's owner? The same identity key, or the same guest token: the token is
 * what resolves to the account (decision 7.1 D5, "a house key"), so a phone that rejoins without a ticket (the save
 * server went down meanwhile) or with one it lacked before still finds its own seat, and can never sit twice.
 */
export function sameSeat(
  seat: { readonly seatKey: string; readonly guestTokenHash: string },
  auth: { readonly guestTokenHash: string; readonly accountId?: string | null },
): boolean {
  return seat.seatKey === seatKey(auth) || seat.guestTokenHash === auth.guestTokenHash;
}
