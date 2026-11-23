import type { World } from "../core/world";
import { streamSeed } from "../core/seedStreams";
import { zombieTypeIndex } from "./zombieTypes";

/**
 * Story 5.7: the Brute (FR25, the wave-5 mini-boss). Its rules live in the shared systems: the
 * windup and the knockback in `zombieAi.ts` / `player/knockback.ts`, the wide-body pathing in
 * `flowField.ts`, the fixed count in `waveDirector.ts`. This file holds its spawn announcement and
 * its look.
 */

const BRUTE = zombieTypeIndex("brute");

/**
 * Every spawn path calls this after `spawnZombie` (the wave director, dev-cheat rings): a Brute's
 * spawn emits `zombie.brute_spawned` (the roar on every one; `first` = the run's first: the "Brute!"
 * banner) and counts `waves.brutesSpawned`. Other types: nothing.
 */
export function announceSpawn(world: World, id: number): void {
  if (world.zombies.type[id] !== BRUTE) return;
  const w = world.waves;
  const first = w.brutesSpawned === 0;
  w.brutesSpawned++;
  world.events.emit({ type: "zombie.brute_spawned", zombieId: id, x: world.zombies.x[id] as number, y: world.zombies.y[id] as number, first });
}

/** The Brute's five looks (BR1 riot cop, BR2 construction worker, BR3 butcher, BR4 bouncer, BR5 firefighter). */
export const BRUTE_LOOKS = 5;

/**
 * Decision round B (designer): each Brute wears one of the five looks at random, from the named
 * stream `look:brute:<netId>` of the run seed (`netId` = pool slot | generation << 8, the horde id):
 * the same look on every client, with no state in the simulation and nothing on the wire.
 * Presentation only (it allocates a key string: call once per Brute, not per frame).
 */
export function bruteLookIndex(runSeed: number, netId: number): number {
  return streamSeed(runSeed >>> 0, `look:brute:${netId}`) % BRUTE_LOOKS;
}
