import type { World } from "../core/world";
import { bossBodyOn } from "../boss/bossState";
import { createExplosionSpec, explode } from "../combat/explosion";
import { zombieTypeOf } from "../zombies/zombiePool";
import { buildingStats, removeBuilding, type Building } from "./buildings";

/**
 * Story 5.9: mines (GDD › Buildings and Defenses: single use, 80 damage in 2.5 m).
 *
 * Runs in the `buildings` slot after the traps AND (review L1) at the end of the zombies system, on
 * the positions the zombies just moved to, during waves only (a build phase never sets one off).
 * Fairness rules:
 *
 * - **F7 one trigger, one blast, same tick:** on the tick an alive zombie's body first overlaps the
 *   trigger circle (`triggerRadiusM` round the mine's centre, strict) the mine explodes (no fuse,
 *   DD4), `mine.exploded` is emitted and the mine is removed (`removeBuilding`: the cap is freed,
 *   `version` +1, `wallVersion` untouched: no flow-field rebuild). It can never explode twice.
 * - **F6 zombies only:** players never trigger a mine (walking over one is safe).
 * - **No chains (DD7):** a blast never looks at other mines; a mine only goes off by its own trigger.
 * - The blast is the shared `explode` (F5 cover, F6 50 % to standing players, no building damage).
 *   Story 5.5: kind "mine"; players take `damage` through the friendly-fire rule (`damagePlayerBy`:
 *   50 % = `playerShare`, which the balance cross-check ties to it), kills pay the owner (`buildingId`).
 *
 * The trigger is checked on every alive zombie's current position (a linear pass: ≤ 24 mines × the
 * alive zombies; the spatial grid is a tick old here and misses a zombie spawned last tick). No
 * allocation.
 */

/** Mines set off, summed over every World (tests, sims, liveness asserts: reset it first). */
export const mineCounters = { exploded: 0 };

/** Story 5.5: the blast spec, reused (no allocation per blast). */
const spec = createExplosionSpec();

/** A zombie's body overlaps the circle (x, y, r) right now (strict). */
function zombieTouches(world: World, x: number, y: number, r: number): boolean {
  const z = world.zombies;
  for (let k = 0; k < z.aliveCount; k++) {
    const id = z.aliveIds[k] as number;
    const reach = r + (world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0);
    const dx = (z.x[id] as number) - x;
    const dy = (z.y[id] as number) - y;
    if (dx * dx + dy * dy < reach * reach) return true;
  }
  return false;
}

/** Story 6.5: the Behemoth's body overlaps the circle (x, y, r) right now (strict). */
function bossTouches(world: World, x: number, y: number, r: number): boolean {
  const b = world.boss;
  if (!bossBodyOn(b)) return false;
  const reach = r + world.balance.boss.radiusM;
  const dx = b.x - x;
  const dy = b.y - y;
  return dx * dx + dy * dy < reach * reach;
}

export function updateMines(world: World): void {
  // Story 6.5 (AC 11): a mine under the Behemoth's body goes off as for a zombie.
  if (world.run.phase !== "wave" || (world.zombies.aliveCount === 0 && !bossBodyOn(world.boss))) return;
  const list = world.buildings.list;
  // From the end: an explosion removes the mine from the list.
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i] as Building;
    if (b.solid) continue;
    const m = buildingStats(world.balance, b.type)?.mine;
    if (!m) continue;
    const x = (b.minX + b.maxX) / 2;
    const y = (b.minY + b.maxY) / 2;
    if (!zombieTouches(world, x, y, m.triggerRadiusM) && !bossTouches(world, x, y, m.triggerRadiusM)) continue;
    removeBuilding(world, b.id); // first: gone before its own blast's kills are paid (cap freed)
    world.events.emit({ type: "mine.exploded", buildingId: b.id, x, y });
    mineCounters.exploded++;
    spec.x = x;
    spec.y = y;
    spec.radiusM = m.blastRadiusM;
    spec.zombieDamage = m.damage;
    spec.playerDamage = m.damage; // × friendlyFire.pct (= playerShare) inside damagePlayerBy
    spec.buildingDamage = 0; // DD6
    spec.pushM = 0; // DD9
    spec.kind = "mine";
    spec.sourcePlayerId = b.ownerId;
    spec.weapon = b.type;
    spec.buildingId = b.id;
    spec.quiet = false; // 5.9: a zombie.hit per body (unchanged)
    spec.grenadeId = 0;
    explode(world, spec);
    if (i > list.length) i = list.length; // defensive: nothing else is removed by a blast (DD6)
  }
}
