/**
 * Story 7.1 AC 5: the session ticket the room trusts (never an account id sent by the client, P4).
 * `ticket = base64url("<accountId>.<expiresAtMs>") + "." + base64url(HMAC-SHA256(secret, payloadPart))`, valid
 * `SESSION_TICKET_TTL_MS` (10 min, decision 7.1 D2). Verifying is pure CPU (no database), so `onAuth` can await it.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SESSION_TICKET_TTL_MS } from "../net/limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;

/** A fresh random secret (dev and tests: tickets die with the process, which is fine). */
export function randomSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}

function mac(secret: string, payloadPart: string): Buffer {
  return createHmac("sha256", secret).update(payloadPart, "utf8").digest();
}

export function signTicket(accountId: string, secret: string, nowMs: number = Date.now(), ttlMs: number = SESSION_TICKET_TTL_MS): string {
  const payloadPart = Buffer.from(`${accountId}.${nowMs + ttlMs}`, "utf8").toString("base64url");
  return `${payloadPart}.${mac(secret, payloadPart).toString("base64url")}`;
}

/**
 * The account id of a valid, unexpired ticket signed with `secret`, else null (never throws: a bad ticket means
 * "no account", not a refused join, P3). The MAC is compared in constant time before the payload is read.
 */
export function verifyTicket(ticket: unknown, secret: string, nowMs: number = Date.now()): string | null {
  if (typeof ticket !== "string" || ticket.length > 200) return null;
  const dot = ticket.indexOf(".");
  if (dot <= 0 || dot !== ticket.lastIndexOf(".")) return null;
  const payloadPart = ticket.slice(0, dot);
  const sigPart = ticket.slice(dot + 1);
  if (!B64URL.test(payloadPart) || !B64URL.test(sigPart)) return null;
  const given = Buffer.from(sigPart, "base64url");
  const expected = mac(secret, payloadPart);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = Buffer.from(payloadPart, "base64url").toString("utf8");
  const sep = payload.lastIndexOf(".");
  const accountId = payload.slice(0, sep);
  const expiresAt = Number(payload.slice(sep + 1));
  if (sep <= 0 || !UUID.test(accountId) || !Number.isSafeInteger(expiresAt)) return null;
  return nowMs < expiresAt ? accountId : null;
}
