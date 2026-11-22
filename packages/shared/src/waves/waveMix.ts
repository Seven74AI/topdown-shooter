import type { Balance } from "../config/balance";
import { ZOMBIE_TYPES, type ZombieTypeId } from "../zombies/zombieTypes";

/** Longest dev wave mix accepted (a pattern, not a wave list). */
export const MAX_WAVE_MIX = 16;

/**
 * Dev / test hook (Story 3.9; Story 3.10 keeps it as an override of the `waves.json › mix`
 * composition): parses `"walker,walker,crawler"` into the types wave zombies cycle through
 * (`world.debug.waveMix`).
 * Unknown ids and types without balance are dropped; null when nothing valid is left.
 */
export function parseWaveMix(raw: string | null | undefined, balance: Balance): readonly ZombieTypeId[] | null {
  if (!raw) return null;
  const out: ZombieTypeId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    const type = ZOMBIE_TYPES.find((t) => t === id);
    if (type && balance.zombies.types[type] && out.length < MAX_WAVE_MIX) out.push(type);
  }
  return out.length > 0 ? out : null;
}
