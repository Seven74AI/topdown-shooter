import { killZombie, type Building, type World } from "@topdown/shared";

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

/**
 * Dev cheat (Story 3.7, until Story 3.5's zombies damage buildings): takes `fraction` of its max HP
 * from the building nearest to (x, y), never below 1 HP. Returns the building, or null when none.
 */
export function damageNearestBuilding(world: World, x: number, y: number, fraction: number): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of world.buildings.list) {
    const d = ((b.minX + b.maxX) / 2 - x) ** 2 + ((b.minY + b.maxY) / 2 - y) ** 2; // box centre (works with any grid anchoring)
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (best) best.hp = Math.max(1, best.hp - best.maxHp * fraction);
  return best;
}
