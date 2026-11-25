import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RW_BTN_H, RW_BTN_MIN_W, RW_GAP, RW_MAX_W, RW_PAD, RW_TEXT_PX } from "../../apps/client/src/ui/rewardsModel";

/**
 * Story 7.2 (R9, the evacVoteCss pattern): the Results CSS (`overlay.css › .rw*`) uses exactly the numbers
 * `layoutResults` gives the layout test, so the tested layout is the drawn one; and no text in the panel is set
 * below 11 px. (Lives here: vitest empties CSS imports inside the client.)
 */
const UI = join(__dirname, "..", "..", "apps", "client", "src", "ui");
const css = readFileSync(join(UI, "overlay.css"), "utf8");

function rule(sel: string): string {
  const m = new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no ${sel} rule`);
  return m[1] as string;
}
const px = (body: string, prop: string): number => Number(new RegExp(`(?:^|;|\\s)${prop}:\\s*(\\d+)px`).exec(body)?.[1]);

describe("Results RW1 CSS matches rewardsModel (Story 7.2)", () => {
  it("pad, gap, card width ((max − gap) / 2), button 44 × 160", () => {
    expect(css.length).toBeGreaterThan(1000);
    const rw = rule(".results.rw");
    expect(px(rw, "gap")).toBe(RW_GAP);
    expect(rw).toContain(`max(${RW_PAD}px, env(safe-area-inset-bottom))`);
    expect(rw).toContain(`max(${RW_PAD}px, env(safe-area-inset-left))`);
    expect(px(rule(".rw-card"), "max-width")).toBe((RW_MAX_W - RW_GAP) / 2);
    expect(px(rule(".rw-card"), "padding")).toBe(RW_PAD);
    expect(px(rule(".btn.rw-btn"), "min-height")).toBe(RW_BTN_H);
    expect(px(rule(".btn.rw-btn"), "min-width")).toBe(RW_BTN_MIN_W);
  });

  it("R9: no font size below 11 px in the .rw* rules; the big number and heads use the model's sizes", () => {
    const block = css.slice(css.indexOf("Story 7.2 (AC 5): Results in layout RW1"));
    const sizes = [...block.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(10);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(RW_TEXT_PX.label);
    expect(rule(".rw-big__n")).toContain(`${RW_TEXT_PX.big}px`);
    expect(rule(".rw-total__n")).toContain(`${RW_TEXT_PX.total}px`);
  });
});
