import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, addPlayer, buildingStats, createWorld, footprint, loadBalance, placeBuilding, startBuild, type PlaceError, type PlaceRequest } from "@topdown/shared";
import { Placement, placeRefusalText, stepPlacement, type PlacementFrame, type PlacementHud } from "./placement";
import { PendingPlacements, newestBuildingId } from "./pendingPlacements";
import type { MutablePlayerInput } from "../input/InputRouter";

/** Story 5.23 (BX-9 + BX-11): the mouse follow, the wheel's ccw turn, the resting ghost, the chip's side reset, the refusal hook, picks/places. */
const balance = loadBalance();
const WOOD = "wood_barricade";

function rig(wallet = 5000) {
  const w = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(w, "p0", 20, 16);
  startBuild(w);
  (w.players.get("p0") as { wallet: number }).wallet = wallet;
  const pending = new PendingPlacements();
  const sent: PlaceRequest[] = [];
  const toasts: string[] = [];
  let refused = 0;
  const p = new Placement();
  const m: PlacementHud = { placementActive: false, placementValid: true, placementLocked: false, placementHint: "", rotatePressed: false, confirmPressed: false, cancelPressed: false, placementPinned: false, dragDxPx: 0, dragDyPx: 0, dragged: false, chipPressed: false, rotateCcwPressed: false, placementResting: false };
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
    hintText: (e: PlaceError) => `why:${e}`,
    pending,
    viewMinX: 8,
    viewMinY: 9,
    viewMaxX: 32,
    viewMaxY: 23,
    refused: () => refused++,
  };
  const still = (): MutablePlayerInput => ({ ...NEUTRAL_INPUT });
  const step = (input: MutablePlayerInput = still()) => stepPlacement(p, m, input, w, f);
  const centre = () => {
    const b = p.ghostBox();
    if (!b) throw new Error("no ghost");
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  };
  return { w, pending, sent, toasts, p, m, f, step, centre, still, refusedCount: () => refused };
}

describe("Story 5.23: the mouse's absolute follow (AC 9, D12)", () => {
  it("the ghost's centre sits on the cursor's world point (snapped), not pinned; with no cursor it is carried", () => {
    const r = rig();
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    r.f.cursorX = 25.1;
    r.f.cursorY = 13.2;
    r.step();
    const [cx, cy] = r.centre() as [number, number];
    expect(Math.abs(cx - 25.1)).toBeLessThanOrEqual(0.25 + 1e-9); // a 0.5 m lattice
    expect(Math.abs(cy - 13.2)).toBeLessThanOrEqual(0.25 + 1e-9);
    expect([r.p.pinned, r.m.placementPinned, r.p.following]).toEqual([false, false, true]);
    r.f.cursorX = Number.NaN; // the mouse rests (the scene stops passing it): carried again
    r.f.cursorY = Number.NaN;
    r.step();
    expect([r.p.following, r.p.gx, r.p.gy]).toEqual([false, 38, 28]); // 5.15's carry spot, north of me
  });

  it("snap hysteresis on a resting cursor: ±0.05 m round a lattice boundary never flips the spot", () => {
    const r = rig();
    r.p.start(balance, WOOD, 20, 16, 0, -1); // rot 2: 2 × 0.5 m
    r.f.cursorY = 13.25;
    r.f.cursorX = 25.25; // a centre exactly on the boundary between two spots (min corner 24.25 → 48.5 cells)
    r.step();
    const gx = r.p.gx;
    for (const dx of [0.05, -0.05, 0.04, -0.04, 0.05, -0.05]) {
      r.f.cursorX = 25.25 + dx;
      r.step();
      expect(r.p.gx).toBe(gx);
    }
    r.f.cursorX = 25.25 + 0.75; // a real move: past the boundary and the hysteresis
    r.step();
    expect(r.p.gx - gx).toBeGreaterThanOrEqual(1);
  });

  it("clamped 1 m inside the view (B1 / AC 15): a cursor at the window's corner keeps the centre 1 m in", () => {
    const r = rig();
    r.p.start(balance, "auto_turret", 20, 16, 1, 0);
    r.f.cursorX = 31.99;
    r.f.cursorY = 22.99;
    r.step();
    const [cx, cy] = r.centre() as [number, number];
    expect(cx).toBeLessThanOrEqual(32 - 1 + 1e-9);
    expect(cy).toBeLessThanOrEqual(23 - 1 + 1e-9);
    expect(r.p.outsideView(8, 9, 32, 23)).toBe(false);
    r.f.cursorX = 90; // far outside the view (a stale cursor): still 1 m inside, never past the edge
    r.f.cursorY = 80;
    r.step();
    const [fx, fy] = r.centre() as [number, number];
    expect([fx <= 31 + 1e-9, fy <= 22 + 1e-9, fx > 30, fy > 21]).toEqual([true, true, true, true]);
  });

  it("a Place sends the spot shown last frame; the chain's spot holds that frame although the cursor is elsewhere", () => {
    const r = rig();
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    r.f.cursorX = 24;
    r.f.cursorY = 12.25;
    r.step();
    const shown = [r.p.gx, r.p.gy, r.p.rot];
    r.f.cursorX = 14; // moved in the press frame
    r.m.confirmPressed = true;
    r.step();
    expect(r.sent.map((q) => [q.gx, q.gy, q.rot])).toEqual([shown]);
    expect([r.p.pinned, r.p.gx, r.p.places]).toEqual([true, (shown[0] as number) + 4, 1]); // the chain, end to end
  });

  it("⟳ while following turns round the ghost's centre", () => {
    const r = rig();
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    r.f.cursorX = 24;
    r.f.cursorY = 12.25;
    r.step();
    const before = r.centre();
    r.m.rotatePressed = true;
    r.step();
    expect(r.p.rot).toBe(3);
    const after = r.centre() as [number, number];
    // round its centre, to the lattice: within a quarter cell on each axis
    expect(Math.abs(after[0] - (before[0] as number))).toBeLessThanOrEqual(0.25 + 1e-9);
    expect(Math.abs(after[1] - (before[1] as number))).toBeLessThanOrEqual(0.25 + 1e-9);
  });
});

describe("Story 5.23: the wheel's counter-clockwise turn (AC 10)", () => {
  it("rotateCcwPressed turns −90° and locks; ⟳ turns +90°", () => {
    const r = rig();
    r.p.start(balance, WOOD, 20, 16, 0, -1); // rot 2
    r.m.rotateCcwPressed = true;
    r.step();
    expect([r.p.rot, r.p.locked, r.m.rotateCcwPressed]).toEqual([1, true, false]);
    r.m.rotatePressed = true;
    r.step();
    expect(r.p.rot).toBe(2);
  });
});

describe("Story 5.23: the resting ghost after a blocked chain (AC 7, D10; 5.18 Q1)", () => {
  it("back in hand on the box just placed: faded (resting), the label on the reason line; cleared once it is clear", () => {
    const r = rig();
    expect(placeBuilding(r.w, "p0", { type: "mine", gx: 43, gy: 28, rot: 0 }).ok).toBe(true); // on the jump spot
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    r.step();
    r.m.confirmPressed = true;
    r.step();
    expect([r.p.pinned, r.p.error, r.p.resting, r.m.placementResting, r.m.placementValid]).toEqual([false, "blocked", true, true, false]);
    expect(r.m.placementHint).toBe("Wood barricade · $40"); // not "why:blocked"
    r.step(); // still on it: still resting
    expect(r.p.resting).toBe(true);
    r.f.x = 28; // walk away: clear → the normal look for the rest of the hold
    r.step({ ...NEUTRAL_INPUT, moveY: -1 });
    expect([r.p.error, r.p.resting, r.m.placementResting]).toEqual([null, false, false]);
    r.f.x = 20; // back onto the pending box: red now (not resting any more)
    r.step({ ...NEUTRAL_INPUT, moveY: -1 });
    expect([r.p.error, r.p.resting, r.m.placementHint]).toEqual(["blocked", false, "why:blocked"]);
  });

  it("blocked by something other than a building (a teammate on it): the normal red look at once", () => {
    const r = rig();
    expect(placeBuilding(r.w, "p0", { type: "mine", gx: 43, gy: 28, rot: 0 }).ok).toBe(true);
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    r.step();
    addPlayer(r.w, "p1", 20, 14.25); // a teammate stands on the carry spot
    r.m.confirmPressed = true;
    r.step();
    expect([r.p.error, r.p.resting, r.p.shownReason.cause]).toEqual(["blocked", false, "teammate"]);
  });

  it("a new hold is never resting", () => {
    const r = rig();
    r.p.resting = true;
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    expect(r.p.resting).toBe(false);
  });
});

describe("Story 5.23: the chip's ↩ carry starts the drag side over (AC 8, D11; 5.19 L5)", () => {
  it("chip → the next chain jump goes right of my facing; a view unpin keeps the side", () => {
    const r = rig();
    r.f.pxPerM = 1;
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    r.step();
    r.m.dragged = true;
    r.m.dragBegan = true;
    r.m.dragDxPx = -1;
    r.step(); // dragged 1 m west: side −1
    expect(r.p.lastDragX).toBe(-1);
    r.m.chipPressed = true;
    r.step();
    expect([r.p.pinned, r.p.lastDragX, r.p.lastDragY]).toEqual([false, 0, 0]);
    const gx = r.p.gx;
    r.m.confirmPressed = true;
    r.step();
    expect(r.p.gx).toBe(gx + 4); // facing north: right = east
    // the automatic return (view) keeps the side
    r.p.lastDragX = -1;
    r.p.unpin();
    expect(r.p.lastDragX).toBe(-1);
  });
});

describe("Story 5.23: refusal and pick hooks (AC 1, 3)", () => {
  it("a Place turned down here (at the cap counting pending) calls refused once; a chain that just ends doesn't", () => {
    const r = rig(80); // two barricades' worth
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    r.step();
    r.m.confirmPressed = true;
    r.step(); // 1st: sent, the shown wallet covers one more → chain
    r.m.confirmPressed = true;
    r.step(); // 2nd: sent, then "Not enough money for another" ends the hold: not a refusal
    expect([r.sent.length, r.p.active, r.refusedCount()]).toEqual([2, false, 0]);
    // a certain refusal: at the cap counting pending
    const q = rig();
    for (let i = 0; i < 6; i++) expect(placeBuilding(q.w, "p0", { type: "mine", gx: 10 + i * 2, gy: 10, rot: 0 }).ok).toBe(true);
    q.p.start(balance, WOOD, 20, 16, 0, -1);
    q.step();
    q.m.confirmPressed = true;
    q.step();
    expect([q.sent.length, q.refusedCount(), q.toasts.length]).toEqual([0, 1, 1]);
  });

  it("start counts picks (the scene's pop and the cursor anchor); a chain re-pin isn't a pick", () => {
    const r = rig();
    r.p.start(balance, WOOD, 20, 16, 0, -1);
    expect(r.p.picks).toBe(1);
    r.step();
    r.m.confirmPressed = true;
    r.step();
    expect([r.p.picks, r.p.places]).toEqual([1, 1]);
    r.p.start(balance, "mine", 20, 16, 0, -1);
    expect(r.p.picks).toBe(2);
  });
});
