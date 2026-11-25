/**
 * Story 7.1: the device's account (designer D9: no sign-up). `POST /api/account/session` with the `localStorage`
 * copy of the guest token; the server also reads its HttpOnly `__Host-tdg` cookie, picks the account (cookie first, 7.1 D3)
 * and answers with the token to keep (written back here, P2), a 10-minute session ticket for the join options and
 * the display name. Called on start-up (name prefill) and right before every Create / Join.
 *
 * Never throws: no network, a timeout (3 s), a non-200 or a malformed reply all give `null`, and the game joins
 * without a ticket (P3: unsaved play, never a refused join).
 */
import {
  ACCOUNT_ERRORS,
  ACCOUNT_LOGIN_PATH,
  ACCOUNT_LOGOUT_PATH,
  ACCOUNT_RECOVER_PATH,
  ACCOUNT_UPGRADE_PATH,
  deviceSessionResponseSchema,
  recoverResponseSchema,
  upgradeResponseSchema,
  type AccountErrorCode,
  type DeviceSessionResponse,
  type RecoverResponse,
  type UpgradeResponse,
  ACCOUNT_LOOK_PATH,
  ACCOUNT_SESSION_PATH,
  ACCOUNT_TRAINING_PATH,
  ACCOUNT_UNLOCK_PATH,
  accountSessionResponseSchema,
  lookSaveResponseSchema,
  playerNameSchema,
  trainResponseSchema,
  unlockResponseSchema,
  type AccountSessionResponse,
  type TrainResponse,
  type TrainingBoostId,
  type UnlockResponse,
} from "@topdown/shared";
import { guestTokens, type GuestTokenStore } from "./guestToken";
import { deviceLook, type DeviceLookStore } from "./deviceLook";
import { serverUrl } from "./serverUrl";
import { UNLOCK_TIMEOUT_MS } from "./unlockTiming";
import { accountStore } from "./accountStore";
import { progressStore } from "./progressStore";

export const ACCOUNT_TIMEOUT_MS = 3000;

export interface AccountDeps {
  fetch: typeof fetch;
  url: () => string;
  tokens: GuestTokenStore;
  timeoutMs: number;
}

const defaults = (): AccountDeps => ({
  fetch: (...args) => globalThis.fetch(...args),
  url: () => `${serverUrl()}${ACCOUNT_SESSION_PATH}`,
  tokens: guestTokens,
  timeoutMs: ACCOUNT_TIMEOUT_MS,
});

export async function accountSession(over: Partial<AccountDeps> = {}): Promise<AccountSessionResponse | null> {
  const deps = { ...defaults(), ...over };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetch(deps.url(), {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceToken: deps.tokens.get() }),
      signal: abort.signal,
    });
    if (!res.ok) return null;
    const parsed = accountSessionResponseSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    // P2: both copies end up naming the same account (the cookie is renewed by the server).
    deps.tokens.set(parsed.data.deviceToken);
    if (parsed.data.saved) {
      accountStore.accept(parsed.data.account.username); // Story 7.6: the account line
      if (parsed.data.progress) progressStore.accept(parsed.data.progress); // review L7: the Log in merge warning knows the guest's progress
    }
    return parsed.data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Re-review N-R3 (decision 7.1 B12): a ticket fetched less than this long ago is reused by seat recovery (tickets
 * live 10 min on the server, `SESSION_TICKET_TTL_MS`; this keeps > 60 s of margin).
 */
export const TICKET_REUSE_MS = 9 * 60_000;

let last: { ticket: string; atMs: number } | null = null;

/** The ticket for the next join, or undefined (save server down, over the new-guest limit, offline). */
export async function sessionTicket(over: Partial<AccountDeps> = {}, nowMs: () => number = Date.now): Promise<string | undefined> {
  const s = await accountSession(over);
  last = s?.saved ? { ticket: s.ticket, atMs: nowMs() } : null;
  return last?.ticket;
}

/**
 * Seat recovery (8.1 `SeatRecovery` retries every few seconds): reuses the last ticket while it has more than 60 s
 * left, so two recovering phones on one Wi-Fi stay far below the 30 calls/min/IP limit; else fetches a fresh one.
 */
export async function recoveryTicket(over: Partial<AccountDeps> = {}, nowMs: () => number = Date.now): Promise<string | undefined> {
  if (last !== null && nowMs() - last.atMs < TICKET_REUSE_MS) return last.ticket;
  return sessionTicket(over, nowMs);
}

/** Tests only: forget the cached ticket. */
export function forgetTicket(): void {
  last = null;
}

/**
 * Story 7.9 (AC 5): what a join carries from the account: the ticket (as `sessionTicket`) and my look — the
 * server's copy first (and kept on this device), then the device copy, then none (the default look). Story 7.10: a
 * pending editor Done (not stored by the server yet, edited from the server's current look) wins over the server copy.
 */
export async function joinAccount(over: Partial<AccountDeps> = {}, looks: DeviceLookStore = deviceLook): Promise<{ ticket?: string; look?: string }> {
  const s = await accountSession(over);
  last = s?.saved ? { ticket: s.ticket, atMs: Date.now() } : null; // seat recovery may reuse it (N-R3)
  if (s?.saved && s.progress) looks.set(s.progress.look ?? null);
  const out: { ticket?: string; look?: string } = {};
  if (s?.saved) out.ticket = s.ticket;
  // Story 7.10 (AC 9): after the server's copy is applied, the device copy is the truth for the join (a pending Done the
  // server hasn't stored yet stays and joins; the server checks it there, 7.9).
  const look = looks.get();
  if (look !== undefined) out.look = look;
  return out;
}

/**
 * Story 7.9 + re-review N-R3: seat recovery's join — the reused ticket (`recoveryTicket`) and this device's look copy
 * (no extra session call per retry). Mid-run the server keeps the seat's own look anyway (a takeover ignores it).
 */
export async function recoveryAccount(over: Partial<AccountDeps> = {}, looks: DeviceLookStore = deviceLook): Promise<{ ticket?: string; look?: string }> {
  const out: { ticket?: string; look?: string } = {};
  const ticket = await recoveryTicket(over);
  if (ticket !== undefined) out.ticket = ticket;
  const look = looks.get();
  if (look !== undefined) out.look = look;
  return out;
}

/**
 * AC 7: the name field's prefill: the account's display name, only when the field is empty and the name is one the
 * lobby accepts. Otherwise the current text stays.
 */
export function prefillName(current: string, session: AccountSessionResponse | null): string {
  if (current.trim() !== "" || !session?.saved) return current;
  const name = playerNameSchema.safeParse(session.account.displayName);
  return name.success ? name.data : current;
}

/**
 * Story 7.3 (AC 5): what `POST /api/account/unlock` gave back: the server's answer (ok, already unlocked, not enough;
 * each with the server's progress), or `failed` (no network, timeout, 4xx/5xx, a malformed reply) with the status
 * (0 = no answer). Never throws. The cookie names the account (`credentials: "same-origin"`).
 */
export type UnlockCall = { kind: "answer"; body: UnlockResponse } | { kind: "failed"; status: number };

export { UNLOCK_TIMEOUT_MS };

export async function unlockItem(unlockId: string, requestId: string, over: Partial<AccountDeps> = {}): Promise<UnlockCall> {
  const deps = { ...defaults(), url: () => `${serverUrl()}${ACCOUNT_UNLOCK_PATH}`, timeoutMs: UNLOCK_TIMEOUT_MS, ...over };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetch(deps.url(), {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unlockId, requestId }),
      signal: abort.signal,
    });
    if (!res.ok) return { kind: "failed", status: res.status };
    const parsed = unlockResponseSchema.safeParse(await res.json());
    return parsed.success ? { kind: "answer", body: parsed.data } : { kind: "failed", status: res.status };
  } catch {
    return { kind: "failed", status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Story 7.5: what a Training call came back with (same shape as an unlock call). */
export type TrainCall = { kind: "answer"; body: TrainResponse } | { kind: "failed"; status: number };

/**
 * Story 7.5 (AC 3, 8): `POST /api/account/training` `{ boost, level, requestId }`; the cookie names the account. The
 * same timeout as an unlock (past the route's worst case); any failure → `failed` (the hub shows it, never a guess).
 */
export async function trainBoost(boost: TrainingBoostId, level: number, requestId: string, over: Partial<AccountDeps> = {}): Promise<TrainCall> {
  const deps = { ...defaults(), url: () => `${serverUrl()}${ACCOUNT_TRAINING_PATH}`, timeoutMs: UNLOCK_TIMEOUT_MS, ...over };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetch(deps.url(), {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ boost, level, requestId }),
      signal: abort.signal,
    });
    if (!res.ok) return { kind: "failed", status: res.status };
    const parsed = trainResponseSchema.safeParse(await res.json());
    return parsed.success ? { kind: "answer", body: parsed.data } : { kind: "failed", status: res.status };
  } catch {
    return { kind: "failed", status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Story 7.6 (AC 2, 4, 5, 7): the account actions. Each answers `ok` with the server's body, or `error` with the
 * player text to show (`ACCOUNT_ERRORS`; no network / timeout / a 5xx = "Can't reach the save server, try later").
 * Never throws. A login, reset or logout answer is a whole new session for this phone: the new device token replaces
 * the `localStorage` copy (the cookie was set by the server), the cached join ticket is dropped (it was bound to the
 * old token), and the account line and the progress show the server's answer.
 */
export type AccountCall<T> = { kind: "ok"; body: T } | { kind: "error"; code: AccountErrorCode; text: string };

/** Argon2 on the server + one transaction: a little longer than the session call. */
export const ACCOUNT_ACTION_TIMEOUT_MS = 8000;

const errorOf = (code: AccountErrorCode): { kind: "error"; code: AccountErrorCode; text: string } => ({ kind: "error", code, text: ACCOUNT_ERRORS[code] });

async function action<T>(path: string, body: unknown, parse: (raw: unknown) => T | null, over: Partial<AccountDeps>): Promise<AccountCall<T>> {
  const deps = { ...defaults(), url: () => `${serverUrl()}${path}`, timeoutMs: ACCOUNT_ACTION_TIMEOUT_MS, ...over };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetch(deps.url(), {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    let raw: unknown = null;
    try {
      raw = await res.json();
    } catch {
      raw = null;
    }
    if (!res.ok) {
      const msg = (raw as { message?: unknown } | null)?.message;
      return errorOf(typeof msg === "string" && msg in ACCOUNT_ERRORS && res.status < 500 ? (msg as AccountErrorCode) : "save_unavailable");
    }
    const parsed = parse(raw);
    return parsed === null ? errorOf("save_unavailable") : { kind: "ok", body: parsed };
  } catch {
    return errorOf("save_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

/** A new session for this phone (login / reset / logout): token, ticket cache, account line, progress. */
function adopt(s: DeviceSessionResponse, tokens: GuestTokenStore): void {
  tokens.set(s.deviceToken);
  forgetTicket();
  accountStore.accept(s.account.username);
  if (s.progress) {
    progressStore.accept(s.progress);
    // Story 7.9 + 7.10: this phone's look copy follows the account it now is; a look pending for the OLD account is dropped
    deviceLook.markSynced(s.progress.look ?? null);
  }
}

export async function upgradeAccount(username: string, password: string, over: Partial<AccountDeps> = {}): Promise<AccountCall<UpgradeResponse>> {
  const r = await action(ACCOUNT_UPGRADE_PATH, { username, password }, (raw) => upgradeResponseSchema.safeParse(raw).data ?? null, over);
  if (r.kind === "ok") accountStore.accept(r.body.username);
  return r;
}

export async function logInAccount(username: string, password: string, over: Partial<AccountDeps> = {}): Promise<AccountCall<DeviceSessionResponse>> {
  const r = await action(ACCOUNT_LOGIN_PATH, { username, password }, (raw) => deviceSessionResponseSchema.safeParse(raw).data ?? null, over);
  if (r.kind === "ok") adopt(r.body, over.tokens ?? guestTokens);
  return r;
}

export async function recoverAccount(username: string, code: string, newPassword: string, over: Partial<AccountDeps> = {}): Promise<AccountCall<RecoverResponse>> {
  const r = await action(ACCOUNT_RECOVER_PATH, { username, code, newPassword }, (raw) => recoverResponseSchema.safeParse(raw).data ?? null, over);
  if (r.kind === "ok") adopt(r.body, over.tokens ?? guestTokens);
  return r;
}

export async function logOutAccount(over: Partial<AccountDeps> = {}): Promise<AccountCall<DeviceSessionResponse>> {
  const r = await action(ACCOUNT_LOGOUT_PATH, {}, (raw) => deviceSessionResponseSchema.safeParse(raw).data ?? null, over);
  if (r.kind === "ok") adopt(r.body, over.tokens ?? guestTokens);
  return r;
}

/**
 * Story 7.10 (AC 8, 9, 11): what `POST /api/account/look` gave back: the code the server STORED (canonical; null = the
 * default look), or `failed` with the status (0 = no answer: offline, timeout; 429 = too many saves; 401 no account;
 * 5xx save server down). Never throws. The cookie names the account (`credentials: "same-origin"`).
 */
export type LookSaveCall = { kind: "saved"; look: string | null; stale?: boolean } | { kind: "failed"; status: number };

/** `base` (review L2): only the start-up retry sends it (the look it was edited from); the server then refuses to overwrite a newer look. */
export async function saveLookCall(code: string, over: Partial<AccountDeps> = {}, base?: string | null): Promise<LookSaveCall> {
  const deps = { ...defaults(), url: () => `${serverUrl()}${ACCOUNT_LOOK_PATH}`, ...over };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs);
  try {
    const res = await deps.fetch(deps.url(), {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(base === undefined ? { look: code } : { look: code, base }),
      signal: abort.signal,
    });
    if (!res.ok) return { kind: "failed", status: res.status };
    const parsed = lookSaveResponseSchema.safeParse(await res.json());
    return parsed.success ? { kind: "saved", look: parsed.data.look, ...(parsed.data.stale ? { stale: true } : {}) } : { kind: "failed", status: res.status };
  } catch {
    return { kind: "failed", status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
