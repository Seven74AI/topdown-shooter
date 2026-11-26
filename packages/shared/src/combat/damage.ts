import type { World } from "../core/world";
import type { MapBox } from "../map/districtMap";
import type { Building } from "../buildings/buildings";
import { segmentBoxEntryT } from "./cover";
import { isZombieAlive, killZombie, zombieTypeOf } from "../zombies/zombiePool";
import type { WeaponId } from "./weapons";
import { recordDamager } from "../economy/economy";
import type { PlayerState } from "../player/player";
import { downPlayer } from "../player/downed";
import { DAMAGE_SOURCE_EXPLOSION, DAMAGE_SOURCE_FIRE, DAMAGE_TAGS, type DamageTag } from "../core/simEvents";

export { DAMAGE_TAGS, type DamageTag };

/** Story 5.4: friendly-fire hits so far, per source player and target (tests, sims, logs; not sim state). */
export const friendlyFireStats = { hits: 0, damage: 0, downs: 0 };

/**
 * Story 5.4 (FR18, fairness rules FR-D/FR-E): THE way a player loses HP. Every source goes through
 * here: zombie bites (`zombieAi.ts`), car fire (`decay/fire.ts`), acid (`zombies/spit.ts`), blasts
 * (`combat/explosion.ts`: 5.9 mines, 5.5 grenades, 5.8 Bloaters) and flames (`combat/flame.ts`).
 *
 * - With a `sourcePlayerId` (a player caused it, the target's teammate OR the target themself):
 *   `bullet` and `melee` deal 0 (no event, nothing happens); `fire` and `explosion` deal
 *   `round(amount × combat.friendlyFire.pct / 100)`; with `friendlyFire.canDown` false a friendly
 *   hit never takes a player below 1 HP.
 * - Without one (zombies, car fire, acid, an owner-less blast): the full `amount`.
 * - Then the one existing path: only a standing ("alive") player is hurt, god mode spares everyone,
 *   `player.damaged { tag, sourcePlayerId, sourceZombieId }` is emitted, and 0 HP downs the player
 *   (Story 2.8; never "dead").
 *
 * Returns the HP actually taken (0: nothing happened, no event). Allocation-free.
 */
export function damagePlayerBy(world: World, target: PlayerState, amount: number, tag: DamageTag, sourcePlayerId: string | null, sourceZombieId = -1): number {
  if (target.status !== "alive" || world.debug.godMode || target.protectTicks > 0 || !(amount > 0)) return 0; // Story 8.1: spawn protection
  let dmg = amount;
  if (sourcePlayerId !== null) {
    if (tag === "bullet" || tag === "melee") return 0; // bullets and melee never hurt players
    const ff = world.balance.combat.friendlyFire;
    dmg = Math.round((amount * ff.pct) / 100);
    if (!ff.canDown) dmg = Math.min(dmg, target.hp - 1);
    if (dmg <= 0) return 0;
  }
  const taken = Math.min(dmg, target.hp);
  target.hp = Math.max(0, target.hp - dmg);
  // A zombie-less blast or fire keeps its 5.9/4.8 source code on the wire (−2 / −1) whatever the caller passed.
  const src = sourceZombieId >= 0 ? sourceZombieId : tag === "explosion" ? DAMAGE_SOURCE_EXPLOSION : tag === "fire" ? DAMAGE_SOURCE_FIRE : sourceZombieId;
  world.events.emit({ type: "player.damaged", playerId: target.id, amount: dmg, sourceZombieId: src, tag, sourcePlayerId });
  if (sourcePlayerId !== null) {
    friendlyFireStats.hits++;
    friendlyFireStats.damage += taken;
  }
  if (target.hp <= 0) {
    if (sourcePlayerId !== null) friendlyFireStats.downs++;
    downPlayer(world, target, sourcePlayerId);
  }
  return taken;
}

/**
 * Story 5.3: knockbacks applied by shots and swings, and how many stopped short at a face
 * (diagnostic counters for tests and the fuzz liveness checks; not simulation state, never
 * snapshotted). Story 5.2: moved here from `firing.ts` (re-exported there) so melee counts too.
 */
export const knockbacks = { applied: 0, stopped: 0 };

/**
 * Story 5.2 (D3, shared with 5.7's Brute): the share of a knockback or pushback zombie `id`'s type
 * takes (`knockbackTakenPct` / 100; 1 for every type without the field).
 */
export function knockbackShare(world: World, id: number): number {
  if ((world.zombies.holdTicks[id] as number) > 0) return 0; // Story 5.14: a bear trap's jaws pin it (no knockback, no pushback)
  return (world.balance.zombies.types[zombieTypeOf(world.zombies, id)]?.knockbackTakenPct ?? 100) / 100;
}

/**
 * Damages a zombie hit along direction (dirX, dirY): emits `zombie.hit`, pushes it back by
 * `pushbackM` (clamped to the map) and kills it at 0 HP (emits `zombie.killed`). `killerId` is
 * also the hit's `sourceId` (Story 2.7: the shooter's client confirms its own hits).
 * Story 3.6: `buildingId` > 0 = a turret's shot (`killerId` is its owner): the hit has no
 * `sourceId` (no assist credit, no 2.7 confirmation) and the kill carries the building id
 * (the economy pays the owner `economy.buildingKillShare`). Returns true if the zombie died.
 */
export function applyZombieDamage(
  world: World,
  id: number,
  amount: number,
  dirX: number,
  dirY: number,
  pushbackM: number,
  killerId: string | null,
  weapon: WeaponId,
  buildingId = 0,
): boolean {
  const z = world.zombies;
  if (!isZombieAlive(z, id)) return false;
  hurt(world, id, amount, dirX, dirY, pushbackM);
  const x = z.x[id] as number;
  const y = z.y[id] as number;
  if (buildingId > 0) {
    // A turret's hit: no assist source; the building id is for the server's interest filter (review M2).
    world.events.emit({ type: "zombie.hit", zombieId: id, x, y, dirX, dirY, damage: amount, weapon, sourceId: null, buildingId });
  } else {
    world.events.emit({ type: "zombie.hit", zombieId: id, x, y, dirX, dirY, damage: amount, weapon, sourceId: killerId });
  }
  if ((z.hp[id] as number) <= 0) {
    killZombie(world, id, killerId, weapon, buildingId);
    return true;
  }
  return false;
}

/**
 * HP and the pushback (scaled by the type's `knockbackTakenPct`, Story 5.2 D3). FX-B1 (fix
 * bloater-car-corner, 2026-11-25): the pushback is swept like a knockback (`sweptMove`): it stops when
 * the body touches a map solid or a wall building. It used to be clamped to the map only, so co-op hits
 * stacked in one tick (~1 m) could shove a centre into a car or a dumpster, where it stayed.
 */
function hurt(world: World, id: number, amount: number, dirX: number, dirY: number, pushbackM: number): void {
  const z = world.zombies;
  z.hp[id] = (z.hp[id] as number) - amount;
  const push = pushbackM > 0 ? pushbackM * knockbackShare(world, id) : 0;
  if (push > 0) sweptMove(world, id, dirX, dirY, push);
}

/**
 * Story 5.2: `applyZombieDamage` without the `zombie.hit` event (the quiet hit path for weapons
 * that hit every tick, the Chainsaw: no event per zombie per tick). The same HP, pushback and kill
 * (`zombie.killed` as usual); the assist credit the economy would take from the hit event is
 * recorded directly. Returns true if the zombie died.
 */
export function applyZombieDamageQuiet(world: World, id: number, amount: number, dirX: number, dirY: number, pushbackM: number, killerId: string | null, weapon: WeaponId): boolean {
  const z = world.zombies;
  if (!isZombieAlive(z, id)) return false;
  hurt(world, id, amount, dirX, dirY, pushbackM);
  if (killerId !== null) recordDamager(world, id, killerId); // Story 5.4: an ignite whose igniter left credits nobody
  if ((z.hp[id] as number) <= 0) {
    killZombie(world, id, killerId, weapon, 0);
    return true;
  }
  return false;
}

/** Story 5.3: a knocked-back body stops this far short of the face it would touch (float safety). */
const KNOCK_FACE_GAP_M = 1e-4;

/**
 * The share t ∈ [0, 1] of the move (x, y) → (x + mx, y + my) a circle of radius r can make before
 * its body touches the box (the box grown by r; corners count square: a little early, never late).
 * A body already overlapping the box may move away from it but not deeper.
 */
function knockT(x: number, y: number, mx: number, my: number, r: number, b: Pick<MapBox, "minX" | "minY" | "maxX" | "maxY">, t: number): number {
  const minX = b.minX - r;
  const minY = b.minY - r;
  const maxX = b.maxX + r;
  const maxY = b.maxY + r;
  if (Math.max(x, x + mx) < minX || Math.min(x, x + mx) > maxX || Math.max(y, y + my) < minY || Math.min(y, y + my) > maxY) return t;
  if (x > minX && x < maxX && y > minY && y < maxY) {
    // Already inside the grown box (pressed against a face): free only if the move heads away from
    // the box's nearest point at the start (review M2: the distance along a line to a convex box is
    // convex, so it then never shrinks and the move can't cross the box); a centre inside the box stays.
    const ox = x - Math.min(b.maxX, Math.max(b.minX, x));
    const oy = y - Math.min(b.maxY, Math.max(b.minY, y));
    if (ox === 0 && oy === 0) return 0;
    return ox * mx + oy * my >= 0 ? t : 0;
  }
  const e = segmentBoxEntryT(x, y, mx, my, minX, minY, maxX, maxY);
  return e >= 0 && e < t ? e : t;
}

/**
 * Story 5.3 (shared with 5.2's Fire Axe and 5.7's Brute): knocks zombie `id` up to `distM` (× its
 * type's `knockbackTakenPct` / 100, Story 5.2 D3: the Brute takes 20 %) along
 * the unit (dirX, dirY), swept: it stops when its body touches a map solid (car, bus, building box,
 * barrier, sandbags: `world.obstacles.solids`) or a player WALL building (Story 5.9: traps and mines
 * are floor and never stop it), and never leaves the map
 * (fairness rule F4: never into or through anything). Allocation-free. Returns the distance moved.
 */
export function applyKnockback(world: World, id: number, dirX: number, dirY: number, distM: number): number {
  const z = world.zombies;
  if (!isZombieAlive(z, id) || distM <= 0) return 0;
  distM *= knockbackShare(world, id);
  if (distM <= 0) return 0;
  const x = z.x[id] as number;
  const y = z.y[id] as number;
  const d = sweptMove(world, id, dirX, dirY, distM);
  knockbackTrace.fn?.(id, x, y, z.x[id] as number, z.y[id] as number);
  return d;
}

/**
 * Moves zombie `id` up to `distM` along the unit (dirX, dirY), swept: it stops when its body touches a
 * map solid or a wall building, and never leaves the map (`applyKnockback`; FX-B1: hit pushback too).
 * Allocation-free. Returns the distance moved.
 */
function sweptMove(world: World, id: number, dirX: number, dirY: number, distM: number): number {
  const z = world.zombies;
  const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
  const x = z.x[id] as number;
  const y = z.y[id] as number;
  const mx = dirX * distM;
  const my = dirY * distM;
  // Review L4: the map edge cuts the move first (clamping after the sweep could slide the body
  // along the edge into a box the swept line missed).
  const { widthM, heightM } = world.map;
  let t = 1;
  if (mx > 0) t = Math.min(t, (widthM - r - x) / mx);
  else if (mx < 0) t = Math.min(t, (r - x) / mx);
  if (my > 0) t = Math.min(t, (heightM - r - y) / my);
  else if (my < 0) t = Math.min(t, (r - y) / my);
  t = Math.max(0, t);
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length && t > 0; i++) t = knockT(x, y, mx, my, r, solids[i] as MapBox, t);
  const list = world.buildings.list;
  for (let i = 0; i < list.length && t > 0; i++) {
    const b = list[i] as Building;
    if (b.solid) t = knockT(x, y, mx, my, r, b, t); // Story 5.9: only walls stop it (a spike trap or a mine is floor)
  }
  const d = t < 1 ? Math.max(0, t * distM - KNOCK_FACE_GAP_M) : distM;
  z.x[id] = Math.min(widthM - r, Math.max(r, x + dirX * d));
  z.y[id] = Math.min(heightM - r, Math.max(r, y + dirY * d));
  return d;
}

/**
 * Story 5.2: a test-only probe of every knockback leg (zombie, from, to). Several knocks of one tick
 * (four axes on one zombie) make a path whose start-to-end chord can cut a box corner that no leg
 * touches, so the fuzz checks each leg here. Null in the game (one null check per knock).
 */
export const knockbackTrace: { fn: ((id: number, x0: number, y0: number, x1: number, y1: number) => void) | null } = { fn: null };
