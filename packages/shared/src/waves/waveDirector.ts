import type { Balance } from "../config/balance";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { spawnZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";

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
  };
}

/** Zombies in wave `number` for `playerCount` players. Story 3.10 adds the ×0.6 / ×0.8 scaling here. */
export function waveSize(balance: Balance, number: number, playerCount: number): number {
  void playerCount; // Epic 1 is solo: ×1.0
  return number * balance.waves.zombiesPerWave;
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

function spawnWaveZombie(world: World): boolean {
  const sp = world.map.spawnPoints[pickSpawnPoint(world)];
  if (!sp) return false;
  const { widthM, heightM } = world.map;
  const onHorizontalEdge = sp.y < 1 || sp.y > heightM - 1;
  const jitter = world.balance.waves.spawnJitterM;
  const j = world.rng.range(-jitter, jitter);
  const stats = world.balance.zombies.types.walker;
  if (!stats) throw new Error("waves: no balance for walker");
  const r = stats.radiusM;
  const x = Math.min(widthM - r, Math.max(r, onHorizontalEdge ? sp.x + j : sp.x));
  const y = Math.min(heightM - r, Math.max(r, onHorizontalEdge ? sp.y : sp.y + j));
  return spawnZombie(world, "walker", x, y, true) >= 0;
}

/** Players in the World (the wave size counts them; Story 3.10 scales by it). */
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
 * Wave director (FR28, FR30), one tick of a wave in progress: wave N spawns N × 40 Walkers from
 * spawn points at the map edges, at most `maxAlive` alive at once, the rest queued. When 5 remain
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
