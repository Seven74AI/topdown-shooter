import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { zombieTypeOf } from "../zombies/zombiePool";
import { downPlayer } from "../player/downed";
import { shotLineClear } from "./cover";
import { applyKnockback, applyZombieDamage } from "./damage";
import { buildingById, damageBuilding, type Building } from "../buildings/buildings";
import { distanceToBox } from "../buildings/collision";
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
 * grid may be a tick old where a blast happens). The bodies in range are collected first (into the
 * blast's OWN scratch buffer: review L2, callers may be iterating the shared `zombieCandidates`),
 * then damaged, so kills during the pass never skip anyone. Allocation-free.
 */

/** Review L2: the blast's own target list (never the shared combat candidate buffer). */
const blastTargets = new Int32Array(ZOMBIE_POOL_CAPACITY);
/** Story 5.8: the buildings a blast reaches (ids; collected first: a destroyed one leaves the list). */
const MAX_BLAST_BUILDINGS = 64;
const blastBuildings = new Int32Array(MAX_BLAST_BUILDINGS);

/** What the last `explode` did (tests, sims, liveness asserts). */
export const blastResult = { zombiesHit: 0, zombiesKilled: 0, playersHit: 0, buildingsHit: 0 };

/**
 * Story 5.8: what a blast does beyond the 5.9 mine (defaults: nothing). `buildingDamage` > 0: every
 * player WALL building (`solid`: barricades, turrets; floor traps and mines are not hit) whose
 * footprint overlaps the circle, with a clear shot line from the centre to its nearest point, takes
 * it (D3). `pushM` > 0: every zombie it hit and didn't kill is knocked that far straight out
 * (`applyKnockback`: swept, stops at faces, × the type's `knockbackTakenPct`).
 * (5.5 owns `explode`: at the merge these fold into its spec object, see the 5.8 merge notes.)
 */
export interface BlastExtra {
  buildingDamage: number;
  pushM: number;
}

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
  extra: Readonly<BlastExtra> | null = null,
): number {
  blastResult.zombiesHit = 0;
  blastResult.zombiesKilled = 0;
  blastResult.playersHit = 0;
  blastResult.buildingsHit = 0;
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
    blastTargets[n++] = id;
  }
  for (let k = 0; k < n; k++) {
    const id = blastTargets[k] as number;
    const dx = (z.x[id] as number) - x;
    const dy = (z.y[id] as number) - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    blastResult.zombiesHit++;
    const ux = d > 1e-6 ? dx / d : 1;
    const uy = d > 1e-6 ? dy / d : 0;
    if (applyZombieDamage(world, id, zombieDamage, ux, uy, 0, killerId, weapon, buildingId)) blastResult.zombiesKilled++;
    else if (extra && extra.pushM > 0) applyKnockback(world, id, ux, uy, extra.pushM); // Story 5.8
  }
  if (extra && extra.buildingDamage > 0) blastWalls(world, x, y, radiusM, extra.buildingDamage);
  pass.world = world;
  pass.x = x;
  pass.y = y;
  pass.r = radiusM;
  pass.amount = zombieDamage * playerShare;
  world.players.forEach(blastPlayer);
  pass.world = null;
  return blastResult.zombiesHit;
}

/** Story 5.8 (D3): `amount` to every wall building the blast circle overlaps with a clear line (see `BlastExtra`). */
function blastWalls(world: World, x: number, y: number, radiusM: number, amount: number): void {
  const list = world.buildings.list;
  let n = 0;
  for (let i = 0; i < list.length && n < MAX_BLAST_BUILDINGS; i++) {
    const b = list[i] as Building;
    if (!b.solid || distanceToBox(x, y, b.minX, b.minY, b.maxX, b.maxY) >= radiusM) continue;
    const nx = Math.min(b.maxX, Math.max(b.minX, x));
    const ny = Math.min(b.maxY, Math.max(b.minY, y));
    if (!shotLineClear(world, x, y, nx, ny)) continue; // a car or a wall between: shielded (FR-D)
    blastBuildings[n++] = b.id;
  }
  for (let k = 0; k < n; k++) {
    const id = blastBuildings[k] as number;
    const b = buildingById(world, id);
    if (!b) continue;
    blastResult.buildingsHit++;
    damageBuilding(world, b, amount);
  }
}
