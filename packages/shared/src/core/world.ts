import type { Balance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { PlayerInput } from "../net/input";
import { PLACEHOLDER_MAP, type DistrictMap } from "../map/placeholderMap";
import { createWaveState, type WaveState } from "../waves/waveDirector";
import { createRunState, type RunState } from "../run/runStateMachine";
import type { PlayerState } from "../player/player";
import { GRID_CELL_M, PROJECTILE_POOL_CAPACITY, ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { createProjectilePool, type ProjectilePool } from "../combat/projectilePool";
import { createZombiePool, type ZombiePool } from "../zombies/zombiePool";
import type { ZombieTypeId } from "../zombies/zombieTypes";
import { createSpatialGrid, type SpatialGrid } from "./spatialGrid";
import { EventBus } from "./eventBus";
import { createEconomyState, type EconomyState } from "../economy/economy";
import { createBuildingState, type BuildingState } from "../buildings/buildings";
import { createPathingState, type PathingState } from "../zombies/flowField";
import { createObstacles, type ObstacleState } from "../map/obstacles";
import { FIRST_DECAY_STAGE } from "../map/decayStage";
import { createSeedStreams, type SeedStreams } from "./seedStreams";
import { createRewoundView, createZombieHistory, recordZombieHistory, type RewoundView, type ZombieHistory } from "../combat/rewind";
import { DEFAULT_SYSTEMS, SYSTEM_ORDER, type Systems } from "./systems";

/** The whole simulation state. A plain object so it can be snapshotted (Story 8.4). */
export interface World {
  /** Ticks stepped so far. */
  tick: number;
  readonly balance: Balance;
  /** Run seed (uint32). */
  readonly seed: number;
  /**
   * Story 4.4: the run's named random streams (`core/seedStreams.ts`), all derived from `seed`. The
   * only randomness of the simulation: draw from the stream the choice belongs to.
   */
  readonly streams: SeedStreams;
  readonly events: EventBus;
  /** Latest input per player id, set by `setInput()`. */
  readonly pendingInputs: Map<string, PlayerInput>;
  /** Inputs applied this tick (copied by the input system). */
  readonly inputs: Map<string, PlayerInput>;
  /** `seq` of the input last applied per player (edge flags fire once per seq). */
  readonly lastAppliedSeq: Map<string, number>;
  /**
   * The district (Story 4.1): bounds, spawn points, static collision boxes, cover, hazards. Frozen
   * shared data; the game's hosts pass `DOWNTOWN_MAP`, tests default to the open `PLACEHOLDER_MAP`.
   */
  readonly map: DistrictMap;
  /**
   * Story 4.2: the obstacles active at the current decay stage (`map/obstacles.ts`): map collision
   * boxes + active cover for bodies and the nav grid, map boxes + cars/bus for shots. Every
   * collision and shot test reads these lists, never `map.solids` / `map.cover` directly.
   */
  readonly obstacles: ObstacleState;
  /** Players by id (Epic 1: one player, "local"). */
  readonly players: Map<string, PlayerState>;
  /** Zombie storage (struct-of-arrays pool). */
  readonly zombies: ZombiePool;
  /** Spatial hash grid over zombies, rebuilt each tick by the zombie system. */
  readonly zombieGrid: SpatialGrid;
  /** Projectiles in flight (struct-of-arrays pool). */
  readonly projectiles: ProjectilePool;
  /** Wave director state. */
  readonly waves: WaveState;
  /** Story 3.1: the run's phase and build timer (`run/runStateMachine.ts`); starts in "lobby". */
  readonly run: RunState;
  /** Debug switches (Story 1.11). Set only by dev cheats and the fixed `?stress` scenario. */
  readonly debug: WorldDebug;
  /** Story 2.8: no player was standing; `team.wiped` was emitted (once). The run is over. */
  teamWiped: boolean;
  /** Story 3.2: who damaged each zombie (assist credit). Wallets live on the players. */
  readonly economy: EconomyState;
  /**
   * Story 3.4: placed buildings (`buildings/buildings.ts`), sorted by id; they block players and
   * zombies (`buildings/collision.ts`). The client's mirror and prediction Worlds copy them from schema.
   */
  readonly buildings: BuildingState;
  /**
   * Story 3.5: the 0.5 m nav grid and the zombies' flow field (`zombies/flowField.ts`), advanced by
   * the `buildings` system on server and solo. Derived from players and buildings; never synced.
   */
  readonly pathing: PathingState;
  /**
   * Story 2.12: zombie positions of the last ticks for rewound hit tests (`combat/rewind.ts`),
   * recorded at the end of `step()` only when enabled (the server with lag compensation; never solo).
   */
  readonly zombieHistory: ZombieHistory;
  /** Story 2.12: scratch for the rewound zombie view (not simulation state; never snapshotted). */
  readonly rewoundView: RewoundView;
  // Later stories add their state here (players 1.3, zombies 1.4, projectiles 1.5, waves 1.7 …).
}

export interface WorldDebug {
  /** The player takes no damage (contact damage is skipped). */
  godMode: boolean;
  /**
   * Story 3.9 dev hook, kept by Story 3.10 as an override: wave zombies cycle through these types
   * (`?wavemix=` solo, `DEV_WAVE_MIX` on the server) instead of the wave's `waves.json › mix`.
   * null = the real composition.
   */
  waveMix: readonly ZombieTypeId[] | null;
  /**
   * Story 4.2 dev override of the decay stage (solo cheat only; null = the real stage, which is 1
   * until Story 4.5). Read only through `currentDecayStage`; apply with `applyCoverStage`.
   */
  decayStage: number | null;
}

export interface CreateWorldOptions {
  balance: Balance;
  seed: number;
  /** District; defaults to the open test street (`PLACEHOLDER_MAP`). The game passes `DOWNTOWN_MAP`. */
  map?: DistrictMap;
  /** Tests only: replace systems by name. */
  systems?: Partial<Systems>;
}

/** Systems are kept outside the World so snapshots and deep-equal checks never see functions. */
const worldSystems = new WeakMap<World, Systems>();

const DT_TOLERANCE = 1e-9;

export function createWorld(opts: CreateWorldOptions): World {
  const seed = opts.seed >>> 0;
  const map = opts.map ?? PLACEHOLDER_MAP;
  // Story 4.2: a new World is at the first decay stage (`currentDecayStage` with no override).
  const obstacles = createObstacles(map, FIRST_DECAY_STAGE);
  const world: World = {
    tick: 0,
    balance: opts.balance,
    seed,
    streams: createSeedStreams(seed),
    events: new EventBus(),
    pendingInputs: new Map(),
    inputs: new Map(),
    lastAppliedSeq: new Map(),
    map,
    obstacles,
    players: new Map(),
    zombies: createZombiePool(ZOMBIE_POOL_CAPACITY),
    zombieGrid: createSpatialGrid(map, GRID_CELL_M, ZOMBIE_POOL_CAPACITY),
    projectiles: createProjectilePool(PROJECTILE_POOL_CAPACITY),
    waves: createWaveState(),
    run: createRunState(),
    debug: { godMode: false, waveMix: null, decayStage: null },
    teamWiped: false,
    economy: createEconomyState(ZOMBIE_POOL_CAPACITY),
    buildings: createBuildingState(),
    // 3.5 review L5: Worlds whose buildings system never runs (client mirror, prediction) get a placeholder.
    // Story 4.2: the nav grid walls off the map boxes and the active cover.
    pathing: createPathingState({ widthM: map.widthM, heightM: map.heightM, solids: obstacles.solids }, ZOMBIE_POOL_CAPACITY, (opts.systems?.buildings ?? DEFAULT_SYSTEMS.buildings) === DEFAULT_SYSTEMS.buildings),
    zombieHistory: createZombieHistory(),
    rewoundView: createRewoundView(map),
  };
  worldSystems.set(world, { ...DEFAULT_SYSTEMS, ...opts.systems });
  return world;
}

/** Stores a player's latest input; it applies from the next `step()`. */
export function setInput(world: World, playerId: string, input: PlayerInput): void {
  world.pendingInputs.set(playerId, input);
}

/** Advances the World by one fixed step. `dtS` must equal TICK_DT_S. */
export function step(world: World, dtS: number): void {
  if (Math.abs(dtS - TICK_DT_S) > DT_TOLERANCE) {
    throw new Error(`step: dtS must be ${TICK_DT_S} (fixed step), got ${dtS}`);
  }
  const systems = worldSystems.get(world);
  if (!systems) throw new Error("step: world was not created by createWorld()");
  for (const name of SYSTEM_ORDER) systems[name](world, dtS);
  world.tick += 1;
  recordZombieHistory(world); // Story 2.12: row `world.tick` = what this tick's horde frame shows
  world.events.flush(); // always last: events of this tick are delivered once, in order
}
