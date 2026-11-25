/**
 * Story 7.1: the account HTTP API shared by client and server. `POST /api/account/session` (the server sees
 * `/account/session`: Caddy and Vite strip `/api`). The guest token travels in the HttpOnly `__Host-tdg` cookie and, as
 * the `localStorage` copy, in `deviceToken` (designer D9: either one finds the account; the cookie wins, 7.1 D3).
 */
import { z } from "zod";
import { guestTokenSchema } from "./messages";

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
 * pool is `progression.json`). Not strict: 7.5 adds `training`, 7.7 `districts`, and an older tab keeps working.
 */
export const progressViewSchema = z.object({
  supplies: z.number().int().nonnegative(),
  lifetimeSupplies: z.number().int().nonnegative(),
  unlocks: z.array(z.string().max(32)).max(64),
});
export type ProgressView = z.infer<typeof progressViewSchema>;

export const accountSessionResponseSchema = z.discriminatedUnion("saved", [
  z.object({
    saved: z.literal(true),
    deviceToken: guestTokenSchema,
    ticket: sessionTicketSchema,
    account: z.object({ displayName: z.string().max(64), username: z.string().max(64).nullable() }).strict(),
    /**
     * Story 7.3 (AC 4): null when the progress read failed (the account is still found: the ticket is good).
     * Optional so this client still reads a 7.1-only server. The object is no longer strict (decision 7.3 B1): later
     * stories add fields without making an open tab drop its ticket.
     */
    progress: progressViewSchema.nullable().optional(),
  }),
  // The save server is down or the device is over the new-guest limit: play goes on unsaved (P3).
  z.object({ saved: z.literal(false), deviceToken: guestTokenSchema, ticket: z.null(), account: z.null() }).strict(),
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
