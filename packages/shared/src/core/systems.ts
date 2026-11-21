import type { World } from "./world";
import { updatePlayers } from "../player/movement";
import { updateZombies } from "../zombies/zombieAi";
import { updateCombat } from "../combat/firing";

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

/**
 * Copies the latest input of every player into `world.inputs` for this tick.
 * A player who sent nothing new keeps their last input (dropped packets), but edge-triggered
 * flags (`swap`, `consumable`) only count on the first tick a given `seq` is applied,
 * so a repeated sample never swaps twice.
 */
export const applyInputs: SystemFn = (world) => {
  world.inputs.clear();
  for (const [id, input] of world.pendingInputs) {
    const repeated = world.lastAppliedSeq.get(id) === input.seq;
    world.lastAppliedSeq.set(id, input.seq);
    if (repeated && (input.swap || input.consumable)) {
      world.inputs.set(id, { ...input, swap: false, consumable: false });
    } else {
      world.inputs.set(id, input);
    }
  }
};

/**
 * Default systems. Later stories replace a no-op with their real system
 * (e.g. Story 1.3 sets `player: updatePlayers`).
 */
export const DEFAULT_SYSTEMS: Systems = {
  input: applyInputs,
  player: updatePlayers,
  buildings: noop,
  combat: updateCombat,
  zombies: updateZombies,
  boss: noop,
  waves: noop,
  specialEvents: noop,
  economy: noop,
  decayTimers: noop,
};
