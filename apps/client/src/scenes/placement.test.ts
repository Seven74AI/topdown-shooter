import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, addPlayer, spawnZombie, buildingStats, createWorld, footprint, footprintH, footprintW, loadBalance, placeBuilding, startBuild, startWave, type PlaceError, type PlaceRequest } from "@topdown/shared";
import { CHAIN_MONEY_TEXT, Placement, autoRot, carryDistance, chainOffset, placeGate, placeRefusalText, snapAxis, stepPlacement, type PlacementFrame, type PlacementHud } from "./placement";
import { PendingPlacements, newestBuildingId } from "./pendingPlacements";
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
    p.start(balance, "auto_turret", 20, 0.5, 0, -1); // north edge: only gy is off the wire
    expect(p.gx).toBeGreaterThanOrEqual(0);
    expect(p.gy).toBeLessThan(0);
    expect(gapTo(p, 20, 0.5)).toBeGreaterThan(BODY + 0.5);
    p.carry(Number.NaN, 2, 1, 0); // ignored
    expect(p.gy).toBeLessThan(0);
    expect(p.onWire()).toBe(false);
    p.carry(20, 6, 0, -1); // back inside: on the wire again
    expect(p.onWire()).toBe(true);
    p.carry(20, 0.5, 0, -1); // and out again
    expect(p.onWire()).toBe(false);
    expect(p.confirm()).toBeNull();
    expect(p.active).toBe(false);
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
      nowMs: 0,
      hintText: (e: PlaceError) => placeRefusalText(e, balance),
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

  it("Place sends the spot drawn last frame, before this frame's carry moves it (AC 10); Story 5.18: the item stays in hand, pinned one footprint along", () => {
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
    const pressFrame = walking();
    stepPlacement(p, m, pressFrame, w, f);
    expect(sent).toEqual([shown]);
    expect([pressFrame.moveY, pressFrame.aimX, pressFrame.aimY, pressFrame.fire]).toEqual([-1, 0, 0, false]); // the press frame is a hold frame too
    expect([p.active, m.placementActive, m.confirmPressed, p.pinned]).toEqual([true, true, false, true]); // Story 5.18: the chain
    expect([p.gx, p.gy, p.rot]).toEqual([shown.gx + 4, shown.gy, shown.rot]); // facing north: 2 m to the east, end to end
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
    const cancelFrame = walking();
    stepPlacement(p, m, cancelFrame, w, f);
    expect([p.active, m.placementActive, sent.length]).toEqual([false, false, 0]);
    expect([cancelFrame.moveY, cancelFrame.aimX, cancelFrame.aimY, cancelFrame.fire]).toEqual([-1, 0, 0, false]); // the ✕ frame is a hold frame too
    // ⟳ is applied before this frame's carry: facing east (rot 3), then ⟳ on the frame the move turns
    // north gives 3 + 1 = 0 (locked), never north's auto-rot 2 turned once more (3).
    p.start(balance, WOOD, 20, 16, 1, 0);
    stepPlacement(p, m, { ...NEUTRAL_INPUT, moveX: 1 }, w, f);
    expect(p.rot).toBe(3);
    m.rotatePressed = true;
    stepPlacement(p, m, { ...NEUTRAL_INPUT, moveY: -1 }, w, f);
    expect([p.rot, p.locked]).toEqual([0, true]);
    p.cancel();
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

describe("Story 5.17: why it's red — the reason and its 250 ms hold", () => {
  const hud = (): PlacementHud => ({ placementActive: false, placementValid: true, placementLocked: false, placementHint: "", rotatePressed: false, confirmPressed: false, cancelPressed: false });
  const HOLD = balance.controls.build.reasonHoldMs;
  /** p0 at (20, 16) facing north holding a barricade; p1 (Bo) can step onto the ghost and away. */
  function setup() {
    const w = world();
    const bo = addPlayer(w, "p1", 40, 16);
    const p = new Placement();
    const m = hud();
    const f: PlacementFrame = {
      can: true,
      wave: 0,
      x: 20,
      y: 16,
      ownerId: "p0",
      label: "Wood barricade · $40",
      refusal: (e: PlaceError) => placeRefusalText(e, balance),
      send: () => {},
      toast: () => {},
      nowMs: 1000,
      hintText: (e, r) => (r ? `${e}:${r.cause}:${r.playerId}` : e),
    };
    p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(p, m, { ...NEUTRAL_INPUT }, w, f);
    const b = box(p);
    const onGhost = (): void => {
      bo.x = (b.minX + b.maxX) / 2;
      bo.y = (b.minY + b.maxY) / 2;
    };
    const away = (): void => {
      bo.x = 40;
      bo.y = 16;
    };
    return { w, p, m, f, onGhost, away, step: (ms: number) => ((f.nowMs = ms), stepPlacement(p, m, { ...NEUTRAL_INPUT }, w, f)) };
  }

  it("blocked shows at once with its cause and culprit; valid comes back only after the hold", () => {
    const s = setup();
    expect([s.m.placementValid, s.m.placementHint]).toEqual([true, "Wood barricade · $40"]);
    s.onGhost();
    s.step(1016);
    expect([s.m.placementValid, s.m.placementHint]).toEqual([false, "blocked:teammate:p1"]);
    expect([s.p.error, s.p.hasReason, s.p.reason.cause, s.p.shownReason.playerId]).toEqual(["blocked", true, "teammate", "p1"]);
    s.away(); // Bo walks past in one frame
    s.step(1032);
    expect(s.p.error).toBeNull(); // the truth is valid…
    expect([s.m.placementValid, s.m.placementHint, s.p.shownError]).toEqual([false, "blocked:teammate:p1", "blocked"]); // …the look holds
    s.step(1016 + HOLD - 1);
    expect(s.m.placementValid).toBe(false);
    s.step(1016 + HOLD);
    expect([s.m.placementValid, s.m.placementHint, s.p.shownError]).toEqual([true, "Wood barricade · $40", null]);
  });

  it("a new reason replaces the shown one at once (and restarts the hold); blocked never waits", () => {
    const s = setup();
    s.onGhost();
    s.step(1016);
    s.away();
    s.step(1100); // valid, held
    (s.w.players.get("p0") as { wallet: number }).wallet = 0; // money now fails before the spot
    s.step(1110);
    expect([s.m.placementValid, s.m.placementHint, s.p.shownSinceMs]).toEqual([false, "money", 1110]);
    (s.w.players.get("p0") as { wallet: number }).wallet = 1000;
    s.step(1110 + HOLD - 1);
    expect(s.m.placementValid).toBe(false);
    s.step(1110 + HOLD);
    expect(s.m.placementValid).toBe(true);
    s.onGhost();
    s.step(1110 + HOLD + 1); // blocked again: red on that very frame
    expect(s.m.placementValid).toBe(false);
  });

  it("review L1: valid needs 250 ms of continuous clear, even after a long red; a one-frame clear never flashes green; a new hold starts clean", () => {
    const s = setup();
    s.onGhost();
    s.step(1016);
    s.step(2000); // still blocked: the clock restarts here
    s.away();
    s.step(2016);
    expect(s.m.placementValid).toBe(false); // one clear frame after a long red: no green flash
    s.onGhost();
    s.step(2032); // blocked again
    s.away();
    s.step(2032 + HOLD - 1);
    expect(s.m.placementValid).toBe(false);
    s.step(2032 + HOLD);
    expect(s.m.placementValid).toBe(true);
    s.onGhost();
    s.step(2400);
    expect(s.p.shownError).toBe("blocked");
    s.p.cancel();
    expect([s.p.shownError, s.p.shownHasReason, s.p.hasReason]).toEqual([null, false, false]);
    s.away();
    s.p.start(balance, WOOD, 20, 16, 0, -1);
    s.step(2410);
    expect([s.m.placementValid, s.m.placementHint]).toEqual([true, "Wood barricade · $40"]);
  });

  it("the reason is the shared blockReason of the shown box (off the map at the west edge)", () => {
    const s = setup();
    s.f.x = 0.5;
    s.p.start(balance, WOOD, 0.5, 16, -1, 0);
    stepPlacement(s.p, s.m, { ...NEUTRAL_INPUT, moveX: -1 }, s.w, s.f);
    expect([s.m.placementValid, s.p.reason.cause, s.m.placementHint]).toEqual([false, "off_map", "blocked:off_map:"]);
  });
});

describe("Story 5.17 review: the culprit changing while blocked; start resets; a building under the ghost", () => {
  const hud = (): PlacementHud => ({ placementActive: false, placementValid: true, placementLocked: false, placementHint: "", rotatePressed: false, confirmPressed: false, cancelPressed: false });
  function setup() {
    const w = world();
    const p1 = addPlayer(w, "p1", 40, 16);
    const p2 = addPlayer(w, "p2", 42, 16);
    const p = new Placement();
    const m = hud();
    const f: PlacementFrame = {
      can: true,
      wave: 0,
      x: 20,
      y: 16,
      ownerId: "p0",
      label: "Wood barricade · $40",
      refusal: (e: PlaceError) => placeRefusalText(e, balance),
      send: () => {},
      toast: () => {},
      nowMs: 1000,
      hintText: (e, r) => (r ? `${e}:${r.cause}:${r.playerId}:${r.id}` : e),
    };
    p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(p, m, { ...NEUTRAL_INPUT }, w, f);
    const b = box(p);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const put = (pl: { x: number; y: number }, x: number, y: number): void => {
      pl.x = x;
      pl.y = y;
    };
    return { w, p, m, f, p1, p2, cx, cy, put, step: (ms: number) => ((f.nowMs = ms), stepPlacement(p, m, { ...NEUTRAL_INPUT }, w, f)) };
  }

  it("teammate p1 → p2 on the ghost: the hint, shownReason and version change that frame", () => {
    const s = setup();
    s.put(s.p1, s.cx, s.cy);
    s.step(1016);
    expect([s.m.placementHint, s.p.shownReason.playerId]).toEqual(["blocked:teammate:p1:0", "p1"]);
    const v = s.p.shownVersion;
    s.put(s.p1, 40, 16);
    s.put(s.p2, s.cx, s.cy);
    s.step(1032);
    expect([s.m.placementHint, s.p.shownReason.playerId, s.p.shownSinceMs]).toEqual(["blocked:teammate:p2:0", "p2", 1032]);
    expect(s.p.shownVersion).toBe(v + 1);
  });

  it("teammate → zombie: the cause and culprit change that frame", () => {
    const s = setup();
    s.put(s.p1, s.cx, s.cy);
    s.step(1016);
    s.put(s.p1, 40, 16);
    const zid = spawnZombie(s.w, "walker", s.cx, s.cy);
    s.step(1032);
    expect([s.m.placementHint, s.p.shownReason.cause, s.p.shownReason.id, s.p.shownReason.playerId]).toEqual([`blocked:zombie::${zid}`, "zombie", zid, ""]);
  });

  it("zombie A → zombie B on the ghost (same cause, another culprit): the culprit changes that frame", () => {
    const s = setup();
    const a = spawnZombie(s.w, "walker", s.cx, s.cy);
    s.step(1016);
    expect(s.p.shownReason.id).toBe(a);
    const v = s.p.shownVersion;
    s.w.zombies.x[a] = 40;
    s.w.zombies.y[a] = 16;
    const b = spawnZombie(s.w, "walker", s.cx, s.cy);
    s.step(1032);
    expect([s.p.shownReason.cause, s.p.shownReason.id, s.m.placementHint, s.p.shownVersion]).toEqual(["zombie", b, `blocked:zombie::${b}`, v + 1]);
  });

  it("start() resets the shown state (no cancel in between)", () => {
    const s = setup();
    s.put(s.p1, s.cx, s.cy);
    s.step(1016);
    expect(s.p.shownError).toBe("blocked");
    s.put(s.p1, 40, 16);
    s.p.start(balance, WOOD, 20, 16, 0, -1);
    expect([s.p.shownError, s.p.shownHasReason, s.p.hasReason]).toEqual([null, false, false]);
    s.step(1020);
    expect(s.m.placementValid).toBe(true);
  });

  it("a building under the ghost is the reason (every building counts: no exceptId while placing)", () => {
    const s = setup();
    const b = box(s.p);
    const gx = Math.round(b.minX / 0.5);
    const gy = Math.round(b.minY / 0.5);
    const ok = placeBuilding(s.w, "p1", { type: "mine", gx, gy, rot: 0 });
    expect(ok.ok).toBe(true);
    s.step(1016);
    expect([s.p.reason.cause, s.p.hasReason, s.m.placementHint]).toEqual(["building", true, `blocked:building::${s.w.buildings.list[0]?.id}`]);
  });
});

describe("Story 5.18: place, place, place (chain, pin, pending-aware check)", () => {
  const hud = (): PlacementHud => ({ placementActive: false, placementValid: true, placementLocked: false, placementHint: "", rotatePressed: false, confirmPressed: false, cancelPressed: false });
  const still = (): MutablePlayerInput => ({ ...NEUTRAL_INPUT });
  function rig(wallet: number) {
    const w = world();
    (w.players.get("p0") as { wallet: number }).wallet = wallet;
    const pending = new PendingPlacements();
    const sent: PlaceRequest[] = [];
    const toasts: string[] = [];
    const p = new Placement();
    const m = hud();
    const f: PlacementFrame = {
      can: true,
      wave: w.waves.number,
      x: 20,
      y: 16,
      ownerId: "p0",
      label: "Wood barricade · $40",
      refusal: (e: PlaceError) => placeRefusalText(e, balance),
      send: (r) => {
        sent.push({ ...r });
        const s = buildingStats(balance, r.type);
        if (!s) throw new Error("type");
        pending.add(r, s.price, footprint(s, r.gx, r.gy, r.rot, { minX: 0, minY: 0, maxX: 0, maxY: 0 }), newestBuildingId(w), w.run.phase, w.waves.number);
      },
      toast: (t) => toasts.push(t),
      nowMs: 0,
      hintText: (e: PlaceError) => placeRefusalText(e, balance),
      pending,
      viewMinX: Number.NaN,
      viewMinY: Number.NaN,
      viewMaxX: Number.NaN,
      viewMaxY: Number.NaN,
    };
    const tap = () => {
      m.confirmPressed = true;
      stepPlacement(p, m, still(), w, f);
    };
    return { w, pending, sent, toasts, p, m, f, tap };
  }

  it("chain jump per type and rot: long side end to end, squares to the right of my facing, at least 1 m (AC 3, D4)", () => {
    const o = { dgx: 0, dgy: 0 };
    const at = (type: string, rot: number, fx: number, fy: number) => {
      const s = buildingStats(balance, type);
      if (!s) throw new Error(type);
      const r = chainOffset(footprintW(s, rot), footprintH(s, rot), fx, fy, balance.controls.build.chainMinStepM, o);
      return [r.dgx, r.dgy];
    };
    expect(at(WOOD, 2, 0, -1)).toEqual([4, 0]); // facing north: 2 m east
    expect(at(WOOD, 0, 0, 1)).toEqual([-4, 0]); // facing south: right is west
    expect(at(WOOD, 3, 1, 0)).toEqual([0, 4]); // facing east: right is south
    expect(at(WOOD, 1, -1, 0)).toEqual([0, -4]); // facing west: right is north
    expect(at(WOOD, 0, 1, 0)).toEqual([0 + 4, 0]); // locked across the facing: along the long side, +x by default
    expect(at("auto_turret", 0, 0, -1)).toEqual([2, 0]); // 1 m square, right of north = east
    expect(at("auto_turret", 0, 1, 0)).toEqual([0, 2]);
    expect(at("spike_trap", 0, 0, 1)).toEqual([-4, 0]); // 2 m
    expect(at("mine", 0, 0, -1)).toEqual([2, 0]); // 0.5 m mine jumps 1.0 m
    expect(chainOffset(0.5, 0.5, 0, -1, 2, o)).toEqual({ dgx: 4, dgy: 0 }); // the minimum comes from balance
  });

  it("three Places standing still = a 6 m wall end to end, each box pending, nothing overlapping (AC 2, 3, 5)", () => {
    const r = rig(5000);
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    r.tap();
    r.tap();
    r.tap();
    expect(r.sent.map((q) => [q.gx, q.gy, q.rot])).toEqual([
      [38, 28, 2],
      [42, 28, 2],
      [46, 28, 2],
    ]);
    expect([r.pending.count, r.pending.money, r.p.active, r.p.pinned, r.p.gx]).toEqual([3, 120, true, true, 50]);
    expect(r.toasts).toEqual([]);
  });

  it("10 taps with $100: 2 sent, then the hand empties with \"Not enough money for another\" (B1)", () => {
    const r = rig(100);
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    for (let i = 0; i < 10; i++) r.tap();
    expect(r.sent.length).toBe(2);
    expect([r.pending.money, r.p.active, r.m.placementActive]).toEqual([80, false, false]);
    expect(r.toasts).toEqual([CHAIN_MONEY_TEXT]);
  });

  it("the cap counts pending: at 5/6 one Place, then \"Building limit reached (6)\"; at 6/6 Place sends nothing (AC 2, 6, B4)", () => {
    const r = rig(5000);
    for (let i = 0; i < 5; i++) expect(placeBuilding(r.w, "p0", { type: "mine", gx: 30 + 4 * i, gy: 40, rot: 0 }).ok).toBe(true);
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    r.tap();
    expect([r.sent.length, r.p.active]).toEqual([1, false]);
    expect(r.toasts).toEqual(["Building limit reached (6)"]);
    expect(placeBuilding(r.w, "p0", { type: "mine", gx: 30, gy: 44, rot: 0 }).ok).toBe(true); // the server built it: 6/6
    r.pending.clear();
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    r.tap();
    expect(r.sent.length).toBe(1); // turned down on the device: never more than max − owned − pending in flight
    expect(r.toasts).toEqual(["Building limit reached (6)", "Building limit reached (6)"]);
  });

  it("placeGate: cap counting pending first; money only with a box pending (with none, a predicted refusal still sends: 5.15)", () => {
    const w = world();
    (w.players.get("p0") as { wallet: number }).wallet = 30;
    const none = { count: 0, money: 0, overlaps: () => false };
    expect(placeGate(w, "p0", 40, none)).toBeNull();
    expect(placeGate(w, "p0", 40, { count: 1, money: 0, overlaps: () => false })).toBe("money");
    expect(placeGate(w, "p0", 20, { count: 1, money: 10, overlaps: () => false })).toBeNull();
    expect(placeGate(w, "p0", 20, { count: 6, money: 0, overlaps: () => false })).toBe("limit");
  });

  it("a blocked jump goes back to carry at once; the carried ghost on my pending box says \"Overlaps a building\" (AC 3, 5)", () => {
    const r = rig(5000);
    expect(placeBuilding(r.w, "p0", { type: "mine", gx: 43, gy: 28, rot: 0 }).ok).toBe(true); // on the jump spot
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    r.tap();
    expect([r.p.active, r.p.pinned, r.p.gx, r.p.gy]).toEqual([true, false, 38, 28]); // carried: on the box just placed
    expect([r.p.error, r.p.pendingOverlap, r.p.shownHasReason, r.p.shownReason.cause]).toEqual(["blocked", true, true, "building"]);
  });

  it("pending-aware check, placementError's order: limit, then money, then my pending box's ground", () => {
    const w = world();
    (w.players.get("p0") as { wallet: number }).wallet = 100;
    const p = new Placement();
    p.start(balance, WOOD, 20, 16, 0, -1);
    const pend = (count: number, money: number, over: boolean) => ({ count, money, overlaps: () => over });
    expect(p.check(w, "p0", pend(6, 0, true))).toBe(false);
    expect(p.error).toBe("limit");
    p.check(w, "p0", pend(1, 80, true));
    expect(p.error).toBe("money");
    p.check(w, "p0", pend(1, 40, true));
    expect([p.error, p.pendingOverlap]).toEqual(["blocked", true]);
    p.check(w, "p0", pend(1, 40, false));
    expect([p.error, p.pendingOverlap]).toEqual([null, false]);
    p.check(w, "p0", null);
    expect(p.error).toBeNull();
  });

  it("pinned stays put while I walk ≤ 2 m, goes back to carry after 2 m or when it leaves the view; ⟳ turns it around its centre (AC 4, D3)", () => {
    const r = rig(5000);
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    r.tap();
    const pin = [r.p.gx, r.p.gy];
    r.f.x = 21.9; // walked 1.9 m east
    stepPlacement(r.p, r.m, { ...NEUTRAL_INPUT, moveX: 1 }, r.w, r.f);
    expect([r.p.pinned, r.p.gx, r.p.gy]).toEqual([true, ...pin]);
    r.m.rotatePressed = true; // ⟳: around the centre (22, 14.25) → a 0.5 × 2 box, corner (21.75, 13.25) snapped
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    expect([r.p.pinned, r.p.rot, r.p.locked, r.p.gx, r.p.gy]).toEqual([true, 3, true, 44, 27]);
    r.f.x = 22.1; // 2.1 m from where I placed
    stepPlacement(r.p, r.m, { ...NEUTRAL_INPUT, moveX: 1 }, r.w, r.f);
    expect(r.p.pinned).toBe(false);
    // the view rule: pin again, then a view that no longer holds the ghost's centre
    r.f.x = 20;
    r.tap();
    expect(r.p.pinned).toBe(true);
    const b = r.p.ghostBox();
    if (!b) throw new Error("box");
    r.f.viewMinX = (b.minX + b.maxX) / 2 - 0.9; // its centre 0.9 m inside the left edge: within the 1 m inset
    r.f.viewMinY = 0;
    r.f.viewMaxX = r.f.viewMinX + 20;
    r.f.viewMaxY = 30;
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    expect(r.p.pinned).toBe(false);
  });

  it("✕ or a cancel rule ends a chain like any hold; a new hold starts unpinned", () => {
    const r = rig(5000);
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    r.tap();
    expect(r.p.pinned).toBe(true);
    r.m.cancelPressed = true;
    stepPlacement(r.p, r.m, still(), r.w, r.f);
    expect([r.p.active, r.p.pinned]).toEqual([false, false]);
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    expect(r.p.pinned).toBe(false);
  });
});
