import { describe, expect, it } from "vitest";
import { uiStore } from "./uiState";

describe("uiStore", () => {
  it("notifies subscribers and routes requests", () => {
    const seen: string[] = [];
    const off = uiStore.subscribe((s) => seen.push(s.kind));
    uiStore.set({ kind: "results", wave: 3, rows: [], online: false });
    expect(uiStore.get()).toEqual({ kind: "results", wave: 3, rows: [], online: false });
    let restarted = 0;
    uiStore.handle("restart", () => restarted++);
    uiStore.request("restart");
    uiStore.handle("restart", undefined);
    uiStore.request("restart");
    off();
    uiStore.set({ kind: "playing" });
    expect(seen).toEqual(["results"]);
    expect(restarted).toBe(1);
  });
});
