import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Designer pick C (2026-11-25): bodies behind standing walls glow through them; deleting the wiring must fail a test. */
const read = (...p: string[]): string => readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8");

describe("GameScene draws the silhouettes of bodies behind standing walls", () => {
  it("makes the view with the building view, updates it every frame after the buildings, and destroys it", () => {
    const src = read("scenes", "GameScene.ts");
    const made = src.indexOf("this.wallSilhouettes = new WallSilhouetteView(this);");
    expect(made).toBeGreaterThan(src.indexOf("this.buildingView = new BuildingView(this, balance);"));
    const bUpd = src.indexOf("this.buildingView?.update(host.world");
    expect(src.indexOf("this.updateWallSilhouettes();", bUpd)).toBeGreaterThan(bUpd);
    expect(src).toContain("this.wallSilhouettes?.destroy();");
    const fn = src.slice(src.indexOf("private updateWallSilhouettes(): void {"));
    for (const s of ["bv.standingSprites()", "this.zombieView?.forEachShown(", "v.bodyImage", "sv.update(walls, this.silBodies, this.time.now)"]) expect(fn.slice(0, 1400)).toContain(s);
  });

  it("BuildingView lists its standing walls and corners for it, on every re-lay", () => {
    const src = read("render", "BuildingView.ts");
    expect(src).toContain("this.standingImgs.length = 0;");
    expect(src).toContain("for (const c of this.corners) if (c.visible) this.standingImgs.push(c);");
  });
});
