import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Follow-up L4: BossHud hides the boss bar by the tested rule (`bossBar.ts › bossBarHidden`), with the right inputs. */
describe("BossHud hides the boss bar by bossBarHidden", () => {
  it("the bar's branch is decided by bossBarHidden(m.bossVisible, showBanner, br.overBar)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "apps", "client", "src", "scenes", "BossHud.ts"), "utf8");
    expect(src).toContain("if (bossBarHidden(m.bossVisible, showBanner, br.overBar)) {");
    // showBanner and br are the banner's own timing and layout, computed before the bar
    const call = src.indexOf("bossBarHidden(m.bossVisible");
    expect(src.indexOf("const showBanner = ")).toBeGreaterThan(0);
    expect(src.indexOf("const showBanner = ")).toBeLessThan(call);
    expect(src.indexOf("const br = layoutBossBanner(")).toBeLessThan(call);
    // and the banner is drawn from the same `showBanner`
    expect(src.slice(call)).toContain("if (showBanner) {");
  });
});
