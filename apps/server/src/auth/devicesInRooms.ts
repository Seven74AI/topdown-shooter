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

/**
 * Review L2: devices in the middle of an account switch (log in, reset, log out). The switch marks the old token before
 * it re-checks `deviceInRoom` and keeps the mark until its transaction settled; a room join of a marked token is
 * refused (`RunRoom.onAuth`, and again in `onJoin`, which is synchronous with the member being added). So either the
 * join added its member before the re-check (the switch answers 409 in_room) or the join sees the mark.
 */
const switching = new Map<string, number>();

export function beginSwitch(tokenHash: string): void {
  switching.set(tokenHash, (switching.get(tokenHash) ?? 0) + 1);
}

export function endSwitch(tokenHash: string): void {
  const n = (switching.get(tokenHash) ?? 0) - 1;
  if (n > 0) switching.set(tokenHash, n);
  else switching.delete(tokenHash);
}

export function isSwitching(tokenHash: string): boolean {
  return switching.has(tokenHash);
}
