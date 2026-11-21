import type { RunPhase } from "./messages";

/**
 * Plain read-only views of the room state schema (apps/server/src/rooms/schema/RunState.ts).
 * The client types `room.state` with these, because it cannot import server code. RunState.ts
 * checks at compile time that the schema is assignable to these views, so drift is a type error.
 */
export interface PlayerStateView {
  readonly slot: number;
  readonly name: string;
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
}
