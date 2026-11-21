import type { Balance } from "../config/balance";
import type { SystemFn } from "../core/systems";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";

export type WavePhase = "intro" | "active" | "pause";

export interface WaveState {
  /** Current (or last finished) wave number; 0 before wave 1. */
  number: number;
  phase: WavePhase;
  /** Size of the current wave. */
  size: number;
  /** Zombies of this wave still waiting to spawn. */
  queued: number;
  /** Zombies of this wave left (alive + queued); 0 between waves. */
  remaining: number;
  /** Ticks until the next phase change (intro / pause). */
  timerTicks: number;
  /** Ticks until the next spawn batch (active). */
  spawnTimerTicks: number;
  /** The last-5 rush has started for this wave. */
  rushing: boolean;
  /** Dev cheat (Story 1.11): no waves advance. */
  paused: boolean;
}

export function createWaveState(balance: Balance): WaveState {
  return {
    number: 0,
    phase: "intro",
    size: 0,
    queued: 0,
    remaining: 0,
    timerTicks: ticksFor(balance.waves.firstWaveDelayS),
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

function startWave(world: World): void {
  const w = world.waves;
  w.number += 1;
  w.size = waveSize(world.balance, w.number, Math.max(1, alivePlayers.length));
  w.queued = w.size;
  w.remaining = w.size;
  w.rushing = false;
  w.phase = "active";
  w.spawnTimerTicks = 0; // first batch this tick
  world.events.emit({ type: "wave.started", number: w.number, size: w.size });
}

/** Ends the current wave at once (used by the wave director and by the skip-wave dev cheat). */
export function endWave(world: World): void {
  const w = world.waves;
  w.phase = "pause";
  w.queued = 0;
  w.remaining = 0;
  w.rushing = false;
  w.timerTicks = ticksFor(world.balance.waves.pauseBetweenWavesS);
  world.events.emit({ type: "wave.ended", number: w.number });
}

/**
 * Wave director (FR28, FR30): intro → wave 1 → pause (5 s) → wave 2 … Wave N spawns N × 40 Walkers from
 * spawn points at the map edges, at most `maxAlive` alive at once, the rest queued. When 5 remain
 * (alive + queued, queue empty) they rush the nearest player. Timers count ticks.
 */
export const updateWaves: SystemFn = (world) => {
  const w = world.waves;
  const b = world.balance.waves;
  if (w.paused || collectAlivePlayers(world) === 0) return; // a dead team stops the director

  if (w.phase !== "active") {
    w.timerTicks--;
    if (w.timerTicks > 0) return;
    startWave(world);
  }

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
  if (w.remaining === 0 && w.queued === 0) endWave(world);
};

/** Dev cheat (Story 1.11): kill every wave zombie and end the wave. */
export function skipWave(world: World): void {
  if (world.waves.phase !== "active") return;
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    if (z.waveZombie[id] === 1) killZombie(world, id, null, "cheat");
  }
  endWave(world);
}
