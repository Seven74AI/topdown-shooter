/**
 * Story 7.9 (AC 5, 13): this device's copy of my survivor look code (from the last `/api/account/session` answer).
 * Used when the server can't be reached (the join still carries my look) and for practice solo (D4). Storage may
 * be blocked (private mode): then there is no copy and the default look is drawn. Never sent anywhere but the join.
 *
 * Story 7.10 (AC 9, E4; decision 7.10 D4): an editor Done that the server did not store is kept here as PENDING,
 * with the server look it was edited from (`base`). It is used from the next join on, and `syncPendingLook` sends it
 * once when the game next starts. A server answer replaces a pending copy only when the server's look is no longer
 * that base (another phone saved since: the newer server look wins, beat the rule 3/4); otherwise the pending copy
 * stays until it is sent. Format: a synced copy is the plain code (7.9's format); a pending one is a small JSON object.
 */
import { LOOK_CODE_MAX } from "@topdown/shared";

export const DEVICE_LOOK_KEY = "topdown.look";

export interface LookStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Story 7.10: a Done the server has not stored yet. `code` null = the default look; `base` = the server look it replaces. */
export interface PendingLook {
  readonly code: string | null;
  readonly base: string | null;
  readonly savedAt: number;
}

export interface DeviceLookStore {
  /** The cached code (pending or synced), or undefined (none / the default look, blocked storage, not a plausible code). */
  get(): string | undefined;
  /**
   * The server's look (null = default). Synced copy: replaced (a code stored, null clears it). Pending copy: kept while
   * the server still has its `base`, else replaced by the server's look (the other phone's newer save wins).
   */
  set(look: string | null): void;
  /** Story 7.10: an unsynced Done, used from now on and sent at the next start. */
  savePending(code: string | null, nowMs?: number): void;
  /** Story 7.10: the pending Done, or null. */
  pending(): PendingLook | null;
  /** Story 7.10: the server stored this look (or its newer look won): a synced copy, any pending one dropped. */
  markSynced(look: string | null): void;
}

const plausible = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= LOOK_CODE_MAX;

type Entry = { kind: "synced"; code: string } | { kind: "pending"; p: PendingLook } | null;

function read(storage: () => LookStorage): Entry {
  try {
    const v = storage().getItem(DEVICE_LOOK_KEY);
    if (v === null || v.length === 0) return null;
    if (v.startsWith("{")) {
      if (v.length > 4 * LOOK_CODE_MAX) return null;
      const o = JSON.parse(v) as { code?: unknown; base?: unknown; savedAt?: unknown };
      const code = o.code === null ? null : plausible(o.code) ? o.code : undefined;
      const base = o.base === null ? null : plausible(o.base) ? o.base : undefined;
      if (code === undefined || base === undefined || typeof o.savedAt !== "number") return null;
      return { kind: "pending", p: { code, base, savedAt: o.savedAt } };
    }
    return plausible(v) ? { kind: "synced", code: v } : null;
  } catch {
    return null;
  }
}

export function deviceLookStore(storage: () => LookStorage): DeviceLookStore {
  const write = (look: string | null): void => {
    try {
      if (look === null) storage().removeItem(DEVICE_LOOK_KEY);
      else if (look.length <= LOOK_CODE_MAX) storage().setItem(DEVICE_LOOK_KEY, look);
    } catch {
      // storage blocked: no copy (the default look offline)
    }
  };
  return {
    get: () => {
      const e = read(storage);
      if (e === null) return undefined;
      if (e.kind === "synced") return e.code;
      return e.p.code ?? undefined;
    },
    set: (look) => {
      const e = read(storage);
      if (e?.kind === "pending" && e.p.base === look) return; // the server hasn't moved since the edit: the edit is newer
      write(look);
    },
    savePending: (code, nowMs = Date.now()) => {
      const e = read(storage);
      const base = e === null ? null : e.kind === "synced" ? e.code : e.p.base;
      try {
        storage().setItem(DEVICE_LOOK_KEY, JSON.stringify({ code, base, savedAt: nowMs }));
      } catch {
        // storage blocked: nothing kept (the editor still says the look is on this phone only for this page)
      }
    },
    markSynced: (look) => write(look),
    pending: () => {
      const e = read(storage);
      return e?.kind === "pending" ? e.p : null;
    },
  };
}

export const deviceLook: DeviceLookStore = deviceLookStore(() => globalThis.localStorage);
