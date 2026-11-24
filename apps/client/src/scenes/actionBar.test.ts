import { describe, expect, it } from "vitest";
import { ACTION_BAR, ACTION_INFO_CSS_PX, MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX } from "../ui/sizes";
import { ACTION_IDS, actionLabel, layoutActionBar, newActionBarLayout } from "./actionBar";

/** Story 5.21 (AC 1, 5; designer Q4): 78 × 56 at centre bottom 112, right-aligned at 16; checked at the small-phone sizes. */
const SIZES = [
  [568, 320],
  [800, 360],
  [1024, 768],
] as const;
const ALL = [true, true, true, true, true];
/** Info + next tier / owner line + reason line, 16 px text with its stroke (≈ 1.35 line height). */
const INFO_LINES_PX = 3 * ACTION_INFO_CSS_PX * 1.35; // unwrapped (800 px and up); 568 px wraps at 14 px: checked in the browser shots

describe("layoutActionBar (Story 5.21)", () => {
  for (const [W, H] of SIZES) {
    for (const insets of [
      { r: 0, b: 0, t: 0 },
      { r: 44, b: 21, t: 0 },
    ]) {
      it(`${W} × ${H} (insets r ${insets.r} b ${insets.b}): 5 buttons 78 × 56, 8 apart, right edge 16 in, centre 112 up; clear of ☰ and the screen centre; info lines on screen`, () => {
        const l = layoutActionBar(W, H, insets.r, insets.b, 1, ALL, newActionBarLayout());
        const r = l.rects.filter((b) => b.visible);
        expect(r.length).toBe(W < 700 ? 4 : 5); // review L1: no ✕ below 700 px
        expect(l.rects[ACTION_IDS.indexOf("close")]?.visible).toBe(W >= 700);
        expect(r.every((b) => b.w === ACTION_BAR.wCss && b.h === ACTION_BAR.hCss)).toBe(true);
        for (let i = 1; i < r.length; i++) expect((r[i]?.x ?? 0) - ((r[i - 1]?.x ?? 0) + (r[i - 1]?.w ?? 0))).toBe(ACTION_BAR.gapCss);
        expect(l.rowLeft).toBe(r[0]?.x);
        const last = r[r.length - 1];
        expect(W - insets.r - ((last?.x ?? 0) + (last?.w ?? 0))).toBe(ACTION_BAR.rightCss);
        const up = H - insets.b - ((r[0]?.y ?? 0) + ACTION_BAR.hCss / 2);
        if (H - insets.b - ACTION_BAR.centreBottomCss - ACTION_BAR.hCss / 2 >= H / 2 + 12) expect(up).toBe(ACTION_BAR.centreBottomCss);
        else expect(up).toBeLessThan(ACTION_BAR.centreBottomCss); // the short-screen fallback (568 × 320 with a 21 px inset)
        expect(H - insets.b - ((r[0]?.y ?? 0) + ACTION_BAR.hCss)).toBeGreaterThanOrEqual(16);
        expect(r[0]?.x ?? -1).toBeGreaterThanOrEqual(16); // fits the width with the 16 px edge
        // ☰ top-right: the bar and its info lines stay ≥ 12 px below it
        const menuBottom = MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX + insets.t;
        expect(l.infoBottom - INFO_LINES_PX - menuBottom).toBeGreaterThanOrEqual(12);
        expect(l.rowTop - l.infoBottom).toBe(ACTION_BAR.infoGapCss);
        // the survivor stands at the screen centre: the row starts ≥ 12 px below it, the info lines wrap 24 px right of it
        expect(l.rowTop - H / 2).toBeGreaterThanOrEqual(12);
        expect(l.infoRight - l.infoMaxW - W / 2).toBe(24);
        expect(l.infoPx).toBe(W < 700 ? 14 : 16);
      });
    }
  }

  it("review L1: below 700 px there is no ✕ (a teammate's bar is Repair alone at the right edge; an owner's 4 buttons reach 68 px less far left)", () => {
    const t = layoutActionBar(640, 360, 0, 0, 1, [false, false, false, false, false], newActionBarLayout());
    expect(ACTION_IDS.filter((_, i) => t.rects[i]?.visible)).toEqual(["repair"]);
    expect((t.rects[2]?.x ?? 0) + 78).toBe(640 - 16);
    const wide = layoutActionBar(700, 360, 0, 0, 1, ALL, newActionBarLayout());
    const narrow = layoutActionBar(699, 360, 0, 0, 1, ALL, newActionBarLayout());
    expect(wide.rects[4]?.visible).toBe(true);
    expect(narrow.rects[4]?.visible).toBe(false);
    expect(narrow.rowLeft - (699 - 16 - 336)).toBe(0);
  });

  it("absent buttons close up to the right: a teammate's building shows Repair and ✕ only, at the right edge", () => {
    const l = layoutActionBar(800, 360, 0, 0, 1, [false, false, false, false, false], newActionBarLayout());
    const vis = ACTION_IDS.filter((_, i) => l.rects[i]?.visible);
    expect(vis).toEqual(["repair", "close"]);
    const repair = l.rects[ACTION_IDS.indexOf("repair")];
    const close = l.rects[ACTION_IDS.indexOf("close")];
    expect((close?.x ?? 0) + (close?.w ?? 0)).toBe(800 - 16);
    expect((close?.x ?? 0) - ((repair?.x ?? 0) + (repair?.w ?? 0))).toBe(8);
    expect(l.rowLeft).toBe(repair?.x);
  });

  it("my top-tier building (no Upgrade): Move, Repair, Sell, ✕", () => {
    const l = layoutActionBar(800, 360, 0, 0, 1, [true, false, true, true, true], newActionBarLayout());
    expect(ACTION_IDS.filter((_, i) => l.rects[i]?.visible)).toEqual(["move", "repair", "sell", "close"]);
    const move = l.rects[0];
    const repair = l.rects[2];
    expect((repair?.x ?? 0) - ((move?.x ?? 0) + (move?.w ?? 0))).toBe(8);
  });

  it("scales with dpr", () => {
    const a = layoutActionBar(800, 360, 0, 0, 1, ALL, newActionBarLayout());
    const b = layoutActionBar(1600, 720, 0, 0, 2, ALL, newActionBarLayout());
    expect(b.rects.map((r) => [r.x, r.y, r.w])).toEqual(a.rects.map((r) => [r.x * 2, r.y * 2, r.w * 2]));
  });
});

describe("actionLabel (Story 5.21, D4)", () => {
  it("puts the price on its own line; labels without a price stay", () => {
    expect(actionLabel("Upgrade $50")).toBe("Upgrade\n$50");
    expect(actionLabel("Repair $20")).toBe("Repair\n$20");
    expect(actionLabel("Take back +$40")).toBe("Take back\n+$40");
    expect(actionLabel("Sell +$20")).toBe("Sell\n+$20");
    expect(actionLabel("Upgrading…")).toBe("Upgrading…");
    expect(actionLabel("Repair full HP")).toBe("Repair full HP");
  });
});
