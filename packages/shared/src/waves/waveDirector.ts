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

function countAlivePlayers(world: World): number {
  let n = 0;
  world.players.forEach((p) => {
    if (p.status === "alive") n++;
  });
  return n;
}

function waveZombiesAlive(world: World): number {
  const z = world.zombies;
  let n = 0;
  for (let i = 0; i < z.aliveCount; i++) if (z.waveZombie[z.aliveIds[i] as number] === 1) n++;
  return n;
}

/** Distance from (x, y) to the nearest alive player (Infinity if none). */
function nearestPlayerDistance(world: World, x: number, y: number): number {
  let nearest = Infinity;
  for (const p of world.players.values()) {
    if (p.status === "alive") nearest = Math.min(nearest, Math.hypot(p.x - x, p.y - y));
  }
  return nearest;
}

/** Index of a spawn point at least spawnMinPlayerDistanceM from every alive player (seeded pick), or the farthest. */
function pickSpawnPoint(world: World): number {
  const points = world.map.spawnPoints;
  const minD = world.balance.waves.spawnMinPlayerDistanceM;
  let okCount = 0;
  let farthest = 0;
  let farthestD = -1;
  for (let i = 0; i < points.length; i++) {
    const sp = points[i] as (typeof points)[number];
    const d = nearestPlayerDistance(world, sp.x, sp.y);
    if (d >= minD) okCount++;
    if (d > farthestD) {
      farthestD = d;
      farthest = i;
    }
  }
  if (okCount === 0) return farthest;
  let pick = world.rng.int(0, okCount - 1);
  for (let i = 0; i < points.length; i++) {
    const sp = points[i] as (typeof points)[number];
    if (nearestPlayerDistance(world, sp.x, sp.y) >= minD && pick-- === 0) return i;
  }
  return farthest;
}

/** Jitter a spawn ±1 m along the edge it sits on, so a batch doesn't stack. */
const EDGE_JITTER_M = 1;

function spawnWaveZombie(world: World): boolean {
  const sp = world.map.spawnPoints[pickSpawnPoint(world)];
  if (!sp) return false;
  const { widthM, heightM } = world.map;
  const onHorizontalEdge = sp.y < 1 || sp.y > heightM - 1;
  const j = world.rng.range(-EDGE_JITTER_M, EDGE_JITTER_M);
  const r = world.balance.zombies.types.walker?.radiusM ?? 0.35;
  const x = Math.min(widthM - r, Math.max(r, onHorizontalEdge ? sp.x + j : sp.x));
  const y = Math.min(heightM - r, Math.max(r, onHorizontalEdge ? sp.y : sp.y + j));
  return spawnZombie(world, "walker", x, y, true) >= 0;
}

function startWave(world: World): void {
  const w = world.waves;
  w.number += 1;
  w.size = waveSize(world.balance, w.number, Math.max(1, countAlivePlayers(world)));
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
  if (w.paused || countAlivePlayers(world) === 0) return; // a dead team stops the director

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
