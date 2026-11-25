import { describe, expect, it } from "vitest";
import { MENU_ITEMS, canRemoveIn, menuRemoveTarget, removeConfirmText, visibleMenuItems } from "./menuItems";

describe("MENU_ITEMS (Story 2.11)", () => {
  it("Epic 2: Resume and Leave game, always both, in that order (Story 8.3: Players between them for an online host)", () => {
    for (const online of [false, true]) {
      for (const isHost of [false, true]) {
        const ids = online && isHost ? ["resume", "players", "leave"] : ["resume", "leave"];
        expect(visibleMenuItems({ online, isHost }).map((i) => i.id)).toEqual(ids);
      }
    }
  });

  it("sends the state machine's actions", () => {
    expect(MENU_ITEMS.map((i) => i.action)).toEqual(["resume", "players", "leave"]);
  });

  it("filters by visible(ctx), so host-only items slot in later", () => {
    const items = [...MENU_ITEMS, { id: "save", label: "Save and quit", action: "resume" as const, visible: (c: { online: boolean; isHost: boolean }) => c.online && c.isHost }];
    expect(visibleMenuItems({ online: true, isHost: true }, items).map((i) => i.id)).toEqual(["resume", "players", "leave", "save"]);
    expect(visibleMenuItems({ online: true, isHost: false }, items).map((i) => i.id)).toEqual(["resume", "leave"]);
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
