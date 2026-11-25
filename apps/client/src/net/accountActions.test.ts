import { describe, expect, it, vi } from "vitest";
import { forgetTicket, logInAccount, logOutAccount, recoverAccount, recoveryTicket, upgradeAccount } from "./account";
import { accountStore } from "./accountStore";
import { GUEST_TOKEN_KEY, guestTokenStore, type TokenStorage } from "./guestToken";
import { progressStore } from "./progressStore";

/** Story 7.6 (AC 2, 4, 5, 7): the account calls on the phone. */
const OLD = "ab".repeat(16);
const NEW = "cd".repeat(16);
const TICKET = "cGF5bG9hZA.c2ln";
function storage(initial: Record<string, string> = {}): TokenStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const session = (username: string | null, supplies = 770) => ({ saved: true, deviceToken: NEW, ticket: TICKET, account: { displayName: "Mo", username }, progress: { supplies, lifetimeSupplies: supplies, unlocks: ["mine"] } });

describe("Story 7.6: account actions (net/account.ts)", () => {
  it("A5: a login answer replaces the localStorage token, drops the cached ticket (bound to the old token) and shows the server's account + progress", async () => {
    const s = storage({ [GUEST_TOKEN_KEY]: OLD });
    const tokens = guestTokenStore(() => s);
    // a ticket cached for the old token (seat recovery reuses it for 9 min)
    await recoveryTicket({ fetch: reply({ saved: true, deviceToken: OLD, ticket: "old.ticket", account: { displayName: "", username: null } }), url: () => "/x", tokens });
    const fetch = reply(session("mo_42"));
    const r = await logInAccount("mo_42", "pw pw pw pw", { fetch, url: () => "/api/account/login", tokens });
    expect(r.kind).toBe("ok");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/account/login");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ username: "mo_42", password: "pw pw pw pw" });
    expect(s.data[GUEST_TOKEN_KEY]).toBe(NEW);
    expect(accountStore.get()).toEqual({ known: true, username: "mo_42" });
    expect(progressStore.get().progress?.supplies).toBe(770);
    const next = reply({ saved: true, deviceToken: NEW, ticket: "fresh.ticket", account: { displayName: "", username: "mo_42" } });
    expect(await recoveryTicket({ fetch: next, url: () => "/x", tokens })).toBe("fresh.ticket"); // not the old one
    forgetTicket();
  });

  it("refusals show the server's reason text; a 5xx, a timeout or no network say the save server can't be reached; nothing is adopted", async () => {
    const s = storage({ [GUEST_TOKEN_KEY]: OLD });
    const tokens = guestTokenStore(() => s);
    accountStore.accept(null);
    expect(await logInAccount("a", "b", { fetch: reply({ message: "wrong_login" }, 401), url: () => "/x", tokens })).toEqual({ kind: "error", code: "wrong_login", text: "Wrong username or password" });
    expect(await logInAccount("a", "b", { fetch: reply({ message: "rate_limited" }, 429), url: () => "/x", tokens })).toMatchObject({ text: "Too many attempts, try again in a minute" });
    expect(await logInAccount("a", "b", { fetch: reply({ message: "in_room" }, 409), url: () => "/x", tokens })).toMatchObject({ text: "Leave the game first" });
    expect(await logInAccount("a", "b", { fetch: reply({ message: "wrong_login" }, 503), url: () => "/x", tokens })).toMatchObject({ code: "save_unavailable" });
    expect(await logInAccount("a", "b", { fetch: reply({ message: "<script>" }, 400), url: () => "/x", tokens })).toMatchObject({ code: "save_unavailable" });
    expect(await logInAccount("a", "b", { fetch: vi.fn(async () => Promise.reject(new TypeError("offline"))), url: () => "/x", tokens })).toMatchObject({ text: "Can't reach the save server, try later" });
    expect(await logInAccount("a", "b", { fetch: reply({ saved: true }), url: () => "/x", tokens })).toMatchObject({ code: "save_unavailable" }); // malformed 200
    expect(s.data[GUEST_TOKEN_KEY]).toBe(OLD);
    expect(accountStore.get().username).toBeNull();
  });

  it("upgrade: the shown code comes back and the account line becomes the username; the token is unchanged (same account)", async () => {
    const s = storage({ [GUEST_TOKEN_KEY]: OLD });
    const r = await upgradeAccount("mo_42", "hunter22!", { fetch: reply({ ok: true, username: "mo_42", recoveryCode: "ABCD-EFGH-JKMN" }), url: () => "/x", tokens: guestTokenStore(() => s) });
    expect(r).toEqual({ kind: "ok", body: { ok: true, username: "mo_42", recoveryCode: "ABCD-EFGH-JKMN" } });
    expect(accountStore.get().username).toBe("mo_42");
    expect(s.data[GUEST_TOKEN_KEY]).toBe(OLD);
  });

  it("recover and logout adopt the new session (logout: a guest again, empty progress)", async () => {
    const s = storage({ [GUEST_TOKEN_KEY]: OLD });
    const tokens = guestTokenStore(() => s);
    const rec = await recoverAccount("mo_42", "abcd efgh jkmn", "new pass 1", { fetch: reply({ ...session("mo_42"), recoveryCode: "QRST-VWXY-Z012" }), url: () => "/x", tokens });
    expect(rec.kind === "ok" && rec.body.recoveryCode).toBe("QRST-VWXY-Z012");
    s.data[GUEST_TOKEN_KEY] = OLD;
    const out = await logOutAccount({ fetch: reply(session(null, 0)), url: () => "/x", tokens });
    expect(out.kind).toBe("ok");
    expect(s.data[GUEST_TOKEN_KEY]).toBe(NEW);
    expect(accountStore.get()).toEqual({ known: true, username: null });
    expect(progressStore.get().progress?.supplies).toBe(0);
  });
});
