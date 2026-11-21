import type { World } from "../core/world";
import { isZombieAlive, killZombie, zombieTypeOf } from "../zombies/zombiePool";
import type { WeaponId } from "./weapons";

/**
 * Damages a zombie hit along direction (dirX, dirY): emits `zombie.hit`, pushes it back by
 * `pushbackM` (clamped to the map) and kills it at 0 HP (emits `zombie.killed`).
 * Returns true if the zombie died.
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
): boolean {
  const z = world.zombies;
  if (!isZombieAlive(z, id)) return false;
  z.hp[id] = (z.hp[id] as number) - amount;
  const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
  const { widthM, heightM } = world.map;
  z.x[id] = Math.min(widthM - r, Math.max(r, (z.x[id] as number) + dirX * pushbackM));
  z.y[id] = Math.min(heightM - r, Math.max(r, (z.y[id] as number) + dirY * pushbackM));
  world.events.emit({
    type: "zombie.hit",
    zombieId: id,
    x: z.x[id] as number,
    y: z.y[id] as number,
    dirX,
    dirY,
    damage: amount,
    weapon,
  });
  if ((z.hp[id] as number) <= 0) {
    killZombie(world, id, killerId, weapon);
    return true;
  }
  return false;
}
