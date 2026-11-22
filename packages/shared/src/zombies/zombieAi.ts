import { ticksFor } from "../core/time";
import { queryRadius, rebuildGrid } from "../core/spatialGrid";
import type { SystemFn } from "../core/systems";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { downPlayer } from "../player/downed";
import { slowPlayer } from "../player/slow";
import type { ZombieTypeStats } from "../config/balanceSchema";
import { zombieTypeOf } from "./zombiePool";
import { pushOutOfBuildings, pushed } from "../buildings/collision";

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
 * Walkers walk straight at the nearest alive player (flow fields arrive in Story 3.5), push each
 * other apart (separation on a 2 m spatial grid), stop when touching a player and hit once per
 * attack interval. Velocities are computed for every zombie first, then applied, so the result
 * doesn't depend on iteration order.
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

  // Pass 1: desired velocity + separation, from positions at the start of the tick.
  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    const stats = world.balance.zombies.types[zombieTypeOf(pool, id)];
    if (!stats) continue;
    const x = pool.x[id] as number;
    const y = pool.y[id] as number;
    let vx = 0;
    let vy = 0;

    const target = nearestAlivePlayer(x, y);
    if (target) {
      const dx = target.x - x;
      const dy = target.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > stats.radiusM + target.radiusM && d > COINCIDENT_M) {
        vx = (dx / d) * stats.speedMps;
        vy = (dy / d) * stats.speedMps;
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

    const maxSpeed = stats.speedMps * crowd.maxSpeedFactor;
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

  // Pass 4: keep out of players (last, so the crowd wraps around them) and attack; then out of buildings.
  const hasBuildings = world.buildings.list.length > 0;
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
      }
    }
    if (hasBuildings) {
      // Story 3.4: buildings (and the map edge) have the last word: they slide along, never pass a
      // slot narrower than their body, and a zombie shoved into a box by a player leaves on the side
      // it came from (its position at the start of the tick, outside every box; review H1, M1).
      pushOutOfBuildings(world, x, y, rz, pool.prevX[id] as number, pool.prevY[id] as number);
      pool.x[id] = pushed.x;
      pool.y[id] = pushed.y;
      continue;
    }
    // The push-out can cross a wall: clamp again (a little overlap at walls beats leaving the map).
    pool.x[id] = Math.min(widthM - rz, Math.max(rz, x));
    pool.y[id] = Math.min(heightM - rz, Math.max(rz, y));
  }
};

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
