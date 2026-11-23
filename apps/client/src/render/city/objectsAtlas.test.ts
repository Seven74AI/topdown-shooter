import { describe, expect, it } from "vitest";
import { MAX_ATLAS_PX, isFrameName } from "./atlasLayout";
import { FLAME_FRAMES, OBJECT_FRAME_PX, OBJECTS_ATLAS_FILE, OBJ_BARRICADE, OBJ_SANDBAGS, SMOKE_FRAMES } from "./objectsAtlas";
import { nativeSize, PROP_SANDBAGS, DOWNTOWN_ATLAS_SCALE } from "./spriteAtlas";
import { loadBalance, buildingStats } from "@topdown/shared";

/** Node's fs, loaded without Node types (the client tsconfig is DOM-only; tests run in Node). */
interface Fs {
  readFileSync(path: string): Uint8Array;
  statSync(path: string): { size: number };
}
const NODE_FS = "node:fs";
const fs = (await import(/* @vite-ignore */ NODE_FS)) as Fs;
const pub = (rel: string) => decodeURIComponent(new URL(`../../../public/${rel}`, import.meta.url).pathname);
const json = JSON.parse(new TextDecoder().decode(fs.readFileSync(pub(`${OBJECTS_ATLAS_FILE}.json`)))) as {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  meta: { image: string; size: { w: number; h: number } };
};
const png = fs.readFileSync(pub(`${OBJECTS_ATLAS_FILE}.png`));
const pngView = new DataView(png.buffer, png.byteOffset, png.byteLength);
/** First-load budget (architecture § Performance) and this atlas's own share of it. */
const FIRST_LOAD_BUDGET_BYTES = 15 * 1024 * 1024;
const OBJECTS_ATLAS_MAX_BYTES = 1024 * 1024;

describe("Story 4.11: the loaded stage-object atlas follows the atlas rules", () => {
  it("is a PNG ≤ 2048² whose header matches the JSON's size", () => {
    expect(String.fromCharCode(png[1] ?? 0, png[2] ?? 0, png[3] ?? 0)).toBe("PNG");
    const w = pngView.getUint32(16);
    const h = pngView.getUint32(20);
    expect([w, h]).toEqual([json.meta.size.w, json.meta.size.h]);
    expect(Math.max(w, h)).toBeLessThanOrEqual(MAX_ATLAS_PX);
    expect(json.meta.image).toBe("objects.png");
  });

  it("has exactly the frames the game uses, named category_name_variant, inside the image, at their sizes, not overlapping", () => {
    expect(Object.keys(json.frames).sort()).toEqual(Object.keys(OBJECT_FRAME_PX).sort());
    const rects = Object.entries(json.frames).map(([n, f]) => ({ n, ...f.frame }));
    for (const r of rects) {
      expect(isFrameName(r.n), r.n).toBe(true);
      expect([r.w, r.h], r.n).toEqual(OBJECT_FRAME_PX[r.n]);
      expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= json.meta.size.w && r.y + r.h <= json.meta.size.h, r.n).toBe(true);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] as (typeof rects)[number];
        const b = rects[j] as (typeof rects)[number];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.n} × ${b.n}`).toBe(false);
      }
    expect(FLAME_FRAMES).toHaveLength(4);
    expect(SMOKE_FRAMES).toHaveLength(4);
  });

  it("frames keep their footprints' proportions: sandbags 3 × 1 m (= the downtown frame it replaces), barricade = the balance footprint", () => {
    const [sw, sh] = OBJECT_FRAME_PX[OBJ_SANDBAGS] as readonly [number, number];
    expect(sw / sh).toBe(3);
    const [nw, nh] = nativeSize(PROP_SANDBAGS);
    expect([sw, sh]).toEqual([nw * DOWNTOWN_ATLAS_SCALE, nh * DOWNTOWN_ATLAS_SCALE]);
    const st = buildingStats(loadBalance(), "wood_barricade");
    const [bw, bh] = OBJECT_FRAME_PX[OBJ_BARRICADE] as readonly [number, number];
    expect(bw / bh).toBeCloseTo((st?.widthM ?? 0) / (st?.depthM ?? 1), 9);
  });

  it("stays small: the atlas well inside the 15 MB first load", () => {
    const bytes = fs.statSync(pub(`${OBJECTS_ATLAS_FILE}.png`)).size + fs.statSync(pub(`${OBJECTS_ATLAS_FILE}.json`)).size;
    expect(bytes).toBeLessThan(OBJECTS_ATLAS_MAX_BYTES);
    expect(bytes).toBeLessThan(FIRST_LOAD_BUDGET_BYTES);
  });
});
