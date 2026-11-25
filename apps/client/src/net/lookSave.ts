/**
 * Story 7.10 (AC 8, 9, 11; E4; decision 7.10 D4): what the editor's Done does with my look, and the one retry at the
 * next start.
 *
 * - Done → `POST /api/account/look`. Stored → the server's canonical code becomes the device copy and the hub's
 *   progress (the editor shows what was stored). Too many saves (429) → nothing kept, the editor says so and stays.
 *   Any other failure (offline, timeout, 5xx, no account yet) → the look is kept on this phone as PENDING and used from
 *   the next join (the server checks it there, 7.9); the editor says "Saved on this phone. It will sync next time."
 * - Next start (`syncPendingLook`, once): a pending look is sent if the server still has the look it was edited from;
 *   if another phone saved since, the server's newer look wins and the pending one is dropped (never overwritten).
 */
import { DEFAULT_LOOK, encodeLook, type ProgressView } from "@topdown/shared";
import { accountSession, saveLookCall, type AccountDeps, type LookSaveCall } from "./account";
import { deviceLook, type DeviceLookStore } from "./deviceLook";
import { progressStore } from "./progressStore";

export const DEFAULT_LOOK_CODE = encodeLook(DEFAULT_LOOK);

export type DoneResult = { kind: "saved"; look: string | null } | { kind: "rateLimited" } | { kind: "offline" } | { kind: "refused" };

/**
 * Review L4: the failures worth keeping a look on the phone for and retrying later — no answer (0), no account yet
 * (401), a busy or down save server (408, 5xx). A deterministic refusal (400, 403, 413…) would fail again every start.
 */
export const retryable = (status: number): boolean => status === 0 || status === 401 || status === 408 || status >= 500;

export interface LookSaveDeps {
  call: (code: string, base?: string | null) => Promise<LookSaveCall>;
  session: (over?: Partial<AccountDeps>) => ReturnType<typeof accountSession>;
  looks: DeviceLookStore;
  /** The hub's copy of my progress: the stored look replaces its `look` (when it has one). */
  progress: { get(): { progress: ProgressView | null; source: string }; accept(p: ProgressView): void };
  now: () => number;
}

const defaults = (): LookSaveDeps => ({ call: (code, base) => saveLookCall(code, {}, base), session: accountSession, looks: deviceLook, progress: progressStore, now: Date.now });

function stored(look: string | null, deps: LookSaveDeps): void {
  deps.looks.markSynced(look);
  const snap = deps.progress.get();
  if (snap.progress && snap.source === "server") deps.progress.accept({ ...snap.progress, look });
}

/** Done: save `code` (the encoded draft). Never throws. */
export async function saveFromEditor(code: string, over: Partial<LookSaveDeps> = {}): Promise<DoneResult> {
  const deps = { ...defaults(), ...over };
  const r = await deps.call(code);
  if (r.kind === "saved") {
    stored(r.look, deps);
    return { kind: "saved", look: r.look };
  }
  if (r.status === 429) return { kind: "rateLimited" };
  if (!retryable(r.status)) return { kind: "refused" };
  deps.looks.savePending(code === DEFAULT_LOOK_CODE ? null : code, deps.now());
  return { kind: "offline" };
}

export type SyncResult = "none" | "synced" | "server_won" | "offline";

/** The next start (AC 9): sends a pending look once, if the server still has the look it was edited from. */
export async function syncPendingLook(over: Partial<LookSaveDeps> = {}): Promise<SyncResult> {
  const deps = { ...defaults(), ...over };
  const p = deps.looks.pending();
  if (p === null) return "none";
  const s = await deps.session();
  if (!s?.saved || !s.progress) return "offline"; // no session, or its progress read failed: try at the next start
  const serverLook = s.progress.look ?? null;
  if (serverLook !== p.base) {
    deps.looks.markSynced(serverLook); // another phone saved since: its newer look wins
    return "server_won";
  }
  // Review L2: the server re-checks the base inside its save transaction (another phone may save in between).
  const r = await deps.call(p.code ?? DEFAULT_LOOK_CODE, p.base);
  if (r.kind !== "saved") {
    if (!retryable(r.status) && r.status !== 429) deps.looks.markSynced(serverLook); // review L4: it can never be stored
    return "offline";
  }
  stored(r.look, deps);
  return r.stale ? "server_won" : "synced";
}

let startSync: Promise<SyncResult> | null = null;

/** AC 9: the start screen's one retry per page load (later mounts get the same answer). */
export function syncPendingLookOnce(over: Partial<LookSaveDeps> = {}): Promise<SyncResult> {
  startSync ??= syncPendingLook(over);
  return startSync;
}

/** Tests: allow another start-up retry. */
export function forgetStartSync(): void {
  startSync = null;
}
