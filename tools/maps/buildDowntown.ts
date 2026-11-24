/**
 * Story 4.1: writes the Downtown map (Tiled is not installed where it was authored).
 *
 *   npx tsx tools/maps/buildDowntown.ts          → tools/maps/downtown.tmx (Tiled source),
 *                                                  apps/client/public/assets/maps/downtown.tmj (export),
 *                                                  packages/shared/src/map/data/downtown.tmj.json (the sim's copy)
 *   npx tsx tools/maps/buildDowntown.ts --sync   → only copies the .tmj export into the shared copy
 *
 * Once the designer edits the map in Tiled (open downtown.tmx, File › Export As… downtown.tmj),
 * stop running the generator and run `npm run maps:sync` after each export. The layout below is the
 * first draft: 1 tile = 1 m = 32 px, every collision/cover edge on the 0.5 m grid.
 *
 *   x: 0        8  11   18 20      28  32.5     41     48
 *   y0 +--------+--+-----+--+  N   +---------------+------+
 *      | corner |a1| apts|  |      |  [pump] fuel  | kiosk|
 *      | shop   |  |     |  |      |  [pump] canopy+------+
 *   10 +--------+--+-----+  |      |   gas station        |
 *   12 ------------------- intersection ------------------
 *    W   car                 (24,16)  [==== BUS ====]   car  E
 *   20 --------------------------------------------------
 *   22 +------+--+-wall     |      | +------+--+------+
 *      | diner|a2|  lot:    |      | |office|a3|wareh.|
 *      |      |  |  cars    |      | |      |  |      |
 *   32 +------+--+----------+  S   +-+------+--+------+
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const TMX_PATH = resolve(ROOT, "tools/maps/downtown.tmx");
export const TMJ_PATH = resolve(ROOT, "apps/client/public/assets/maps/downtown.tmj");
export const SHARED_COPY_PATH = resolve(ROOT, "packages/shared/src/map/data/downtown.tmj.json");

const WIDTH_TILES = 48;
const HEIGHT_TILES = 32;
const PX = 32; // pixels per tile
const METERS_PER_TILE = 1;
const CELL_M = 0.5;

type Props = Record<string, string | number | boolean>;
interface Rect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  props?: Props;
}
interface Point {
  name: string;
  x: number;
  y: number;
  props?: Props;
}
interface Layer {
  name: string;
  rects?: Rect[];
  points?: Point[];
  /**
   * Story 6.2: rects and points in ONE declared order (the decay layer). Map order matters there:
   * `pickDecayVariants` walks groups in first-appearance order, so objects appended later (stage 4–5)
   * must come after every older one, points included, or old seeds would change their cars and fires.
   */
  items?: (Rect | Point)[];
}
interface Group {
  name: string;
  layers: Layer[];
}

/** `building: true`: a real building, lobbed rounds don't fly over it (the pumps, the bus and the parking wall are low). */
const collision: Rect[] = [
  { name: "nw_corner_shop", x: 0, y: 0, w: 8, h: 10, props: { building: true } },
  { name: "nw_apartments", x: 11, y: 0, w: 7, h: 10, props: { building: true } },
  { name: "gas_kiosk", x: 41, y: 0, w: 7, h: 6, props: { building: true } },
  { name: "gas_pump_a", x: 32.5, y: 3.5, w: 2, h: 1 },
  { name: "gas_pump_b", x: 32.5, y: 7, w: 2, h: 1 },
  { name: "city_bus", x: 30, y: 14.5, w: 10, h: 2.5 },
  { name: "sw_diner", x: 0, y: 22, w: 7, h: 10, props: { building: true } },
  { name: "parking_wall", x: 10, y: 24, w: 0.5, h: 8 },
  { name: "se_offices", x: 30, y: 22, w: 8, h: 10, props: { building: true } },
  { name: "se_warehouse", x: 41, y: 22, w: 7, h: 10, props: { building: true } },
];

const cover: Rect[] = [
  { name: "bus_hull", x: 30, y: 14.5, w: 10, h: 2.5, props: { kind: "bus" } },
  { name: "parked_car_1", x: 11.5, y: 26, w: 2, h: 4.5, props: { kind: "car" } },
  { name: "parked_car_2", x: 14.5, y: 26, w: 2, h: 4.5, props: { kind: "car" } },
  { name: "parked_car_3", x: 17.5, y: 26, w: 2, h: 4.5, props: { kind: "car" } },
  { name: "street_car_west", x: 4, y: 13, w: 4.5, h: 2, props: { kind: "car" } },
  { name: "street_car_east", x: 42, y: 17.5, w: 4.5, h: 2, props: { kind: "car" } },
  // Story 4.6 (Evening, FR59): cars parked along the curbs (cover from wave 1; Story 4.7 moves 4 of them).
  { name: "curb_car_west_far", x: 3, y: 18, w: 4.5, h: 2, props: { kind: "car" } },
  { name: "curb_car_west_n", x: 12, y: 12, w: 4.5, h: 2, props: { kind: "car" } },
  { name: "curb_car_west_s", x: 13.5, y: 18, w: 4.5, h: 2, props: { kind: "car" } },
  { name: "curb_car_north", x: 20, y: 0, w: 2, h: 4.5, props: { kind: "car" } },
  { name: "curb_car_south", x: 26, y: 24, w: 2, h: 4.5, props: { kind: "car" } },
  { name: "police_barrier_north", x: 21, y: 6, w: 6, h: 0.5, props: { kind: "barrier", minStage: 2 } },
  { name: "sandbags_south", x: 22.5, y: 22.5, w: 3, h: 1, props: { kind: "sandbags", minStage: 3 } },
];

/** Story 6.2 breach spawn points (see `spawns`; the art draws the hole there). */
const BREACH_APARTMENTS = { x: 14, y: 10.6 };
const BREACH_OFFICES = { x: 29.4, y: 29.5 };

/**
 * Story 4.3 spawn points (FR32; GDD: alleys, manholes, broken shop windows; decay opens more).
 * Stage 1 (evening): the street and alley ends on the map edge — the horde comes from outside.
 * Stage 2 (panic): manholes in the west and north streets, the corner shop's, diner's and offices'
 * windows. Stage 3 (breakdown): manholes in the south and east streets, the apartments', warehouse's
 * and gas kiosk's windows. A window sits 0.6 m off its building's face and jitters along it
 * (`jitterAxis`); a manhole jitters along its street. Each jitter area (± spawnJitterM, grown by the
 * largest zombie radius) is clear of collision and cover (test), and each new point is ≥ 9 m from
 * the team start.
 *
 *   x: 0     4   8 9.5 11   18.6 24        37.5   44.5  48
 *   y0 +-----S1--a1--+---- -  -S1N- ----------S1g---------+
 *    4 |          |     | W3  M2N                         |
 *    6 |          |     |                       W3 kiosk  |
 *   10 +--W2 shop-+-----+                                 |
 *   13 S1W     M2W(12,18)                         M3E     S1E
 *   21    W2 diner                    W2 offices  W3 wareh.
 *   27 |                    M3S(22,27)                    |
 *   32 +---S1a2--S1lot-----S1S-------------S1a3-----------+
 */
const spawns: Point[] = [
  { name: "street_west", x: 0.5, y: 16, props: { kind: "street", minStage: 1 } },
  { name: "street_east", x: 47.5, y: 16, props: { kind: "street", minStage: 1 } },
  { name: "street_north", x: 24, y: 0.5, props: { kind: "street", minStage: 1 } },
  { name: "street_south", x: 24, y: 31.5, props: { kind: "street", minStage: 1 } },
  { name: "alley_1_mouth", x: 9.5, y: 0.5, props: { kind: "alley", minStage: 1 } },
  { name: "alley_2_mouth", x: 8.5, y: 31.5, props: { kind: "alley", minStage: 1 } },
  { name: "alley_3_mouth", x: 39.5, y: 31.5, props: { kind: "alley", minStage: 1 } },
  { name: "gas_station_north", x: 37.5, y: 0.5, props: { kind: "street", minStage: 1 } },
  { name: "parking_lot_south", x: 15, y: 31.5, props: { kind: "street", minStage: 1 } },
  { name: "manhole_west", x: 12, y: 18, props: { kind: "manhole", minStage: 2, jitterAxis: "x" } },
  { name: "manhole_north", x: 24, y: 4, props: { kind: "manhole", minStage: 2, jitterAxis: "x" } },
  { name: "window_corner_shop", x: 4, y: 10.6, props: { kind: "window", minStage: 2, jitterAxis: "x" } },
  { name: "window_diner", x: 3.5, y: 21.4, props: { kind: "window", minStage: 2, jitterAxis: "x" } },
  { name: "window_offices", x: 34, y: 21.4, props: { kind: "window", minStage: 2, jitterAxis: "x" } },
  { name: "manhole_south", x: 22, y: 27, props: { kind: "manhole", minStage: 3, jitterAxis: "y" } },
  { name: "manhole_east", x: 44, y: 13.5, props: { kind: "manhole", minStage: 3, jitterAxis: "x" } },
  { name: "window_apartments", x: 18.6, y: 5, props: { kind: "window", minStage: 3, jitterAxis: "y" } },
  { name: "window_warehouse", x: 44.5, y: 21.4, props: { kind: "window", minStage: 3, jitterAxis: "x" } },
  { name: "window_gas_kiosk", x: 44.5, y: 6.6, props: { kind: "window", minStage: 3, jitterAxis: "x" } },
  // Story 6.2 (Ruins, stage 4, D3): two holes blown in building walls, one each side of the crossing.
  // A breach spawns like a window (0.6 m off the face, jittered along it). Both ≥ 9 m from the team start.
  { name: "breach_apartments", x: BREACH_APARTMENTS.x, y: BREACH_APARTMENTS.y, props: { kind: "breach", minStage: 4, jitterAxis: "x" } },
  { name: "breach_offices", x: BREACH_OFFICES.x, y: BREACH_OFFICES.y, props: { kind: "breach", minStage: 4, jitterAxis: "y" } },
];

const hazards: Rect[] = [
  { name: "gas_leak_zone", x: 31, y: 2, w: 6, h: 7.5, props: { kind: "gas_leak", minStage: 2 } },
  // Story 4.8: the 4.1 `fire` hazard rects are gone: the stage-3 `ignite` objects (`decay` layer) are the fires.
];

/**
 * Story 4.5 decay mutations (`decay` layer). Applied at the build start that enters `stage`.
 *
 * Story 4.7 (Panic, stage 2, FR60): 4 of 6 curb cars, picked per run from the `decay` stream (group
 * `panic_cars_moved`, pick 4), end up slewed into the road: each candidate removes the car at the
 * curb and adds it in the road. Police barriers (`barrier`: bodies only, shots pass) close the
 * parking lot's north side (a 1.5 m gap stays at its NW corner, the lot stays open to the south
 * street) and the gas forecourt's west side (it stays open along the east street), plus 4.2's
 * `police_barrier_north`. From 4.5: `parked_car_3` is driven off, a dumpster narrows alley 3.
 * Rules (tests): no area is ever enclosed (every stage × every variant combination), every spawn's
 * jitter area stays clear, and nothing that appears lands within `buildings.spawnClearM` of a spawn
 * point or on the team start.
 *
 *   x: 0    4    8   12   16   20   24   28   32   36   40   44   48
 *   y0  ####### a1 #######  N^  |     #   gas forecourt   kiosk
 *    5                     n→     #barrier(gas)
 *    6                    ==police_north==
 *    8                    [n moved]
 *   12      [wc]   [wn]                             (bus)       [ec]
 *   16  W   |w1|   [wn moved]          T          ##BUS##
 *   20          [ws moved][ws]                      [ec moved]
 *   22  ######  ==========lot line=======   [s moved]  ######
 *
 * Stage 3 (breakdown, Story 4.8): two of three cars catch fire (ignite: a 2 m fire zone that burns
 * 2 waves).
 *
 * Stage 4 (Ruins, Story 6.2): one alley of three collapses wall to wall (group `ruins_alley`), three
 * street piles (P1 west street, P2 north street, P3 gas forecourt (east side); hard cover like a car, lobs fly over), the run's Ruins
 * material (`ruins_look`, look-only), and two breach spawns (B: apartments' south wall, offices' west wall).
 * Stage 5 (Collapse, Story 6.4): no new solids (D6); the weather style (`collapse_style`, look-only).
 *
 *   x: 0    4    8 a1 11  14   20  26.5 28   33   38 a3 41   48
 *   y0  ######|###|#####      |  P2 |#        gas    P3     |
 *   10  ######|###|#####B                                    |
 *   12        P1 [wn]                                        |
 *   16  W                      T        ##BUS##              E
 *   22  ######|a2#|                      ######|###|######
 *   29.5      |###|                     B######|###|######
 *   32  ######|###|                      ######|###|######
 */
/** Story 6.2: the three street piles (≈ 2 × 1.5 m, lattice; ≥ spawnClearM from every spawn, off shop fronts). */
const RUBBLE_PILES: Rect[] = [
  { name: "rubble_pile_1", x: 10, y: 12, w: 2, h: 1.5 }, // west street, against the north curb car
  { name: "rubble_pile_2", x: 26.5, y: 2, w: 1.5, h: 2 }, // north street, against the gas forecourt's police line
  // East side: in the gas forecourt (NE). A pile in the east street proper closes the Behemoth's only
  // ≥ 4 m way past the bus (north of it): the 10-wave sim stalled with the boss unable to reach the team.
  { name: "rubble_pile_3", x: 37, y: 3, w: 2, h: 1.5 },
];

/** Story 6.2: Ruins visual props (stage 4, repeated at stage 5): loose debris and flat spills, no gameplay. */
const RUINS_PROPS: Rect[] = [
  { name: "ruins_debris_west", x: 8.2, y: 14.6, w: 1.2, h: 0.7, props: { kind: "debris" } },
  { name: "ruins_debris_north", x: 25, y: 4.6, w: 1, h: 0.6, props: { kind: "debris" } },
  { name: "ruins_debris_forecourt", x: 35.6, y: 5.6, w: 1.2, h: 0.7, props: { kind: "debris" } },
  { name: "ruins_debris_south", x: 21.2, y: 28.6, w: 1, h: 0.7, props: { kind: "debris" } },
  { name: "ruins_spill_diner", x: 5.4, y: 21, w: 1.6, h: 0.7, props: { kind: "spill" } },
  { name: "ruins_spill_breach_apartments", x: 13.2, y: 10.8, w: 1.6, h: 0.8, props: { kind: "spill" } },
  { name: "ruins_spill_breach_offices", x: 28.4, y: 28.8, w: 0.8, h: 1.6, props: { kind: "spill" } },
];

const panicCar = (curb: string, x: number, y: number, w: number, h: number): (Rect | Point)[] => {
  const variant = `panic_move_${curb}`;
  const v = { group: "panic_cars_moved", variant, pick: 4 };
  return [
    { name: `${curb}_leaves_curb`, x: x + w / 2, y: y + h / 2, props: { stage: 2, action: "remove", target: curb, ...v } },
    { name: `${curb}_in_road`, x, y, w, h, props: { stage: 2, action: "add", kind: "car", ...v } },
  ];
};

const decay: (Rect | Point)[] = [
  { name: "parked_car_3_driven_off", x: 18.5, y: 28, props: { stage: 2, action: "remove", target: "parked_car_3" } },
  { name: "dumpster_alley_3", x: 38, y: 26, w: 1.5, h: 1.5, props: { stage: 2, action: "block" } },
  { name: "police_line_lot", x: 10.5, y: 22, w: 9.5, h: 0.5, props: { stage: 2, action: "add", kind: "barrier" } },
  { name: "police_line_gas", x: 28, y: 0, w: 0.5, h: 10, props: { stage: 2, action: "add", kind: "barrier" } },
  ...panicCar("curb_car_west_far", 2.5, 16, 4.5, 2),
  ...panicCar("curb_car_west_n", 14, 14.5, 4.5, 2),
  ...panicCar("curb_car_west_s", 15.5, 16.5, 2, 4.5),
  ...panicCar("curb_car_north", 20.5, 8, 4.5, 2),
  ...panicCar("curb_car_south", 24.5, 25.5, 4.5, 2),
  ...panicCar("street_car_east", 36.5, 18, 4.5, 2),
  // ---- Story 4.8 (Breakdown, stage 3, FR61): 2 of 3 cars catch fire (group `breakdown_car_fire`,
  // pick 2, from the `decay` stream). A fire zone round the car's centre, radius `decay.json ›
  // fire.radiusM`; none of these cars is moved or removed by stages 2 (4.5 / 4.7), so two always burn.
  {
    name: "fire_parked_car_2_ignites",
    x: 15.5,
    y: 28,
    props: { stage: 3, action: "ignite", target: "parked_car_2", group: "breakdown_car_fire", variant: "fire_parked_car_2", pick: 2 },
  },
  {
    name: "fire_street_car_west_ignites",
    x: 6,
    y: 14,
    props: { stage: 3, action: "ignite", target: "street_car_west", group: "breakdown_car_fire", variant: "fire_street_car_west", pick: 2 },
  },
  {
    name: "fire_parked_car_1_ignites",
    x: 12.5,
    y: 28,
    props: { stage: 3, action: "ignite", target: "parked_car_1", group: "breakdown_car_fire", variant: "fire_parked_car_1", pick: 2 },
  },
  // ---- end Story 4.8
  // ---- Story 6.2 (Ruins, stage 4, FR62). APPENDED after every older object (points included: the
  // writer keeps this order), so `pickDecayVariants` draws the older groups first and every recorded
  // seed keeps its cars and fires (test).
  // One alley collapses per run (group `ruins_alley`, pick 1, D1/D2): rubble wall to wall, so nobody
  // can be inside it; the mouth spawn it buries closes (`waves/spawnPick.ts`, "buried" rule).
  { name: "rubble_alley_1", x: 8, y: 0, w: 3, h: 10, props: { stage: 4, action: "block", group: "ruins_alley", variant: "ruins_alley_1", pick: 1 } },
  { name: "rubble_alley_2", x: 7, y: 22, w: 3, h: 10, props: { stage: 4, action: "block", group: "ruins_alley", variant: "ruins_alley_2", pick: 1 } },
  // The 0.5 m pocket between the heap, the parking wall and the lot's police line (a slot no body fits).
  { name: "rubble_alley_2_corner", x: 10, y: 22, w: 0.5, h: 2, props: { stage: 4, action: "block", group: "ruins_alley", variant: "ruins_alley_2", pick: 1 } },
  { name: "rubble_alley_3", x: 38, y: 22, w: 3, h: 10, props: { stage: 4, action: "block", group: "ruins_alley", variant: "ruins_alley_3", pick: 1 } },
  // Alley 3's heap replaces the 4.5 dumpster (two walls never overlap).
  { name: "rubble_alley_3_buries_dumpster", x: 38.75, y: 26.75, props: { stage: 4, action: "remove", target: "dumpster_alley_3", group: "ruins_alley", variant: "ruins_alley_3", pick: 1 } },
  // Three street piles, the same spots every run (D4): hard cover like a car (a `block` = a wall:
  // bodies, shots, melee, blasts; not `building`, so lobbed rounds fly over). West, south, east street.
  ...RUBBLE_PILES.map((r) => ({ ...r, props: { stage: 4, action: "block" } })),
  // The run's Ruins material (group `ruins_look`, pick 1; RU4 fire-gutted is endless only, D6). Looks
  // carry only a variant: no box, no gameplay.
  { name: "ruins_look_concrete", x: 24, y: 16, props: { stage: 4, action: "look", group: "ruins_look", variant: "ruins_look_concrete", pick: 1 } },
  { name: "ruins_look_brick", x: 24, y: 16, props: { stage: 4, action: "look", group: "ruins_look", variant: "ruins_look_brick", pick: 1 } },
  { name: "ruins_look_slab", x: 24, y: 16, props: { stage: 4, action: "look", group: "ruins_look", variant: "ruins_look_slab", pick: 1 } },
  // ---- end Story 6.2
  // ---- Story 6.4 (Collapse, stage 5, D6/D7): no new solids; one weather style per run (group
  // `collapse_style`, pick 1; endless rotates it: `decay/collapse.ts › collapseStyleAt`).
  { name: "collapse_haze", x: 24, y: 16, props: { stage: 5, action: "look", group: "collapse_style", variant: "collapse_haze", pick: 1 } },
  { name: "collapse_fog_bank", x: 24, y: 16, props: { stage: 5, action: "look", group: "collapse_style", variant: "collapse_fog_bank", pick: 1 } },
  { name: "collapse_ash", x: 24, y: 16, props: { stage: 5, action: "look", group: "collapse_style", variant: "collapse_ash", pick: 1 } },
  { name: "collapse_flood", x: 24, y: 16, props: { stage: 5, action: "look", group: "collapse_style", variant: "collapse_flood", pick: 1 } },
  // ---- end Story 6.4
];

/**
 * Story 6.8 (`events` layer, FR37–FR41): the special events' map data, built once here so 6.9 and
 * 6.10 don't touch the map files.
 *
 * - 4 stampede lanes (rects 8 m wide, `kind: stampede_lane`, `dir` e/w/n/s = the way the Runners run
 *   from the start edge; `minStage`/`maxStage`): both ways along the main street (y 12–20, every
 *   stage) and the cross street (x 20–28, stages 1–3: from stage 4 rubble seals its north end).
 * - spots (points, `minStage`): `crate` ×10 (6.9 supply drop), `survivor` ×8 and `safe` ×6 (6.10),
 *   all on open road, ≥ 1.2 m from every box any stage or variant can put there (6.2's rubble
 *   included), every fire zone and 1.5 m from every spawn point (tests: `events/spots.test.ts`).
 */
const eventLanes: Rect[] = [
  { name: "lane_main_eastbound", x: 0, y: 12, w: 48, h: 8, props: { kind: "stampede_lane", dir: "e", minStage: 1, maxStage: 5 } },
  { name: "lane_main_westbound", x: 0, y: 12, w: 48, h: 8, props: { kind: "stampede_lane", dir: "w", minStage: 1, maxStage: 5 } },
  // Stage 4+ (6.2): rubble_pile_2 closes the cross street's last gap past the north police line: maxStage 3.
  { name: "lane_cross_southbound", x: 20, y: 0, w: 8, h: 32, props: { kind: "stampede_lane", dir: "s", minStage: 1, maxStage: 3 } },
  { name: "lane_cross_northbound", x: 20, y: 0, w: 8, h: 32, props: { kind: "stampede_lane", dir: "n", minStage: 1, maxStage: 3 } },
];
const spot = (kind: string, list: readonly (readonly [number, number])[]): Point[] => list.map(([x, y], i) => ({ name: `${kind}_${i + 1}`, x, y, props: { kind, minStage: 1 } }));
const eventSpots: Point[] = [
  ...spot("crate", [[2.5, 13], [42.5, 16], [10, 20], [33, 12], [20, 24.5], [31.5, 20], [26.5, 8], [18, 12], [38.5, 12], [19.5, 19]]),
  ...spot("survivor", [[26, 21], [11, 15], [28, 13], [23, 11.5], [28, 17.5], [35, 18.5], [20.5, 15], [22.5, 21]]),
  ...spot("safe", [[8.5, 17], [41.5, 12], [26, 11], [22, 18], [25, 13.5], [25, 18.5]]),
  // 6.11: the helicopter pad's centre (the intersection; looks `HELI = [24, 15.9]`), named `evac_pad`.
  { name: "evac_pad", x: 24, y: 15.9, props: { kind: "evac_pad", minStage: 1 } },
];

const groups: Group[] = [
  {
    name: "stage1_evening",
    layers: [
      {
        name: "stage1_ground",
        rects: [
          { name: "sidewalk_nw", x: 0, y: 10, w: 20, h: 2, props: { kind: "sidewalk" } },
          { name: "sidewalk_nw_east", x: 18, y: 0, w: 2, h: 10, props: { kind: "sidewalk" } },
          { name: "sidewalk_sw", x: 0, y: 20, w: 20, h: 2, props: { kind: "sidewalk" } },
          { name: "sidewalk_se", x: 28, y: 20, w: 20, h: 2, props: { kind: "sidewalk" } },
          { name: "sidewalk_se_west", x: 28, y: 22, w: 2, h: 10, props: { kind: "sidewalk" } },
          { name: "gas_forecourt", x: 28, y: 0, w: 20, h: 12, props: { kind: "forecourt" } },
          { name: "parking_lot", x: 10.5, y: 22, w: 9.5, h: 10, props: { kind: "lot" } },
          { name: "crosswalk_north", x: 20, y: 10.5, w: 8, h: 1.5, props: { kind: "crosswalk" } },
          { name: "crosswalk_south", x: 20, y: 20, w: 8, h: 1.5, props: { kind: "crosswalk" } },
          { name: "crosswalk_west", x: 18.5, y: 12, w: 1.5, h: 8, props: { kind: "crosswalk" } },
          { name: "crosswalk_east", x: 28, y: 12, w: 1.5, h: 8, props: { kind: "crosswalk" } },
          { name: "lane_west", x: 1, y: 15.9, w: 17, h: 0.2, props: { kind: "lane" } },
          { name: "lane_east", x: 41, y: 15.9, w: 6.5, h: 0.2, props: { kind: "lane" } },
          { name: "lane_north", x: 23.9, y: 0.5, w: 0.2, h: 9.5, props: { kind: "lane" } },
          { name: "lane_south", x: 23.9, y: 22, w: 0.2, h: 9.5, props: { kind: "lane" } },
          { name: "gas_canopy", x: 31, y: 2, w: 6, h: 7.5, props: { kind: "canopy" } },
        ],
      },
      {
        // Story 4.6 (FR59): lit shop fronts — the sidewalk strip in front of a shop that is still open
        // in the evening: a good spot to build (tests: a barricade fits, no decay ever lands on it).
        // The face that glows is the side touching the shop (`map/shopfronts.ts`); Story 4.9 draws it.
        name: "stage1_shopfronts",
        rects: [
          { name: "shopfront_corner_shop", x: 0.5, y: 10, w: 7, h: 2, props: { kind: "shopfront" } },
          { name: "shopfront_apartments", x: 11.5, y: 10, w: 6, h: 2, props: { kind: "shopfront" } },
          { name: "shopfront_diner", x: 0.5, y: 20, w: 6, h: 2, props: { kind: "shopfront" } },
          { name: "shopfront_offices", x: 30.5, y: 20, w: 7, h: 2, props: { kind: "shopfront" } },
          { name: "shopfront_gas_kiosk", x: 41.5, y: 6, w: 6, h: 2, props: { kind: "shopfront" } },
        ],
      },
    ],
  },
  {
    name: "stage2_panic",
    layers: [
      {
        name: "stage2_props",
        rects: [
          { name: "debris_west", x: 5, y: 18, w: 1, h: 0.8, props: { kind: "debris" } },
          { name: "debris_east", x: 44, y: 13, w: 1.2, h: 0.8, props: { kind: "debris" } },
        ],
      },
    ],
  },
  {
    name: "stage3_breakdown",
    layers: [
      {
        name: "stage3_props",
        rects: [
          { name: "debris_mid", x: 15, y: 14, w: 1.5, h: 1, props: { kind: "debris" } },
          { name: "debris_south", x: 26, y: 27, w: 1, h: 1, props: { kind: "debris" } },
        ],
      },
    ],
  },
  // Story 6.2: Ruins loose debris and flat spills (visual only: no collision; the swap model shows
  // only stage N's group, so stage 5 repeats them). Story 6.4: plus the fallen streetlight across the
  // north-west crosswalk and two more flat spills (D6: no new cover at stage 5).
  { name: "stage4_ruins", layers: [{ name: "stage4_props", rects: RUINS_PROPS }] },
  {
    name: "stage5_collapse",
    layers: [
      {
        name: "stage5_props",
        rects: [
          ...RUINS_PROPS.map((r) => ({ ...r, name: r.name.replace("ruins_", "collapse_") })),
          { name: "collapse_fallen_lamp", x: 19.8, y: 11.55, w: 3.2, h: 0.5, props: { kind: "fallen_lamp" } },
          { name: "collapse_spill_apartments", x: 15.6, y: 10.2, w: 2.2, h: 0.8, props: { kind: "spill" } },
          { name: "collapse_spill_south", x: 23.2, y: 23.8, w: 1.6, h: 0.6, props: { kind: "spill" } },
        ],
      },
    ],
  },
];

const topLayers: Layer[] = [
  { name: "collision", rects: collision },
  { name: "cover", rects: cover },
  { name: "spawns", points: spawns },
  { name: "hazards", rects: hazards },
  {
    name: "decay",
    items: decay,
  },
  { name: "events", rects: eventLanes, points: eventSpots }, // Story 6.8
];

// ---- writers ---------------------------------------------------------------------------------

type JsonProp = { name: string; type: "int" | "float" | "string" | "bool"; value: string | number | boolean };
const jsonProps = (p: Props | undefined): JsonProp[] | undefined =>
  p
    ? Object.entries(p).map(([name, value]) => ({
        name,
        type: typeof value === "string" ? "string" : typeof value === "boolean" ? "bool" : Number.isInteger(value) && name !== "metersPerTile" && name !== "cellM" ? "int" : "float",
        value,
      }))
    : undefined;

const px = (m: number): number => Math.round(m * (PX / METERS_PER_TILE) * 1000) / 1000;

export function buildDowntownTmj(): Record<string, unknown> {
  let nextLayerId = 1;
  let nextObjectId = 1;
  const objectLayer = (l: Layer): Record<string, unknown> => ({
    draworder: "topdown",
    id: nextLayerId++,
    name: l.name,
    objects: [
      ...(l.items ?? []).map((o) => ("w" in o ? rectObject(o) : pointObject(o))),
      ...(l.rects ?? []).map((r) => rectObject(r)),
      ...(l.points ?? []).map((p) => pointObject(p)),
    ],
    opacity: 1,
    type: "objectgroup",
    visible: true,
    x: 0,
    y: 0,
  });
  const rectObject = (r: Rect): Record<string, unknown> => ({
        height: px(r.h),
        id: nextObjectId++,
        name: r.name,
        ...(r.props ? { properties: jsonProps(r.props) } : {}),
        rotation: 0,
        type: "",
        visible: true,
        width: px(r.w),
        x: px(r.x),
        y: px(r.y),
      });
  const pointObject = (p: Point): Record<string, unknown> => ({
        height: 0,
        id: nextObjectId++,
        name: p.name,
        point: true,
        ...(p.props ? { properties: jsonProps(p.props) } : {}),
        rotation: 0,
        type: "",
        visible: true,
        width: 0,
        x: px(p.x),
        y: px(p.y),
      });
  const layers: Record<string, unknown>[] = [];
  for (const l of topLayers) layers.push(objectLayer(l));
  for (const g of groups) {
    const id = nextLayerId++;
    layers.push({ id, layers: g.layers.map(objectLayer), name: g.name, opacity: 1, type: "group", visible: true, x: 0, y: 0 });
  }
  return {
    compressionlevel: -1,
    height: HEIGHT_TILES,
    infinite: false,
    layers,
    nextlayerid: nextLayerId,
    nextobjectid: nextObjectId,
    orientation: "orthogonal",
    properties: jsonProps({ name: "Downtown", metersPerTile: METERS_PER_TILE, cellM: CELL_M }),
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: PX,
    tilesets: [],
    tilewidth: PX,
    type: "map",
    version: "1.10",
    width: WIDTH_TILES,
  };
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function xmlProps(list: JsonProp[] | undefined, indent: string): string {
  if (!list || list.length === 0) return "";
  const rows = list.map((p) => `${indent} <property name="${esc(p.name)}"${p.type === "string" ? "" : ` type="${p.type}"`} value="${esc(String(p.value))}"/>`);
  return `${indent}<properties>\n${rows.join("\n")}\n${indent}</properties>\n`;
}

/** The same map as Tiled XML (the designer's source file). */
export function tmxFromTmj(tmj: Record<string, unknown>): string {
  type O = Record<string, unknown>;
  const layer = (l: O, ind: string): string => {
    if (l.type === "group") {
      const inner = (l.layers as O[]).map((c) => layer(c, `${ind} `)).join("");
      return `${ind}<group id="${l.id}" name="${esc(String(l.name))}">\n${inner}${ind}</group>\n`;
    }
    const objs = (l.objects as O[])
      .map((o) => {
        const attrs = `id="${o.id}" name="${esc(String(o.name))}" x="${o.x}" y="${o.y}"${o.point ? "" : ` width="${o.width}" height="${o.height}"`}`;
        const props = xmlProps(o.properties as JsonProp[] | undefined, `${ind}  `);
        if (!o.point && !props) return `${ind} <object ${attrs}/>\n`;
        return `${ind} <object ${attrs}>\n${props}${o.point ? `${ind}  <point/>\n` : ""}${ind} </object>\n`;
      })
      .join("");
    return objs ? `${ind}<objectgroup id="${l.id}" name="${esc(String(l.name))}">\n${objs}${ind}</objectgroup>\n` : `${ind}<objectgroup id="${l.id}" name="${esc(String(l.name))}"/>\n`;
  };
  const m = tmj;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<map version="${m.version}" tiledversion="${m.tiledversion}" orientation="orthogonal" renderorder="right-down" width="${m.width}" height="${m.height}" tilewidth="${m.tilewidth}" tileheight="${m.tileheight}" infinite="0" nextlayerid="${m.nextlayerid}" nextobjectid="${m.nextobjectid}">\n` +
    xmlProps(m.properties as JsonProp[], " ") +
    (m.layers as O[]).map((l) => layer(l, " ")).join("") +
    `</map>\n`
  );
}

function main(): void {
  mkdirSync(dirname(SHARED_COPY_PATH), { recursive: true });
  if (process.argv.includes("--sync")) {
    copyFileSync(TMJ_PATH, SHARED_COPY_PATH);
    console.log(`copied ${TMJ_PATH} → ${SHARED_COPY_PATH}`);
    return;
  }
  const tmj = buildDowntownTmj();
  const text = `${JSON.stringify(tmj, null, 1)}\n`;
  mkdirSync(dirname(TMJ_PATH), { recursive: true });
  writeFileSync(TMJ_PATH, text);
  writeFileSync(SHARED_COPY_PATH, text);
  writeFileSync(TMX_PATH, tmxFromTmj(tmj));
  console.log(`wrote ${TMX_PATH}\nwrote ${TMJ_PATH}\nwrote ${SHARED_COPY_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
