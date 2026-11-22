import type { World } from "../core/world";
import type { MapBox } from "../map/districtMap";
import { buildingStats, removeBuilding, type Building } from "../buildings/buildings";
import { PUSH_STUCK, circleHitsBuilding, pushOutOfBuildings, pushed } from "../buildings/collision";
import { refundMoney } from "../economy/economy";
import { boxBlocked, findBoxFreeSpot, findFreeSpotNear, spotBlocked } from "../player/freeSpot";
import type { PlayerState } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { killZombie, zombieTypeOf } from "../zombies/zombiePool";
import { rebuildFlowFieldNow } from "../zombies/flowField";
import { applyDecayStage } from "./applyDecayStage";
import { stageForWave } from "./decayState";
import { fireExpiry, lightNewFires } from "./fire";

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
 *   3. every player or zombie that overlaps a solid is moved out (`relocateBodies`);
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

/** Step 2: buildings on newly blocked cells are destroyed and refunded (FR58). Returns how many. */
export function destroyBlockedBuildings(world: World): number {
  const list = world.buildings.list;
  const solids = world.obstacles.solids;
  const share = world.balance.decay.buildingRefundShare;
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i] as Building;
    if (!overlapsSolid(solids, b)) continue;
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
 * A player inside a solid: the shortest push-out if it lands clear of boxes and bodies; else the
 * free-spot rings (bodies counted), the wide rings, the wide rings ignoring bodies; else the team
 * starts. Returns false only if every candidate is blocked (never on Downtown).
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
    if (!boxBlocked(world, spot.x, spot.y, r)) {
      placePlayer(p, spot.x, spot.y);
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

/** Step 3 result (tests and logs). */
export const relocated = { players: 0, zombies: 0, zombiesRemoved: 0, playersStuck: 0 };

/** Step 3: every placed player (not out: off the map) and alive zombie overlapping a solid or building is moved out. */
export function relocateBodies(world: World): void {
  relocated.players = 0;
  relocated.zombies = 0;
  relocated.zombiesRemoved = 0;
  relocated.playersStuck = 0;
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
 * when nothing changes (then nothing happens at all).
 */
export function decayMutate(world: World, stage: number): boolean {
  const coming = world.waves.number + 1;
  const changed = applyDecayStage(world, stage, world.decay.variants, fireExpiry(world, stage, coming));
  lightNewFires(world, world.decay.stage, coming);
  if (!changed) return false;
  destroyBlockedBuildings(world);
  relocateBodies(world);
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
