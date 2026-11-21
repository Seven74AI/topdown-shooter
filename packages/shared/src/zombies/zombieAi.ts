import { queryRadius, rebuildGrid } from "../core/spatialGrid";
import type { SystemFn } from "../core/systems";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { zombieTypeOf } from "./zombiePool";

/** Neighbours considered per zombie for separation (scratch buffer, never allocated per tick). */
const MAX_NEIGHBOURS = 32;
const neighbours = new Int32Array(MAX_NEIGHBOURS);
/** Below this distance two zombies count as coincident and are pushed along a fixed axis. */
const COINCIDENT_M = 1e-4;
/** Contact tolerance: a zombie resting against a player still counts as touching. */
const CONTACT_EPS_M = 0.02;

/** Nearest alive player to (x, y), or null. Ties keep the first player in insertion order. */
function nearestAlivePlayer(world: World, x: number, y: number): PlayerState | null {
  let best: PlayerState | null = null;
  let bestD2 = Infinity;
  for (const p of world.players.values()) {
    if (p.status !== "alive") continue;
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

function damagePlayer(world: World, p: PlayerState, amount: number, sourceZombieId: number): void {
  if (p.status !== "alive") return;
  p.hp = Math.max(0, p.hp - amount);
  world.events.emit({ type: "player.damaged", playerId: p.id, amount, sourceZombieId });
  if (p.hp <= 0) {
    p.status = "dead";
    world.events.emit({ type: "player.died", playerId: p.id });
  }
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

  // Pass 1: desired velocity + separation, from positions at the start of the tick.
  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    const stats = world.balance.zombies.types[zombieTypeOf(pool, id)];
    if (!stats) continue;
    const x = pool.x[id] as number;
    const y = pool.y[id] as number;
    let vx = 0;
    let vy = 0;

    const target = nearestAlivePlayer(world, x, y);
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

  // Pass 2: move, keep out of players, attack.
  for (let i = 0; i < n; i++) {
    const id = ids[i] as number;
    const stats = world.balance.zombies.types[zombieTypeOf(pool, id)];
    if (!stats) continue;
    const rz = stats.radiusM;
    let x = Math.min(widthM - rz, Math.max(rz, (pool.x[id] as number) + (pool.vx[id] as number) * dtS));
    let y = Math.min(heightM - rz, Math.max(rz, (pool.y[id] as number) + (pool.vy[id] as number) * dtS));

    pool.attackCooldownS[id] = Math.max(0, (pool.attackCooldownS[id] as number) - dtS);

    const target = nearestAlivePlayer(world, x, y);
    if (target) {
      const contact = rz + target.radiusM;
      let dx = x - target.x;
      let dy = y - target.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < contact) {
        // Wrap around the player instead of overlapping them.
        if (d < COINCIDENT_M) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        x = target.x + (dx / d) * contact;
        y = target.y + (dy / d) * contact;
        d = contact;
      }
      if (d <= contact + CONTACT_EPS_M && (pool.attackCooldownS[id] as number) <= 0) {
        pool.attackCooldownS[id] = stats.attackIntervalS;
        damagePlayer(world, target, stats.damage, id);
      }
    }
    pool.x[id] = x;
    pool.y[id] = y;
  }
};
