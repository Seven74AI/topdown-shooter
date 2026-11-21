import type { World } from "../core/world";

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
  };
  world.players.set(id, player);
  return player;
}
