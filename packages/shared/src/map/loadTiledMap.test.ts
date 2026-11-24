import { describe, expect, it } from "vitest";
import { MAP_STAGE_GROUPS, MapError, loadTiledMap } from "./loadTiledMap";

/** Story 4.1: the Tiled JSON loader on small hand-written maps (the refusals name layer and object). */
type Obj = Record<string, unknown>;
const rect = (id: number, name: string, x: number, y: number, w: number, h: number, extra: Obj = {}): Obj => ({ id, name, x, y, width: w, height: h, rotation: 0, type: "", visible: true, ...extra });
/** Story 4.3: spawn points need a `kind` (default here: street); `props` replaces the property list. */
const point = (id: number, name: string, x: number, y: number, props: Obj[] = [{ name: "kind", type: "string", value: "street" }]): Obj => ({
  id,
  name,
  x,
  y,
  width: 0,
  height: 0,
  point: true,
  rotation: 0,
  type: "",
  visible: true,
  properties: props,
});
const sKind = (k: string): Obj => ({ name: "kind", type: "string", value: k });
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

/** `tiny()` with extra fields on the top-level layer `name`. */
function withLayer(name: string, extra: Obj): Obj {
  const m = tiny();
  m.layers = (m.layers as Obj[]).map((l) => (l.name === name ? { ...l, ...extra } : l));
  return m;
}
/** `tiny()` with extra fields on the object layer inside `stage1_evening`. */
function withNested(extra: Obj): Obj {
  const m = tiny();
  m.layers = (m.layers as Obj[]).map((l) => (l.name === "stage1_evening" ? { ...l, layers: (l.layers as Obj[]).map((c) => ({ ...c, ...extra })) } : l));
  return m;
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
    expect(m.spawnPoints).toEqual([{ name: "edge", x: 0.5, y: 0.5, minStage: 1, kind: "street", jitterAxis: "x" }]);
    expect(m.hazards).toEqual([{ name: "fire", minX: 5, minY: 2, maxX: 6, maxY: 3, kind: "fire", minStage: 3 }]);
    expect(m.stages[0]).toEqual([{ name: "lane", minX: 0, minY: 1.875, maxX: 8, maxY: 2.0625, kind: "lane", layer: "ground" }]);
    expect(m.stages.slice(1)).toEqual([[], [], [], []]);
  });

  it("Story 4.3: reads spawn kind, stage and jitter axis (default: x on the top/bottom edges, y elsewhere)", () => {
    const m = loadTiledMap(
      tiny({
        spawns: [
          point(3, "edge", 16, 16),
          point(6, "side", 16, 64, [sKind("alley")]),
          point(7, "win", 128, 64, [sKind("window"), { name: "minStage", type: "int", value: 3 }, { name: "jitterAxis", type: "string", value: "x" }]),
        ],
      }),
      "tiny",
    );
    expect(m.spawnPoints.map((s) => [s.name, s.kind, s.minStage, s.jitterAxis])).toEqual([
      ["edge", "street", 1, "x"],
      ["side", "alley", 1, "y"],
      ["win", "window", 3, "x"],
    ]);
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
    ["Story 4.3: spawn without a kind", tiny({ spawns: [point(3, "edge", 16, 16, [])] }), "spawns: edge: kind must be one of street, alley, manhole, window, breach, got (none)"],
    ["Story 4.3: unknown spawn kind", tiny({ spawns: [point(3, "edge", 16, 16, [sKind("portal")])] }), "spawns: edge: kind must be one of street, alley, manhole, window, breach, got portal"],
    ["Story 4.3: bad jitter axis", tiny({ spawns: [point(3, "edge", 16, 16, [sKind("window"), { name: "jitterAxis", type: "string", value: "z" }])] }), "spawns: edge: jitterAxis must be x or y, got z"],
    ["Story 4.3: no stage-1 spawn", tiny({ spawns: [point(3, "edge", 16, 16, [sKind("manhole"), { name: "minStage", type: "int", value: 2 }])] }), "spawns: needs at least one spawn point with minStage 1"],
    ["review L6: offset layer", withLayer("collision", { offsetx: 16 }), "layer collision has an offset (16, 0)"],
    ["review L6: parallax layer", withLayer("cover", { parallaxy: 0.5 }), "layer cover has a parallax factor (1, 0.5)"],
    ["review L6: hidden layer", withLayer("spawns", { visible: false }), "layer spawns is hidden"],
    ["review L6: hidden stage group", withLayer("stage2_panic", { visible: false }), "layer stage2_panic is hidden"],
    ["review L6: offset layer inside a group", withNested({ offsetx: 0, offsety: -8 }), "layer stage1_evening/ground has an offset (0, -8)"],
  ])("refuses %s", (_name, raw, message) => {
    expect(issuesOf(raw)).toContain(message);
  });
});
