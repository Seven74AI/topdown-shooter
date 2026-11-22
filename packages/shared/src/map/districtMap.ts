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
}

/** Story 4.1: kinds of the `cover` layer (Story 4.2 gives them their bullet and movement rules). */
export const COVER_KINDS = ["car", "bus", "barrier", "sandbags"] as const;
export type CoverKind = (typeof COVER_KINDS)[number];

/** Decay stages a map object can name in `minStage` (`stage1_evening` … `stage5_collapse`). */
export const MAP_STAGE_COUNT = 5;

/** A `cover` object: data only in Story 4.1 (no collision, no bullet rule; Stories 4.2 / 4.8). */
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
 * `minStage` ≤ the decay stage (`decay/decayStage.ts`), never within 6 m of a living player
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
}
