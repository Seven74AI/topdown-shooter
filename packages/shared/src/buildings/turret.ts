import type { Balance } from "../config/balance";
import type { TurretStats } from "../config/balanceSchema";
import type { World } from "../core/world";
import { queryRadius } from "../core/spatialGrid";
import { zombieCandidates as candidates } from "../combat/scratch";
import { cooldownIdle, cooldownReady, cooldownTickEnd, cooldownTickStart } from "../combat/cooldown";
import { spawnProjectile, type ProjectileSpawn } from "../combat/projectilePool";
import { isZombieAlive } from "../zombies/zombiePool";
import { shotLineClear } from "../combat/cover";
import { buildingStats, buildingTypeIds, type Building } from "./buildings";

/**
 * Story 3.6: auto-turrets (GDD › Buildings and Defenses: nearest zombie within 8 m, 3 damage × 5/s).
 *
 * Runs in the `buildings` slot (`updateBuildings`, after Story 3.5's pathing), before combat, so its
 * shots fly in this tick's combat like a player's. It reads the zombies' current positions; the
 * spatial grid there is last tick's (rebuilt at the start of combat), so the query is widened by
 * `GRID_STALE_MARGIN_M` and the range is checked exactly on the current positions. Only during a wave (`run.phase === "wave"`); otherwise
 * the cooldown idles. A building type shoots when it has a `turret` block in `buildings.json`.
 *
 * Each ready turret takes the nearest alive zombie whose centre is within `rangeM` of the turret's
 * centre (spatial grid; ties: the lower pool slot), aims at it with a first-order lead (its last-tick
 * displacement × the shot's flight ticks), turns instantly, spawns a server projectile tagged with
 * its building id and emits `turret.fired`. Fire rate: the shared cooldown rule (`cooldown.ts`).
 * Turret hits give no assist credit; kills pay the owner `economy.buildingKillShare` (economy).
 * No allocation per tick except the event object of each shot.
 */

const MIN_AIM = 1e-6;
/**
 * The grid's cell lists are one tick old here: a zombie moves far less than this per tick (Walkers
 * 1.2 m/s × crowd factor 2 = 0.12 m), so widening the query by 1 m finds every zombie whose
 * current centre is in range.
 */
const GRID_STALE_MARGIN_M = 1;

const spawn: ProjectileSpawn = {
  x: 0,
  y: 0,
  dirX: 1,
  dirY: 0,
  speedMps: 0,
  rangeM: 0,
  damage: 0,
  pierce: 1,
  weaponIndex: 0,
  owner: null,
  advanceM: 0,
  building: 0,
  pushbackM: 0,
};

/** The turret block of a building type, or undefined for a building that never shoots. */
export function turretStats(balance: Balance, type: string): Readonly<TurretStats> | undefined {
  return buildingStats(balance, type)?.turret;
}

export const buildingCentreX = (b: Readonly<Building>): number => (b.minX + b.maxX) / 2;
export const buildingCentreY = (b: Readonly<Building>): number => (b.minY + b.maxY) / 2;

/**
 * The nearest alive zombie whose centre is within `rangeM` of (x, y), or -1. Ties (equal squared
 * distance) go to the lower pool slot, so the choice never depends on grid order. Story 4.2: only
 * zombies with a clear shot line from (x, y) (no car, bus or map box between) count.
 */
export function nearestZombieInRange(world: Readonly<World>, x: number, y: number, rangeM: number): number {
  const z = world.zombies;
  if (z.aliveCount === 0) return -1;
  const n = queryRadius(world.zombieGrid, z.x, z.y, x, y, rangeM + GRID_STALE_MARGIN_M, candidates);
  const r2 = rangeM * rangeM;
  let best = -1;
  let bestD2 = Infinity;
  for (let k = 0; k < n; k++) {
    const id = candidates[k] as number;
    if (!isZombieAlive(z, id)) continue;
    const dx = (z.x[id] as number) - x;
    const dy = (z.y[id] as number) - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    if (d2 < bestD2 || (d2 === bestD2 && id < best)) {
      if (!shotLineClear(world, x, y, z.x[id] as number, z.y[id] as number)) continue; // Story 4.2: no shots into cover
      best = id;
      bestD2 = d2;
    }
  }
  return best;
}

/** One turret's tick. Returns true if it fired. */
function updateTurret(world: World, b: Building, t: Readonly<TurretStats>, typeIndex: number, dtS: number): boolean {
  b.fireCooldownS = cooldownTickStart(b.fireCooldownS, dtS);
  let fired = false;
  if (cooldownReady(b.fireCooldownS)) {
    const cx = buildingCentreX(b);
    const cy = buildingCentreY(b);
    const target = nearestZombieInRange(world, cx, cy, t.rangeM);
    if (target >= 0) {
      const z = world.zombies;
      const zx = z.x[target] as number;
      const zy = z.y[target] as number;
      // First-order lead: where the zombie will be after the flight, at its last-tick velocity.
      const dist = Math.sqrt((zx - cx) * (zx - cx) + (zy - cy) * (zy - cy));
      const flightTicks = Math.max(0, dist - t.muzzleM) / (t.projectileSpeedMps * dtS);
      let ax = zx + ((zx - (z.prevX[target] as number)) * flightTicks) - cx;
      let ay = zy + ((zy - (z.prevY[target] as number)) * flightTicks) - cy;
      let al = Math.sqrt(ax * ax + ay * ay);
      if (al < MIN_AIM) {
        ax = zx - cx;
        ay = zy - cy;
        al = Math.sqrt(ax * ax + ay * ay);
      }
      if (al >= MIN_AIM) {
        const dx = ax / al;
        const dy = ay / al;
        b.aimX = dx;
        b.aimY = dy;
        spawn.x = cx + dx * t.muzzleM;
        spawn.y = cy + dy * t.muzzleM;
        spawn.dirX = dx;
        spawn.dirY = dy;
        spawn.speedMps = t.projectileSpeedMps;
        spawn.rangeM = t.projectileRangeM;
        spawn.damage = t.damage;
        spawn.weaponIndex = typeIndex;
        spawn.owner = b.ownerId;
        spawn.building = b.id;
        spawn.pushbackM = t.hitPushbackM;
        if (spawnProjectile(world.projectiles, spawn) >= 0) {
          fired = true;
          world.events.emit({ type: "turret.fired", buildingId: b.id, x: spawn.x, y: spawn.y, dirX: dx, dirY: dy });
        }
        spawn.owner = null;
      }
    }
  }
  b.fireCooldownS = cooldownTickEnd(b.fireCooldownS, fired, t.rateHz);
  return fired;
}

/** Every turret's tick (called by `updateCombat` after the zombie grid rebuild). */
export function updateTurrets(world: World, dtS: number): void {
  const list = world.buildings.list;
  if (list.length === 0) return;
  const wave = world.run.phase === "wave";
  const ids = buildingTypeIds(world.balance);
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    const t = turretStats(world.balance, b.type);
    if (!t) continue;
    if (!wave) {
      b.fireCooldownS = cooldownIdle(b.fireCooldownS, dtS);
      continue;
    }
    updateTurret(world, b, t, ids.indexOf(b.type), dtS);
  }
}
