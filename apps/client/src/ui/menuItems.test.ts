import { describe, expect, it } from "vitest";
import { MENU_ITEMS, visibleMenuItems } from "./menuItems";

describe("MENU_ITEMS (Story 2.11)", () => {
  it("Epic 2: Resume and Leave game, always both, in that order", () => {
    for (const online of [false, true]) {
      for (const isHost of [false, true]) {
        expect(visibleMenuItems({ online, isHost }).map((i) => i.id)).toEqual(["resume", "leave"]);
      }
    }
  });

  it("sends the state machine's actions", () => {
    expect(MENU_ITEMS.map((i) => i.action)).toEqual(["resume", "leave"]);
  });

  it("filters by visible(ctx), so host-only items slot in later", () => {
    const items = [...MENU_ITEMS, { id: "save", label: "Save and quit", action: "resume" as const, visible: (c: { online: boolean; isHost: boolean }) => c.online && c.isHost }];
    expect(visibleMenuItems({ online: true, isHost: true }, items).map((i) => i.id)).toEqual(["resume", "leave", "save"]);
    expect(visibleMenuItems({ online: true, isHost: false }, items).map((i) => i.id)).toEqual(["resume", "leave"]);
  });
});
