import { schema, t, type SchemaType } from "@colyseus/schema";
import type { PlayerStateView, PlayerStatus, RunPhase, RunStateView } from "@topdown/shared";

/**
 * Room state synced to clients (Story 2.1). Stories 2.3, 2.4 and 2.8 extend it; the field names
 * are final. Uses the schema 5 builder API (no decorators). Map keys are player ids `p0`–`p3`.
 */
export const PlayerState = schema(
  {
    slot: t.uint8(),
    name: t.string(),
    /** Lobby Ready (Story 2.3); Story 2.8 resets it when the room returns to the lobby. */
    ready: t.boolean().default(false),
    // The fight (Story 2.4), written by `syncState` once per tick.
    /** Metres (float32 ≈ 2 µm at 48 m). */
    x: t.float32().default(0),
    y: t.float32().default(0),
    /** Facing, `quantizeHeading`. */
    heading: t.uint8().default(0),
    /** `Math.ceil` of the World's HP. */
    hp: t.uint16().default(0),
    maxHp: t.uint16().default(0),
    status: t.string<PlayerStatus>().default("alive"),
    /** Seq of the last input applied (Story 2.6 reconciles from it). */
    ackSeq: t.uint32().default(0),
    active: t.uint8().default(0),
    /** Weapon id per slot; "" = empty slot. */
    weapon0: t.string().default(""),
    weapon1: t.string().default(""),
    ammo0: t.uint16().default(0),
    ammo1: t.uint16().default(0),
    reloadTicks0: t.uint16().default(0),
    reloadTicks1: t.uint16().default(0),
    swapTicks: t.uint8().default(0),
    // Story 2.8: downed, revive and the Results screen.
    /** Ticks until a downed player is out (0 when not downed). */
    downedTicksLeft: t.uint16().default(0),
    /** Revive progress, 0–255 = 0–100 %. */
    reviveProgress: t.uint8().default(0),
    /** Zombies killed this run. */
    kills: t.uint16().default(0),
    // Story 3.9: the bite slow, for the client's prediction (`movePlayers` on both sides).
    /** Movement ticks left at reduced speed (≤ 200: `biteSlowS` ≤ 10). */
    slowTicks: t.uint8().default(0),
    /** Speed reduction in integer percent while slowed (≤ 90). */
    slowPct: t.uint8().default(0),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const RunState = schema(
  {
    phase: t.string<RunPhase>().default("lobby"),
    hostSlot: t.uint8().default(0),
    players: t.map(PlayerState),
    /** World tick of the values in this patch (Story 2.4). */
    tick: t.uint32().default(0),
    wave: t.uint16().default(0),
    remaining: t.uint16().default(0),
    aliveCount: t.uint16().default(0),
    /** Story 2.8: the wave the team reached, set with phase "results". */
    resultWave: t.uint16().default(0),
  },
  "RunState",
);
export type RunState = SchemaType<typeof RunState>;

// Compile-time drift check: the client reads `room.state` through these plain views.
type Assert<T extends true> = T;
type Assignable<A, B> = [A] extends [B] ? true : false;
export type RunStateMatchesView = Assert<Assignable<RunState, RunStateView>>;
export type PlayerStateMatchesView = Assert<Assignable<PlayerState, PlayerStateView>>;
