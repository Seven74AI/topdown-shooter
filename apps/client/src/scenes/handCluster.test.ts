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
    expect([l.hintX, l.hintY]).toEqual([784, 360 - 196 - 24 - 6]); // 6 px above ✕'s top edge
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
