import { queryRadius, rebuildGrid } from "../core/spatialGrid";
import { ticksFor } from "../core/time";
import type { SystemFn } from "../core/systems";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { DEG_TO_RAD, len, rotate } from "../math/vec";
import { segmentCircleT } from "../math/sweep";
import { isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { MUZZLE_OFFSET_M, TICK_DT_S, ZOMBIE_POOL_CAPACITY } from "../config/constants";
import type { PlayerInput } from "../net/input";
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
import { cooldownIdle, cooldownReady, cooldownTickEnd, cooldownTickStart } from "./cooldown";
import { isGun, isMelee, weaponIds, weaponStats } from "./weapons";
import { buildingTypeIds } from "../buildings/buildings";

const MIN_AIM = 1e-6;

// Sized to the whole zombie pool, so a candidate query can never be truncated.
const hitT = new Float32Array(ZOMBIE_POOL_CAPACITY);
const hitId = new Int32Array(ZOMBIE_POOL_CAPACITY);
const dir = { x: 0, y: 0 };
const spawn: ProjectileSpawn = {
  x: 0,
  y: 0,
  dirX: 0,
  dirY: 0,
  speedMps: 0,
  rangeM: 0,
  damage: 0,
  pierce: 1,
  weaponIndex: 0,
  owner: null,
  advanceM: 0,
};

/**
 * Fire cooldown: the shared rule in `cooldown.ts` (the client's local fire clock, Story 2.7, uses
 * the same functions). It may end a tick slightly negative while the trigger is held, so the
 * average rate is exact; a tick without a shot clamps it back to ≥ 0 (no saved-up burst).
 */
function updatePlayerWeapon(world: World, p: PlayerState, dtS: number, input: PlayerInput | undefined): void {
  // The weapon not in hand keeps cooling down (a swap never stretches its next shot).
  const other = p.loadout.slots[p.loadout.active === 0 ? 1 : 0];
  if (other) other.cooldownS = cooldownIdle(other.cooldownS, dtS);
  if (updateSwap(world, p, input)) {
    activeSlot(p.loadout).cooldownS = cooldownIdle(activeSlot(p.loadout).cooldownS, dtS);
    return; // neither weapon fires during a swap (FR5)
  }
  const slot = activeSlot(p.loadout);
  slot.cooldownS = cooldownTickStart(slot.cooldownS, dtS);
  const attacked = tryFire(world, p, slot.cooldownS, input);
  slot.cooldownS = cooldownTickEnd(slot.cooldownS, attacked, weaponStats(world.balance, slot.weapon).rateHz);
}

/**
 * Weapon swap (FR5): a swap tap with a second weapon starts a `balance.player.swapS` swap (0.3 s);
 * swapping away cancels a reload in progress; when the swap ends the other slot becomes active and,
 * if its magazine is empty, a full reload starts. Taps during a swap or with one weapon are ignored.
 * Returns true while swapping (no firing this tick).
 */
function updateSwap(world: World, p: PlayerState, input: PlayerInput | undefined): boolean {
  const lo = p.loadout;
  if (lo.swapTicks > 0 && p.status !== "alive") {
    lo.swapTicks = 0; // a downed or out player's swap is cancelled
    return false;
  }
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
        return true; // the reload starts counting next tick, like a reload after the last shot
      }
      return false; // the new weapon may fire from this tick
    }
    return true;
  }
  if (!input?.swap || !lo.slots[1] || p.status !== "alive") return false;
  const current = activeSlot(lo);
  current.reloadTicks = 0; // swapping away cancels the reload
  lo.swapTicks = ticksFor(world.balance.player.swapS);
  world.events.emit({ type: "weapon.swap_started", playerId: p.id });
  return true;
}

/**
 * Handles reload and firing (or a melee swing) for this tick. Returns true if the weapon attacked
 * (the caller adds the cooldown).
 */
function tryFire(world: World, p: PlayerState, cooldownS: number, input: PlayerInput | undefined): boolean {
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

  if (!input || !input.fire) return false;
  const aimLen = len(input.aimX, input.aimY);
  if (aimLen < MIN_AIM || !cooldownReady(cooldownS)) return false;
  dir.x = input.aimX / aimLen;
  dir.y = input.aimY / aimLen;
  if (isMelee(stats)) {
    // Melee (Story 1.9): instant arc hit along the raw aim, no ammo, no reload, no aim assist.
    if (!dryFire) swingMelee(world, p, slot.weapon, stats, dir.x, dir.y);
    return true;
  }
  if (slot.ammo <= 0) return false;
  if (dryFire) {
    // A skipped input's shot: its round and cooldown are spent, nothing flies (see skippedInputWeaponTick).
    slot.ammo--;
    if (slot.ammo === 0) {
      slot.reloadTicks = ticksFor(stats.reloadS);
      world.events.emit({ type: "weapon.reload_started", playerId: p.id, weapon: slot.weapon, reloadS: stats.reloadS });
    }
    return true;
  }

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
  // Story 2.7: the server advances the first sweep by the shooter's half RTT (0 offline).
  spawn.advanceM = stats.projectileSpeedMps * p.shotAdvanceS;
  spawnProjectile(world.projectiles, spawn);

  slot.ammo--;
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
    // A fresh server projectile also sweeps its shot advance (Story 2.7), never past its range.
    const step = Math.min((pool.speedMps[id] as number) * dtS + (pool.advanceM[id] as number), pool.rangeLeftM[id] as number);
    pool.advanceM[id] = 0;
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
    // Story 3.6: a turret's shot carries its building id, type and pushback; a player's its weapon.
    const building = pool.building[id] as number;
    const weapon = building > 0 ? (buildingTypeIds(world.balance)[pool.weapon[id] as number] ?? "") : (ids[pool.weapon[id] as number] ?? "pistol");
    const pushback = building > 0 ? (pool.pushbackM[id] as number) : weaponStats(world.balance, weapon).hitPushbackM;
    for (let k = 0; k < hits; k++) {
      const zid = hitId[k] as number;
      recordProjectileHit(pool, id, zid);
      applyZombieDamage(world, zid, pool.damage[id] as number, dx, dy, pushback, pool.owner[id] ?? null, weapon, building);
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
  // Known, accepted: a zombie pushed into another cell by a hit this tick is found only via its old cell
  // until the next rebuild (queries use generous radii, so this almost never matters; ≤ 1 tick).
  rebuildGrid(world.zombieGrid, z.aliveIds, z.aliveCount, z.x, z.y);
  world.players.forEach((p) => {
    // Story 2.7 review: a starved server tick (no new input) pauses the weapon, like the client's
    // fire clock, which only advances per sent input.
    if (!p.weaponsPaused) updatePlayerWeapon(world, p, dtS, world.inputs.get(p.id));
  });
  updateProjectiles(world, dtS);
};

/** True inside `skippedInputWeaponTick`: the weapon runs its tick but a shot or swing has no effect. */
let dryFire = false;

/**
 * Story 2.7 review: the weapon tick of an input the server skips (backlog drain or queue overflow,
 * Story 2.4). The weapon runs exactly as if the input were applied (cooldowns, reload, swap tap,
 * and a shot uses its round and cooldown), but a shot spawns no projectile and emits no
 * `weapon.fired`, and a swing hits nothing. So the server's weapon timing and ammo follow every
 * seq the client sent, which is what the client's local fire clock predicts (its cosmetic shot on
 * that seq simply did nothing). Allocation-free; call before `step`.
 */
export function skippedInputWeaponTick(world: World, playerId: string, input: PlayerInput): void {
  const p = world.players.get(playerId);
  if (!p) return; // a skipped input is a real seq: it runs even after a starved tick
  dryFire = true;
  try {
    updatePlayerWeapon(world, p, TICK_DT_S, input);
  } finally {
    dryFire = false;
  }
}
