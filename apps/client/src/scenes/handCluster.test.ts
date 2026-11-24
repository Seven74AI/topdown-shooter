import { describe, expect, it } from "vitest";
import { layoutHandCluster, newHandLayout, type HandRect } from "./handCluster";
import { HAND_HINT_LINE_CSS_PX, MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX, MIN_BUTTON_CSS_PX } from "../ui/sizes";

/** Gap between two circles (centre distance minus both radii). */
const gap = (a: HandRect, b: HandRect) => Math.hypot(a.x + a.size / 2 - (b.x + b.size / 2), a.y + a.size / 2 - (b.y + b.size / 2)) - a.size / 2 - b.size / 2;
const overlap = (a: HandRect, b: HandRect) => a.x < b.x + b.size && b.x < a.x + a.size && a.y < b.y + b.size && b.y < a.y + a.size;

describe("Story 5.15: the hand cluster (ux-spec §4)", () => {
  it("puts Place 76 px at (92, 92), ⟳ 60 px at (190, 80), ✕ 48 px at (80, 196) from the bottom-right corner", () => {
    const l = layoutHandCluster(800, 360, 0, 0, 1, newHandLayout());
    expect(l.place).toEqual({ x: 800 - 92 - 38, y: 360 - 92 - 38, size: 76 });
    expect(l.rotate).toEqual({ x: 800 - 190 - 30, y: 360 - 80 - 30, size: 60 });
    expect(l.cancel).toEqual({ x: 800 - 80 - 24, y: 360 - 196 - 24, size: 48 });
    expect([l.hintX, l.hintY]).toEqual([784, 360 - 196 - 24 - 8 - 32 - 6]); // Story 5.19: 6 px above the chip, which is 8 px above ✕
  });

  it("every target ≥ 48 px, ≥ 12 px apart, hit rects never overlap, inside the screen, above the hint line; insets and dpr respected", () => {
    for (const [k, r, b] of [[1, 0, 0], [2, 0, 0], [3, 24, 16]] as const) {
      const W = 800 * k;
      const H = 360 * k;
      const l = layoutHandCluster(W, H, r, b, k, newHandLayout());
      const all = [l.place, l.rotate, l.cancel];
      for (const t of all) {
        expect(t.size).toBeGreaterThanOrEqual(Math.max(48, MIN_BUTTON_CSS_PX) * k);
        expect(t.x + t.size).toBeLessThanOrEqual(W - (16 + r) * k);
        expect(t.y + t.size).toBeLessThanOrEqual(H - (16 + b) * k);
        expect(t.x).toBeGreaterThan(W / 2); // the right half: the left thumb keeps the move stick
        expect(t.y).toBeGreaterThan(l.hintY);
      }
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) {
          expect(gap(all[i] as HandRect, all[j] as HandRect)).toBeGreaterThanOrEqual(12 * k);
          expect(overlap(all[i] as HandRect, all[j] as HandRect)).toBe(false);
        }
    }
  });

  it("review L3: the safe-area insets move every button and the hint by exactly the inset (× dpr)", () => {
    const k = 2;
    const l = layoutHandCluster(800 * k, 360 * k, 24, 16, k, newHandLayout());
    expect(l.place).toEqual({ x: 800 * k - (92 + 24) * k - 38 * k, y: 360 * k - (92 + 16) * k - 38 * k, size: 76 * k });
    expect(l.rotate).toEqual({ x: 800 * k - (190 + 24) * k - 30 * k, y: 360 * k - (80 + 16) * k - 30 * k, size: 60 * k });
    expect(l.cancel).toEqual({ x: 800 * k - (80 + 24) * k - 24 * k, y: 360 * k - (196 + 16) * k - 24 * k, size: 48 * k });
    expect([l.hintX, l.hintY]).toEqual([800 * k - (16 + 24) * k, l.cancel.y - 6 * k]);
  });

  it("review L5: on a 568 × 320 phone (and 800 × 360) the hint line stays below ☰ / ⚙ and above the buttons", () => {
    for (const [W, H] of [[568, 320], [800, 360], [1024, 768]] as const) {
      const l = layoutHandCluster(W, H, 0, 0, 1, newHandLayout());
      const menuBottom = MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX;
      expect(l.hintY - HAND_HINT_LINE_CSS_PX).toBeGreaterThanOrEqual(menuBottom + 4);
      expect(l.hintY).toBeLessThanOrEqual(Math.min(l.place.y, l.rotate.y, l.cancel.y));
    }
  });
});

describe("Story 5.19: the item chip (ux-spec §4, D7)", () => {
  const rectOverlap = (a: { x: number; y: number; w: number; h: number }, b: HandRect) => a.x < b.x + b.size && b.x < a.x + a.w && a.y < b.y + b.size && b.y < a.y + a.h;

  it("800 × 360: 160 × 32 right-aligned 16 px in, 8 px above ✕, the reason line 6 px above it and clear of ☰", () => {
    const l = layoutHandCluster(800, 360, 0, 0, 1, newHandLayout());
    expect(l.chipRow).toBe(false);
    expect(l.chip).toEqual({ x: 800 - 16 - 160, y: l.cancel.y - 8 - 32, w: 160, h: 32 });
    expect(l.hintY).toBe(l.chip.y - 6);
    expect(l.hintY - HAND_HINT_LINE_CSS_PX).toBeGreaterThanOrEqual(MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX + 4);
  });

  it("568 × 320 (and a notch's top inset at 360): the chip moves left of ✕ on its row, 12 px away; the reason line stays above ✕", () => {
    const l = layoutHandCluster(568, 320, 0, 0, 1, newHandLayout());
    expect(l.chipRow).toBe(true);
    expect(l.chip).toEqual({ x: l.cancel.x - 12 - 160, y: l.cancel.y + 24 - 16, w: 160, h: 32 });
    expect(l.hintY).toBe(l.cancel.y - 6);
    expect(layoutHandCluster(800, 360, 0, 0, 1, newHandLayout(), 20).chipRow).toBe(true);
  });

  it("the chip never overlaps Place, ⟳, ✕ or ☰, sits in the right half, inside the screen and below the reason line; dpr and insets respected", () => {
    for (const [W, H, k, r, b, t] of [[800, 360, 1, 0, 0, 0], [800, 360, 2, 0, 0, 0], [568, 320, 2, 0, 0, 0], [844, 390, 3, 44, 21, 0], [1024, 768, 1, 0, 0, 0], [640, 360, 2, 0, 0, 0]] as const) {
      const l = layoutHandCluster(W * k, H * k, r, b, k, newHandLayout(), t);
      const c = l.chip;
      expect([c.w, c.h]).toEqual([160 * k, 32 * k]);
      for (const btn of [l.place, l.rotate, l.cancel]) expect(rectOverlap(c, btn), `${W}x${H}`).toBe(false);
      const menuBottom = (MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX + t) * k;
      expect(c.y).toBeGreaterThanOrEqual(menuBottom);
      expect(c.x).toBeGreaterThan((W * k) / 2);
      expect(c.x + c.w).toBeLessThanOrEqual(W * k - (16 + r) * k);
      expect(l.hintY).toBeLessThanOrEqual(c.y);
      expect(l.hintY - HAND_HINT_LINE_CSS_PX * k).toBeGreaterThanOrEqual(menuBottom + 4 * k);
    }
  });
});
