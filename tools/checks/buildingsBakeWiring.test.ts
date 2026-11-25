import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Review L4 (asset art review 2026-11-25): the relit pictures only reach the screen through the bake pump; deleting the
 * call would leave every building on its plain drawing and no other test would fail. Also the gallery's full bake and
 * the cache-phase registration (review M3: Android emptying the cached canvases).
 */
const read = (...p: string[]): string => readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8");

describe("the buildings atlas bake is wired", () => {
  it("BuildingView pumps it every frame, from update()", () => {
    const src = read("render", "BuildingView.ts");
    const upd = src.indexOf("  update(world: Readonly<World>");
    expect(upd).toBeGreaterThan(0);
    const body = src.slice(upd, src.indexOf("\n  }\n", upd));
    expect(body).toContain("pumpBuildingsAtlas();");
  });

  it("the asset gallery bakes everything before it cuts the frames", () => {
    const src = read("gallery", "collect.ts");
    const ensure = src.indexOf("ensureBuildingsAtlas(this, { worker: false });");
    expect(ensure).toBeGreaterThan(0);
    expect(src.indexOf("pumpBuildingsAtlas(Infinity, Infinity);")).toBeGreaterThan(ensure);
  });

  it("the relit cache is registered for a graphics restore (cache phase re-queues the bake)", () => {
    const src = read("render", "city", "buildingsAtlas.ts");
    const reg = src.indexOf('textureRegistry.register("atlas_buildings_relit", RebuildPhase.cache');
    expect(reg).toBeGreaterThan(0);
    expect(src.slice(reg, reg + 200)).toContain("rebakeAfterCacheLoss()");
  });
});
