import { describe, expect, it } from "vitest";
import type { CoverObject, MapBox } from "@topdown/shared";
import { bakeTiles, type BakeTile } from "./bakeTiles";
import { baseKey, drawOverlay, mapBounds, type CityScene } from "./drawCity";
import { downtownScene } from "./testScene";
import { packAtlas } from "./atlasLayout";
import { downtownSpecs } from "./spriteAtlas";

/** A fake 2D context: records every call and property write (no DOM). */
function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const grad = { addColorStop: (): void => undefined };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => {
      if (k === "createRadialGradient" || k === "createLinearGradient") return (...a: unknown[]) => (log.push(`${String(k)}(${a.join(",")})`), grad);
      if (k === "createPattern") return () => ({});
      return (...a: unknown[]) => {
        log.push(`${String(k)}(${a.map((v) => (typeof v === "object" ? "obj" : String(v))).join(",")})`);
      };
    },
    set: (_t, k, v) => (log.push(`${String(k)}=${typeof v === "object" ? "obj" : String(v)}`), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

const fakeCanvas = (w: number, h: number): BakeTile["canvas"] => {
  const { ctx } = recorder();
  return { width: w, height: h, getContext: () => ctx };
};
const tiles = (): BakeTile[] => [{ canvas: fakeCanvas(2016, 1344), base: fakeCanvas(2016, 1344), x: 0, y: 0 }];

const bus = (cs: CityScene): CoverObject => cs.cover.find((c) => c.kind === "bus") as CoverObject;
const isTwin = (b: MapBox, c: MapBox): boolean => b.minX === c.minX && b.minY === c.minY && b.maxX === c.maxX && b.maxY === c.maxY;
const shift = <T extends MapBox>(b: T, dx: number): T => ({ ...b, minX: b.minX + dx, maxX: b.maxX + dx });
/** A decay-style bus move: the cover and its wall twin (city_bus) move together, so no building appears. */
const moveBus = (cs: CityScene, dx: number): CityScene => {
  const b = bus(cs);
  return { ...cs, cover: cs.cover.map((c) => (c === b ? shift(c, dx) : c)), walls: cs.walls.map((w) => (isTwin(w, b) ? shift(w, dx) : w)) };
};
/** A removed bus takes its wall along (4.5). */
const dropBus = (cs: CityScene): CityScene => {
  const b = bus(cs);
  return { ...cs, cover: cs.cover.filter((c) => c !== b), walls: cs.walls.filter((w) => !isTwin(w, b)) };
};

describe("bake: the base layer is cached and redrawn when what it shows changes (re-review)", () => {
  it("baseKey changes when the bus moves or goes (its skid marks and glass are in the base, L2)", () => {
    const cs = downtownScene(1);
    expect(cs.cover.some((c) => c.kind === "bus")).toBe(true);
    expect(baseKey(moveBus(cs, 0))).toBe(baseKey(cs));
    expect(baseKey(moveBus(cs, 2))).not.toBe(baseKey(cs));
    expect(cs.walls.some((w) => isTwin(w, bus(cs)))).toBe(true);
    expect(baseKey(dropBus(cs))).not.toBe(baseKey(cs));
  });
  it("first bake draws the base; same base → overlay only; a base change (moved bus) → base again", () => {
    const counts = { base: 0, overlay: 0 };
    const paint = { base: (): void => void counts.base++, overlay: (): void => void counts.overlay++ };
    const t = tiles();
    const img = {} as CanvasImageSource;
    const s1 = downtownScene(1);
    let r = bakeTiles(t, s1, 42, null, img, img, paint);
    expect(r.baseRedrawn).toBe(true);
    expect(counts).toEqual({ base: 1, overlay: 1 });
    // a stage change that leaves the base alone (stage 2: barrier, debris; same buildings, same bus)
    const s2 = downtownScene(2);
    expect(baseKey(s2)).toBe(baseKey(s1));
    r = bakeTiles(t, s2, 42, r.baseKey, img, img, paint);
    expect(r.baseRedrawn).toBe(false);
    expect(counts).toEqual({ base: 1, overlay: 2 });
    // the bus moves: the base is redrawn
    r = bakeTiles(t, moveBus(s2, 3), 42, r.baseKey, img, img, paint);
    expect(r.baseRedrawn).toBe(true);
    expect(counts).toEqual({ base: 2, overlay: 3 });
  });
});

describe("random streams at the call sites (re-review L4)", () => {
  const overlayLog = (cs: CityScene): string => {
    const { ctx, log } = recorder();
    drawOverlay(ctx, 1, cs, mapBounds(cs.map));
    return log.join("\n");
  };
  it("renaming one debris prop (same box) changes how it looks; the same scene draws the same", () => {
    const cs = downtownScene(2);
    const props = cs.map.stages[1] ?? [];
    expect(props.map((p) => p.name)).toContain("debris_west");
    const renamed: CityScene = { ...cs, map: { ...cs.map, stages: cs.map.stages.map((g, i) => (i === 1 ? g.map((p) => (p.name === "debris_west" ? { ...p, name: "debris_wesX" } : p)) : g)) } };
    expect(overlayLog(downtownScene(2))).toBe(overlayLog(cs));
    expect(overlayLog(renamed)).not.toBe(overlayLog(cs));
  });
  it("Story 4.12: the burning car is baked charred (its target's frame), and no flame is baked any more (the view's particles)", () => {
    const frames = new Map(packAtlas(downtownSpecs()).frames.map((f) => [f.name, f] as const));
    const cs: CityScene = { ...downtownScene(3, 0b01001111), atlas: { canvas: null, frames } as unknown as CityScene["atlas"] };
    expect(cs.fires.length).toBe(1);
    const renamed: CityScene = { ...cs, fires: cs.fires.map((f) => ({ ...f, name: `${f.name}X` })) };
    expect(overlayLog(renamed)).toBe(overlayLog(cs)); // 4.11's static flames (seeded by the fire's name) are gone
    const notACar: CityScene = { ...cs, fires: cs.fires.map((f) => ({ ...f, target: "nothing" })) };
    expect(overlayLog(notACar)).not.toBe(overlayLog(cs)); // same scorch, but the car is drawn from its normal frame
  });
});
