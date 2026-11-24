import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides, BalanceError } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt, placeBuilding, placementError, footprint, buildingStats, type Box } from "../buildings/buildings";
import { circleOverlapsBox, segmentHitsBuildings } from "../buildings/collision";
import type { SimEvent } from "../core/simEvents";
import { createWorld, step, type World } from "../core/world";
import { snapshotSeedStreams } from "../core/seedStreams";
import { snapshotWorld, worldDigest } from "../core/worldSnapshot";
import { DOWNTOWN_MAP } from "../map/downtown";
import { MapError, loadTiledMap, MAP_STAGE_GROUPS } from "../map/loadTiledMap";
import { createObstacles } from "../map/obstacles";
import { currentDecayStage } from "../map/decayStage";
import type { DecayMutation, DistrictMap, MapBox } from "../map/districtMap";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { skipWave, startBuild, startWave } from "../run/runStateMachine";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { FLOW_UNREACHED, flowCellAt, rebuildFlowFieldNow } from "../zombies/flowField";
import { ZOMBIE_TYPES, isWindupState, type ZombieTypeId } from "../zombies/zombieTypes";
import { jitteredSpawn } from "../waves/waveDirector";
import { runHeadless } from "../bots/headlessRun";
import { createInputLog, replayRun } from "../replay/inputLog";
import { applyDecayStage } from "./applyDecayStage";
import { gameplayVariantMask, legalDecayMasks, pickDecayVariants, stageForWave } from "./decayState";
import { masksForStage } from "./masks.testkit";
import { changeDecayStage, relocated } from "./decaySystem";

/**
 * Story 4.5: the decay stage engine — timeline, every mutation action on a small hand-written map,
 * the DecaySystem's build-start order on Downtown (refunds, push-outs, fields), variations from the
 * `decay` stream, replay, and the player-visible properties.
 */
const balance = loadBalance();
const names = (l: readonly MapBox[]) => l.map((b) => b.name);

// ---- a small map with every action ---------------------------------------------------------------

type Obj = Record<string, unknown>;
const P = 32; // px per 1 m tile
const prop = (name: string, value: string | number): Obj => ({ name, type: typeof value === "string" ? "string" : "int", value });
const rect = (id: number, name: string, x: number, y: number, w: number, h: number, props: Obj[] = []): Obj => ({
  id,
  name,
  x: x * P,
  y: y * P,
  width: w * P,
  height: h * P,
  rotation: 0,
  type: "",
  visible: true,
  ...(props.length ? { properties: props } : {}),
});
const point = (id: number, name: string, x: number, y: number, props: Obj[]): Obj => ({ id, name, x: x * P, y: y * P, width: 0, height: 0, point: true, rotation: 0, type: "", visible: true, properties: props });
const layer = (name: string, objects: Obj[]): Obj => ({ type: "objectgroup", id: 1, name, objects, visible: true });

/** 16 × 8 m: a wall, the bus (collision + cover, like Downtown), two cars; the decay layer uses every action. */
function testMapJson(decay: Obj[] = DECAY_OBJECTS): Obj {
  return {
    type: "map",
    orientation: "orthogonal",
    infinite: false,
    width: 16,
    height: 8,
    tilewidth: P,
    tileheight: P,
    properties: [
      { name: "metersPerTile", type: "float", value: 1 },
      { name: "cellM", type: "float", value: 0.5 },
    ],
    layers: [
      layer("collision", [rect(1, "wall_a", 1, 1, 1, 2), rect(2, "city_bus", 10, 1, 4, 1)]),
      layer("cover", [rect(3, "bus_hull", 10, 1, 4, 1, [prop("kind", "bus")]), rect(4, "car_a", 4, 5, 2, 1, [prop("kind", "car")]), rect(5, "car_b", 7, 5, 2, 1, [prop("kind", "car")])]),
      layer("spawns", [point(6, "edge", 0.5, 4, [prop("kind", "street")])]),
      layer("hazards", []),
      layer("decay", decay),
      ...MAP_STAGE_GROUPS.map((n, i) => ({ type: "group", id: 20 + i, name: n, visible: true, layers: [] })),
    ],
  };
}
const DECAY_OBJECTS: Obj[] = [
  rect(10, "new_car", 4, 1, 2, 1, [prop("stage", 2), prop("action", "add"), prop("kind", "car")]),
  point(11, "car_a_gone", 5, 5.5, [prop("stage", 2), prop("action", "remove"), prop("target", "car_a")]),
  rect(12, "rubble", 11, 5, 2, 2, [prop("stage", 2), prop("action", "block")]),
  point(13, "car_b_fire", 8, 5.5, [prop("stage", 3), prop("action", "ignite"), prop("target", "car_b"), prop("radiusM", 2)]),
  point(14, "bus_gone", 12, 1.5, [prop("stage", 3), prop("action", "remove"), prop("target", "bus_hull")]),
  rect(15, "v1_car", 1, 6, 1, 1, [prop("stage", 2), prop("action", "add"), prop("kind", "car"), prop("group", "g"), prop("variant", "v1"), prop("pick", 1)]),
  rect(16, "v2_barrier", 14, 5, 1, 1, [prop("stage", 2), prop("action", "add"), prop("kind", "barrier"), prop("group", "g"), prop("variant", "v2"), prop("pick", 1)]),
];
const TEST_MAP: DistrictMap = loadTiledMap(testMapJson(), "decay-test");
const V1 = 1;
const V2 = 2;

describe("Story 4.5 timeline (decay.json)", () => {
  it("waves 1–2 → 1, 3–4 → 2, 5–6 → 3, 7–8 → 4, 9–10 → 5; later waves keep stage 5; a dev table overrides it", () => {
    const got = Array.from({ length: 12 }, (_, i) => stageForWave(balance, i + 1));
    expect(got).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5]);
    expect(stageForWave(balance, 0)).toBe(1);
    expect(stageForWave(balance, 1, [2, 3])).toBe(2);
    expect(stageForWave(balance, 9, [2, 3])).toBe(3);
    expect(balance.decay.stageNames[1]).toBe("Panic");
    expect(balance.decay.buildingRefundShare).toBe(0.5);
  });

  it("refuses a table that goes back, a sixth stage name, a refund share above 1", () => {
    const bad = (path: string, value: number) => () => loadBalance(withOverrides(bundledBalanceFiles(), [["decay", path, value]]));
    expect(bad("stageByWave.3", 1)).toThrow(BalanceError);
    expect(bad("stageByWave.0", 6)).toThrow(BalanceError);
    expect(bad("buildingRefundShare", 1.5)).toThrow(BalanceError);
  });
});

describe("Story 4.5 mutation set in the map (loader)", () => {
  it("reads every action, resolves remove/ignite targets to their boxes, and numbers the variants", () => {
    const d = TEST_MAP.decay;
    expect(d.map((m) => `${m.name}:${m.action}:${m.stage}`)).toEqual([
      "new_car:add:2",
      "car_a_gone:remove:2",
      "rubble:block:2",
      "car_b_fire:ignite:3",
      "bus_gone:remove:3",
      "v1_car:add:2",
      "v2_barrier:add:2",
    ]);
    const fire = d.find((m) => m.name === "car_b_fire") as DecayMutation;
    expect(fire).toMatchObject({ target: "car_b", radiusM: 2, minX: 7, minY: 5, maxX: 9, maxY: 6, variant: -1 });
    expect(TEST_MAP.decayVariants).toEqual([
      { name: "v1", group: "g", pick: 1, stage: 2 },
      { name: "v2", group: "g", pick: 1, stage: 2 },
    ]);
    expect(d.find((m) => m.name === "v2_barrier")?.variant).toBe(1);
  });

  it("Downtown: stage 2 removes parked_car_3, blocks alley 3, adds 2 police lines and moves 4 of 6 curb cars; stage 3 ignites two of three cars (Story 4.8); stages 4–5 empty", () => {
    const d = DOWNTOWN_MAP.decay;
    const s2 = d.filter((m) => m.stage === 2);
    // Story 4.7 (replaces 4.5's abandoned-car pair): 6 movers × (remove + add) + 2 barriers + 4.5's remove and block.
    expect(s2.filter((m) => m.variant < 0).map((m) => `${m.action}:${m.name}`).sort()).toEqual([
      "add:police_line_gas",
      "add:police_line_lot",
      "block:dumpster_alley_3",
      "remove:parked_car_3_driven_off",
    ]);
    expect(s2.filter((m) => m.variant >= 0).map((m) => m.action).sort()).toEqual([...Array(6).fill("add"), ...Array(6).fill("remove")]);
    expect(d.filter((m) => m.stage === 3).map((m) => m.action)).toEqual(["ignite", "ignite", "ignite"]);
    // Story 6.2 (Ruins): the collapsed alley (3 candidates; alley 2 fills its corner pocket too, alley 3
    // buries the dumpster), three street piles, three looks. Story 6.4 (Collapse): four weather looks, no solids.
    expect(d.filter((m) => m.stage === 4).map((m) => `${m.action}:${m.name}`)).toEqual([
      "block:rubble_alley_1",
      "block:rubble_alley_2",
      "block:rubble_alley_2_corner",
      "block:rubble_alley_3",
      "remove:rubble_alley_3_buries_dumpster",
      "block:rubble_pile_1",
      "block:rubble_pile_2",
      "block:rubble_pile_3",
      "look:ruins_look_concrete",
      "look:ruins_look_brick",
      "look:ruins_look_slab",
    ]);
    expect(d.filter((m) => m.stage === 5).map((m) => m.action)).toEqual(["look", "look", "look", "look"]);
    // Stage-4/5 objects come after every older one (map order), so old seeds keep their picks.
    expect(d.findIndex((m) => m.stage >= 4)).toBe(d.length - 15);
    expect(DOWNTOWN_MAP.decayVariants.map((v) => `${v.group}/${v.name}/${v.pick}`)).toEqual([
      ...["curb_car_west_far", "curb_car_west_n", "curb_car_west_s", "curb_car_north", "curb_car_south", "street_car_east"].map((c) => `panic_cars_moved/panic_move_${c}/4`),
      "breakdown_car_fire/fire_parked_car_2/2",
      "breakdown_car_fire/fire_street_car_west/2",
      "breakdown_car_fire/fire_parked_car_1/2",
      "ruins_alley/ruins_alley_1/1",
      "ruins_alley/ruins_alley_2/1",
      "ruins_alley/ruins_alley_3/1",
      "ruins_look/ruins_look_concrete/1",
      "ruins_look/ruins_look_brick/1",
      "ruins_look/ruins_look_slab/1",
      "collapse_style/collapse_haze/1",
      "collapse_style/collapse_fog_bank/1",
      "collapse_style/collapse_ash/1",
      "collapse_style/collapse_flood/1",
    ]);
    expect(DOWNTOWN_MAP.decayVariants.length).toBeLessThanOrEqual(32); // 9 + 3 + 3 + 4 = 19 bits
  });

  const refuse = (objs: Obj[], text: RegExp) => {
    expect(() => loadTiledMap(testMapJson(objs), "bad")).toThrow(MapError);
    try {
      loadTiledMap(testMapJson(objs), "bad");
    } catch (e) {
      expect((e as MapError).message).toMatch(text);
    }
  };
  it("refuses stage 1, an unknown action, an add without a cover kind, an unknown target, an ignite with a bad radius (Story 4.8: optional), off-lattice boxes", () => {
    refuse([rect(30, "x", 4, 1, 1, 1, [prop("stage", 1), prop("action", "block")])], /x: stage must be an integer 2–5/);
    refuse([rect(30, "x", 4, 1, 1, 1, [prop("stage", 2), prop("action", "explode")])], /x: action must be one of add, remove, ignite, block, look/);
    refuse([rect(30, "x", 4, 1, 1, 1, [prop("stage", 2), prop("action", "add")])], /x: an add needs a cover kind/);
    refuse([point(30, "x", 4, 1, [prop("stage", 2), prop("action", "remove"), prop("target", "nope")])], /x: target must name/);
    refuse([point(30, "x", 4, 1, [prop("stage", 2), prop("action", "ignite"), prop("target", "car_b"), prop("radiusM", 0)])], /x: an ignite's radiusM, if given, must be > 0/);
    refuse([rect(30, "x", 4.25, 1, 1, 1, [prop("stage", 2), prop("action", "block")])], /edges must lie on the 0.5 m grid/);
  });

  it("Story 6.2: a `look` is a point carrying only a variant (no box, no gameplay); without a variant, or as a rectangle, it is refused", () => {
    const look = (id: number, v: string): Obj => point(id, `look_${v}`, 3, 3, [prop("stage", 4), prop("action", "look"), prop("group", "mat"), prop("variant", v), prop("pick", 1)]);
    const m = loadTiledMap(testMapJson([...DECAY_OBJECTS, look(40, "a"), look(41, "b")]), "looks");
    const looks = m.decay.filter((d) => d.action === "look");
    expect(looks.map((d) => `${d.name}:${d.minX},${d.minY},${d.maxX},${d.maxY}:${m.decayVariants[d.variant]?.group}`)).toEqual(["look_a:3,3,3,3:mat", "look_b:3,3,3,3:mat"]);
    // No gameplay: the obstacle lists at stage 4 are the same with either look.
    const va = m.decayVariants.findIndex((v) => v.name === "a");
    const vb = m.decayVariants.findIndex((v) => v.name === "b");
    expect(names(createObstacles(m, 4, 1 << va).solids)).toEqual(names(createObstacles(m, 4, 1 << vb).solids));
    refuse([point(30, "x", 4, 1, [prop("stage", 4), prop("action", "look")])], /x: a look needs variant, group and pick/);
    refuse([rect(30, "x", 4, 1, 1, 1, [prop("stage", 4), prop("action", "look"), prop("group", "g"), prop("variant", "v"), prop("pick", 1)])], /x: a look must be a point/);
  });

  it("Story 6.2: a breach spawn needs a jitterAxis (it jitters along its wall)", () => {
    const json = testMapJson();
    const spawns = (json.layers as Obj[]).find((l) => l.name === "spawns") as { objects: Obj[] };
    spawns.objects.push(point(50, "hole", 3, 6, [prop("kind", "breach"), prop("minStage", 4)]));
    expect(() => loadTiledMap(json, "bad")).toThrow(/hole: a breach needs a jitterAxis/);
    (spawns.objects[spawns.objects.length - 1] as { properties: Obj[] }).properties.push(prop("jitterAxis", "x"));
    expect(loadTiledMap(json, "ok").spawnPoints.find((s) => s.name === "hole")?.kind).toBe("breach");
  });

  it("refuses inconsistent variation groups (pick or stage differ, too few candidates, a half-filled variation)", () => {
    const v = (id: number, name: string, group: string, variant: string, pick: number, stage = 2) =>
      rect(id, name, 4, 1, 1, 1, [prop("stage", stage), prop("action", "block"), prop("group", group), prop("variant", variant), prop("pick", pick)]);
    refuse([v(30, "a", "g", "va", 1), v(31, "b", "g", "vb", 2)], /group g needs the same pick and stage/);
    refuse([v(30, "a", "g", "va", 1), v(31, "b", "g", "vb", 1, 3)], /group g needs the same pick and stage/);
    refuse([v(30, "a", "g", "va", 1)], /group g picks 1 of 1 variants/);
    refuse([rect(30, "a", 4, 1, 1, 1, [prop("stage", 2), prop("action", "block"), prop("group", "g")])], /a variation needs variant/);
  });
});

describe("Story 4.5 applyDecayStage: each action (the shared, side-effect-free apply)", () => {
  const world = (): World => createWorld({ balance, seed: 1, map: TEST_MAP });

  it("add (car stops shots; barrier only bodies), remove, block (a wall: bodies and shots), per chosen variant", () => {
    const w = world();
    expect(names(w.obstacles.solids)).toEqual(["wall_a", "city_bus", "car_a", "car_b"]);
    expect(applyDecayStage(w, 2, V1)).toBe(true);
    expect(currentDecayStage(w)).toBe(2);
    expect(names(w.obstacles.walls)).toEqual(["wall_a", "city_bus", "rubble"]);
    expect(names(w.obstacles.solids)).toEqual(["wall_a", "city_bus", "rubble", "car_b", "new_car", "v1_car"]);
    expect(names(w.obstacles.shotBlockers)).toEqual(["wall_a", "city_bus", "rubble", "car_b", "new_car", "v1_car"]);
    expect(names(w.obstacles.cover)).toEqual(["bus_hull", "car_b", "new_car", "v1_car"]);
    expect(applyDecayStage(w, 2, V2)).toBe(true);
    expect(names(w.obstacles.solids)).toEqual(["wall_a", "city_bus", "rubble", "car_b", "new_car", "v2_barrier"]);
    expect(names(w.obstacles.shotBlockers)).toEqual(["wall_a", "city_bus", "rubble", "car_b", "new_car"]); // a barrier: bodies only
    expect(w.decay.fires).toEqual([]);
  });

  it("ignite makes a fire record at the target's centre (data only: the car stays solid); removing the bus takes its collision box too (4.2 L2)", () => {
    const w = world();
    applyDecayStage(w, 3, V1);
    expect(w.decay.fires).toEqual([{ name: "car_b_fire", target: "car_b", x: 8, y: 5.5, radiusM: 2, stage: 3, index: 0 }]);
    expect(names(w.obstacles.solids)).toContain("car_b");
    expect(names(w.obstacles.walls)).toEqual(["wall_a", "rubble"]);
    expect(names(w.obstacles.solids)).not.toContain("city_bus");
    expect(names(w.obstacles.cover)).not.toContain("bus_hull");
  });

  it("the nav grid's walls follow; idempotent (no-op, same version) when unchanged; back to stage 1 = the start lists", () => {
    const w = world();
    const nav = w.pathing.nav;
    const at = (x: number, y: number) => nav.wallAt[flowCellAt(nav, x, y)];
    expect([at(12, 6), at(5, 1.5), at(5, 5.5)]).toEqual([0, 0, 1]);
    applyDecayStage(w, 2, V1);
    expect([at(12, 6), at(5, 1.5), at(5, 5.5)]).toEqual([1, 1, 0]); // rubble, new car walls; car_a gone
    const v = w.obstacles.version;
    expect(applyDecayStage(w, 2, V1)).toBe(false);
    expect(w.obstacles.version).toBe(v);
    expect(applyDecayStage(w, 1, V1)).toBe(true);
    expect(names(w.obstacles.solids)).toEqual(names(createObstacles(TEST_MAP, 1).solids));
    expect([at(12, 6), at(5, 1.5), at(5, 5.5)]).toEqual([0, 0, 1]);
  });

  it("an ignite whose target was removed leaves no fire", () => {
    const m = loadTiledMap(
      testMapJson([
        point(30, "a_gone", 5, 5.5, [prop("stage", 2), prop("action", "remove"), prop("target", "car_a")]),
        point(31, "a_fire", 5, 5.5, [prop("stage", 3), prop("action", "ignite"), prop("target", "car_a"), prop("radiusM", 2)]),
      ]),
      "gone",
    );
    const w = createWorld({ balance, seed: 1, map: m });
    applyDecayStage(w, 3, 0);
    expect(w.decay.fires).toEqual([]);
  });
});

// ---- Downtown: the DecaySystem at a build start --------------------------------------------------

const DT = DOWNTOWN_MAP;
const DUMPSTER = DT.decay.find((m) => m.name === "dumpster_alley_3") as DecayMutation;
const chosenCar = (w: World) => DT.decay.find((m) => m.action === "add" && m.variant >= 0 && (w.decay.variants >>> m.variant) & 1) as DecayMutation;

function downtownRun(seed = 3, players = 2): World {
  const w = createWorld({ balance, seed, map: DT, systems: { waves: () => {} } });
  w.debug.godMode = true;
  const at = { x: 0, y: 0 };
  for (let slot = 0; slot < players; slot++) {
    teamSpawnPoint(w, slot, at);
    addPlayer(w, `p${slot}`, at.x, at.y).wallet = 1000;
  }
  startBuild(w);
  return w;
}
/** The run state machine's own path to the next build start (a cleared wave: `skipWave` → `endWave` → `startBuild`). */
function nextBuild(w: World): SimEvent[] {
  const seen: SimEvent[] = [];
  const off = w.events.subscribe((e) => seen.push(e));
  startWave(w);
  skipWave(w);
  step(w, TICK_DT_S); // deliver
  off();
  return seen;
}
const insideAny = (w: World, x: number, y: number, r: number) => w.obstacles.solids.some((b) => circleOverlapsBox(x, y, r - 1e-6, b.minX, b.minY, b.maxX, b.maxY));

describe("Story 4.5 DecaySystem on Downtown (brief line 5 order)", () => {
  it("stage changes only at the build start before waves 3 and 5 (never mid-wave): a whole 6-wave run", () => {
    // Story 6.1: the run is 10 waves; this check keeps its 6-wave run (`runWaves` 6 override).
    const w = createWorld({ balance: loadBalance(withOverrides(bundledBalanceFiles(), [["waves", "runWaves", 6]])), seed: 11, map: DT });
    w.debug.godMode = true;
    addPlayer(w, "p0", 24, 16);
    startBuild(w);
    const changes: { tick: number; stage: number; phase: string; wave: number }[] = [];
    let stageAtWaveStart: number[] = [];
    let midWave = 0;
    let lastStage = w.decay.stage;
    let held = false;
    w.events.subscribe((e) => {
      if (e.type === "decay.stage_changed") changes.push({ tick: w.tick, stage: e.stage, phase: w.run.phase, wave: w.waves.number + 1 });
      if (e.type === "wave.started") stageAtWaveStart.push(w.decay.stage);
      if (e.type === "run.held_out") held = true;
    });
    stageAtWaveStart = [];
    for (let t = 0; t < 20 * 60 * 20 && !held; t++) {
      if (w.run.phase === "build") for (const p of w.players.values()) p.buildReady = true;
      const phaseBefore = w.run.phase;
      // Kill a wave zombie every 4 ticks (the wave really runs: spawns, rush, the last kill ends it).
      if (w.run.phase === "wave" && t % 4 === 0 && w.zombies.aliveCount > 0) killZombie(w, w.zombies.aliveIds[0] as number, "p0", "pistol");
      step(w, TICK_DT_S);
      if (w.decay.stage !== lastStage) {
        // A change is legal only on the tick a wave ended into a build (startBuild), never inside a wave.
        if (!(phaseBefore === "wave" && w.run.phase === "build")) midWave++;
        lastStage = w.decay.stage;
      }
    }
    expect(held).toBe(true); // liveness: the 6 waves really ran (Story 5.8: runWaves 6)
    expect(midWave).toBe(0);
    expect(stageAtWaveStart).toEqual([1, 1, 2, 2, 3, 3]);
    expect(changes.map((c) => [c.stage, c.wave, c.phase])).toEqual([
      [2, 3, "build"],
      [3, 5, "build"],
    ]);
  });

  it("buildings on newly blocked cells are destroyed and their owners refunded 50 % (wallet only, not earned); others stay", () => {
    const w = downtownRun();
    const wood = buildingStats(balance, "wood_barricade") as { price: number };
    const turret = buildingStats(balance, "auto_turret") as { price: number };
    const car = chosenCar(w);
    // Legal at stage 1: on the dumpster's cells, on the coming car, and one far away.
    const onDumpster = placeBuilding(w, "p0", { type: "wood_barricade", gx: 76, gy: 53, rot: 0 });
    const onCar = placeBuilding(w, "p1", { type: "auto_turret", gx: Math.round(car.minX / 0.5), gy: Math.round(car.minY / 0.5), rot: 0 });
    const safe = placeBuilding(w, "p0", { type: "wood_barricade", gx: 40, gy: 40, rot: 0 });
    expect([onDumpster.ok, onCar.ok, safe.ok]).toEqual([true, true, true]);
    nextBuild(w); // build before wave 2: stage 1 still
    expect(w.buildings.list.length).toBe(3);
    const p0 = w.players.get("p0") as { wallet: number; earned: number };
    const p1 = w.players.get("p1") as { wallet: number; earned: number };
    const before = { w0: p0.wallet, w1: p1.wallet, e0: p0.earned, e1: p1.earned };
    const seen: SimEvent[] = [];
    const off = w.events.subscribe((e) => seen.push(e));
    startWave(w);
    skipWave(w); // → endWave → startBuild (wave 3: stage 2)
    // The refund is paid in the build start itself (before the next tick's wave bonus).
    expect(p0.wallet - before.w0).toBe(Math.floor(wood.price * 0.5));
    expect(p1.wallet - before.w1).toBe(Math.floor(turret.price * 0.5));
    expect([p0.earned, p1.earned]).toEqual([before.e0, before.e1]);
    step(w, TICK_DT_S);
    off();
    expect(w.decay.stage).toBe(2);
    expect(w.buildings.list.map((b) => b.id)).toEqual([safe.ok ? safe.value.id : -1]);
    const destroyed = seen.filter((e) => e.type === "building.destroyed").map((e) => (e as { buildingType: string }).buildingType);
    expect(destroyed.sort()).toEqual(["auto_turret", "wood_barricade"]);
    const refunds = seen.filter((e) => e.type === "money.earned" && e.reason === "refund").map((e) => (e as { playerId: string; amount: number }));
    expect(refunds.map((r) => `${r.playerId}:${r.amount}`).sort()).toEqual([`p0:${Math.floor(wood.price / 2)}`, `p1:${Math.floor(turret.price / 2)}`]);
    // Order: refunds and destruction before the stage event, the stage event before build.started.
    const order = seen.map((e) => e.type).filter((t) => t === "building.destroyed" || t === "decay.stage_changed" || t === "build.started");
    expect(order).toEqual(["building.destroyed", "building.destroyed", "decay.stage_changed", "build.started"]);
  });

  it("players (standing and downed) and zombies a new solid lands on are moved out to the nearest clear spot", () => {
    const w = downtownRun(5, 3);
    nextBuild(w);
    const car = chosenCar(w);
    const p0 = w.players.get("p0");
    const p1 = w.players.get("p1");
    if (!p0 || !p1) throw new Error("players");
    // p0 in the middle of the dumpster, p1 downed inside the coming car, a zombie on the car's edge.
    p0.x = p0.prevX = (DUMPSTER.minX + DUMPSTER.maxX) / 2;
    p0.y = p0.prevY = (DUMPSTER.minY + DUMPSTER.maxY) / 2;
    p1.x = p1.prevX = (car.minX + car.maxX) / 2;
    p1.y = p1.prevY = (car.minY + car.maxY) / 2;
    startWave(w);
    p1.status = "downed";
    p1.downedTicksLeft = 1000;
    const zid = spawnZombie(w, "walker", car.minX + 0.2, (car.minY + car.maxY) / 2);
    const zr = balance.zombies.types.walker?.radiusM ?? 0;
    skipWave(w);
    expect(w.decay.stage).toBe(2);
    expect(relocated.players).toBe(2);
    expect(relocated.zombies).toBe(1);
    expect(relocated.zombiesRemoved).toBe(0);
    for (const p of w.players.values()) expect(insideAny(w, p.x, p.y, p.radiusM), p.id).toBe(false);
    expect(p0.status).toBe("alive");
    // p0 left the dumpster across its nearest face: still in alley 3, within a metre of the box.
    expect(Math.hypot(p0.x - (DUMPSTER.minX + DUMPSTER.maxX) / 2, p0.y - (DUMPSTER.minY + DUMPSTER.maxY) / 2)).toBeLessThan(2);
    expect(p0.prevX).toBe(p0.x);
    // p1 was returned to a teammate (downed → alive at the build start), outside every box too.
    expect(p1.status).toBe("alive");
    const z = w.zombies;
    expect(z.alivePos[zid]).toBeGreaterThanOrEqual(0);
    expect(insideAny(w, z.x[zid] as number, z.y[zid] as number, zr)).toBe(false);
    expect((z.x[zid] as number) <= car.minX - zr + 1e-4).toBe(true); // out across the near (west) face
    // Next ticks: nobody is pushed back in.
    for (let t = 0; t < 40; t++) step(w, TICK_DT_S);
    for (const p of w.players.values()) expect(insideAny(w, p.x, p.y, p.radiusM)).toBe(false);
  });

  it("4.2 review L1: the chase and flank fields are rebuilt at the build start itself (the new walls are unreachable at once)", () => {
    const w = downtownRun(7, 1);
    nextBuild(w);
    for (let t = 0; t < 200; t++) step(w, TICK_DT_S); // fields built on the stage-1 map
    const { nav, chase, flank } = w.pathing;
    const cell = flowCellAt(nav, (DUMPSTER.minX + DUMPSTER.maxX) / 2, (DUMPSTER.minY + DUMPSTER.maxY) / 2);
    expect(chase.front[cell]).not.toBe(FLOW_UNREACHED);
    const rebuilds = [chase.rebuilds, flank.rebuilds];
    startWave(w);
    skipWave(w); // no tick in between
    expect([chase.rebuilds - (rebuilds[0] as number), flank.rebuilds - (rebuilds[1] as number)]).toEqual([1, 1]);
    expect(chase.front[cell]).toBe(FLOW_UNREACHED);
    expect(flank.front[cell]).toBe(FLOW_UNREACHED);
    expect(chase.building).toBe(false);
  });

  it("the solo dev cheat's path (changeDecayStage) is the same: mutations, refunds, push-outs, fields, event; no-op on the same stage", () => {
    const w = downtownRun(9, 1);
    const seen: string[] = [];
    w.events.subscribe((e) => seen.push(e.type));
    placeBuilding(w, "p0", { type: "wood_barricade", gx: 76, gy: 53, rot: 0 });
    expect(changeDecayStage(w, 3)).toBe(true);
    step(w, TICK_DT_S);
    expect(w.decay.stage).toBe(3);
    expect(w.decay.fires).toHaveLength(2); // Story 4.8: two cars burn
    expect(seen.filter((t) => t === "building.destroyed" || t === "decay.stage_changed")).toEqual(["building.destroyed", "decay.stage_changed"]);
    expect(changeDecayStage(w, 3)).toBe(false);
    expect(changeDecayStage(w, 1)).toBe(true); // back (dev): stage 1's lists
    expect(names(w.obstacles.solids)).toEqual(names(createObstacles(DT, 1).solids));
  });
});

describe("Story 4.5 review fixes", () => {
  it("review L2: a barricade flush against a new solid survives with no refund; one overlapping it by 1 cm is destroyed and refunded", () => {
    // Hand-made buildings (the lattice can't express 1 cm): flush = edge on the dumpster's face; overlap = 0.01 m into it.
    for (const overlapM of [0, 0.01]) {
      const w = downtownRun(13, 1);
      const p0 = w.players.get("p0") as { wallet: number };
      const wood = buildingStats(balance, "wood_barricade") as { price: number; hp: number };
      const ok = addBuildingAt(w, { id: 50, type: "wood_barricade", ownerId: "p0", gx: 0, gy: 0, rot: 0, hp: wood.hp });
      if (!ok) throw new Error("building");
      const b = ok as unknown as { minX: number; minY: number; maxX: number; maxY: number };
      // North of the dumpster: [38, 40] × [DUMPSTER.minY − 0.5 + overlap, DUMPSTER.minY + overlap].
      b.minX = 38;
      b.maxX = 40;
      b.maxY = DUMPSTER.minY + overlapM;
      b.minY = b.maxY - 0.5;
      const before = p0.wallet;
      expect(changeDecayStage(w, 2)).toBe(true);
      if (overlapM === 0) {
        expect(w.buildings.list.map((x) => x.id)).toEqual([50]);
        expect(p0.wallet).toBe(before);
      } else {
        expect(w.buildings.list).toEqual([]);
        expect(p0.wallet - before).toBe(Math.floor(wood.price * 0.5));
      }
    }
  });

  it("note for 4.6–4.8: at every stage and every variant combination, every walkable cell is reachable from the team start (no enclosed area)", () => {
    let checked = 0;
    // Story 4.7: the combinations a run can pick (C(6,4) × C(3,2); Story 4.8); Story 6.2: × 3 alleys from stage 4.
    expect(legalDecayMasks(DT)).toHaveLength(135);
    for (let stage = 1; stage <= 5; stage++) {
      const masks = masksForStage(DT, stage);
      expect(masks).toHaveLength(stage < 4 ? 45 : 135);
      for (const mask of masks) {
        const w = createWorld({ balance, seed: 1, map: DT });
        applyDecayStage(w, stage, mask);
        addPlayer(w, "p0", DT.widthM / 2, DT.heightM / 2);
        const { nav, chase } = w.pathing;
        rebuildFlowFieldNow(chase, nav, w);
        let unreached = 0;
        for (let c = 0; c < nav.cells; c++) if (nav.wallAt[c] === 0 && (chase.front[c] as number) >= FLOW_UNREACHED) unreached++;
        expect(unreached, `stage ${stage} mask ${mask}`).toBe(0);
        // Story 4.7: and no slot narrower than a body (a closed nav edge would be a dead pocket).
        expect(nav.closedE.some((c) => c !== 0) || nav.closedS.some((c) => c !== 0), `stage ${stage} mask ${mask} closed edge`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBe(3 * 45 + 2 * 135); // Story 4.8: C(6,4) movers × C(3,2) fires; Story 6.2: × 3 alleys at stages 4–5
  });
});

describe("Story 4.5 DecayTimeline: variations from the decay stream", () => {
  it("same seed → same choices; exactly one per group; both candidates of each group occur; only the decay stream moves", () => {
    const seen = new Map<number, number>();
    for (let seed = 1; seed <= 256; seed++) {
      const a = createWorld({ balance, seed, map: DT });
      const b = createWorld({ balance, seed, map: DT });
      expect(a.decay.variants).toBe(b.decay.variants);
      const m = a.decay.variants;
      // Story 4.7: 4 of the 6 movers (bits 0–5), Story 4.8: two of the three fires (bits 6–8).
      let movers = 0;
      for (let i = 0; i < 6; i++) movers += (m >> i) & 1;
      expect(movers, `seed ${seed} car group`).toBe(4);
      expect(((m >> 6) & 1) + ((m >> 7) & 1) + ((m >> 8) & 1), `seed ${seed} fire group`).toBe(2);
      seen.set(m, (seen.get(m) ?? 0) + 1);
      // The other streams are untouched (a World on a map without variants starts them the same).
      const plain = createWorld({ balance, seed, map: { ...DT, decay: [], decayVariants: [] } });
      const sa = snapshotSeedStreams(a.streams);
      const sp = snapshotSeedStreams(plain.streams);
      expect({ ...sa, decay: null }).toEqual({ ...sp, decay: null });
      expect(sa.decay).not.toEqual(sp.decay);
    }
    // Every car × fire combination appears (45 in 256 seeds); Story 6.2: the alleys and looks are checked in ruins.test.ts.
    expect([...new Set([...seen.keys()].map((k) => (k & 0x1ff) >>> 0))].sort((x, y) => x - y)).toEqual(masksForStage(DT, 3).map((k) => (k & 0x1ff) >>> 0));
    expect(gameplayVariantMask(DT)).toBe(0xfff); // cars, fires, alleys; the 7 look bits are not gameplay
  });

  it("pickDecayVariants draws `pick` per group (partial Fisher–Yates): pick 2 of 3", () => {
    const m3 = loadTiledMap(
      testMapJson(["a", "b", "c"].map((v, i) => rect(40 + i, `blk_${v}`, 4 + i, 1, 1, 1, [prop("stage", 2), prop("action", "block"), prop("group", "g3"), prop("variant", v), prop("pick", 2)]))),
      "pick2",
    );
    const counts = [0, 0, 0];
    for (let seed = 1; seed <= 300; seed++) {
      const mask = createWorld({ balance, seed, map: m3 }).decay.variants;
      let bits = 0;
      for (let i = 0; i < 3; i++) if ((mask >> i) & 1) {
        bits++;
        counts[i] = (counts[i] as number) + 1;
      }
      expect(bits).toBe(2);
    }
    for (const c of counts) expect(c).toBeGreaterThan(150); // each ~200 of 300
    expect(pickDecayVariants({ ...TEST_MAP, decayVariants: [] }, createWorld({ balance, seed: 1 }).streams.decay)).toBe(0);
  });

  it("replay (4.4): a recorded bot run through stages 2 and 3 replays to the same digest; the variants are in it", () => {
    const log = createInputLog(21, 2);
    let digest = 0;
    let endStage = 0;
    const run = runHeadless({
      balance,
      seed: 21,
      players: 2,
      record: log,
      onEnd: (w) => {
        digest = worldDigest(w);
        endStage = w.decay.stage;
      },
    });
    // Liveness: the run got past wave 2, so the build start before wave 3 really entered stage 2.
    expect(run.wavesCleared).toBeGreaterThanOrEqual(2);
    expect(endStage).toBeGreaterThanOrEqual(2);
    const replayed = replayRun(balance, log);
    expect(worldDigest(replayed)).toBe(digest);
    expect(replayed.decay.stage).toBe(endStage);
    expect(snapshotWorld(replayed).decay.variants).toBe(createWorld({ balance, seed: 21, map: DT }).decay.variants);
    // The digest sees the decay state: another variant mask is another digest.
    const before = worldDigest(replayed);
    replayed.decay.variants ^= 3;
    expect(worldDigest(replayed)).not.toBe(before);
  }, 60_000);
});

describe("Story 4.5 player-visible properties", () => {
  it("a path can still be closed: after the dumpster narrows alley 3, a barricade still fits across the gap", () => {
    for (const seed of [1, 2]) {
      const w = downtownRun(seed, 1);
      expect(changeDecayStage(w, 2)).toBe(true);
      // The gap between the dumpster (x 39.5) and the warehouse (x 41) at the dumpster's rows.
      const wood = buildingStats(balance, "wood_barricade");
      if (!wood) throw new Error("wood");
      const req = { type: "wood_barricade", gx: Math.round(DUMPSTER.maxX / 0.5), gy: Math.round(DUMPSTER.minY / 0.5) + 1, rot: 1 };
      const box = footprint(wood, req.gx, req.gy, req.rot, { minX: 0, minY: 0, maxX: 0, maxY: 0 } as Box);
      expect(box.minX).toBe(39.5);
      expect(box.maxX).toBe(40); // rot 1: 0.5 m wide; two side by side close the 1.5 m gap
      expect(placementError(w, "p0", req)).toBe(null);
      expect(placeBuilding(w, "p0", req).ok).toBe(true);
      expect(placeBuilding(w, "p0", { ...req, gx: req.gx + 1 }).ok).toBe(true);
      expect(placeBuilding(w, "p0", { ...req, gx: req.gx + 2 }).ok).toBe(true);
      // Alley 3 is now closed at that row: no free line through it for a body.
      for (let x = 38.1; x < 41; x += 0.2) expect(segmentHitsBuildings(w, x, 25, x, 28.5, 0), `x ${x.toFixed(1)}`).toBe(true);
    }
  });

  it("zombies still reach us after stage 2: one of each type from every spawn open at stage 2 reaches the team", () => {
    const w = createWorld({ balance, seed: 4, map: DT, systems: { waves: () => {} } });
    w.debug.godMode = true;
    w.debug.decayStageByWave = [2]; // the run's first build start enters stage 2 (the real DecaySystem path)
    const at = { x: 0, y: 0 };
    for (let slot = 0; slot < 2; slot++) {
      teamSpawnPoint(w, slot, at);
      addPlayer(w, `p${slot}`, at.x, at.y);
    }
    startBuild(w);
    expect(w.decay.stage).toBe(2);
    expect(names(w.obstacles.solids)).toContain("dumpster_alley_3");
    expect(names(w.obstacles.solids)).toContain(chosenCar(w).name);
    startWave(w);
    const spawned: number[] = [];
    const out = { x: 0, y: 0 };
    for (const sp of DT.spawnPoints) {
      if (sp.minStage > 2) continue;
      for (const type of ZOMBIE_TYPES as readonly ZombieTypeId[]) {
        jitteredSpawn(w, sp, 0, balance.zombies.types[type]?.radiusM ?? 0, out);
        spawned.push(spawnZombie(w, type, out.x, out.y));
      }
    }
    const reached = new Set<number>();
    for (let t = 0; t < 20 * 90 && reached.size < spawned.length; t++) {
      step(w, TICK_DT_S);
      const z = w.zombies;
      for (const id of spawned) {
        if (z.alivePos[id] === -1) continue;
        if (isWindupState(z.state[id] as number)) reached.add(id); // Story 5.6: a Spitter "reaches" us when it winds up (in range, clear line)
        for (const p of w.players.values()) {
          if (Math.hypot(p.x - (z.x[id] as number), p.y - (z.y[id] as number)) <= 3 && !segmentHitsBuildings(w, z.x[id] as number, z.y[id] as number, p.x, p.y, 0)) reached.add(id);
        }
      }
      // Story 5.7: a zombie that reached us leaves (killed), so the crowd round the team never fills the 3 m
      // circle: with a 1.2 m Brute per spawn the bodies no longer fit, and late arrivals would stay outside it.
      for (const id of reached) if (z.alivePos[id] !== -1) killZombie(w, id, null, "cheat"); // Story 5.8: removed, not killed (a Bloater would burst)
    }
    expect(spawned.length).toBe(14 * ZOMBIE_TYPES.length); // liveness: 14 spawns open at stage 2
    expect(reached.size).toBe(spawned.length);
  }, 60_000);
});
