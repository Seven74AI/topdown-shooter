import { describe, expect, it, vi } from "vitest";
import { DOWNTOWN_MAP, createWorld, loadBalance, spawnZombie } from "@topdown/shared";

const opts = vi.hoisted(() => ({ lowFx: false }));
vi.mock("phaser", () => ({ BlendModes: { ADD: 1, NORMAL: 0, MULTIPLY: 2 }, TintModes: { MULTIPLY: 0, FILL: 1 } }));
vi.mock("./city/spriteAtlas", async (orig) => ({ ...(await orig<typeof import("./city/spriteAtlas")>()), ensureAtlases: () => ({}) }));
vi.mock("../audio/placeholderSfx", () => ({ playSfx: () => {} }));
vi.mock("../debug/urlOptions", () => ({ urlOptions: () => opts }));

import { CAP_EVERY_FRAMES, ZombieView } from "./ZombieView";
import { setCharFxForTests, setLoopReadyForTests, walkFrames } from "./city/charactersAtlas";
import { fakeScene, type FakeObject } from "./darkness/fakeScene.testkit";

/**
 * Story 9.13 (AC 4, B4, T5): the animated extras are capped and pooled — never more zombies with the full animation
 * (crossfade, sheen) than `controls.fx.maxCharacterAnim` / `maxCharacterSheen`, nearest the camera first; `?fx=low`
 * halves the caps; the pools don't grow over 600 frames of a moving horde (no allocation per frame).
 */
const balance = loadBalance();
const QUIET = { waves: () => {}, zombies: () => {} };

function setup(n: number) {
  const fs = fakeScene();
  const sc = fs.scene as unknown as Record<string, unknown>;
  const time = { now: 1000 };
  sc.time = time;
  sc.cameras = { main: { worldView: { x: 0, y: 0, width: 48, height: 32 } } };
  const w = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: QUIET });
  const ids: number[] = [];
  for (let i = 0; i < n; i++) ids.push(spawnZombie(w, "walker", 24 + (i % 12) - 6 + 0.1 * i, 16 + Math.floor(i / 12) - 4));
  for (let v = 0; v < 4; v++) {
    setLoopReadyForTests("walker", v);
    setCharFxForTests((walkFrames("walker", v) as readonly string[])[0] as string, { glow: false, sheen: true, bloater: null });
  }
  return { fs, w, ids, time };
}
/** Moves every zombie a little (the walk loop advances) and draws a frame. */
function step(zv: ZombieView, s: ReturnType<typeof setup>, k: number): void {
  const z = s.w.zombies;
  for (const id of s.ids) {
    z.prevX[id] = z.x[id] as number;
    z.prevY[id] = z.y[id] as number;
    z.x[id] = (z.x[id] as number) + 0.03 * Math.cos(k * 0.05 + id);
    z.y[id] = (z.y[id] as number) + 0.03 * Math.sin(k * 0.05 + id);
  }
  s.time.now += 16;
  zv.update(s.w, 1);
}
const layers = (s: ReturnType<typeof setup>, blend: number): FakeObject[] => s.fs.objects.filter((o) => o.visible && o.blend === blend && !o.destroyed);

describe("Story 9.13: the zombies' animated extras are capped and pooled", () => {
  it("never more animated than the cap, the sheen only on the nearest maxCharacterSheen; the rest breathe and step", () => {
    opts.lowFx = false;
    const s = setup(100);
    const zv = new ZombieView(s.fs.scene, balance, 256);
    expect(zv.caps.anim).toBe(balance.controls.fx.maxCharacterAnim);
    for (let k = 0; k < 40; k++) {
      step(zv, s, k);
      expect(zv.animated).toBeLessThanOrEqual(zv.caps.anim);
      expect(layers(s, 1).length, "sheen (additive) layers").toBeLessThanOrEqual(zv.caps.sheen);
    }
    expect(zv.animated).toBe(zv.caps.anim);
    expect(layers(s, 1).length).toBe(zv.caps.sheen);
    // the sheen goes to the nearest the camera centre (24, 16)
    const sheens = layers(s, 1);
    const far = Math.max(...sheens.map((o) => Math.hypot(o.x - 24, o.y - 16)));
    const bodies = s.fs.objects.filter((o) => o.visible && o.depth === 5);
    const nearer = bodies.filter((o) => Math.hypot(o.x - 24, o.y - 16) < far - 0.2).length;
    expect(nearer).toBeLessThanOrEqual(zv.caps.sheen);
    // every zombie breathes: its display size swells and settles, beyond the cap too
    const sizes = bodies.map((o) => o.displayWidth);
    expect(new Set(sizes.map((x) => x.toFixed(4))).size).toBeGreaterThan(10);
  });

  it("?fx=low halves every Story 9.13 cap", () => {
    opts.lowFx = true;
    const s = setup(10);
    const zv = new ZombieView(s.fs.scene, balance, 64);
    const fx = balance.controls.fx;
    expect(zv.caps).toEqual({ anim: Math.floor(fx.maxCharacterAnim / 2), sheen: Math.floor(fx.maxCharacterSheen / 2), bloater: Math.floor(fx.maxBloaterFx / 2), spitter: Math.floor(fx.maxSpitterDrips / 2) });
    opts.lowFx = false;
  });

  it("no allocation per frame: the pools stop growing (600 frames of a moving horde)", () => {
    opts.lowFx = false;
    const s = setup(100);
    const zv = new ZombieView(s.fs.scene, balance, 256);
    for (let k = 0; k < 60; k++) step(zv, s, k);
    const bodies = s.fs.objects.length - zv.layerImages;
    let most = 0;
    for (let k = 60; k < 660; k++) {
      step(zv, s, k);
      most = Math.max(most, zv.layerImages);
      expect(s.fs.objects.length - zv.layerImages, "only pooled layers are ever made after the start").toBe(bodies);
    }
    // the pools hold at most one crossfade top per animated zombie and one sheen per sheen slot, reused from then on
    expect(most).toBeLessThanOrEqual(zv.caps.anim + zv.caps.sheen);
    expect(CAP_EVERY_FRAMES).toBeGreaterThan(1);
  });
});
