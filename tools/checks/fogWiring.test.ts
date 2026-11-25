import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 6.10 follow-up (6.2 re-review R1): GameScene's fog hookups (zombies, blood trails, spit in
 * flight) had no test — deleting the line passed everything. The wiring is `render/fog/fogWiring.ts`
 * (unit-tested there); this checks the scene really calls it, at create and every frame.
 */
describe("GameScene wires the screen fog into the views it hides things in", () => {
  it("GameScene really wires it: at create (after the fog is made) and every frame in updateScreenFog", () => {
    const src = readFileSync(join(__dirname, "..", "..", "apps", "client", "src", "scenes", "GameScene.ts"), "utf8");
    const create = src.indexOf("this.screenFog = new ScreenFog();");
    expect(create).toBeGreaterThan(0);
    const firstWire = src.indexOf("wireFog(this.fogTakers(), this.screenFog)");
    expect(firstWire).toBeGreaterThan(create);
    const upd = src.indexOf("private updateScreenFog(");
    expect(upd).toBeGreaterThan(0);
    const updBody = src.slice(upd, src.indexOf("\n  }\n", upd));
    expect(updBody).toContain("wireFog(this.fogTakers(), fog)");
    // the taker list names all three views
    const takers = src.slice(src.indexOf("private fogTakers(): FogTakers {"));
    for (const v of ["this.zombieView", "this.trailView", "this.acidView"]) expect(takers.slice(0, 400)).toContain(v);
  });
});
