import type { AccountSessionResponse } from "@topdown/shared";
import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_TIMEOUT_MS, accountSession, prefillName, sessionTicket } from "./account";
import { GUEST_TOKEN_KEY, guestTokenStore, type TokenStorage } from "./guestToken";

const MINE = "ab".repeat(16);
const SERVERS = "cd".repeat(16);
const TICKET = "cGF5bG9hZA.c2ln";

function storage(initial: Record<string, string> = {}): TokenStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}
const throwing: TokenStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

const savedReply = (deviceToken = SERVERS, displayName = "Ana"): AccountSessionResponse => ({ saved: true, deviceToken, ticket: TICKET, account: { displayName, username: null } });
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("account.ts (Story 7.1 T7)", () => {
  it("posts the localStorage token same-origin to /api/account/session and writes the server's token back (P2)", async () => {
    const s = storage({ [GUEST_TOKEN_KEY]: MINE });
    const fetch = reply(savedReply());
    const res = await accountSession({ fetch, url: () => "/api/account/session", tokens: guestTokenStore(() => s) });
    expect(res?.saved).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/account/session");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ deviceToken: MINE });
    expect(s.data[GUEST_TOKEN_KEY]).toBe(SERVERS);
  });

  it("sessionTicket: the ticket when saved, undefined when the server says not saved (P3)", async () => {
    const st = storage();
    const tokens = guestTokenStore(() => st);
    expect(await sessionTicket({ fetch: reply(savedReply()), url: () => "/x", tokens })).toBe(TICKET);
    expect(await sessionTicket({ fetch: reply({ saved: false, deviceToken: SERVERS, ticket: null, account: null }), url: () => "/x", tokens })).toBeUndefined();
    expect(tokens.get()).toBe(SERVERS); // an unsaved reply still writes the token back
  });

  it("a timeout (3 s), a network error, a 5xx and a malformed reply all give null and keep the token", async () => {
    expect(ACCOUNT_TIMEOUT_MS).toBe(3000);
    const s = storage({ [GUEST_TOKEN_KEY]: MINE });
    const tokens = guestTokenStore(() => s);
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const t0 = Date.now();
    expect(await accountSession({ fetch: hang as unknown as typeof fetch, url: () => "/x", tokens, timeoutMs: 30 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(await accountSession({ fetch: vi.fn(async () => Promise.reject(new TypeError("offline"))), url: () => "/x", tokens })).toBeNull();
    expect(await accountSession({ fetch: reply({ error: "x" }, 503), url: () => "/x", tokens })).toBeNull();
    expect(await accountSession({ fetch: reply({ saved: true, deviceToken: "nope" }), url: () => "/x", tokens })).toBeNull();
    expect(s.data[GUEST_TOKEN_KEY]).toBe(MINE);
  });

  it("storage throwing: the server's token lives in memory for this page", async () => {
    const tokens = guestTokenStore(() => throwing);
    const first = tokens.get();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    await accountSession({ fetch: reply(savedReply()), url: () => "/x", tokens });
    expect(tokens.get()).toBe(SERVERS);
  });

  it("prefillName: an empty field gets a valid display name; typed text, unsaved replies and bad names don't change it", () => {
    expect(prefillName("", savedReply(SERVERS, "Ana"))).toBe("Ana");
    expect(prefillName("  ", savedReply(SERVERS, "  Bo  "))).toBe("Bo");
    expect(prefillName("Cy", savedReply(SERVERS, "Ana"))).toBe("Cy");
    expect(prefillName("", savedReply(SERVERS, ""))).toBe("");
    expect(prefillName("", savedReply(SERVERS, "x".repeat(40)))).toBe("");
    expect(prefillName("", null)).toBe("");
    expect(prefillName("", { saved: false, deviceToken: SERVERS, ticket: null, account: null })).toBe("");
  });
});

