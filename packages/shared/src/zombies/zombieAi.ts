import { ticksFor } from "../core/time";
import { queryRadius, rebuildGrid } from "../core/spatialGrid";
import type { SystemFn } from "../core/systems";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { downPlayer } from "../player/downed";
import { slowPlayer } from "../player/slow";
import type { ZombieTypeStats } from "../config/balanceSchema";
import { zombieTypeOf } from "./zombiePool";
import { PUSH_STUCK, distanceToBox, hasObstacles, pushOutOfBuildings, pushed, segmentHitsBuildings } from "../buildings/collision";
import { buildingById, damageBuilding, type Building } from "../buildings/buildings";
import { ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { flowCellAt, flowCellCenterX, flowCellCenterY, flowNextCell, flowSharedMaxAgeTicks, flowStepBuilding, inFlankCone, type FlowField } from "./flowField";
import { ZOMBIE_STATE } from "./zombieTypes";
import { segmentHitsFire } from "../decay/fire";

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
/** `steerByField` result (synchronous, one record). */
const steer = { x: 0, y: 0 };
/** Alive players this tick, rebuilt at the top of the system (no iterator allocation per zombie). */
const alivePlayers: PlayerState[] = [];

function collectAlivePlayers(world: World): void {
  alivePlayers.length = 0;
  world.players.forEach((p) => {
    if (p.status === "alive") alivePlayers.push(p);
  });
}

/** Nearest alive player to (x, y), or null. Ties keep the first player in insertion order. */
function nearestAlivePlayer(x: number, y: number): PlayerState | null {
  let best: PlayerState | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < alivePlayers.length; i++) {
    const p = alivePlayers[i] as PlayerState;
    if (p.status !== "alive") continue; // may go down mid-tick
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

/** One zombie hit: damage, and the type's bite slow (Story 3.9: Crawlers). */
function damagePlayer(world: World, p: PlayerState, stats: Readonly<ZombieTypeStats>, sourceZombieId: number): void {
  if (p.status !== "alive" || world.debug.godMode) return; // god mode: dev cheat / ?stress (Story 1.11)
  const amount = stats.damage;
  if (stats.biteSlowPct > 0) slowPlayer(p, stats.biteSlowPct, ticksFor(stats.biteSlowS));
  p.hp = Math.max(0, p.hp - amount);
  world.events.emit({ type: "player.damaged", playerId: p.id, amount, sourceZombieId });
  if (p.hp <= 0) downPlayer(world, p); // Story 2.8: down, not dead; zombies then ignore them
}

/**
 * Story 3.5: where a zombie at (x, y) whose straight line is blocked steers: the centre of the cell
 * `lookaheadCells` steps down the flow field, stopping before a building cell. When the very next
 * cell belongs to a building, that building becomes the zombie's target (it attacks it on contact)
 * and the zombie steers at the nearest point of its box (straight at the face: never along it into
 * the gap between two buildings). False when there is no field there yet (then it walks straight).
 */
function steerByField(world: World, field: FlowField, x: number, y: number, id: number): boolean {
  const nav = world.pathing.nav;
  if (field.sourceTick < 0) return false;
  const here = flowCellAt(nav, x, y);
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
    const target = nearestAlivePlayer(x, y);
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
          pool.state[id] !== ZOMBIE_STATE.RUSH &&
          d > flank.directWithinM &&
          !flankTimeSpent(world, id, d, speedMps * dtS * flank.closingSpeedFrac, maxFlankTicks) &&
          (blocked || inFlankCone(world, target, x, y))
        ) {
          const f = world.pathing.flank;
          if (f.sourceTick >= 0 && world.tick - f.sourceTick <= flankMaxAge) steered = steerByField(world, f, x, y, id);
        }
        // Story 3.5: a building in the way → follow the flow field (straight again once the line is clear).
        if (!steered && blocked) steered = steerByField(world, world.pathing.chase, x, y, id);
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
  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    const stats = world.balance.zombies.types[zombieTypeOf(pool, id)];
    if (!stats) continue;
    const rz = stats.radiusM;
    let x = pool.x[id] as number;
    let y = pool.y[id] as number;

    if ((pool.attackCooldownTicks[id] as number) > 0) pool.attackCooldownTicks[id] = (pool.attackCooldownTicks[id] as number) - 1;

    const target = nearestAlivePlayer(x, y);
    if (target) {
      const contact = rz + target.radiusM;
      let dx = x - target.x;
      let dy = y - target.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < contact) {
        if (d < COINCIDENT_M) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        x = target.x + (dx / d) * contact;
        y = target.y + (dy / d) * contact;
        d = contact;
      }
      if (d <= contact + CONTACT_EPS_M && pool.attackCooldownTicks[id] === 0) {
        pool.attackCooldownTicks[id] = ticksFor(stats.attackIntervalS);
        damagePlayer(world, target, stats, id);
        if (stats.flanks) resetFlankTime(world, id); // review H1: it bit: a new commitment starts
      }
    }
    let pushStuck = false;
    if (hasBuildings) {
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
    // Review H1 safety net: following the field but the push-out can't place it (wedged against
    // buildings) → the building it touches is the target, whatever the field says. Re-review: the
    // "no progress for stuckTicks" trigger was dropped — in a crowd, zombies held back by other
    // zombies looked stuck and smashed walls and turrets they could walk around (60 Walkers
    // destroyed a 4 m wall in the open). Pinch-aware fields alone resolved 324/324 fuzz layouts.
    if (bid === 0 && fieldMode[id] === 1 && hasBuildings && pushStuck) {
      bid = touchingBuilding(world, x, y, rz + CONTACT_EPS_M);
    }
    if (bid !== 0 && pool.attackCooldownTicks[id] === 0) {
      const b = buildingById(world, bid);
      if (b && distanceToBox(x, y, b.minX, b.minY, b.maxX, b.maxY) <= rz + CONTACT_EPS_M) {
        pool.attackCooldownTicks[id] = ticksFor(stats.attackIntervalS);
        damageBuilding(world, b, stats.damage);
      }
    }
  }
};

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
 * (handled once, lower id first) is pushed apart by half the overlap each, then clamped to the map.
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
      if (j <= id) continue;
      const rj = world.balance.zombies.types[zombieTypeOf(pool, j)]?.radiusM ?? 0;
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
      const h = overlap / 2;
      pool.x[id] = Math.min(widthM - ri, Math.max(ri, (pool.x[id] as number) + ux * h));
      pool.y[id] = Math.min(heightM - ri, Math.max(ri, (pool.y[id] as number) + uy * h));
      pool.x[j] = Math.min(widthM - rj, Math.max(rj, (pool.x[j] as number) - ux * h));
      pool.y[j] = Math.min(heightM - rj, Math.max(rj, (pool.y[j] as number) - uy * h));
    }
  }
}
