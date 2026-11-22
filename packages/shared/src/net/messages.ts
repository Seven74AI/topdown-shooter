import { z } from "zod";
import { TEST_SCENARIOS } from "./testScenarios";
import type { PlaceError } from "../buildings/buildings";
import type { ShopError } from "../economy/shop";

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
  /** `{ ready: boolean }` in a build phase (Story 3.1). */
  BUILD_SET_READY: "build.set_ready",
  /** `{ type, gx, gy, rot }` in a build phase (Story 3.4); a refusal comes back as `building.refused`. */
  BUILDING_PLACE: "building.place",
  /** `{ weapon, slot? }` in a build phase (Story 3.3); answered with `shop.bought` or `shop.refused`. */
  SHOP_BUY: "shop.buy",
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
  /** `{ reason: PlaceError }` to the sender of a refused `building.place` (Story 3.4). */
  BUILDING_REFUSED: "building.refused",
  /** `{ weapon, slot }` to the buyer only (Story 3.3); wallet and weapons follow in the state. */
  SHOP_BOUGHT: "shop.bought",
  /** `{ weapon, error: ShopError }` to the buyer only (Story 3.3); nothing changed. */
  SHOP_REFUSED: "shop.refused",
} as const;
export type S2CType = (typeof S2C)[keyof typeof S2C];

/** Binary messages use numeric types (1 byte on the wire instead of a string). */
export const BYTES = { HORDE_FRAME: 1 } as const; // Story 2.5

/** `RunState.phase` (Story 3.1: the run state machine's phases, `run/runStateMachine.ts`). */
export type { RunPhase } from "../run/runStateMachine";

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
    /**
     * Story 2.10: a fixed test scenario (`?scenario=net150` on the host's create). The server
     * applies it only with `ALLOW_TEST_SCENARIOS=1`; otherwise the run is a normal one.
     */
    scenario: z.enum(TEST_SCENARIOS).optional(),
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

/** `build.set_ready` (Story 3.1): the sender's build-phase Ready (a toggle); ignored outside a build. */
export const buildSetReadySchema = z.object({ ready: z.boolean() }).strict();
export type BuildSetReady = z.infer<typeof buildSetReadySchema>;

/**
 * `building.place` (Story 3.4): a building type, its min corner on the 0.5 m lattice (uint8 indices) and
 * rotation (90° steps). Only the shape is checked here; `placeBuilding` validates the rest.
 */
export const buildingPlaceSchema = z
  .object({
    type: z.string().min(1).max(32),
    gx: z.number().int().min(0).max(255),
    gy: z.number().int().min(0).max(255),
    rot: z.number().int().min(0).max(3),
  })
  .strict();
export type BuildingPlace = z.infer<typeof buildingPlaceSchema>;

/** `building.refused` payload (Story 3.4), to the sender only. */
export interface BuildingRefused {
  reason: PlaceError;
}

/**
 * `shop.buy` (Story 3.3): buy a weapon of the fixed shop. `slot` (0 or 1) says which weapon it
 * replaces when both slots are full; with an empty second slot it is ignored (the weapon goes there).
 */
export const shopBuySchema = z
  .object({
    weapon: z.string().regex(/^[a-z][a-z0-9_]*$/).max(32),
    slot: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict();
export type ShopBuy = z.infer<typeof shopBuySchema>;

/** `shop.bought` payload (Story 3.3). */
export interface ShopBought {
  weapon: string;
  slot: 0 | 1;
}

/** `shop.refused` payload (Story 3.3): the `Result` error of `buyWeapon`. */
export interface ShopRefused {
  weapon: string;
  error: ShopError;
}

/** `lobby.return` (Story 2.8): `{}`, any member, phase "results" only. */
export const lobbyReturnSchema = z.object({}).strict();

/** `net.pinged` (Story 2.4): sent to each client every second during a run. `rttMs` is the server's EWMA so far. */
export interface NetPinged {
  id: number;
  rttMs: number;
}

/** `net.pong` (Story 2.4): the client echoes the id of the ping it just got. */
export const netPongSchema = z.object({ id: z.number().int().nonnegative() }).strict();
export type NetPong = z.infer<typeof netPongSchema>;

/** `run.joined` payload (Story 2.3), sent to the joining client only. */
export interface RunJoined {
  /** `"p" + slot`. */
  playerId: string;
  slot: number;
  tickRateHz: number;
}

/** Why a player left (Story 2.11): `left` = a consented leave (Leave game), else `disconnected`. */
export type PlayerLeftReason = "left" | "disconnected";

/** `player.left` payload (Story 2.11), broadcast to the room in the lobby and during a run. */
export interface PlayerLeft {
  playerId: string;
  name: string;
  reason: PlayerLeftReason;
}
