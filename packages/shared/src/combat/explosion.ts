import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import type { Building } from "../buildings/buildings";
import { buildingById, damageBuilding } from "../buildings/buildings";
import { distanceToBox } from "../buildings/collision";
import { ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { shotLineClear } from "./cover";
import { applyKnockback, applyZombieDamage, applyZombieDamageQuiet, damagePlayerBy, knockbacks } from "./damage";
import type { WeaponId } from "./weapons";

/**
 * One blast, shared by mines (5.9), the Grenade Launcher (5.5, owner of this module), Bloaters (5.8)
 * and hand grenades (5.12): one cover rule, one friendly-fire path, one event.
 *
 * Fairness rules (each is a test in `explosion.test.ts` / `explosion.fuzz.test.ts`):
 *
 * - **FR-C the blast hits what it can see:** a body is hit when its circle overlaps the blast circle
 *   (centre distance < `radiusM` + body radius, strict: the 4.8 "touches the ring = hit" rule) AND
 *   the line from the blast centre to the body's centre enters no shot blocker (Story 4.2: map
 *   boxes, cars, the bus). Barricades, turrets, sandbags and barriers don't stop it (they only stop
 *   bodies). A player WALL building (`solid`: barricades, turrets; floor traps and mines never) is
 *   hit when the blast circle overlaps its box and the line to the box's nearest point is clear (5.8 D3).
 * - **FR-D friendly fire:** players take `playerDamage` through `damagePlayerBy(tag "explosion")`.
 *   With `friendlyFire` (grenades, mines) and a `sourcePlayerId`, Story 5.4's share applies (50 %,
 *   the shooter included); without it (`friendlyFire: false`, the Bloater: designer decision 5.8 D1)
 *   every player takes the full amount even when a player popped it — the popper still gets the
 *   kill credit. Downed and out players are unharmed; god mode spares.
 * - **FR-E one blast = one hit per body:** the bodies in range are collected first (the blast's OWN
 *   scratch buffer: 5.9 review L2, callers may be iterating the shared `zombieCandidates`), then
 *   damaged, so kills during the pass never skip or double anyone. No per-tick area.
 * - **Push (5.5 D5):** surviving zombies are knocked `pushM` straight out from the centre by 5.3's
 *   swept `applyKnockback` (stops at the first face; 5.7's Brute share). Players are never pushed (D6).
 *
 * Every alive zombie is checked on its current position (a linear pass, once per blast: the spatial
 * grid may be a tick old where a blast happens — a mine at the end of the zombie system, a round
 * landing after the projectiles moved bodies). Then one `explosion.happened`. Allocation-free.
 */

/** Append only: the index goes on the wire (`explosion.happened.kind`). 5.8 appends "bloater". */
export const EXPLOSION_KINDS = ["grenade", "mine", "bloater"] as const;
export type ExplosionKind = (typeof EXPLOSION_KINDS)[number];

export interface ExplosionSpec {
  x: number;
  y: number;
  radiusM: number;
  zombieDamage: number;
  /** The base amount to each player (see `friendlyFire`). */
  playerDamage: number;
  /**
   * Apply the friendly-fire share (Story 5.4: 50 %) when a player set it off (grenades, mines).
   * false: the full `playerDamage` to every player whoever popped it (the Bloater, 5.8 D1); the
   * kill credit still goes to `sourcePlayerId`.
   */
  friendlyFire: boolean;
  /** To each player building the blast reaches (grenades and mines 0: 5.5 D4, 5.9 DD6). */
  buildingDamage: number;
  /** Zombies pushed this far straight out (× the type's knockback share); 0 = none. */
  pushM: number;
  kind: ExplosionKind;
  /** Who set it off (kill credit and friendly fire); null = nobody (or a player who left). */
  sourcePlayerId: string | null;
  /** Credited on kills (a weapon id, or a building type for a mine). */
  weapon: WeaponId;
  /** A mine's building id: its kills pay the owner like a turret's (5.9); 0 = a player's weapon. */
  buildingId: number;
  /** Hits that don't kill send no `zombie.hit` (5.4's quiet path; the explosion event is the visual). */
  quiet: boolean;
  /** The round that burst (`explosion.happened.grenadeId`); 0 = not a round. */
  grenadeId: number;
  /** Emit `explosion.happened` (false: the caller sends its own visual event, the Bloater's `bloater.burst`). */
  announce: boolean;
}

/** A spec with every field at rest (callers keep one and fill it: no allocation per blast). */
export function createExplosionSpec(): ExplosionSpec {
  return { x: 0, y: 0, radiusM: 0, zombieDamage: 0, playerDamage: 0, friendlyFire: true, buildingDamage: 0, pushM: 0, kind: "grenade", sourcePlayerId: null, weapon: "", buildingId: 0, quiet: false, grenadeId: 0, announce: true };
}

/** Review L2 (5.9): the blast's own target list (never the shared combat candidate buffer). */
const blastTargets = new Int32Array(ZOMBIE_POOL_CAPACITY);
/** Story 5.8: the buildings a blast reaches (ids; collected first: a destroyed one leaves the list). */
const MAX_BLAST_BUILDINGS = 64;
const buildingTargets = new Int32Array(MAX_BLAST_BUILDINGS);

/** What the last `explode` did (tests, sims, liveness asserts). */
export const blastResult = { zombiesHit: 0, zombiesKilled: 0, playersHit: 0, buildingsHit: 0 };
/** Blasts so far, summed over every World (tests and sims: reset it first). */
export const explosionCounters = { happened: 0, zombiesHit: 0, zombiesKilled: 0, playersHit: 0, playerDamage: 0, selfDamage: 0, friendlyDamage: 0 };

/** Module-level state of the player pass (no closure per call). */
const pass = { world: null as World | null, spec: null as ExplosionSpec | null };

const blastPlayer = (p: PlayerState): void => {
  const world = pass.world as World;
  const s = pass.spec as ExplosionSpec;
  const dx = p.x - s.x;
  const dy = p.y - s.y;
  const reach = s.radiusM + p.radiusM;
  if (dx * dx + dy * dy >= reach * reach) return; // FR-C overlap
  if (!shotLineClear(world, s.x, s.y, p.x, p.y)) return; // FR-C: cover shields
  const taken = damagePlayerBy(world, p, s.playerDamage, "explosion", s.friendlyFire ? s.sourcePlayerId : null);
  if (taken > 0) {
    blastResult.playersHit++;
    explosionCounters.playersHit++;
    explosionCounters.playerDamage += taken;
    if (s.sourcePlayerId === p.id) explosionCounters.selfDamage += taken;
    else if (s.sourcePlayerId !== null) explosionCounters.friendlyDamage += taken;
  }
};

/**
 * Story 5.9 (kept for its callers and tests): `amount` blast damage to a standing player with no
 * friendly-fire share (the amount is final). Emits `player.damaged` (source -2). Returns whether it hurt.
 */
export function damagePlayerByExplosion(world: World, p: PlayerState, amount: number): boolean {
  return damagePlayerBy(world, p, amount, "explosion", null) > 0;
}

/** A blast per `spec` (see the module rules). Returns how many zombies it hit. */
export function explode(world: World, spec: ExplosionSpec): number {
  blastResult.zombiesHit = 0;
  blastResult.zombiesKilled = 0;
  blastResult.playersHit = 0;
  blastResult.buildingsHit = 0;
  const { x, y, radiusM } = spec;
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
    if (dx * dx + dy * dy >= reach * reach) continue;
    if (!shotLineClear(world, x, y, zx, zy)) continue; // FR-C
    blastTargets[n++] = id;
  }
  for (let k = 0; k < n; k++) {
    const id = blastTargets[k] as number;
    const dx = (z.x[id] as number) - x;
    const dy = (z.y[id] as number) - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const ux = d > 1e-6 ? dx / d : 1;
    const uy = d > 1e-6 ? dy / d : 0;
    blastResult.zombiesHit++;
    const killed =
      spec.quiet && spec.sourcePlayerId !== null && spec.buildingId === 0
        ? applyZombieDamageQuiet(world, id, spec.zombieDamage, ux, uy, 0, spec.sourcePlayerId, spec.weapon)
        : applyZombieDamage(world, id, spec.zombieDamage, ux, uy, 0, spec.sourcePlayerId, spec.weapon, spec.buildingId);
    if (killed) blastResult.zombiesKilled++;
    else if (spec.pushM > 0 && isZombieAlive(z, id)) {
      // D5: straight out, swept (stops at the first face; the Brute takes its share inside).
      knockbacks.applied++;
      if (applyKnockback(world, id, ux, uy, spec.pushM) < spec.pushM * 0.999) knockbacks.stopped++;
    }
  }
  pass.world = world;
  pass.spec = spec;
  world.players.forEach(blastPlayer);
  pass.world = null;
  pass.spec = null;
  if (spec.buildingDamage > 0) blastBuildings(world, spec);
  explosionCounters.happened++;
  explosionCounters.zombiesHit += blastResult.zombiesHit;
  explosionCounters.zombiesKilled += blastResult.zombiesKilled;
  if (!spec.announce) return blastResult.zombiesHit;
  world.events.emit({
    type: "explosion.happened",
    kind: EXPLOSION_KINDS.indexOf(spec.kind),
    x,
    y,
    radiusM,
    sourcePlayerId: spec.sourcePlayerId,
    grenadeId: spec.grenadeId,
  });
  return blastResult.zombiesHit;
}

/** Wall buildings whose box the blast circle overlaps with a clear line to its nearest point (collected, then damaged). */
function blastBuildings(world: World, spec: ExplosionSpec): void {
  const list = world.buildings.list;
  let n = 0;
  for (let i = 0; i < list.length && n < MAX_BLAST_BUILDINGS; i++) {
    const b = list[i] as Building;
    if (!b.solid || distanceToBox(spec.x, spec.y, b.minX, b.minY, b.maxX, b.maxY) >= spec.radiusM) continue;
    const nx = Math.min(b.maxX, Math.max(b.minX, spec.x));
    const ny = Math.min(b.maxY, Math.max(b.minY, spec.y));
    if (!shotLineClear(world, spec.x, spec.y, nx, ny)) continue; // a car between: shielded
    buildingTargets[n++] = b.id;
  }
  for (let k = 0; k < n; k++) {
    const b = buildingById(world, buildingTargets[k] as number);
    if (!b) continue;
    blastResult.buildingsHit++;
    damageBuilding(world, b, spec.buildingDamage);
  }
}
