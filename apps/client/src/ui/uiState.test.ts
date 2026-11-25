import { describe, expect, it } from "vitest";
import { menuStep, playingScreen, resultsSub, resultsTitle, uiStore, type MenuAction, type MenuState } from "./uiState";

describe("resultsTitle / resultsSub (Stories 6.11, 6.12)", () => {
  it("\"Extracted\" / \"Lost in the city\" with the wave under it; a wipe before any vote: the wave reached", () => {
    expect(resultsTitle({ wave: 10, ending: "extracted" })).toBe("Extracted");
    expect(resultsSub({ wave: 10, ending: "extracted" })).toBe("Wave reached 10");
    expect(resultsTitle({ wave: 13, ending: "lost" })).toBe("Lost in the city");
    expect(resultsSub({ wave: 13, ending: "lost" })).toBe("Wave reached 13 · rewards after wave 10 lost");
    expect(resultsTitle({ wave: 3, ending: "wiped" })).toBe("Wave reached 3");
    expect(resultsSub({ wave: 3, ending: "wiped" })).toBe("");
  });
});

describe("uiStore", () => {
  it("notifies subscribers and routes requests", () => {
    const seen: string[] = [];
    const off = uiStore.subscribe((s) => seen.push(s.kind));
    uiStore.set({ kind: "results", wave: 3, rows: [], online: false, ending: "wiped", endless: false, seed: 5, dawnEndsAtMs: 0 });
    expect(uiStore.get()).toEqual({ kind: "results", wave: 3, rows: [], online: false, ending: "wiped", endless: false, seed: 5, dawnEndsAtMs: 0 });
    let restarted = 0;
    uiStore.handle("restart", () => restarted++);
    uiStore.request("restart");
    uiStore.handle("restart", undefined);
    uiStore.request("restart");
    off();
    uiStore.set(playingScreen(false));
    expect(seen).toEqual(["results"]);
    expect(restarted).toBe(1);
  });
});

describe("menuStep (Story 2.11)", () => {
  const run = (from: MenuState, ...actions: MenuAction[]) => {
    let s: MenuState | "left" = from;
    for (const a of actions) {
      if (s === "left") break;
      s = menuStep(s, a);
    }
    return s;
  };

  it("☰ / Esc opens and closes; Resume closes", () => {
    expect(menuStep("closed", "toggle")).toBe("open");
    expect(menuStep("open", "toggle")).toBe("closed");
    expect(menuStep("confirmLeave", "toggle")).toBe("closed"); // Esc closes the confirm step too
    expect(menuStep("open", "resume")).toBe("closed");
  });

  it("Leave game asks first; Cancel goes back to the menu", () => {
    expect(run("closed", "toggle", "leave")).toBe("confirmLeave");
    expect(run("closed", "toggle", "leave", "cancel")).toBe("open");
    expect(run("closed", "toggle", "leave", "confirm")).toBe("left");
  });

  it("leaves only from the confirm step", () => {
    expect(menuStep("closed", "confirm")).toBe("closed");
    expect(menuStep("open", "confirm")).toBe("open");
    expect(menuStep("closed", "leave")).toBe("closed");
    expect(menuStep("closed", "cancel")).toBe("closed");
    expect(menuStep("open", "cancel")).toBe("open");
  });
});
