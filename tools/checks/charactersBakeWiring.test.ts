import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 9.13 (T5): the characters' relit bake is wired in; deleting a hook must fail a test. */
const read = (...p: string[]): string => readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8");

describe("Story 9.13: the character bake is wired", () => {
  it("ZombieView makes the sheets and pumps the bake from update() (like BuildingView → pumpBuildingsAtlas), not GameScene", () => {
    const src = read("render", "ZombieView.ts");
    expect(src).toContain("ensureCharacterSheets(scene);");
    const upd = src.slice(src.indexOf("  update(world: Readonly<World>, alpha: number): void {"));
    expect(upd.slice(0, 400)).toContain("pumpCharacters(undefined, undefined, gameFrame(this.scene));");
    expect(read("scenes", "GameScene.ts")).not.toMatch(/pumpCharacters|ensureCharacterSheets/);
  });

  it("the survivors' bodies go through it too (requested on a look, pumped each frame, cancelled on leave)", () => {
    const src = read("render", "SurvivorLookTextures.ts");
    for (const s of ["requestBodyRelight(e.key, e.look,", "cancelBodyRelight(e.key);", "pumpCharacters(undefined, undefined,", "view.setBodySheen(textures.sheenOf(id));"]) expect(src).toContain(s);
    expect(read("render", "PlayerView.ts")).toContain("ensureCharacterSheets(scene);");
  });

  it("the asset gallery bakes every relit picture on the spot before cutting the frames", () => {
    const src = read("gallery", "collect.ts");
    const e = src.indexOf("ensureCharacterSheets(this, { worker: false });");
    expect(e).toBeGreaterThan(src.indexOf("ensureAtlases(this);"));
    expect(src.indexOf("pumpCharacters(Infinity, Infinity);", e)).toBeGreaterThan(e);
    expect(src.indexOf("pumpCharacters(Infinity, Infinity);", e)).toBeLessThan(src.indexOf("const art = textureAssets(this);"));
  });

  it("a graphics restore checks the kept pictures (cache phase), the sheets go through addGeneratedTexture, and the worker is a module worker", () => {
    const src = read("render", "city", "charactersAtlas.ts");
    expect(src).toContain('textureRegistry.register("chars_relit", RebuildPhase.cache, () => {');
    expect(src).toContain("rebakeCharsAfterCacheLoss();");
    expect(src).toContain("sheet.tex = addGeneratedTexture(");
    expect(src).toContain('new Worker(new URL("./charactersBakeWorker.ts", import.meta.url), { type: "module" })');
  });
});
