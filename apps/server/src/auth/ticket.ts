/**
 * Story 7.1 AC 5: the session ticket the room trusts (never an account id sent by the client, P4).
 * `ticket = base64url("<accountId>.<tokenHash32>.<expiresAtMs>") + "." + base64url(HMAC-SHA256(secret, payloadPart))`,
 * valid `SESSION_TICKET_TTL_MS` (10 min, decision 7.1 D2). Review M1: the ticket is BOUND to the guest token it was
 * issued for (`tokenHash32` = the first 32 hex of `hashGuestToken(token)`); the room accepts it only together with
 * that token, so a ticket can never re-label another token's seat. Verifying is pure CPU (no database).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SESSION_TICKET_TTL_MS } from "../net/limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX32 = /^[0-9a-f]{32}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
/** base64url of a 32-byte HMAC, unpadded. */
const SIG_CHARS = 43;

/** A fresh random secret (dev and tests: tickets die with the process, which is fine). */
export function randomSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** The part of a guest-token hash a ticket carries (128 bits of the SHA-256: plenty to bind, nothing to reverse). */
export function ticketTokenPart(guestTokenHash: string): string {
  return guestTokenHash.slice(0, 32);
}

function mac(secret: string, payloadPart: string): Buffer {
  return createHmac("sha256", secret).update(payloadPart, "utf8").digest();
}

export function signTicket(
  accountId: string,
  guestTokenHash: string,
  secret: string,
  nowMs: number = Date.now(),
  ttlMs: number = SESSION_TICKET_TTL_MS,
): string {
  const payloadPart = Buffer.from(`${accountId}.${ticketTokenPart(guestTokenHash)}.${nowMs + ttlMs}`, "utf8").toString("base64url");
  return `${payloadPart}.${mac(secret, payloadPart).toString("base64url")}`;
}

export interface TicketClaims {
  accountId: string;
  /** `ticketTokenPart` of the guest token the ticket was issued for. */
  tokenPart: string;
}

/**
 * The claims of a valid, unexpired ticket signed with `secret`, else null (never throws). The signature must be the
 * canonical 43-char encoding (review L2: no malleable variants) and is compared in constant time before the payload is read.
 */
export function readTicket(ticket: unknown, secret: string, nowMs: number = Date.now()): TicketClaims | null {
  if (typeof ticket !== "string" || ticket.length > 200) return null;
  const dot = ticket.indexOf(".");
  if (dot <= 0 || dot !== ticket.lastIndexOf(".")) return null;
  const payloadPart = ticket.slice(0, dot);
  const sigPart = ticket.slice(dot + 1);
  if (!B64URL.test(payloadPart) || sigPart.length !== SIG_CHARS || !B64URL.test(sigPart)) return null;
  const given = Buffer.from(sigPart, "base64url");
  if (given.toString("base64url") !== sigPart) return null;
  const expected = mac(secret, payloadPart);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [accountId = "", tokenPart = "", expires = "", ...rest] = Buffer.from(payloadPart, "base64url").toString("utf8").split(".");
  const expiresAt = Number(expires);
  if (rest.length > 0 || !UUID.test(accountId) || !HEX32.test(tokenPart) || !/^\d+$/.test(expires) || !Number.isSafeInteger(expiresAt)) return null;
  return nowMs < expiresAt ? { accountId, tokenPart } : null;
}

/** Review M1: the account id of a valid ticket issued for THIS guest token (its SHA-256 hex), else null. */
export function verifyTicket(ticket: unknown, secret: string, guestTokenHash: string, nowMs: number = Date.now()): string | null {
  const claims = readTicket(ticket, secret, nowMs);
  if (claims === null) return null;
  const want = Buffer.from(ticketTokenPart(guestTokenHash), "utf8");
  const got = Buffer.from(claims.tokenPart, "utf8");
  return want.length === got.length && timingSafeEqual(want, got) ? claims.accountId : null;
}
