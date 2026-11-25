import { describe, expect, it } from "vitest";
import { waveLine } from "./hudModel";
import { HP_ROW_RESERVE_CSS_PX, WIDEST_HP_TEXT, WIDEST_WAVE_LINE, hpRowText, hudTextWidths, layoutHpBlock, layoutMoneyLine, layoutWaveLine, reportHudTextWidths } from "./hudTopLayout";

const INSET = { left: 44, right: 44, top: 0, bottom: 21 };

/** Story 6.8 re-review 3 RR3-3: the reserved widths come from the strings HudScene really draws. */
describe("hudTopLayout: the widest HUD strings", () => {
  it("WIDEST_WAVE_LINE is at least as long as every wave line (waves up to 999, 9999 zombies, every mode)", () => {
    for (const wave of [0, 1, 9, 10, 25, 99, 100, 999])
      for (const remaining of [0, 7, 47, 400, 1200, 9999])
        for (const buildSecs of [-1, 0, 9, 25, 99])
          for (const endless of [false, true])
            for (const voting of [false, true]) expect(waveLine({ wave, remaining, buildSecs, endless, voting }).length).toBeLessThanOrEqual(WIDEST_WAVE_LINE.length);
  });

  it("WIDEST_HP_TEXT is at least as long as every HP text (Burning / Acid, up to 9999 HP)", () => {
    for (const hp of [0, 1, 50.5, 100, 175, 9999]) for (const max of [100, 150, 175, 9999]) for (const [b, a] of [[false, false], [true, false], [false, true], [true, true]] as const) expect(hpRowText(hp, max, b, a).length).toBeLessThanOrEqual(WIDEST_HP_TEXT.length);
  });

  it("a measurement wider than the fallback widens the keep-off rects (HudScene reports at create; a wide screen: on a phone the wave line is capped at the room right of the HP bar, Story 6.14)", () => {
    const before = { ...hudTextWidths };
    try {
      reportHudTextWidths(0, 0, 0);
      const w0 = layoutWaveLine(1600, INSET, 1, { x: 0, y: 0, w: 0, h: 0 }).w;
      const h0 = layoutHpBlock(INSET, 1, { x: 0, y: 0, w: 0, h: 0 }).w;
      const m0 = layoutMoneyLine(INSET, 1, { x: 0, y: 0, w: 0, h: 0 }).w;
      expect(h0).toBeGreaterThanOrEqual(HP_ROW_RESERVE_CSS_PX);
      reportHudTextWidths(400, 300, 200);
      expect(layoutWaveLine(1600, INSET, 1, { x: 0, y: 0, w: 0, h: 0 }).w).toBeGreaterThan(Math.max(w0, 400));
      expect(layoutHpBlock(INSET, 1, { x: 0, y: 0, w: 0, h: 0 }).w).toBeGreaterThan(Math.max(h0, 300 + 8 + 5 * 28));
      expect(layoutMoneyLine(INSET, 1, { x: 0, y: 0, w: 0, h: 0 }).w).toBeGreaterThan(Math.max(m0, 200));
    } finally {
      reportHudTextWidths(before.waveLine, before.hpText, before.money);
    }
  });
});
