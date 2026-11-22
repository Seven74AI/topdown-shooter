/**
 * Story 4.9: per-district look data (positions in map px, 32 px = 1 m, like the Tiled file), taken
 * from `downtown-look-study.html` (look B). Gameplay never reads this: it only dresses the map
 * (heights for shadow length, lamp and window light, car colours, signs, street furniture).
 */

/** px per metre of the Tiled map (and of every position in this file). */
export const MAP_PX_PER_M = 32;

export type Front = "up" | "down" | "left" | "right";

export interface CarStyle {
  /** Which end is the front (headlights, windshield). */
  readonly front: Front;
  /** Car colour variant (index into `CAR_COLORS`). */
  readonly variant: number;
}

export interface Dressing {
  /** Object height (m) by collision/cover name: only sets the shadow length. */
  readonly heightByName: Readonly<Record<string, number>>;
  /** Roof signs (painted letters) by building name. */
  readonly signs: Readonly<Record<string, string>>;
  /** Roof furniture by building name: a water tank, skylights + a plant room, or corrugated metal. */
  readonly roofFeature: Readonly<Record<string, "tank" | "skylights" | "metal">>;
  /** Collision boxes drawn as gas pumps / low walls; every other static collision box is a building (a roof). */
  readonly pumps: readonly string[];
  readonly walls: readonly string[];
  readonly cars: Readonly<Record<string, CarStyle>>;
  /** Darker alley strips. */
  readonly alleys: readonly (readonly [number, number, number, number])[];
  /** Streetlights: x, y (the lamp head). */
  readonly lamps: readonly (readonly [number, number])[];
  /** Index into `lamps` of the broken, flickering one (-1: none). */
  readonly flickerLamp: number;
  /**
   * Window light on the street that is NOT a lit shop front (side facades): x1, y1, x2, y2 (a facade
   * segment), outward normal nx, ny, colour "r,g,b", strength 0–1. Shop fronts come from the map
   * (`shopfrontsOf`, Story 4.6) through `windowSpill`; only their colour/strength is dressing (`shopLight`).
   */
  readonly spill: readonly (readonly [number, number, number, number, number, number, string, number])[];
  /** Story 4.6: colour "r,g,b" and strength 0–1 of each lit shop front by its map name (default: warm, 0.5). */
  readonly shopLight: Readonly<Record<string, readonly [string, number]>>;
  /** Neon signs (glow only): x, y, rx, ry, colour, strength. */
  readonly neon: readonly (readonly [number, number, number, number, string, number])[];
  readonly manholes: readonly (readonly [number, number])[];
  /** Storm drains: x, y, vertical (1) or horizontal (0). */
  readonly drains: readonly (readonly [number, number, number])[];
  /** Name of the car whose headlights are on (a light cone), or "". */
  readonly runningCar: string;
  /** Name of the gas canopy ground prop (light under it), or "". */
  readonly canopy: string;
  /** Crash marks of the bus: skid lines' y and the glass field (x, y, w, h). */
  readonly busSkidY: readonly number[];
  readonly busGlass: readonly [number, number, number, number] | null;
}

/** Height (m) by object kind when a name has none. */
export const HEIGHT_BY_KIND: Readonly<Record<string, number>> = {
  building: 8,
  car: 1.5,
  bus: 3.2,
  barrier: 0.9,
  sandbags: 0.6,
  pump: 1.8,
  wall: 1.1,
  block: 1.4,
  solid: 2,
};

/** Car body colours (variant a–e); b and d are wrecks (cracked windshield). */
export const CAR_COLORS = ["#5d2a25", "#2f4656", "#6b6550", "#55595c", "#7f817b"] as const;
export const CAR_WRECK = [false, true, false, true, false] as const;

export const DOWNTOWN_DRESSING: Dressing = {
  heightByName: {
    nw_corner_shop: 7,
    nw_apartments: 14,
    gas_kiosk: 4,
    sw_diner: 5,
    se_offices: 18,
    se_warehouse: 9,
    gas_pump_a: 1.8,
    gas_pump_b: 1.8,
    city_bus: 3.2,
    bus_hull: 3.2,
    parking_wall: 1.1,
  },
  signs: { gas_kiosk: "FUEL 24H", sw_diner: "DINER", nw_corner_shop: "MART" },
  roofFeature: { nw_apartments: "tank", se_offices: "skylights", se_warehouse: "metal" },
  pumps: ["gas_pump_a", "gas_pump_b"],
  walls: ["parking_wall"],
  cars: {
    parked_car_1: { front: "up", variant: 0 },
    parked_car_2: { front: "up", variant: 1 },
    parked_car_3: { front: "up", variant: 2 },
    street_car_west: { front: "right", variant: 3 },
    street_car_east: { front: "left", variant: 4 },
  },
  alleys: [
    [256, 0, 96, 320],
    [224, 704, 96, 320],
    [1216, 704, 96, 320],
  ],
  lamps: [
    [120, 378],
    [470, 378],
    [634, 150],
    [634, 378],
    [120, 646],
    [480, 646],
    [902, 646],
    [1060, 646],
    [1420, 646],
    [902, 880],
    [902, 378],
  ],
  flickerLamp: 4,
  spill: [
    [576, 40, 576, 300, 1, 0, "255,190,120", 0.3],
    [960, 724, 960, 1000, -1, 0, "200,220,255", 0.25],
    [1312, 20, 1312, 180, -1, 0, "210,235,255", 0.5],
  ],
  shopLight: {
    shopfront_corner_shop: ["255,196,120", 0.75],
    shopfront_apartments: ["255,190,120", 0.35],
    shopfront_diner: ["255,150,110", 0.75],
    shopfront_offices: ["200,220,255", 0.35],
    shopfront_gas_kiosk: ["210,235,255", 0.7],
  },
  neon: [
    [110, 712, 60, 20, "255,60,80", 0.35],
    [1420, 200, 70, 18, "90,220,255", 0.3],
  ],
  manholes: [
    [700, 450],
    [840, 590],
    [1360, 470],
    [420, 470],
    [770, 860],
    [770, 170],
  ],
  drains: [
    [200, 384, 0],
    [500, 384, 0],
    [200, 636, 0],
    [520, 636, 0],
    [1100, 636, 0],
    [1450, 636, 0],
    [636, 200, 1],
    [900, 840, 1],
  ],
  runningCar: "street_car_west",
  canopy: "gas_canopy",
  busSkidY: [478, 530],
  busGlass: [900, 470, 58, 70],
};

/** A district with no dressing of its own (the open placeholder street): shadows and roofs only. */
export const EMPTY_DRESSING: Dressing = {
  heightByName: {},
  signs: {},
  roofFeature: {},
  pumps: [],
  walls: [],
  cars: {},
  alleys: [],
  lamps: [],
  flickerLamp: -1,
  spill: [],
  shopLight: {},
  neon: [],
  manholes: [],
  drains: [],
  runningCar: "",
  canopy: "",
  busSkidY: [],
  busGlass: null,
};

export function dressingFor(mapName: string): Dressing {
  return mapName === "downtown" ? DOWNTOWN_DRESSING : EMPTY_DRESSING;
}

/** Small string hash (FNV-1a) → uint32: stable car colours for cars a mutation adds. */
export function nameHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The style of a car: its dressing entry, else a colour by name hash and the front by orientation. */
export function carStyle(d: Dressing, name: string, wM: number, hM: number): CarStyle {
  const s = d.cars[name];
  if (s) return s;
  const h = nameHash(name);
  return { front: wM >= hM ? (h & 1 ? "right" : "left") : h & 1 ? "up" : "down", variant: h % CAR_COLORS.length };
}
