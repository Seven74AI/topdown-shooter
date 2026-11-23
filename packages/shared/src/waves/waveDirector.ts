import { MAX_PATHING_ZOMBIE_RADIUS_M, type Balance } from "../config/balance";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { spawnZombie } from "../zombies/zombiePool";
import { announceSpawn } from "../zombies/brute";
import { createSpawnPickState, pickSpawnPoint, type SpawnPickState } from "./spawnPick";
import { ZOMBIE_STATE, ZOMBIE_TYPES, type ZombieTypeId } from "../zombies/zombieTypes";

/**
 * Wave director state. Story 3.1: the run's phase (build / wave) lives in `world.run`
 * (`run/runStateMachine.ts`); this is only the current wave's spawning.
 */
export interface WaveState extends SpawnPickState {
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
  /**
   * Story 5.7: this wave's fixed zombies per type (`waves.json › fixed`, part of `typeTarget`) and how
   * many of them have spawned; they wait until `fixedAt` wave zombies have spawned, then go first.
   */
  readonly fixedTarget: Uint16Array;
  readonly fixedSpawned: Uint16Array;
  fixedAt: number;
  /** Story 5.7: Brutes spawned this run (the "Brute!" banner shows for the first only). */
  brutesSpawned: number;
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
    fixedTarget: new Uint16Array(ZOMBIE_TYPES.length), // Story 5.7
    fixedSpawned: new Uint16Array(ZOMBIE_TYPES.length),
    fixedAt: 0,
    brutesSpawned: 0,
    ...createSpawnPickState(), // Story 4.3
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

/**
 * Story 5.7 (FR29, D5): wave `number`'s fixed zombies (`waves.json › fixed`, not scaled by player
 * count) into `fixedOut`, and folded into `typeTarget`: each fixed zombie takes a slot of the mix's
 * share, Walkers first, then the type with the largest share (ties: the earlier type). The wave size
 * is unchanged. Waves past the list have none.
 */
export function applyFixedCounts(balance: Balance, number: number, size: number, typeTarget: Uint16Array, fixedOut: Uint16Array): void {
  fixedOut.fill(0);
  const fixed = balance.waves.fixed[number - 1];
  if (!fixed) return;
  let total = 0;
  for (let t = 0; t < ZOMBIE_TYPES.length; t++) {
    const c = Math.min(fixed[ZOMBIE_TYPES[t] as string] ?? 0, size - total);
    fixedOut[t] = c;
    total += c;
  }
  if (total === 0) return;
  // Take `total` slots off the mix's share (Walkers first, then the largest share).
  for (let left = total; left > 0; left--) {
    let from = (typeTarget[0] as number) > 0 ? 0 : -1;
    if (from < 0) for (let t = 1; t < ZOMBIE_TYPES.length; t++) if ((typeTarget[t] as number) > 0 && (from < 0 || (typeTarget[t] as number) > (typeTarget[from] as number))) from = t;
    if (from < 0) break; // unreachable: the shares add up to the size ≥ total
    typeTarget[from] = (typeTarget[from] as number) - 1;
  }
  for (let t = 0; t < ZOMBIE_TYPES.length; t++) typeTarget[t] = (typeTarget[t] as number) + (fixedOut[t] as number);
}

/** Standing players this tick (the director stops when none is). */
function countAlivePlayers(world: World): number {
  let n = 0;
  for (const p of world.players.values()) if (p.status === "alive") n++;
  return n;
}

function waveZombiesAlive(world: World): number {
  const z = world.zombies;
  let n = 0;
  for (let i = 0; i < z.aliveCount; i++) if (z.waveZombie[z.aliveIds[i] as number] === 1) n++;
  return n;
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
  // Story 5.7: once `fixedAt` wave zombies are out, the fixed ones go first (the Brute after 25 %).
  if (w.size - w.queued >= w.fixedAt) {
    for (let t = 0; t < ZOMBIE_TYPES.length; t++) if ((w.fixedSpawned[t] as number) < (w.fixedTarget[t] as number)) return t;
  }
  let best = -1;
  for (let t = 0; t < ZOMBIE_TYPES.length; t++) {
    // The mix's share only (fixed zombies are held above).
    const target = (w.typeTarget[t] as number) - (w.fixedTarget[t] as number);
    const done = (w.typeSpawned[t] as number) - (w.fixedSpawned[t] as number);
    if (done >= target) continue;
    if (best < 0) {
      best = t;
      continue;
    }
    const bt = (w.typeTarget[best] as number) - (w.fixedTarget[best] as number);
    const bd = (w.typeSpawned[best] as number) - (w.fixedSpawned[best] as number);
    if ((done + 1) * bt < (bd + 1) * target) best = t;
  }
  return best < 0 ? 0 : best;
}

/**
 * Story 5.7: the jitter of a zombie of radius r: `spawnJitterM`, less what the body is wider than
 * the pathing limit (0.35 m), so jitter + radius never exceeds a Walker's (1 + 0.35 m): the Downtown
 * spawn areas that are clear for a Walker (the 3 m alley mouths) are clear for a Brute too.
 */
export function spawnJitterFor(balance: Balance, radiusM: number): number {
  return Math.max(0, balance.waves.spawnJitterM - Math.max(0, radiusM - MAX_PATHING_ZOMBIE_RADIUS_M));
}

/**
 * The largest jitter + radius of any zombie type: how far from a spawn point (along its axis, then
 * on every side) a spawned body can reach. The map tests grow each spawn's area by it.
 */
export function spawnReachM(balance: Balance): number {
  let m = 0;
  for (const t of Object.values(balance.zombies.types)) m = Math.max(m, spawnJitterFor(balance, t.radiusM) + t.radiusM);
  return m;
}

/** `jitteredSpawn` result (reused). */
const spawnAt = { x: 0, y: 0 };

/**
 * Where a wave zombie of radius r appears for spawn point sp and jitter j ∈ [−spawnJitterM,
 * spawnJitterM]: moved by j along the point's `jitterAxis` (Story 4.3: a window along its building's
 * face, a manhole along its street; without one, Story 4.1's rule: x on the top/bottom map edges, y
 * otherwise), clamped inside the map. Exported for the Downtown fuzz test (the same rule).
 */
export function jitteredSpawn(
  world: Readonly<World>,
  sp: { x: number; y: number; jitterAxis?: "x" | "y" },
  j: number,
  r: number,
  out: { x: number; y: number },
): void {
  const { widthM, heightM } = world.map;
  const alongX = sp.jitterAxis !== undefined ? sp.jitterAxis === "x" : sp.y < 1 || sp.y > heightM - 1;
  out.x = Math.min(widthM - r, Math.max(r, alongX ? sp.x + j : sp.x));
  out.y = Math.min(heightM - r, Math.max(r, alongX ? sp.y : sp.y + j));
}

/** False when no zombie spawned (held by the spawn pick, Story 4.3, or the pool is full): the queue keeps it. */
function spawnWaveZombie(world: World): boolean {
  const sp = world.map.spawnPoints[pickSpawnPoint(world)];
  if (!sp) return false;
  const typeIndex = waveZombieType(world); // no RNG draw
  const type = ZOMBIE_TYPES[typeIndex] as ZombieTypeId;
  const stats = world.balance.zombies.types[type];
  if (!stats) throw new Error(`waves: no balance for ${type}`);
  const jitter = spawnJitterFor(world.balance, stats.radiusM); // Story 5.7: narrower for a wide body
  const j = world.streams.spawns.range(-jitter, jitter);
  jitteredSpawn(world, sp, j, stats.radiusM, spawnAt);
  const id = spawnZombie(world, type, spawnAt.x, spawnAt.y, true);
  if (id < 0) return false;
  const w = world.waves;
  w.typeSpawned[typeIndex] = (w.typeSpawned[typeIndex] as number) + 1;
  // Story 5.7: a fixed zombie of this type counts first (the mix's share never serves one early).
  if ((w.fixedSpawned[typeIndex] as number) < (w.fixedTarget[typeIndex] as number) && w.size - w.queued >= w.fixedAt) w.fixedSpawned[typeIndex] = (w.fixedSpawned[typeIndex] as number) + 1;
  announceSpawn(world, id);
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
  applyFixedCounts(world.balance, w.number, w.size, w.typeTarget, w.fixedTarget); // Story 5.7
  w.fixedSpawned.fill(0);
  let fixedTotal = 0;
  for (let t = 0; t < ZOMBIE_TYPES.length; t++) fixedTotal += w.fixedTarget[t] as number;
  w.fixedAt = Math.min(w.size - fixedTotal, Math.round(w.size * world.balance.waves.fixedAtFraction));
  w.typeSpawned.fill(0);
  w.queued = w.size;
  w.remaining = w.size;
  w.rushing = false;
  w.spawnTimerTicks = 0; // first batch this tick
  w.spawnHeldSinceTick = -1; // Story 4.3: every wave gets the full wait before the farthest-spawn fallback
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
 * (types from `waves.json › mix`, Story 3.10) from the spawn points open at the decay stage, away from
 * the players and spread over the map sides (Story 4.3, `spawnPick.ts`), at most `maxAlive` alive at once, the rest queued. When 5 remain
 * (alive + queued, queue empty) they rush the nearest player. Timers count ticks. Returns true when
 * the wave is cleared (the run state machine then calls `endWave`). With no one standing nothing
 * spawns (the wipe ends the run).
 */
export function updateWaves(world: World): boolean {
  const w = world.waves;
  const b = world.balance.waves;
  if (countAlivePlayers(world) === 0) {
    w.spawnHeldSinceTick = -1; // Story 4.3 review L2: an interrupted hold starts over
    return false; // no one standing stops the director
  }

  w.spawnTimerTicks--;
  if (w.spawnTimerTicks <= 0 && w.queued > 0) {
    w.spawnTimerTicks = ticksFor(b.spawnIntervalS);
    const room = b.maxAlive - world.zombies.aliveCount;
    const batch = Math.min(b.spawnPerInterval, w.queued, Math.max(0, room));
    if (batch === 0) w.spawnHeldSinceTick = -1; // review L2: no pick this interval (pool full): the hold starts over
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
      if (z.waveZombie[id] === 1) z.state[id] = z.state[id] === ZOMBIE_STATE.WINDUP ? ZOMBIE_STATE.RUSH_WINDUP : ZOMBIE_STATE.RUSH; // Story 5.6: a winding-up Spitter keeps its windup
    }
    world.events.emit({ type: "wave.rush_started", count: w.remaining });
  }
  return w.remaining === 0 && w.queued === 0;
}
