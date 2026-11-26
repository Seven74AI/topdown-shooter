/**
 * Story 10.1 review L5 (+ re-review L5-live, L5-bans): the ONE helper that scrubs a deleted player's seat from a saved
 * run's snapshot and list names. Used by the delete transaction (`accountsRepo.deleteAccount`) and by every save
 * (`savedRunsRepo` put: a live room still remembers a seat whose account was deleted meanwhile).
 */
/** Review L5: the neutral name a deleted player's seat keeps in a shared saved run. */
export const DELETED_SEAT_NAME = "Survivor";

/**
 * Review L5: a shared saved run's snapshot and list names with every seat of `mine` scrubbed: `accountId` null, a seat key
 * no join can produce (`deleted:<slot>`), the name `DELETED_SEAT_NAME`; a ban of such a seat loses its token hash too.
 * null when no seat was mine. Pure (tested without a database).
 */
export function scrubSeats(snapshot: Record<string, unknown>, names: readonly { name: string; slot: number }[], mine: ReadonlySet<string>): { snapshot: Record<string, unknown>; names: { name: string; slot: number }[] } | null {
  const seats = Array.isArray(snapshot.seats) ? (snapshot.seats as Record<string, unknown>[]) : [];
  const keys = new Set([...mine].map((id) => `acct:${id}`));
  const slots = new Set<number>();
  const oldKeys = new Set<string>();
  const oldHashes = new Set<string>();
  const nextSeats = seats.map((seat) => {
    const isMine = (typeof seat.accountId === "string" && mine.has(seat.accountId)) || (typeof seat.seatKey === "string" && keys.has(seat.seatKey));
    if (!isMine) return seat;
    slots.add(Number(seat.slot));
    if (typeof seat.seatKey === "string") {
      oldKeys.add(seat.seatKey);
      if (seat.seatKey.startsWith("guest:")) oldHashes.add(seat.seatKey.slice("guest:".length));
    }
    if (typeof seat.guestTokenHash === "string" && seat.guestTokenHash !== "") oldHashes.add(seat.guestTokenHash);
    return { ...seat, accountId: null, seatKey: `deleted:${String(seat.slot)}`, name: DELETED_SEAT_NAME };
  });
  if (slots.size === 0) return null;
  const bans = Array.isArray(snapshot.bannedSeats) ? (snapshot.bannedSeats as Record<string, unknown>[]) : [];
  // Re-review L5-bans: a ban of a scrubbed seat — by its account key, its original seat key, or the guest token hash in
  // a scrubbed `guest:<hash>` key — loses its token hash too.
  const nextBans = bans.map((b) => {
    const byKey = typeof b.seatKey === "string" && (keys.has(b.seatKey) || oldKeys.has(b.seatKey));
    const byHash = typeof b.guestTokenHash === "string" && b.guestTokenHash !== "" && oldHashes.has(b.guestTokenHash);
    return byKey || byHash ? { seatKey: "deleted", guestTokenHash: "" } : b;
  });
  return {
    snapshot: { ...snapshot, seats: nextSeats, bannedSeats: nextBans },
    names: names.map((n) => (slots.has(n.slot) ? { name: DELETED_SEAT_NAME, slot: n.slot } : { ...n })),
  };
}
