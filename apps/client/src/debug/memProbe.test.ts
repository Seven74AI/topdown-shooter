import { describe, expect, it } from "vitest";
import type * as Phaser from "phaser";
import { TextureRegistry, textureRegistry } from "../render/gfx/textureRegistry";
import { memSample } from "./memProbe";

describe("Story 10.3 (B2): the dev memory probe", () => {
  it("texture estimate = Σ width × height × 4 over every source; count of textures; registry canvases", () => {
    const tex = (sizes: [number, number][]) => ({ source: sizes.map(([width, height]) => ({ width, height })) });
    const game = { textures: { list: { a: tex([[1024, 512]]), b: tex([[256, 256], [256, 256]]) } } } as unknown as Phaser.Game;
    const s = memSample(game);
    expect(s.textures).toBe(2);
    expect(s.textureMB).toBe(+((1024 * 512 * 4 + 2 * 256 * 256 * 4) / 1048576).toFixed(1)); // 2.5
    expect(s.canvases).toBe(textureRegistry.canvasCount);
  });

  it("TextureRegistry.canvasCount counts every registered canvas, and drops them on unregister", () => {
    const r = new TextureRegistry(() => {});
    const canvas = () => ({ addEventListener: () => {}, removeEventListener: () => {} });
    r.register("one", 0, () => {}, [canvas(), canvas()]);
    r.register("two", 0, () => {}, [canvas()]);
    r.register("none", 0, () => {});
    expect(r.canvasCount).toBe(3);
    r.unregister("one");
    expect(r.canvasCount).toBe(1);
  });
});
