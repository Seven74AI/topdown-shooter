/**
 * Story 7.1: the account HTTP API shared by client and server. `POST /api/account/session` (the server sees
 * `/account/session`: Caddy and Vite strip `/api`). The guest token travels in the HttpOnly `__Host-tdg` cookie and, as
 * the `localStorage` copy, in `deviceToken` (designer D9: either one finds the account; the cookie wins, 7.1 D3).
 */
import { z } from "zod";
import { guestTokenSchema } from "./messages";
import { LOOK_CODE_MAX } from "../config/cosmetics";

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
