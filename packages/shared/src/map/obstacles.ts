import { COVER_STOPS_SHOTS, type CoverObject, type DecayMutation, type DistrictMap, type MapBox } from "./districtMap";

/**
 * Story 4.2: the World's active obstacles for the current decay stage, built from the frozen map.
 * Story 4.5: and from the map's decay mutations of every stage reached (`decay` layer).
 *
 * - `solids`: what bodies collide with and the flow field walls off — the walls (map collision
 *   boxes not removed, in map order, then `block` mutations in map order), then every active cover
 *   object (map cover with `minStage` ≤ stage, then `add` mutations; all four kinds) that is not an
 *   exact copy of a collision box (the bus is both `city_bus` and `bus_hull`).
 * - `shotBlockers`: what stops projectiles — the walls, then active cover whose kind stops shots
 *   (`COVER_STOPS_SHOTS`: car, bus), deduplicated the same way.
 * - `lobBlockers`: what stops a lobbed round's track — the walls flagged `building` (designer
 *   2026-11-23: rounds fly over cars, the bus, pumps, low walls, barricades and turrets).
 * - `walls`: the walls alone (the client draws them; Story 4.5).
 * - `cover`: the active cover objects (the client draws them; tests).
 *
 * The lists change only through `fillObstacles` (World creation; `decay/applyDecayStage.ts` on a
 * stage change), never per tick. They are recomputed from scratch for (stage, variants), so every
 * host that knows those two numbers builds the same lists.
 */
export interface ObstacleState {
  /** The decay stage the lists were built for. */
  stage: number;
  /** Story 4.5: the variant mask they were built for (bit i = `map.decayVariants[i]` chosen). */
  variants: number;
  /** Bumped on every rebuild (the client's cover and decay views redraw when it changes). */
  version: number;
  readonly solids: MapBox[];
  readonly shotBlockers: MapBox[];
  readonly lobBlockers: MapBox[];
  readonly walls: MapBox[];
  readonly cover: CoverObject[];
}

const sameRect = (a: MapBox, b: MapBox): boolean => a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;

function duplicatesSolid(map: DistrictMap, c: MapBox): MapBox | null {
  for (let i = 0; i < map.solids.length; i++) if (sameRect(map.solids[i] as MapBox, c)) return map.solids[i] as MapBox;
  return null;
}

/** Story 4.5: the mutation applies at `stage` with `variants` chosen. */
export function mutationApplies(m: DecayMutation, stage: number, variants: number): boolean {
  return m.stage <= stage && (m.variant < 0 || (variants & (1 << m.variant)) !== 0);
}

/** Names removed by the applied mutations (rare: build starts only, so a Set is fine). */
function removedNames(map: DistrictMap, stage: number, variants: number): Set<string> {
  const out = new Set<string>();
  for (const m of map.decay) {
    if (m.action !== "remove" || !mutationApplies(m, stage, variants)) continue;
    out.add(m.target);
    // 4.2 review L2: a cover object that duplicates a collision box (the bus) takes the box with it,
    // and the other way round.
    const cover = map.cover.find((c) => c.name === m.target);
    const solid = cover ? duplicatesSolid(map, cover) : null;
    if (solid) out.add(solid.name);
    const asSolid = map.solids.find((s) => s.name === m.target);
    if (asSolid) for (const c of map.cover) if (sameRect(c, asSolid)) out.add(c.name);
  }
  return out;
}

/** Story 4.5: an `add` mutation's cover object (cached: the same object every rebuild). */
const addedCover = new WeakMap<DecayMutation, CoverObject>();
function coverOf(m: DecayMutation): CoverObject {
  let c = addedCover.get(m);
  if (!c) {
    c = Object.freeze({ name: m.name, minX: m.minX, minY: m.minY, maxX: m.maxX, maxY: m.maxY, kind: m.kind === "" ? "car" : m.kind, minStage: m.stage });
    addedCover.set(m, c);
  }
  return c;
}

function pushCover(o: ObstacleState, map: DistrictMap, c: CoverObject): void {
  o.cover.push(c);
  if (duplicatesSolid(map, c)) return;
  o.solids.push(c);
  if (COVER_STOPS_SHOTS[c.kind]) o.shotBlockers.push(c);
}

/**
 * Refills the lists in place for (`stage`, `variants`) (no new arrays except the removal set; called
 * only on creation or a stage change). Does not touch `version`.
 */
export function fillObstacles(o: ObstacleState, map: DistrictMap, stage: number, variants: number): void {
  o.solids.length = 0;
  o.shotBlockers.length = 0;
  o.lobBlockers.length = 0;
  o.walls.length = 0;
  o.cover.length = 0;
  const removed = map.decay.length > 0 ? removedNames(map, stage, variants) : null;
  const gone = (name: string): boolean => removed !== null && removed.has(name);
  for (let i = 0; i < map.solids.length; i++) {
    const s = map.solids[i] as MapBox;
    if (gone(s.name)) continue;
    o.walls.push(s);
  }
  for (const m of map.decay) if (m.action === "block" && mutationApplies(m, stage, variants) && !gone(m.name)) o.walls.push(m);
  for (let i = 0; i < o.walls.length; i++) {
    o.solids.push(o.walls[i] as MapBox);
    o.shotBlockers.push(o.walls[i] as MapBox);
    if ((o.walls[i] as MapBox).building === true) o.lobBlockers.push(o.walls[i] as MapBox);
  }
  for (let i = 0; i < map.cover.length; i++) {
    const c = map.cover[i] as CoverObject;
    if (c.minStage > stage || gone(c.name)) continue;
    pushCover(o, map, c);
  }
  for (const m of map.decay) if (m.action === "add" && mutationApplies(m, stage, variants) && !gone(m.name)) pushCover(o, map, coverOf(m));
  o.stage = stage;
  o.variants = variants;
}

/** The obstacle lists of `map` at `stage` with `variants` (`createWorld` passes the first stage). */
export function createObstacles(map: DistrictMap, stage: number, variants = 0): ObstacleState {
  const o: ObstacleState = { stage, variants, version: 0, solids: [], shotBlockers: [], lobBlockers: [], walls: [], cover: [] };
  fillObstacles(o, map, stage, variants);
  return o;
}

/** Story 6.2: the name prefix of every rubble box (`rubble_alley_*`, `rubble_pile_*`). */
export const RUBBLE_PREFIX = "rubble_";

/** Story 6.2: the box is Ruins rubble (a `block` wall; not `building`, so lobs fly over it). */
export function isRubble(b: { readonly name: string }): boolean {
  return b.name.startsWith(RUBBLE_PREFIX);
}

/**
 * Story 6.2 (AC 6): fills `out` with the ACTIVE rubble boxes (the collapsed alley's heap and the
 * street piles) from `o.walls`, in wall order; returns `out` (cleared first, no allocation). Rubble
 * needs no special query: it is in `solids` (bodies, flow fields, the boss grid) and `shotBlockers`
 * (bullets, melee, blasts, spit, flames, gas, acid) like any wall. 6.6's throw reads this list for
 * its chunk (visual only); its charge crashes into rubble through the normal `solids` test.
 */
export function rubblePiles(o: Readonly<ObstacleState>, out: MapBox[]): MapBox[] {
  out.length = 0;
  const walls = o.walls;
  for (let i = 0; i < walls.length; i++) if (isRubble(walls[i] as MapBox)) out.push(walls[i] as MapBox);
  return out;
}
