import { describe, expect, it } from "vitest";
import { layoutBossBar, type BossBarLayout } from "./bossBar";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX } from "../ui/sizes";

/**
 * Story 6.5 (AC 13, brief 31): the boss bar's layout at the HUD layout test's sizes. 6.3 creates the
 * single HUD layout test; it was not on master when this was built, so the bar's own checks live here
 * (merge note: move them into 6.3's test).
 */
const WAVE_LINE_BOTTOM_CSS = 12 + 20; // WAVE_TOP_PX + a 16 px line

function rectGap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.max(dx, dy);
}

describe("Story 6.5 boss bar layout", () => {
  for (const [w, h, insL, insT, insR] of [
    [568, 320, 44, 0, 44],
    [568, 320, 0, 0, 0],
    [640, 360, 44, 0, 21],
    [800, 360, 44, 0, 44],
    [800, 360, 0, 21, 0],
  ] as const) {
    it(`${w}×${h} insets ${insL}/${insT}/${insR}: top centre, ≥ 220 px, ≥ 12 px from ☰ and the wave line, upper third only`, () => {
      const out: BossBarLayout = { x: 0, y: 0, w: 0, h: 0, barY: 0, barH: 0 };
      layoutBossBar(w, insL, insT, insR, 1, out);
      expect(out.w).toBeGreaterThanOrEqual(220);
      expect(out.x + out.w / 2).toBeCloseTo(w / 2, 6);
      const menu = { x: w - MENU_BUTTON_INSET_CSS_PX - insR - MENU_BUTTON_CSS_PX, y: MENU_BUTTON_INSET_CSS_PX + insT, w: MENU_BUTTON_CSS_PX, h: MENU_BUTTON_CSS_PX };
      expect(rectGap(out, menu)).toBeGreaterThanOrEqual(12);
      // The health bar top-left (HudScene: 200 × 16 at 16 px inside the safe area); its HP / money texts below are short and left-aligned.
      const hp = { x: 16 + insL, y: 16 + insT, w: 200, h: 16 };
      expect(rectGap(out, hp)).toBeGreaterThanOrEqual(12);
      expect(out.y - (WAVE_LINE_BOTTOM_CSS + insT)).toBeGreaterThanOrEqual(12);
      expect(out.y + out.h).toBeLessThan(h / 3); // never down at the thumbs (the sticks live in the lower halves)
      expect(out.barY + out.barH).toBe(out.y + out.h);
    });
  }
});
