import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, addPlayer, buildingStats, createWorld, footprint, footprintH, footprintW, loadBalance, placeBuilding, startBuild, startWave, type PlaceError, type PlaceRequest } from "@topdown/shared";
import { Placement, autoRot, carryDistance, placeRefusalText, snapAxis, stepPlacement, type PlacementFrame, type PlacementHud } from "./placement";
import type { MutablePlayerInput } from "../input/InputRouter";

/** Story 3.4: placement mode on the device; Story 5.15: carried ghost (offset, auto-rotate, hysteresis, lock), confirm/cancel, the shared check. */
const balance = loadBalance();
const WOOD = "wood_barricade";

function world() {
  const w = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(w, "p0", 20, 16);
  startBuild(w);
  return w;
}

const BODY = balance.player.radiusM;
const GAP = balance.controls.build.carryGapM;

/** The snapped ghost's box in metres. */
function box(p: Placement) {
  const s = buildingStats(balance, p.type);
  if (!s) throw new Error("type");
  return footprint(s, p.gx, p.gy, p.rot, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
}

/** Distance from (x, y) to the nearest point of the ghost's box. */
function gapTo(p: Placement, x: number, y: number): number {
  const b = box(p);
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dy = Math.max(b.minY - y, 0, y - b.maxY);
  return Math.hypot(dx, dy);
}

describe("Story 5.15: carry the ghost (AC 3–7, 11)", () => {
  it("carry distance: barricade across the path 1.65 m, turret 1.9 m, spike trap 2.4 m, mine 1.65 m", () => {
    const d = (type: string, rot: number) => {
      const s = buildingStats(balance, type);
      if (!s) throw new Error(type);
      return carryDistance(0, -1, footprintW(s, rot), footprintH(s, rot), BODY, GAP);
    };
    expect(d(WOOD, 2)).toBeCloseTo(1.65, 9);
    expect(d("auto_turret", 0)).toBeCloseTo(1.9, 9);
    expect(d("spike_trap", 0)).toBeCloseTo(2.4, 9);
    expect(d("mine", 0)).toBeCloseTo(1.65, 9);
    // diagonal: the box's support along the facing, so a 1 × 1 turret at 45° is 0.4 + 1 + 0.707
    expect(carryDistance(Math.SQRT1_2, Math.SQRT1_2, 1, 1, BODY, GAP)).toBeCloseTo(1.4 + Math.SQRT1_2, 9);
  });

  it("starts ahead of the survivor along its facing, snapped to the lattice; an unknown type does nothing", () => {
    const p = new Placement();
    expect(p.start(balance, "castle", 20, 16, 1, 0)).toBe(false);
    expect(p.active).toBe(false);
    expect(p.start(balance, WOOD, 20, 16, 0, -1, 3)).toBe(true);
    // facing north: rot 2 (struts toward me), centre (20, 14.35) → corner (19, 14.1) → lattice (38, 28)
    expect([p.active, p.gx, p.gy, p.rot, p.wave, p.locked]).toEqual([true, 38, 28, 2, 3, false]);
    expect(gapTo(p, 20, 16) - BODY).toBeCloseTo(1.1, 9); // near edge 14.5: 1.1 m past my body (snap +0.1)
    for (const [type, dist] of [["auto_turret", 1.9], ["spike_trap", 2.4], ["mine", 1.65]] as const) {
      p.start(balance, type, 20, 16, 1, 0);
      const b = box(p);
      expect(Math.abs((b.minX + b.maxX) / 2 - (20 + dist))).toBeLessThanOrEqual(0.25);
      expect(Math.abs((b.minY + b.maxY) / 2 - 16)).toBeLessThanOrEqual(0.25); // a 0.5 m mine sits half a cell off
      expect(p.rot).toBe(0); // square footprints never auto-rotate
    }
  });

  it("follows my survivor as it walks; at rest the last facing stays", () => {
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 1, 0); // started facing east
    p.carry(20, 12, 0, -1); // walked 4 m north
    expect([p.gx, p.gy, p.rot]).toEqual([38, 20, 2]);
    p.carry(20, 12, 0, 0); // stopped: still facing north (not back to the start's east)
    expect([p.facingX, p.facingY]).toEqual([0, -1]);
    expect([p.gx, p.gy, p.rot]).toEqual([38, 20, 2]);
    p.carry(22, 12, 1, 0); // turned east: across the path, struts west
    expect(p.rot).toBe(3);
    expect([p.facingX, p.facingY]).toEqual([1, 0]);
    const at = [p.gx, p.gy];
    p.carry(22, 12, 0, 0); // let go of the stick
    expect([p.gx, p.gy, p.rot]).toEqual([...at, 3]);
    expect([p.facingX, p.facingY]).toEqual([1, 0]);
  });

  it("auto-rotate: long side across the facing, struts on my side (N → 2, S → 0, E → 3, W → 1)", () => {
    const p = new Placement();
    const rots = ([[0, -1], [0, 1], [1, 0], [-1, 0]] as const).map(([fx, fy]) => {
      p.start(balance, WOOD, 20, 16, fx, fy);
      return p.rot;
    });
    expect(rots).toEqual([2, 0, 3, 1]);
  });

  it("auto-rotate switches axis only 10° past a diagonal (35° / 55° from east-west)", () => {
    const at = (deg: number) => [Math.cos(deg * (Math.PI / 180)), -Math.sin(deg * (Math.PI / 180))] as const;
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 0, -1); // north/south
    p.carry(20, 16, ...at(36));
    expect(p.rot).toBe(2);
    p.carry(20, 16, ...at(34));
    expect(p.rot).toBe(3); // now east/west (facing east, struts west)
    p.carry(20, 16, ...at(54));
    expect(p.rot).toBe(3);
    p.carry(20, 16, ...at(56));
    expect(p.rot).toBe(2);
    expect(autoRot(1, -1, null, 10) & 3).toBe(2); // exactly diagonal, fresh: north/south
  });

  it("snap hysteresis: the index changes only 0.1 m past the half-cell boundary", () => {
    expect(snapAxis(5.34, 10, 0.1)).toBe(10); // 0.09 past 5.25
    expect(snapAxis(5.36, 10, 0.1)).toBe(11); // 0.11 past
    expect(snapAxis(5.16, 11, 0.1)).toBe(11);
    expect(snapAxis(5.14, 11, 0.1)).toBe(10);
    expect(snapAxis(5.3, -1, 0.1)).toBe(11); // fresh: nearest
    const p = new Placement();
    p.start(balance, "auto_turret", 20, 16, 1, 0); // centre x 21.9 → corner 21.4 → 43
    expect(p.gx).toBe(43);
    p.carry(20.2, 16, 1, 0); // corner 21.6: 0.1 past 21.5 → kept... at exactly the edge
    expect(p.gx).toBe(43);
    p.carry(20.3, 16, 1, 0); // corner 21.7: 0.2 past → 43.4 rounds to 43 (no change needed)
    expect(p.gx).toBe(43);
    p.carry(20.46, 16, 1, 0); // corner 21.86: 0.11 past 21.75 → 44
    expect(p.gx).toBe(44);
    p.carry(20.3, 16, 1, 0); // corner 21.7: only 0.05 back past the boundary → kept
    expect(p.gx).toBe(44);
    p.carry(20.2, 16, 1, 0); // corner 21.6: 0.15 back → 43
    expect(p.gx).toBe(43);
  });

  it("⟳ turns 90° clockwise, locks auto-rotate for this hold, and keeps the carry gap; a new hold is unlocked", () => {
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 0, -1);
    expect(p.rot).toBe(2);
    p.rotate();
    expect([p.rot, p.locked]).toEqual([3, true]);
    expect(gapTo(p, 20, 16) - BODY).toBeGreaterThanOrEqual(GAP - 0.35);
    p.carry(20, 16, 1, 0); // facing east would want 3 anyway; then north would want 2
    p.carry(20, 16, 0, -1);
    expect(p.rot).toBe(3);
    p.rotate();
    expect(p.rot).toBe(0);
    p.start(balance, WOOD, 20, 16, 0, -1);
    expect([p.rot, p.locked]).toEqual([2, false]);
  });

  it("fuzz: my own body never overlaps the carried ghost (every type, facing, position incl. the map edge, lock)", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const types = ["wood_barricade", "auto_turret", "spike_trap", "mine"];
    const p = new Placement();
    let checked = 0;
    for (let i = 0; i < 4000; i++) {
      const edge = i % 4 === 0; // review L4: a quarter of the steps hug the map edge (body radius from it)
      const x = edge ? (rnd() < 0.5 ? BODY : 48 - BODY) : 4 + rnd() * 40;
      const y = edge ? BODY + rnd() * (32 - 2 * BODY) : 4 + rnd() * 24;
      const a = rnd() * Math.PI * 2;
      if (i % 50 === 0) p.start(balance, types[(i / 50) % 4] as string, x, y, Math.cos(a), Math.sin(a));
      if (rnd() < 0.02) p.rotate();
      p.carry(x, y, Math.cos(a), Math.sin(a));
      expect(gapTo(p, x, y)).toBeGreaterThan(BODY + 0.5);
      checked++;
    }
    expect(checked).toBe(4000);
  });

  it("review L4: at the map edge the ghost shows past it (never pulled back onto me), is red, and is never sent", () => {
    const w = world();
    const p = new Placement();
    p.start(balance, WOOD, 0.5, 16, -1, 0); // against the west edge, facing west
    expect(p.gx).toBeLessThan(0);
    expect(gapTo(p, 0.5, 16)).toBeGreaterThan(BODY + 0.5);
    expect(p.check(w, "p0")).toBe(false);
    expect(p.error).toBe("blocked");
    expect(p.onWire()).toBe(false);
    expect(p.confirm()).toBeNull(); // nothing the uint8 wire could carry (a wrapped -1 would be 255)
    expect(p.active).toBe(false);
    p.start(balance, "auto_turret", 20, 0.5, 0, -1); // north edge
    expect(p.gy).toBeLessThan(0);
    expect(gapTo(p, 20, 0.5)).toBeGreaterThan(BODY + 0.5);
    p.carry(Number.NaN, 2, 1, 0); // ignored
    expect(p.gy).toBeLessThan(0);
    p.carry(20, 6, 0, -1); // back inside: on the wire again
    expect(p.onWire()).toBe(true);
  });

  it("Place returns the spot shown now, once; ✕ ends it with nothing", () => {
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 0, -1);
    p.carry(30, 10, 1, 0);
    const shown = { type: WOOD, gx: p.gx, gy: p.gy, rot: p.rot };
    expect(p.confirm()).toEqual(shown);
    expect(p.active).toBe(false);
    expect(p.confirm()).toBeNull();
    p.start(balance, WOOD, 20, 16, 1, 0);
    p.cancel();
    expect(p.active).toBe(false);
    expect(p.confirm()).toBeNull();
  });

  it("green exactly when the shared rules accept it: open street, a building, a teammate, money, wave", () => {
    const w = world();
    addPlayer(w, "p1", 30, 10);
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 0, -1);
    expect(p.check(w, "p0")).toBe(true); // my own body never blocks it
    placeBuilding(w, "p0", { type: WOOD, gx: p.gx, gy: p.gy, rot: p.rot }); // the spot is taken
    expect(p.check(w, "p0")).toBe(false);
    expect(p.error).toBe("blocked");
    p.carry(30, 12, 0, -1); // carried onto the teammate at (30, 10)
    expect(p.check(w, "p0")).toBe(false);
    p.carry(36, 20, 0, -1);
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

describe("Story 5.15 (review M1): stepPlacement, one frame of placement mode", () => {
  const hud = (): PlacementHud => ({ placementActive: false, placementValid: true, placementLocked: false, placementHint: "", rotatePressed: false, confirmPressed: false, cancelPressed: false });
  function frame(sent: PlaceRequest[], toasts: string[]): PlacementFrame {
    return {
      can: true,
      wave: 0,
      x: 20,
      y: 16,
      ownerId: "p0",
      label: "Wood barricade · $40",
      refusal: (e: PlaceError) => placeRefusalText(e, balance),
      send: (r) => sent.push({ ...r }),
      toast: (t) => toasts.push(t),
    };
  }
  const walking = (): MutablePlayerInput => ({ ...NEUTRAL_INPUT, moveX: 0, moveY: -1, aimX: 1, aimY: 0, fire: true });

  it("holding keeps my move (not the neutral input) and drops aim and fire; the ghost follows and the HUD is filled", () => {
    const w = world();
    const p = new Placement();
    const m = hud();
    const f = frame([], []);
    p.start(balance, WOOD, 20, 16, 0, -1);
    const input = walking();
    stepPlacement(p, m, input, w, f);
    expect([input.moveX, input.moveY, input.aimX, input.aimY, input.fire]).toEqual([0, -1, 0, 0, false]);
    expect([m.placementActive, m.placementValid, m.placementHint, m.placementLocked]).toEqual([true, true, "Wood barricade · $40", false]);
    const gy0 = p.gy;
    f.y = 12; // walked 4 m north
    stepPlacement(p, m, walking(), w, f);
    expect(p.gy).toBe(gy0 - 8);
  });

  it("Place sends the spot drawn last frame, before this frame's carry moves it (AC 10), and ends holding", () => {
    const w = world();
    const sent: PlaceRequest[] = [];
    const p = new Placement();
    const m = hud();
    const f = frame(sent, []);
    p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(p, m, walking(), w, f);
    const shown = { type: WOOD, gx: p.gx, gy: p.gy, rot: p.rot };
    f.y = 10; // my survivor moved 6 m before the press is handled
    m.confirmPressed = true;
    stepPlacement(p, m, walking(), w, f);
    expect(sent).toEqual([shown]);
    expect([p.active, m.placementActive, m.confirmPressed]).toEqual([false, false, false]);
  });

  it("⟳ locks, ✕ sends nothing, an off-map Place toasts instead of sending, and the cancel rules end holding", () => {
    const w = world();
    const sent: PlaceRequest[] = [];
    const toasts: string[] = [];
    const p = new Placement();
    const m = hud();
    const f = frame(sent, toasts);
    p.start(balance, WOOD, 20, 16, 0, -1);
    m.rotatePressed = true;
    stepPlacement(p, m, walking(), w, f);
    expect([p.rot, m.placementLocked]).toEqual([3, true]);
    m.cancelPressed = true;
    stepPlacement(p, m, walking(), w, f);
    expect([p.active, m.placementActive, sent.length]).toEqual([false, false, 0]);
    const input = walking();
    stepPlacement(p, m, input, w, f); // not holding: the input is left alone
    expect(input.fire).toBe(true);
    f.x = 0.5;
    p.start(balance, WOOD, 0.5, 16, -1, 0);
    stepPlacement(p, m, { ...NEUTRAL_INPUT, moveX: -1 }, w, f);
    expect(m.placementValid).toBe(false);
    expect(m.placementHint).toBe("Can't build here");
    m.confirmPressed = true;
    stepPlacement(p, m, walking(), w, f);
    expect([sent.length, toasts]).toEqual([0, ["Can't build here"]]);
    f.x = 20;
    p.start(balance, WOOD, 20, 16, 0, -1, 0);
    f.wave = 1; // a new wave number
    stepPlacement(p, m, walking(), w, f);
    expect(p.active).toBe(false);
    p.start(balance, WOOD, 20, 16, 0, -1, 1);
    f.can = false; // menu/shop open, downed, out of the build
    stepPlacement(p, m, walking(), w, f);
    expect([p.active, m.placementActive]).toEqual([false, false]);
  });
});
