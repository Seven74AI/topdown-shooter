import { describe, expect, it, vi } from "vitest";
import type { ProgressView } from "@topdown/shared";
import { DEVICE_LOOK_KEY, deviceLookStore, type LookStorage } from "./deviceLook";
import { DEFAULT_LOOK_CODE, saveFromEditor, syncPendingLook, syncPendingLookOnce, forgetStartSync, type LookSaveDeps } from "./lookSave";
import { saveLookCall, type LookSaveCall } from "./account";
import { joinAccount } from "./account";
import { guestTokenStore } from "./guestToken";

/** Story 7.10 T4 (AC 8, 9, 11; E4; D4; beat the rule 3, 4, 5). */
const A = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:aa0000,00bb00,0000cc";
const B = "v1|top:puffer|head:hood|hair:curly|pack:duffel|skin:2|c:112233,445566,778899";
const C = "v1|top:track|head:bike|hair:buzz|pack:none|skin:7|c:010203,040506,070809";
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
const session = (look: string | null | undefined) =>
  (async () => ({ saved: true as const, deviceToken: TOKEN, ticket: "T", account: { displayName: "", username: null }, ...(look === undefined ? {} : { progress: { supplies: 0, lifetimeSupplies: 0, unlocks: [], look } }) })) as unknown as LookSaveDeps["session"];
function progress(look: string | null) {
  let p: { progress: ProgressView | null; source: string } = { progress: { supplies: 5, lifetimeSupplies: 5, unlocks: [], look }, source: "server" };
  return {
    get: () => p,
    accept: (v: ProgressView) => void (p = { progress: v, source: "server" }),
  };
}
const deps = (s: LookStorage, call: (c: string) => Promise<LookSaveCall>, over: Partial<LookSaveDeps> = {}): Partial<LookSaveDeps> => ({
  call,
  looks: deviceLookStore(() => s),
  progress: progress(null),
  session: session(null),
  now: () => 1000,
  ...over,
});

describe("Done (AC 8, 9, 11; E4)", () => {
  it("AC 13: the save request body is the encoded look, POSTed to /api/account/look with the cookie", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, look: A }), { status: 200 }));
    const r = await saveLookCall(A, { fetch: f as unknown as typeof fetch, url: () => "/api/account/look" });
    expect(r).toEqual({ kind: "saved", look: A });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/account/look");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ look: A }); // a Done sends no base (last Done wins)
    await saveLookCall(B, { fetch: f as unknown as typeof fetch, url: () => "/api/account/look" }, null);
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({ look: B, base: null });
    expect((await saveLookCall(A, { fetch: (async () => new Response("", { status: 429 })) as unknown as typeof fetch })).kind).toBe("failed");
    expect(await saveLookCall(A, { fetch: (async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch })).toEqual({ kind: "failed", status: 0 });
  });

  it("stored → the server's canonical code becomes this phone's copy and the hub's progress (the editor shows what was stored)", async () => {
    const s = mem();
    const prog = progress(null);
    const r = await saveFromEditor(B, deps(s, async () => ({ kind: "saved", look: A }), { progress: prog }));
    expect(r).toEqual({ kind: "saved", look: A });
    expect(s.map.get(DEVICE_LOOK_KEY)).toBe(A);
    expect(prog.get().progress?.look).toBe(A);
  });

  it("E4: the server can't be reached → never 'saved': kept on this phone as pending, used for the next join", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(A); // the last server answer
    const r = await saveFromEditor(B, deps(s, async () => ({ kind: "failed", status: 0 })));
    expect(r).toEqual({ kind: "offline" });
    expect(looks.get()).toBe(B);
    expect(looks.pending()).toEqual({ code: B, base: A, savedAt: 1000 });
    // the next join carries B even though the server still says A (the server checks it there, 7.9)
    const reply = (async () => new Response(JSON.stringify({ saved: true, deviceToken: TOKEN, ticket: "T", account: { displayName: "", username: null }, progress: { supplies: 0, lifetimeSupplies: 0, unlocks: [], look: A } }), { status: 200 })) as unknown as typeof fetch;
    expect(await joinAccount({ fetch: reply, url: () => "/x", tokens: guestTokenStore(() => ({ getItem: () => TOKEN, setItem: () => {} })) }, looks)).toEqual({ ticket: "T", look: B });
    expect((await saveFromEditor(DEFAULT_LOOK_CODE, deps(s, async () => ({ kind: "failed", status: 503 })))).kind).toBe("offline");
    expect(looks.pending()?.code).toBeNull(); // the default look is pending as null
    expect(looks.get()).toBeUndefined();
  });

  it("AC 11: 429 → 'too many saves' and nothing kept (the old look stays)", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(A);
    expect(await saveFromEditor(B, deps(s, async () => ({ kind: "failed", status: 429 })))).toEqual({ kind: "rateLimited" });
    expect(looks.get()).toBe(A);
    expect(looks.pending()).toBeNull();
  });

  it("review L4: a deterministic refusal (400, 403, 413) is never kept for a retry; 0 / 401 / 408 / 5xx are", async () => {
    for (const status of [400, 403, 413]) {
      const s = mem();
      const looks = deviceLookStore(() => s);
      looks.set(A);
      expect(await saveFromEditor(B, deps(s, async () => ({ kind: "failed", status })))).toEqual({ kind: "refused" });
      expect(looks.pending()).toBeNull();
      expect(looks.get()).toBe(A);
    }
    for (const status of [0, 401, 408, 500, 503]) {
      const s = mem();
      expect(await saveFromEditor(B, deps(s, async () => ({ kind: "failed", status })))).toEqual({ kind: "offline" });
      expect(deviceLookStore(() => s).pending()?.code).toBe(B);
    }
  });

  it("storage throws (private mode) → Done still saves to the server and still reports an offline save honestly; nothing throws", async () => {
    await expect(saveFromEditor(B, deps(blocked, async () => ({ kind: "saved", look: B })))).resolves.toEqual({ kind: "saved", look: B });
    await expect(saveFromEditor(B, deps(blocked, async () => ({ kind: "failed", status: 0 })))).resolves.toEqual({ kind: "offline" });
    const looks = deviceLookStore(() => blocked);
    expect(looks.get()).toBeUndefined();
    expect(looks.pending()).toBeNull();
  });
});

describe("the retry at the next start (AC 9; beat the rule 3, 4)", () => {
  it("a pending look is sent once when the server still has its base; then it is synced", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(A);
    looks.savePending(B, 1);
    const call = vi.fn(async () => ({ kind: "saved", look: B }) as LookSaveCall);
    expect(await syncPendingLook(deps(s, call, { session: session(A) }))).toBe("synced");
    expect(call).toHaveBeenCalledWith(B, A); // review L2: the base travels, the server re-checks it
    expect(looks.pending()).toBeNull();
    expect(s.map.get(DEVICE_LOOK_KEY)).toBe(B);
    expect(await syncPendingLook(deps(s, call, { session: session(B) }))).toBe("none");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("another phone saved since (server look ≠ base) → the server's newer look wins, nothing is sent", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(A);
    looks.savePending(B, 1);
    const call = vi.fn(async () => ({ kind: "saved", look: B }) as LookSaveCall);
    expect(await syncPendingLook(deps(s, call, { session: session(C) }))).toBe("server_won");
    expect(call).not.toHaveBeenCalled();
    expect(looks.get()).toBe(C);
    expect(looks.pending()).toBeNull();
  });

  it("review L2: the server answers stale (another phone saved between the session read and the send) → its look wins", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(A);
    looks.savePending(B, 1);
    expect(await syncPendingLook(deps(s, async () => ({ kind: "saved", look: C, stale: true }), { session: session(A) }))).toBe("server_won");
    expect(looks.get()).toBe(C);
    expect(looks.pending()).toBeNull();
  });

  it("review L4: a pending look the server refuses for good (400) is dropped, not retried at every start", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(A);
    looks.savePending(B, 1);
    expect(await syncPendingLook(deps(s, async () => ({ kind: "failed", status: 400 }), { session: session(A) }))).toBe("offline");
    expect(looks.pending()).toBeNull();
    expect(looks.get()).toBe(A);
  });

  it("a session answer while pending: kept if the server still has the base, replaced if it moved (deviceLook.set)", () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.set(A);
    looks.savePending(B, 1);
    looks.set(A);
    expect(looks.get()).toBe(B);
    looks.set(C);
    expect(looks.get()).toBe(C);
    expect(looks.pending()).toBeNull();
  });

  it("no session / a failed progress read / a failed send → stays pending for the next start; a new guest's base is null", async () => {
    const s = mem();
    const looks = deviceLookStore(() => s);
    looks.savePending(B, 1); // beat the rule 5: a brand-new guest before any session answer
    expect(looks.pending()?.base).toBeNull();
    const call = vi.fn(async () => ({ kind: "failed", status: 0 }) as LookSaveCall);
    expect(await syncPendingLook(deps(s, call, { session: (async () => null) as LookSaveDeps["session"] }))).toBe("offline");
    expect(await syncPendingLook(deps(s, call, { session: session(undefined) }))).toBe("offline");
    expect(call).not.toHaveBeenCalled();
    expect(await syncPendingLook(deps(s, call, { session: session(null) }))).toBe("offline");
    expect(call).toHaveBeenCalledWith(B, null);
    expect(looks.pending()?.code).toBe(B);
  });

  it("the start screen retries once per page load", async () => {
    forgetStartSync();
    const s = mem();
    deviceLookStore(() => s).savePending(B, 1);
    const call = vi.fn(async () => ({ kind: "failed", status: 0 }) as LookSaveCall);
    await syncPendingLookOnce(deps(s, call, { session: session(null) }));
    await syncPendingLookOnce(deps(s, call, { session: session(null) }));
    expect(call).toHaveBeenCalledTimes(1);
    forgetStartSync();
  });
});
