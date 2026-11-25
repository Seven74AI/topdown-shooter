import { describe, expect, it } from "vitest";
import { SESSION_TICKET_TTL_MS } from "../net/limits";
import { randomSessionSecret, signTicket, verifyTicket } from "./ticket";

const ID = "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const OTHER = "11111111-2222-4333-8444-555555555555";
const SECRET = "s".repeat(43);
const T0 = 1_800_000_000_000;

describe("session ticket (Story 7.1 AC 5, P4)", () => {
  it("a fresh ticket verifies to its account until it expires (10 min)", () => {
    expect(SESSION_TICKET_TTL_MS).toBe(600_000);
    const t = signTicket(ID, SECRET, T0);
    expect(t.length).toBeLessThanOrEqual(200);
    expect(verifyTicket(t, SECRET, T0)).toBe(ID);
    expect(verifyTicket(t, SECRET, T0 + SESSION_TICKET_TTL_MS - 1)).toBe(ID);
    expect(verifyTicket(t, SECRET, T0 + SESSION_TICKET_TTL_MS)).toBeNull();
    // Replaying yesterday's ticket.
    expect(verifyTicket(t, SECRET, T0 + 86_400_000)).toBeNull();
  });

  it("refuses another secret's ticket", () => {
    expect(verifyTicket(signTicket(ID, randomSessionSecret(), T0), SECRET, T0)).toBeNull();
  });

  it("refuses a hand-made ticket: another account id or a far-future expiry under the old signature", () => {
    const real = signTicket(ID, SECRET, T0);
    const sig = real.split(".")[1];
    const forgedPayload = Buffer.from(`${OTHER}.${T0 + 10 * 365 * 86_400_000}`).toString("base64url");
    expect(verifyTicket(`${forgedPayload}.${sig}`, SECRET, T0)).toBeNull();
    const farFuture = Buffer.from(`${ID}.9999999999999`).toString("base64url");
    expect(verifyTicket(`${farFuture}.${sig}`, SECRET, T0)).toBeNull();
  });

  it("refuses garbage: not a string, no dot, two dots, bad base64, flipped signature bit, too long, bare account id", () => {
    const real = signTicket(ID, SECRET, T0);
    const [p, s] = real.split(".") as [string, string];
    const flipped = Buffer.from(s, "base64url");
    flipped[0] = (flipped[0] as number) ^ 1;
    for (const bad of [undefined, null, 42, {}, "", "abc", `${p}.${s}.x`, `${p}!.${s}`, `${p}.${flipped.toString("base64url")}`, `${p}.${s.slice(0, -2)}`, "x".repeat(201), ID]) {
      expect(verifyTicket(bad, SECRET, T0)).toBeNull();
    }
  });

  it("refuses a correctly signed payload that is not <uuid>.<ms>", () => {
    expect(verifyTicket(signTicket("not-a-uuid", SECRET, T0), SECRET, T0)).toBeNull();
    expect(verifyTicket(signTicket(ID.toUpperCase(), SECRET, T0), SECRET, T0)).toBeNull();
  });
});
