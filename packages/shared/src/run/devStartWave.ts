import type { Balance } from "../config/balance";
import type { World } from "../core/world";

/**
 * Story 6.1 (D4; brief line 18) dev switch "start at wave N": server `DEV_START_WAVE=7` (dev only),
 * solo `?startwave=7` (dev builds only). The run's first build phase then leads into wave N, and it
 * applies wave N's decay stage (all mutations of stages 1..stage, like any build start that jumps
 * stages). Combine with `?wallet=` / `DEV_STARTING_WALLET` for money. The `applyTestScenario` /
 * `NET150_START_WAVE` pattern: only the wave counter is set; nothing else is skipped or faked.
 */

/** Story 6.12 (AC 13): the highest start wave the switch accepts (endless waves past `runWaves`). */
export const MAX_START_WAVE = 99;

/**
 * A start wave from text: an integer 1 … `MAX_START_WAVE`, else null (absent or invalid: the run
 * starts at wave 1). Story 6.12: a wave past `waves.runWaves` starts the run in endless (dev only).
 */
export function parseStartWave(raw: string | null | undefined, balance: Balance): number | null {
  void balance;
  if (raw === null || raw === undefined || !/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= MAX_START_WAVE ? n : null;
}

/**
 * Sets a just-created World (still in the lobby, before `startBuild`) to start at wave `wave`: the
 * wave counter one below it, so the first build start sees wave `wave` coming. Throws outside the lobby.
 */
export function applyStartWave(world: World, wave: number): void {
  if (world.run.phase !== "lobby") throw new Error(`applyStartWave: only before the first build (phase "${world.run.phase}")`);
  if (!Number.isInteger(wave) || wave < 1 || wave > MAX_START_WAVE) throw new Error(`applyStartWave: wave ${wave} is not 1 … ${MAX_START_WAVE}`);
  world.waves.number = wave - 1;
  world.run.endless = wave > world.balance.waves.runWaves; // Story 6.12 (AC 13): as if the team had chosen Stay
}
