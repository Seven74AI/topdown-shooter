import { describe, expect, it } from "vitest";
import { createHudModel, hudTierMark, waveLine } from "./hudModel";

describe("HUD tier mark (Story 5.1 AC 6)", () => {
  it("level I shows no mark; II–IV show their roman numeral (the U1 plate)", () => {
    expect([1, 2, 3, 4].map(hudTierMark)).toEqual(["", "II", "III", "IV"]);
    expect([0, 5, -1, 2.5].map(hudTierMark)).toEqual(["", "", "", ""]);
    const m = createHudModel();
    expect([m.weaponLevel, m.otherWeaponLevel]).toEqual([1, 1]); // a fresh HUD: no marks
  });
});

describe("waveLine (Stories 3.1, 6.11, 6.12)", () => {
  it("build countdown, wave + zombies, the Endless tag, the vote", () => {
    const m = { wave: 3, remaining: 47, buildSecs: -1, endless: false, voting: false };
    expect(waveLine(m)).toBe("Wave 3   ·   Zombies 47");
    expect(waveLine({ ...m, buildSecs: 22 })).toBe("Wave 4 in 22 s");
    expect(waveLine({ ...m, wave: 13, endless: true })).toBe("Wave 13 · Endless · Zombies 47");
    expect(waveLine({ ...m, wave: 13, endless: true, buildSecs: 9 })).toBe("Wave 14 · Endless · 9 s");
    expect(waveLine({ ...m, wave: 10, voting: true })).toBe("Wave 10 · Evac vote");
    expect(waveLine({ ...m, wave: 10, voting: true, extracting: true })).toBe("Wave 10 · Extraction"); // Story 12.2
    expect(waveLine({ ...m, wave: 10, voting: true, extracting: true }, true)).toBe("Extraction");
    expect(waveLine({ ...m, wave: 0 })).toBe("Get ready");
  });
});
