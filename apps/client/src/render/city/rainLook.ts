import { isBlackout, type World } from "@topdown/shared";

/**
 * Story 6.3 (D7): the normal rain's alpha this frame: `base`, × `decay.json › blackout.rainK` (35 %)
 * in a blackout (faint over the dark; the beams sparkle instead). Pure (tested without Phaser).
 */
export function rainAlphaFor(world: World, base: number): number {
  return isBlackout(world) ? base * world.balance.decay.blackout.rainK : base;
}

/** Story 6.3 (designer B3): the hazard ghosts' share of their look this frame (0 = no blackout). */
export function hazardGhostFor(world: World): number {
  return isBlackout(world) ? world.balance.decay.blackout.hazardAboveDarkPct / 100 : 0;
}
