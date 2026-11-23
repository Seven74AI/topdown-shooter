import { FLOW_CELL_M } from "../config/constants";
import { canonicalJson, fnv1a32 } from "../core/hash";
import {
  COVER_KINDS,
  DECAY_ACTIONS,
  MAP_STAGE_COUNT,
  MAX_DECAY_VARIANTS,
  MAX_DECAY_FIRES,
  type DecayAction,
  type DecayMutation,
  type DecayVariant,
  SPAWN_KINDS,
  type CoverKind,
  type CoverObject,
  type DistrictMap,
  type HazardZone,
  type MapBox,
  type MapSpawn,
  type SpawnJitterAxis,
  type SpawnKind,
  type VisualProp,
} from "./districtMap";
import { tiledMapSchema, type TiledLayer, type TiledObject, type TiledObjectGroup, type TiledProperty } from "./tiledSchema";

/**
 * Story 4.1: a Tiled JSON export (`.tmj`) → a frozen `DistrictMap`.
 *
 * Units: 1 tile = `metersPerTile` m (map property); object coordinates are pixels, so
 * m = px / tilewidth × metersPerTile. The map property `cellM` must equal the sim's 0.5 m grid
 * (`FLOW_CELL_M` = `BUILD_GRID_M`): collision and cover boxes must lie on it, so the collision grid
 * and the nav grid cover them exactly (no half cells), like buildings (Story 3.4 review H2).
 *
 * Layers (architecture › Game Assets): object layers `collision`, `cover`, `spawns`, `hazards`
 * and group layers `stage1_evening` … `stage5_collapse` at the top level. Anything else is ignored.
 */

export const MAP_LAYERS = { collision: "collision", cover: "cover", spawns: "spawns", hazards: "hazards", decay: "decay" } as const;
export const MAP_STAGE_GROUPS = ["stage1_evening", "stage2_panic", "stage3_breakdown", "stage4_ruins", "stage5_collapse"] as const;

/** Thrown for a map the sim can't use; `issues` name the layer and object. */
export class MapError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "MapError";
  }
}

/** Float noise allowed when checking that a coordinate lies on the lattice. */
const LATTICE_EPS = 1e-6;

function propsOf(list: readonly TiledProperty[] | undefined): Map<string, TiledProperty["value"]> {
  const m = new Map<string, TiledProperty["value"]>();
  for (const p of list ?? []) m.set(p.name, p.value);
  return m;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

export function loadTiledMap(raw: unknown, name: string): DistrictMap {
  const parsed = tiledMapSchema.safeParse(raw);
  if (!parsed.success) {
    throw new MapError(parsed.error.issues.map((i) => `${name}: ${i.path.map(String).join(".") || "(root)"}: ${i.message}`));
  }
  const tm = parsed.data;
  const issues: string[] = [];
  const fail = (msg: string): void => {
    issues.push(`${name}: ${msg}`);
  };
  if (tm.orientation !== "orthogonal") fail(`orientation must be orthogonal, got ${tm.orientation}`);
  if (tm.infinite) fail("infinite maps are not supported");
  if (tm.tilewidth !== tm.tileheight) fail(`tiles must be square (${tm.tilewidth} × ${tm.tileheight} px)`);
  const mapProps = propsOf(tm.properties);
  const mpt = mapProps.get("metersPerTile");
  const cellM = mapProps.get("cellM");
  if (typeof mpt !== "number" || !(mpt > 0)) fail("map property metersPerTile (float > 0) is missing");
  if (cellM !== FLOW_CELL_M) fail(`map property cellM must be ${FLOW_CELL_M} (the sim's grid), got ${String(cellM)}`);
  if (issues.length > 0) throw new MapError(issues);

  const mPerPx = (mpt as number) / tm.tilewidth;
  const widthM = tm.width * (mpt as number);
  const heightM = tm.height * (mpt as number);
  const onLattice = (m: number): boolean => Math.abs(m / FLOW_CELL_M - Math.round(m / FLOW_CELL_M)) < LATTICE_EPS;
  const snap = (m: number): number => Math.round(m / FLOW_CELL_M) * FLOW_CELL_M;
  if (!onLattice(widthM) || !onLattice(heightM)) fail(`map size ${widthM} × ${heightM} m is not a multiple of ${FLOW_CELL_M} m`);

  // Review L6: the sim reads object coordinates as they are; a shifted, parallax or hidden layer
  // would look different in Tiled than in the game (and hidden layers are easy to forget).
  const checkPlacement = (layers: readonly TiledLayer[], path: string): void => {
    for (const l of layers) {
      const name = `${path}${l.name}`;
      if (l.offsetx !== 0 || l.offsety !== 0) fail(`layer ${name} has an offset (${l.offsetx}, ${l.offsety}); set it to 0 and move the objects instead`);
      if (l.parallaxx !== 1 || l.parallaxy !== 1) fail(`layer ${name} has a parallax factor (${l.parallaxx}, ${l.parallaxy}); it must be 1`);
      if (!l.visible) fail(`layer ${name} is hidden; the game uses every layer, so make it visible in Tiled`);
      if (l.type === "group") checkPlacement(l.layers, `${name}/`);
    }
  };
  checkPlacement(tm.layers, "");

  const top = new Map<string, TiledLayer>();
  for (const l of tm.layers) {
    if (top.has(l.name)) fail(`layer ${l.name} appears twice`);
    top.set(l.name, l);
  }
  const objectLayer = (layer: string): TiledObjectGroup | null => {
    const l = top.get(layer);
    if (!l) {
      fail(`layer ${layer} is missing`);
      return null;
    }
    if (l.type !== "objectgroup") {
      fail(`layer ${layer} must be an object layer, got ${l.type}`);
      return null;
    }
    return l;
  };

  const kindOf = (o: TiledObject): string => {
    const k = propsOf(o.properties).get("kind");
    return typeof k === "string" && k.length > 0 ? k : o.type;
  };
  const stageOf = (layer: string, o: TiledObject): number => {
    const s = propsOf(o.properties).get("minStage") ?? 1;
    if (typeof s !== "number" || !Number.isInteger(s) || s < 1 || s > MAP_STAGE_COUNT) {
      fail(`${layer}: ${o.name || `#${o.id}`}: minStage must be an integer 1–${MAP_STAGE_COUNT}, got ${String(s)}`);
      return 1;
    }
    return s;
  };

  /** A rectangle object in metres; `lattice` requires every edge on the 0.5 m grid. */
  const boxOf = (layer: string, o: TiledObject, lattice: boolean): MapBox | null => {
    const label = `${layer}: ${o.name || `#${o.id}`}`;
    if (o.point || o.ellipse || o.polygon || o.polyline || o.gid !== undefined || o.text !== undefined) {
      fail(`${label}: must be a rectangle`);
      return null;
    }
    if (o.rotation !== 0) {
      fail(`${label}: rotated objects are not supported (rotation ${o.rotation})`);
      return null;
    }
    let minX = o.x * mPerPx;
    let minY = o.y * mPerPx;
    let maxX = (o.x + o.width) * mPerPx;
    let maxY = (o.y + o.height) * mPerPx;
    if (!(maxX > minX && maxY > minY)) {
      fail(`${label}: width and height must be > 0`);
      return null;
    }
    if (lattice) {
      if (![minX, minY, maxX, maxY].every(onLattice)) {
        fail(`${label}: edges must lie on the ${FLOW_CELL_M} m grid (${minX}, ${minY}) – (${maxX}, ${maxY})`);
        return null;
      }
      minX = snap(minX);
      minY = snap(minY);
      maxX = snap(maxX);
      maxY = snap(maxY);
    }
    if (minX < 0 || minY < 0 || maxX > widthM + LATTICE_EPS || maxY > heightM + LATTICE_EPS) {
      fail(`${label}: outside the ${widthM} × ${heightM} m map`);
      return null;
    }
    return { name: o.name, minX, minY, maxX, maxY };
  };

  const uniqueNames = (layer: string, objs: readonly TiledObject[]): void => {
    const seen = new Set<string>();
    for (const o of objs) {
      if (o.name === "") fail(`${layer}: object #${o.id} needs a name`);
      else if (seen.has(o.name)) fail(`${layer}: name ${o.name} is used twice`);
      seen.add(o.name);
    }
  };

  const solids: MapBox[] = [];
  const collision = objectLayer(MAP_LAYERS.collision);
  if (collision) {
    uniqueNames(collision.name, collision.objects);
    for (const o of collision.objects) {
      const b = boxOf(collision.name, o, true);
      if (!b) continue;
      const building = propsOf(o.properties).get("building") ?? false;
      if (typeof building !== "boolean") fail(`${collision.name}: ${o.name || `#${o.id}`}: building must be a bool, got ${String(building)}`);
      solids.push(building === true ? { ...b, building: true } : b);
    }
  }

  const cover: CoverObject[] = [];
  const coverLayer = objectLayer(MAP_LAYERS.cover);
  if (coverLayer) {
    uniqueNames(coverLayer.name, coverLayer.objects);
    for (const o of coverLayer.objects) {
      const b = boxOf(coverLayer.name, o, true);
      const kind = kindOf(o);
      if (!(COVER_KINDS as readonly string[]).includes(kind)) {
        fail(`${coverLayer.name}: ${o.name || `#${o.id}`}: kind must be one of ${COVER_KINDS.join(", ")}, got ${kind || "(none)"}`);
        continue;
      }
      if (b) cover.push({ ...b, kind: kind as CoverKind, minStage: stageOf(coverLayer.name, o) });
    }
  }

  const hazards: HazardZone[] = [];
  const hazardLayer = objectLayer(MAP_LAYERS.hazards);
  if (hazardLayer) {
    uniqueNames(hazardLayer.name, hazardLayer.objects);
    for (const o of hazardLayer.objects) {
      const b = boxOf(hazardLayer.name, o, false);
      const kind = kindOf(o);
      if (kind === "") fail(`${hazardLayer.name}: ${o.name || `#${o.id}`}: needs a kind`);
      else if (b) hazards.push({ ...b, kind, minStage: stageOf(hazardLayer.name, o) });
    }
  }

  const spawnPoints: MapSpawn[] = [];
  const spawnLayer = objectLayer(MAP_LAYERS.spawns);
  if (spawnLayer) {
    uniqueNames(spawnLayer.name, spawnLayer.objects);
    for (const o of spawnLayer.objects) {
      const label = `${spawnLayer.name}: ${o.name || `#${o.id}`}`;
      if (!o.point) {
        fail(`${label}: must be a point`);
        continue;
      }
      const x = o.x * mPerPx;
      const y = o.y * mPerPx;
      if (!(x > 0 && y > 0 && x < widthM && y < heightM)) {
        fail(`${label}: outside the map`);
        continue;
      }
      const inside = solids.find((s) => x >= s.minX && x <= s.maxX && y >= s.minY && y <= s.maxY);
      if (inside) {
        fail(`${label}: inside collision box ${inside.name}`);
        continue;
      }
      // Story 4.3: what the spawn is (required) and the axis its zombies are jittered along.
      const kind = kindOf(o);
      if (!(SPAWN_KINDS as readonly string[]).includes(kind)) {
        fail(`${label}: kind must be one of ${SPAWN_KINDS.join(", ")}, got ${kind || "(none)"}`);
        continue;
      }
      const axisProp = propsOf(o.properties).get("jitterAxis");
      if (axisProp !== undefined && axisProp !== "x" && axisProp !== "y") {
        fail(`${label}: jitterAxis must be x or y, got ${String(axisProp)}`);
        continue;
      }
      const jitterAxis: SpawnJitterAxis = axisProp ?? (y < 1 || y > heightM - 1 ? "x" : "y");
      spawnPoints.push({ name: o.name, x, y, minStage: stageOf(spawnLayer.name, o), kind: kind as SpawnKind, jitterAxis });
    }
    if (spawnPoints.length === 0) fail(`${spawnLayer.name}: needs at least one spawn point`);
    // Story 4.3: zombies come only from spawns open at the current stage; the run starts at stage 1.
    else if (!spawnPoints.some((s) => s.minStage === 1)) fail(`${spawnLayer.name}: needs at least one spawn point with minStage 1`);
  }

  const stages: VisualProp[][] = [];
  for (const groupName of MAP_STAGE_GROUPS) {
    const g = top.get(groupName);
    const props: VisualProp[] = [];
    stages.push(props);
    if (!g) {
      fail(`layer group ${groupName} is missing`);
      continue;
    }
    if (g.type !== "group") {
      fail(`${groupName} must be a group layer, got ${g.type}`);
      continue;
    }
    const walk = (layers: readonly TiledLayer[]): void => {
      for (const l of layers) {
        if (l.type === "group") walk(l.layers);
        else if (l.type === "objectgroup") {
          for (const o of l.objects) {
            const b = boxOf(`${groupName}/${l.name}`, o, false);
            if (b) props.push({ ...b, kind: kindOf(o), layer: l.name });
          }
        }
      }
    };
    walk(g.layers);
  }

  const { decay, decayVariants } = loadDecayLayer(top.get(MAP_LAYERS.decay), solids, cover, boxOf, fail);

  if (issues.length > 0) throw new MapError(issues);
  const body = { name, widthM, heightM, spawnPoints, solids, cover, hazards, stages, decay, decayVariants };
  const version = fnv1a32(canonicalJson(body)).toString(16).padStart(8, "0");
  return deepFreeze({ ...body, version });
}

/**
 * Story 4.5: the optional `decay` object layer (a map without it never changes). Each object has
 * `stage` (2–5: stage 1 is the base layers) and `action`; `add` / `block` are lattice rectangles
 * (`add` also has a cover `kind`); `remove` / `ignite` name a `target` (a collision box, a cover
 * object or an earlier add/block; `ignite` also `radiusM` > 0) and take its box. Optional variation:
 * `variant` (candidate name), `group` and `pick` (the same on every object of the group, 1 ≤ pick <
 * candidates of the group; one stage per group).
 */
function loadDecayLayer(
  layer: TiledLayer | undefined,
  solids: readonly MapBox[],
  cover: readonly CoverObject[],
  boxOf: (layer: string, o: TiledObject, lattice: boolean) => MapBox | null,
  fail: (msg: string) => void,
): { decay: DecayMutation[]; decayVariants: DecayVariant[] } {
  const decay: DecayMutation[] = [];
  const decayVariants: DecayVariant[] = [];
  if (!layer) return { decay, decayVariants };
  if (layer.type !== "objectgroup") {
    fail(`layer ${MAP_LAYERS.decay} must be an object layer, got ${layer.type}`);
    return { decay, decayVariants };
  }
  const L = layer.name;
  // Names a mutation may target: collision and cover first, then earlier adds/blocks.
  const known = new Map<string, MapBox>();
  for (const b of solids) known.set(b.name, b);
  for (const c of cover) {
    if (known.has(c.name)) fail(`${L}: collision and cover both have an object named ${c.name}; targets must be unique`);
    known.set(c.name, c);
  }
  const seen = new Set<string>();
  let ignites = 0; // Story 4.8
  const groups = new Map<string, { pick: number; stage: number; variants: Set<string> }>();
  const variantIndex = new Map<string, number>();
  for (const o of layer.objects) {
    const label = `${L}: ${o.name || `#${o.id}`}`;
    if (o.name === "") {
      fail(`${L}: object #${o.id} needs a name`);
      continue;
    }
    if (seen.has(o.name)) fail(`${L}: name ${o.name} is used twice`);
    seen.add(o.name);
    const props = propsOf(o.properties);
    const stage = props.get("stage");
    if (typeof stage !== "number" || !Number.isInteger(stage) || stage < 2 || stage > MAP_STAGE_COUNT) {
      fail(`${label}: stage must be an integer 2–${MAP_STAGE_COUNT} (stage 1 is the base layers), got ${String(stage)}`);
      continue;
    }
    const action = props.get("action");
    if (typeof action !== "string" || !(DECAY_ACTIONS as readonly string[]).includes(action)) {
      fail(`${label}: action must be one of ${DECAY_ACTIONS.join(", ")}, got ${String(action ?? "(none)")}`);
      continue;
    }
    let box: MapBox | null;
    let kind: CoverKind | "" = "";
    let target = "";
    let radiusM = 0;
    if (action === "add" || action === "block") {
      box = boxOf(L, o, true);
      if (!box) continue;
      if (known.has(o.name)) fail(`${label}: the name is already used by a collision or cover object`);
      if (action === "add") {
        const k = props.get("kind");
        if (typeof k !== "string" || !(COVER_KINDS as readonly string[]).includes(k)) {
          fail(`${label}: an add needs a cover kind (${COVER_KINDS.join(", ")}), got ${String(k ?? "(none)")}`);
          continue;
        }
        kind = k as CoverKind;
      }
    } else {
      const t = props.get("target");
      const tb = typeof t === "string" ? known.get(t) : undefined;
      if (typeof t !== "string" || !tb) {
        fail(`${label}: target must name a collision box, a cover object or an earlier add/block, got ${String(t ?? "(none)")}`);
        continue;
      }
      target = t;
      box = { name: o.name, minX: tb.minX, minY: tb.minY, maxX: tb.maxX, maxY: tb.maxY };
      if (action === "ignite") {
        // Story 4.8: the radius is `decay.json › fire.radiusM`; a map may override it per object.
        const r = props.get("radiusM");
        if (r !== undefined && (typeof r !== "number" || !(r > 0))) {
          fail(`${label}: an ignite's radiusM, if given, must be > 0, got ${String(r)}`);
          continue;
        }
        if (++ignites > MAX_DECAY_FIRES) {
          fail(`${label}: more than ${MAX_DECAY_FIRES} ignites (the burned-out set travels as a uint32 bitmask)`);
          continue;
        }
        radiusM = typeof r === "number" ? r : 0;
      }
    }
    let variant = -1;
    const vName = props.get("variant");
    const gName = props.get("group");
    const pick = props.get("pick");
    if (vName !== undefined || gName !== undefined || pick !== undefined) {
      if (typeof vName !== "string" || vName === "" || typeof gName !== "string" || gName === "" || typeof pick !== "number" || !Number.isInteger(pick) || pick < 1) {
        fail(`${label}: a variation needs variant (name), group (name) and pick (integer ≥ 1)`);
        continue;
      }
      let g = groups.get(gName);
      if (!g) {
        g = { pick, stage, variants: new Set() };
        groups.set(gName, g);
      } else if (g.pick !== pick || g.stage !== stage) {
        fail(`${label}: group ${gName} needs the same pick and stage on every object (pick ${g.pick}, stage ${g.stage})`);
        continue;
      }
      const existing = variantIndex.get(vName);
      if (existing === undefined) {
        variantIndex.set(vName, decayVariants.length);
        decayVariants.push({ name: vName, group: gName, pick, stage });
        g.variants.add(vName);
      } else if ((decayVariants[existing] as DecayVariant).group !== gName) {
        fail(`${label}: variant ${vName} belongs to group ${(decayVariants[existing] as DecayVariant).group}`);
        continue;
      }
      variant = variantIndex.get(vName) as number;
    }
    if (action === "add" || action === "block") known.set(o.name, box);
    decay.push({ ...box, name: o.name, stage, action: action as DecayAction, kind, target, radiusM, variant });
  }
  for (const [gName, g] of groups) {
    if (g.pick >= g.variants.size) fail(`${L}: group ${gName} picks ${g.pick} of ${g.variants.size} variants; it needs more candidates than picks`);
  }
  if (decayVariants.length > MAX_DECAY_VARIANTS) fail(`${L}: ${decayVariants.length} variants, at most ${MAX_DECAY_VARIANTS}`);
  return { decay, decayVariants };
}
