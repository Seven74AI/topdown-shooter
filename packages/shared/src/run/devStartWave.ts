import type { Balance } from "../config/balance";
import type { World } from "../core/world";

/**
 * Story 6.1 (D4; brief line 18) dev switch "start at wave N": server `DEV_START_WAVE=7` (dev only),
 * solo `?startwave=7` (dev builds only). The run's first build phase then leads into wave N, and it
 * applies wave N's decay stage (all mutations of stages 1..stage, like any build start that jumps
 * stages). Combine with `?wallet=` / `DEV_STARTING_WALLET` for money. The `applyTestScenario` /
 * `NET150_START_WAVE` pattern: only the wave counter is set; nothing else is skipped or faked.
 */

/** A start wave from text: an integer 1 … `waves.runWaves`, else null (absent or invalid: the run starts at wave 1). */
export function parseStartWave(raw: string | null | undefined, balance: Balance): number | null {
  if (raw === null || raw === undefined || !/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= balance.waves.runWaves ? n : null;
}

/**
 * Sets a just-created World (still in the lobby, before `startBuild`) to start at wave `wave`: the
 * wave counter one below it, so the first build start sees wave `wave` coming. Throws outside the lobby.
 */
export function applyStartWave(world: World, wave: number): void {
  if (world.run.phase !== "lobby") throw new Error(`applyStartWave: only before the first build (phase "${world.run.phase}")`);
  if (!Number.isInteger(wave) || wave < 1 || wave > world.balance.waves.runWaves) throw new Error(`applyStartWave: wave ${wave} is not 1 … ${world.balance.waves.runWaves}`);
  world.waves.number = wave - 1;
}
