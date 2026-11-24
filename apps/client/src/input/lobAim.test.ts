import { describe, expect, it } from "vitest";
import { MUZZLE_OFFSET_M, loadBalance, lobAimLength, type LauncherStats } from "@topdown/shared";
import { NEUTRAL_INPUT } from "@topdown/shared";
import { InputRouter, type MutablePlayerInput } from "./InputRouter";
import { TouchSticks } from "./TouchSticks";
import { applyLobLength, mouseLobDistance, touchLobDistance } from "./lobAim";

/** Story 5.5 (FR-A, D1, AC 4): the aim length carries the lob distance, only with a launcher in hand. */
const balance = loadBalance();
const GL = balance.weapons.grenade_launcher as LauncherStats;
const R = balance.player.radiusM;

describe("lob aim (Story 5.5)", () => {
  it("mouse: the cursor's distance from the muzzle", () => {
    expect(mouseLobDistance(10, 10, 18, 10, R)).toBeCloseTo(8 - R - MUZZLE_OFFSET_M, 12);
    expect(mouseLobDistance(0, 0, 3, 4, R)).toBeCloseTo(5 - R - MUZZLE_OFFSET_M, 12);
  });

  it("touch (D1): the dead zone's edge is the shortest lob, the rim the longest, linear between", () => {
    expect(touchLobDistance(GL, 0.3, 0.3)).toBeCloseTo(GL.minLobM, 12);
    expect(touchLobDistance(GL, 0.1, 0.3)).toBeCloseTo(GL.minLobM, 12); // below the dead zone (aim only)
    expect(touchLobDistance(GL, 1, 0.3)).toBeCloseTo(GL.lobRangeM, 12);
    expect(touchLobDistance(GL, 0.65, 0.3)).toBeCloseTo((GL.minLobM + GL.lobRangeM) / 2, 12);
  });

  it("scales a unit aim to the lob length, in place; a zero aim stays zero", () => {
    const a = { aimX: 0.6, aimY: 0.8 };
    applyLobLength(a, GL, 6);
    expect(Math.hypot(a.aimX, a.aimY)).toBeCloseTo(lobAimLength(GL, 6), 12);
    expect(a.aimX / a.aimY).toBeCloseTo(0.75, 12);
    const z = { aimX: 0, aimY: 0 };
    applyLobLength(z, GL, 6);
    expect(z).toEqual({ aimX: 0, aimY: 0 });
  });

  it("InputRouter: mouse aim length = cursor distance with the launcher; unit aim without", () => {
    const r = new InputRouter(new TouchSticks(100, 0.1, 0.3));
    r.pointerDown(1, 500, 300, false, 0, false, 1000); // the mouse takes over
    const out = { ...NEUTRAL_INPUT } as MutablePlayerInput;
    r.build(out, false, 10, 10, 16, 10, GL, R);
    expect(Math.hypot(out.aimX, out.aimY)).toBeCloseTo(lobAimLength(GL, 6 - R - MUZZLE_OFFSET_M), 12);
    r.build(out, false, 10, 10, 16, 10, null, R);
    expect(Math.hypot(out.aimX, out.aimY)).toBeCloseTo(1, 12); // M8 guard: other weapons keep unit aim
    r.build(out, false, 10, 10, 40, 10, GL, R);
    expect(Math.hypot(out.aimX, out.aimY)).toBe(1); // past 12 m: the full length
  });

  it("InputRouter: touch aim length from the stick's deflection past the fire dead zone", () => {
    const sticks = new TouchSticks(100, 0.1, 0.3);
    const r = new InputRouter(sticks);
    r.pointerDown(2, 600, 200, true, 0, false, 1000);
    sticks.pointerMove(2, 665, 200); // 65 % deflection: half way from 3 to 12 m
    const out = { ...NEUTRAL_INPUT } as MutablePlayerInput;
    r.build(out, false, 0, 0, Number.NaN, Number.NaN, GL, R);
    expect(out.fire).toBe(true);
    expect(Math.hypot(out.aimX, out.aimY)).toBeCloseTo(lobAimLength(GL, 7.5), 12);
    r.build(out, false, 0, 0, Number.NaN, Number.NaN, null, R);
    expect(Math.hypot(out.aimX, out.aimY)).toBeCloseTo(1, 12);
  });

  it("Story 5.12 review L5: the input carrying a throw encodes the THROW's range (not the launcher's) and fires nothing", () => {
    const THROW = { minLobM: 2, lobRangeM: 8 };
    const r = new InputRouter(new TouchSticks(100, 0.1, 0.3));
    r.pointerDown(1, 500, 300, false, 0, false, 1000);
    r.kbm.leftButton = true;
    const out = { ...NEUTRAL_INPUT } as MutablePlayerInput;
    r.build(out, false, 10, 10, 16, 10, GL, R, false, THROW); // no tap: the launcher's encoding, firing
    expect(Math.hypot(out.aimX, out.aimY)).toBeCloseTo(lobAimLength(GL, 6 - R - MUZZLE_OFFSET_M), 12);
    expect(out.fire).toBe(true);
    r.build(out, false, 10, 10, 16, 10, GL, R, true, THROW); // the tap's input
    expect(out.consumable).toBe(true);
    expect(Math.hypot(out.aimX, out.aimY)).toBeCloseTo(lobAimLength(THROW, 6 - R - MUZZLE_OFFSET_M), 12);
    expect(out.fire).toBe(false);
  });
});
