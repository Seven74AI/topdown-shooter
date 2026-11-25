import { describe, expect, it, vi } from "vitest";
import { accountsRepo, type AccountsRepo } from "../db/accountsRepo";
import type { Database } from "../db/client";
import { SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { mintGuestToken, resolveGuestSession } from "./guestSession";
import { verifyTicket } from "./ticket";

log.level = process.env.LOG_LEVEL ?? "silent";
const SECRET = "k".repeat(43);
const TOKEN = "e5".repeat(16);
const limiter = () => new SlidingWindowLimiter(20, 3_600_000);

describe("resolveGuestSession (Story 7.1 AC 4, P3)", () => {
  it("a database that times out gives saved:false with the presented token and no ticket (2 s timeout path)", async () => {
    const hung: Database = { kind: "postgres", db: () => new Promise(() => {}), close: async () => {} };
    const { response, source } = await resolveGuestSession(
      { cookieToken: null, deviceToken: TOKEN, ip: "1.2.3.4" },
      { accounts: accountsRepo(hung, 30), newGuestLimiter: limiter(), sessionSecret: SECRET },
    );
    expect(source).toBe("unsaved");
    expect(response).toEqual({ saved: false, deviceToken: TOKEN, ticket: null, account: null });
  });

  it("a failing createGuest (lookups fine) is unsaved too, and a device with no token gets a fresh 128-bit one", async () => {
    const repo: AccountsRepo = {
      findByTokenHash: async () => null,
      createGuest: async () => {
        throw new Error("db down");
      },
      setDisplayName: async () => {},
    };
    const { response } = await resolveGuestSession({ cookieToken: undefined, deviceToken: undefined, ip: "1.2.3.4" }, { accounts: repo, newGuestLimiter: limiter(), sessionSecret: SECRET });
    expect(response.saved).toBe(false);
    expect(response.deviceToken).toMatch(/^[0-9a-f]{32}$/);
  });

  it("ignores malformed cookie values (a stale or hand-edited cookie never reaches the database)", async () => {
    const find = vi.fn(async () => null);
    const repo: AccountsRepo = { findByTokenHash: find, createGuest: async () => ({ id: "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4", displayName: "", username: null }), setDisplayName: async () => {} };
    const { response } = await resolveGuestSession({ cookieToken: "not-a-token", deviceToken: TOKEN, ip: "1.2.3.4" }, { accounts: repo, newGuestLimiter: limiter(), sessionSecret: SECRET });
    expect(find).toHaveBeenCalledTimes(1);
    expect(response.deviceToken).toBe(TOKEN);
    expect(verifyTicket(response.ticket, SECRET)).toBe("0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4");
  });

  it("mints distinct 32-hex tokens", () => {
    const a = mintGuestToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(mintGuestToken()).not.toBe(a);
  });
});
