/**
 * Story 7.6 (AC 9): who this phone is, as the server last said: `username` null = a guest (shows "Save my progress ·
 * Log in"), else a full account ("Logged in as mo_42 · Log out"). `known` false until a session answer arrived (the
 * account line waits rather than guessing). Fed by every `/account/session`, login, reset and logout answer.
 */
export interface AccountSnapshot {
  readonly known: boolean;
  readonly username: string | null;
}

type Listener = (s: AccountSnapshot) => void;

export class AccountStore {
  private snap: AccountSnapshot = { known: false, username: null };
  private readonly listeners = new Set<Listener>();

  get(): AccountSnapshot {
    return this.snap;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** The server named this phone's account (`username` null = guest). */
  accept(username: string | null): void {
    this.snap = { known: true, username };
    for (const l of this.listeners) l(this.snap);
  }
}

export const accountStore = new AccountStore();
