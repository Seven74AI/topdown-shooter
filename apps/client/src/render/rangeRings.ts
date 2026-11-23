import type { BuildingTypeStats } from "@topdown/shared";

/**
 * Story 5.17 (AC 7, D6): the ghost's range rings, read **generically** from the type's balance blocks:
 * every numeric field of a nested block (`turret`, `mine`, and later 5.10's `heal` / `light`, 5.14's
 * bear trap) named `rangeM` or ending in `RadiusM` / `radiusM` is one ring round the footprint's centre.
 * So a new building type gets its rings with no UI change. `projectileRangeM` is not a ring (where a
 * bullet dies, not what the building covers). Cached per stats object (balance is frozen): no
 * allocation per frame.
 */
export interface RangeRing {
  /** `block.field`, e.g. "turret.rangeM", "mine.triggerRadiusM". */
  readonly key: string;
  readonly radiusM: number;
}

/** Story 5.10 review: `blackoutRadiusM` (the floodlight's Epic 6 blackout pool) is not shown while building today. */
const isRingField = (f: string): boolean => f !== "blackoutRadiusM" && (f === "rangeM" || f === "radiusM" || f.endsWith("RadiusM"));

const cache = new WeakMap<object, readonly RangeRing[]>();
const NONE: readonly RangeRing[] = Object.freeze([]);

export function rangeRings(stats: Readonly<BuildingTypeStats> | undefined): readonly RangeRing[] {
  if (!stats) return NONE;
  let rings = cache.get(stats);
  if (rings) return rings;
  const out: RangeRing[] = [];
  for (const [block, value] of Object.entries(stats as Record<string, unknown>)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [field, r] of Object.entries(value as Record<string, unknown>)) {
      if (isRingField(field) && typeof r === "number" && Number.isFinite(r) && r > 0) out.push(Object.freeze({ key: `${block}.${field}`, radiusM: r }));
    }
  }
  rings = out.length > 0 ? Object.freeze(out) : NONE;
  cache.set(stats, rings);
  return rings;
}
