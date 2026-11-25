/**
 * Story 7.1 AC 4 (designer D9, decision 7.1 D3): which account a device is. The `__Host-tdg` cookie is read first, then the
 * `localStorage` copy (`deviceToken`); the first that matches an account wins, and the response writes that token
 * back to both. If neither matches, the device keeps the valid token it presented (a phone keeps the identity it
 * has had since Story 2.3) or gets a new one, and a guest account + empty progress row are made (P1).
 *
 * The save server may be down (P3): any repository failure gives `saved: false` with no ticket; the device still has
 * a token and plays unsaved. New guests are limited per IP (decision 7.1 D6); resolving an existing one never is.
 * Never logs a token or a hash.
 */
import { catalogueParts, decodeLook, encodeLook, guestTokenSchema, type AccountSessionResponse, type ProgressView } from "@topdown/shared";
import type { AccountsRepo } from "../db/accountsRepo";
import type { ProgressRepo } from "../db/progressRepo";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";
import { ipKey, type SlidingWindowLimiter } from "../net/rateLimit";
import { DB_TIMEOUT_MS } from "../db/timeout";
import { signTicket } from "./ticket";
import { toView, trainingView } from "./unlock";

export interface GuestSessionDeps {
  accounts: AccountsRepo;
  /** Story 7.3 (AC 4) + 7.9: the session reply carries the account's progress (Supplies, unlocks, look); omitted (7.1 tests) → no `progress`. */
  progress?: Pick<ProgressRepo, "get">;
  newGuestLimiter: SlidingWindowLimiter;
  /** Review L4: every call per IP, checked before any database work. */
  sessionLimiter: SlidingWindowLimiter;
  /** Review L4: one rate-limit warning per IP and kind per window. */
  logGate: SlidingWindowLimiter;
  sessionSecret: string;
  now?: () => number;
  /** Review L3: the whole resolution (all lookups + the create) gets this long, so the server answers before the client's 3 s. */
  deadlineMs?: number;
}

export interface GuestSessionInput {
  cookieToken: string | null | undefined;
  deviceToken: string | null | undefined;
  ip: string;
}

/** A new 128-bit guest token (16 random bytes, lowercase hex: the Story 2.3 format, decision 7.1 D4b). */
export function mintGuestToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
}

const valid = (t: string | null | undefined): t is string => typeof t === "string" && guestTokenSchema.safeParse(t).success;

export type GuestSessionSource = "cookie" | "device" | "new" | "unsaved";

export async function resolveGuestSession(
  input: GuestSessionInput,
  deps: GuestSessionDeps,
): Promise<{ response: AccountSessionResponse; source: GuestSessionSource }> {
  const cookie = valid(input.cookieToken) ? input.cookieToken : null;
  const device = valid(input.deviceToken) ? input.deviceToken : null;
  // Kept if nothing matches (cookie first, D3), so an unsaved device still keeps one identity.
  const presented = cookie ?? device;
  // One token for every outcome of this call (a late create after the deadline names the token the device got).
  const fallback = presented ?? mintGuestToken();
  const now = deps.now ?? Date.now;
  const unsaved = (token: string): { response: AccountSessionResponse; source: GuestSessionSource } => ({
    response: { saved: false, deviceToken: token, ticket: null, account: null },
    source: "unsaved",
  });
  if (!deps.sessionLimiter.allow(input.ip)) {
    if (deps.logGate.allow(`session:${ipKey(input.ip)}`)) log.warn({ ip: input.ip }, "account_session_rate_limited");
    return unsaved(fallback);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => resolve("deadline"), deps.deadlineMs ?? DB_TIMEOUT_MS);
  });
  try {
    const work = lookUp();
    work.catch(() => undefined); // a failure after the deadline is already logged by the repository
    const result = await Promise.race([work, deadline]);
    if (result !== "deadline") return result;
    log.warn("account_session_deadline");
    return unsaved(fallback);
  } catch {
    // Already logged as db_error {op} by the repository; play goes on unsaved (P3).
    log.warn("account_session_unsaved");
    return unsaved(fallback);
  } finally {
    clearTimeout(timer);
  }

  async function lookUp(): Promise<{ response: AccountSessionResponse; source: GuestSessionSource }> {
    const candidates: [string, GuestSessionSource][] = [];
    if (cookie !== null) candidates.push([cookie, "cookie"]);
    if (device !== null && device !== cookie) candidates.push([device, "device"]);
    for (const [token, source] of candidates) {
      const account = await deps.accounts.findByTokenHash(hashGuestToken(token));
      if (account !== null) {
        log.info({ accountId: account.id, source }, "account_session");
        void deps.accounts.touchDevice(hashGuestToken(token)).catch(() => undefined); // review N2 (logged by the repo)
        return { response: { ...saved(token, account, deps.sessionSecret, now()), ...(await progressOf(account.id)) }, source };
      }
    }
    const token = fallback;
    if (!deps.newGuestLimiter.allow(input.ip)) {
      if (deps.logGate.allow(`guest:${ipKey(input.ip)}`)) log.warn({ ip: input.ip }, "new_guest_rate_limited");
      return unsaved(token);
    }
    const account = await deps.accounts.createGuest(hashGuestToken(token), "");
    log.info({ accountId: account.id, source: "new" }, "account_session");
    return { response: { ...saved(token, account, deps.sessionSecret, now()), ...(await progressOf(account.id)) }, source: "new" };
  }

  /**
   * Story 7.3 (AC 4, U5) + 7.9: the server's progress from ONE read inside this call's deadline: Supplies, bought
   * unlocks and the canonical look (a missing row = the empty one); a failed read → null, still saved.
   */
  async function progressOf(accountId: string): Promise<{ progress?: ProgressView | null }> {
    if (!deps.progress) return {};
    try {
      const row = await deps.progress.get(accountId);
      if (!row) return { progress: { supplies: 0, lifetimeSupplies: 0, unlocks: [], training: trainingView(null), look: null, districts: [], cosmetics: [] } }; // Story 7.5: + training; 7.7 / 7.11: + lists
      return { progress: { ...toView(row), look: canonicalLook(row.look) } };
    } catch {
      return { progress: null }; // logged as db_error by the repository
    }
  }
}

/** The client decodes against the whole catalogue; ownership is checked again at join (L2). */
const ANY_PART = catalogueParts();

/**
 * Story 7.9 (AC 1): adds the saved look (canonical, so the client's schema always accepts it). A failed progress
 * read keeps the session saved, with the default look (null): the look never costs the player their account.
 */
/** Story 7.9: the stored look, canonicalised (unknown parts dropped, the code re-encoded); null = the default look. */
export function canonicalLook(stored: string | null | undefined): string | null {
  return stored === null || stored === undefined ? null : encodeLook(decodeLook(stored, ANY_PART).look);
}

function saved(token: string, account: { id: string; displayName: string; username: string | null }, secret: string, nowMs: number): AccountSessionResponse {
  return {
    saved: true,
    deviceToken: token,
    ticket: signTicket(account.id, hashGuestToken(token), secret, nowMs),
    account: { displayName: account.displayName, username: account.username },
  };
}
