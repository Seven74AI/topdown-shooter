import { describe, expect, it } from "vitest";
import { DEVICE_LOOK_KEY, deviceLookStore, type LookStorage } from "./deviceLook";
import { joinAccount } from "./account";
import { guestTokenStore } from "./guestToken";

const CODE = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:aa0000,00bb00,0000cc";
function mem(): LookStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}
const blocked: LookStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};
const TOKEN = "ab".repeat(16);
const reply = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
const savedWith = (look: string | null | undefined) => ({
  saved: true,
  deviceToken: TOKEN,
  ticket: "T",
  account: { displayName: "", username: null },
  ...(look === undefined ? {} : { progress: { look } }),
});
const deps = (f: typeof globalThis.fetch) => ({ fetch: f, url: () => "/x", tokens: guestTokenStore(() => ({ getItem: () => TOKEN, setItem: () => {} })) });

describe("device look copy (Story 7.9 AC 5, 13)", () => {
  it("stores the server's code, clears it on null, ignores implausible values", () => {
    const s = mem();
    const store = deviceLookStore(() => s);
    expect(store.get()).toBeUndefined();
    store.set(CODE);
    expect(store.get()).toBe(CODE);
    store.set(null);
    expect(s.map.has(DEVICE_LOOK_KEY)).toBe(false);
    s.map.set(DEVICE_LOOK_KEY, "x".repeat(500));
    expect(store.get()).toBeUndefined();
  });

  it("beat the rule 7: blocked storage (private mode) → no copy, no error", () => {
    const store = deviceLookStore(() => blocked);
    expect(() => store.set(CODE)).not.toThrow();
    expect(store.get()).toBeUndefined();
  });
});

describe("joinAccount: the look a join carries (Story 7.9 AC 5)", () => {
  it("the server's copy first, and it is kept on this device", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    expect(await joinAccount(deps(reply(savedWith(CODE))), looks)).toEqual({ ticket: "T", look: CODE });
    expect(looks.get()).toBe(CODE);
  });

  it("the server says default (null): no look field and the device copy is cleared", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(CODE);
    expect(await joinAccount(deps(reply(savedWith(null))), looks)).toEqual({ ticket: "T" });
    expect(looks.get()).toBeUndefined();
  });

  it("save server down (unsaved / no answer): the device copy, then nothing", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(CODE);
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    expect(await joinAccount(deps(down), looks)).toEqual({ look: CODE });
    expect(await joinAccount(deps(reply({ saved: false, deviceToken: TOKEN, ticket: null, account: null })), looks)).toEqual({ look: CODE });
    looks.set(null);
    expect(await joinAccount(deps(down), looks)).toEqual({});
  });

  it("a server without the progress field (7.1 alone) keeps the device copy", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(CODE);
    expect(await joinAccount(deps(reply(savedWith(undefined))), looks)).toEqual({ ticket: "T", look: CODE });
  });
});
