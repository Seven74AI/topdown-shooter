/** The first decay stage (`stage1_evening`): every run starts here. */
export const FIRST_DECAY_STAGE = 1;

/**
 * Story 4.2: THE accessor for the current decay stage (1–5). Everything that depends on the stage
 * (active cover, Story 4.3's spawn points, Story 4.5's mutations) reads it here. Story 4.5: it is
 * `world.decay.stage`, changed only by `decay/applyDecayStage.ts` (World creation, a build start,
 * the solo dev cheat; the client copies from the room state).
 */
export function currentDecayStage(world: { readonly decay: { readonly stage: number } }): number {
  return world.decay.stage;
}
