import { describe, expect, it } from "vitest";
import { barPx, filterHud } from "./cinemaHud";

/** Story 12.3 (AC 2, 3, 11): hiding the HUD under the cinematic; the bars' pixel heights. */
describe("cinemaHud", () => {
  it("hides every HUD object but the kept ones, and only touches its camera's bit", () => {
    const a = { cameraFilter: 0 };
    const b = { cameraFilter: 4 };
    const bars = { cameraFilter: 0 };
    filterHud([a, b, bars], [bars], 1, true);
    expect(a.cameraFilter).toBe(1);
    expect(b.cameraFilter).toBe(5);
    expect(bars.cameraFilter).toBe(0);
    filterHud([a, b, bars], [bars], 1, false);
    expect(a.cameraFilter).toBe(0);
    expect(b.cameraFilter).toBe(4);
  });

  it("8 % and 12 % bars at every target screen", () => {
    expect([320, 360, 390].map((h) => barPx(0.08, h))).toEqual([26, 29, 31]);
    expect([320, 360, 390].map((h) => barPx(0.12, h))).toEqual([38, 43, 47]);
    expect(barPx(-0.1, 390)).toBe(0);
  });
});
