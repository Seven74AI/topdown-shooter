import { schema, t, type SchemaType } from "@colyseus/schema";
import type { PlayerStateView, RunPhase, RunStateView } from "@topdown/shared";

/**
 * Room state synced to clients (Story 2.1). Stories 2.3, 2.4 and 2.8 extend it; the field names
 * are final. Uses the schema 5 builder API (no decorators). Map keys are player ids `p0`–`p3`.
 */
export const PlayerState = schema({ slot: t.uint8(), name: t.string() }, "PlayerState");
export type PlayerState = SchemaType<typeof PlayerState>;

export const RunState = schema(
  {
    phase: t.string<RunPhase>().default("lobby"),
    hostSlot: t.uint8().default(0),
    players: t.map(PlayerState),
  },
  "RunState",
);
export type RunState = SchemaType<typeof RunState>;

// Compile-time drift check: the client reads `room.state` through these plain views.
type Assert<T extends true> = T;
type Assignable<A, B> = [A] extends [B] ? true : false;
export type RunStateMatchesView = Assert<Assignable<RunState, RunStateView>>;
export type PlayerStateMatchesView = Assert<Assignable<PlayerState, PlayerStateView>>;
