import type { RunPhase } from "./messages";
import type { PlayerStatus } from "../player/player";

/**
 * Plain read-only views of the room state schema (apps/server/src/rooms/schema/RunState.ts).
 * The client types `room.state` with these, because it cannot import server code. RunState.ts
 * checks at compile time that the schema is assignable to these views, so drift is a type error.
 */
export interface PlayerStateView {
  readonly slot: number;
  readonly name: string;
  /** Lobby Ready flag (Story 2.3); reset when the room returns to the lobby (Story 2.8). */
  readonly ready: boolean;
  /** Fight fields (Story 2.4), written by `syncState` every tick of a run. Metres, float32. */
  readonly x: number;
  readonly y: number;
  /** Facing as `quantizeHeading` (0 = +x, increasing toward +y). */
  readonly heading: number;
  /** Rounded up, so a player at 0.4 HP shows 1. */
  readonly hp: number;
  readonly maxHp: number;
  /** "alive" | "downed" | "out" (Story 2.8). */
  readonly status: PlayerStatus;
  /** Story 2.8: ticks until a downed player is out (0 when not downed). */
  readonly downedTicksLeft: number;
  /** Revive progress of a downed player, 0–255 = 0–100 %. */
  readonly reviveProgress: number;
  /** Zombies this player killed this run (Results screen). */
  readonly kills: number;
  /** Story 3.2: personal wallet (server truth; the client never predicts it). */
  readonly wallet: number;
  /** Story 3.2: total earned this run (never reduced by spending). */
  readonly earned: number;
  /** Story 3.9: movement ticks left at reduced speed (Crawler bite), and the reduction in percent. */
  readonly slowTicks: number;
  readonly slowPct: number;
  /** `seq` of the last input the server applied for this player (Story 2.6 replays newer ones). */
  readonly ackSeq: number;
  /** Active weapon slot, 0 or 1. */
  readonly active: number;
  /** Weapon id per slot; "" = empty slot. */
  readonly weapon0: string;
  readonly weapon1: string;
  readonly ammo0: number;
  readonly ammo1: number;
  readonly reloadTicks0: number;
  readonly reloadTicks1: number;
  readonly swapTicks: number;
}

/** The parts of a schema MapSchema the client reads. Keys are player ids (`p0`–`p3`). */
export interface ReadonlyMapView<V> {
  get(key: string): V | undefined;
  has(key: string): boolean;
  forEach(cb: (value: V, key: string) => void): void;
  readonly size: number;
}

export interface RunStateView {
  readonly phase: RunPhase;
  readonly hostSlot: number;
  readonly players: ReadonlyMapView<PlayerStateView>;
  /** Server tick of the World these values come from (Story 2.4). */
  readonly tick: number;
  /** `world.waves.number` / `remaining`. */
  readonly wave: number;
  readonly remaining: number;
  /** Players whose status is "alive". */
  readonly aliveCount: number;
  /** Story 2.8: the wave the team reached, set with phase "results" (0 otherwise). */
  readonly resultWave: number;
}
