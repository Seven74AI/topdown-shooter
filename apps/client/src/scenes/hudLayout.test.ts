import { describe, expect, it } from "vitest";
import { ACTION_IDS, layoutActionBar, newActionBarLayout } from "./actionBar";
import { BUILD_BAR_SLOTS, layoutBuildBar, newBuildBarLayout, readyLeftX } from "./buildBar";
import { CENTRE_CLEAR_CSS_PX, layoutRightButtons, newRightButtonsLayout, rectCentreGap } from "./consumableButton";
import { layoutHandCluster, newHandLayout } from "./handCluster";
import { layoutUndoChip } from "./undoChip";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX, READY_BUTTON_BOTTOM_CSS_PX, READY_BUTTON_H_CSS_PX, READY_BUTTON_W_CSS_PX } from "../ui/sizes";

/**
 * EPIC 6 BRIEF line 31 — THE ONE HUD LAYOUT TEST (created by Story 6.3). Every on-screen control, in
 * every HUD mode, at 568 × 320 and 640 × 360 with safe-area insets 44 (sides) / 21 (bottom):
 * no two pressable controls overlap, all inside the safe area, every one keeps 48 px clear of the
 * survivor at the screen centre, and none is centred in the move-stick (left) half — beyond the
 * Epic 5 as-built baseline below.
 *
 * Epic 6 stories ADD their HUD here (6.5 boss bar, 6.8 event banners and markers' edge arrows,
 * 6.11 vote panel, 8.7 pings): add a rect to the mode it shows in. Don't check layout story by story.
 *
 * Baseline (Stories 5.15–5.21 as built and approved, kept by brief 27): on these small screens Ready
 * (40 px left of centre), the build bar's first tiles, the hand cluster's ⟳ / item chip / ↶ and the
 * action bar's Move / Upgrade come within 48 px of the centre or sit in the left half. 6.3 lists
 * them exactly (`KNOWN_LIST`) and marked them OPEN FOR DESIGNER; no overlap, nothing off the safe area.
 */
interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const SIZES: readonly [number, number][] = [
  [568, 320],
  [640, 360],
];
const INSET = { left: 44, right: 44, top: 0, bottom: 21 } as const;
const K = 1; // CSS px (the layouts scale every number by dpr alike)

/** ☰ (Story 2.11, HudScene › layoutMenuButton): top right inside the safe area. */
function menu(w: number): Box {
  const s = MENU_BUTTON_CSS_PX * K;
  return { id: "menu", x: w - (MENU_BUTTON_INSET_CSS_PX + INSET.right) * K - s, y: (MENU_BUTTON_INSET_CSS_PX + INSET.top) * K, w: s, h: s };
}

/** Every mode's pressable controls. */
function modes(w: number, h: number): Record<string, Box[]> {
  const bar = layoutBuildBar(w, h, INSET.right, INSET.bottom, K, newBuildBarLayout());
  const tiles: Box[] = Array.from({ length: BUILD_BAR_SLOTS }, (_, s) => ({ id: `tile${s}`, x: bar.x[s] as number, y: bar.y[s] as number, w: bar.tile, h: bar.tile }));
  const wave = layoutRightButtons(w, h, INSET.right, INSET.bottom, K, false, 0, 0, newRightButtonsLayout());
  const row = layoutRightButtons(w, h, INSET.right, INSET.bottom, K, true, bar.left, bar.top, newRightButtonsLayout(), bar.countX);
  const rw = READY_BUTTON_W_CSS_PX * K;
  const rh = READY_BUTTON_H_CSS_PX * K;
  const ready: Box = { id: "ready", x: readyLeftX(w, rw, bar.left, K), y: h - (READY_BUTTON_BOTTOM_CSS_PX + INSET.bottom) * K - rh, w: rw, h: rh };
  const undoBar = layoutUndoChip(w, h, INSET.right, INSET.bottom, bar.left, bar.top, bar.countX, K, false, { x: 0, y: 0, size: 0 });
  const undoHand = layoutUndoChip(w, h, INSET.right, INSET.bottom, bar.left, bar.top, bar.countX, K, true, { x: 0, y: 0, size: 0 });
  const hand = layoutHandCluster(w, h, INSET.right, INSET.bottom, K, newHandLayout(), INSET.top);
  const act = layoutActionBar(w, h, INSET.right, INSET.bottom, K, ACTION_IDS.map(() => true), newActionBarLayout());
  const sq = (id: string, x: number, y: number, s: number): Box => ({ id, x, y, w: s, h: s });
  return {
    wave: [menu(w), sq("swap", wave.swapX, wave.swapY, wave.size), sq("consumable", wave.consX, wave.consY, wave.size)],
    build: [menu(w), ...tiles, ready, sq("consumable", row.consX, row.consY, row.size), sq("swap", row.swapX, row.swapY, row.size), sq("undo", undoBar.x, undoBar.y, undoBar.size)],
    holding: [
      menu(w),
      sq("place", hand.place.x, hand.place.y, hand.place.size),
      sq("rotate", hand.rotate.x, hand.rotate.y, hand.rotate.size),
      sq("cancel", hand.cancel.x, hand.cancel.y, hand.cancel.size),
      { id: "chip", x: hand.chip.x, y: hand.chip.y, w: hand.chip.w, h: hand.chip.h },
      sq("undo", undoHand.x, undoHand.y, undoHand.size),
    ],
    selected: [menu(w), ...act.rects.filter((r) => r.visible).map((r, i) => ({ id: `action_${ACTION_IDS[i]}`, x: r.x, y: r.y, w: r.w, h: r.h }))],
  };
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Every rule break of a layout (empty = clean). */
function violations(w: number, h: number): string[] {
  const out: string[] = [];
  for (const [mode, boxes] of Object.entries(modes(w, h))) {
    for (const b of boxes) {
      if (b.x < INSET.left * K - 1e-6 || b.x + b.w > w - INSET.right * K + 1e-6 || b.y < 0 || b.y + b.h > h - INSET.bottom * K + 1e-6) out.push(`${w}x${h} ${mode} ${b.id}: outside the safe area`);
      if (rectCentreGap(b.x, b.y, b.w, b.h, w / 2, h / 2) < CENTRE_CLEAR_CSS_PX * K - 1e-6) out.push(`${w}x${h} ${mode} ${b.id}: within 48 px of the centre`);
      if (b.x + b.w / 2 < w / 2) out.push(`${w}x${h} ${mode} ${b.id}: in the move-stick half`);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i] as Box;
        const b = boxes[j] as Box;
        if (overlaps(a, b)) out.push(`${w}x${h} ${mode} ${a.id} overlaps ${b.id}`);
      }
    }
  }
  return out;
}

/**
 * The Epic 5 HUD AS BUILT (designer-approved layouts, brief 27: Epic 6 doesn't move them) breaks the
 * brief-31 rules in exactly these places at these sizes. 6.3 records them as the baseline (OPEN FOR
 * DESIGNER); the test fails on ANY other break, so a new control (boss bar, vote panel, banners,
 * arrows) must come in clean, and fixing one of these means deleting its line.
 */
const KNOWN_LIST: string[] = [
  "568x320 build tile0: within 48 px of the centre",
  "568x320 build tile1: within 48 px of the centre",
  "568x320 build ready: in the move-stick half",
  "568x320 holding rotate: within 48 px of the centre",
  "568x320 holding chip: within 48 px of the centre",
  "568x320 holding undo: in the move-stick half",
  "568x320 selected action_move: within 48 px of the centre",
  "568x320 selected action_move: in the move-stick half",
  "568x320 selected action_upgrade: within 48 px of the centre",
  "640x360 build tile0: within 48 px of the centre",
  "640x360 build ready: in the move-stick half",
  "640x360 holding chip: within 48 px of the centre",
  "640x360 selected action_move: within 48 px of the centre",
  "640x360 selected action_move: in the move-stick half",
  "640x360 selected action_upgrade: within 48 px of the centre",
];
const KNOWN_AS_BUILT = new Set<string>(KNOWN_LIST);

describe("ONE HUD LAYOUT TEST (EPIC 6 BRIEF line 31)", () => {
  for (const [w, h] of SIZES) {
    it(`${w} × ${h}: every mode's controls are listed, and nothing breaks a rule beyond the as-built baseline`, () => {
      const m = modes(w, h);
      for (const [mode, boxes] of Object.entries(m)) expect(boxes.length, mode).toBeGreaterThanOrEqual(3); // liveness
      const v = violations(w, h);
      expect(v.filter((x) => !KNOWN_AS_BUILT.has(x)), "new HUD layout breaks").toEqual([]);
      expect([...KNOWN_AS_BUILT].filter((x) => x.startsWith(`${w}x${h} `) && !v.includes(x)), "a baseline line no longer happens: delete it").toEqual([]);
    });
  }

  it("the baseline holds no overlap and nothing outside the safe area (only the centre gap and the move-stick half)", () => {
    for (const x of KNOWN_AS_BUILT) expect(x).toMatch(/: (within 48 px of the centre|in the move-stick half)$/);
  });

  it("the checks bite: a box at the centre is caught (self-check)", () => {
    expect(rectCentreGap(284 - 10, 160 - 10, 20, 20, 284, 160)).toBe(0);
    expect(overlaps({ id: "a", x: 0, y: 0, w: 10, h: 10 }, { id: "b", x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });
});

