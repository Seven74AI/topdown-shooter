/**
 * Story 7.1: the device's account (designer D9: no sign-up). `POST /api/account/session` with the `localStorage`
 * copy of the guest token; the server also reads its HttpOnly `tdg` cookie, picks the account (cookie first, 7.1 D3)
 * and answers with the token to keep (written back here, P2), a 10-minute session ticket for the join options and
 * the display name. Called on start-up (name prefill) and right before every Create / Join.
 *
 * Never throws: no network, a timeout (3 s), a non-200 or a malformed reply all give `null`, and the game joins
 * without a ticket (P3: unsaved play, never a refused join).
 */
import { ACCOUNT_SESSION_PATH, accountSessionResponseSchema, playerNameSchema, type AccountSessionResponse } from "@topdown/shared";
import { guestTokens, type GuestTokenStore } from "./guestToken";
import { serverUrl } from "./serverUrl";

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

/** The ticket for the next join, or undefined (save server down, over the new-guest limit, offline). */
export async function sessionTicket(over: Partial<AccountDeps> = {}): Promise<string | undefined> {
  const s = await accountSession(over);
  return s?.saved ? s.ticket : undefined;
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
