import { killZombie, type World } from "@topdown/shared";

/** Pure helpers of the dev cheats (Story 1.11). Imported only by DevCheats.tsx, so they leave release builds with it. */

export const MIN_SPAWN = 1;
export const MAX_SPAWN = 200;
const MAX_UINT32 = 0xffffffff;

export const clampSpawnCount = (n: number): number =>
  Number.isFinite(n) ? Math.min(MAX_SPAWN, Math.max(MIN_SPAWN, Math.round(n))) : MIN_SPAWN;

/** A typed run seed: decimal or 0x-hex uint32, or null when invalid. */
export function parseSeed(text: string): number | null {
  const t = text.trim();
  if (!/^(\d+|0x[0-9a-f]+)$/i.test(t)) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= MAX_UINT32 ? n : null;
}

/** Dev cheat: clears the wave's queue and kills wave zombies until `keep` are left (they then rush). */
export function leaveLast(world: World, keep: number): void {
  if (world.run.phase !== "wave") return;
  world.waves.queued = 0;
  const z = world.zombies;
  let waveAlive = 0;
  for (let i = 0; i < z.aliveCount; i++) if (z.waveZombie[z.aliveIds[i] as number] === 1) waveAlive++;
  for (let i = z.aliveCount - 1; i >= 0 && waveAlive > keep; i--) {
    const id = z.aliveIds[i] as number;
    if (z.waveZombie[id] !== 1) continue;
    killZombie(world, id, null, "cheat");
    waveAlive--;
  }
}
