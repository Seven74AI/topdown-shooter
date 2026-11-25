import { describe, expect, it } from "vitest";
import { textureRegistry } from "../gfx/textureRegistry";
import { ATLAS_HELI, HELI_ATLAS_H, HELI_ATLAS_W, HELI_FRAMES, ensureHeliAtlas } from "./heliArt";
import { RecordCanvas, asContext } from "./recordCanvas";

/** Story 6.11 (T5; brief 12, 20): the helicopter atlas — frames inside 2048², not overlapping, repainted after a lost context. */
describe("heliArt", () => {
  it("frames are category_name_variant, inside the atlas (≤ 2048²) and do not overlap", () => {
    expect(HELI_ATLAS_W).toBeLessThanOrEqual(2048);
    expect(HELI_ATLAS_H).toBeLessThanOrEqual(2048);
    const rects = Object.entries(HELI_FRAMES);
    for (const [name, [x, y, w, h]] of rects) {
      expect(name).toMatch(/^heli_[a-z]+_0$/);
      expect(x + w).toBeLessThanOrEqual(HELI_ATLAS_W);
      expect(y + h).toBeLessThanOrEqual(HELI_ATLAS_H);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [, a] = rects[i] as [string, readonly number[]];
        const [, b] = rects[j] as [string, readonly number[]];
        const overlap = (a[0] as number) < (b[0] as number) + (b[2] as number) && (b[0] as number) < (a[0] as number) + (a[2] as number) && (a[1] as number) < (b[1] as number) + (b[3] as number) && (b[1] as number) < (a[1] as number) + (a[3] as number);
        expect(overlap, `${rects[i]?.[0]} × ${rects[j]?.[0]}`).toBe(false);
      }
  });

  it("is baked once through addGeneratedTexture and repainted by the texture registry after a lost context (brief 20)", () => {
    const rec = new RecordCanvas();
    const canvas = { width: 0, height: 0, getContext: () => asContext(rec), addEventListener: () => {}, removeEventListener: () => {} } as unknown as HTMLCanvasElement;
    const keys = new Set<string>();
    let refreshes = 0;
    const added: string[] = [];
    const tex = { add: (name: string) => added.push(name), refresh: () => refreshes++, getFrameNames: () => added, get: () => ({ cutX: 0, cutY: 0, cutWidth: 1, cutHeight: 1 }) };
    const scene = {
      textures: {
        exists: (k: string) => keys.has(k),
        addCanvas: (k: string) => {
          keys.add(k);
          return tex;
        },
      },
    } as unknown as Phaser.Scene;
    ensureHeliAtlas(scene, () => canvas);
    expect(keys.has(ATLAS_HELI)).toBe(true);
    expect(added.sort()).toEqual(Object.keys(HELI_FRAMES).sort());
    const first = rec.ops.length;
    expect(first).toBeGreaterThan(20);
    ensureHeliAtlas(scene, () => canvas);
    expect(rec.ops.length).toBe(first);
    try {
      textureRegistry.rebuildAll();
      expect(rec.ops.length).toBe(2 * first);
      expect(refreshes).toBe(1);
    } finally {
      textureRegistry.unregister(ATLAS_HELI);
    }
  });
});
