import { MAP_STAGE_COUNT, changeDecayStage, killZombie, parseRunSeed, setForcedBlackout, type Building, type World } from "@topdown/shared";

/** Pure helpers of the dev cheats (Story 1.11). Imported only by DevCheats.tsx, so they leave release builds with it. */

export const MIN_SPAWN = 1;
export const MAX_SPAWN = 200;

export const clampSpawnCount = (n: number): number =>
  Number.isFinite(n) ? Math.min(MAX_SPAWN, Math.max(MIN_SPAWN, Math.round(n))) : MIN_SPAWN;

/** A typed run seed: decimal or 0x-hex uint32, or null when invalid (Story 4.4: shared with `?seed=`). */
export const parseSeed = (text: string): number | null => parseRunSeed(text);

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

/**
 * Dev cheat (Story 4.2, solo only; Story 4.5: merged into the decay engine): moves the run to decay
 * stage 1–5 through the DecaySystem's own path (`changeDecayStage`: the map's mutations, cover and
 * spawn points by `minStage`, building refunds, push-outs, flow fields rebuilt, `decay.stage_changed`
 * and its banner) — the same code a build start runs. Online the server owns the stage.
 * Review L1: only in a build phase (or the lobby), like a real decay change — never mid-wave; in any
 * other phase nothing happens (the panel disables the control: `decayCheatAllowed`). The next build
 * start applies the timeline's stage again. Returns the stage now in force.
 */
export function setDecayStageCheat(world: World, stage: number): number {
  if (!decayCheatAllowed(world)) return world.decay.stage;
  const s = Math.min(MAP_STAGE_COUNT, Math.max(1, Math.round(stage)));
  changeDecayStage(world, s);
  return world.decay.stage;
}

/** Review L1: the decay stage cheat works only where a real stage change could happen (build phase, lobby). */
export function decayCheatAllowed(world: World): boolean {
  return world.run.phase === "build" || world.run.phase === "lobby";
}

/**
 * Story 6.3 dev cheat (solo only, any phase): at least this dark (20 / 10 / 5 %; never lightens a
 * darker wave, Results lit — review H1) or −1 = off (back to the real rule). Goes through the shared `setForcedBlackout` → `refreshBlackout`. Returns
 * the level now in force.
 */
export function setForcedBlackoutCheat(world: World, pct: number): number {
  setForcedBlackout(world, pct);
  return world.lights.blackoutPct;
}
