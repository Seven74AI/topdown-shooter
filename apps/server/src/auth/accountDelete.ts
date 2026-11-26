/**
 * Story 10.1 (AC 6, 8–10; retro E7-A8; decisions 10.1-B10…B14): the two new account calls.
 *
 * - `saveSettings`: the cookie names the account; the body is the changed settings fields, already schema-parsed by
 *   the route; stored as given (`progressRepo.saveSettings`). Per-IP limit in the route, per-account here.
 * - `deleteMyProgress`: Delete my progress. The cookie names the device's account; a full account also needs its
 *   password (a wrong one is counted per username like a wrong login, brief 19). Refused while ANY device of the
 *   account is in a room: every device hash is marked as switching (rooms refuse a marked token, 7.6 L2) and the rooms
 *   are re-checked after the mark, right before the one transaction (`accountsRepo.deleteAccount`). Logs
 *   `account_deleted` with the kind and counts only: no account id, username, IP, token or hash (B13).
 */
import { guestTokenSchema, type AccountErrorCode, type DeleteResponse, type StoredPlayerSettings } from "@topdown/shared";
import type { AccountsRepo } from "../db/accountsRepo";
import type { ProgressRepo } from "../db/progressRepo";
import { ipKey, type NameFailureLimiter, type SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";
import { beginSwitch, deviceInRoom, endSwitch } from "./devicesInRooms";
import { verifySecret } from "./passwords";

export interface SettingsDeps {
  accounts: AccountsRepo;
  progress: Pick<ProgressRepo, "saveSettings">;
  ipLimiter: SlidingWindowLimiter;
  accountLimiter: SlidingWindowLimiter;
  logGate: SlidingWindowLimiter;
}

export interface DeleteDeps {
  accounts: AccountsRepo;
  ipLimiter: SlidingWindowLimiter;
  /** Wrong passwords per lower-cased username (the login's limiter: one budget for guessing a password). */
  nameLimiter: NameFailureLimiter;
  logGate: SlidingWindowLimiter;
  /** Tests replace it: is this guest-token hash a member of a live room? */
  inRoom?: (tokenHash: string) => boolean;
}

export type Outcome<T> = { status: 200; body: T } | { status: 400 | 401 | 409 | 429 | 503; error: AccountErrorCode };

const fail = (status: 400 | 401 | 409 | 429 | 503, error: AccountErrorCode) => ({ status, error }) as const;
const tokenOf = (t: string | null | undefined): string | null => (guestTokenSchema.safeParse(t).success ? (t as string) : null);

function gateWarn(logGate: SlidingWindowLimiter, kind: string, ip: string, msg: string): void {
  if (logGate.allow(`${kind}:${ipKey(ip)}`)) log.warn({ ip }, msg);
}

/** The per-IP limit, first thing in the route (before the body is parsed or the database is touched). */
export function ipAllowed(ip: string, limiter: SlidingWindowLimiter, logGate: SlidingWindowLimiter, kind: "settings" | "delete"): boolean {
  if (limiter.allow(ip)) return true;
  gateWarn(logGate, kind, ip, `${kind}_rate_limited`);
  return false;
}

/** AC 6 (B10): store the account's settings. */
export async function saveSettings(
  input: { cookieToken: string | null | undefined; settings: StoredPlayerSettings; ip: string },
  deps: SettingsDeps,
): Promise<Outcome<{ ok: true; settings: StoredPlayerSettings }>> {
  const token = tokenOf(input.cookieToken);
  if (token === null) return fail(401, "no_account");
  try {
    const account = await deps.accounts.findByTokenHash(hashGuestToken(token));
    if (account === null) return fail(401, "no_account");
    if (!deps.accountLimiter.allow(account.id)) {
      gateWarn(deps.logGate, `settings_acct:${account.id}`, input.ip, "settings_rate_limited");
      return fail(429, "rate_limited");
    }
    const stored = await deps.progress.saveSettings(account.id, input.settings);
    log.info({ accountId: account.id, fields: Object.keys(stored).length }, "settings_saved");
    return { status: 200, body: { ok: true, settings: stored } };
  } catch {
    return fail(503, "save_unavailable"); // logged as db_error by the repository
  }
}

/** AC 7–10 (B11–B14): Delete my progress. */
export async function deleteMyProgress(input: { cookieToken: string | null | undefined; password: string | undefined; ip: string }, deps: DeleteDeps): Promise<Outcome<DeleteResponse>> {
  const token = tokenOf(input.cookieToken);
  if (token === null) return fail(401, "no_account");
  const tokenHash = hashGuestToken(token);
  const inRoom = deps.inRoom ?? deviceInRoom;
  try {
    const account = await deps.accounts.findByTokenHash(tokenHash);
    if (account === null) return fail(401, "no_account");
    let expectHash: string | null = null;
    if (account.username !== null) {
      const name = account.username.toLowerCase();
      if (deps.nameLimiter.blocked(name, input.ip)) {
        gateWarn(deps.logGate, "delete_name", input.ip, "delete_rate_limited");
        return fail(429, "rate_limited");
      }
      const creds = await deps.accounts.findByUsernameLower(name);
      const ok = await verifySecret(creds?.passwordHash ?? null, input.password ?? "");
      if (!ok || creds === null || creds.id !== account.id) {
        deps.nameLimiter.fail(name, input.ip);
        log.warn({ ip: input.ip }, "delete_wrong_password");
        return fail(401, "wrong_password");
      }
      expectHash = creds.passwordHash;
    }
    const hashes = new Set([tokenHash, ...(await deps.accounts.deviceHashes(account.id))]);
    if ([...hashes].some(inRoom)) return fail(409, "in_room");
    for (const h of hashes) beginSwitch(h);
    try {
      // Re-checked after the marks (7.6 L2): no seat can attach to any of these tokens from here on.
      if ([...hashes].some(inRoom)) return fail(409, "in_room");
      const r = await deps.accounts.deleteAccount(tokenHash, account.id, expectHash);
      if (r.outcome === "gone") return fail(401, "no_account");
      if (r.outcome === "stale_credentials") return fail(401, "wrong_password");
      log.info({ kind: r.kind, guests: r.guests, savedRunsDeleted: r.savedRunsDeleted, seatsRemoved: r.seatsRemoved }, "account_deleted");
      return { status: 200, body: { ok: true, kind: r.kind } };
    } finally {
      for (const h of hashes) endSwitch(h);
    }
  } catch {
    return fail(503, "save_unavailable");
  }
}
