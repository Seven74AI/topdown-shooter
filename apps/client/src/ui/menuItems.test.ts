import { describe, expect, it } from "vitest";
import { MENU_ITEMS, SAVE_TEXT, canRemoveIn, canSaveIn, menuRemoveTarget, removeConfirmText, visibleMenuItems } from "./menuItems";
import { menuStep } from "./uiState";

describe("MENU_ITEMS (Story 2.11)", () => {
  it("Epic 2: Resume, Settings and Leave game, always, in that order (Story 8.3: Players after Resume for an online host)", () => {
    for (const online of [false, true]) {
      for (const isHost of [false, true]) {
        const ids = online && isHost ? ["resume", "players", "settings", "save", "leave"] : ["resume", "settings", "leave"]; // Story 8.5: + Save and quit
        expect(visibleMenuItems({ online, isHost }).map((i) => i.id)).toEqual(ids);
      }
    }
  });

  it("sends the state machine's actions", () => {
    expect(MENU_ITEMS.map((i) => i.action)).toEqual(["resume", "players", "settings", "save", "leave"]);
  });

  it("filters by visible(ctx), so host-only items slot in later", () => {
    const items = [...MENU_ITEMS, { id: "extra", label: "Extra", action: "resume" as const, visible: (c: { online: boolean; isHost: boolean }) => c.online && c.isHost }];
    expect(visibleMenuItems({ online: true, isHost: true }, items).map((i) => i.id)).toEqual(["resume", "players", "settings", "save", "leave", "extra"]);
    expect(visibleMenuItems({ online: true, isHost: false }, items).map((i) => i.id)).toEqual(["resume", "settings", "leave"]);
  });

  it("Story 8.3: the confirm text, Remove only in the lobby and build phases", () => {
    expect(removeConfirmText("Bo")).toBe("Remove Bo from this run? They can't come back.");
    expect(canRemoveIn("lobby")).toBe(true);
    expect(canRemoveIn("build")).toBe(true);
    for (const p of ["wave", "vote", "results"]) expect(canRemoveIn(p)).toBe(false);
    menuRemoveTarget.set({ playerId: "p1", name: "Bo" });
    expect(menuRemoveTarget.get()).toEqual({ playerId: "p1", name: "Bo" });
    menuRemoveTarget.set(null);
  });
});

describe("Story 8.5: Save and quit (AC 10, S7)", () => {
  const save = MENU_ITEMS.find((i) => i.id === "save")!;
  it("host only and online only; enabled in a build phase or the vote, greyed with the note during a wave", () => {
    expect(save.visible({ online: true, isHost: true })).toBe(true);
    expect(save.visible({ online: true, isHost: false })).toBe(false);
    expect(save.visible({ online: false, isHost: true })).toBe(false);
    for (const phase of ["build", "vote"]) expect(save.enabled?.({ online: true, isHost: true, phase })).toBe(true);
    for (const phase of ["wave", "results", "lobby"]) expect(save.enabled?.({ online: true, isHost: true, phase })).toBe(false);
    expect(save.disabledNote).toBe("You can save during the build phase");
    expect(canSaveIn("wave")).toBe(false);
  });
  it("asks first: open → confirmSave; Cancel → open; the texts", () => {
    expect(menuStep("open", "save")).toBe("confirmSave");
    expect(menuStep("confirmSave", "cancel")).toBe("open");
    expect(menuStep("confirmSave", "toggle")).toBe("closed");
    expect(menuStep("closed", "save")).toBe("closed");
    expect(SAVE_TEXT.confirm).toBe("Save and quit? The run ends for everyone tonight. Anyone from this run can resume it for 7 days.");
    expect(SAVE_TEXT.failed).toBe("Couldn't save the run. Try again.");
    expect(SAVE_TEXT.saving).toBe("Saving…");
  });
});
