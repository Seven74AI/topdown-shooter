import { queryRadius, rebuildGrid } from "../core/spatialGrid";
import { ticksFor } from "../core/time";
import type { SystemFn } from "../core/systems";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { DEG_TO_RAD, len, rotate } from "../math/vec";
import { segmentCircleT } from "../math/sweep";
import { isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { applyZombieDamage } from "./damage";
import { assistAim } from "./aimAssist";
import { zombieCandidates as candidates } from "./scratch";
import { activeSlot } from "./loadout";
import {
  freeProjectile,
  projectileHasHit,
  recordProjectileHit,
  spawnProjectile,
  type ProjectileSpawn,
} from "./projectilePool";
import { swingMelee } from "./melee";
import { isGun, isMelee, weaponIds, weaponStats } from "./weapons";

/** Cooldowns within this of zero count as ready (float rounding of `+= 1/rateHz`). */
const COOLDOWN_EPS_S = 1e-6;
/** Projectiles spawn just outside the shooter's body. */
const MUZZLE_OFFSET_M = 0.1;
const MIN_AIM = 1e-6;

// Sized to the whole zombie pool, so a candidate query can never be truncated.
const hitT = new Float32Array(ZOMBIE_POOL_CAPACITY);
const hitId = new Int32Array(ZOMBIE_POOL_CAPACITY);
const dir = { x: 0, y: 0 };
const spawn: ProjectileSpawn = { x: 0, y: 0, dirX: 0, dirY: 0, speedMps: 0, rangeM: 0, damage: 0, pierce: 1, weaponIndex: 0, owner: null };

/**
 * Fire cooldown: counts down every tick and may end slightly negative while the trigger is held, so
 * `cooldownS += 1 / rateHz` keeps the exact average rate (3/s fires every 6.67 ticks on average).
 * Any tick without a shot clamps it back to ≥ 0, so an idle player can't save up a burst; it never
 * goes below −dt (at most one shot per tick).
 */
function updatePlayerWeapon(world: World, p: PlayerState, dtS: number): void {
  if (updateSwap(world, p)) {
    activeSlot(p.loadout).cooldownS = Math.max(0, activeSlot(p.loadout).cooldownS - dtS);
    return; // neither weapon fires during a swap (FR5)
  }
  const slot = activeSlot(p.loadout);
  // Only a cooldown that was still running can go below zero (the part of this tick since it ended);
  // a weapon that was already ready carries no credit.
  if (slot.cooldownS > 0) slot.cooldownS = Math.max(-dtS, slot.cooldownS - dtS);
  if (!tryFire(world, p, slot.cooldownS)) slot.cooldownS = Math.max(0, slot.cooldownS);
}

/**
 * Weapon swap (FR5): a swap tap with a second weapon starts a `balance.player.swapS` swap (0.3 s);
 * swapping away cancels a reload in progress; when the swap ends the other slot becomes active and,
 * if its magazine is empty, a full reload starts. Taps during a swap or with one weapon are ignored.
 * Returns true while swapping (no firing this tick).
 */
function updateSwap(world: World, p: PlayerState): boolean {
  const lo = p.loadout;
  if (lo.swapTicks > 0) {
    lo.swapTicks--;
    if (lo.swapTicks === 0) {
      lo.active = lo.active === 0 ? 1 : 0;
      const slot = activeSlot(lo);
      world.events.emit({ type: "weapon.swapped", playerId: p.id, active: lo.active, weapon: slot.weapon });
      const stats = weaponStats(world.balance, slot.weapon);
      if (isGun(stats) && slot.ammo === 0 && slot.reloadTicks === 0) {
        slot.reloadTicks = ticksFor(stats.reloadS);
        world.events.emit({ type: "weapon.reload_started", playerId: p.id, weapon: slot.weapon, reloadS: stats.reloadS });
      }
      return false; // the new weapon may fire from this tick
    }
    return true;
  }
  const input = world.inputs.get(p.id);
  if (!input?.swap || !lo.slots[1] || p.status !== "alive") return false;
  const current = activeSlot(lo);
  current.reloadTicks = 0; // swapping away cancels the reload
  lo.swapTicks = ticksFor(world.balance.player.swapS);
  world.events.emit({ type: "weapon.swap_started", playerId: p.id });
  return true;
}

/** Handles reload and firing (or a melee swing) for this tick. Returns true if the weapon attacked. */
function tryFire(world: World, p: PlayerState, cooldownS: number): boolean {
  const slot = activeSlot(p.loadout);
  const stats = weaponStats(world.balance, slot.weapon);

  if (slot.reloadTicks > 0) {
    slot.reloadTicks--;
    if (slot.reloadTicks === 0 && isGun(stats)) {
      slot.ammo = stats.magazine;
      world.events.emit({ type: "weapon.reloaded", playerId: p.id, weapon: slot.weapon });
    }
    return false; // no firing while reloading (including the tick the reload ends)
  }
  if (p.status !== "alive") return false;

  const input = world.inputs.get(p.id);
  if (!input || !input.fire) return false;
  const aimLen = len(input.aimX, input.aimY);
  if (aimLen < MIN_AIM || cooldownS > COOLDOWN_EPS_S) return false;
  dir.x = input.aimX / aimLen;
  dir.y = input.aimY / aimLen;
  if (isMelee(stats)) {
    // Melee (Story 1.9): instant arc hit along the raw aim, no ammo, no reload, no aim assist.
    swingMelee(world, p, slot.weapon, stats, dir.x, dir.y);
    slot.cooldownS += 1 / stats.rateHz;
    return true;
  }
  if (slot.ammo <= 0) return false;

  // Aim assist on touch only (FR4), before spread; mouse aim is never assisted.
  const offset = p.radiusM + MUZZLE_OFFSET_M;
  if (!input.isMouse) assistAim(world, p.x + dir.x * offset, p.y + dir.y * offset, dir.x, dir.y, stats.rangeM, dir);
  if (stats.spreadDeg > 0) {
    const half = (stats.spreadDeg / 2) * DEG_TO_RAD;
    rotate(dir.x, dir.y, world.rng.range(-half, half), dir);
  }

  spawn.x = p.x + dir.x * offset;
  spawn.y = p.y + dir.y * offset;
  spawn.dirX = dir.x;
  spawn.dirY = dir.y;
  spawn.speedMps = stats.projectileSpeedMps;
  spawn.rangeM = stats.rangeM;
  spawn.damage = stats.damage;
  spawn.pierce = stats.pierce;
  spawn.weaponIndex = weaponIds(world.balance).indexOf(slot.weapon);
  spawn.owner = p.id;
  spawnProjectile(world.projectiles, spawn);

  slot.ammo--;
  slot.cooldownS += 1 / stats.rateHz;
  world.events.emit({ type: "weapon.fired", playerId: p.id, weapon: slot.weapon, x: spawn.x, y: spawn.y, dirX: dir.x, dirY: dir.y });
  if (slot.ammo === 0) {
    slot.reloadTicks = ticksFor(stats.reloadS);
    world.events.emit({ type: "weapon.reload_started", playerId: p.id, weapon: slot.weapon, reloadS: stats.reloadS });
  }
  return true;
}

function updateProjectiles(world: World, dtS: number): void {
  const pool = world.projectiles;
  const z = world.zombies;
  const ids = weaponIds(world.balance);
  const { widthM, heightM } = world.map;
  // Walk the alive list backwards so freeing (swap-remove) never skips a projectile.
  for (let i = pool.aliveCount - 1; i >= 0; i--) {
    const id = pool.aliveIds[i] as number;
    const x0 = pool.x[id] as number;
    const y0 = pool.y[id] as number;
    pool.prevX[id] = x0;
    pool.prevY[id] = y0;
    const step = Math.min((pool.speedMps[id] as number) * dtS, pool.rangeLeftM[id] as number);
    const dx = pool.dirX[id] as number;
    const dy = pool.dirY[id] as number;
    const x1 = x0 + dx * step;
    const y1 = y0 + dy * step;

    // Gather hits along the segment, nearest first.
    const qr = step / 2 + maxZombieRadius(world.balance);
    const count = queryRadius(world.zombieGrid, z.x, z.y, (x0 + x1) / 2, (y0 + y1) / 2, qr, candidates);
    let hits = 0;
    for (let k = 0; k < count; k++) {
      const zid = candidates[k] as number;
      // The grid was built at the start of combat: skip zombies killed earlier this tick.
      if (!isZombieAlive(z, zid) || projectileHasHit(pool, id, zid)) continue;
      const r = world.balance.zombies.types[zombieTypeOf(z, zid)]?.radiusM ?? 0;
      const t = segmentCircleT(x0, y0, x1, y1, z.x[zid] as number, z.y[zid] as number, r);
      if (t < 0) continue;
      // insertion sort by t (small)
      let j = hits++;
      while (j > 0 && (hitT[j - 1] as number) > t) {
        hitT[j] = hitT[j - 1] as number;
        hitId[j] = hitId[j - 1] as number;
        j--;
      }
      hitT[j] = t;
      hitId[j] = zid;
    }

    let stoppedAt = -1;
    const weapon = ids[pool.weapon[id] as number] ?? "pistol";
    const pushback = weaponStats(world.balance, weapon).hitPushbackM;
    for (let k = 0; k < hits; k++) {
      const zid = hitId[k] as number;
      recordProjectileHit(pool, id, zid);
      applyZombieDamage(world, zid, pool.damage[id] as number, dx, dy, pushback, pool.owner[id] ?? null, weapon);
      pool.pierceLeft[id] = (pool.pierceLeft[id] as number) - 1;
      if (pool.pierceLeft[id] === 0) {
        stoppedAt = hitT[k] as number;
        break;
      }
    }

    if (stoppedAt >= 0) {
      pool.x[id] = x0 + dx * step * stoppedAt;
      pool.y[id] = y0 + dy * step * stoppedAt;
      freeProjectile(pool, id);
      continue;
    }
    pool.x[id] = x1;
    pool.y[id] = y1;
    pool.rangeLeftM[id] = (pool.rangeLeftM[id] as number) - step;
    if ((pool.rangeLeftM[id] as number) <= 1e-6 || x1 < 0 || y1 < 0 || x1 > widthM || y1 > heightM) {
      freeProjectile(pool, id);
    }
  }
}

/** Combat system: weapons fire, then projectiles fly and hit (before zombies move this tick). */
export const updateCombat: SystemFn = (world, dtS) => {
  const z = world.zombies;
  // Zombies moved since the grid was built last tick: rebuild so hit queries are exact.
  rebuildGrid(world.zombieGrid, z.aliveIds, z.aliveCount, z.x, z.y);
  world.players.forEach((p) => updatePlayerWeapon(world, p, dtS));
  updateProjectiles(world, dtS);
};
