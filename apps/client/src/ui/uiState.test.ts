import { describe, expect, it } from "vitest";
import { uiStore } from "./uiState";

describe("uiStore", () => {
  it("notifies subscribers and routes requests", () => {
    const seen: string[] = [];
    const off = uiStore.subscribe((s) => seen.push(s.kind));
    uiStore.set({ kind: "gameOver", waveReached: 3 });
    expect(uiStore.get()).toEqual({ kind: "gameOver", waveReached: 3 });
    let restarted = 0;
    uiStore.handle("restart", () => restarted++);
    uiStore.request("restart");
    uiStore.handle("restart", undefined);
    uiStore.request("restart");
    off();
    uiStore.set({ kind: "playing" });
    expect(seen).toEqual(["gameOver"]);
    expect(restarted).toBe(1);
  });
});
