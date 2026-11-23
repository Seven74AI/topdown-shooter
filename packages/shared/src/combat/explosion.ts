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

/**
 * Review M1 (5.5): `explode` is re-entrant. A blast can set off another inside it (a kill that a
 * caller turns into a blast at once, or a test): every call captures its spec into locals at entry
 * and takes its own slice of the target buffers (a stack: `top` is where the next nested call's
 * slice starts), and the player pass reads the frame of the current depth. So a nested blast never
 * overwrites the outer one's targets, centre or credit, and each body is still hit once per blast.
 * Depth is bounded (`MAX_BLAST_DEPTH`; the 5.8 queue never runs a blast inline, so 1 is normal).
 */
export const MAX_BLAST_DEPTH = 8;
/** Review L2 (5.9): the blasts' own target lists (never the shared combat candidate buffer); one slice per depth. */
const blastTargets = new Int32Array(ZOMBIE_POOL_CAPACITY * MAX_BLAST_DEPTH);
let targetTop = 0;
/** Story 5.8: the buildings a blast reaches (ids; collected first: a destroyed one leaves the list). */
const MAX_BLAST_BUILDINGS = 64;
const buildingTargets = new Int32Array(MAX_BLAST_BUILDINGS * MAX_BLAST_DEPTH);
let buildingTop = 0;

/** What the last finished `explode` did (tests, sims, liveness asserts; the outermost when nested). */
export const blastResult = { zombiesHit: 0, zombiesKilled: 0, playersHit: 0, buildingsHit: 0 };
/** Blasts so far, summed over every World (tests and sims: reset it first). */
export const explosionCounters = { happened: 0, zombiesHit: 0, zombiesKilled: 0, playersHit: 0, playerDamage: 0, selfDamage: 0, friendlyDamage: 0 };

/** One blast's captured spec and counts (preallocated per depth: no allocation per blast). */
interface BlastFrame {
  world: World | null;
  x: number;
  y: number;
  radiusM: number;
  playerDamage: number;
  ffSource: string | null;
  source: string | null;
  playersHit: number;
}
const frames: BlastFrame[] = Array.from({ length: MAX_BLAST_DEPTH }, () => ({ world: null, x: 0, y: 0, radiusM: 0, playerDamage: 0, ffSource: null, source: null, playersHit: 0 }));
let depth = 0;

const blastPlayer = (p: PlayerState): void => {
  const f = frames[depth - 1] as BlastFrame;
  const world = f.world as World;
  const dx = p.x - f.x;
  const dy = p.y - f.y;
  const reach = f.radiusM + p.radiusM;
  if (dx * dx + dy * dy >= reach * reach) return; // FR-C overlap
  if (!shotLineClear(world, f.x, f.y, p.x, p.y)) return; // FR-C: cover shields
  const taken = damagePlayerBy(world, p, f.playerDamage, "explosion", f.ffSource);
  if (taken > 0) {
    f.playersHit++;
    explosionCounters.playersHit++;
    explosionCounters.playerDamage += taken;
    // Self / friendly damage only where friendly fire applies (a Bloater popped by a player is neither).
    if (f.ffSource === p.id) explosionCounters.selfDamage += taken;
    else if (f.ffSource !== null) explosionCounters.friendlyDamage += taken;
  }
};

/** A blast per `spec` (see the module rules). Returns how many zombies it hit. Re-entrant (review M1). */
export function explode(world: World, spec: Readonly<ExplosionSpec>): number {
  if (depth >= MAX_BLAST_DEPTH) throw new Error(`explode: blasts nested deeper than ${MAX_BLAST_DEPTH}`);
  // Capture the spec: a caller may reuse (and a nested blast refill) the same spec object.
  const x = spec.x;
  const y = spec.y;
  const radiusM = spec.radiusM;
  const zombieDamage = spec.zombieDamage;
  const pushM = spec.pushM;
  const source = spec.sourcePlayerId;
  const weapon = spec.weapon;
  const buildingId = spec.buildingId;
  const quiet = spec.quiet;
  const buildingDamage = spec.buildingDamage;
  const kind = spec.kind;
  const grenadeId = spec.grenadeId;
  const announce = spec.announce;
  const f = frames[depth] as BlastFrame;
  f.world = world;
  f.x = x;
  f.y = y;
  f.radiusM = radiusM;
  f.playerDamage = spec.playerDamage;
  f.ffSource = spec.friendlyFire ? source : null;
  f.source = source;
  f.playersHit = 0;
  depth++;
  const base = targetTop;
  let zombiesHit = 0;
  let zombiesKilled = 0;
  let buildingsHit = 0;
  try {
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
      blastTargets[base + n++] = id;
    }
    targetTop = base + n; // a nested blast takes the slice after this one
    for (let k = 0; k < n; k++) {
      const id = blastTargets[base + k] as number;
      if (!isZombieAlive(z, id)) continue; // killed meanwhile by a nested blast (its hit was that blast's)
      const dx = (z.x[id] as number) - x;
      const dy = (z.y[id] as number) - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ux = d > 1e-6 ? dx / d : 1;
      const uy = d > 1e-6 ? dy / d : 0;
      zombiesHit++;
      // Review L2: quiet for every player-weapon blast, an ownerless round's too (no zombie.hit per body).
      const killed =
        quiet && buildingId === 0
          ? applyZombieDamageQuiet(world, id, zombieDamage, ux, uy, 0, source, weapon)
          : applyZombieDamage(world, id, zombieDamage, ux, uy, 0, source, weapon, buildingId);
      if (killed) zombiesKilled++;
      else if (pushM > 0 && isZombieAlive(z, id)) {
        // D5: straight out, swept (stops at the first face; the Brute takes its share inside).
        knockbacks.applied++;
        if (applyKnockback(world, id, ux, uy, pushM) < pushM * 0.999) knockbacks.stopped++;
      }
    }
    world.players.forEach(blastPlayer); // reads frames[depth - 1]: this blast's, nested ones restore it
    if (buildingDamage > 0) buildingsHit = blastBuildings(world, x, y, radiusM, buildingDamage);
  } finally {
    targetTop = base;
    depth--;
    f.world = null;
  }
  blastResult.zombiesHit = zombiesHit;
  blastResult.zombiesKilled = zombiesKilled;
  blastResult.playersHit = f.playersHit;
  blastResult.buildingsHit = buildingsHit;
  explosionCounters.happened++;
  explosionCounters.zombiesHit += zombiesHit;
  explosionCounters.zombiesKilled += zombiesKilled;
  if (!announce) return zombiesHit;
  world.events.emit({ type: "explosion.happened", kind: EXPLOSION_KINDS.indexOf(kind), x, y, radiusM, sourcePlayerId: source, grenadeId });
  return zombiesHit;
}

/** Wall buildings whose box the blast circle overlaps with a clear line to its nearest point (collected, then damaged). Returns how many. */
function blastBuildings(world: World, x: number, y: number, radiusM: number, amount: number): number {
  const list = world.buildings.list;
  const base = buildingTop;
  let n = 0;
  for (let i = 0; i < list.length && n < MAX_BLAST_BUILDINGS; i++) {
    const b = list[i] as Building;
    if (!b.solid || distanceToBox(x, y, b.minX, b.minY, b.maxX, b.maxY) >= radiusM) continue;
    const nx = Math.min(b.maxX, Math.max(b.minX, x));
    const ny = Math.min(b.maxY, Math.max(b.minY, y));
    if (!shotLineClear(world, x, y, nx, ny)) continue; // a car between: shielded
    buildingTargets[base + n++] = b.id;
  }
  buildingTop = base + n;
  let hit = 0;
  try {
    for (let k = 0; k < n; k++) {
      const b = buildingById(world, buildingTargets[base + k] as number);
      if (!b) continue;
      hit++;
      damageBuilding(world, b, amount);
    }
  } finally {
    buildingTop = base;
  }
  return hit;
}
