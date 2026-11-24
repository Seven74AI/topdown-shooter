import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ BlendModes: { ADD: 1, NORMAL: 0 }, TintModes: { MULTIPLY: 0 } }));
vi.mock("./city/spriteAtlas", async (orig) => ({ ...(await orig<typeof import("./city/spriteAtlas")>()), ensureAtlases: () => ({}) }));
import { DEFAULT_LOOK, layerSpinRevPerS, type PlayerState, type SurvivorLook } from "@topdown/shared";
import { fakeScene, type FakeObject } from "./darkness/fakeScene.testkit";
import { textureRegistry } from "./gfx/textureRegistry";
import { PlayerView } from "./PlayerView";
import { LAYER_POOL_SIZE, SurvivorLayerPool } from "./SurvivorLayerPool";
import { layerPose, layerSpinAngle, layerTextureKey, type LayerPose } from "./city/survivorLayers";
import { drawSurvivor } from "./city/spriteArt";
import { resolveLook } from "./city/survivorLook";

const KEY = layerTextureKey("propeller");
/** A real 2D canvas in Node, with the event hooks the texture registry listens on (context loss). */
const napiCanvas = (): HTMLCanvasElement => Object.assign(createCanvas(1, 1), { addEventListener: () => {}, removeEventListener: () => {} }) as unknown as HTMLCanvasElement;
const opaque = (c: HTMLCanvasElement): number => {
  const d = (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if ((d[i] as number) > 0) n++;
  return n;
};

describe("animated part layers: the spinning propeller (Story 7.8, designer 2026-11-24)", () => {
  it("spins at cosmetics.json's speed: a quarter second is a quarter turn per rev/s", () => {
    const rev = layerSpinRevPerS("propeller");
    expect(rev).toBeGreaterThan(0);
    expect(layerSpinAngle("propeller", 0)).toBe(0);
    expect(layerSpinAngle("propeller", 250 / rev)).toBeCloseTo(Math.PI / 2, 6);
    expect(layerSpinAngle("propeller", 1000 / rev)).toBeCloseTo(0, 6); // a full turn wraps to 0
  });

  it("rides on the head, turned with the body, and writes into the caller's pose (no allocation)", () => {
    const out: LayerPose = { x: 0, y: 0, rotation: 0 };
    const a = layerPose(out, "propeller", 10, 20, 1, 0, 0.4, 0);
    expect(a).toBe(out);
    expect(a.x).toBeCloseTo(10 - 0.02 * 0.4, 9); // anchor (-0.02 r, 0) behind the head centre, facing +x
    expect(a.y).toBeCloseTo(20, 9);
    layerPose(out, "propeller", 10, 20, 0, 1, 0.4, 0); // facing +y: the anchor turns with the body
    expect(out.x).toBeCloseTo(10, 9);
    expect(out.y).toBeCloseTo(20 - 0.02 * 0.4, 9);
    expect(out.rotation).toBeCloseTo(Math.PI / 2, 9);
  });

  it("the baked body leaves the propeller out; still pictures draw it in", () => {
    const look = resolveLook({ ...DEFAULT_LOOK, head: "prop" } as SurvivorLook, 1);
    const shot = (layers: boolean): number => {
      const c = createCanvas(120, 120);
      const g = c.getContext("2d") as unknown as CanvasRenderingContext2D;
      g.translate(60, 60);
      drawSurvivor(g, 30, undefined, undefined, look, layers);
      const d = g.getImageData(0, 0, 120, 120).data;
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] as number;
      return s;
    };
    expect(shot(true)).not.toBe(shot(false));
  });

  it("the pool draws the texture once through addGeneratedTexture and hands out up to 4 sprites", () => {
    textureRegistry.unregister(KEY);
    const fs = fakeScene();
    const pool = new SurvivorLayerPool(fs.scene, napiCanvas);
    expect(textureRegistry.has(KEY)).toBe(true);
    expect(fs.keys.has(KEY)).toBe(true);
    expect(pool.available("propeller")).toBe(LAYER_POOL_SIZE);
    const made = fs.objects.length;
    const got = Array.from({ length: LAYER_POOL_SIZE }, () => pool.acquire("propeller"));
    expect(got.every((g) => g !== null)).toBe(true);
    expect(pool.acquire("propeller")).toBeNull();
    pool.release("propeller", got[0] as never);
    expect(pool.acquire("propeller")).toBe(got[0]);
    expect(fs.objects.length).toBe(made); // nothing created after the pool was made
    textureRegistry.unregister(KEY);
  });

  it("brief 20: a lost context repaints the propeller texture (registry rebuild)", () => {
    textureRegistry.unregister(KEY);
    const fs = fakeScene();
    let canvas: HTMLCanvasElement | null = null;
    new SurvivorLayerPool(fs.scene, () => (canvas = napiCanvas()));
    const c = canvas as unknown as HTMLCanvasElement;
    const drawn = opaque(c);
    expect(drawn).toBeGreaterThan(50);
    const refreshes = fs.refreshes;
    (c.getContext("2d") as CanvasRenderingContext2D).clearRect(0, 0, c.width, c.height); // the browser emptied it
    expect(opaque(c)).toBe(0);
    textureRegistry.rebuildAll();
    expect(opaque(c)).toBe(drawn);
    expect(fs.refreshes).toBe(refreshes + 1);
    textureRegistry.unregister(KEY);
  });

  it("PlayerView places the layer on the head every frame, spinning; hides it when out, gives it back on destroy", () => {
    textureRegistry.unregister(KEY);
    const fs = fakeScene();
    const pool = new SurvivorLayerPool(fs.scene, napiCanvas);
    const v = new PlayerView(fs.scene, 0.4);
    v.setAnimatedLayer(pool, "propeller");
    const img = v.layerSprite as unknown as FakeObject;
    expect(img).not.toBeNull();
    expect(pool.available("propeller")).toBe(LAYER_POOL_SIZE - 1);
    const p = { prevX: 5, x: 5, prevY: 7, y: 7, facingX: 1, facingY: 0, status: "alive", slowTicksLeft: 0, loadout: { slots: [{ weapon: "pistol" }], active: 0 } } as unknown as PlayerState;
    v.update(p, 1, 0);
    const r0 = img.rotation;
    expect(img.x).toBeCloseTo(5 - 0.02 * 0.4, 9);
    expect(img.visible).toBe(true);
    v.update(p, 1, 100);
    expect(img.rotation).not.toBeCloseTo(r0, 3); // it turned between frames
    expect(img.depth).toBeGreaterThan(v.depths.body);
    v.update({ ...p, status: "out" } as PlayerState, 1, 200);
    expect(img.visible).toBe(false);
    v.destroy();
    expect(pool.available("propeller")).toBe(LAYER_POOL_SIZE);
    textureRegistry.unregister(KEY);
  });
});
