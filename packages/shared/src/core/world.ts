import type { Balance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { PlayerInput } from "../net/input";
import { PLACEHOLDER_MAP, type DistrictBounds } from "../map/placeholderMap";
import type { PlayerState } from "../player/player";
import { EventBus } from "./eventBus";
import { createRng, type Rng } from "./rng";
import { DEFAULT_SYSTEMS, SYSTEM_ORDER, type Systems } from "./systems";

/** The whole simulation state. A plain object so it can be snapshotted (Story 8.4). */
export interface World {
  /** Ticks stepped so far. */
  tick: number;
  readonly balance: Balance;
  /** Run seed (uint32). */
  readonly seed: number;
  readonly rng: Rng;
  readonly events: EventBus;
  /** Latest input per player id, set by `setInput()`. */
  readonly pendingInputs: Map<string, PlayerInput>;
  /** Inputs applied this tick (copied by the input system). */
  readonly inputs: Map<string, PlayerInput>;
  /** `seq` of the input last applied per player (edge flags fire once per seq). */
  readonly lastAppliedSeq: Map<string, number>;
  /** District bounds (placeholder street until Story 4.1). */
  readonly map: DistrictBounds;
  /** Players by id (Epic 1: one player, "local"). */
  readonly players: Map<string, PlayerState>;
  // Later stories add their state here (players 1.3, zombies 1.4, projectiles 1.5, waves 1.7 …).
}

export interface CreateWorldOptions {
  balance: Balance;
  seed: number;
  /** District bounds; defaults to the placeholder street. */
  map?: DistrictBounds;
  /** Tests only: replace systems by name. */
  systems?: Partial<Systems>;
}

/** Systems are kept outside the World so snapshots and deep-equal checks never see functions. */
const worldSystems = new WeakMap<World, Systems>();

const DT_TOLERANCE = 1e-9;

export function createWorld(opts: CreateWorldOptions): World {
  const seed = opts.seed >>> 0;
  const world: World = {
    tick: 0,
    balance: opts.balance,
    seed,
    rng: createRng(seed),
    events: new EventBus(),
    pendingInputs: new Map(),
    inputs: new Map(),
    lastAppliedSeq: new Map(),
    map: opts.map ?? PLACEHOLDER_MAP,
    players: new Map(),
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
  world.events.flush(); // always last: events of this tick are delivered once, in order
}
