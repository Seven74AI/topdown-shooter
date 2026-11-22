import type { CoverObject, DistrictMap, HazardZone, MapBox, VisualProp } from "@topdown/shared";

/**
 * Story 4.9: what the static city shows at a decay stage (pure; called only when the static layers
 * are redrawn, so allocating here is fine).
 */

/**
 * Hazard zones shown at `stage`: only once the stage has reached their `minStage` (D8). Fire zones
 * are not drawn from the map: the burning cars are the World's `decay.fires` (Story 4.5 picks which
 * car burns per run), drawn by the fire art.
 */
export function hazardsAt(map: DistrictMap, stage: number): HazardZone[] {
  return map.hazards.filter((h) => h.minStage <= stage && h.kind !== "fire");
}

/**
 * The visible stage group over the stage-1 base (D10, review: the architecture's swap model,
 * "DecayView swaps Tiled visual layer groups (`stageN_*`)", like Story 4.5): stage 1 shows none,
 * stage N ≥ 2 shows `stageN_*` only.
 */
export function stageGroupAt(map: DistrictMap, stage: number): readonly VisualProp[] {
  return stage >= 2 ? (map.stages[stage - 1] ?? []) : [];
}

const sameRect = (a: MapBox, b: MapBox): boolean => a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;

/**
 * The walls to draw (`world.obstacles.walls`: map collision boxes not removed + `block` mutations,
 * Story 4.5): every one that is not an exact copy of an active cover object (the bus is both
 * `city_bus` and `bus_hull`; the cover copy draws it, D9). A wall is always solid, so it is drawn
 * even if its cover twin is gone; a removed bus takes its wall along (4.5), so nothing is drawn.
 */
export function drawnWalls(walls: readonly MapBox[], activeCover: readonly CoverObject[]): MapBox[] {
  return walls.filter((s) => !activeCover.some((c) => sameRect(s, c)));
}

/** Names of the map's `block` mutations (dumpsters, rubble): drawn as low props, not roofs. */
export function blockNames(map: DistrictMap): Set<string> {
  const out = new Set<string>();
  for (const m of map.decay) if (m.action === "block") out.add(m.name);
  return out;
}

/** A stable number for "what the static layers show": the obstacles' stage and version, the fire count. */
export function staticKey(stage: number, obstaclesVersion: number, fires: number): number {
  return (stage * 1_000_000 + obstaclesVersion) * 16 + Math.min(15, fires);
}

/** Cover objects of a kind (drawing order: cars and the bus, then the low ones). */
export function coverOfKind(cover: readonly CoverObject[], kind: CoverObject["kind"]): CoverObject[] {
  return cover.filter((c) => c.kind === kind);
}
