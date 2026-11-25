import { afterEach, describe, expect, it, vi } from "vitest";
import { ATLAS_DOWNTOWN, downtownSpecs, imageAtlas } from "./spriteAtlas";
import { STREET_PROPS_FRAMES, STREET_PROPS_HEIGHT, STREET_PROPS_LAMPS, STREET_PROPS_WIDTH } from "./streetPropsAtlas";
import { POLICE_DRUM, POLICE_DRUM_LAMP_DY_M, POLICE_PX_PER_M, policeSpecs } from "./streetPropsFrames";
import { CB } from "./barricadeArt";
import { textureRegistry } from "../gfx/textureRegistry";

vi.mock("phaser", () => ({}));

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
