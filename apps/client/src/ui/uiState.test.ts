import { describe, expect, it } from "vitest";
import { menuStep, playingScreen, resultsTitle, uiStore, type MenuAction, type MenuState } from "./uiState";

describe("resultsTitle (Story 3.10)", () => {
  it("is 'You held out!' after the last wave, else the wave reached", () => {
    expect(resultsTitle({ wave: 5, heldOut: true })).toBe("You held out!");
    expect(resultsTitle({ wave: 3, heldOut: false })).toBe("Wave reached 3");
  });
});

describe("uiStore", () => {
  it("notifies subscribers and routes requests", () => {
    const seen: string[] = [];
    const off = uiStore.subscribe((s) => seen.push(s.kind));
    uiStore.set({ kind: "results", wave: 3, rows: [], online: false, heldOut: false });
    expect(uiStore.get()).toEqual({ kind: "results", wave: 3, rows: [], online: false, heldOut: false });
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
