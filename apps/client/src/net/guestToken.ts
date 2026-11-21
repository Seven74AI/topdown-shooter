/**
 * The guest token (Story 2.3): 16 random bytes as hex, made on a device's first online game and
 * kept in localStorage. It only tells players apart (the server keeps its SHA-256 in memory); it
 * is not a secret in Epic 2. Story 7.1 turns it into a session; Story 8.1 matches reconnects by it.
 */
export const GUEST_TOKEN_KEY = "topdown.guestToken";
const TOKEN_RE = /^[0-9a-f]{32}$/;

/** The parts of `Storage` used (injected in tests). */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A new token from `crypto.getRandomValues`. */
export function newGuestToken(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(16));
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Makes a token getter. A valid stored token is reused; otherwise a new one is stored. If storage
 * throws (private mode, blocked storage), the token lives in memory for this page only, so the
 * player gets a fresh identity on reload.
 */
export function guestTokenSource(storage: () => TokenStorage, random?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array): () => string {
  let memory: string | null = null;
  return () => {
    if (memory !== null) return memory;
    try {
      const stored = storage().getItem(GUEST_TOKEN_KEY);
      if (stored !== null && TOKEN_RE.test(stored)) return stored;
    } catch {
      // storage blocked: fall through to a new token
    }
    const token = newGuestToken(random);
    try {
      storage().setItem(GUEST_TOKEN_KEY, token);
      return token;
    } catch {
      memory = token; // not stored: keep it for this page
      return token;
    }
  };
}

/** This device's guest token. */
export const getGuestToken: () => string = guestTokenSource(() => localStorage);
