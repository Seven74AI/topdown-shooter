import type { World } from "./world";

/** Fixed system order per tick (architecture › Communication Patterns). Never reorder. */
export const SYSTEM_ORDER = [
  "input",
  "player",
  "buildings",
  "combat",
  "zombies",
  "boss",
  "waves",
  "specialEvents",
  "economy",
  "decayTimers",
] as const;

export type SystemName = (typeof SYSTEM_ORDER)[number];
export type SystemFn = (world: World, dtS: number) => void;
export type Systems = Record<SystemName, SystemFn>;

const noop: SystemFn = () => {};

/** Copies the latest input of every player into `world.inputs` for this tick. */
export const applyInputs: SystemFn = (world) => {
  world.inputs.clear();
  for (const [id, input] of world.pendingInputs) world.inputs.set(id, input);
};

/**
 * Default systems. Later stories replace a no-op with their real system
 * (e.g. Story 1.3 sets `player: updatePlayers`).
 */
export const DEFAULT_SYSTEMS: Systems = {
  input: applyInputs,
  player: noop,
  buildings: noop,
  combat: noop,
  zombies: noop,
  boss: noop,
  waves: noop,
  specialEvents: noop,
  economy: noop,
  decayTimers: noop,
};
