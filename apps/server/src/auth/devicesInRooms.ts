/**
 * Story 7.6 (AC 9): is a device in a room (lobby or run, a held seat included)? Logging in, a reset and logging out
 * change which account (and token) a device is, so they are refused while it is in one ("Leave the game first");
 * Save my progress is allowed (the account id doesn't change). Each `RunRoom` registers a reader of its members'
 * guest-token hashes at create and removes it at dispose. Pure memory, no database; one process.
 */
type Reader = () => Iterable<string>;

const readers = new Set<Reader>();

/** Registers a room's reader; returns the unregister function. */
export function registerRoomDevices(read: Reader): () => void {
  readers.add(read);
  return () => readers.delete(read);
}

/** True if any live room has a member (connected or on hold) with this guest-token hash. */
export function deviceInRoom(tokenHash: string): boolean {
  for (const read of readers) for (const h of read()) if (h === tokenHash) return true;
  return false;
}
