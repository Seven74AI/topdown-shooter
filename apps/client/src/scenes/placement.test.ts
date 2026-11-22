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

describe("Placement (review H2: centred on the finger, corner on the 0.5 m lattice)", () => {
  it("starts centred ahead of the survivor; an unknown type does nothing", () => {
    const p = new Placement();
    expect(p.start(balance, "castle", 20, 16, 1, 0)).toBe(false);
    expect(p.active).toBe(false);
    expect(p.start(balance, WOOD, 20, 16, 0, -1, 3)).toBe(true);
    // centre (20, 14): [19, 21] × [13.75 → 14, 14.5] → corner (19, 13.75 rounded to 14) = lattice (38, 28 or 27.5 → 28)
    expect([p.active, p.gx, p.gy, p.rot, p.wave]).toEqual([true, 38, Math.round((16 - PREVIEW_AHEAD_M - 0.25) / 0.5), 0, 3]);
  });

  it("snaps a tap to the lattice corner that centres the box on it, and clamps to the wire's 0–255", () => {
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 1, 0);
    p.moveTo(11, 5.25);
    expect([p.gx, p.gy]).toEqual([20, 10]); // [10, 12] × [5, 5.5]
    p.moveTo(11.2, 5.4);
    expect([p.gx, p.gy]).toEqual([20, 10]); // the same lattice point
    p.moveTo(11.3, 5.6);
    expect([p.gx, p.gy]).toEqual([21, 11]);
    p.moveTo(-3, 999);
    expect([p.gx, p.gy]).toEqual([0, 255]);
    p.moveTo(Number.NaN, 2);
    expect([p.gx, p.gy]).toEqual([0, 255]);
  });

  it("rotates in 90° steps around the anchor point (0 → 1 → 2 → 3 → 0)", () => {
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 1, 0);
    p.moveTo(11, 6);
    const seen: number[][] = [[p.rot, p.gx, p.gy]];
    for (let i = 0; i < 4; i++) {
      p.rotate();
      seen.push([p.rot, p.gx, p.gy]);
    }
    // rot 0: [10, 12] × [5.5 or 6 …]; rot 1: [10.75 → 11, 11.5] × [5, 7]: both centred on (11, 6)
    expect(seen.map((r) => r[0])).toEqual([0, 1, 2, 3, 0]);
    expect(seen[1]).toEqual([1, 22, 10]);
    expect(seen[4]).toEqual(seen[0]);
  });

  it("✓ ends placement and returns the request once; ✕ ends it with nothing", () => {
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 1, 0);
    p.moveTo(31, 10.25);
    p.rotate();
    expect(p.confirm()).toEqual({ type: WOOD, gx: 62, gy: 19, rot: 1 });
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
    p.moveTo(1, 10.5); // next to the left edge's spawn point (0.5, 10.67): review L5
    expect(p.check(w, "p0")).toBe(false);
    p.moveTo(47.9, 26); // pressed against the right edge: clamped into the map, valid (H2: buildings touch edges)
    p.rotate();
    expect(p.check(w, "p0")).toBe(true);
    expect(p.gx).toBe(95);
    p.rotate();
    p.rotate();
    p.rotate();
    placeBuilding(w, "p0", { type: WOOD, gx: 58, gy: 10, rot: 0 }); // [29, 31] × [5, 5.5]
    p.moveTo(30, 5.25);
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
