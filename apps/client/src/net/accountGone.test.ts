import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountStore, LAST_USERNAME_KEY, accountStore } from "./accountStore";

/** Story 10.1 review L9: a logged-in phone whose account went away on another phone is told so. */
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("account gone (review L9)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("logged in last time, a guest now (no own log-out or delete) → gone; dismiss clears it; the next guest answer is quiet", () => {
    const st = mem();
    new AccountStore(() => st).accept("mo_42");
    expect(st.m.get(LAST_USERNAME_KEY)).toBe("mo_42");
    const after = new AccountStore(() => st); // the next page load
    after.accept(null);
    expect(after.get()).toEqual({ known: true, username: null, admin: false, gone: true });
    after.dismissGone();
    expect(after.get().gone).toBeUndefined();
    after.accept(null);
    expect(after.get().gone).toBeUndefined();
  });
  it("my own log-out (expectGuest) is never 'gone'; a guest that never logged in is never 'gone'", () => {
    const st = mem();
    const s = new AccountStore(() => st);
    s.accept(null);
    expect(s.get().gone).toBeUndefined();
    s.accept("mo_42");
    s.expectGuest();
    s.accept(null);
    expect(s.get().gone).toBeUndefined();
  });
  it("an account call answered no_account on a logged-in phone shows the clear text, not 'try later'", async () => {
    const { upgradeAccount, ACCOUNT_GONE_TEXT } = await import("./account");
    accountStore.accept("mo_42");
    const no = (async () => new Response(JSON.stringify({ message: "no_account" }), { status: 401 })) as unknown as typeof fetch;
    const r = await upgradeAccount("x_name", "long enough pw", { fetch: no, url: () => "/x" });
    expect(r).toMatchObject({ kind: "error", code: "no_account", text: ACCOUNT_GONE_TEXT });
    accountStore.accept(null);
    const g = await upgradeAccount("x_name", "long enough pw", { fetch: no, url: () => "/x" });
    expect(g).toMatchObject({ kind: "error", code: "no_account" });
    expect((g as { text: string }).text).not.toBe(ACCOUNT_GONE_TEXT);
  });
});
