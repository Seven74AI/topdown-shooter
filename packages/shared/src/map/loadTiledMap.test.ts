import { describe, expect, it } from "vitest";
import { MAP_STAGE_GROUPS, MapError, loadTiledMap } from "./loadTiledMap";

/** Story 4.1: the Tiled JSON loader on small hand-written maps (the refusals name layer and object). */
type Obj = Record<string, unknown>;
const rect = (id: number, name: string, x: number, y: number, w: number, h: number, extra: Obj = {}): Obj => ({ id, name, x, y, width: w, height: h, rotation: 0, type: "", visible: true, ...extra });
const point = (id: number, name: string, x: number, y: number): Obj => ({ id, name, x, y, width: 0, height: 0, point: true, rotation: 0, type: "", visible: true });
const kind = (k: string, minStage?: number): Obj => ({
  properties: [{ name: "kind", type: "string", value: k }, ...(minStage === undefined ? [] : [{ name: "minStage", type: "int", value: minStage }])],
});
const group = (name: string, objects: Obj[]): Obj => ({ type: "objectgroup", id: 1, name, objects, visible: true });

/** A valid 8 × 4 m map, 32 px tiles of 1 m. */
function tiny(over: { collision?: Obj[]; cover?: Obj[]; spawns?: Obj[]; hazards?: Obj[]; props?: Obj[]; map?: Obj; dropLayer?: string } = {}): Obj {
  const layers: Obj[] = [
    group("collision", over.collision ?? [rect(1, "box", 64, 32, 32, 48)]),
    group("cover", over.cover ?? [rect(2, "car", 160, 32, 64, 32, kind("car"))]),
    group("spawns", over.spawns ?? [point(3, "edge", 16, 16)]),
    group("hazards", over.hazards ?? [rect(4, "fire", 160, 64, 32, 32, kind("fire", 3))]),
    ...MAP_STAGE_GROUPS.map((n, i) => ({ type: "group", id: 10 + i, name: n, visible: true, layers: i === 0 ? [group("ground", over.props ?? [rect(5, "lane", 0, 60, 256, 6, kind("lane"))])] : [] })),
  ].filter((l) => l.name !== over.dropLayer);
  return {
    type: "map",
    orientation: "orthogonal",
    infinite: false,
    width: 8,
    height: 4,
    tilewidth: 32,
    tileheight: 32,
    layers,
    properties: [
      { name: "metersPerTile", type: "float", value: 1 },
      { name: "cellM", type: "float", value: 0.5 },
    ],
    ...over.map,
  };
}

const issuesOf = (raw: unknown): string => {
  try {
    loadTiledMap(raw, "tiny");
  } catch (e) {
    expect(e).toBeInstanceOf(MapError);
    return (e as MapError).message;
  }
  throw new Error("expected a MapError");
};

describe("loadTiledMap (Story 4.1)", () => {
  it("converts pixels to metres and keeps every layer's objects", () => {
    const m = loadTiledMap(tiny(), "tiny");
    expect([m.widthM, m.heightM]).toEqual([8, 4]);
    expect(m.solids).toEqual([{ name: "box", minX: 2, minY: 1, maxX: 3, maxY: 2.5 }]);
    expect(m.cover).toEqual([{ name: "car", minX: 5, minY: 1, maxX: 7, maxY: 2, kind: "car", minStage: 1 }]);
    expect(m.spawnPoints).toEqual([{ name: "edge", x: 0.5, y: 0.5, minStage: 1 }]);
    expect(m.hazards).toEqual([{ name: "fire", minX: 5, minY: 2, maxX: 6, maxY: 3, kind: "fire", minStage: 3 }]);
    expect(m.stages[0]).toEqual([{ name: "lane", minX: 0, minY: 1.875, maxX: 8, maxY: 2.0625, kind: "lane", layer: "ground" }]);
    expect(m.stages.slice(1)).toEqual([[], [], [], []]);
  });

  it("the version changes when the data changes (the join check refuses another map)", () => {
    const a = loadTiledMap(tiny(), "tiny").version;
    expect(loadTiledMap(tiny(), "tiny").version).toBe(a);
    expect(loadTiledMap(tiny({ collision: [rect(1, "box", 64, 32, 32, 64)] }), "tiny").version).not.toBe(a);
  });

  it.each([
    ["schema: no width", tiny({ map: { width: undefined } }), "width"],
    ["isometric", tiny({ map: { orientation: "isometric" } }), "orientation must be orthogonal"],
    ["infinite", tiny({ map: { infinite: true } }), "infinite maps"],
    ["no metersPerTile", tiny({ map: { properties: [{ name: "cellM", type: "float", value: 0.5 }] } }), "metersPerTile"],
    ["another grid", tiny({ map: { properties: [{ name: "metersPerTile", type: "float", value: 1 }, { name: "cellM", type: "float", value: 1 }] } }), "cellM must be 0.5"],
    ["missing layer", tiny({ dropLayer: "hazards" }), "layer hazards is missing"],
    ["missing stage group", tiny({ dropLayer: "stage4_ruins" }), "layer group stage4_ruins is missing"],
    ["off the lattice", tiny({ collision: [rect(1, "box", 70, 32, 32, 48)] }), "collision: box: edges must lie on the 0.5 m grid"],
    ["rotated", tiny({ collision: [rect(1, "box", 64, 32, 32, 48, { rotation: 30 })] }), "collision: box: rotated objects"],
    ["ellipse", tiny({ collision: [rect(1, "box", 64, 32, 32, 48, { ellipse: true })] }), "collision: box: must be a rectangle"],
    ["off the map", tiny({ collision: [rect(1, "box", 224, 32, 64, 48)] }), "collision: box: outside"],
    ["unnamed", tiny({ collision: [rect(1, "", 64, 32, 32, 48)] }), "collision: object #1 needs a name"],
    ["duplicate", tiny({ collision: [rect(1, "box", 64, 32, 32, 48), rect(9, "box", 0, 96, 32, 32)] }), "collision: name box is used twice"],
    ["bad cover kind", tiny({ cover: [rect(2, "car", 160, 32, 64, 32, kind("tank"))] }), "cover: car: kind must be one of car, bus, barrier, sandbags"],
    ["bad stage", tiny({ cover: [rect(2, "car", 160, 32, 64, 32, kind("car", 9))] }), "cover: car: minStage must be an integer 1–5"],
    ["spawn in a box", tiny({ spawns: [point(3, "edge", 80, 48)] }), "spawns: edge: inside collision box box"],
    ["spawn not a point", tiny({ spawns: [rect(3, "edge", 0, 0, 32, 32)] }), "spawns: edge: must be a point"],
    ["no spawns", tiny({ spawns: [] }), "spawns: needs at least one spawn point"],
  ])("refuses %s", (_name, raw, message) => {
    expect(issuesOf(raw)).toContain(message);
  });
});
