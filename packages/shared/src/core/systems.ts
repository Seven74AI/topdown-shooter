import type { World } from "./world";
import { movePlayers, updatePlayers } from "../player/movement";
import { updateZombies } from "../zombies/zombieAi";
import { updateCombat } from "../combat/firing";
import { updateRun } from "../run/runStateMachine";
import { updateEconomy } from "../economy/economy";

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
  // Story 3.4: placement happens between ticks (`placeBuilding`) and collision inside the player and
  // zombie systems, so this slot stays empty; Story 3.5's flow field and building attacks go here.
  buildings: noop,
  combat: updateCombat,
  zombies: updateZombies,
  boss: noop,
  waves: updateRun, // Story 3.1: the run state machine (build countdown, then the wave director)
  specialEvents: noop,
  economy: updateEconomy,
  decayTimers: noop,
};

/**
 * Every system a no-op (Story 2.4): the networked client's mirror world is written from server
 * state and never simulated. Story 2.6 builds its prediction systems on top of it.
 */
export const NO_SYSTEMS: Systems = {
  input: noop,
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

/**
 * Client prediction (Story 2.6, ADR-01): only input and movement run, the very functions the
 * server runs, so a predicted player ends exactly where the server puts it. Combat, zombies and
 * waves are never predicted, nor the downed/revive rules (the predictor takes status from the
 * server; Story 2.8 review).
 */
export const PREDICTION_SYSTEMS: Systems = { ...NO_SYSTEMS, input: applyInputs, player: movePlayers };
