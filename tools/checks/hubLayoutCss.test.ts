import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PH_ACTION_W, PH_BACK, PH_BTN_H, PH_GAP, PH_ICON_H, PH_ICON_W, PH_MAX_W, PH_PAD, PH_ROW_H, PH_RULE_H, PH_TAB_H, PH_TAB_W, PH_TEXT_PX } from "../../apps/client/src/ui/hubModel";

/**
 * Story 7.3 (R9, the resultsLayoutCss pattern): the hub CSS (`overlay.css › .ph*`) uses exactly the numbers
 * `layoutHub` gives the layout test, so the tested layout is the drawn one; and no text in the hub is below 11 px.
 */
const css = readFileSync(join(__dirname, "..", "..", "apps", "client", "src", "ui", "overlay.css"), "utf8");

function rule(sel: string): string {
  const m = new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no ${sel} rule`);
  return m[1] as string;
}
const px = (body: string, prop: string): number => Number(new RegExp(`(?:^|;|\\s)${prop}:\\s*(\\d+)px`).exec(body)?.[1]);

describe("Progress hub PH1 CSS matches hubModel (Story 7.3)", () => {
  it("frame, header, tabs, list, rows and button use the model's numbers", () => {
    const ph = rule(".menu.ph");
    expect(ph).toContain(`max(${PH_PAD}px, env(safe-area-inset-left))`);
    expect(ph).toContain(`max(${PH_PAD}px, env(safe-area-inset-bottom))`);
    expect(px(rule(".ph-frame"), "max-width")).toBe(PH_MAX_W);
    expect(px(rule(".ph-frame"), "gap")).toBe(PH_GAP);
    expect(px(rule(".ph-head"), "height")).toBe(PH_BACK);
    expect(px(rule(".ph-back"), "width")).toBe(PH_BACK);
    expect(px(rule(".ph-back"), "height")).toBe(PH_BACK);
    expect(px(rule(".ph-rule"), "height")).toBe(PH_RULE_H);
    expect(px(rule(".ph-tabs"), "height")).toBe(PH_TAB_H);
    expect(px(rule(".ph-tab"), "width")).toBe(PH_TAB_W);
    expect(px(rule(".ph-tab"), "height")).toBe(PH_TAB_H);
    expect(px(rule(".ph-list"), "padding")).toBe(PH_PAD);
    expect(rule(".ph-row")).toContain(`grid-template-columns: ${PH_ICON_W}px minmax(0, 1fr) ${PH_ACTION_W}px`);
    expect(px(rule(".ph-row"), "min-height")).toBe(PH_ROW_H);
    expect(px(rule(".ph-icon"), "width")).toBe(PH_ICON_W);
    expect(px(rule(".ph-icon"), "height")).toBe(PH_ICON_H);
    expect(px(rule(".ph-btn"), "width")).toBe(PH_ACTION_W);
    expect(px(rule(".ph-btn"), "height")).toBe(PH_BTN_H);
    // the header, the rule line and the tabs keep their height: only the list scrolls (a squeezed rule line hid U1)
    for (const sel of [".ph-head", ".ph-rule", ".ph-tabs"]) expect(rule(sel)).toContain("flex: 0 0 auto");
  });

  it("R9: no font size below 11 px in the .ph* rules; names, title and buttons use the model's sizes", () => {
    const block = css.slice(css.indexOf("Story 7.3 (AC 6–8): the Progress hub in layout PH1"));
    const sizes = [...block.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(15);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(PH_TEXT_PX.label);
    expect(rule(".ph-title")).toContain(`${PH_TEXT_PX.title}px`);
    expect(rule(".ph-name")).toContain(`${PH_TEXT_PX.name}px`);
    expect(rule(".ph-line")).toContain(`${PH_TEXT_PX.line}px`);
    expect(rule(".ph-btn")).toContain(`${PH_TEXT_PX.button}px`);
    expect(rule(".ph-supplies__n")).toContain(`${PH_TEXT_PX.supplies}px`);
  });
});
