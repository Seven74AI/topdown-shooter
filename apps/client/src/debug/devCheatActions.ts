import { CHEAT_SPAWN_MAX, CHEAT_SPAWN_MIN, parseRunSeed, setForcedBlackout, startBossWarning, type World } from "@topdown/shared";

/** Pure helpers of the dev cheats (Story 1.11). Imported only by DevCheats.tsx, so they leave release builds with it. */

export const MIN_SPAWN = CHEAT_SPAWN_MIN;
export const MAX_SPAWN = CHEAT_SPAWN_MAX;

/** Story 10.12: the world cheats live in shared now (`debug/adminCheats.ts`), so the server runs the online ones too. */
export { clampSpawnCount, damageNearestBuilding, decayCheatAllowed, leaveLast, setDecayStageCheat } from "@topdown/shared";

/** A typed run seed: decimal or 0x-hex uint32, or null when invalid (Story 4.4: shared with `?seed=`). */
export const parseSeed = (text: string): number | null => parseRunSeed(text);

/**
 * Story 6.3 dev cheat (solo only, any phase): at least this dark (20 / 10 / 5 %; never lightens a
 * darker wave, Results lit — review H1) or −1 = off (back to the real rule). Goes through the shared `setForcedBlackout` → `refreshBlackout`. Returns
 * the level now in force.
 */
export function setForcedBlackoutCheat(world: World, pct: number): number {
  setForcedBlackout(world, pct);
  return world.lights.blackoutPct;
}

/**
 * Story 6.5 dev cheat "Spawn Behemoth" (solo; online the server's `DEV_BOSS_WAVES`): starts the
 * 4 s warning now, in any wave (the real entry rule and arrival). False outside a wave or while a
 * Behemoth is already warning or walking.
 */
export function spawnBehemothCheat(world: World): boolean {
  return startBossWarning(world);
}
