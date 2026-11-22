import type { CoverObject, DistrictMap, HazardZone, MapBox, VisualProp } from "@topdown/shared";

/**
 * Story 4.9: what the static city shows at a decay stage (pure; called only when the static layers
 * are redrawn, so allocating here is fine).
 */

/** Hazard zones shown at `stage`: only once the stage has reached their `minStage` (D8). */
export function hazardsAt(map: DistrictMap, stage: number): HazardZone[] {
  return map.hazards.filter((h) => h.minStage <= stage);
}

/** Props of the later stage groups shown at `stage` (stage 1's ground props are the base layer). */
export function laterPropsAt(map: DistrictMap, stage: number): VisualProp[] {
  return propsAt(map, stage).filter((p) => !(map.stages[0] ?? []).includes(p));
}

/** Visual props shown at `stage`: every `stageN` group up to it (debris stays once it fell, D10). */
export function propsAt(map: DistrictMap, stage: number): VisualProp[] {
  const out: VisualProp[] = [];
  const last = Math.min(stage, map.stages.length);
  for (let i = 0; i < last; i++) for (const p of map.stages[i] ?? []) out.push(p);
  return out;
}

const sameRect = (a: MapBox, b: MapBox): boolean => a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;

/**
 * Map collision boxes drawn as static solids: every one that is not an exact copy of an active cover
 * object (the bus is both `city_bus` and `bus_hull`; the cover copy draws it, D9). A collision box is
 * always solid, so it is drawn even if its cover twin is gone.
 */
export function staticSolids(map: DistrictMap, activeCover: readonly CoverObject[]): MapBox[] {
  return map.solids.filter((s) => !activeCover.some((c) => sameRect(s, c)));
}

/** A stable number for "what the static layers show": the obstacles' stage and version. */
export function staticKey(stage: number, obstaclesVersion: number): number {
  return stage * 1_000_000 + obstaclesVersion;
}

/** Cover objects of a kind (drawing order: cars and the bus, then the low ones). */
export function coverOfKind(cover: readonly CoverObject[], kind: CoverObject["kind"]): CoverObject[] {
  return cover.filter((c) => c.kind === kind);
}
