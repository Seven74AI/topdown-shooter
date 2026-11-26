import type { World } from "../core/world";
import type { MapBox } from "../map/districtMap";
import { removeBuilding, type Building } from "../buildings/buildings";
import { captureStageRegion, stageCutWall, stageSealUnresolved } from "../buildings/pathOpen";
import { PUSH_STUCK, circleHitsBuilding, pushOutOfBuildings, pushed } from "../buildings/collision";
import { boxBlocked, boxOrFireBlocked, findBoxFreeSpot, findFreeSpotNear, spotBlocked } from "../player/freeSpot";
import type { PlayerState } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { killZombie, zombieTypeOf } from "../zombies/zombiePool";
import { rebuildFlowFieldNow } from "../zombies/flowField";
import { applyDecayStage } from "./applyDecayStage";
import { stageForWave } from "./decayState";
import type { FireRecord } from "./decayState";
import { buildingInFires, circleInFire, fireExpiry, lightNewFires, newlyLitFires, resetBurnClocks } from "./fire";

/**
 * Story 4.5 `DecaySystem` (FR58; architecture › Decay Stage Engine). Runs only at the start of a
 * build phase (`run/runStateMachine.ts › startBuild`) and from the solo dev cheat, never mid-wave,
 * on the server and in solo (the client mirror and Predictor only call `applyDecayStage`). The
 * order is brief line 5's:
 *
 *   1. the mutations (`applyDecayStage`: obstacle lists, nav walls, fires); Story 4.8: fires whose
 *      `durationWaves` are over go out here too (`fireExpiry`), and newly lit ones get their end wave;
 *   2. every building that overlaps a solid is destroyed (`building.destroyed`); Story 12.4 (designer
 *      2026-11-25, "bad luck"): no money goes back (FR58 had a 50 % refund until then);
 *      (Story 4.8 review M2: also every building a fire lit now overlaps; Story 12.1 AC 6: every wall
 *      within one player body of new cover); Story 12.1 H1: then walls that now seal part of the old
 *      main region are cleared (`clearStageSeals`);
 *   3. every player or zombie that overlaps a solid is moved out (`relocateBodies`); Story 4.8
 *      review M1: then every standing player inside a fire lit now is moved just outside it
 *      (`moveOutOfNewFires`);
 *      (`startBuild` then returns downed / out players: `returnOutPlayers`, same free-spot code)
 *   4. `decayFinish`: the chase and flank flow fields are rebuilt at once (4.2 review L1: no wave
 *      starts on fields of the old map) and `decay.stage_changed` is emitted.
 */

/** Scratch spot (build starts only; synchronous). */
const spot = { x: 0, y: 0 };

/**
 * Story 12.1 (AC 6): the solids active before this build start's mutations (`decayMutate` copies them
 * just before `applyDecayStage`), so step 2 can tell the NEW cover. Map boxes and cover are stable
 * objects (`fillObstacles` reuses them), so "new" = not in this list. Build starts only: no per-tick cost.
 */
const solidsBefore: MapBox[] = [];

/** Story 12.1 (AC 6): the box comes closer than `margin` to a solid that is not in `before` (new cover). */
function nearNewSolid(solids: readonly MapBox[], before: readonly MapBox[], b: Building, margin: number): boolean {
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i] as MapBox;
    if (before.includes(s)) continue;
    const dx = Math.max(0, s.minX - b.maxX, b.minX - s.maxX);
    const dy = Math.max(0, s.minY - b.maxY, b.minY - s.maxY);
    if (dx * dx + dy * dy < margin * margin) return true;
  }
  return false;
}

/** The box overlaps an obstacle solid (strictly: touching is fine, like placement). */
function overlapsSolid(solids: readonly MapBox[], b: Building): boolean {
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i] as MapBox;
    if (b.minX < s.maxX && b.maxX > s.minX && b.minY < s.maxY && b.maxY > s.minY) return true;
  }
  return false;
}

/**
 * Step 2: buildings on newly blocked cells are destroyed (FR58; Story 12.4: no refund, the building is
 * simply lost: no `money.earned`, every cause below). Story 4.8 review M2:
 * so are buildings a fire lit at this build start overlaps (`newFires`; a building placed into a
 * fire later burns instead, D6). Story 12.1 (AC 6): with `before` (the solids active before this
 * build start), so is every WALL whose box comes closer than one player body (2 × `player.radiusM`)
 * to a solid that is new (not in `before`), even if it would not seal a path: a building never
 * squeezes a gap below player width against new cover. Floor types never block, so only overlap
 * removes them. The event carries the cause (`collapse`: under
 * new cover, `fire`, `cleared`: the margin) for the owner's toast. Same order (id, descending walk
 * of the id-sorted list) on every copy. Returns how many.
 */
export function destroyBlockedBuildings(world: World, newFires: readonly FireRecord[] = [], before: readonly MapBox[] | null = null): number {
  const list = world.buildings.list;
  const solids = world.obstacles.solids;
  const margin = 2 * world.balance.player.radiusM;
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i] as Building;
    const cause = overlapsSolid(solids, b) ? "collapse" : buildingInFires(newFires, b) ? "fire" : before !== null && b.solid && nearNewSolid(solids, before, b, margin) ? "cleared" : null;
    if (cause === null) continue;
    if (!removeBuilding(world, b.id)) continue;
    n++;
    world.events.emit({ type: "building.destroyed", buildingId: b.id, buildingType: b.type, ownerId: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot, cause });
    // Story 12.4 (CN-6): no refund for any decay loss (Story 6.2 review L4's "50 % of what was paid" is gone).
  }
  return n;
}

/**
 * Story 12.1 H1 (designer 2026-11-26: A): a stage must not finish a seal the walls started. After step 2,
 * while the stage cut part of the old main region off by walls (the map alone still joins it), the wall
 * `stageCutWall` names (highest id first) is cleared: `building.destroyed`, cause `cleared`, no refund
 * (12.4). Returns how many. Server and solo (the DecaySystem); copies follow the removal.
 */
export function clearStageSeals(world: World): number {
  let n = 0;
  for (let b = stageCutWall(world); b !== null; b = stageCutWall(world)) {
    if (!removeBuilding(world, b.id)) break;
    n++;
    world.events.emit({ type: "building.destroyed", buildingId: b.id, buildingType: b.type, ownerId: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot, cause: "cleared" });
  }
  stageSealsCleared.count += n;
  // Re-review round 2: a cut no wall could be found for is never silent (the server logs it at the stage change).
  const left = stageSealUnresolved();
  if (left > 0) unresolvedByWorld.set(world, left);
  else unresolvedByWorld.delete(world);
  return n;
}

/** Re-review round 2: per World, the vertices the last build start left cut off with no wall to clear (0 = none). */
const unresolvedByWorld = new WeakMap<World, number>();
export function stageSealsUnresolved(world: World): number {
  return unresolvedByWorld.get(world) ?? 0;
}

/** Story 12.1 H1: a wall building stands (the stage re-check has something to do). */
function hasWall(world: Readonly<World>): boolean {
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) if ((list[i] as Building).solid) return true;
  return false;
}

/** Story 12.1 H1: walls the stage re-check cleared (process-global diagnostic for sims and tests; not simulation state). */
export const stageSealsCleared = { count: 0 };

function placePlayer(p: PlayerState, x: number, y: number): void {
  p.x = x;
  p.y = y;
  p.prevX = x;
  p.prevY = y;
}

/**
 * A player inside a solid: the shortest push-out if it lands clear of boxes, bodies and fires; else
 * the free-spot rings (bodies counted), the wide rings, the wide rings ignoring bodies; else the team
 * starts. Story 4.8 re-review H1: every one of these also stays out of every burning fire (a push-out
 * from a new box must not land in a fire still burning from the previous wave); only if all fail,
 * the fire-blind wide rings and team starts (in a fire beats inside a box), counted in
 * `relocated.leftInFire`. Returns false only if every candidate is blocked (never on Downtown).
 */
function relocatePlayer(world: World, p: PlayerState): boolean {
  const r = p.radiusM;
  const x = p.x;
  const y = p.y;
  if (pushOutOfBuildings(world, x, y, r, x, y) !== PUSH_STUCK && !spotBlocked(world, pushed.x, pushed.y, r, p)) {
    placePlayer(p, pushed.x, pushed.y);
    return true;
  }
  const rings = world.balance.decay.relocateSearchRings;
  if (findFreeSpotNear(world, x, y, p, spot) || findFreeSpotNear(world, x, y, p, spot, rings) || findFreeSpotNear(world, x, y, p, spot, rings, true)) {
    placePlayer(p, spot.x, spot.y);
    return true;
  }
  for (let slot = 0; slot < 4; slot++) {
    teamSpawnPoint(world, slot, spot);
    if (!boxOrFireBlocked(world, spot.x, spot.y, r)) {
      placePlayer(p, spot.x, spot.y);
      return true;
    }
  }
  if (findFreeSpotNear(world, x, y, p, spot, rings, true, false)) {
    placePlayer(p, spot.x, spot.y);
    relocated.leftInFire++;
    return true;
  }
  for (let slot = 0; slot < 4; slot++) {
    teamSpawnPoint(world, slot, spot);
    if (!boxBlocked(world, spot.x, spot.y, r)) {
      placePlayer(p, spot.x, spot.y);
      relocated.leftInFire++;
      return true;
    }
  }
  return false;
}

/**
 * A zombie inside a solid: the push-out if clear of boxes, else the box-only rings with its own
 * radius; with no spot it is removed (no reward). Returns 0 = moved, 1 = removed.
 */
function relocateZombie(world: World, id: number): number {
  const z = world.zombies;
  const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
  const x = z.x[id] as number;
  const y = z.y[id] as number;
  let nx: number;
  let ny: number;
  if (pushOutOfBuildings(world, x, y, r, x, y) !== PUSH_STUCK && !boxBlocked(world, pushed.x, pushed.y, r)) {
    nx = pushed.x;
    ny = pushed.y;
  } else if (findBoxFreeSpot(world, x, y, r, world.balance.decay.relocateSearchRings, spot)) {
    nx = spot.x;
    ny = spot.y;
  } else {
    killZombie(world, id, null, "decay");
    return 1;
  }
  z.x[id] = nx;
  z.y[id] = ny;
  z.prevX[id] = nx;
  z.prevY[id] = ny;
  return 0;
}

/**
 * Step 3 result (tests and logs). Story 4.8 re-review L1: `leftInFire` = players this build start had
 * to leave in (or put into) a burning fire because every fire-free candidate was blocked (like
 * `playersStuck`; never on Downtown: the fuzz asserts no standing player in a fire after a build start).
 */
export const relocated = { players: 0, zombies: 0, zombiesRemoved: 0, playersStuck: 0, outOfFire: 0, leftInFire: 0 };

/** Zeroes every `relocated` count (each build start; the steps below then count from 0). */
function resetRelocated(): void {
  relocated.players = 0;
  relocated.zombies = 0;
  relocated.zombiesRemoved = 0;
  relocated.playersStuck = 0;
  relocated.outOfFire = 0;
  relocated.leftInFire = 0;
}

/** Directions tried round a fire when moving a player out of it (16: every 22.5°). */
const FIRE_EXIT_DIRECTIONS = 16;
/** Past the touching distance, so the body is strictly outside the zone. */
const FIRE_EXIT_EPS_M = 1e-6;

/**
 * Story 4.8 review M1 (step 3, after `relocateBodies`): every standing player inside a fire lit at
 * this build start is moved just outside it, to fire radius + body radius from its centre: first
 * straight out along its own direction, then the other 15 directions round the zone (alternating
 * sides), each clear of boxes, bodies and every burning zone; else the first fire-free spot of the
 * free-spot rings round it (re-review L1: the fire filter is inside the search, so it tries the next
 * spot instead of giving up on the first); else the team starts. If all fail the player stays and is
 * counted (`relocated.leftInFire`). Downed players stay (fire spares them, D4); out players are off
 * the map. Returns how many moved.
 */
export function moveOutOfNewFires(world: World, lit: readonly FireRecord[]): number {
  relocated.outOfFire = 0;
  if (lit.length === 0) return 0;
  for (const p of world.players.values()) {
    if (p.status !== "alive" || !circleInFire(lit, p.x, p.y, p.radiusM)) continue;
    let f = lit[0] as FireRecord;
    for (const g of lit) if (circleInFire([g], p.x, p.y, p.radiusM)) f = g;
    const d = f.radiusM + p.radiusM + FIRE_EXIT_EPS_M;
    let a0 = Math.atan2(p.y - f.y, p.x - f.x);
    if (p.x === f.x && p.y === f.y) a0 = 0;
    let done = false;
    for (let k = 0; k < FIRE_EXIT_DIRECTIONS && !done; k++) {
      const step = Math.ceil(k / 2) * (k % 2 === 1 ? 1 : -1);
      const a = a0 + (step * 2 * Math.PI) / FIRE_EXIT_DIRECTIONS;
      const x = f.x + Math.cos(a) * d;
      const y = f.y + Math.sin(a) * d;
      if (!spotBlocked(world, x, y, p.radiusM, p)) {
        placePlayer(p, x, y);
        done = true;
      }
    }
    if (!done && findFreeSpotNear(world, f.x, f.y, p, spot, world.balance.decay.relocateSearchRings)) {
      placePlayer(p, spot.x, spot.y);
      done = true;
    }
    for (let slot = 0; slot < 4 && !done; slot++) {
      teamSpawnPoint(world, slot, spot);
      if (!spotBlocked(world, spot.x, spot.y, p.radiusM, p)) {
        placePlayer(p, spot.x, spot.y);
        done = true;
      }
    }
    if (done) relocated.outOfFire++;
    else relocated.leftInFire++;
  }
  return relocated.outOfFire;
}

/** Step 3: every placed player (not out: off the map) and alive zombie overlapping a solid or building is moved out. */
export function relocateBodies(world: World): void {
  relocated.players = 0;
  relocated.zombies = 0;
  relocated.zombiesRemoved = 0;
  relocated.playersStuck = 0;
  relocated.leftInFire = 0;
  for (const p of world.players.values()) {
    if (p.status === "out" || !circleHitsBuilding(world, p.x, p.y, p.radiusM)) continue;
    if (relocatePlayer(world, p)) relocated.players++;
    else relocated.playersStuck++;
  }
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    if (!circleHitsBuilding(world, z.x[id] as number, z.y[id] as number, r)) continue;
    if (relocateZombie(world, id) === 0) relocated.zombies++;
    else relocated.zombiesRemoved++;
  }
}

/**
 * Steps 1–3 for `stage` (the variants stay the run's) at the build start before wave
 * `waves.number + 1`. Story 4.8: also when only fires go out (the stage unchanged). Returns false
 * when nothing changes (then nothing else happens: only the burn clocks restart, re-review L2).
 */
export function decayMutate(world: World, stage: number): boolean {
  resetBurnClocks(world); // re-review L2: every build start (also when nothing else changes)
  resetRelocated(); // fix re-review L2: no stale counts after a build start that changes nothing
  const coming = world.waves.number + 1;
  solidsBefore.length = 0;
  for (let i = 0; i < world.obstacles.solids.length; i++) solidsBefore.push(world.obstacles.solids[i] as MapBox); // Story 12.1 (AC 6)
  // Story 12.1 H1: the main region before the mutations — only when a wall stands (without one nothing can seal,
  // and most build starts of tests and runs have none: no flood then).
  const walls = hasWall(world);
  if (walls) captureStageRegion(world);
  const changed = applyDecayStage(world, stage, world.decay.variants, fireExpiry(world, stage, coming));
  const lit = newlyLitFires(world); // Story 4.8 review M1/M2: before they get their end wave
  lightNewFires(world, world.decay.stage, coming);
  if (!changed) return false;
  destroyBlockedBuildings(world, lit, solidsBefore);
  if (walls) clearStageSeals(world);
  relocateBodies(world);
  moveOutOfNewFires(world, lit);
  return true;
}

/**
 * Step 4: fields rebuilt now (server / solo only: the client's Worlds have no nav grid) and, if the
 * stage changed, the event (Story 4.8: fires going out alone rebuild the fields, no banner).
 */
export function decayFinish(world: World, from: number): void {
  const { nav, chase, flank, wide, wideChase } = world.pathing;
  if (nav.cells > 1) {
    rebuildFlowFieldNow(chase, nav, world);
    rebuildFlowFieldNow(flank, nav, world);
    // Story 5.7: the wide field too, but only while a wide body lives (a build start has none: it idles).
    if (world.pathing.wideActive) rebuildFlowFieldNow(wideChase, wide, world);
  }
  if (world.decay.stage !== from) world.events.emit({ type: "decay.stage_changed", stage: world.decay.stage, from });
}

/** The decay stage of the coming wave (`decay.json`, or the server's `DEV_DECAY_STAGES` table). */
export function stageForComingWave(world: World): number {
  return stageForWave(world.balance, world.waves.number + 1, world.debug.decayStageByWave);
}

/**
 * The whole change (steps 1–4) at once: the solo dev cheat ("Decay stage") and tests. A build start
 * splits it round `returnOutPlayers` (`startBuild`). Returns whether the stage changed.
 */
export function changeDecayStage(world: World, stage: number): boolean {
  const from = world.decay.stage;
  if (!decayMutate(world, stage)) return false;
  decayFinish(world, from);
  return true;
}
