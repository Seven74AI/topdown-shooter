import type { World } from "./world";

/**
 * Story 10.12 (Q4 B, B6): god mode spares this player: the world-wide dev switch (`world.debug.godMode`: solo, bots,
 * `?stress`) or an admin's online cheat for their own survivor (`world.godPlayers`). Allocation-free.
 */
export function isGodFor(world: Readonly<World>, p: { readonly id: string }): boolean {
  return world.debug.godMode || (world.godPlayers.size > 0 && world.godPlayers.has(p.id));
}
