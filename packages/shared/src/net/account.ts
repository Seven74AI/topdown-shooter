/**
 * Story 7.1: the account HTTP API shared by client and server. `POST /api/account/session` (the server sees
 * `/account/session`: Caddy and Vite strip `/api`). The guest token travels in the HttpOnly `tdg` cookie and, as
 * the `localStorage` copy, in `deviceToken` (designer D9: either one finds the account; the cookie wins, 7.1 D3).
 */
import { z } from "zod";
import { guestTokenSchema } from "./messages";
import { LOOK_CODE_MAX } from "../config/cosmetics";

export const ACCOUNT_SESSION_PATH = "/account/session";
/** The cookie that holds the guest token (HttpOnly, Secure, SameSite=Lax, Path=/api, 1 year). */
export const GUEST_COOKIE = "tdg";

export const accountSessionRequestSchema = z.object({ deviceToken: guestTokenSchema.optional() }).strict();
export type AccountSessionRequest = z.infer<typeof accountSessionRequestSchema>;

/** A session ticket in the join options: `base64url(accountId.expiresAtMs).base64url(HMAC-SHA256)`, ≤ 200 chars. */
export const sessionTicketSchema = z.string().min(1).max(200);

export const accountSessionResponseSchema = z.discriminatedUnion("saved", [
  z
    .object({
      saved: z.literal(true),
      deviceToken: guestTokenSchema,
      ticket: sessionTicketSchema,
      account: z.object({ displayName: z.string().max(64), username: z.string().max(64).nullable() }).strict(),
      /**
       * Story 7.9: the saved progress the client needs before a join: the survivor look code (canonical; null = the
       * default look). Optional so a client copes with a server that sends none.
       */
      progress: z.object({ look: z.string().max(LOOK_CODE_MAX).nullable() }).strict().optional(),
    })
    .strict(),
  // The save server is down or the device is over the new-guest limit: play goes on unsaved (P3).
  z.object({ saved: z.literal(false), deviceToken: guestTokenSchema, ticket: z.null(), account: z.null() }).strict(),
]);
export type AccountSessionResponse = z.infer<typeof accountSessionResponseSchema>;
