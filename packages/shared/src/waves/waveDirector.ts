import type { Balance } from "../config/balance";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { spawnZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE, ZOMBIE_TYPES, type ZombieTypeId } from "../zombies/zombieTypes";

/**
 * Wave director state. Story 3.1: the run's phase (build / wave) lives in `world.run`
 * (`run/runStateMachine.ts`); this is only the current wave's spawning.
 */
export interface WaveState {
  /** Current (or last finished) wave number; 0 before wave 1. */
  number: number;
  /** Size of the current wave. */
  size: number;
  /** Zombies of this wave still waiting to spawn. */
  queued: number;
  /** Zombies of this wave left (alive + queued); 0 between waves. */
  remaining: number;
  /** Ticks until the next spawn batch (during a wave). */
  spawnTimerTicks: number;
  /** The last-5 rush has started for this wave. */
  rushing: boolean;
  /** Dev cheat (Story 1.11, `DEV_NO_WAVES`, `?stress`): the run state machine stands still (no build countdown, no waves). */
  paused: boolean;
  /**
   * Story 3.10: this wave's zombies per type (index = `ZOMBIE_TYPES` index), from `waves.json › mix`,
   * and how many of each have spawned. Preallocated; filled by `beginWave`.
   */
  readonly typeTarget: Uint16Array;
  readonly typeSpawned: Uint16Array;
}

export function createWaveState(): WaveState {
  return {
    number: 0,
    size: 0,
    queued: 0,
    remaining: 0,
    spawnTimerTicks: 0,
    rushing: false,
    paused: false,
    typeTarget: new Uint16Array(ZOMBIE_TYPES.length),
    typeSpawned: new Uint16Array(ZOMBIE_TYPES.length),
  };
}

/**
 * Zombies in wave `number` for `playerCount` players (FR28, FR31): `number × zombiesPerWave` at 4
 * players, × `playerCountScale[players − 1]` (0.4 / 0.6 / 0.8 / 1.0), rounded, at least 1.
 */
export function waveSize(balance: Balance, number: number, playerCount: number): number {
  const b = balance.waves;
  const scales = b.playerCountScale;
  const i = Math.min(scales.length, Math.max(1, playerCount)) - 1;
  return Math.max(1, Math.round(number * b.zombiesPerWave * (scales[i] as number)));
}

/** The `waves.json › mix` entry of wave `number` (waves past the list use the last entry). */
export function waveMixOf(balance: Balance, number: number): Readonly<Record<string, number>> {
  const mix = balance.waves.mix;
  return mix[Math.min(mix.length, Math.max(1, number)) - 1] as Readonly<Record<string, number>>;
}

/**
 * Story 3.10 (FR29): exact zombies per type for a wave of `size` with `mix` weights, written into
 * `out` (index = `ZOMBIE_TYPES` index): `floor(size × w / W)` each, then the leftover handed out one
 * by one in `ZOMBIE_TYPES` order among the types with a positive weight.
 */
export function waveTypeCounts(mix: Readonly<Record<string, number>>, size: number, out: Uint16Array): void {
  let total = 0;
  for (let t = 0; t < ZOMBIE_TYPES.length; t++) total += mix[ZOMBIE_TYPES[t] as string] ?? 0;
  let given = 0;
  for (let t = 0; t < ZOMBIE_TYPES.length; t++) {
    const w = mix[ZOMBIE_TYPES[t] as string] ?? 0;
    const n = total > 0 ? Math.floor((size * w) / total) : 0;
    out[t] = n;
    given += n;
  }
  if (total === 0) {
    out[0] = size; // unreachable with a valid balance (each mix has a positive weight): Walkers
    return;
  }
  for (let left = size - given; left > 0; ) {
    for (let t = 0; t < ZOMBIE_TYPES.length && left > 0; t++) {
      if ((mix[ZOMBIE_TYPES[t] as string] ?? 0) > 0) {
        out[t] = (out[t] as number) + 1;
        left--;
      }
    }
  }
}

/** Alive players this tick (reused array: no allocation per spawn). */
const alivePlayers: { x: number; y: number }[] = [];

function collectAlivePlayers(world: World): number {
  alivePlayers.length = 0;
  for (const p of world.players.values()) if (p.status === "alive") alivePlayers.push(p);
  return alivePlayers.length;
}

function waveZombiesAlive(world: World): number {
  const z = world.zombies;
  let n = 0;
  for (let i = 0; i < z.aliveCount; i++) if (z.waveZombie[z.aliveIds[i] as number] === 1) n++;
  return n;
}

/** Squared distance from each spawn point to its nearest alive player (reused per spawn). */
let spawnD2 = new Float64Array(16);

/**
 * Index of a spawn point far enough from every alive player (seeded pick), or the farthest point.
 * "Far enough" includes the edge jitter, so a jittered spawn is never closer than the minimum.
 */
function pickSpawnPoint(world: World): number {
  const points = world.map.spawnPoints;
  if (spawnD2.length < points.length) spawnD2 = new Float64Array(points.length);
  const minD = world.balance.waves.spawnMinPlayerDistanceM + world.balance.waves.spawnJitterM;
  const minD2 = minD * minD;
  let okCount = 0;
  let farthest = 0;
  let farthestD2 = -1;
  for (let i = 0; i < points.length; i++) {
    const sp = points[i] as (typeof points)[number];
    let nearest = Infinity;
    for (let k = 0; k < alivePlayers.length; k++) {
      const p = alivePlayers[k] as { x: number; y: number };
      const dx = p.x - sp.x;
      const dy = p.y - sp.y;
      nearest = Math.min(nearest, dx * dx + dy * dy);
    }
    spawnD2[i] = nearest;
    if (nearest >= minD2) okCount++;
    if (nearest > farthestD2) {
      farthestD2 = nearest;
      farthest = i;
    }
  }
  if (okCount === 0) return farthest;
  let pick = world.rng.int(0, okCount - 1);
  for (let i = 0; i < points.length; i++) {
    if ((spawnD2[i] as number) >= minD2 && pick-- === 0) return i;
  }
  return farthest;
}

/**
 * Type index of the next wave zombie (Story 3.10): among the types with zombies left to spawn, the
 * one furthest behind its share, i.e. the smallest `(spawned + 1) / target` (compared as integer
 * cross products; ties go to the earlier type). So the types are spread evenly through the wave. No
 * RNG draw. The dev wave mix (Story 3.9, `world.debug.waveMix`) overrides it: cycled by spawn index.
 */
function waveZombieType(world: World): number {
  const w = world.waves;
  const dev = world.debug.waveMix;
  if (dev && dev.length > 0) return ZOMBIE_TYPES.indexOf(dev[(w.size - w.queued) % dev.length] as ZombieTypeId);
  let best = -1;
  for (let t = 0; t < ZOMBIE_TYPES.length; t++) {
    const target = w.typeTarget[t] as number;
    const done = w.typeSpawned[t] as number;
    if (done >= target) continue;
    if (best < 0) {
      best = t;
      continue;
    }
    const bt = w.typeTarget[best] as number;
    const bd = w.typeSpawned[best] as number;
    if ((done + 1) * bt < (bd + 1) * target) best = t;
  }
  return best < 0 ? 0 : best;
}

function spawnWaveZombie(world: World): boolean {
  const sp = world.map.spawnPoints[pickSpawnPoint(world)];
  if (!sp) return false;
  const { widthM, heightM } = world.map;
  const onHorizontalEdge = sp.y < 1 || sp.y > heightM - 1;
  const jitter = world.balance.waves.spawnJitterM;
  const j = world.rng.range(-jitter, jitter);
  const typeIndex = waveZombieType(world);
  const type = ZOMBIE_TYPES[typeIndex] as ZombieTypeId;
  const stats = world.balance.zombies.types[type];
  if (!stats) throw new Error(`waves: no balance for ${type}`);
  const r = stats.radiusM;
  const x = Math.min(widthM - r, Math.max(r, onHorizontalEdge ? sp.x + j : sp.x));
  const y = Math.min(heightM - r, Math.max(r, onHorizontalEdge ? sp.y : sp.y + j));
  if (spawnZombie(world, type, x, y, true) < 0) return false;
  world.waves.typeSpawned[typeIndex] = (world.waves.typeSpawned[typeIndex] as number) + 1;
  return true;
}

/**
 * Players in the World when the wave starts (Story 3.10 scales the size by it). A build phase always
 * comes first and returns downed/out players standing, and players who left were removed, so this
 * is "the players still in the run".
 */
let playerCount = 0;
const countPlayer = (): void => {
  playerCount++;
};

/**
 * The next wave's numbers (Story 3.1: called only by the run state machine's `startWave`): number + 1,
 * size, queue, no rush, first spawn batch on this tick; emits `wave.started`.
 */
export function beginWave(world: World): void {
  const w = world.waves;
  playerCount = 0;
  world.players.forEach(countPlayer);
  w.number += 1;
  w.size = waveSize(world.balance, w.number, Math.max(1, playerCount));
  waveTypeCounts(waveMixOf(world.balance, w.number), w.size, w.typeTarget);
  w.typeSpawned.fill(0);
  w.queued = w.size;
  w.remaining = w.size;
  w.rushing = false;
  w.spawnTimerTicks = 0; // first batch this tick
  world.events.emit({ type: "wave.started", number: w.number, size: w.size });
}

/** Clears the finished wave's counters (the run state machine's `endWave` calls it before `wave.ended`). */
export function clearWave(world: World): void {
  const w = world.waves;
  w.queued = 0;
  w.remaining = 0;
  w.rushing = false;
}

/**
 * Wave director (FR28, FR30), one tick of a wave in progress: wave N spawns its `waveSize` zombies
 * (types from `waves.json › mix`, Story 3.10) from spawn points at the map edges, at most `maxAlive` alive at once, the rest queued. When 5 remain
 * (alive + queued, queue empty) they rush the nearest player. Timers count ticks. Returns true when
 * the wave is cleared (the run state machine then calls `endWave`). With no one standing nothing
 * spawns (the wipe ends the run).
 */
export function updateWaves(world: World): boolean {
  const w = world.waves;
  const b = world.balance.waves;
  if (collectAlivePlayers(world) === 0) return false; // no one standing stops the director

  w.spawnTimerTicks--;
  if (w.spawnTimerTicks <= 0 && w.queued > 0) {
    w.spawnTimerTicks = ticksFor(b.spawnIntervalS);
    const room = b.maxAlive - world.zombies.aliveCount;
    const batch = Math.min(b.spawnPerInterval, w.queued, Math.max(0, room));
    for (let i = 0; i < batch; i++) {
      if (!spawnWaveZombie(world)) break;
      w.queued--;
    }
  }

  w.remaining = waveZombiesAlive(world) + w.queued;
  if (!w.rushing && w.queued === 0 && w.remaining > 0 && w.remaining <= b.lastRushCount) {
    w.rushing = true;
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      if (z.waveZombie[id] === 1) z.state[id] = ZOMBIE_STATE.RUSH;
    }
    world.events.emit({ type: "wave.rush_started", count: w.remaining });
  }
  return w.remaining === 0 && w.queued === 0;
}
