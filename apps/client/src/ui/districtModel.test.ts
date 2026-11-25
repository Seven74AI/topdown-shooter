import { describe, expect, it } from "vitest";
import { lobbyStore } from "../net/lobbyStore";
import { FakeRoom } from "../net/fakeRoom";
import { C2S } from "@topdown/shared";
import { DISTRICT_LOCKED_TEXT, DISTRICT_SELECTED_TEXT, DISTRICT_SOON_TEXT, districtCards, districtResetText } from "./districtModel";
import { DISTRICT_SHEET_SLOTS, lobbyButtons, lobbyLayout } from "./lobbyLayout";

/** Story 7.7 (R2, R4, R5, R3; DP2): the lobby's district cards and sheet. */
describe("Story 7.7: district cards", () => {
  it("nobody has District 2: Downtown selected, District 2 locked with how to get it", () => {
    expect(districtCards("downtown", 0b01, true).map((c) => [c.id, c.state, c.line, c.pickable])).toEqual([
      ["downtown", "selected", DISTRICT_SELECTED_TEXT, false],
      ["district_2", "locked", DISTRICT_LOCKED_TEXT, false],
    ]);
  });

  it("someone here has it: 'Unlocked · coming soon' in v1 (R5), never pickable — for the host or anyone", () => {
    for (const host of [true, false]) {
      const [, d2] = districtCards("downtown", 0b11, host);
      expect(d2).toMatchObject({ state: "soon", line: DISTRICT_SOON_TEXT, pickable: false });
    }
  });

  it("R3's notice text", () => {
    expect(districtResetText("District 2")).toBe("Back to Downtown: nobody here has District 2");
  });

  it("the host's tap sends lobby.district { id }", () => {
    const room = new FakeRoom();
    (lobbyStore as unknown as { room: unknown }).room = room;
    lobbyStore.pickDistrict("downtown");
    expect(room.sent).toContainEqual({ type: C2S.LOBBY_DISTRICT, message: { id: "downtown" } });
    (lobbyStore as unknown as { room: unknown }).room = null;
  });

  it("R9: the sheet's cards sit inside the safe area, don't overlap, are ≥ 44 px; the district line is a ≥ 44 px tap target", () => {
    for (const [w, h] of [
      [568, 320],
      [640, 360],
      [800, 360],
      [844, 390],
    ] as const) {
      const inset = { left: 44, right: 44, top: 0, bottom: 21 };
      const L = lobbyLayout(w, h, inset);
      expect(L.sheet.cards).toHaveLength(DISTRICT_SHEET_SLOTS);
      for (const c of L.sheet.cards) {
        expect(c.x).toBeGreaterThanOrEqual(inset.left);
        expect(c.x + c.w).toBeLessThanOrEqual(w - inset.right);
        expect(c.y + c.h).toBeLessThanOrEqual(h - inset.bottom);
        expect(Math.min(c.w, c.h)).toBeGreaterThanOrEqual(44);
        expect(c.x).toBeGreaterThanOrEqual(L.sheet.panel.x);
        expect(c.x + c.w).toBeLessThanOrEqual(L.sheet.panel.x + L.sheet.panel.w);
      }
      for (let i = 1; i < L.sheet.cards.length; i++) expect(L.sheet.cards[i]!.x).toBeGreaterThanOrEqual(L.sheet.cards[i - 1]!.x + L.sheet.cards[i - 1]!.w);
      expect(lobbyButtons(L)).toContain(L.district);
      expect(L.district.h).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("Story 7.7 AC 7 (D2): the hub's Districts line", () => {
  it("unlocked · coming soon, or how to unlock it; nothing before progress is known", async () => {
    const { districtsLine } = await import("./hubModel");
    expect(districtsLine(null)).toBe("");
    expect(districtsLine({ supplies: 0, lifetimeSupplies: 0, unlocks: [] })).toBe("District 2: extract from Downtown to unlock");
    expect(districtsLine({ supplies: 0, lifetimeSupplies: 0, unlocks: [], districts: ["district_2"] })).toBe("District 2: unlocked · coming soon");
  });
});
