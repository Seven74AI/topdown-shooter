import { describe, expect, it } from "vitest";
import { addPlayer, createWorld, loadBalance, placeBuilding, removeBuilding, startBuild, startWave, type SystemFn } from "@topdown/shared";
import { UndoChip, layoutUndoChip, type UndoPendingView } from "./undoChip";
import { layoutBuildBar, newBuildBarLayout, readyLeftX } from "./buildBar";
import { layoutHandCluster, newHandLayout } from "./handCluster";
import { CENTRE_CLEAR_CSS_PX, layoutRightButtons, newRightButtonsLayout, rectCentreGap } from "./consumableButton";
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

describe("Story 5.20: where ↶ sits (D4, alignment Q4, review M2)", () => {
  type R = { x: number; y: number; w: number; h: number };
  const sq = (r: { x: number; y: number; size: number }): R => ({ x: r.x, y: r.y, w: r.size, h: r.size });
  /** Rect gap (≥ 0 when apart; the larger of the two axis gaps). */
  const gap = (a: R, b: R) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
  /** Circle gap for two round buttons. */
  const cgap = (a: R, b: R) => Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2)) - a.w / 2 - b.w / 2;

  for (const [W, H] of [
    [568, 320],
    [800, 360],
    [1024, 768],
  ] as const) {
    it(`${W} × ${H}: ≥ 12 px from 5.12's real consumable/swap row (L6 fallback included), Ready, the tiles, the count line, the hand cluster, the item chip and ☰; clear of the screen centre`, () => {
      const k = 1;
      const bar = layoutBuildBar(W, H, 0, 0, k, newBuildBarLayout());
      const hand = layoutHandCluster(W, H, 0, 0, k, newHandLayout());
      const readyX = readyLeftX(W, READY_BUTTON_W_CSS_PX * k, bar.left, k);
      const ready: R = { x: readyX, y: H - (READY_BUTTON_BOTTOM_CSS_PX + READY_BUTTON_H_CSS_PX) * k, w: READY_BUTTON_W_CSS_PX * k, h: READY_BUTTON_H_CSS_PX * k };
      const menu: R = { x: W - (MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX) * k, y: MENU_BUTTON_INSET_CSS_PX * k, w: MENU_BUTTON_CSS_PX * k, h: MENU_BUTTON_CSS_PX * k };
      // Story 5.12's row exactly as 5.12's HudScene lays it out (gridRight = the count line's x).
      const row = layoutRightButtons(W, H, 0, 0, k, true, bar.left, bar.top, newRightButtonsLayout(), bar.countX);
      const cons: R = { x: row.consX, y: row.consY, w: row.size, h: row.size };
      const swap: R = { x: row.swapX, y: row.swapY, w: row.size, h: row.size };
      const count: R = { x: bar.countX - 40, y: bar.countY - 20, w: 40, h: 20 }; // "6/6" (≈ 40 × 20 at 15 px)
      const grid: R = { x: bar.left, y: bar.top, w: W, h: H };

      const up = sq(layoutUndoChip(W, H, 0, 0, bar.left, bar.top, bar.countX, k, false, { x: 0, y: 0, size: 0 }));
      expect(up.w).toBe(48);
      expect(cgap(up, cons)).toBeGreaterThanOrEqual(12);
      for (const o of [cons, swap, ready, menu, grid, count]) expect(gap(up, o)).toBeGreaterThanOrEqual(12);
      expect(up.x).toBeGreaterThanOrEqual(16);
      expect(up.y).toBeGreaterThanOrEqual(MENU_BUTTON_INSET_CSS_PX);
      expect(rectCentreGap(up.x, up.y, up.w, up.h, W / 2, H / 2)).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX); // the survivor stands there (5.12 L6's rule)
      expect(Math.abs(up.y + up.h / 2 - (row.consY + row.size / 2))).toBeLessThan(0.01); // on 5.12's row

      // Holding: Ready, the bar and 5.12's row are hidden (5.15 / 5.12), so only the hand cluster, the chip and ☰ count.
      const held = sq(layoutUndoChip(W, H, 0, 0, bar.left, bar.top, bar.countX, k, true, { x: 0, y: 0, size: 0 }));
      expect([held.x + 24, H - (held.y + 24)]).toEqual([W - 270, 64]); // ux-spec §4: centre (270, 64) from the bottom-right
      for (const o of [hand.place, hand.rotate, hand.cancel]) expect(cgap(held, sq(o))).toBeGreaterThanOrEqual(12);
      for (const o of [menu, hand.chip]) expect(gap(held, o)).toBeGreaterThanOrEqual(12);
      expect(held.y).toBeGreaterThan(H / 2); // the bottom: away from the survivor at the screen centre
      expect(held.y + held.h).toBeLessThanOrEqual(H - 16);
    });
  }

  it("568 × 320 takes 5.12's L6 branch (the row right-aligned above the count line), and ↶ follows it", () => {
    const bar = layoutBuildBar(568, 320, 0, 0, 1, newBuildBarLayout());
    const row = layoutRightButtons(568, 320, 0, 0, 1, true, bar.left, bar.top, newRightButtonsLayout(), bar.countX);
    expect(row.consX).toBeGreaterThan(bar.left); // L6: not at the grid's left
    const up = layoutUndoChip(568, 320, 0, 0, bar.left, bar.top, bar.countX, 1, false, { x: 0, y: 0, size: 0 });
    expect(up.x + up.size + 12).toBe(row.consX);
  });
});
