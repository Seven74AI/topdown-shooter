import type { World } from "../core/world";

/** Slot → sign of the offset on each axis: 0 (−, −), 1 (+, −), 2 (−, +), 3 (+, +). */
const SIGN_X = [-1, 1, -1, 1] as const;
const SIGN_Y = [-1, -1, 1, 1] as const;

/**
 * Where the survivor in `slot` (0–3) stands at the start of a run (Story 2.4): the map centre plus
 * `(±1, ±1) × balance.player.spawnOffsetM`. Writes into `out` and returns it (no allocation).
 */
export function teamSpawnPoint<T extends { x: number; y: number }>(world: World, slot: number, out: T): T {
  const i = ((slot % 4) + 4) % 4;
  const d = world.balance.player.spawnOffsetM;
  out.x = world.map.widthM / 2 + (SIGN_X[i] as number) * d;
  out.y = world.map.heightM / 2 + (SIGN_Y[i] as number) * d;
  return out;
}
