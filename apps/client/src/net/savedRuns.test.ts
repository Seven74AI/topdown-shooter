import { describe, expect, it, vi } from "vitest";
import { guestTokenStore } from "./guestToken";
import { loadSavedRuns, savedAgo, savedRunTitle } from "./savedRuns";
import { JOIN_ERROR_TEXT, joinErrorText } from "./joinErrors";

/** Story 8.6 (AC 11, 12): the Saved games list and the resume refusals. */
const row = { id: "0f1e2d3c-4b5a-4968-8776-655443322110", district: "downtown", wave: 6, names: [{ name: "Theo", slot: 2 }, { name: "Ana", slot: 0 }, { name: "Bo", slot: 1 }], savedAt: "2026-11-23T10:00:00.000Z", expiresAt: "2026-11-30T10:00:00.000Z" };
const tokens = () => {
  let v: string | null = "a".repeat(32);
  return guestTokenStore(() => ({ getItem: () => v, setItem: (_k: string, x: string) => void (v = x), removeItem: () => void (v = null) }) as unknown as Storage);
};

describe("Story 8.6: Saved games", () => {
  it("posts the device token same-origin and reads at most 3 shape-checked rows", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify([row, { bad: 1 }, row, row, row]), { status: 200 }));
    const list = await loadSavedRuns({ fetch: fetch as unknown as typeof globalThis.fetch, url: () => "/api/saved-runs", tokens: tokens() });
    expect(list).toHaveLength(3);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/saved-runs");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(JSON.parse(String(init.body))).toEqual({ deviceToken: "a".repeat(32) });
  });

  it("a 503, a network error or garbage → null (Couldn't load saved games + Retry)", async () => {
    for (const f of [async () => new Response("", { status: 503 }), async () => Promise.reject(new Error("down")), async () => new Response("{}", { status: 200 })]) {
      expect(await loadSavedRuns({ fetch: f as unknown as typeof globalThis.fetch, url: () => "/x", tokens: tokens() })).toBeNull();
    }
  });

  it("the row text: district · wave · names in slot order; saved N ago", () => {
    expect(savedRunTitle(row)).toBe("Downtown · Wave 6 · Ana, Bo, Theo");
    const now = Date.parse("2026-11-25T10:00:00.000Z");
    expect(savedAgo(row.savedAt, now)).toBe("saved 2 days ago");
    expect(savedAgo("2026-11-25T09:00:00.000Z", now)).toBe("saved 1 hour ago");
    expect(savedAgo("2026-11-25T09:59:30.000Z", now)).toBe("saved just now");
    expect(savedAgo("2026-11-25T09:30:00.000Z", now)).toBe("saved 30 min ago");
  });

  it("resume refusals have their own words", () => {
    expect(joinErrorText({ code: 526, message: "save_busy" })).toBe("This run is already being played");
    expect(joinErrorText({ code: 526, message: "save_gone" })).toBe(JOIN_ERROR_TEXT.saveGone);
    expect(joinErrorText({ code: 526, message: "save_unavailable" })).toBe("Couldn't open the saved game");
  });
});
