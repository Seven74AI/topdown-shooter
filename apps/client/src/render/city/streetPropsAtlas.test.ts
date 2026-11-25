import { afterEach, describe, expect, it, vi } from "vitest";
import { ATLAS_CHARACTERS, ATLAS_DOWNTOWN, ATLAS_FX, downtownSpecs, ensureAtlases, imageAtlas } from "./spriteAtlas";
import { STREET_PROPS_FRAMES, STREET_PROPS_HEIGHT, STREET_PROPS_KEY, STREET_PROPS_LAMPS, STREET_PROPS_WIDTH, loadStreetProps, resetStreetPropsForTests, takeStreetProps } from "./streetPropsAtlas";
import { POLICE_DRUM, POLICE_DRUM_LAMP_DY_M, POLICE_PX_PER_M, policeSpecs } from "./streetPropsFrames";
import { CB } from "./barricadeArt";
import { PoliceLineView } from "./PoliceLineView";
import { policeLineLayout } from "./streetPropsFrames";
import { standDepth } from "../barricadeLook";
import { textureRegistry } from "../gfx/textureRegistry";

vi.mock("phaser", () => ({}));
vi.mock("./streetProps.webp?url", () => ({ default: "/streetProps.webp" }));

describe("Story 9.14: the pre-rendered street props atlas", () => {
  it("has every downtown frame at its code size (B2) and the standing police pictures", () => {
    for (const s of [...downtownSpecs(), ...policeSpecs()]) {
      const f = STREET_PROPS_FRAMES[s.name];
      expect(f, s.name).toBeDefined();
      expect([f?.w, f?.h], s.name).toEqual([s.w, s.h]);
    }
    expect(Object.keys(STREET_PROPS_FRAMES).length).toBe(downtownSpecs().length + policeSpecs().length);
    for (const f of Object.values(STREET_PROPS_FRAMES)) {
      expect(f.x + f.w).toBeLessThanOrEqual(STREET_PROPS_WIDTH);
      expect(f.y + f.h).toBeLessThanOrEqual(STREET_PROPS_HEIGHT);
    }
  });

  it("the drum's lamp (found in the picture) is where the blinker goes (B4)", () => {
    const f = STREET_PROPS_FRAMES[POLICE_DRUM];
    const lamp = STREET_PROPS_LAMPS[POLICE_DRUM]?.[0];
    expect(f && lamp).toBeTruthy();
    if (!f || !lamp) return;
    const spotY = f.h / 2 + CB * POLICE_PX_PER_M;
    expect(Math.abs((lamp[1] as number) - (spotY + POLICE_DRUM_LAMP_DY_M * POLICE_PX_PER_M))).toBeLessThan(2);
    expect(Math.abs((lamp[0] as number) - f.w / 2)).toBeLessThan(2);
  });
});

describe("Story 9.14 (AC 3): the downtown atlas comes back after a lost graphics context", () => {
  const made: { draws: unknown[][]; w: number; h: number }[] = [];
  afterEach(() => {
    textureRegistry.unregister(ATLAS_DOWNTOWN);
    vi.unstubAllGlobals();
    made.length = 0;
  });

  it("is a texture registered for repaint, repainted from the loaded image", () => {
    vi.stubGlobal("document", {
      createElement: () => {
        const rec = { draws: [] as unknown[][], w: 0, h: 0 };
        made.push(rec);
        const g = { drawImage: (...a: unknown[]) => rec.draws.push(a), getImageData: () => ({ data: [0, 0, 0, 255] }) };
        return {
          get width() {
            return rec.w;
          },
          set width(v: number) {
            rec.w = v;
          },
          get height() {
            return rec.h;
          },
          set height(v: number) {
            rec.h = v;
          },
          getContext: () => g,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        };
      },
    });
    const img = { naturalWidth: STREET_PROPS_WIDTH } as unknown as HTMLImageElement;
    const frames: string[] = [];
    let refreshed = 0;
    const tex = { add: (n: string) => frames.push(n), refresh: () => refreshed++, getFrameNames: () => frames, get: () => ({ cutX: 0, cutY: 0, cutWidth: 2, cutHeight: 2 }) };
    const scene = { textures: { exists: () => false, addCanvas: () => tex } } as unknown as Phaser.Scene;
    const a = imageAtlas(img, scene);
    expect(a.frames.size).toBe(Object.keys(STREET_PROPS_FRAMES).length);
    expect(frames).toContain(POLICE_DRUM);
    const c = made[0];
    expect([c?.w, c?.h]).toEqual([STREET_PROPS_WIDTH, STREET_PROPS_HEIGHT]);
    expect(c?.draws).toEqual([[img, 0, 0]]);
    expect(textureRegistry.has(ATLAS_DOWNTOWN)).toBe(true);
    if (c) c.w = 0; // the browser emptied the canvas
    textureRegistry.rebuildAll();
    expect([c?.w, c?.h]).toEqual([STREET_PROPS_WIDTH, STREET_PROPS_HEIGHT]);
    expect(c?.draws).toEqual([
      [img, 0, 0],
      [img, 0, 0],
    ]);
    expect(refreshed).toBe(1);
  });
});

/** A fake canvas document (sizes and drawImage calls recorded). */
function stubDocument(): { w: number; h: number; draws: unknown[][] }[] {
  const made: { w: number; h: number; draws: unknown[][] }[] = [];
  vi.stubGlobal("document", {
    createElement: () => {
      const rec = { draws: [] as unknown[][], w: 0, h: 0 };
      made.push(rec);
      const g = { drawImage: (...a: unknown[]) => rec.draws.push(a), getImageData: () => ({ data: [0, 0, 0, 255] }) };
      return {
        get width() {
          return rec.w;
        },
        set width(v: number) {
          rec.w = v;
        },
        get height() {
          return rec.h;
        },
        set height(v: number) {
          rec.h = v;
        },
        getContext: () => g,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
    },
  });
  return made;
}

describe("Story 9.14 (review L5): the loaded image becomes the downtown atlas", () => {
  class FakeImage {
    naturalWidth = STREET_PROPS_WIDTH;
    naturalHeight = STREET_PROPS_HEIGHT;
  }
  afterEach(() => {
    textureRegistry.unregister(ATLAS_DOWNTOWN);
    vi.unstubAllGlobals();
    resetStreetPropsForTests();
  });

  it("ensureAtlases paints atlas_downtown from the image and removes the loader's texture (one GPU copy)", () => {
    const made = stubDocument();
    vi.stubGlobal("HTMLImageElement", FakeImage);
    const img = new FakeImage();
    const keys = new Set<string>([ATLAS_CHARACTERS, ATLAS_FX]); // those two are someone else's (they exist already)
    const onAdd: (() => void)[] = [];
    const frames: string[] = [];
    const tex = { add: (n: string) => frames.push(n), refresh: () => undefined, getFrameNames: () => frames, get: () => ({ cutX: 0, cutY: 0, cutWidth: 2, cutHeight: 2 }) };
    const scene = {
      textures: {
        exists: (k: string) => keys.has(k),
        remove: (k: string) => keys.delete(k),
        get: () => ({ getSourceImage: () => img }),
        addCanvas: (k: string) => (keys.add(k), tex),
        once: (_e: string, fn: () => void) => onAdd.push(fn),
      },
      load: { image: () => undefined, on: () => undefined, start: () => undefined },
    } as unknown as Phaser.Scene;
    loadStreetProps(scene);
    keys.add(STREET_PROPS_KEY);
    for (const fn of onAdd) fn();
    const a = ensureAtlases(scene);
    expect(keys.has(STREET_PROPS_KEY)).toBe(false); // the loader's texture is gone
    expect(keys.has(ATLAS_DOWNTOWN)).toBe(true);
    expect(a.frames.has(POLICE_DRUM)).toBe(true);
    expect(frames.length).toBe(Object.keys(STREET_PROPS_FRAMES).length);
    expect(made[0]?.draws).toEqual([[img, 0, 0]]);
    expect(takeStreetProps(scene)).toBe(img); // kept for repaints
  });

  it("takeStreetProps gives nothing before the load settles, or after a wrong-sized image", () => {
    vi.stubGlobal("HTMLImageElement", FakeImage);
    const wrong = Object.assign(new FakeImage(), { naturalWidth: 10 });
    const keys = new Set<string>([STREET_PROPS_KEY]);
    const onAdd: (() => void)[] = [];
    const scene = {
      textures: { exists: (k: string) => keys.has(k), remove: (k: string) => keys.delete(k), get: () => ({ getSourceImage: () => wrong }), once: (_e: string, fn: () => void) => onAdd.push(fn) },
      load: { image: () => undefined, on: () => undefined, start: () => undefined },
    } as unknown as Phaser.Scene;
    expect(takeStreetProps(scene)).toBeNull(); // never asked
    keys.delete(STREET_PROPS_KEY);
    loadStreetProps(scene);
    expect(takeStreetProps(scene)).toBeNull(); // still loading
    keys.add(STREET_PROPS_KEY);
    for (const fn of onAdd) fn();
    expect(takeStreetProps(scene)).toBeNull();
    expect(keys.has(STREET_PROPS_KEY)).toBe(false);
  });
});

describe("Story 9.14 (review L5): PoliceLineView", () => {
  it("pools its images across bakes, hides the extra ones, and sorts a drum over the pieces it stands on", () => {
    const made: Record<string, unknown>[] = [];
    const scene = {
      add: {
        image: () => {
          const img: Record<string, unknown> = { visible: true };
          for (const m of ["setFrame", "setOrigin", "setPosition", "setDisplaySize"]) img[m] = () => img;
          img.setDepth = (d: number) => ((img.depth = d), img);
          img.setVisible = (v: boolean) => ((img.visible = v), img);
          img.destroy = () => undefined;
          made.push(img);
          return img;
        },
      },
    } as unknown as Phaser.Scene;
    const v = new PoliceLineView(scene);
    const gas = policeLineLayout({ name: "police_line_gas", minX: 28, minY: 0, maxX: 28.5, maxY: 10 });
    const lot = policeLineLayout({ name: "police_line_lot", minX: 10.5, minY: 22, maxX: 20, maxY: 22.5 });
    v.show([...gas, ...lot]);
    expect(made.length).toBe(14);
    const sprites = v.sprites();
    expect(sprites.length).toBe(14);
    const depth = (i: number): number => made[i]?.depth as number;
    // the gas line's north drum (index 5) over its first side piece (index 0), under the second (index 1)
    expect(depth(5)).toBeGreaterThan(depth(0));
    expect(depth(5)).toBeLessThan(depth(1));
    expect(depth(0)).toBeCloseTo(standDepth(1), 9);
    // the lot line's drums over its front pieces (same row)
    for (const d of [12, 13]) for (const p of [7, 8, 9, 10, 11]) expect(depth(d)).toBeGreaterThan(depth(p));
    // a bake with one line: the same images, the extra ones hidden, nothing new made
    v.show(gas);
    expect(made.length).toBe(14);
    expect(v.sprites().length).toBe(7);
    expect(v.sprites()).toBe(sprites); // the same array (no allocation for the silhouettes)
    expect(made.slice(7).every((m) => m.visible === false)).toBe(true);
    v.show([]);
    expect(made.every((m) => m.visible === false)).toBe(true);
  });
});
