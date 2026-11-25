import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ BlendModes: { ADD: 1, NORMAL: 0 }, TintModes: { MULTIPLY: 0, FILL: 1 } }));

import { CharacterFxView, MAX_SACS } from "./CharacterFxView";
import { fakeScene, type FakeObject } from "./darkness/fakeScene.testkit";
import type { BloaterFxData } from "./city/charBloaterFx";

/**
 * Story 9.13 (B6, B7): the Bloaters' veins / sacs and the Spitters' drips are pooled sprites: made once per slot,
 * hidden when the slot isn't used, the drips deterministic per zombie (no Math.random) and their puddles left in world
 * space (they don't turn with the body).
 */
const fx: BloaterFxData = { sacs: [{ x: 40, y: 50, r: 4, seed: 3 }, { x: 70, y: 60, r: 3, seed: 4 }], periodS: 0.5, s: 0.66, through: 1 };
const VEINS = ["v0", "v1", "v2", "v3"];

describe("Story 9.13: CharacterFxView", () => {
  it("a Bloater slot is made once (veins, sacs, halos, bubbles) and hidden when unused", () => {
    const fs = fakeScene();
    const v = new CharacterFxView(fs.scene, 2, 2);
    for (let f = 0; f < 30; f++) {
      v.begin();
      v.bloater(0, "sheet", VEINS, 123, 10, 10, f * 0.1, 1.2, 1.2, 5.6, 1, f / 60, fx);
      v.end();
    }
    const made = v.spriteCount;
    expect(made).toBe(2 + MAX_SACS * 6);
    expect(v.visibleCount).toBe(2 + fx.sacs.length * 6);
    v.begin();
    v.end();
    expect(v.visibleCount).toBe(0);
    expect(v.spriteCount).toBe(made);
  });

  it("the vein pulse crossfades: the two pictures' alphas add up to the fog alpha", () => {
    const fs = fakeScene();
    const v = new CharacterFxView(fs.scene, 1, 0);
    v.begin();
    v.bloater(0, "sheet", VEINS, 123, 0, 0, 0, 1, 1, 5.6, 0.8, 0.1, fx);
    v.end();
    const veins = fs.objects.filter((o) => VEINS.includes(o.frame) && o.visible);
    expect(veins.length).toBe(2);
    expect(veins.reduce((a, o) => a + o.alpha, 0)).toBeCloseTo(0.8, 6);
  });

  it("drips: the same for the same zombie and time (no randomness); a landed puddle stays put when the Spitter turns", () => {
    const run = (rot2: number): FakeObject[] => {
      const fs = fakeScene();
      const v = new CharacterFxView(fs.scene, 0, 1);
      for (let f = 0; f <= 60; f++) {
        v.begin();
        v.spitter(0, 7, 5, 5, f < 40 ? 0 : rot2, 0.35, 1.15, 0, 5.2, 1, f / 60);
        v.end();
      }
      return fs.objects.filter((o) => o.visible);
    };
    const a = run(0);
    const b = run(0);
    expect(a.map((o) => [o.x, o.y, o.alpha])).toEqual(b.map((o) => [o.x, o.y, o.alpha]));
    expect(a.length).toBeGreaterThanOrEqual(1);
    // turning the body after the first drop landed: the puddles (rotation 0) stay where they were
    const c = run(Math.PI / 2);
    const puddles = (xs: FakeObject[]): string[] => xs.filter((o) => o.rotation === 0).map((o) => `${o.x.toFixed(4)},${o.y.toFixed(4)}`);
    const landedBefore = puddles(a).filter((p) => puddles(c).includes(p));
    expect(landedBefore.length).toBeGreaterThanOrEqual(1);
  });
});
