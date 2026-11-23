import { describe, expect, it } from "vitest";
import { loadBalance, shopBuildings } from "@topdown/shared";
import { textureRegistry } from "../gfx/textureRegistry";
import {
  BUILD_ICONS,
  BUILD_ICON_BAKE_SCALE,
  BUILD_ICON_BOX_H,
  BUILD_ICON_BOX_W,
  BUILD_ICON_FRAME_H,
  BUILD_ICON_FRAME_W,
  BUILD_ICON_ORIGIN_X,
  BUILD_ICON_ORIGIN_Y,
  BUILD_ICON_PAD_BOTTOM,
  BUILD_ICON_PAD_TOP,
  BUILD_ICON_PAD_X,
  BUILD_ICON_TEXTURE,
  buildIconFrame,
  buildIconsLayout,
  ensureBuildIcons,
  paintBuildIcon,
} from "./buildIcons";
import { RecordCanvas, asContext } from "./recordCanvas";

describe("build-bar icons (Story 5.26)", () => {
  it("every shop building today has its picked icon (I1 barricade, I1 spikes, T1 turret, M1 mine)", () => {
    const ids = shopBuildings(loadBalance()).map((b) => b.id);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const id of ids) expect(buildIconFrame(id), id).not.toBeNull();
    expect(buildIconFrame("wood_barricade")).toBe("icon_build_barricade_a");
    expect(buildIconFrame("spike_trap")).toBe("icon_build_spiketrap_a");
    expect(buildIconFrame("auto_turret")).toBe("icon_build_turret_a");
    expect(buildIconFrame("mine")).toBe("icon_build_mine_a");
  });

  it("a type without an icon (5.10's types, upgrade tiers, unknown, prototype keys) returns null: world-art fallback", () => {
    for (const t of ["floodlight", "med_station", "bear_trap", "metal_barricade", "", "toString", "__proto__"]) expect(buildIconFrame(t), t).toBeNull();
  });

  it("T2 is baked and kept but no building type maps to it", () => {
    const frames = BUILD_ICONS.map((i) => i.frame);
    expect(frames).toContain("icon_build_turret_b");
    const mapped = shopBuildings(loadBalance()).map((b) => buildIconFrame(b.id));
    expect(mapped).not.toContain("icon_build_turret_b");
  });

  it("frames are category_name_variant, unique, in one row inside 2048², not overlapping", () => {
    const l = buildIconsLayout();
    expect(l.width).toBeLessThanOrEqual(2048);
    expect(l.height).toBeLessThanOrEqual(2048);
    expect(new Set(l.frames.map((f) => f.frame)).size).toBe(BUILD_ICONS.length);
    for (const f of l.frames) {
      expect(f.frame).toMatch(/^icon_build_[a-z0-9]+_[a-z]$/);
      expect(f.x + f.w).toBeLessThanOrEqual(l.width);
      expect([f.w, f.h]).toEqual([96, 72]); // baked at MAX_DPR (2): 1:1 with the 48 × 36 CSS px frame on screen
    }
    for (let i = 1; i < l.frames.length; i++) {
      const a = l.frames[i - 1]!;
      expect(l.frames[i]!.x).toBeGreaterThan(a.x + a.w); // a gap: no filtering bleed
    }
  });

  it("the frame is the mockup's 44 × 30 box plus its clip margins; the origin is the box centre", () => {
    expect([BUILD_ICON_FRAME_W, BUILD_ICON_FRAME_H]).toEqual([48, 36]);
    expect(BUILD_ICON_ORIGIN_X * BUILD_ICON_FRAME_W).toBe(BUILD_ICON_PAD_X + BUILD_ICON_BOX_W / 2);
    expect(BUILD_ICON_ORIGIN_Y * BUILD_ICON_FRAME_H).toBe(BUILD_ICON_PAD_TOP + BUILD_ICON_BOX_H / 2);
    expect(BUILD_ICON_PAD_BOTTOM).toBe(2);
  });

  it("each drawing paints inside its own frame, fills most of the box and is not cut much by the clip", () => {
    const l = buildIconsLayout();
    l.frames.forEach((r, i) => {
      const rec = new RecordCanvas();
      paintBuildIcon(asContext(rec), BUILD_ICONS[i]!.draw, r);
      expect(rec.ops.length, r.frame).toBeGreaterThan(8);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const o of rec.ops) {
        expect(o.clipped, r.frame).toBe(true); // every op inside the frame clip
        x0 = Math.min(x0, o.x0);
        y0 = Math.min(y0, o.y0);
        x1 = Math.max(x1, o.x1);
        y1 = Math.max(y1, o.y1);
      }
      const s = BUILD_ICON_BAKE_SCALE;
      const slack = 2 * s; // a stroke's half width past the clip
      expect(x0, r.frame).toBeGreaterThanOrEqual(r.x - slack);
      expect(y0, r.frame).toBeGreaterThanOrEqual(r.y - slack);
      expect(x1, r.frame).toBeLessThanOrEqual(r.x + r.w + slack);
      expect(y1, r.frame).toBeLessThanOrEqual(r.y + r.h + slack);
      // readable at 56 px: the art spans ≥ 60 % of the box width and ≥ 50 % of its height (the spike trap is a low board)
      expect(x1 - x0, r.frame).toBeGreaterThan(0.6 * BUILD_ICON_BOX_W * s);
      expect(y1 - y0, r.frame).toBeGreaterThan(0.5 * BUILD_ICON_BOX_H * s);
    });
  });

  it("is baked once through addGeneratedTexture and repainted by the texture registry (brief 20)", () => {
    const rec = new RecordCanvas();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => asContext(rec),
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLCanvasElement;
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
    ensureBuildIcons(scene, () => canvas);
    expect(keys.has(BUILD_ICON_TEXTURE)).toBe(true);
    expect(added).toEqual(BUILD_ICONS.map((i) => i.frame));
    const first = rec.ops.length;
    expect(first).toBeGreaterThan(40);
    expect([canvas.width, canvas.height]).toEqual([buildIconsLayout().width, buildIconsLayout().height]);
    ensureBuildIcons(scene, () => canvas); // idempotent: no second bake
    expect(rec.ops.length).toBe(first);
    try {
      textureRegistry.rebuildAll(); // a lost context: the atlas is drawn again and re-uploaded
      expect(rec.ops.length).toBe(2 * first);
      expect(refreshes).toBe(1);
    } finally {
      textureRegistry.unregister(BUILD_ICON_TEXTURE);
    }
  });
});
