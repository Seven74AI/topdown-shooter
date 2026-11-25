import { ticksFor } from "../core/time";
import { queryRadius, rebuildGrid } from "../core/spatialGrid";
import type { SystemFn } from "../core/systems";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { damagePlayerBy } from "../combat/damage";
import { slowPlayer } from "../player/slow";
import type { ZombieTypeStats } from "../config/balanceSchema";
import { zombieTypeOf } from "./zombiePool";
import { PUSH_STUCK, distanceToBox, hasObstacles, pushOutOfBuildings, pushed, segmentHitsBuildings } from "../buildings/collision";
import { buildingById, damageBuilding, type Building } from "../buildings/buildings";
import { ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { LURE_READY, flowCellAt, flowCellCenterX, flowCellCenterY, flowNearestReachedCell, flowNextCell, flowSharedMaxAgeTicks, flowStepBuilding, inFlankCone, isWideType, wideGapRing, type FlowField, type NavGrid } from "./flowField";
import { ZOMBIE_STATE, isRushState, isWindupState } from "./zombieTypes";
import { knockPlayer } from "../player/knockback";
import { meleeLineClear } from "../combat/cover";
import { segmentHitsFire } from "../decay/fire";
import { collectStanding, spitterStep } from "./spit";
import { updateMines } from "../buildings/mine";
import { catchOnBearTraps } from "../buildings/bearTrap";
import { BLOATER_SWELL_WEAPON, burstBurntSwells, startSwell, tickSwell } from "./bloater";
import { killZombie } from "./zombiePool";
import { stampedeContact, stampedeSteer, stampedeVel } from "../events/stampede";
import { damageSurvivor, survivorTarget, survivorWanted } from "../events/survivor";
import type { SurvivorState } from "../events/eventState";

/** Neighbours considered per zombie (scratch buffer, never allocated per tick). */
const MAX_NEIGHBOURS = 64;
const neighbours = new Int32Array(MAX_NEIGHBOURS);
/** Below this distance two zombies count as coincident and are pushed along a fixed axis. */
const COINCIDENT_M = 1e-4;
/** Contact tolerance: a zombie resting against a player still counts as touching. */
const CONTACT_EPS_M = 0.02;
/** Extra query distance for the overlap pass: zombies moved ≤ ~0.1 m since the grid was built. */
const OVERLAP_QUERY_MARGIN_M = 0.25;
/** Overlap-resolution passes per tick (more = firmer crowd, more cost). */
const OVERLAP_ITERATIONS = 2;
/**
 * Story 3.5: the line-of-sight test grows buildings by the zombie's radius plus this, so a zombie
 * resting against a wall (exactly one radius away after the push-out) counts as blocked by it.
 */
const LOS_MARGIN_M = 0.05;
/** Story 3.5: per zombie slot, the building its next field cell belongs to (0: none); written in pass 1, read in pass 4. */
const targetBuilding = new Int32Array(ZOMBIE_POOL_CAPACITY);
/** Story 3.5 review H1: 1 when the zombie followed the field this tick (pass 1 → pass 4). */
const fieldMode = new Uint8Array(ZOMBIE_POOL_CAPACITY);
/** Story 5.8: Bloaters whose swell burnt out in pass 4 (they burst after the pass, in this order). */
const swellDone = new Int32Array(ZOMBIE_POOL_CAPACITY);
/** `steerByField` result (synchronous, one record). */
const steer = { x: 0, y: 0 };
/**
 * Story 6.10 (S3, DD2): what a zombie chases — a standing player or the survivor NPC (not a player:
 * it joins only this list, the chase seeding and the Spitters' list). Both have x, y, radiusM, status.
 */
type ChaseTarget = PlayerState | SurvivorState;
/** Alive players this tick, rebuilt at the top of the system (no iterator allocation per zombie); then the survivor. */
const alivePlayers: ChaseTarget[] = [];
/** How many of `alivePlayers` are players (the survivor, when alive, is the last entry). */
let playerTargets = 0;
/** This tick's survivor target (null: none), compared by reference. */
let npc: SurvivorState | null = null;
let npcWorld: World | null = null;

function collectAlivePlayers(world: World): void {
  alivePlayers.length = 0;
  world.players.forEach((p) => {
    if (p.status === "alive") alivePlayers.push(p);
  });
  playerTargets = alivePlayers.length;
  npc = survivorTarget(world); // Story 6.10 (S3): with no survivor the list is exactly as before
  npcWorld = world;
  if (npc) alivePlayers.push(npc);
}

/** Nearest alive target to (x, y), or null. Ties keep the first player in insertion order (the survivor last). */
function nearestAlivePlayer(x: number, y: number): ChaseTarget | null {
  let best: ChaseTarget | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < alivePlayers.length; i++) {
    const p = alivePlayers[i] as ChaseTarget;
    if (p.status !== "alive") continue; // may go down mid-tick
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (p === npc && !survivorWanted(npcWorld as World, p, d2)) continue; // decision 6.10 B1: a waiting survivor only within 5 m
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

/** Story 6.8 (F5): a standing player's centre is within `m` of (x, y). */
function standingWithin(x: number, y: number, m: number): boolean {
  const m2 = m * m;
  for (let i = 0; i < playerTargets; i++) {
    const p = alivePlayers[i] as PlayerState;
    if (p.status !== "alive") continue;
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= m2) return true;
  }
  return false;
}

/**
 * Story 6.8 (F5, DD3): a lured zombie's velocity into `steer`: by the lure field (the wide one for a
 * wide body) round cover to the car — never a straight line through it — and, once at the car (a seed
 * cell) or before the field is built, straight at its centre (the car's own box stops it: it crowds round).
 */
function lureSteer(world: World, id: number, x: number, y: number, speedMps: number): void {
  const pa = world.pathing;
  const car = world.special.carAlarm;
  const wide = isWideType(world, world.zombies.type[id] as number);
  let tx = (car.minX + car.maxX) / 2;
  let ty = (car.minY + car.maxY) / 2;
  if (steerByField(world, wide ? pa.lureWide : pa.lure, wide ? pa.wide : pa.nav, x, y, id)) {
    fieldMode[id] = 1;
    tx = steer.x;
    ty = steer.y;
  }
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  steer.x = d > COINCIDENT_M ? (dx / d) * speedMps : 0;
  steer.y = d > COINCIDENT_M ? (dy / d) * speedMps : 0;
}

/** One zombie hit: damage, and the type's bite slow (Story 3.9: Crawlers). Story 5.7: the knockback (Brutes; never when the hit downs, F3). */
function damagePlayer(world: World, t: ChaseTarget, stats: Readonly<ZombieTypeStats>, sourceZombieId: number): void {
  if (t === npc) {
    damageSurvivor(world, stats.damage); // Story 6.10 (S3): its normal damage; no slow, no knock, no downed state
    return;
  }
  const p = t as PlayerState;
  if (p.status !== "alive" || world.debug.godMode) return; // god mode: dev cheat / ?stress (Story 1.11)
  if (stats.biteSlowPct > 0) slowPlayer(p, stats.biteSlowPct, ticksFor(stats.biteSlowS));
  // Story 5.4: the one player-damage path (full damage: a zombie is no player's source). At 0 HP it
  // downs the player (Story 2.8: down, not dead; zombies then ignore them).
  damagePlayerBy(world, p, stats.damage, "zombie", null, sourceZombieId);
  if (p.status === "alive" && stats.hitKnockbackM > 0) {
    knockPlayer(p, world.zombies.x[sourceZombieId] as number, world.zombies.y[sourceZombieId] as number, stats);
    bruteStats.knocks++;
  }
}

/** Story 5.7: Brute swings so far (tests and logs; not read by the sim). */
export const bruteStats = { windups: 0, hits: 0, misses: 0, knocks: 0, buildingHits: 0 };

/**
 * Story 3.5: where a zombie at (x, y) whose straight line is blocked steers: the centre of the cell
 * `lookaheadCells` steps down the flow field, stopping before a building cell. When the very next
 * cell belongs to a building, that building becomes the zombie's target (it attacks it on contact)
 * and the zombie steers at the nearest point of its box (straight at the face: never along it into
 * the gap between two buildings). False when there is no field there yet (then it walks straight).
 */
function steerByField(world: World, field: FlowField, nav: NavGrid, x: number, y: number, id: number): boolean {
  if (field.sourceTick < 0) return false;
  let here = flowCellAt(nav, x, y);
  if (nav.inflateM > 0) {
    // Story 5.7: a wide body standing in a grown wall cell (no field there) steers from the best
    // reached cell next to it.
    const near = flowNearestReachedCell(field, nav, here, world.balance.zombies.pathing.wideSteerRings); // review L4
    if (near < 0) return false;
    if (near !== here) {
      const next = flowNextCell(field, nav, near);
      const to = next >= 0 && flowStepBuilding(nav, near, next) === 0 ? next : near;
      steer.x = flowCellCenterX(nav, to);
      steer.y = flowCellCenterY(nav, to);
      return true;
    }
    here = near;
  }
  const first = flowNextCell(field, nav, here);
  if (first < 0) return false;
  // The building on the next cell, or at a gap too narrow for a body between here and there (review H1).
  const bid = flowStepBuilding(nav, here, first);
  let last = first;
  if (bid !== 0) {
    const b = buildingById(world, bid);
    if (b) {
      targetBuilding[id] = bid;
      steer.x = Math.min(b.maxX, Math.max(b.minX, x));
      steer.y = Math.min(b.maxY, Math.max(b.minY, y));
      return true;
    }
  } else {
    const look = world.balance.zombies.pathing.lookaheadCells;
    for (let k = 1; k < look; k++) {
      const next = flowNextCell(field, nav, last);
      if (next < 0 || flowStepBuilding(nav, last, next) !== 0) break;
      last = next;
    }
  }
  steer.x = flowCellCenterX(nav, last);
  steer.y = flowCellCenterY(nav, last);
  return true;
}

/**
 * Zombies walk straight at the nearest alive player while no building is in the way, and follow
 * the flow field (Story 3.5, `flowField.ts`) when one is; they push each other apart (separation on
 * a 2 m spatial grid), stop when touching a player and hit once per attack interval. A zombie whose
 * next field cell is a building and who touches it hits the building instead (same damage and
 * interval). Velocities are computed for every zombie first, then applied, so the result doesn't
 * depend on iteration order.
 */
export const updateZombies: SystemFn = (world, dtS) => {
  const pool = world.zombies;
  const n = pool.aliveCount;
  const ids = pool.aliveIds;
  const crowd = world.balance.zombies.crowd;
  const { widthM, heightM } = world.map;

  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    pool.prevX[id] = pool.x[id] as number;
    pool.prevY[id] = pool.y[id] as number;
  }
  rebuildGrid(world.zombieGrid, ids, n, pool.x, pool.y);
  collectAlivePlayers(world);
  collectStanding(world); // Story 5.6: the Spitters' target list
  // Story 4.1: map solids count like buildings for the line of sight and the push-out (never attacked).
  const hasBuildings = hasObstacles(world);
  const hasFires = world.decay.fires.length > 0; // Story 4.8
  const flank = world.balance.zombies.flank;
  const flankMaxAge = flowSharedMaxAgeTicks(world);
  const maxFlankTicks = ticksFor(flank.maxFlankS);

  // Pass 1: desired velocity + separation, from positions at the start of the tick.
  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    const stats = world.balance.zombies.types[zombieTypeOf(pool, id)];
    if (!stats) continue;
    const x = pool.x[id] as number;
    const y = pool.y[id] as number;
    let vx = 0;
    let vy = 0;
    // Story 5.9: a spike trap's slow this tick (written by `updateTraps` in the buildings slot; 0 off traps).
    const speedMps = (stats.speedMps * (100 - (pool.slowPct[id] as number))) / 100;

    targetBuilding[id] = 0;
    fieldMode[id] = 0;
    // Story 5.7 (F1): a Brute winding up a swing stands still (no walking, no soft push; the hard
    // overlap pass can still shove it). Story 5.6: a Spitter in range with a clear line stands
    // (winds up / cools down); else it walks.
    // Story 5.8 (FR-A, D8): a swelling Bloater stands still too.
    if ((stats.windupS > 0 && isWindupState(pool.state[id] as number)) || pool.state[id] === ZOMBIE_STATE.SWELL) {
      pool.vx[id] = 0;
      pool.vy[id] = 0;
      continue;
    }
    // Story 6.8 (F6): a stampede Runner runs its lane (no target, no field, no flanking).
    const stampede = pool.state[id] === ZOMBIE_STATE.STAMPEDE;
    // Story 6.8 (F5): a lured zombie walks to the sounding car — unless a standing player is within
    // `distractBreakM` (then it goes for them as usual); a Spitter's windup still plays to its end.
    let lureWalk = false;
    if (!stampede && (pool.lureTicks[id] as number) > 0) {
      pool.lureTicks[id] = (pool.lureTicks[id] as number) - 1;
      // Review L7: only once both lure fields are built (≈ 0.7 s after arming); until then it keeps
      // chasing by the chase field, so a car shot at once never sends zombies straight into the bus.
      lureWalk = world.pathing.lureBuild === LURE_READY && !isRushState(pool.state[id] as number) && !standingWithin(x, y, world.balance.events.carAlarm.distractBreakM);
    }
    const holds = !stampede && !(lureWalk && !isWindupState(pool.state[id] as number)) && stats.spit !== undefined && spitterStep(world, id, stats.radiusM, stats.spit);
    // Story 5.14 (AC 3): held in a bear trap's jaws: no walking, no soft push (a Spitter still spits: above).
    if ((pool.holdTicks[id] as number) > 0) {
      pool.vx[id] = 0;
      pool.vy[id] = 0;
      continue;
    }
    if (stampede) {
      stampedeSteer(world, x, y, stats.radiusM, (world.balance.events.stampede.speedMps * (100 - (pool.slowPct[id] as number))) / 100);
      vx = stampedeVel.x;
      vy = stampedeVel.y;
    } else if (lureWalk && !holds) {
      lureSteer(world, id, x, y, speedMps);
      vx = steer.x;
      vy = steer.y;
    }
    const target = holds || stampede || lureWalk ? null : nearestAlivePlayer(x, y);
    if (target) {
      let dx = target.x - x;
      let dy = target.y - y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d > stats.radiusM + target.radiusM && d > COINCIDENT_M) {
        // Story 4.8: a line through a fire zone counts as blocked too (fire is a flow cost: follow the field).
        const blocked =
          (hasBuildings && segmentHitsBuildings(world, x, y, target.x, target.y, stats.radiusM + LOS_MARGIN_M)) ||
          (hasFires && segmentHitsFire(world, x, y, target.x, target.y, stats.radiusM));
        let steered = false;
        // Story 3.8: a Runner flanks: in front of its target (or blocked) it follows the flank field,
        // which keeps off every player's front cone; close in, outside the cone with a clear line,
        // rushing (FR30) or with no fresh flank field it goes as a Walker.
        // Review H1: flanking is time-limited: after `flank.maxFlankS` spent not closing in, it commits.
        if (
          stats.flanks &&
          !isRushState(pool.state[id] as number) &&
          d > flank.directWithinM &&
          !flankTimeSpent(world, id, d, speedMps * dtS * flank.closingSpeedFrac, maxFlankTicks) &&
          (blocked || (target !== npc && inFlankCone(world, target as PlayerState, x, y))) // 6.10: no aim, no cone
        ) {
          const f = world.pathing.flank;
          if (f.sourceTick >= 0 && world.tick - f.sourceTick <= flankMaxAge) steered = steerByField(world, f, world.pathing.nav, x, y, id);
        }
        // Story 3.5: a building in the way → follow the flow field (straight again once the line is clear).
        // Story 5.7 (D1): a wide body follows the wide chase field on the wide grid.
        if (!steered && blocked) {
          const pa = world.pathing;
          steered = isWideType(world, pool.type[id] as number) ? steerByField(world, pa.wideChase, pa.wide, x, y, id) : steerByField(world, pa.chase, pa.nav, x, y, id);
        }
        if (steered) {
          fieldMode[id] = 1; // review H1: either field (chase or flank) counts for the stuck safety net
          dx = steer.x - x;
          dy = steer.y - y;
          d = Math.sqrt(dx * dx + dy * dy);
        }
        if (d > COINCIDENT_M) {
          vx = (dx / d) * speedMps;
          vy = (dy / d) * speedMps;
        }
      }
    }

    const r = crowd.separationRadiusM;
    const count = queryRadius(world.zombieGrid, pool.x, pool.y, x, y, r, neighbours);
    let px = 0;
    let py = 0;
    for (let k = 0; k < count; k++) {
      const j = neighbours[k] as number;
      if (j === id) continue;
      const ox = x - (pool.x[j] as number);
      const oy = y - (pool.y[j] as number);
      const d = Math.sqrt(ox * ox + oy * oy);
      const w = (r - d) / r;
      if (d < COINCIDENT_M) {
        // Deterministic split: the lower id goes one way, the higher the other.
        const s = id < j ? 1 : -1;
        if ((id + j) % 2 === 0) px += s * w;
        else py += s * w;
      } else {
        px += (ox / d) * w;
        py += (oy / d) * w;
      }
    }
    vx += px * crowd.separationStrength;
    vy += py * crowd.separationStrength;

    const maxSpeed = speedMps * crowd.maxSpeedFactor;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed;
      vy = (vy / speed) * maxSpeed;
    }
    pool.vx[id] = vx;
    pool.vy[id] = vy;
  }

  // Pass 2: move and clamp to the map.
  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    const rz = world.balance.zombies.types[zombieTypeOf(pool, id)]?.radiusM ?? 0;
    pool.x[id] = Math.min(widthM - rz, Math.max(rz, (pool.x[id] as number) + (pool.vx[id] as number) * dtS));
    pool.y[id] = Math.min(heightM - rz, Math.max(rz, (pool.y[id] as number) + (pool.vy[id] as number) * dtS));
  }

  // Pass 3: zombies never stay overlapped (hard rule on top of the soft separation).
  for (let it = 0; it < OVERLAP_ITERATIONS; it++) resolveOverlaps(world);

  // Pass 4: keep out of players (last, so the crowd wraps around them) and attack; then out of
  // buildings, and hit the target building when touching it (Story 3.5).
  let swellDoneCount = 0;
  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    const stats = world.balance.zombies.types[zombieTypeOf(pool, id)];
    if (!stats) continue;
    const rz = stats.radiusM;
    let x = pool.x[id] as number;
    let y = pool.y[id] as number;

    if ((pool.attackCooldownTicks[id] as number) > 0) pool.attackCooldownTicks[id] = (pool.attackCooldownTicks[id] as number) - 1;

    // Story 5.7 (F1, D2): a melee windup on this body's own clock (`spitTicks`: Brutes have no spit).
    const windup = stats.windupS > 0 && isWindupState(pool.state[id] as number);
    if (windup) {
      const left = (pool.spitTicks[id] as number) - 1;
      pool.spitTicks[id] = Math.max(0, left);
      if (left <= 0) resolveSwing(world, id, x, y, stats);
    }

    // Story 5.8 (FR-A): a swelling Bloater's fuse burns on its own clock (not on the tick it started).
    const ex = stats.explodes;
    const swelling = ex !== undefined && pool.state[id] === ZOMBIE_STATE.SWELL;
    if (swelling && tickSwell(world, id)) swellDone[swellDoneCount++] = id;

    // Story 5.14 (AC 3): a held zombie isn't moved by a player body or a push-out; its hold burns
    // one tick per movement tick (it still attacks below).
    const held = (pool.holdTicks[id] as number) > 0;
    if (held) pool.holdTicks[id] = (pool.holdTicks[id] as number) - 1;
    // Story 6.8 (F7): a stampede Runner hits each standing player it touches once, on its own mask; never bites or swings.
    const stampede = pool.state[id] === ZOMBIE_STATE.STAMPEDE;
    if (stampede) stampedeContact(world, id, x, y, rz, CONTACT_EPS_M);
    const target = nearestAlivePlayer(x, y);
    if (target) {
      const contact = rz + target.radiusM;
      let dx = x - target.x;
      let dy = y - target.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < contact && held) {
        d = contact; // in contact for the attack, but the jaws keep it where it is
      } else if (d < contact) {
        if (d < COINCIDENT_M) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        x = target.x + (dx / d) * contact;
        y = target.y + (dy / d) * contact;
        d = contact;
      }
      // Story 5.7 review M1: a target in a slot narrower than the Brute is wound up on from the
      // slot's mouth, inside the long gap reach, with a clear line.
      const gapSwing =
        !stampede &&
        stats.gapReachM > 0 && d > contact + CONTACT_EPS_M && d < stats.gapReachM - stats.swingToleranceM && pool.attackCooldownTicks[id] === 0 && !windup && swingReachFor(world, stats, target) === stats.gapReachM && meleeLineClear(world, x, y, target.x, target.y);
      if (gapSwing && !isWindupState(pool.state[id] as number)) startWindup(world, id, stats);
      if (stampede) {
        // Story 6.8: pushed out of the player above, the hit is `stampedeContact`'s (no shove, D5).
      } else if (ex !== undefined) {
        // Story 5.8 (FR-A): a Bloater never bites: touching a standing player starts its swell.
        if (!swelling && d <= contact + CONTACT_EPS_M) startSwell(world, id, ex);
      } else if (d <= contact + CONTACT_EPS_M && pool.attackCooldownTicks[id] === 0 && !windup) {
        if (stats.windupS > 0) {
          // Story 5.7 (F1): touch → stand and wind up; the hit is decided at its end (`resolveSwing`).
          if (!isWindupState(pool.state[id] as number)) startWindup(world, id, stats);
        } else {
          pool.attackCooldownTicks[id] = ticksFor(stats.attackIntervalS);
          damagePlayer(world, target, stats, id);
          if (stats.flanks) resetFlankTime(world, id); // review H1: it bit: a new commitment starts
        }
      }
    }
    let pushStuck = false;
    if (held) {
      // Story 5.14: pinned where it was caught (a legal spot: floor; nothing solid is placed mid-wave).
    } else if (hasBuildings) {
      // Story 3.4: buildings (and the map edge) have the last word: they slide along, never pass a
      // slot narrower than their body, and a zombie shoved into a box by a player leaves on the side
      // it came from (its position at the start of the tick, outside every box; review H1, M1).
      pushStuck = pushOutOfBuildings(world, x, y, rz, pool.prevX[id] as number, pool.prevY[id] as number) === PUSH_STUCK;
      x = pushed.x;
      y = pushed.y;
    } else {
      x = Math.min(widthM - rz, Math.max(rz, x));
      y = Math.min(heightM - rz, Math.max(rz, y));
    }
    pool.x[id] = x;
    pool.y[id] = y;

    // Story 3.5: blocked by a building and touching it → hit it (a player in contact went first:
    // that hit set the cooldown). At 0 HP `damageBuilding` removes it and emits building.destroyed.
    let bid = targetBuilding[id] as number;
    // Review L1 (5.14, "caught by the leg, not stunned"): a held zombie hits a wall building it touches
    // (a barricade or turret in reach) at its normal rate (a Brute ×3); floor buildings are never hit.
    if (held && bid === 0 && hasBuildings && !stampede) bid = touchingBuilding(world, x, y, rz + CONTACT_EPS_M); // Story 6.8 (D5): Runners never hit buildings
    // Review H1 safety net: following the field but the push-out can't place it (wedged against
    // buildings) → the building it touches is the target, whatever the field says. Re-review: the
    // "no progress for stuckTicks" trigger was dropped — in a crowd, zombies held back by other
    // zombies looked stuck and smashed walls and turrets they could walk around (60 Walkers
    // destroyed a 4 m wall in the open). Pinch-aware fields alone resolved 324/324 fuzz layouts.
    if (bid === 0 && fieldMode[id] === 1 && hasBuildings && pushStuck) {
      bid = touchingBuilding(world, x, y, rz + CONTACT_EPS_M);
    }
    if (bid !== 0 && ex !== undefined) {
      // Story 5.8: a Bloater blocked by a building it touches swells there (its blast hits the wall: D3).
      const b = buildingById(world, bid);
      if (b && pool.state[id] !== ZOMBIE_STATE.SWELL && distanceToBox(x, y, b.minX, b.minY, b.maxX, b.maxY) <= rz + CONTACT_EPS_M) startSwell(world, id, ex);
    } else if (bid !== 0 && pool.attackCooldownTicks[id] === 0 && !(stats.windupS > 0 && isWindupState(pool.state[id] as number))) {
      const b = buildingById(world, bid);
      if (b && distanceToBox(x, y, b.minX, b.minY, b.maxX, b.maxY) <= rz + CONTACT_EPS_M) {
        pool.attackCooldownTicks[id] = ticksFor(stats.attackIntervalS);
        // Story 5.7 (F5): Brutes hit buildings 3× (no windup on buildings).
        damageBuilding(world, b, stats.damage * stats.buildingDamageMult);
        if (stats.buildingDamageMult > 1) bruteStats.buildingHits++;
      }
    }
  }
  // Story 5.8 (FR-A, D6): burnt-out swells burst now, exactly `swellS` after they started, in pass
  // order (after the loop: a blast's kills must not disturb the alive list mid-pass).
  for (let k = 0; k < swellDoneCount; k++) killZombie(world, swellDone[k] as number, null, BLOATER_SWELL_WEAPON);
  if (swellDoneCount > 0) burstBurntSwells(world); // review L2: swells killed by an earlier swell's blast this tick
  // Story 5.9 review L1 (F7 "same tick"): mines check their trigger again on the bodies' new
  // positions, so a zombie that walks into a trigger circle sets the mine off this tick (the
  // buildings-slot pass before combat catches bodies that were already there: never twice).
  updateMines(world);
  catchOnBearTraps(world); // Story 5.14: the same rule for bear-trap plates (catch on the new positions)
};

/** Story 5.7: a zombie of a windup type touches a standing player with its attack ready: it winds up (state + its own clock). */
function startWindup(world: World, id: number, stats: Readonly<ZombieTypeStats>): void {
  const pool = world.zombies;
  pool.state[id] = isRushState(pool.state[id] as number) ? ZOMBIE_STATE.RUSH_WINDUP : ZOMBIE_STATE.WINDUP;
  pool.spitTicks[id] = Math.max(1, ticksFor(stats.windupS));
  bruteStats.windups++;
}

/**
 * Story 5.7: the swing's reach (centre to centre) on player p: contact + `swingReachM`, or, when p
 * stands in a slot narrower than the Brute (review M1: the wide field is seeded from the slot's
 * mouth, `wideGapRing` ≥ 2), the long `gapReachM`.
 */
function swingReachFor(world: World, stats: Readonly<ZombieTypeStats>, p: ChaseTarget): number {
  const normal = stats.radiusM + p.radiusM + stats.swingReachM;
  if (stats.gapReachM <= normal || !stats.wideBody) return normal;
  return wideGapRing(world, p.x, p.y) >= 2 ? stats.gapReachM : normal;
}

/**
 * Story 5.7 (F1): the end of a windup. The swing lands on the nearest standing player whose centre
 * is closer than its reach (`swingReachFor`) minus `swingToleranceM` (review L1: a body exactly
 * `swingReachM` out — a step back, or the axe's 0.3 m knock during the windup — is always missed),
 * with a clear line (`meleeLineClear`: never through a wall, car or barricade); the attack interval
 * runs either way.
 */
function resolveSwing(world: World, id: number, x: number, y: number, stats: Readonly<ZombieTypeStats>): void {
  const pool = world.zombies;
  pool.state[id] = isRushState(pool.state[id] as number) ? ZOMBIE_STATE.RUSH : ZOMBIE_STATE.CHASE;
  pool.attackCooldownTicks[id] = ticksFor(stats.attackIntervalS);
  const p = nearestAlivePlayer(x, y);
  if (p) {
    const dx = p.x - x;
    const dy = p.y - y;
    const reach = swingReachFor(world, stats, p) - stats.swingToleranceM;
    if (dx * dx + dy * dy < reach * reach && meleeLineClear(world, x, y, p.x, p.y)) {
      bruteStats.hits++;
      damagePlayer(world, p, stats, id);
      return;
    }
  }
  bruteStats.misses++;
}

/**
 * Id of the nearest WALL building within `reach` of (x, y) (ties: the lower id), or 0: the stuck
 * safety net's target. Exported for Story 5.9's floor test (zombies never attack a trap or a mine).
 */
export function touchingBuilding(world: World, x: number, y: number, reach: number): number {
  const list = world.buildings.list;
  let best = 0;
  let bestD = reach;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (!b.solid) continue; // Story 5.9: zombies never attack floor (traps, mines)
    const d = distanceToBox(x, y, b.minX, b.minY, b.maxX, b.maxY);
    if (d <= bestD && (best === 0 || d < bestD)) {
      best = b.id;
      bestD = d;
    }
  }
  return best;
}

/**
 * 3.8 review H1: a flanker's time budget. Counts the ticks it gets closer to its target by less than
 * `minClosingM` (circling the cone's rim, or held up); true once `maxTicks` are spent — then it goes
 * straight in (Walker rule) until it bites (`resetFlankTime`) or dies (a new generation starts over).
 * Only called while it is eligible to flank (not rushing, farther than `directWithinM`).
 */
function flankTimeSpent(world: World, id: number, d: number, minClosingM: number, maxTicks: number): boolean {
  const pr = world.pathing.progress;
  if (id >= pr.flankTicks.length) return false; // a World without pathing
  const gen = world.zombies.generation[id] as number;
  if (pr.flankGen[id] !== gen) {
    pr.flankGen[id] = gen;
    pr.flankTicks[id] = 0;
    pr.flankLastD[id] = d;
    return false;
  }
  let t = pr.flankTicks[id] as number;
  const closed = (pr.flankLastD[id] as number) - d;
  pr.flankLastD[id] = d;
  if (t >= maxTicks) return true;
  if (closed < minClosingM) {
    t++;
    pr.flankTicks[id] = t;
  }
  return t >= maxTicks;
}

function resetFlankTime(world: World, id: number): void {
  const pr = world.pathing.progress;
  if (id >= pr.flankTicks.length) return;
  pr.flankGen[id] = world.zombies.generation[id] as number;
  pr.flankTicks[id] = 0;
  pr.flankLastD[id] = 0;
}


/**
 * Hard rule on top of the soft separation: two zombies never stay overlapped. Each overlapping pair
 * (handled once: by the bigger body, equal bodies by the lower id) is pushed apart, the overlap
 * split by body area (Story 5.7; equal bodies: half each), then clamped to the map.
 * The soft push alone loses against the pressure of a big crowd chasing one player.
 */
function resolveOverlaps(world: World): void {
  const pool = world.zombies;
  const ids = pool.aliveIds;
  const n = pool.aliveCount;
  const { widthM, heightM } = world.map;
  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    const ri = world.balance.zombies.types[zombieTypeOf(pool, id)]?.radiusM ?? 0;
    const qr = ri * 2 + OVERLAP_QUERY_MARGIN_M;
    const count = queryRadius(world.zombieGrid, pool.x, pool.y, pool.x[id] as number, pool.y[id] as number, qr, neighbours);
    for (let k = 0; k < count; k++) {
      const j = neighbours[k] as number;
      const rj = world.balance.zombies.types[zombieTypeOf(pool, j)]?.radiusM ?? 0;
      // Each pair once: by the bigger body (its query reaches the smaller one; Story 5.7), equal
      // bodies by the lower id (as before).
      if (rj > ri || (rj === ri && j <= id)) continue;
      const ox = (pool.x[id] as number) - (pool.x[j] as number);
      const oy = (pool.y[id] as number) - (pool.y[j] as number);
      const d = Math.sqrt(ox * ox + oy * oy);
      const overlap = ri + rj - d;
      if (overlap <= 0) continue;
      let ux: number;
      let uy: number;
      if (d < COINCIDENT_M) {
        ux = (id + j) % 2 === 0 ? 1 : 0;
        uy = 1 - ux;
      } else {
        ux = ox / d;
        uy = oy / d;
      }
      // Story 5.7 (F4): split by body area — i moves rj² / (ri² + rj²) of the overlap (equal radii: ½ each, as before).
      let hi = overlap / 2;
      let hj = hi;
      // Story 5.8 (FR-A): a swelling Bloater is not pushed by the crowd: the other body moves it all.
      // Story 5.14 (AC 3): nor is a zombie held in a bear trap (two pinned bodies: neither moves).
      const fi = pool.state[id] === ZOMBIE_STATE.SWELL || (pool.holdTicks[id] as number) > 0;
      const fj = pool.state[j] === ZOMBIE_STATE.SWELL || (pool.holdTicks[j] as number) > 0;
      if (fi && fj) {
        hi = 0;
        hj = 0;
      } else if (fi !== fj) {
        hi = fi ? 0 : overlap;
        hj = overlap - hi;
      } else if (ri !== rj) {
        const ai = ri * ri;
        const aj = rj * rj;
        hi = (overlap * aj) / (ai + aj);
        hj = overlap - hi;
      }
      pool.x[id] = Math.min(widthM - ri, Math.max(ri, (pool.x[id] as number) + ux * hi));
      pool.y[id] = Math.min(heightM - ri, Math.max(ri, (pool.y[id] as number) + uy * hi));
      pool.x[j] = Math.min(widthM - rj, Math.max(rj, (pool.x[j] as number) - ux * hj));
      pool.y[j] = Math.min(heightM - rj, Math.max(rj, (pool.y[j] as number) - uy * hj));
    }
  }
}
