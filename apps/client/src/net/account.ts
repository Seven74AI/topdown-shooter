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
  ACCOUNT_SESSION_PATH,
  ACCOUNT_UNLOCK_PATH,
  accountSessionResponseSchema,
  playerNameSchema,
  unlockResponseSchema,
  type AccountSessionResponse,
  type UnlockResponse,
} from "@topdown/shared";
import { guestTokens, type GuestTokenStore } from "./guestToken";
import { serverUrl } from "./serverUrl";
import { UNLOCK_TIMEOUT_MS } from "./unlockTiming";

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
