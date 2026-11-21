/**
 * Map coordinates: meters, origin (0, 0) at the top-left corner, +x right, +y down (same as the screen).
 * The horde stream (Story 2.5) quantizes positions from this origin.
 */
export interface DistrictBounds {
  readonly widthM: number;
  readonly heightM: number;
}

/** Placeholder street with solid edges, the size of Downtown (Story 4.1 replaces it with the Tiled map). */
export const PLACEHOLDER_MAP: DistrictBounds = Object.freeze({ widthM: 48, heightM: 32 });
