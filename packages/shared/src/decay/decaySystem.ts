import type { World } from "../core/world";
import type { MapBox } from "../map/districtMap";
import { buildingStats, removeBuilding, type Building } from "../buildings/buildings";
import { PUSH_STUCK, circleHitsBuilding, pushOutOfBuildings, pushed } from "../buildings/collision";
import { refundMoney } from "../economy/economy";
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
 *   2. every building that overlaps a solid is destroyed (`building.destroyed`) and its owner gets
 *      `floor(price × decay.buildingRefundShare)` back (`money.earned`, reason `refund`);
 *      (Story 4.8 review M2: also every building a fire lit now overlaps, same refund);
 *   3. every player or zombie that overlaps a solid is moved out (`relocateBodies`); Story 4.8
 *      review M1: then every standing player inside a fire lit now is moved just outside it
 *      (`moveOutOfNewFires`);
 *      (`startBuild` then returns downed / out players: `returnOutPlayers`, same free-spot code)
 *   4. `decayFinish`: the chase and flank flow fields are rebuilt at once (4.2 review L1: no wave
 *      starts on fields of the old map) and `decay.stage_changed` is emitted.
 */

/** Scratch spot (build starts only; synchronous). */
const spot = { x: 0, y: 0 };

/** The box overlaps an obstacle solid (strictly: touching is fine, like placement). */
function overlapsSolid(solids: readonly MapBox[], b: Building): boolean {
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i] as MapBox;
    if (b.minX < s.maxX && b.maxX > s.minX && b.minY < s.maxY && b.maxY > s.minY) return true;
  }
  return false;
}

/**
 * Step 2: buildings on newly blocked cells are destroyed and refunded (FR58). Story 4.8 review M2:
 * so are buildings a fire lit at this build start overlaps (`newFires`; a building placed into a
 * fire later burns instead, D6). Returns how many.
 */
export function destroyBlockedBuildings(world: World, newFires: readonly FireRecord[] = []): number {
  const list = world.buildings.list;
  const solids = world.obstacles.solids;
  const share = world.balance.decay.buildingRefundShare;
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i] as Building;
    if (!overlapsSolid(solids, b) && !buildingInFires(newFires, b)) continue;
    if (!removeBuilding(world, b.id)) continue;
    n++;
    world.events.emit({ type: "building.destroyed", buildingId: b.id, buildingType: b.type, ownerId: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot });
    const price = buildingStats(world.balance, b.type)?.price ?? 0;
    refundMoney(world, b.ownerId, Math.floor(price * share));
  }
  return n;
}

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
  const changed = applyDecayStage(world, stage, world.decay.variants, fireExpiry(world, stage, coming));
  const lit = newlyLitFires(world); // Story 4.8 review M1/M2: before they get their end wave
  lightNewFires(world, world.decay.stage, coming);
  if (!changed) return false;
  destroyBlockedBuildings(world, lit);
  relocateBodies(world);
  moveOutOfNewFires(world, lit);
  return true;
}

/**
 * Step 4: fields rebuilt now (server / solo only: the client's Worlds have no nav grid) and, if the
 * stage changed, the event (Story 4.8: fires going out alone rebuild the fields, no banner).
 */
export function decayFinish(world: World, from: number): void {
  const { nav, chase, flank } = world.pathing;
  if (nav.cells > 1) {
    rebuildFlowFieldNow(chase, nav, world);
    rebuildFlowFieldNow(flank, nav, world);
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
