import type { DistrictMap } from "./districtMap";

export type { DistrictBounds, DistrictMap, SpawnPoint } from "./districtMap";

const EDGE_INSET_M = 0.5;

/**
 * The open test street (Epics 1–3): solid edges, the size of Downtown, no obstacles, and 12 spawn
 * points just inside the edges: 4 per long edge, 2 per short edge. Since Story 4.1 the game runs in
 * `DOWNTOWN_MAP`; this stays `createWorld`'s default so mechanic tests keep their open geometry.
 */
export const PLACEHOLDER_MAP: DistrictMap = Object.freeze({
  name: "placeholder",
  version: "open",
  widthM: 48,
  heightM: 32,
  spawnPoints: Object.freeze(
    [
      ...[6, 18, 30, 42].map((x) => ({ x, y: EDGE_INSET_M })),
      ...[6, 18, 30, 42].map((x) => ({ x, y: 32 - EDGE_INSET_M })),
      ...[32 / 3, 64 / 3].map((y) => ({ x: EDGE_INSET_M, y })),
      ...[32 / 3, 64 / 3].map((y) => ({ x: 48 - EDGE_INSET_M, y })),
    ].map((p, i) => Object.freeze({ ...p, name: `edge_${i + 1}`, minStage: 1 })),
  ),
  solids: Object.freeze([]),
  cover: Object.freeze([]),
  hazards: Object.freeze([]),
  stages: Object.freeze([]),
});
