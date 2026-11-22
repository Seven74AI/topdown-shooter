import type { World } from "../core/world";
import { createLoadout, type Loadout } from "../combat/loadout";

/** Story 2.8 adds "downed" | "out". */
export type PlayerStatus = "alive" | "dead";

export interface PlayerState {
  readonly id: string;
  /** Meters, map origin top-left, +y down. */
  x: number;
  y: number;
  /** Position at the start of the current tick (renderers interpolate prev → current). */
  prevX: number;
  prevY: number;
  /** Unit vector the survivor faces. */
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  radiusM: number;
  status: PlayerStatus;
  /** Two weapon slots (Story 1.8 adds the second) and the active one. */
  loadout: Loadout;
  /** Story 2.7: half the RTT (capped) a new projectile's first sweep is advanced by; 0 offline. */
  shotAdvanceS: number;
}

/** Adds a player at (x, y) with stats from `balance.player`. Returns the new state. */
export function addPlayer(world: World, id: string, x: number, y: number): PlayerState {
  if (world.players.has(id)) throw new Error(`addPlayer: player ${id} already exists`);
  const stats = world.balance.player;
  const player: PlayerState = {
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    facingX: 1,
    facingY: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    radiusM: stats.radiusM,
    status: "alive",
    loadout: createLoadout(world.balance),
    shotAdvanceS: 0,
  };
  world.players.set(id, player);
  return player;
}

/**
 * Removes a player and every input record of theirs (Story 2.4: leaving mid-run). Zombies pick the
 * next-nearest player on the next tick. A no-op for an unknown id.
 */
export function removePlayer(world: World, id: string): void {
  world.players.delete(id);
  world.pendingInputs.delete(id);
  world.inputs.delete(id);
  world.lastAppliedSeq.delete(id);
}
