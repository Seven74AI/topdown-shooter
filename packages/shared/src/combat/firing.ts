import { queryRadius, rebuildGrid } from "../core/spatialGrid";
import { ticksFor } from "../core/time";
import type { SystemFn } from "../core/systems";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { DEG_TO_RAD, len, rotate } from "../math/vec";
import { segmentCircleT } from "../math/sweep";
import { isZombieAlive, knockedBy, rememberKnock, zombieTypeOf } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { MIN_AIM_LEN, MUZZLE_OFFSET_M, TICK_DT_S, ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { viewTickOfInput, type PlayerInput } from "../net/input";
import { applyKnockback, applyZombieDamage, knockbackShare, knockbacks } from "./damage";
import { assistAim } from "./aimAssist";
import { zombieCandidates as candidates } from "./scratch";
import { activeSlot } from "./loadout";
import {
  freeProjectile,
  nextShotId,
  projectileHasHit,
  recordProjectileHit,
  spawnProjectile,
  type ProjectileSpawn,
} from "./projectilePool";
import { swingMelee } from "./melee";
import { cooldownIdle, cooldownReady, cooldownTickEnd, cooldownTickStart } from "./cooldown";
import { isFlame, isLauncher, isMelee, magazineOf, usesAmmo, weaponDamage, weaponIds, weaponStats } from "./weapons";
import { launchGrenade, updateGrenades } from "./grenades";
import { useConsumables } from "./consumables";
import { flameTick, updateIgnites } from "./flame";
import { buildingTypeIds } from "../buildings/buildings";
import { rewindTicksFor, rewoundView } from "./rewind";
import { bossBodyOn } from "../boss/bossState";
import { applyBossDamage, bossCircleHitBySegment, zombieUnderBoss } from "../boss/bossDamage";
import { pelletDirection, rotateBySeqSpread, seqPelletRoll } from "./spread";
import { bulletBlockT } from "./cover";
import { onSpecialShot, specialShotTarget } from "../events/specialEvents";
import { gasTankT } from "../events/gasLeak";


/** Story 5.3 counters (they live in `damage.ts` since Story 5.2; re-exported for the old imports). */
export { knockbacks };
/**
 * Story 2.12: a rewound sweep covers one tick of flight; it is tested at that tick's middle (the
 * cosmetic bullet meets drawn zombies continuously). Netsim, kiting Runners at 150 ms, 20 seeds
 * (after the 3.5 crowd fix, 2.12 review M3): Hunting Rifle +0 / +0.33 / +0.5 / +0.67 / +1 →
 * 2.2 / 1.1 / 0.9 / 0.7 / 3.4 % reversed; Pistol 0.9 / 0.9 / 0.7 / 0.5 / 1.7 %.
 */
const REWIND_SWEEP_MID_TICKS = 0.5;

// Sized to the whole zombie pool, so a candidate query can never be truncated.
const hitT = new Float32Array(ZOMBIE_POOL_CAPACITY);
const hitId = new Int32Array(ZOMBIE_POOL_CAPACITY);
const dir = { x: 0, y: 0 };
const pelletDir = { x: 0, y: 0 };
// Story 5.3: knockbacks queued during one tick's projectile sweep (at most one per zombie per shot).
const knockZid = new Int32Array(ZOMBIE_POOL_CAPACITY);
const knockDirX = new Float32Array(ZOMBIE_POOL_CAPACITY);
const knockDirY = new Float32Array(ZOMBIE_POOL_CAPACITY);
const knockDist = new Float32Array(ZOMBIE_POOL_CAPACITY);
let knockCount = 0;
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
  rewindTicks: 0,
};

/**
 * Fire cooldown: the shared rule in `cooldown.ts` (the client's local fire clock, Story 2.7, uses
 * the same functions). It may end a tick slightly negative while the trigger is held, so the
 * average rate is exact; a tick without a shot clamps it back to ≥ 0 (no saved-up burst).
 */
function updatePlayerWeapon(world: World, p: PlayerState, dtS: number, input: PlayerInput | undefined): void {
  flamedNow = false;
  weaponTick(world, p, dtS, input);
  // Story 5.4: burst edges only (never one event per tick): the first and the last tick of a flame.
  if (flamedNow && !p.flaming) {
    p.flaming = true;
    world.events.emit({ type: "weapon.flame_started", playerId: p.id, weapon: activeSlot(p.loadout).weapon });
  } else if (!flamedNow && p.flaming) {
    p.flaming = false;
    world.events.emit({ type: "weapon.flame_stopped", playerId: p.id });
  }
}

/** Story 5.4: the player flamed on this weapon tick (set by `tryFire`). */
let flamedNow = false;

function weaponTick(world: World, p: PlayerState, dtS: number, input: PlayerInput | undefined): void {
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
      if (usesAmmo(stats) && slot.ammo === 0 && slot.reloadTicks === 0) {
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
    if (slot.reloadTicks === 0 && usesAmmo(stats)) {
      slot.ammo = magazineOf(stats); // Story 5.4: a flame weapon's full tank
      world.events.emit({ type: "weapon.reloaded", playerId: p.id, weapon: slot.weapon });
    }
    return false; // no firing while reloading (including the tick the reload ends)
  }
  if (p.status !== "alive") return false;

  if (!input || !input.fire) return false;
  const aimLen = len(input.aimX, input.aimY);
  if (aimLen < MIN_AIM_LEN) return false;
  if (isFlame(stats)) {
    // Story 5.4 (FR-H): a flame acts every tick the trigger is held with fuel (no cooldown, no
    // projectile, no aim assist): one fuel tick per flaming tick; at 0 the reload starts on its own.
    if (slot.ammo <= 0) return false;
    flamedNow = true;
    if (!dryFire) {
      const rw = rewindTicksFor(world, p, input);
      flameTick(world, p, slot, stats, input.aimX / aimLen, input.aimY / aimLen, rw > 0 ? rewoundView(world, world.tick - rw) : null);
    }
    slot.ammo--;
    if (slot.ammo === 0) {
      slot.reloadTicks = ticksFor(stats.reloadS);
      world.events.emit({ type: "weapon.reload_started", playerId: p.id, weapon: slot.weapon, reloadS: stats.reloadS });
    }
    return false; // no cooldown: the next tick may flame again
  }
  if (!cooldownReady(cooldownS)) return false;
  dir.x = input.aimX / aimLen;
  dir.y = input.aimY / aimLen;
  // Story 2.12: online, test against the zombies as the shooter drew them (0 offline / no view tick).
  const rewind = dryFire ? 0 : rewindTicksFor(world, p, input);
  if (isMelee(stats)) {
    // Melee (Story 1.9): instant arc hit along the raw aim, no ammo, no reload, no aim assist.
    // Story 5.1: the swing's damage comes from the slot's upgrade level (the one shared rule).
    if (!dryFire) swingMelee(world, p, slot.weapon, stats, weaponDamage(world.balance, slot.weapon, slot.level), dir.x, dir.y, rewind > 0 ? rewoundView(world, world.tick - rewind) : null);
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

  const offset = p.radiusM + MUZZLE_OFFSET_M;
  if (isLauncher(stats)) {
    // Story 5.5: one lobbed round along the raw aim (no aim assist, no spread); the aim length is
    // the lob distance (FR-A). A full pool spends nothing (no ammo, no cooldown).
    if (!launchGrenade(world, p, slot.weapon, slot.level, stats, dir.x, dir.y, aimLen, input.seq)) return false;
    slot.ammo--;
    world.events.emit({ type: "weapon.fired", playerId: p.id, weapon: slot.weapon, x: p.x + dir.x * offset, y: p.y + dir.y * offset, dirX: dir.x, dirY: dir.y });
    if (slot.ammo === 0) {
      slot.reloadTicks = ticksFor(stats.reloadS);
      world.events.emit({ type: "weapon.reload_started", playerId: p.id, weapon: slot.weapon, reloadS: stats.reloadS });
    }
    return true;
  }
  // Aim assist on touch only (FR4), before spread; mouse aim is never assisted.
  if (!input.isMouse) {
    const view = rewind > 0 ? rewoundView(world, world.tick - rewind) : null;
    assistAim(world, p.x + dir.x * offset, p.y + dir.y * offset, dir.x, dir.y, stats.rangeM, dir, view, p); // Story 6.4: fog filter (own beam)
  }
  const pellets = stats.pellets;
  if (pellets === 1 && stats.spreadDeg > 0) {
    // Story 2.12: online (lag compensation on), the roll is the seq's, the one the shooter's client drew.
    if (p.rewindMaxTicks > 0) rotateBySeqSpread(dir.x, dir.y, p.id, input.seq, stats.spreadDeg, dir);
    else {
      const half = (stats.spreadDeg / 2) * DEG_TO_RAD;
      rotate(dir.x, dir.y, world.streams.combat.range(-half, half), dir); // Story 4.4: offline spread has its own stream
    }
  }

  spawn.speedMps = stats.projectileSpeedMps;
  spawn.rangeM = stats.rangeM;
  spawn.damage = weaponDamage(world.balance, slot.weapon, slot.level); // Story 5.1: every pellet/bullet
  spawn.pierce = stats.pierce;
  spawn.weaponIndex = weaponIds(world.balance).indexOf(slot.weapon);
  spawn.owner = p.id;
  // Story 2.7: the server advances the first sweep by the shooter's half RTT (0 offline). Story 2.12:
  // a rewound shot needs no advance (its sweeps meet zombies as old as the ones the shooter saw),
  // except for the part of the view offset past the rewind cap, which the 2.7 advance (≤ its own
  // cap) makes up: the bullet starts that much further along, as the cosmetic one is by then.
  const advanceS = rewind > 0 ? Math.min(p.shotAdvanceS, Math.max(0, world.tick - viewTickOfInput(input) - rewind) * TICK_DT_S) : p.shotAdvanceS;
  spawn.advanceM = stats.projectileSpeedMps * advanceS;
  spawn.rewindTicks = rewind;
  // Story 5.3: a weapon with knockback tags the shot's projectiles with one shot id (once per shot, F5).
  spawn.shotId = stats.knockbackM > 0 ? nextShotId(world.projectiles) : 0;
  // Every pellet flies from the muzzle on the centre aim's side; the event carries the centre aim.
  spawn.x = p.x + dir.x * offset;
  spawn.y = p.y + dir.y * offset;
  if (pellets === 1) {
    spawn.dirX = dir.x;
    spawn.dirY = dir.y;
    spawnProjectile(world.projectiles, spawn);
  } else {
    // Story 5.3 (F1): a stratified fan; online the seq's rolls (the shooter's and remote clients'
    // cosmetic pellets use the same), offline the `combat` stream, pellet 0 first.
    const online = p.rewindMaxTicks > 0;
    const seq16 = input.seq & 0xffff;
    for (let k = 0; k < pellets; k++) {
      const u = online ? seqPelletRoll(p.id, seq16, k) : world.streams.combat.next();
      pelletDirection(dir.x, dir.y, stats.spreadDeg, pellets, k, u, pelletDir);
      spawn.dirX = pelletDir.x;
      spawn.dirY = pelletDir.y;
      if (spawnProjectile(world.projectiles, spawn) < 0) break; // pool full: the rest of the fan is lost
    }
  }
  spawn.shotId = 0;

  slot.ammo--;
  if (pellets === 1) world.events.emit({ type: "weapon.fired", playerId: p.id, weapon: slot.weapon, x: spawn.x, y: spawn.y, dirX: dir.x, dirY: dir.y });
  else world.events.emit({ type: "weapon.fired", playerId: p.id, weapon: slot.weapon, x: spawn.x, y: spawn.y, dirX: dir.x, dirY: dir.y, seq: input.seq & 0xffff });
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

    // Gather hits along the segment, nearest first. Story 2.12: a player's rewound shot tests the
    // zombies as they were its rewind ago (a turret's shot never has one); effects go to the present zombie.
    const rewind = pool.rewindTicks[id] as number;
    const view = rewind > 0 ? rewoundView(world, world.tick - rewind + REWIND_SWEEP_MID_TICKS) : null;
    const xs = view ? view.x : z.x;
    const ys = view ? view.y : z.y;
    const qr = step / 2 + maxZombieRadius(world.balance);
    const count = queryRadius(view ? view.grid : world.zombieGrid, xs, ys, (x0 + x1) / 2, (y0 + y1) / 2, qr, candidates);
    // Story 4.2: the shot stops where this sweep first enters a car, the bus or a map box (-1: none);
    // zombies past that point are behind cover and not hit.
    let coverT = bulletBlockT(world, x0, y0, x1, y1); // barricades stop bullets too (designer 2026-11-23)
    // Story 6.9 re-review RR4: an armed gas tank stops a PLAYER's bullet like cover (nothing behind it —
    // a zombie, the Behemoth — is hit by the round that blows it).
    if ((pool.building[id] as number) === 0 && pool.owner[id] != null) {
      const tankT = gasTankT(world, x0, y0, x1, y1);
      if (tankT >= 0 && (coverT < 0 || tankT < coverT)) coverT = tankT;
    }
    // Story 6.5 (D3, AC 11): the Behemoth's body stops the shot (no pierce through it); a player's
    // shot meets it where the shooter saw it (rewound like the zombies), a turret's where it is.
    const bossT = bossBodyOn(world.boss) ? bossCircleHitBySegment(world, x0, y0, x1, y1, rewind > 0 ? world.tick - rewind + REWIND_SWEEP_MID_TICKS : -1) : -1;
    const bossFirst = bossT >= 0 && (coverT < 0 || bossT <= coverT);
    const blockT = bossFirst ? bossT : coverT;
    let hits = 0;
    for (let k = 0; k < count; k++) {
      const zid = candidates[k] as number;
      // The grid was built at the start of combat: skip zombies killed earlier this tick.
      if (!isZombieAlive(z, zid) || projectileHasHit(pool, id, zid)) continue;
      const r = world.balance.zombies.types[zombieTypeOf(z, zid)]?.radiusM ?? 0;
      const t = segmentCircleT(x0, y0, x1, y1, xs[zid] as number, ys[zid] as number, r);
      // Review M2: a zombie whose centre is under the Behemoth (they walk under it) is still hit, before
      // the boss: the body stops the shot for what is behind it, not for what stands inside it.
      const under = bossFirst && t > blockT && (coverT < 0 || t <= coverT) && zombieUnderBoss(world, xs[zid] as number, ys[zid] as number, rewind > 0 ? world.tick - rewind + REWIND_SWEEP_MID_TICKS : -1);
      if (t < 0 || (blockT >= 0 && t > blockT && !under)) continue;
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
    const wStats = building > 0 ? null : weaponStats(world.balance, weapon);
    const pushback = wStats ? wStats.hitPushbackM : (pool.pushbackM[id] as number);
    const shotId = pool.shotId[id] as number;
    for (let k = 0; k < hits; k++) {
      const zid = hitId[k] as number;
      recordProjectileHit(pool, id, zid);
      // Story 5.3 (F5): the first projectile of a shot to hit a zombie queues its knockback, once
      // per shot, along that projectile; applied after every projectile of this tick has swept, so
      // the rest of a point-blank fan still meets the body where it was (F1).
      if (shotId > 0 && wStats && !knockedBy(z, zid, shotId) && knockCount < ZOMBIE_POOL_CAPACITY) {
        rememberKnock(z, zid, shotId);
        knockZid[knockCount] = zid;
        knockDirX[knockCount] = dx;
        knockDirY[knockCount] = dy;
        knockDist[knockCount++] = wStats.knockbackM;
      }
      applyZombieDamage(world, zid, pool.damage[id] as number, dx, dy, pushback, pool.owner[id] ?? null, weapon, building);
      pool.pierceLeft[id] = (pool.pierceLeft[id] as number) - 1;
      if (pool.pierceLeft[id] === 0) {
        stoppedAt = hitT[k] as number;
        break;
      }
    }

    if (stoppedAt < 0 && bossFirst) applyBossDamage(world, pool.damage[id] as number, building > 0 ? null : (pool.owner[id] ?? null), weapon); // Story 6.5
    if (stoppedAt < 0 && blockT >= 0) stoppedAt = blockT; // Story 4.2: into the cover's face
    // Story 6.8 (F4, AC 8): a player's bullet that reaches the armed car (not stopped before it) sets it off.
    if (building === 0 && specialShotTarget(world)) {
      // Story 6.9 review L5: a bullet that blows the gas tank stops at the tank.
      const st = onSpecialShot(world, x0, y0, x1, y1, stoppedAt, pool.owner[id] ?? null);
      if (st >= 0 && (stoppedAt < 0 || st < stoppedAt)) stoppedAt = st;
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
  // Story 5.3 (F4): queued knockbacks, each swept against every box (a zombie killed meanwhile stays put).
  for (let k = 0; k < knockCount; k++) {
    const dist = knockDist[k] as number;
    if (!isZombieAlive(z, knockZid[k] as number)) continue;
    knockbacks.applied++;
    // Review N1 (5.14): against the body's share, like melee (a held zombie's is 0: not "stopped at a face").
    if (applyKnockback(world, knockZid[k] as number, knockDirX[k] as number, knockDirY[k] as number, dist) < dist * knockbackShare(world, knockZid[k] as number) - 1e-9) knockbacks.stopped++;
  }
  knockCount = 0;
}

/** Combat system: weapons fire, then projectiles fly and hit (before zombies move this tick). */
export const updateCombat: SystemFn = (world, dtS) => {
  const z = world.zombies;
  // Zombies moved since the grid was built last tick: rebuild so hit queries are exact.
  // Known, accepted: a zombie pushed into another cell by a hit this tick is found only via its old cell
  // until the next rebuild (queries use generous radii, so this almost never matters; ≤ 1 tick).
  rebuildGrid(world.zombieGrid, z.aliveIds, z.aliveCount, z.x, z.y);
  useConsumables(world); // Story 5.12: the quick-use slot first (a throw lands on its own tick in updateGrenades)
  world.players.forEach((p) => {
    // Story 2.7 review: a starved server tick (no new input) pauses the weapon, like the client's
    // fire clock, which only advances per sent input.
    if (!p.weaponsPaused && p.protectTicks === 0) updatePlayerWeapon(world, p, dtS, world.inputs.get(p.id)); // Story 8.1 (D3): no shooting while spawn-protected
  });
  updateProjectiles(world, dtS);
  updateGrenades(world); // Story 5.5: rounds landing this tick burst (after the projectiles)
  updateIgnites(world); // Story 5.4 (FR-G): burning zombies, after every weapon of the tick
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
