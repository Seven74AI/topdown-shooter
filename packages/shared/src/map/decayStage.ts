import type { WorldDebug } from "../core/world";

/** The first decay stage (`stage1_evening`): every run starts here. */
export const FIRST_DECAY_STAGE = 1;

/**
 * Story 4.2: THE accessor for the current decay stage (1–5). Everything that depends on the stage
 * (active cover today; spawn points in Story 4.3) reads it here, so Story 4.5 changes one body.
 * Until 4.5 the stage is 1, except the solo dev cheat's override (`world.debug.decayStage`).
 */
export function currentDecayStage(world: { readonly debug: Readonly<WorldDebug> }): number {
  return world.debug.decayStage ?? FIRST_DECAY_STAGE;
}
