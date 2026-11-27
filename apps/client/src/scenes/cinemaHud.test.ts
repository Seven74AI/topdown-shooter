import { describe, expect, it } from "vitest";
import { barPx, cinemaTapPasses, filterHud } from "./cinemaHud";
import { HudButtons } from "../input/HudButtons";

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

  it("review L1: under the cinematic a tap on ☰ still opens the menu, every other HUD tap is dropped", () => {
    const b = new HudButtons();
    let menu = 0;
    let ready = 0;
    b.set({ id: "menu", x: 800, y: 10, w: 40, h: 40, visible: true }, () => menu++);
    b.set({ id: "ready", x: 600, y: 300, w: 120, h: 50, visible: true }, () => ready++);
    // The HudScene down handler: drop unless `cinemaTapPasses`, then the buttons press on touch-down.
    const down = (id: number, x: number, y: number) => {
      if (!cinemaTapPasses(true, b.hit(x, y, 844))) return;
      b.pointerDown(id, x, y, 844);
    };
    down(1, 820, 30);
    down(2, 650, 320);
    down(3, 100, 200);
    expect(menu).toBe(1);
    expect(ready).toBe(0);
    expect(cinemaTapPasses(false, "ready")).toBe(true);
    expect(cinemaTapPasses(false, null)).toBe(true);
    expect(cinemaTapPasses(true, null)).toBe(false);
  });

  it("8 % and 12 % bars at every target screen", () => {
    expect([320, 360, 390].map((h) => barPx(0.08, h))).toEqual([26, 29, 31]);
    expect([320, 360, 390].map((h) => barPx(0.12, h))).toEqual([38, 43, 47]);
    expect(barPx(-0.1, 390)).toBe(0);
  });
});
