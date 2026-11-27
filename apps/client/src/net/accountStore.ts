/**
 * Story 7.6 (AC 9): who this phone is, as the server last said: `username` null = a guest (shows "Save my progress ·
 * Log in"), else a full account ("Logged in as mo_42 · Log out"). `known` false until a session answer arrived (the
 * account line waits rather than guessing). Fed by every `/account/session`, login, reset and logout answer.
 *
 * Story 10.1 review L9: the last username is remembered on the phone (`LAST_USERNAME_KEY`). When a session answer says
 * "guest" for a phone that was logged in and did not log out or delete here itself, the account was deleted (or the
 * password reset logged this phone out) on another phone: `gone` is set and the start screen says so.
 *
 * Story 10.11 (AC 2, 5): `admin` = the server said this phone's account is an admin (the cheat panel in a production
 * build, `debug/adminGate.ts`). A missing field (an older server), a guest, an unsaved reply and a logout → false.
 */
export interface AccountSnapshot {
  readonly known: boolean;
  readonly username: string | null;
  /** Story 10.11: this phone's account is an admin (only ever true with a username). */
  readonly admin: boolean;
  /** Review L9: this phone's account went away elsewhere (deleted, or logged out by a reset); the phone is a guest now. */
  readonly gone?: boolean;
}

type Listener = (s: AccountSnapshot) => void;

export const LAST_USERNAME_KEY = "topdown.lastUsername";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class AccountStore {
  private snap: AccountSnapshot = { known: false, username: null, admin: false };
  private readonly listeners = new Set<Listener>();
  private expectingGuest = false;

  constructor(private readonly storage: () => Store | undefined = () => globalThis.localStorage) {}

  get(): AccountSnapshot {
    return this.snap;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Review L9: this phone itself is about to become a guest (log out, Delete my progress): no "gone" notice. */
  expectGuest(): void {
    this.expectingGuest = true;
  }

  /** The server named this phone's account (`username` null = guest; `admin` only counts with a username). */
  accept(username: string | null, admin: boolean | undefined = false): void {
    let last: string | null;
    try {
      last = this.storage()?.getItem(LAST_USERNAME_KEY) ?? null;
    } catch {
      last = null;
    }
    const gone = username === null && last !== null && !this.expectingGuest;
    this.expectingGuest = false;
    try {
      if (username !== null) this.storage()?.setItem(LAST_USERNAME_KEY, username);
      else this.storage()?.removeItem(LAST_USERNAME_KEY);
    } catch {
      // storage blocked: no notice next time
    }
    const isAdmin = username !== null && admin === true;
    this.snap = gone ? { known: true, username, admin: isAdmin, gone: true } : { known: true, username, admin: isAdmin };
    for (const l of this.listeners) l(this.snap);
  }

  /** Story 10.11 (AC 2): an unsaved session reply (save server down) can't vouch for the admin mark: drop it. */
  dropAdmin(): void {
    if (!this.snap.admin) return;
    this.snap = { ...this.snap, admin: false };
    for (const l of this.listeners) l(this.snap);
  }

  /** The player closed the notice. */
  dismissGone(): void {
    if (!this.snap.gone) return;
    this.snap = { known: this.snap.known, username: this.snap.username, admin: this.snap.admin };
    for (const l of this.listeners) l(this.snap);
  }
}

export const accountStore = new AccountStore();
