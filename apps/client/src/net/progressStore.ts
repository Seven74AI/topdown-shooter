/**
 * Story 7.3 (AC 4, 8; U5): the account's progress as the hub shows it. Server truth only: `refresh()` asks
 * `/account/session` (7.1, which now also answers `progress`) and every unlock answer replaces it. The last server copy
 * is kept in `localStorage` (try/catch) so the hub still opens offline, marked offline with Unlock disabled; an edited
 * cache only changes this phone's picture (the server checks every purchase) and the next session call overwrites it.
 */
import { progressViewSchema, type ProgressView } from "@topdown/shared";
import { accountSession } from "./account";

export const PROGRESS_CACHE_KEY = "topdown.progress";

export interface ProgressSnapshot {
  /** The progress shown, or null (never seen one, nothing cached). */
  readonly progress: ProgressView | null;
  /** `server` = this page has the server's answer; `cache` = the last known copy (offline / save server down). */
  readonly source: "server" | "cache" | "none";
  /** A refresh is in flight. */
  readonly loading: boolean;
}

type Listener = (s: ProgressSnapshot) => void;

export interface ProgressStoreDeps {
  session: typeof accountSession;
  storage: () => Pick<Storage, "getItem" | "setItem"> | null;
}

const localStore = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export class ProgressStore {
  private snap: ProgressSnapshot = { progress: null, source: "none", loading: false };
  private readonly listeners = new Set<Listener>();
  private seq = 0;

  constructor(private readonly deps: ProgressStoreDeps = { session: accountSession, storage: localStore }) {}

  get(): ProgressSnapshot {
    return this.snap;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Asks the server; on any failure shows the cached copy (offline). Later calls win over earlier ones. */
  async refresh(): Promise<ProgressSnapshot> {
    const mine = ++this.seq;
    this.set({ ...this.snap, loading: true });
    const s = await this.deps.session();
    if (mine !== this.seq) return this.snap;
    if (s?.saved && s.progress) this.accept(s.progress);
    else this.set({ progress: this.snap.source === "server" ? this.snap.progress : this.readCache(), source: "cache", loading: false });
    return this.snap;
  }

  /** The server's answer (a session reply or an unlock answer): shown and cached. Cancels an older refresh. */
  accept(progress: ProgressView): void {
    this.seq++;
    this.set({ progress, source: "server", loading: false });
    try {
      this.deps.storage()?.setItem(PROGRESS_CACHE_KEY, JSON.stringify(progress));
    } catch {
      // storage blocked: no offline copy, nothing else changes
    }
  }

  /** The server can't be reached now (an unlock call failed): keep the numbers, mark them offline. */
  markOffline(): void {
    this.set({ ...this.snap, source: this.snap.progress ? "cache" : "none", loading: false });
  }

  private readCache(): ProgressView | null {
    try {
      const raw = this.deps.storage()?.getItem(PROGRESS_CACHE_KEY);
      if (!raw) return null;
      const parsed = progressViewSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private set(s: ProgressSnapshot): void {
    this.snap = s;
    for (const l of this.listeners) l(s);
  }
}

export const progressStore = new ProgressStore();
