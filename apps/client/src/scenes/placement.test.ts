import { describe, expect, it } from "vitest";
import { addPlayer, createWorld, loadBalance, placeBuilding, startBuild, startWave } from "@topdown/shared";
import { PREVIEW_AHEAD_M, Placement, placeRefusalText } from "./placement";

/** Story 3.4: placement mode on the device (snap, rotate, confirm/cancel, the shared check). */
const balance = loadBalance();
const WOOD = "wood_barricade";

function world() {
  const w = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(w, "p0", 20, 16);
  startBuild(w);
  return w;
}

describe("Placement", () => {
  it("starts on the grid point ahead of the survivor; an unknown type does nothing", () => {
    const p = new Placement();
    expect(p.start(balance, "castle", 20, 16, 1, 0)).toBe(false);
    expect(p.active).toBe(false);
    expect(p.start(balance, WOOD, 20.3, 16.2, 0, -1)).toBe(true);
    expect([p.active, p.gx, p.gy, p.rot]).toEqual([true, 20, Math.round(16.2 - PREVIEW_AHEAD_M), 0]);
  });

  it("snaps taps to the nearest 1 m grid point and clamps to the wire's 0–255", () => {
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 1, 0);
    p.moveTo(7.49, 3.5);
    expect([p.gx, p.gy]).toEqual([7, 4]);
    p.moveTo(-3, 999);
    expect([p.gx, p.gy]).toEqual([0, 255]);
    p.moveTo(Number.NaN, 2);
    expect([p.gx, p.gy]).toEqual([0, 255]);
  });

  it("rotates in 90° steps (0 → 1 → 2 → 3 → 0)", () => {
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 1, 0);
    const seen = [p.rot];
    for (let i = 0; i < 4; i++) {
      p.rotate();
      seen.push(p.rot);
    }
    expect(seen).toEqual([0, 1, 2, 3, 0]);
  });

  it("✓ ends placement and returns the request once; ✕ ends it with nothing", () => {
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 1, 0);
    p.moveTo(30, 10);
    p.rotate();
    expect(p.confirm()).toEqual({ type: WOOD, gx: 30, gy: 10, rot: 1 });
    expect(p.active).toBe(false);
    expect(p.confirm()).toBeNull();
    p.start(balance, WOOD, 20, 16, 1, 0);
    p.cancel();
    expect(p.active).toBe(false);
    expect(p.confirm()).toBeNull();
  });

  it("green exactly when the shared rules accept it: on me, on a building, at the edge, cap, money, wave", () => {
    const w = world();
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 1, 0);
    expect(p.check(w, "p0")).toBe(true);
    p.moveTo(20, 16);
    expect(p.check(w, "p0")).toBe(false);
    expect(p.error).toBe("blocked");
    p.moveTo(0, 5);
    expect(p.check(w, "p0")).toBe(false);
    placeBuilding(w, "p0", { type: WOOD, gx: 30, gy: 5, rot: 0 });
    p.moveTo(30, 5);
    p.rotate();
    expect(p.check(w, "p0")).toBe(false);
    p.moveTo(30, 10);
    expect(p.check(w, "p0")).toBe(true);
    const me = w.players.get("p0");
    if (me) me.wallet = 10;
    expect(p.check(w, "p0")).toBe(false);
    expect(p.error).toBe("money");
    startWave(w);
    expect(p.check(w, "p0")).toBe(false);
    expect(p.error).toBe("not_build_phase");
  });
});

describe("placeRefusalText", () => {
  it("says what Story 3.3's contract says", () => {
    expect(placeRefusalText("blocked", balance)).toBe("Can't build here");
    expect(placeRefusalText("limit", balance)).toBe("Building limit reached (6)");
    expect(placeRefusalText("money", balance)).toBe("Not enough money");
  });
});
