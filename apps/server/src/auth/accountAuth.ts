/**
 * Story 7.6 (AC 2, 4, 5, 7, 8, 11; A1–A5; brief 15, 19): the account actions behind `/account/upgrade`, `/login`,
 * `/recover` and `/logout`. The device is named by the `__Host-tdg` cookie only (never an id in a body).
 *
 * - Upgrade (Save my progress): a GUEST gets a username, an Argon2id password hash and a one-time recovery code (hash
 *   stored, code shown once); same account row, same progress (A1). Allowed while in a room.
 * - Log in / Forgot password: ONE per-IP limiter (5 a minute, every attempt counted, right or wrong: A3) plus a
 *   per-username limiter (brief 19, B3); the same answer whether the name exists or not ("Wrong username or password"
 *   / "Wrong username or code"), and a missing name still pays one Argon2 verify (timing). Right → the device logs in
 *   (`deviceTokensRepo.logIn`: a guest's progress is merged, the device gets a fresh token, B1) and the answer is a
 *   whole new session (ticket bound to the new token, like 7.1's).
 * - Log out: a full account's device becomes a new empty guest; the account is untouched (D5).
 * Log in, reset and log out are refused while the device is in a room (AC 9). Logs never carry a password, a code,
 * a token or a hash.
 */
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_RE,
  guestTokenSchema,
  isCommonPassword,
  normaliseRecoveryCode,
  type AccountErrorCode,
  type DeviceSessionResponse,
  type RecoverResponse,
  type UpgradeResponse,
} from "@topdown/shared";
import type { AccountsRepo } from "../db/accountsRepo";
import type { DeviceTokensRepo, LogInResult } from "../db/deviceTokensRepo";
import { ipKey, type NameFailureLimiter, type SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";
import { deviceInRoom } from "./devicesInRooms";
import { mintGuestToken } from "./guestSession";
import { hashSecret, verifySecret } from "./passwords";
import { formatRecoveryCode, newRecoveryCode } from "./recoveryCode";
import { signTicket } from "./ticket";
import { toView } from "./unlock";

export interface AccountAuthDeps {
  accounts: AccountsRepo;
  devices: DeviceTokensRepo;
  /** AC 8: login + recover, per IP (shared, every attempt). */
  loginIpLimiter: SlidingWindowLimiter;
  /** Brief 19 (B3, review M1): wrong login / recover answers per lower-cased username; refuses only addresses that failed. */
  loginNameLimiter: NameFailureLimiter;
  /** Upgrade + logout, per IP (before any work) and per account. */
  actionIpLimiter: SlidingWindowLimiter;
  actionLimiter: SlidingWindowLimiter;
  logGate: SlidingWindowLimiter;
  sessionSecret: string;
  now?: () => number;
  /** AC 9 (tests replace it): is this guest-token hash a member of a live room? */
  inRoom?: (tokenHash: string) => boolean;
}

/** What a route answers: 200 + body (+ the device's new token for the cookie), or a status + error code. */
export type AuthOutcome<T> = { status: 200; body: T; deviceToken?: string } | { status: 400 | 401 | 403 | 409 | 429 | 503; error: AccountErrorCode };

const fail = (status: 400 | 401 | 409 | 429 | 503, error: AccountErrorCode) => ({ status, error }) as const;
const validToken = (t: string | null | undefined): string | null => (guestTokenSchema.safeParse(t).success ? (t as string) : null);
const validPassword = (p: string): boolean => p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX;

/** A refused call is logged once per IP and kind per minute (a flood can't push real lines out). */
function gateWarn(deps: AccountAuthDeps, kind: string, ip: string, obj: object, msg: string): void {
  if (deps.logGate.allow(`${kind}:${ipKey(ip)}`)) log.warn({ ip, ...obj }, msg);
}

/** Upgrade / logout: the per-IP limit, first thing in the route (before the body is parsed or anything is hashed). */
export function actionIpAllowed(ip: string, deps: Pick<AccountAuthDeps, "actionIpLimiter" | "logGate">): boolean {
  if (deps.actionIpLimiter.allow(ip)) return true;
  if (deps.logGate.allow(`account_action:${ipKey(ip)}`)) log.warn({ ip }, "account_action_rate_limited");
  return false;
}

/** Login / recover: the shared per-IP limit (AC 8), first thing in the route; every attempt counts. */
export function loginIpAllowed(ip: string, deps: Pick<AccountAuthDeps, "loginIpLimiter" | "logGate">): boolean {
  if (deps.loginIpLimiter.allow(ip)) return true;
  if (deps.logGate.allow(`login:${ipKey(ip)}`)) log.warn({ ip }, "login_rate_limited");
  return false;
}

/** AC 2 (A1): Save my progress. */
export async function upgradeAccount(
  input: { cookieToken: string | null | undefined; username: string; password: string; ip: string },
  deps: AccountAuthDeps,
): Promise<AuthOutcome<UpgradeResponse>> {
  const token = validToken(input.cookieToken);
  if (token === null) return fail(401, "no_account");
  let accountId: string;
  try {
    const account = await deps.accounts.findByTokenHash(hashGuestToken(token));
    if (account === null) return fail(401, "no_account");
    if (account.username !== null) return fail(409, "already_account");
    accountId = account.id;
  } catch {
    return fail(503, "save_unavailable");
  }
  if (!deps.actionLimiter.allow(accountId)) {
    gateWarn(deps, `upgrade:${accountId}`, input.ip, { accountId }, "account_action_rate_limited");
    return fail(429, "rate_limited");
  }
  if (!USERNAME_RE.test(input.username)) return fail(400, "bad_username");
  if (!validPassword(input.password)) return fail(400, "bad_password");
  if (isCommonPassword(input.password)) return fail(400, "common_password"); // review N1
  try {
    // Cheap check before hashing; the unique index decides a race. "That name is taken" reveals a name exists:
    // accepted (names are shown in lobbies anyway; story "Beat the rule" 1).
    if ((await deps.accounts.findByUsernameLower(input.username.toLowerCase())) !== null) return fail(409, "name_taken");
    const code = newRecoveryCode();
    const [passwordHash, recoveryCodeHash] = await Promise.all([hashSecret(input.password), hashSecret(code)]);
    const r = await deps.accounts.setCredentials(accountId, { username: input.username, passwordHash, recoveryCodeHash });
    if (r === "taken") return fail(409, "name_taken");
    if (r === "not_guest") return fail(409, "already_account");
    log.info({ accountId }, "account_upgraded");
    return { status: 200, body: { ok: true, username: input.username, recoveryCode: formatRecoveryCode(code) } };
  } catch {
    return fail(503, "save_unavailable"); // logged as db_error by the repository
  }
}

/** The answer of a successful login / reset: a whole new session for the device's fresh token. */
function sessionOf(r: Extract<LogInResult, { outcome: "ok" }>, token: string, deps: AccountAuthDeps): DeviceSessionResponse {
  return {
    saved: true,
    deviceToken: token,
    ticket: signTicket(r.account.id, hashGuestToken(token), deps.sessionSecret, (deps.now ?? Date.now)()),
    account: { displayName: r.account.displayName, username: r.account.username },
    progress: toView(r.progress),
  };
}

function logMerge(r: Extract<LogInResult, { outcome: "ok" }>): void {
  if (r.merged) log.info({ guestId: r.merged.guestId, accountId: r.account.id, refunded: r.merged.refunds.total, refunds: { unlocks: r.merged.refunds.unlocks, training: r.merged.refunds.training } }, "account_merged");
}

/** Shared by login and recover after the IP limit: the name limit and the room guard. */
function precheck(cookieToken: string | null | undefined, username: string, ip: string, kind: "login" | "recover", deps: AccountAuthDeps): { oldHash: string | null } | ReturnType<typeof fail> {
  if (deps.loginNameLimiter.blocked(username.toLowerCase(), ip)) {
    gateWarn(deps, `${kind}_name`, ip, {}, `${kind}_rate_limited`);
    return fail(429, "rate_limited");
  }
  const token = validToken(cookieToken);
  const oldHash = token === null ? null : hashGuestToken(token);
  if (oldHash !== null && (deps.inRoom ?? deviceInRoom)(oldHash)) return fail(409, "in_room");
  return { oldHash };
}

/** AC 4: log in (a device that is a guest with progress merges it, D11). */
export async function logIn(
  input: { cookieToken: string | null | undefined; username: string; password: string; ip: string },
  deps: AccountAuthDeps,
): Promise<AuthOutcome<DeviceSessionResponse>> {
  const pre = precheck(input.cookieToken, input.username, input.ip, "login", deps);
  if ("status" in pre) return pre;
  try {
    const creds = USERNAME_RE.test(input.username) ? await deps.accounts.findByUsernameLower(input.username.toLowerCase()) : null;
    const ok = await verifySecret(creds?.passwordHash ?? null, input.password); // a missing name still pays one verify
    if (!ok || creds === null) {
      deps.loginNameLimiter.fail(input.username.toLowerCase(), input.ip); // review M1: only wrong answers count
      log.warn({ ip: input.ip }, "login_failed");
      return fail(401, "wrong_login");
    }
    const token = mintGuestToken();
    const r = await deps.devices.logIn({ oldTokenHash: pre.oldHash, newTokenHash: hashGuestToken(token), accountId: creds.id, expectPasswordHash: creds.passwordHash ?? "" });
    if (r.outcome !== "ok") {
      log.warn({ ip: input.ip }, "login_failed"); // the password was reset meanwhile: the old one no longer works
      return fail(401, "wrong_login");
    }
    logMerge(r);
    log.info({ accountId: r.account.id, merged: r.merged !== null }, "login_ok");
    return { status: 200, body: sessionOf(r, token, deps), deviceToken: token };
  } catch {
    return fail(503, "save_unavailable");
  }
}

/** AC 5 (A4): username + recovery code + a new password: old code dead, a new one shown once, the device logged in. */
export async function recoverAccount(
  input: { cookieToken: string | null | undefined; username: string; code: string; newPassword: string; ip: string },
  deps: AccountAuthDeps,
): Promise<AuthOutcome<RecoverResponse>> {
  const pre = precheck(input.cookieToken, input.username, input.ip, "recover", deps);
  if ("status" in pre) return pre;
  if (!validPassword(input.newPassword)) return fail(400, "bad_password");
  if (isCommonPassword(input.newPassword)) return fail(400, "common_password"); // review N1
  try {
    const creds = USERNAME_RE.test(input.username) ? await deps.accounts.findByUsernameLower(input.username.toLowerCase()) : null;
    const ok = await verifySecret(creds?.recoveryCodeHash ?? null, normaliseRecoveryCode(input.code));
    if (!ok || creds === null || creds.recoveryCodeHash === null) {
      deps.loginNameLimiter.fail(input.username.toLowerCase(), input.ip); // review M1: only wrong answers count
      log.warn({ ip: input.ip }, "recover_failed");
      return fail(401, "wrong_code");
    }
    const code = newRecoveryCode();
    const [passwordHash, recoveryCodeHash] = await Promise.all([hashSecret(input.newPassword), hashSecret(code)]);
    const token = mintGuestToken();
    const r = await deps.devices.logIn({
      oldTokenHash: pre.oldHash,
      newTokenHash: hashGuestToken(token),
      accountId: creds.id,
      credentials: { expectRecoveryHash: creds.recoveryCodeHash, passwordHash, recoveryCodeHash },
    });
    if (r.outcome === "stale_credentials") {
      log.warn({ ip: input.ip }, "recover_failed"); // another reset with the same code won
      return fail(401, "wrong_code");
    }
    logMerge(r);
    log.info({ accountId: r.account.id, merged: r.merged !== null }, "recover_ok");
    return { status: 200, body: { ...sessionOf(r, token, deps), recoveryCode: formatRecoveryCode(code) }, deviceToken: token };
  } catch {
    return fail(503, "save_unavailable");
  }
}

/** AC 7 (A5, D5): the device becomes a new empty guest; the account is untouched. */
export async function logOut(input: { cookieToken: string | null | undefined; ip: string }, deps: AccountAuthDeps): Promise<AuthOutcome<DeviceSessionResponse>> {
  const token = validToken(input.cookieToken);
  if (token === null) return fail(401, "not_logged_in");
  const oldHash = hashGuestToken(token);
  if ((deps.inRoom ?? deviceInRoom)(oldHash)) return fail(409, "in_room");
  if (!deps.actionLimiter.allow(`device:${oldHash}`)) {
    gateWarn(deps, "logout", input.ip, {}, "account_action_rate_limited");
    return fail(429, "rate_limited");
  }
  try {
    const fresh = mintGuestToken();
    const r = await deps.devices.logOut(oldHash, hashGuestToken(fresh));
    if (r.outcome !== "ok") return fail(409, "not_logged_in");
    log.info({ accountId: r.previousAccountId, guestId: r.account.id }, "logout");
    const body: DeviceSessionResponse = {
      saved: true,
      deviceToken: fresh,
      ticket: signTicket(r.account.id, hashGuestToken(fresh), deps.sessionSecret, (deps.now ?? Date.now)()),
      account: { displayName: r.account.displayName, username: null },
      progress: { supplies: 0, lifetimeSupplies: 0, unlocks: [] },
    };
    return { status: 200, body, deviceToken: fresh };
  } catch {
    return fail(503, "save_unavailable");
  }
}
