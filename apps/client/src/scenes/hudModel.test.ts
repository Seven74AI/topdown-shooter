import { describe, expect, it } from "vitest";
import { createHudModel, hudTierMark } from "./hudModel";

describe("HUD tier mark (Story 5.1 AC 6)", () => {
  it("level I shows no mark; II–IV show their roman numeral (the U1 plate)", () => {
    expect([1, 2, 3, 4].map(hudTierMark)).toEqual(["", "II", "III", "IV"]);
    expect([0, 5, -1, 2.5].map(hudTierMark)).toEqual(["", "", "", ""]);
    const m = createHudModel();
    expect([m.weaponLevel, m.otherWeaponLevel]).toEqual([1, 1]); // a fresh HUD: no marks
  });
});
