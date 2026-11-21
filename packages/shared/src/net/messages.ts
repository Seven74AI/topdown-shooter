import { z } from "zod";

/**
 * The client/server net contract (Story 2.1). Later stories extend it, never rename it.
 * Player ids inside the World and in room state are the stable slot ids `p0`–`p3`,
 * never the Colyseus `sessionId` (it changes on rejoin, Epic 8).
 */
export const RUN_ROOM_NAME = "run";

/** Client → server: imperative `domain.verb` (architecture › Naming). */
export const C2S = {
  /** PlayerInput (net/input.ts), 20/s (Story 2.4). */
  INPUT_SEND: "input.send",
  /** `{ ready: boolean }` (Story 2.3). */
  LOBBY_SET_READY: "lobby.set_ready",
  /** `{}`, host only (Story 2.3). */
  RUN_START: "run.start",
  /** `{ id }`, echo of net.pinged (Story 2.4). */
  NET_PONG: "net.pong",
  /** `{}` after Results (Story 2.8). */
  LOBBY_RETURN: "lobby.return",
} as const;
export type C2SType = (typeof C2S)[keyof typeof C2S];

/** Server → client: past tense. */
export const S2C = {
  /** `{ playerId, slot, tickRateHz }` (Stories 2.3/2.4). */
  RUN_JOINED: "run.joined",
  /** `{ tick, events: NetEvent[] }` (Story 2.4). */
  SIM_EVENTS_FLUSHED: "sim.events_flushed",
  /** `{ id, rttMs }` (Story 2.4). */
  NET_PINGED: "net.pinged",
  /** `{ message }` (Story 2.2). */
  SERVER_SHUTDOWN_STARTED: "server.shutdown_started",
  /** `{ playerId, name, reason }` (Story 2.11). */
  PLAYER_LEFT: "player.left",
} as const;
export type S2CType = (typeof S2C)[keyof typeof S2C];

/** Binary messages use numeric types (1 byte on the wire instead of a string). */
export const BYTES = { HORDE_FRAME: 1 } as const; // Story 2.5

/** `RunState.phase`. Epic 3 adds "build". */
export type RunPhase = "lobby" | "wave" | "results";

/** Why the server refused a join (sent as the `ServerError` message). */
export type JoinRefusal = "invalid_options" | "balance_mismatch" | "run_started" | "rate_limited" | "already_joined";

/** Players per run (architecture › Run Room Rules); slots are 0 to MAX_PLAYERS − 1. */
export const MAX_PLAYERS = 4;
/** Players needed before the host can start (dev builds may start alone, Story 2.3). */
export const MIN_PLAYERS_TO_START = 2;

/** A guest token: 16 random bytes as lowercase hex (Story 2.3). Not a secret in Epic 2. */
export const guestTokenSchema = z.string().regex(/^[0-9a-f]{32}$/);

/**
 * Characters that render as nothing (Hangul fillers, Braille blank, halfwidth filler): a name made
 * only of these and spaces would be invisible.
 */
const INVISIBLE = /[\s\u115F\u1160\u2800\u3164\uFFA0]/gu;

/**
 * A display name: trimmed, 1–16 characters, no control/format characters (Unicode category C)
 * except the zero-width joiner and variation selector-16 that emoji sequences need (🏃‍♀️), and
 * at least one visible character.
 */
export const playerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^(?:[^\p{C}]|\u200D|\uFE0F)+$/u)
  .refine((name) => name.replace(INVISIBLE, "").replace(/\u200D|\uFE0F/gu, "").length > 0, "name is invisible");

/** Options sent with `client.create` / `client.joinById`; checked in `RunRoom.onAuth`. */
export const joinOptionsSchema = z
  .object({
    intent: z.enum(["create", "join"]),
    name: playerNameSchema,
    /** `balance.version` of the client; must equal the server's (AC 4). */
    balanceVersion: z.string().min(1).max(16),
    /** Tells this device's player apart (Story 2.3); the server keeps only its SHA-256. */
    guestToken: guestTokenSchema,
  })
  .strict();

/** What the client sends (before trimming). */
export type JoinOptions = z.input<typeof joinOptionsSchema>;
/** What the server works with (after trimming). */
export type ParsedJoinOptions = z.output<typeof joinOptionsSchema>;

/** `lobby.set_ready` (Story 2.3): lobby only. */
export const lobbySetReadySchema = z.object({ ready: z.boolean() }).strict();
export type LobbySetReady = z.infer<typeof lobbySetReadySchema>;

/** `run.start` (Story 2.3): host only, when `canStart` (net/lobbyRules.ts) holds. */
export const runStartSchema = z.object({}).strict();

/** `run.joined` payload (Story 2.3), sent to the joining client only. */
export interface RunJoined {
  /** `"p" + slot`. */
  playerId: string;
  slot: number;
  tickRateHz: number;
}
