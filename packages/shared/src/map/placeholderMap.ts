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

/** A district's playable bounds plus its spawn points (Story 4.1 loads these from Tiled). */
export interface DistrictMap extends DistrictBounds {
  readonly spawnPoints: readonly SpawnPoint[];
}

const EDGE_INSET_M = 0.5;

/**
 * Placeholder street with solid edges, the size of Downtown, and 12 spawn points just inside the
 * edges: 4 per long edge, 2 per short edge (Story 4.3 moves spawn points into the Tiled map).
 */
export const PLACEHOLDER_MAP: DistrictMap = Object.freeze({
  widthM: 48,
  heightM: 32,
  spawnPoints: Object.freeze([
    ...[6, 18, 30, 42].map((x) => ({ x, y: EDGE_INSET_M })),
    ...[6, 18, 30, 42].map((x) => ({ x, y: 32 - EDGE_INSET_M })),
    ...[32 / 3, 64 / 3].map((y) => ({ x: EDGE_INSET_M, y })),
    ...[32 / 3, 64 / 3].map((y) => ({ x: 48 - EDGE_INSET_M, y })),
  ]),
});
