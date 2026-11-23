import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { zombieCandidates as candidates } from "./scratch";
import { zombieTypeOf } from "../zombies/zombiePool";
import { downPlayer } from "../player/downed";
import { shotLineClear } from "./cover";
import { applyZombieDamage } from "./damage";
import { DAMAGE_SOURCE_EXPLOSION } from "../core/simEvents";

/**
 * Story 5.9 (D5): one blast, shared by mines (5.9), the Grenade Launcher (5.5), Bloaters (5.8) and
 * grenades (5.12): whoever merges later reuses this helper (one cover rule, one friendly-fire path).
 *
 * Who is hit: every alive zombie and every standing player whose BODY overlaps the blast circle
 * (centre distance < radius + body radius, strict) and whose centre has a clear shot line from the
 * blast centre (Story 4.2 shot blockers: cars, the bus, buildings of the map stop it; barricades,
 * turrets, sandbags and barriers don't: they only stop bodies, F5). Buildings take no blast damage
 * (DD6). Zombies take `zombieDamage` (no knockback, DD9; a `zombie.hit` per body so kills and
 * assists work as for any weapon); standing players take `zombieDamage × playerShare` (F6: the
 * GDD's 50 % explosion rule, the owner too); downed and out players none. God mode spares players.
 *
 * Every alive zombie is checked on its current position (a linear pass, once per blast: the spatial
 * grid may be a tick old where a blast happens). The bodies in range are collected first (the shared
 * candidate buffer), then damaged, so kills during the pass never skip anyone. Allocation-free.
 */

/** What the last `explode` did (tests, sims, liveness asserts). */
export const blastResult = { zombiesHit: 0, zombiesKilled: 0, playersHit: 0 };

/** Module-level state of the player pass (no closure per call). */
const pass = { world: null as World | null, x: 0, y: 0, r: 0, amount: 0 };

const blastPlayer = (p: PlayerState): void => {
  const world = pass.world as World;
  const dx = p.x - pass.x;
  const dy = p.y - pass.y;
  const reach = pass.r + p.radiusM;
  if (dx * dx + dy * dy >= reach * reach) return;
  if (!shotLineClear(world, pass.x, pass.y, p.x, p.y)) return; // F5: cover shields
  if (damagePlayerByExplosion(world, p, pass.amount)) blastResult.playersHit++;
};

/**
 * Story 5.9 (5.4 owns the final friendly-fire function; until it merges this is it): `amount`
 * explosion damage to a standing player. Emits `player.damaged` with `sourceZombieId =
 * DAMAGE_SOURCE_EXPLOSION` (not a fire hit: no burn cue). Returns whether it hurt.
 */
export function damagePlayerByExplosion(world: World, p: PlayerState, amount: number): boolean {
  if (p.status !== "alive" || world.debug.godMode || amount <= 0) return false;
  p.hp = Math.max(0, p.hp - amount);
  world.events.emit({ type: "player.damaged", playerId: p.id, amount, sourceZombieId: DAMAGE_SOURCE_EXPLOSION });
  if (p.hp <= 0) downPlayer(world, p);
  return true;
}

/**
 * A blast of `radiusM` at (x, y). `killerId` / `weapon` / `buildingId` credit the zombie damage like
 * a turret's (a mine: its owner, its type, its id). Returns how many zombies it hit.
 */
export function explode(
  world: World,
  x: number,
  y: number,
  radiusM: number,
  zombieDamage: number,
  playerShare: number,
  killerId: string | null,
  weapon: string,
  buildingId = 0,
): number {
  blastResult.zombiesHit = 0;
  blastResult.zombiesKilled = 0;
  blastResult.playersHit = 0;
  const z = world.zombies;
  let n = 0;
  for (let k = 0; k < z.aliveCount; k++) {
    const id = z.aliveIds[k] as number;
    const rz = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    const zx = z.x[id] as number;
    const zy = z.y[id] as number;
    const dx = zx - x;
    const dy = zy - y;
    const reach = radiusM + rz;
    const d2 = dx * dx + dy * dy;
    if (d2 >= reach * reach) continue;
    if (!shotLineClear(world, x, y, zx, zy)) continue; // F5
    candidates[n++] = id;
  }
  for (let k = 0; k < n; k++) {
    const id = candidates[k] as number;
    const dx = (z.x[id] as number) - x;
    const dy = (z.y[id] as number) - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    blastResult.zombiesHit++;
    if (applyZombieDamage(world, id, zombieDamage, d > 1e-6 ? dx / d : 1, d > 1e-6 ? dy / d : 0, 0, killerId, weapon, buildingId)) blastResult.zombiesKilled++;
  }
  pass.world = world;
  pass.x = x;
  pass.y = y;
  pass.r = radiusM;
  pass.amount = zombieDamage * playerShare;
  world.players.forEach(blastPlayer);
  pass.world = null;
  return blastResult.zombiesHit;
}
