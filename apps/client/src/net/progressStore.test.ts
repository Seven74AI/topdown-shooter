import type { AccountSessionResponse, ProgressView } from "@topdown/shared";
import { describe, expect, it, vi } from "vitest";
import { accountSessionResponseSchema } from "@topdown/shared";
import { accountSession, unlockItem } from "./account";
import { PROGRESS_CACHE_KEY, ProgressStore } from "./progressStore";

const P: ProgressView = { supplies: 340, lifetimeSupplies: 900, unlocks: ["mine"] };
const saved = (progress: ProgressView | null | undefined): AccountSessionResponse => ({
  saved: true,
  deviceToken: "ab".repeat(16),
  ticket: "t.s",
  account: { displayName: "", username: null },
  ...(progress === undefined ? {} : { progress }),
});

function mem(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

describe("progressStore (Story 7.3 AC 4, 8; U5)", () => {
  it("refresh shows the server's progress and caches it", async () => {
    const s = mem();
    const store = new ProgressStore({ session: async () => saved(P), storage: () => s });
    const snap = await store.refresh();
    expect(snap).toEqual({ progress: P, source: "server", loading: false });
    expect(JSON.parse(s.data[PROGRESS_CACHE_KEY] as string)).toEqual(P);
  });

  it("AC 8: no network → the cached copy, marked offline (source 'cache'); nothing cached → none", async () => {
    const cached = new ProgressStore({ session: async () => null, storage: () => mem({ [PROGRESS_CACHE_KEY]: JSON.stringify(P) }) });
    expect(await cached.refresh()).toEqual({ progress: P, source: "cache", loading: false });
    const empty = new ProgressStore({ session: async () => null, storage: () => mem() });
    expect(await empty.refresh()).toEqual({ progress: null, source: "cache", loading: false });
    // save server down (saved:false) and a failed progress read (progress null) are offline too
    const down = new ProgressStore({ session: async () => ({ saved: false, deviceToken: "ab".repeat(16), ticket: null, account: null }), storage: () => mem({ [PROGRESS_CACHE_KEY]: JSON.stringify(P) }) });
    expect((await down.refresh()).source).toBe("cache");
    const noRead = new ProgressStore({ session: async () => saved(null), storage: () => mem() });
    expect((await noRead.refresh()).source).toBe("cache");
  });

  it("beat the rule: an edited or broken cache is only shown if it parses, and the next server answer overwrites it", async () => {
    const s = mem({ [PROGRESS_CACHE_KEY]: JSON.stringify({ supplies: -5, lifetimeSupplies: 0, unlocks: [] }) });
    let online = false;
    const store = new ProgressStore({ session: async () => (online ? saved(P) : null), storage: () => s });
    expect((await store.refresh()).progress).toBeNull();
    s.data[PROGRESS_CACHE_KEY] = "{not json";
    expect((await store.refresh()).progress).toBeNull();
    s.data[PROGRESS_CACHE_KEY] = JSON.stringify({ supplies: 99999, lifetimeSupplies: 99999, unlocks: ["chainsaw"] });
    expect((await store.refresh()).progress?.supplies).toBe(99999); // display only, offline
    online = true;
    expect(await store.refresh()).toEqual({ progress: P, source: "server", loading: false });
    expect(JSON.parse(s.data[PROGRESS_CACHE_KEY] as string)).toEqual(P);
  });

  it("storage that throws (private mode) never breaks the hub", async () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    const store = new ProgressStore({ session: async () => saved(P), storage: () => ({ getItem: boom, setItem: boom }) });
    expect((await store.refresh()).progress).toEqual(P);
    const off = new ProgressStore({ session: async () => null, storage: () => ({ getItem: boom, setItem: boom }) });
    expect((await off.refresh()).progress).toBeNull();
  });

  it("an unlock answer (accept) wins over a refresh still in flight; markOffline keeps the numbers", async () => {
    let release: (v: AccountSessionResponse) => void = () => undefined;
    const store = new ProgressStore({ session: () => new Promise((r) => (release = r)), storage: () => mem() });
    const pending = store.refresh();
    const after = { ...P, supplies: 240, unlocks: ["mine", "bear_trap"] };
    store.accept(after);
    release(saved(P));
    await pending;
    expect(store.get()).toEqual({ progress: after, source: "server", loading: false });
    store.markOffline();
    expect(store.get()).toEqual({ progress: after, source: "cache", loading: false });
  });

  it("review F2: after a failed unlock (markOffline), the refresh that follows brings the server back (Unlock usable again)", async () => {
    let up = false;
    const store = new ProgressStore({ session: async () => (up ? saved(P) : null), storage: () => mem() });
    store.accept({ ...P, supplies: 999 });
    store.markOffline();
    expect(store.get().source).toBe("cache");
    up = true;
    expect(await store.refresh()).toEqual({ progress: P, source: "server", loading: false });
  });

  it("a session server older than 7.3 (no `progress` field) → offline view, ticket flow untouched", async () => {
    const store = new ProgressStore({ session: async () => saved(undefined), storage: () => mem() });
    expect((await store.refresh()).source).toBe("cache");
  });
});

describe("unlockItem (Story 7.3 AC 5)", () => {
  const ok = { ok: true, unlockId: "mine", progress: P };
  it("posts { unlockId, requestId } same-origin to the unlock path and returns the parsed answer", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(ok), { status: 200 }));
    const r = await unlockItem("mine", "11111111-1111-4111-8111-111111111111", { fetch, url: () => "/api/account/unlock" });
    expect(r).toEqual({ kind: "answer", body: ok });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/account/unlock");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ unlockId: "mine", requestId: "11111111-1111-4111-8111-111111111111" });
  });

  it("4xx/5xx, a malformed reply, no network → failed with the status (0 = no answer); never throws", async () => {
    const url = () => "/api/account/unlock";
    expect(await unlockItem("mine", "x", { url, fetch: async () => new Response("{}", { status: 429 }) })).toEqual({ kind: "failed", status: 429 });
    expect(await unlockItem("mine", "x", { url, fetch: async () => new Response(JSON.stringify({ ok: "yes" }), { status: 200 }) })).toEqual({ kind: "failed", status: 200 });
    expect(
      await unlockItem("mine", "x", {
        url,
        fetch: async () => {
          throw new TypeError("offline");
        },
      }),
    ).toEqual({ kind: "failed", status: 0 });
  });

  it("the default path is <origin>/api/account/unlock (the session path stays /account/session)", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(ok), { status: 200 }));
    vi.stubGlobal("location", { origin: "https://hordes.example" });
    await unlockItem("mine", "x", { fetch });
    vi.unstubAllGlobals();
    expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toBe("https://hordes.example/api/account/unlock");
    expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toMatch(/\/account\/unlock$/);
    expect(typeof accountSession).toBe("function");
  });
});

describe("review F10: the session reply is forward compatible (later stories add fields)", () => {
  it("an unknown field at the top, in `account`, in `progress` or in the saved:false reply is dropped, never a rejection", () => {
    const token = "ab".repeat(16);
    const savedR = { saved: true, deviceToken: token, ticket: "t.s", account: { displayName: "", username: null, level: 3 }, progress: { ...P, training: { dmg: 1 } }, extra: 1 };
    const s = accountSessionResponseSchema.parse(savedR);
    expect(s.saved && s.ticket).toBe("t.s");
    expect(s.saved && s.progress).toEqual(P);
    const off = accountSessionResponseSchema.parse({ saved: false, deviceToken: token, ticket: null, account: null, reason: "down" });
    expect(off.saved).toBe(false);
  });
});
