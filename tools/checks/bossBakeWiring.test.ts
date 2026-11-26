import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 9.15 (T5): the Behemoth's relit bake and its layers are wired in; deleting a hook must fail a test. */
const read = (...p: string[]): string => readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8");

describe("Story 9.15: the Behemoth bake is wired", () => {
  it("BossView makes the bake, asks for the look (predicted from the run seed) and pumps it from update()", () => {
    const src = read("render", "BossView.ts");
    expect(src).toContain("ensureBossRelit(scene);");
    const upd = src.slice(src.indexOf("  update(dtS: number, serverTick: number"));
    expect(upd.slice(0, 1200)).toContain("this.bakeLook(");
    expect(src).toContain("requestBossLook(want);");
    expect(src).toContain("pumpBossRelit(this.frameNo++);");
    expect(src).toContain("behemothLookIndex(seed, b.number + 1,");
    expect(read("scenes", "GameScene.ts")).toContain("new BossView(this, host.world, () => this.runSeed)");
  });

  it("the additive layers never take the hit flash (only the body pictures are tinted)", () => {
    const src = read("render", "BossView.ts");
    for (const l of ["this.vein", "this.sheen", "e."]) expect(src).not.toMatch(new RegExp(`${l.replace(".", "\\.")}\\w*\\.setTint\\(HIT_TINT\\)`));
    expect(src).toContain("this.body2.setTint(HIT_TINT)");
  });

  it("the gallery bakes the relit Behemoth on the spot; sheets go through addGeneratedTexture; the worker is a module worker", () => {
    const g = read("gallery", "collect.ts");
    const e = g.indexOf("ensureBossRelit(this, { worker: false });");
    expect(e).toBeGreaterThan(0);
    expect(g.indexOf("finishBossRelitNow();", e)).toBeLessThan(g.indexOf("const art = textureAssets(this);"));
    const src = read("render", "city", "bossRelit.ts");
    expect(src).toContain(": addGeneratedTexture(");
    expect(src).toContain("sheetWiped(b, spec.key);");
    expect(src).toContain('new Worker(new URL("./bossBakeWorker.ts", import.meta.url), { type: "module" })');
  });
});
