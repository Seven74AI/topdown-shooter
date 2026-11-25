import { describe, expect, it } from "vitest";
import { addPlayer, createWorld, loadBalance, placeBuilding, removeBuilding, startBuild, startWave, type SystemFn } from "@topdown/shared";
import { UndoChip, layoutUndoChip, type UndoPendingView } from "./undoChip";
import { layoutBuildCluster, layoutBuildPanel, newBuildClusterLayout, newBuildPanelLayout, readyClearLeft, readyLeftX } from "./buildBar";
import { layoutHandCluster, newHandLayout } from "./handCluster";
import { CENTRE_CLEAR_CSS_PX, layoutRowAboveCluster, newRightButtonsLayout, rectCentreGap } from "./consumableButton";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX, READY_BUTTON_BOTTOM_CSS_PX, READY_BUTTON_H_CSS_PX, READY_BUTTON_W_CSS_PX } from "../ui/sizes";

const noop: SystemFn = () => {};
const balance = loadBalance();
const WINDOW = balance.controls.build.undoWindowMs;
const RETRY = balance.controls.build.pendingTimeoutMs;

function setup() {
  const world = createWorld({ balance, seed: 1, systems: { waves: noop } });
  addPlayer(world, "local", 30, 16);
  addPlayer(world, "p1", 34, 16);
  startBuild(world);
  for (const p of world.players.values()) p.wallet = 1000;
  /** A fake pending view: order → built id, and which orders still wait. */
  const built = new Map<number, number>();
  const waiting = new Set<number>();
  const pending: UndoPendingView = { builtId: (o) => built.get(o) ?? 0, waiting: (o) => waiting.has(o) };
  const sent: number[] = [];
  const chip = new UndoChip();
  const tick = (now: number, standing = true, shown = true) => chip.update(world, "local", pending, now, WINDOW, RETRY, standing, shown, (id) => sent.push(id));
  const place = (gx: number) => {
    const r = placeBuilding(world, "local", { type: "wood_barricade", gx, gy: 20, rot: 0 });
    if (!r.ok) throw new Error(r.error);
    return r.value.id;
  };
  return { world, built, waiting, sent, chip, tick, place };
}

describe("Story 5.20: the undo chip (AC 6, 7)", () => {
  it("shows for undoWindowMs after a Place with a draining ring, then goes", () => {
    const { world, built, chip, tick, place } = setup();
    expect(WINDOW).toBe(10_000);
    chip.placed(1, 1000, world.waves.number);
    built.set(1, place(20));
    expect(tick(1000)).toBe(true);
    expect(chip.progress).toBeCloseTo(1);
    expect(tick(6000)).toBe(true);
    expect(chip.progress).toBeCloseTo(0.5);
    expect(tick(1000 + WINDOW)).toBe(false);
    expect(chip.order).toBe(0);
  });

  it("press → the building's id once (the scene sells it); a second press does nothing", () => {
    const { world, built, chip, tick, place } = setup();
    chip.placed(3, 0, world.waves.number);
    const id = place(20);
    built.set(3, id);
    tick(100);
    expect(chip.press(0)).toBe(id);
    expect(chip.press(0)).toBe(0);
    expect(tick(200)).toBe(false);
  });

  it("pressed while pending: armed (no send yet), sent once as soon as the box is my building — even after the window", () => {
    const { world, built, waiting, sent, chip, tick, place } = setup();
    chip.placed(5, 0, world.waves.number);
    waiting.add(5);
    expect(tick(100)).toBe(true);
    expect(chip.press(0)).toBe(0);
    expect(chip.armed).toBe(true);
    expect(tick(WINDOW + 500)).toBe(true); // still waiting: the window doesn't drop an armed undo
    expect(sent).toEqual([]);
    waiting.delete(5);
    const id = place(20);
    built.set(5, id);
    expect(tick(WINDOW + 600)).toBe(false);
    expect(sent).toEqual([id]);
    tick(WINDOW + 700);
    expect(sent).toEqual([id]);
  });

  it("a refused (or lost) box: nothing sent, the chip goes", () => {
    const { world, waiting, sent, chip, tick } = setup();
    chip.placed(7, 0, world.waves.number);
    waiting.add(7);
    tick(10);
    chip.press(0);
    waiting.delete(7); // refused: never built
    expect(tick(20)).toBe(false);
    expect(sent).toEqual([]);
    expect(chip.order).toBe(0);
  });

  it("a newer Place replaces the target and restarts the window", () => {
    const { world, built, chip, tick, place } = setup();
    chip.placed(1, 0, world.waves.number);
    built.set(1, place(20));
    tick(9000);
    chip.placed(2, 9000, world.waves.number);
    const id2 = place(30);
    built.set(2, id2);
    expect(tick(15_000)).toBe(true);
    expect(chip.press(0)).toBe(id2);
  });

  it("goes at the build → wave edge (an armed undo is never sent in a wave), when downed, when the building is gone; hidden (kept) behind a menu", () => {
    const a = setup();
    a.chip.placed(1, 0, a.world.waves.number);
    a.waiting.add(1);
    const late = a.place(20); // the server built it in the build phase; this client learns it after the wave started
    a.tick(10);
    a.chip.press(0);
    startWave(a.world);
    a.waiting.delete(1);
    a.built.set(1, late);
    expect(a.tick(20)).toBe(false);
    expect(a.sent).toEqual([]);

    const b = setup();
    b.chip.placed(1, 0, b.world.waves.number);
    b.built.set(1, b.place(20));
    expect(b.tick(10, true, false)).toBe(false); // menu open: hidden…
    expect(b.tick(20)).toBe(true); // …and back
    expect(b.tick(30, false)).toBe(false); // downed: gone
    expect(b.chip.order).toBe(0);

    const c = setup();
    c.chip.placed(1, 0, c.world.waves.number);
    const id = c.place(20);
    c.built.set(1, id);
    c.tick(10);
    removeBuilding(c.world, id); // destroyed / sold from the panel
    expect(c.tick(20)).toBe(false);
  });
});

describe("Story 5.20 review L1 / L3", () => {
  it("L1: a new wave number in a build phase (a hidden tab slept through a wave) clears the chip; an armed undo is not sent", () => {
    const { world, waiting, built, sent, chip, tick, place } = setup();
    world.waves.number = 2;
    chip.placed(1, 0, 2);
    waiting.add(1);
    tick(10);
    chip.press(10);
    expect(chip.armed).toBe(true);
    world.waves.number = 3; // still "build", one wave later
    waiting.delete(1);
    built.set(1, place(20));
    expect(tick(20)).toBe(false);
    expect([chip.order, sent]).toEqual([0, []]);
  });

  it("L3: after a press the chip hides until the building is gone; still standing after pendingTimeoutMs (a dropped sell): it comes back with a fresh window", () => {
    const { world, built, chip, tick, place } = setup();
    chip.placed(1, 0, world.waves.number);
    const id = place(20);
    built.set(1, id);
    tick(9000);
    expect(chip.press(9000)).toBe(id);
    expect(tick(9100)).toBe(false);
    expect(chip.press(9100)).toBe(0); // no second sell while one is out
    expect(tick(9000 + RETRY - 1)).toBe(false);
    expect(tick(9000 + RETRY)).toBe(true); // nothing removed it: offered again…
    expect(chip.progress).toBeCloseTo(1); // …with a whole window
    expect(chip.press(9000 + RETRY)).toBe(id);
    removeBuilding(world, id); // this time the server sold it
    expect(tick(9000 + RETRY + 100)).toBe(false);
    expect(chip.order).toBe(0);
  });
});

describe("Story 5.20 / 10.10: where ↶ sits (D4; re-review 1: one spot in both modes, above ⟳, outside Place / ⟳ / ✕)", () => {
  type R = { x: number; y: number; w: number; h: number };
  const sq = (r: { x: number; y: number; size: number }): R => ({ x: r.x, y: r.y, w: r.size, h: r.size });
  /** Rect gap (≥ 0 when apart; the larger of the two axis gaps). */
  const gap = (a: R, b: R) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));

  for (const [W, H] of [
    [568, 320],
    [800, 360],
    [1024, 768],
  ] as const) {
    for (const [R0, B0] of [
      [0, 0],
      [44, 21],
    ] as const) {
      it(`${W} × ${H}, insets ${R0}/${B0}: one spot in both modes: outside Place / ⟳ / ✕; ≥ 12 px from the row, the Shop chip, the quick tile, Build and Ready, ≥ 8 px from ☰ and the item chip; clear of the screen centre`, () => {
        const k = 1;
        const c = layoutBuildCluster(W, H, R0, B0, k, newBuildClusterLayout());
        const hand = layoutHandCluster(W, H, R0, B0, k, newHandLayout());
        const readyX = readyLeftX(W, READY_BUTTON_W_CSS_PX * k, readyClearLeft(layoutBuildPanel(W, H, R0, B0, k, newBuildPanelLayout())), k);
        const ready: R = { x: readyX, y: H - (READY_BUTTON_BOTTOM_CSS_PX + B0 + READY_BUTTON_H_CSS_PX) * k, w: READY_BUTTON_W_CSS_PX * k, h: READY_BUTTON_H_CSS_PX * k };
        const menu: R = { x: W - (MENU_BUTTON_INSET_CSS_PX + R0 + MENU_BUTTON_CSS_PX) * k, y: MENU_BUTTON_INSET_CSS_PX * k, w: MENU_BUTTON_CSS_PX * k, h: MENU_BUTTON_CSS_PX * k };
        const row = layoutRowAboveCluster(W, H, R0, B0, k, c.top, c.right, newRightButtonsLayout());
        const cons: R = { x: row.consX, y: row.consY, w: row.size, h: row.size };
        const swap: R = { x: row.swapX, y: row.swapY, w: row.size, h: row.size };
        const chip: R = { x: c.chipX, y: c.chipY, w: c.chip, h: c.chip };
        const quick: R = { x: c.quickX, y: c.quickY, w: c.tile, h: c.tile };
        const build: R = { x: c.buildX, y: c.buildY, w: c.tile, h: c.tile };

        const up = sq(layoutUndoChip(W, H, R0, B0, k, { x: 0, y: 0, size: 0 }));
        expect(up.w).toBe(48);
        expect([up.x + 24, H - (up.y + 24)]).toEqual([W - 164 - R0, 146 + B0]); // re-review 1: ONE spot, centre (164, 146) from the safe-area corner
        // clear of the hand cluster's Place, ⟳ and ✕ (and 12 px from ⟳, 10 px from Place): a late tap meant for them never lands on ↶
        for (const o of [hand.place, hand.rotate, hand.cancel]) expect(gap(up, sq(o)), "outside Place / ⟳ / ✕").toBeGreaterThanOrEqual(10);
        expect(gap(up, sq(hand.rotate))).toBeGreaterThanOrEqual(12);
        // hands empty: 12 px from everything of the cluster (568 × 320 with 44/21 insets: the row only 5 px — the listed tight case)
        const tight = W === 568 && R0 === 44;
        expect(gap(up, cons)).toBeGreaterThanOrEqual(tight ? 5 - 1e-6 : 12);
        for (const o of [swap, ready, menu, chip, quick, build]) expect(gap(up, o)).toBeGreaterThanOrEqual(12);
        expect(rectCentreGap(up.x, up.y, up.w, up.h, W / 2, H / 2)).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX); // the survivor stands there
        expect(up.x + up.w / 2).toBeGreaterThan(W / 2); // never in the move-stick half
        // holding: the same spot, clear of the item chip and ☰ too
        for (const o of [menu, hand.chip]) expect(gap(up, o)).toBeGreaterThanOrEqual(8);
      });
    }
  }
});
