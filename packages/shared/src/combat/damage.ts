import type { World } from "../core/world";
import { isZombieAlive, killZombie, zombieTypeOf } from "../zombies/zombiePool";
import type { WeaponId } from "./weapons";

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
  z.hp[id] = (z.hp[id] as number) - amount;
  const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
  const { widthM, heightM } = world.map;
  z.x[id] = Math.min(widthM - r, Math.max(r, (z.x[id] as number) + dirX * pushbackM));
  z.y[id] = Math.min(heightM - r, Math.max(r, (z.y[id] as number) + dirY * pushbackM));
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
