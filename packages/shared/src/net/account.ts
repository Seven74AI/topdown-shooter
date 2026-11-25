/**
 * Story 7.1: the account HTTP API shared by client and server. `POST /api/account/session` (the server sees
 * `/account/session`: Caddy and Vite strip `/api`). The guest token travels in the HttpOnly `__Host-tdg` cookie and, as
 * the `localStorage` copy, in `deviceToken` (designer D9: either one finds the account; the cookie wins, 7.1 D3).
 */
import { z } from "zod";
import { guestTokenSchema } from "./messages";
import { LOOK_CODE_MAX } from "../config/cosmetics";
import commonPasswords from "../config/commonPasswords.json" with { type: "json" };

export const ACCOUNT_SESSION_PATH = "/account/session";
/**
 * The cookie that holds the guest token (HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, 1 year). Review L5: the
 * `__Host-` prefix makes the browser refuse any copy set with a Domain (a sibling `*.sevend.io` page can't plant one).
 */
export const GUEST_COOKIE = "__Host-tdg";

export const accountSessionRequestSchema = z.object({ deviceToken: guestTokenSchema.optional() }).strict();
export type AccountSessionRequest = z.infer<typeof accountSessionRequestSchema>;

/** A session ticket in the join options: `base64url(accountId.expiresAtMs).base64url(HMAC-SHA256)`, ≤ 200 chars. */
export const sessionTicketSchema = z.string().min(1).max(200);

/**
 * Story 7.3 (AC 4, U5): the account's progress as the server has it. `unlocks` = BOUGHT unlock ids only (the starter
 * pool is `progression.json`); 7.9 adds `look`. Not strict: 7.5 adds `training`, 7.7 `districts`, and an older tab
 * keeps working.
 */
export const progressViewSchema = z.object({
  supplies: z.number().int().nonnegative(),
  lifetimeSupplies: z.number().int().nonnegative(),
  unlocks: z.array(z.string().max(32)).max(64),
  /** Story 7.9: the survivor look code (canonical; null = the default look). Optional: unlock answers don't carry it. */
  look: z.string().max(LOOK_CODE_MAX).nullable().optional(),
  /** Story 7.5 (AC 3): Training levels by boost id (`max_hp`, `damage`, `start_money`, `reload`; absent = 0). */
  training: z.record(z.string().max(32), z.number().int().min(0).max(10)).optional(),
  /** Story 7.7: the districts this account unlocked (the hub's "Districts" line). Optional: unlock answers carry it too. */
  districts: z.array(z.string().max(32)).max(8).optional(),
  /** Story 7.11 (T5): the owned milestone / loot part keys (7.10's editor tiles). */
  cosmetics: z.array(z.string().max(32)).max(64).optional(),
});
export type ProgressView = z.infer<typeof progressViewSchema>;

export const accountSessionResponseSchema = z.discriminatedUnion("saved", [
  z.object({
    saved: z.literal(true),
    deviceToken: guestTokenSchema,
    ticket: sessionTicketSchema,
    // Review F10: not strict either (7.6 adds account fields): an unknown field is dropped, never a rejected reply.
    account: z.object({ displayName: z.string().max(64), username: z.string().max(64).nullable() }),
    /**
     * Story 7.3 (AC 4) + 7.9: the account's progress (Supplies, bought unlocks, the canonical look code), from ONE
     * repository read. null when that read failed (the account is still found: the ticket is good; the client keeps
     * its device look copy); absent from a 7.1-only server. Not strict (decision 7.3 B1): later stories add fields
     * without making an open tab drop its ticket.
     */
    progress: progressViewSchema.nullable().optional(),
  }),
  // The save server is down or the device is over the new-guest limit: play goes on unsaved (P3).
  // Review F10: not strict (forward compatible like the saved branch).
  z.object({ saved: z.literal(false), deviceToken: guestTokenSchema, ticket: z.null(), account: z.null() }),
]);
export type AccountSessionResponse = z.infer<typeof accountSessionResponseSchema>;

/** Story 7.3 (AC 5): buy one unlock with Supplies. The server sees `/account/unlock` (the browser calls `/api/…`). */
export const ACCOUNT_UNLOCK_PATH = "/account/unlock";

/** A client UUID per tap: a retry with the same id gets the first answer and is never charged twice (U3). */
export const unlockRequestSchema = z
  .object({
    unlockId: z.string().regex(/^[a-z0-9_]{1,32}$/),
    requestId: z.string().uuid(),
  })
  .strict();
export type UnlockRequest = z.infer<typeof unlockRequestSchema>;

/**
 * The answer: `ok` with the server's progress after the purchase, or why not (`already_unlocked`, `not_enough` with
 * how many Supplies are missing). Both carry the server's progress, so the hub shows the truth (U5).
 */
export const unlockResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), unlockId: z.string(), progress: progressViewSchema }),
  z.object({
    ok: z.literal(false),
    unlockId: z.string(),
    reason: z.enum(["already_unlocked", "not_enough"]),
    /** `not_enough` only: Supplies still missing (> 0). */
    need: z.number().int().positive().optional(),
    progress: progressViewSchema,
  }),
]);
export type UnlockResponse = z.infer<typeof unlockResponseSchema>;

/**
 * Story 7.6 (AC 2, 4, 5, 7): turning a guest into an account, logging in, a forgotten password, logging out. The cookie
 * names the device; bodies never carry an account id. Error answers are an HTTP status + `{ message: AccountErrorCode }`.
 */
export const ACCOUNT_UPGRADE_PATH = "/account/upgrade";
export const ACCOUNT_LOGIN_PATH = "/account/login";
export const ACCOUNT_RECOVER_PATH = "/account/recover";
export const ACCOUNT_LOGOUT_PATH = "/account/logout";

/** AC 2: 3–20 letters, digits, `_`, `-`, `.`; unique ignoring case. */
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
export const usernameSchema = z.string().regex(USERNAME_RE);
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

/** Review N1: the most common passwords (`config/commonPasswords.json`), compared ignoring case. */
const COMMON = new Set(commonPasswords.passwords.map((p) => p.toLowerCase()));
export function isCommonPassword(password: string): boolean {
  return COMMON.has(password.toLowerCase());
}

/** AC 2: the recovery code alphabet (Crockford base 32: no I, L, O, U), 12 characters shown `ABCD-EFGH-JKMN`. */
export const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const RECOVERY_CODE_LENGTH = 12;

/**
 * What a person typed as a recovery code, upper-cased with dashes and spaces dropped (AC 5: case-insensitive, dashes
 * optional), with Crockford's decoding (review L3): O reads as 0, I and L as 1 (the alphabet has 0 and 1, never O, I, L).
 */
export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

/** `ABCDEFGHJKMN` → `ABCD-EFGH-JKMN`. */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/** A complete code (12 letters of the alphabet once normalised): the Forgot password Next button turns on. */
export function isCompleteRecoveryCode(input: string): boolean {
  const c = normaliseRecoveryCode(input);
  return c.length === RECOVERY_CODE_LENGTH && [...c].every((ch) => RECOVERY_ALPHABET.includes(ch));
}

/** Bodies are length-checked loosely here (the HTTP guard caps them at 2 KB); the routes apply the exact rules. */
export const upgradeRequestSchema = z.object({ username: z.string().max(64), password: z.string().max(256) }).strict();
export const loginRequestSchema = z.object({ username: z.string().max(64), password: z.string().max(256) }).strict();
export const recoverRequestSchema = z.object({ username: z.string().max(64), code: z.string().max(64), newPassword: z.string().max(256) }).strict();
export const logoutRequestSchema = z.object({}).strict();
export type UpgradeRequest = z.infer<typeof upgradeRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RecoverRequest = z.infer<typeof recoverRequestSchema>;

/** AC 2: saved; the code is shown once (never stored in clear, never logged). */
export const upgradeResponseSchema = z.object({ ok: z.literal(true), username: z.string().max(64), recoveryCode: z.string().max(32) });
export type UpgradeResponse = z.infer<typeof upgradeResponseSchema>;

/** The saved session branch: login / logout answer a whole new session (new device token, ticket, account, progress). */
const savedSessionSchema = accountSessionResponseSchema.options[0];
export const deviceSessionResponseSchema = savedSessionSchema;
export type DeviceSessionResponse = z.infer<typeof deviceSessionResponseSchema>;
/** AC 5: a reset logs the device in and shows the new code once. */
export const recoverResponseSchema = savedSessionSchema.extend({ recoveryCode: z.string().max(32) });
export type RecoverResponse = z.infer<typeof recoverResponseSchema>;

/**
 * Why a call was refused (the `message` of a non-200 answer). The texts never say which part of a login was wrong (A3).
 */
export const ACCOUNT_ERRORS = {
  invalid_body: "Check the form and try again",
  bad_username: "Use 3–20 letters, numbers, _ - or .",
  bad_password: `Use ${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
  common_password: "That password is too common: pick another one",
  name_taken: "That name is taken",
  already_account: "This phone is already saved",
  not_logged_in: "This phone isn't logged in",
  wrong_login: "Wrong username or password",
  wrong_code: "Wrong username or code",
  rate_limited: "Too many attempts, try again in a minute",
  in_room: "Leave the game first",
  no_account: "Can't reach the save server, try later",
  save_unavailable: "Can't reach the save server, try later",
  forbidden: "Can't reach the save server, try later",
} as const;
export type AccountErrorCode = keyof typeof ACCOUNT_ERRORS;

/** Story 7.5 (AC 3): train one boost one level with Supplies. The server sees `/account/training`. */
export const ACCOUNT_TRAINING_PATH = "/account/training";

/** `level` = the level being bought (current + 1); a client UUID per tap, same rules as an unlock (T3). */
export const trainRequestSchema = z
  .object({
    boost: z.enum(["max_hp", "damage", "start_money", "reload"]),
    level: z.number().int().min(1).max(10),
    requestId: z.string().uuid(),
  })
  .strict();
export type TrainRequest = z.infer<typeof trainRequestSchema>;

/** The answer: `ok` with the server's progress after the purchase, or why not; both carry the server's progress. */
export const trainResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), boost: z.string(), level: z.number().int(), progress: progressViewSchema }),
  z.object({
    ok: z.literal(false),
    boost: z.string(),
    reason: z.enum(["already_trained", "not_enough", "maxed"]),
    /** `not_enough` only: Supplies still missing (> 0). */
    need: z.number().int().positive().optional(),
    progress: progressViewSchema,
  }),
]);
export type TrainResponse = z.infer<typeof trainResponseSchema>;
/**
 * Story 7.10 (AC 8, 11; E2): save my survivor look from the editor. The server sees `/account/look` (the browser calls
 * `/api/account/look`; 7.1's route naming, POST like the other account calls). The cookie names the account (never an
 * id in the body). The body is the look code only, ≤ 256 bytes (else 413); the server decodes it against what the
 * account owns, stores the CANONICAL code (null = the default look) and answers it.
 */
export const ACCOUNT_LOOK_PATH = "/account/look";
/** Story 7.10 (AC 11): the largest look-save body the route reads (bytes); a larger one is refused with 413. */
export const LOOK_SAVE_MAX_BODY_BYTES = 256;

/**
 * `base` (review L2, optional): the stored look this save was edited from (null = the default look). Sent by the start-up
 * retry of a look saved only on the phone: the server stores the look only while the account's look is still `base`
 * (checked inside the save transaction), else it keeps the newer look and answers it with `stale: true`. An editor
 * Done sends no base (the last Done wins).
 */
export const lookSaveRequestSchema = z.object({ look: z.string().max(LOOK_SAVE_MAX_BODY_BYTES), base: z.string().max(LOOK_CODE_MAX).nullable().optional() }).strict();
export type LookSaveRequest = z.infer<typeof lookSaveRequestSchema>;

/** The answer: the code the server stored (canonical; unowned or unknown parts became the default parts), or null (the default look). */
export const lookSaveResponseSchema = z.object({ ok: z.literal(true), look: z.string().max(LOOK_CODE_MAX).nullable(), stale: z.boolean().optional() });
export type LookSaveResponse = z.infer<typeof lookSaveResponseSchema>;
