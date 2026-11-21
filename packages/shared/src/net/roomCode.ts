/**
 * Room codes (Story 2.1): 4 letters a player can read aloud or type on a phone.
 * No I or O (they look like 1 and 0), and no digits at all.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;

const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** True for a well-formed (already normalized) room code. */
export function isRoomCode(s: string): boolean {
  return ROOM_CODE_RE.test(s);
}

/** What a player typed, as a code: trimmed and uppercased (may still fail `isRoomCode`). */
export function normalizeRoomCode(s: string): string {
  return s.trim().toUpperCase();
}
