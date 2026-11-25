import { describe, expect, it, vi } from "vitest";
import { accountsRepo, type AccountsRepo } from "../db/accountsRepo";
import type { Database } from "../db/client";
import { SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { mintGuestToken, resolveGuestSession } from "./guestSession";
import { hashGuestToken } from "../run/lobby";
import { verifyTicket } from "./ticket";

log.level = process.env.LOG_LEVEL ?? "silent";
const SECRET = "k".repeat(43);
const TOKEN = "e5".repeat(16);
const limiter = () => new SlidingWindowLimiter(20, 3_600_000);
const limits = () => ({ newGuestLimiter: limiter(), sessionLimiter: new SlidingWindowLimiter(30, 60_000), logGate: new SlidingWindowLimiter(1, 60_000) });

describe("resolveGuestSession (Story 7.1 AC 4, P3)", () => {
  it("a database that times out gives saved:false with the presented token and no ticket (2 s timeout path)", async () => {
    const hung: Database = { kind: "postgres", db: () => new Promise(() => {}), close: async () => {} };
    const { response, source } = await resolveGuestSession(
      { cookieToken: null, deviceToken: TOKEN, ip: "1.2.3.4" },
      { accounts: accountsRepo(hung, 30), ...limits(), sessionSecret: SECRET },
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
    const { response } = await resolveGuestSession({ cookieToken: undefined, deviceToken: undefined, ip: "1.2.3.4" }, { accounts: repo, ...limits(), sessionSecret: SECRET });
    expect(response.saved).toBe(false);
    expect(response.deviceToken).toMatch(/^[0-9a-f]{32}$/);
  });

  it("ignores malformed cookie values (a stale or hand-edited cookie never reaches the database)", async () => {
    const find = vi.fn(async () => null);
    const repo: AccountsRepo = { findByTokenHash: find, createGuest: async () => ({ id: "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4", displayName: "", username: null }), setDisplayName: async () => {} };
    const { response } = await resolveGuestSession({ cookieToken: "not-a-token", deviceToken: TOKEN, ip: "1.2.3.4" }, { accounts: repo, ...limits(), sessionSecret: SECRET });
    expect(find).toHaveBeenCalledTimes(1);
    expect(response.deviceToken).toBe(TOKEN);
    expect(verifyTicket(response.ticket, SECRET, hashGuestToken(TOKEN))).toBe("0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4");
  });

  it("mints distinct 32-hex tokens", () => {
    const a = mintGuestToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(mintGuestToken()).not.toBe(a);
  });

  it("review L3: one 2 s deadline for the whole call (three slow lookups can't add up past the client's 3 s)", async () => {
    const slow = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));
    const created: string[] = [];
    const repo: AccountsRepo = {
      findByTokenHash: () => slow(null),
      createGuest: async (hash) => {
        created.push(hash);
        return slow({ id: "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4", displayName: "", username: null });
      },
      setDisplayName: async () => {},
    };
    const t0 = Date.now();
    const { response } = await resolveGuestSession(
      { cookieToken: "c3".repeat(16), deviceToken: TOKEN, ip: "1.2.3.4" },
      { accounts: repo, ...limits(), sessionSecret: SECRET, deadlineMs: 200 },
    );
    expect(Date.now() - t0).toBeLessThan(350); // 3 × 150 ms would be 450 ms
    expect(response).toEqual({ saved: false, deviceToken: "c3".repeat(16), ticket: null, account: null });
    // The late create (after the deadline) is for the same token the device was given: a later call finds it.
    await vi.waitFor(() => expect(created).toEqual([hashGuestToken("c3".repeat(16))]));
  });

  it("re-review N-R2: past the deadline with NO presented token, the late create names the token the device was given", async () => {
    const created: string[] = [];
    const repo: AccountsRepo = {
      findByTokenHash: async () => null,
      createGuest: async (hash) => {
        created.push(hash);
        return new Promise((r) => setTimeout(() => r({ id: "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4", displayName: "", username: null }), 150));
      },
      setDisplayName: async () => {},
    };
    const { response } = await resolveGuestSession({ cookieToken: null, deviceToken: undefined, ip: "1.2.3.4" }, { accounts: repo, ...limits(), sessionSecret: SECRET, deadlineMs: 50 });
    expect(response.saved).toBe(false);
    expect(response.deviceToken).toMatch(/^[0-9a-f]{32}$/);
    expect(created).toEqual([hashGuestToken(response.deviceToken)]);
  });

  it("the default deadline is the 2 s repository timeout", async () => {
    const { DB_TIMEOUT_MS } = await import("../db/timeout");
    expect(DB_TIMEOUT_MS).toBe(2000);
    const src = (await import("node:fs")).readFileSync(new URL("./guestSession.ts", import.meta.url), "utf8");
    expect(src).toContain("deps.deadlineMs ?? DB_TIMEOUT_MS");
  });

  it("review L4: over 30 calls a minute from one IP → unsaved with no database work, one warning per window", async () => {
    const find = vi.fn(async () => null);
    const repo: AccountsRepo = { findByTokenHash: find, createGuest: async () => ({ id: "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4", displayName: "", username: null }), setDisplayName: async () => {} };
    const deps = { accounts: repo, ...limits(), newGuestLimiter: new SlidingWindowLimiter(1000, 3_600_000), sessionSecret: SECRET };
    const warn = vi.spyOn(log, "warn");
    for (let i = 0; i < 30; i++) expect((await resolveGuestSession({ cookieToken: null, deviceToken: TOKEN, ip: "9.9.9.9" }, deps)).response.saved).toBe(true);
    const calls = find.mock.calls.length;
    for (let i = 0; i < 40; i++) {
      const r = await resolveGuestSession({ cookieToken: null, deviceToken: TOKEN, ip: "9.9.9.9" }, deps);
      expect(r.response).toEqual({ saved: false, deviceToken: TOKEN, ticket: null, account: null });
    }
    expect(find.mock.calls.length).toBe(calls); // no lookups once over the limit
    expect(warn.mock.calls.filter((c) => c[1] === "account_session_rate_limited")).toHaveLength(1);
    // Another IP is unaffected.
    expect((await resolveGuestSession({ cookieToken: null, deviceToken: TOKEN, ip: "9.9.9.10" }, deps)).response.saved).toBe(true);
  });

  it("review L4: new_guest_rate_limited is logged once per IP per window", async () => {
    const repo: AccountsRepo = { findByTokenHash: async () => null, createGuest: async () => ({ id: "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4", displayName: "", username: null }), setDisplayName: async () => {} };
    const deps = { accounts: repo, ...limits(), newGuestLimiter: new SlidingWindowLimiter(1, 3_600_000), sessionSecret: SECRET };
    const warn = vi.spyOn(log, "warn");
    for (let i = 0; i < 6; i++) await resolveGuestSession({ cookieToken: null, deviceToken: undefined, ip: "8.8.8.8" }, deps);
    expect(warn.mock.calls.filter((c) => c[1] === "new_guest_rate_limited")).toHaveLength(1);
  });
});
