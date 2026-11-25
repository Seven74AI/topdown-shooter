import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VOTE_BOTTOM_MIN, VOTE_BTN_H, VOTE_BTN_W, VOTE_RING_PX, VOTE_ROW_GAP } from "../../apps/client/src/ui/voteModel";

/**
 * Story 6.11 review L1 (brief 31): the vote panel's CSS (`overlay.css › .evac__*`) and the ring in
 * `EvacVote.tsx` use exactly the numbers `layoutEvacVote` gives the ONE HUD layout test, so the
 * tested layout is the drawn one. (Lives here: vitest empties CSS imports inside the client.)
 */
const UI = join(__dirname, "..", "..", "apps", "client", "src", "ui");
const css = readFileSync(join(UI, "overlay.css"), "utf8");
const tsx = readFileSync(join(UI, "EvacVote.tsx"), "utf8");

function rule(sel: string): string {
  const m = new RegExp(`${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no ${sel} rule`);
  return m[1] as string;
}
const px = (body: string, prop: string): number => Number(new RegExp(`(?:^|;|\\s)${prop}:\\s*(\\d+)px`).exec(body)?.[1]);

describe("the vote panel's CSS matches layoutEvacVote (Story 6.11 review L1)", () => {
  it("button 140 × 56, row gap 24, bottom max(14px, safe area), ring 48", () => {
    expect(css.length).toBeGreaterThan(1000); // liveness: the real file
    expect(px(rule(".evac__btn"), "width")).toBe(VOTE_BTN_W);
    expect(px(rule(".evac__btn"), "height")).toBe(VOTE_BTN_H);
    expect(px(rule(".evac__row"), "gap")).toBe(VOTE_ROW_GAP);
    expect(rule(".evac__bottom")).toContain(`max(${VOTE_BOTTOM_MIN}px, env(safe-area-inset-bottom))`);
    expect(rule(".evac__bottom")).toContain("left: 50%");
    expect(tsx).toContain(`width="${VOTE_RING_PX}" height="${VOTE_RING_PX}"`);
  });
});
