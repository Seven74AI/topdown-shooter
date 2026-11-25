import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SESSION_TICKET_TTL_MS } from "../net/limits";
import { randomSessionSecret, readTicket, signTicket, verifyTicket } from "./ticket";

const ID = "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const OTHER = "11111111-2222-4333-8444-555555555555";
const SECRET = "s".repeat(43);
const T0 = 1_800_000_000_000;
const H = createHash("sha256").update("a1".repeat(16)).digest("hex");
const H2 = createHash("sha256").update("b2".repeat(16)).digest("hex");

describe("session ticket (Story 7.1 AC 5, P4)", () => {
  it("a fresh ticket verifies to its account with its own token until it expires (10 min)", () => {
    expect(SESSION_TICKET_TTL_MS).toBe(600_000);
    const t = signTicket(ID, H, SECRET, T0);
    expect(t.length).toBeLessThanOrEqual(200);
    expect(verifyTicket(t, SECRET, H, T0)).toBe(ID);
    expect(verifyTicket(t, SECRET, H, T0 + SESSION_TICKET_TTL_MS - 1)).toBe(ID);
    expect(verifyTicket(t, SECRET, H, T0 + SESSION_TICKET_TTL_MS)).toBeNull();
    // Replaying yesterday's ticket.
    expect(verifyTicket(t, SECRET, H, T0 + 86_400_000)).toBeNull();
  });

  it("review M1: a valid ticket with ANOTHER guest token names no account", () => {
    const t = signTicket(ID, H, SECRET, T0);
    expect(readTicket(t, SECRET, T0)).toEqual({ accountId: ID, tokenPart: H.slice(0, 32) });
    expect(verifyTicket(t, SECRET, H2, T0)).toBeNull();
    // A token part re-encoded under the old signature does not verify either.
    const forged = `${Buffer.from(`${ID}.${H2.slice(0, 32)}.${T0 + 1000}`).toString("base64url")}.${t.split(".")[1]}`;
    expect(verifyTicket(forged, SECRET, H2, T0)).toBeNull();
  });

  it("refuses another secret's ticket", () => {
    expect(verifyTicket(signTicket(ID, H, randomSessionSecret(), T0), SECRET, H, T0)).toBeNull();
  });

  it("refuses a hand-made ticket: another account id or a far-future expiry under the old signature", () => {
    const real = signTicket(ID, H, SECRET, T0);
    const sig = real.split(".")[1];
    const forgedPayload = Buffer.from(`${OTHER}.${H.slice(0, 32)}.${T0 + 10 * 365 * 86_400_000}`).toString("base64url");
    expect(verifyTicket(`${forgedPayload}.${sig}`, SECRET, H, T0)).toBeNull();
    const farFuture = Buffer.from(`${ID}.${H.slice(0, 32)}.9999999999999`).toString("base64url");
    expect(verifyTicket(`${farFuture}.${sig}`, SECRET, H, T0)).toBeNull();
  });

  it("review L2: only the canonical signature verifies (no last-character variants)", () => {
    const real = signTicket(ID, H, SECRET, T0);
    const [p, s] = real.split(".") as [string, string];
    expect(s).toHaveLength(43);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const variants = [...alphabet].filter((ch) => ch !== s.at(-1)).map((ch) => `${p}.${s.slice(0, -1)}${ch}`);
    expect(variants.filter((v) => verifyTicket(v, SECRET, H, T0) !== null)).toEqual([]);
    expect(verifyTicket(`${p}.${s}=`, SECRET, H, T0)).toBeNull();
    expect(verifyTicket(real, SECRET, H, T0)).toBe(ID);
  });

  it("refuses garbage: not a string, no dot, two dots, bad base64, flipped signature bit, too long, bare account id", () => {
    const real = signTicket(ID, H, SECRET, T0);
    const [p, s] = real.split(".") as [string, string];
    const flipped = Buffer.from(s, "base64url");
    flipped[0] = (flipped[0] as number) ^ 1;
    for (const bad of [undefined, null, 42, {}, "", "abc", `${p}.${s}.x`, `${p}!.${s}`, `${p}.${flipped.toString("base64url")}`, `${p}.${s.slice(0, -2)}`, "x".repeat(201), ID]) {
      expect(verifyTicket(bad, SECRET, H, T0)).toBeNull();
    }
  });

  it("refuses a correctly signed payload that is not <uuid>.<hex32>.<ms>", () => {
    expect(verifyTicket(signTicket("not-a-uuid", H, SECRET, T0), SECRET, H, T0)).toBeNull();
    expect(verifyTicket(signTicket(ID.toUpperCase(), H, SECRET, T0), SECRET, H, T0)).toBeNull();
    expect(readTicket(signTicket(ID, "XYZ", SECRET, T0), SECRET, T0)).toBeNull();
  });
});
