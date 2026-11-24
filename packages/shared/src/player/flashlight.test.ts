import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance } from "../config/balance";
import { gearBit } from "../economy/gear";
import { flashlightOf, inFlashlightCone } from "./flashlight";

/** Story 6.3 (F3): the blackout flashlight cone. */
const balance = loadBalance();
const TACT = gearBit(balance, "tactical_flashlight");

const at = (deg: number, r: number): [number, number] => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];

describe("Story 6.3 flashlight (F3)", () => {
  it("the free flashlight is 60°, 8 m; the Tactical flashlight 80°, 12 m", () => {
    expect(flashlightOf(balance, 0)).toMatchObject({ coneDeg: 60, rangeM: 8 });
    expect(flashlightOf(balance, 0).halfAngleRad).toBeCloseTo(Math.PI / 6, 12);
    expect(flashlightOf(balance, TACT)).toMatchObject({ coneDeg: 80, rangeM: 12 });
    // other gear changes nothing
    expect(flashlightOf(balance, gearBit(balance, "running_shoes"))).toBe(flashlightOf(balance, 0));
  });

  it("cached per balance: the same object each call (no allocation)", () => {
    expect(flashlightOf(balance, TACT)).toBe(flashlightOf(balance, TACT | gearBit(balance, "revive_kit")));
    expect(flashlightOf(balance, 0)).toBe(flashlightOf(balance, 0));
  });

  it("edge: 29.9° in, 30.1° out (free cone, either side)", () => {
    const c = flashlightOf(balance, 0);
    for (const sign of [1, -1]) {
      expect(inFlashlightCone(0, 0, 1, 0, c, ...at(sign * 29.9, 5))).toBe(true);
      expect(inFlashlightCone(0, 0, 1, 0, c, ...at(sign * 30.1, 5))).toBe(false);
    }
    // a facing that is not unit length works the same
    expect(inFlashlightCone(0, 0, 3, 0, c, ...at(29.9, 5))).toBe(true);
    expect(inFlashlightCone(0, 0, 0.2, 0, c, ...at(30.1, 5))).toBe(false);
  });

  it("8.0 m in, 8.01 m out; behind you out; the Tactical cone reaches 12 m and 39.9°", () => {
    const c = flashlightOf(balance, 0);
    expect(inFlashlightCone(10, 10, 0, 1, c, 10, 18)).toBe(true);
    expect(inFlashlightCone(10, 10, 0, 1, c, 10, 18.01)).toBe(false);
    expect(inFlashlightCone(10, 10, 0, 1, c, 10, 9)).toBe(false);
    const t = flashlightOf(balance, TACT);
    expect(inFlashlightCone(0, 0, 1, 0, t, 12, 0)).toBe(true);
    expect(inFlashlightCone(0, 0, 1, 0, t, ...at(39.9, 11))).toBe(true);
    expect(inFlashlightCone(0, 0, 1, 0, t, ...at(40.1, 11))).toBe(false);
  });

  it("a gear item with a narrower cone never replaces a wider one (the widest owned wins)", () => {
    const raw = bundledBalanceFiles() as unknown as { gear: { items: Record<string, Record<string, unknown>> } };
    (raw.gear.items.running_shoes as Record<string, unknown>).coneDeg = 40;
    (raw.gear.items.running_shoes as Record<string, unknown>).rangeM = 20;
    const b = loadBalance(raw as never);
    const both = gearBit(b, "running_shoes") | gearBit(b, "tactical_flashlight");
    expect(flashlightOf(b, both)).toMatchObject({ coneDeg: 80, rangeM: 12 });
    expect(flashlightOf(b, gearBit(b, "running_shoes"))).toMatchObject({ coneDeg: 60, rangeM: 8 });
  });
});
