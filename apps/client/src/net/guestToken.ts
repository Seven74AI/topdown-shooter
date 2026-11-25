/**
 * The guest token (Story 2.3): 16 random bytes as hex, made on a device's first online game and
 * kept in localStorage. It only tells players apart (the server keeps its SHA-256 in memory); it
 * is not a secret in Epic 2. Story 7.1: the server keeps a copy in the HttpOnly `__Host-tdg` cookie and finds the
 * account from either copy (`account.ts` writes the server's `deviceToken` back here); Story 8.1 matches reconnects by it.
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

/** Story 7.1: the device's token, read and written back (the server's `deviceToken` after `/account/session`). */
export interface GuestTokenStore {
  get(): string;
  /** Stores a valid token (ignored otherwise); in memory for this page when storage throws. */
  set(token: string): void;
}

/**
 * Makes the token store. A valid stored token is reused; otherwise a new one is stored. If storage
 * throws (private mode, blocked storage), the token lives in memory for this page only, so the
 * player gets a fresh identity on reload (Story 7.1: unless the HttpOnly cookie still names it).
 */
export function guestTokenStore(storage: () => TokenStorage, random?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array): GuestTokenStore {
  let memory: string | null = null;
  return {
    get: () => {
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
    },
    set: (token) => {
      if (!TOKEN_RE.test(token)) return;
      try {
        storage().setItem(GUEST_TOKEN_KEY, token);
        memory = null;
      } catch {
        memory = token;
      }
    },
  };
}

/** Makes a token getter (Story 2.3 API; `guestTokenStore(...).get`). */
export function guestTokenSource(storage: () => TokenStorage, random?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array): () => string {
  return guestTokenStore(storage, random).get;
}

/** This device's guest token store (Story 7.1 writes the server's copy back). */
export const guestTokens: GuestTokenStore = guestTokenStore(() => localStorage);

/** This device's guest token. */
export const getGuestToken: () => string = guestTokens.get;
