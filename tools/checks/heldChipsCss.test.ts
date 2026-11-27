import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELD_CHIPS } from "../../apps/client/src/ui/connectionModel";
import { TOP_BAND_INSET_OVERLAP_CSS_PX } from "../../apps/client/src/scenes/hudTopLayout";

/**
 * Story 8.1 review L4: the grey "reconnecting" chips are placed by overlay.css; the one HUD layout
 * test checks the box `HELD_CHIPS` describes. This keeps the two the same: moving the chips in the
 * CSS (or changing their size) without the constant fails here.
 */
const css = readFileSync(join(__dirname, "..", "..", "apps", "client", "src", "ui", "overlay.css"), "utf8");
function rule(sel: string): string {
  const m = new RegExp(`\\n${sel.replace(".", "\\.")} \\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`overlay.css: no ${sel} rule`);
  return m[1] as string;
}
function px(block: string, prop: string): number {
  const m = new RegExp(`\\n\\s*${prop}:\\s*(?:calc\\((?:env\\([^)]*\\)|max\\(0px, env\\([^)]*\\) - 8px\\)) \\+ )?(\\d+)px`).exec(block);
  if (!m) throw new Error(`overlay.css: no ${prop} in px`);
  return Number(m[1]);
}

describe("Story 8.1 held chips: CSS = HELD_CHIPS", () => {
  it(".held-chips top / left / max-width and .held-chip height match the box the HUD layout test checks", () => {
    const chips = rule(".held-chips");
    expect(chips).toMatch(/\n\s*left:/);
    expect(chips).not.toMatch(/\n\s*(right|transform):/); // placed by top/left, as the box assumes
    expect(px(chips, "top")).toBe(HELD_CHIPS.topPx);
    expect(chips, "Story 10.5 (AC 4): the top follows the top inset, like the money line above it").toMatch(/\n\s*top:\s*calc\(max\(0px, env\(safe-area-inset-top, 0px\) - (\d+)px\) \+ \d+px\)/);
    expect(Number(/max\(0px, env\(safe-area-inset-top, 0px\) - (\d+)px\)/.exec(chips)?.[1]), "the same overlap as hudBandTop").toBe(TOP_BAND_INSET_OVERLAP_CSS_PX);
    expect(px(chips, "left")).toBe(HELD_CHIPS.leftPx);
    expect(px(chips, "max-width")).toBe(HELD_CHIPS.maxWidthPx);
    expect(px(rule(".held-chip"), "height")).toBe(HELD_CHIPS.rowPx);
  });
});
