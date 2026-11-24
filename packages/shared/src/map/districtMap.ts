/**
 * Map coordinates: meters, origin (0, 0) at the top-left corner, +x right, +y down (same as the screen).
 * The horde stream (Story 2.5) quantizes positions from this origin.
 */
export interface DistrictBounds {
  readonly widthM: number;
  readonly heightM: number;
}

export interface SpawnPoint {
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned box in metres (map collision, cover, hazards, visual props). */
export interface MapBox {
  /** The Tiled object's name (unique per layer for collision, cover, hazards and spawns). */
  readonly name: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /**
   * A real building (collision layer only, Tiled bool property `building`): lobbed rounds don't fly
   * over it (designer 2026-11-23). Every other wall — the bus, gas pumps, low walls, a dumpster — is
   * low enough to lob over, like cars, barricades and turrets.
   */
  readonly building?: boolean;
}

/** Story 4.1: kinds of the `cover` layer (Story 4.2 gives them their bullet and movement rules). */
export const COVER_KINDS = ["car", "bus", "barrier", "sandbags"] as const;
export type CoverKind = (typeof COVER_KINDS)[number];

/**
 * Story 4.2 (FR56): every active cover kind blocks bodies; only these also stop projectiles (cars
 * and the bus). Barriers and sandbags let shots pass, like player barricades.
 */
export const COVER_STOPS_SHOTS: Readonly<Record<CoverKind, boolean>> = Object.freeze({
  car: true,
  bus: true,
  barrier: false,
  sandbags: false,
});

/** Decay stages a map object can name in `minStage` (`stage1_evening` … `stage5_collapse`). */
export const MAP_STAGE_COUNT = 5;

/**
 * A `cover` object. Story 4.2: while active (`minStage` ≤ the current decay stage) it blocks bodies
 * and the flow field like a collision box; cars and the bus also stop shots (`COVER_STOPS_SHOTS`).
 * The World's active copy is `world.obstacles` (`map/obstacles.ts`).
 */
export interface CoverObject extends MapBox {
  readonly kind: CoverKind;
  /** First decay stage the object exists in (1 = from the start; Story 4.5 applies later ones). */
  readonly minStage: number;
}

/** A `hazards` zone: data only in Story 4.1 (Story 4.8: fire zones; Epic 6: the gas leak). */
export interface HazardZone extends MapBox {
  readonly kind: string;
  readonly minStage: number;
}

/** Story 4.3: what a spawn point is in the city (GDD › District 1: alleys, manholes, broken shop windows). */
export const SPAWN_KINDS = ["street", "alley", "manhole", "window"] as const;
export type SpawnKind = (typeof SPAWN_KINDS)[number];

/** Story 4.3: the axis a spawn's zombies are jittered along (`waves.spawnJitterM`). */
export type SpawnJitterAxis = "x" | "y";

/**
 * A zombie spawn point of the `spawns` layer. Story 4.3: zombies come only from points with
 * `minStage` ≤ the decay stage (`map/decayStage.ts › currentDecayStage`), never within 6 m of a living player
 * (`waves/spawnPick.ts`).
 */
export interface MapSpawn extends SpawnPoint {
  readonly name: string;
  readonly minStage: number;
  readonly kind: SpawnKind;
  /**
   * Jitter axis (Tiled property `jitterAxis`; default: x on the top/bottom map edges, y otherwise,
   * Story 4.1's rule). A window jitters along its building's face, a manhole along its street.
   */
  readonly jitterAxis: SpawnJitterAxis;
}

/** Story 4.5: what a decay mutation does at the build start that enters its stage. */
export const DECAY_ACTIONS = ["add", "remove", "ignite", "block"] as const;
export type DecayAction = (typeof DECAY_ACTIONS)[number];

/** Story 4.5: most variation candidates a map may hold (the chosen set travels as a uint32 bitmask). */
export const MAX_DECAY_VARIANTS = 32;

/** Story 4.8: most `ignite` mutations a map may hold (the burned-out set travels as a uint32 bitmask). */
export const MAX_DECAY_FIRES = 32;

/**
 * Story 4.5: one object of the `decay` layer (architecture › Decay Stage Engine). Applied when the
 * run reaches `stage` (2–5), by `decay/applyDecayStage.ts`, in map order:
 *
 * - `add`: a new cover object of `kind` with this box (4.2's rules: car/bus stop shots);
 * - `block`: a new wall with this box (stops bodies and shots, nav wall: rubble, a dumpster);
 * - `remove`: the collision box, cover object or earlier add/block named `target` disappears
 *   (a cover object that duplicates a collision box, the bus, takes the box with it);
 * - `ignite`: a fire zone at the centre of `target` (Story 4.8: damage, flow cost, expiry after
 *   `decay.json › fire.durationWaves`; the radius is `fire.radiusM` unless the object overrides it).
 *
 * For `remove` / `ignite` the box is the target's (resolved by the loader). `variant` ≥ 0 makes it
 * part of a variation candidate (`DistrictMap.decayVariants`): it applies only when chosen.
 */
export interface DecayMutation extends MapBox {
  readonly stage: number;
  readonly action: DecayAction;
  /** `add`: the cover kind; "" otherwise. */
  readonly kind: CoverKind | "";
  /** `remove` / `ignite`: the target's name; "" otherwise. */
  readonly target: string;
  /** `ignite`: the map's radius override in metres (0 = `decay.json › fire.radiusM`); 0 otherwise. */
  readonly radiusM: number;
  /** Index into `DistrictMap.decayVariants`, or -1 (always applied). */
  readonly variant: number;
}

/** Story 4.5: one variation candidate; `pick` candidates of each `group` are chosen per run (`streams.decay`). */
export interface DecayVariant {
  readonly name: string;
  readonly group: string;
  readonly pick: number;
  readonly stage: number;
}

/** Story 6.8: the way a stampede lane's Runners run (east, west, south, north), from its start edge. */
export const LANE_DIRS = ["e", "w", "s", "n"] as const;
export type LaneDir = (typeof LANE_DIRS)[number];

/**
 * Story 6.8 (`events` layer): a stampede lane, a rect as wide as the stampede (`events.json ›
 * stampede.laneWidthM`) spanning the map along `dir`; open while `minStage` ≤ stage ≤ `maxStage`.
 */
export interface StampedeLane extends MapBox {
  readonly dir: LaneDir;
  readonly minStage: number;
  readonly maxStage: number;
}

/** Story 6.8: kinds of `events` spots (6.9 supply drop: crate; 6.10: survivor, safe). Append only. */
export const EVENT_SPOT_KINDS = ["crate", "survivor", "safe"] as const;
export type EventSpotKind = (typeof EVENT_SPOT_KINDS)[number];

/** Story 6.8: a point of the `events` layer on open road (from `minStage`). */
export interface EventSpot {
  readonly name: string;
  readonly kind: EventSpotKind;
  readonly x: number;
  readonly y: number;
  readonly minStage: number;
}

/** A visual prop of a `stageN_*` group (drawn by the client only; no gameplay). */
export interface VisualProp extends MapBox {
  readonly kind: string;
  /** The object layer inside the group it came from. */
  readonly layer: string;
}

/**
 * A district: playable bounds, spawn points and (Story 4.1, loaded from Tiled by `loadTiledMap`)
 * static collision boxes, cover, hazards and the visual props of each decay stage. Immutable data:
 * server, solo, the client's mirror and its prediction World share one frozen object.
 */
export interface DistrictMap extends DistrictBounds {
  /** District id ("downtown"; "placeholder" for the open test street). */
  readonly name: string;
  /** Content hash of the parsed map (FNV-1a, hex): the join check and the snapshot digest. */
  readonly version: string;
  readonly spawnPoints: readonly MapSpawn[];
  /**
   * Static obstacles (the `collision` layer): bodies never overlap them (same push-out as buildings)
   * and the flow field treats their cells as walls. Every edge lies on the 0.5 m lattice.
   */
  readonly solids: readonly MapBox[];
  readonly cover: readonly CoverObject[];
  readonly hazards: readonly HazardZone[];
  /** Visual props per decay stage: index 0 = `stage1_evening` … 4 = `stage5_collapse`. */
  readonly stages: readonly (readonly VisualProp[])[];
  /** Story 4.5: the `decay` layer's mutations in map order (empty when the map has none). */
  readonly decay: readonly DecayMutation[];
  /** Story 4.5: the variation candidates, in first-appearance order (bit i of a variant mask = candidate i). */
  readonly decayVariants: readonly DecayVariant[];
  /** Story 6.8: the `events` layer's spots (crate / survivor / safe; empty without the layer). */
  readonly eventSpots: readonly EventSpot[];
  /** Story 6.8: the `events` layer's stampede lanes (map order = the wire's `eventLane` index). */
  readonly stampedeLanes: readonly StampedeLane[];
}
