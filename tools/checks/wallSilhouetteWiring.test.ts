import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Designer pick C (2026-11-25): bodies behind standing walls glow through them; deleting the wiring must fail a test. */
const read = (...p: string[]): string => readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8");

describe("GameScene draws the silhouettes of bodies behind standing walls", () => {
  it("makes the view with the building view, updates it every frame after the buildings, and destroys it", () => {
    const src = read("scenes", "GameScene.ts");
    const made = src.indexOf("this.wallSilhouettes = new WallSilhouetteView(this, balance.controls.fx.maxWallSilhouettes);");
    expect(made).toBeGreaterThan(src.indexOf("this.buildingView = new BuildingView(this, balance);"));
    const bUpd = src.indexOf("this.buildingView?.update(host.world");
    expect(src.indexOf("this.updateWallSilhouettes(host.world);", bUpd)).toBeGreaterThan(bUpd);
    expect(src).toContain("this.wallSilhouettes?.destroy();");
    const fn = src.slice(src.indexOf("private updateWallSilhouettes(world: Readonly<World>): void {"));
    for (const s of ["bv.standingSprites()", "this.zombieView?.shownImages(this.silZombieImgs)", "v.bodyImage", "SLOT_COLORS[", "sv.update(walls, this.silBodies, n, this.time.now, darknessAlpha(world as World) > 0)"]) expect(fn.slice(0, 1600)).toContain(s);
  });

  it("BuildingView lists its standing walls and corners for it, on every re-lay", () => {
    const src = read("render", "BuildingView.ts");
    expect(src).toContain("this.standingImgs.length = 0;");
    expect(src).toContain("for (const c of this.corners) if (c.visible) this.standingImgs.push(c);");
  });
});

describe("review L3: the silhouettes are cropped to their wall (never over open street), with no mask filter", () => {
  it("WallSilhouetteView crops each copy by silhouetteCrop and skips bodies with no covering wall or crop", () => {
    const src = read("render", "WallSilhouetteView.ts");
    expect(src).toContain("const wi = coveringWall(img.x, img.y, b.r, this.pics, nw);");
    expect(src).toContain("if (wi < 0) continue;");
    expect(src).toContain("const c = silhouetteCrop(g, this.pics[wi] as WallPic, this.crop);");
    expect(src).toContain("if (!c) continue;");
    expect(src).toContain(".setRotation(c.rotation)");
    expect(src).toContain(".setCrop(c.x, c.y, c.w, c.h)");
    expect(src).not.toContain("addMask");
    expect(src).toContain("n < this.cap");
  });
});
