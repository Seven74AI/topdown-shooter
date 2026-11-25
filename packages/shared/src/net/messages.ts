import { z } from "zod";
import { TEST_SCENARIOS } from "./testScenarios";
import type { PlaceError } from "../buildings/buildings";
import type { RepairError } from "../buildings/repair";
import type { UpgradeError } from "../buildings/upgrade";
import type { SellError } from "../buildings/sell";
import type { MoveError } from "../buildings/move";
import type { ShopError, WeaponUpgradeError } from "../economy/shop";

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
  /**
   * `{ build, rev, card, item, slot? }` in a build phase (Story 3.3; Story 5.13: buy card `card` of my
   * offer); answered with `shop.bought` (+ `shop.offered`) or `shop.refused`.
   */
  SHOP_BUY: "shop.buy",
  /** `{ build, rev }` in a build phase (Story 5.13); answered with `shop.offered` or `shop.refused` (`item: "reroll"`). */
  SHOP_REROLL: "shop.reroll",
  /** `{ id }` in a build phase (Story 3.7); a refusal comes back as `building.repair_refused`. */
  BUILDING_REPAIR: "building.repair",
  /** `{ id }` in a build phase (Story 5.9, owner only); a refusal comes back as `building.upgrade_refused`. */
  BUILDING_UPGRADE: "building.upgrade",
  /** `{ id }` in a build phase (Story 5.20, owner only: take back / sell); a refusal comes back as `building.sell_refused`. */
  BUILDING_SELL: "building.sell",
  /** `{ id, gx, gy, rot, seq }` in a build phase (Story 5.22, owner only, free); a refusal comes back as `building.move_refused` with the same `seq`. */
  BUILDING_MOVE: "building.move",
  /**
   * `{ type, gx, gy, rot }` (`type: ""` = my hand is empty) in a build phase (Story 5.24): what I am
   * holding, sent only on change (≤ 4 Hz) plus a 2 Hz keepalive; relayed to the others as `building.ghosted`.
   */
  BUILDING_GHOST: "building.ghost",
  /** `{ weapon }` in a build phase (Story 5.1); answered with `shop.upgraded` or `shop.upgrade_refused`. */
  SHOP_UPGRADE: "shop.upgrade",
  /**
   * `{ item }` in a build phase (Story 5.11 gear; Story 5.12 consumables use the same message);
   * answered with `shop.bought_item` or `shop.refused_item`.
   */
  SHOP_BUY_ITEM: "shop.buy_item",
  /** `{ choice: "extract" | "stay" }` during the evacuation vote (Story 6.11); a new choice replaces the old one. */
  EVAC_VOTE: "evac.vote",
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
  /** `{ item, card, slot? }` to the buyer only (Story 3.3; 5.13 cards); wallet and weapons follow in the state. */
  SHOP_BOUGHT: "shop.bought",
  /** `{ item, card, error: ShopError }` to the buyer only (Story 3.3; 5.13: `item: "reroll"` for a reroll); nothing changed. */
  SHOP_REFUSED: "shop.refused",
  /**
   * `{ build, rev, cards, sold, rerollPrice, canReroll }` to the owner only (Story 5.13): my stored
   * card offer, at every build start, after each successful buy or reroll, and on join.
   */
  SHOP_OFFERED: "shop.offered",
  /** `{ id, reason: RepairError }` to the sender of a refused `building.repair` (Story 3.7). */
  BUILDING_REPAIR_REFUSED: "building.repair_refused",
  /** `{ id, reason: UpgradeError }` to the sender of a refused `building.upgrade` (Story 5.9). */
  BUILDING_UPGRADE_REFUSED: "building.upgrade_refused",
  /** `{ id, reason: SellError }` to the sender of a refused `building.sell` (Story 5.20). */
  BUILDING_SELL_REFUSED: "building.sell_refused",
  /** `{ id, reason: MoveError, seq }` to the sender of a refused `building.move` (Story 5.22; `seq` echoed). */
  BUILDING_MOVE_REFUSED: "building.move_refused",
  /** `[slot, typeIdx, gx, gy, rot]` to every other player (Story 5.24): a teammate's held building (cosmetic; `typeIdx` −1 = none). */
  BUILDING_GHOSTED: "building.ghosted",
  /** `{ weapon, slot, level }` to the sender only (Story 5.1); wallet and level follow in the state. */
  SHOP_UPGRADED: "shop.upgraded",
  /** `{ weapon, error: WeaponUpgradeError }` to the sender only (Story 5.1); nothing changed. */
  SHOP_UPGRADE_REFUSED: "shop.upgrade_refused",
  /** `{ item }` to the buyer only (Story 5.11); gear, max HP and wallet follow in the state. */
  SHOP_BOUGHT_ITEM: "shop.bought_item",
  /** `{ item, error: ShopError }` to the buyer only (Story 5.11); nothing changed. */
  SHOP_REFUSED_ITEM: "shop.refused_item",
} as const;
export type S2CType = (typeof S2C)[keyof typeof S2C];

/** Binary messages use numeric types (1 byte on the wire instead of a string). */
export const BYTES = { HORDE_FRAME: 1 } as const; // Story 2.5

/** `RunState.phase` (Story 3.1: the run state machine's phases, `run/runStateMachine.ts`). */
export type { RunPhase } from "../run/runStateMachine";

/** Why the server refused a join (sent as the `ServerError` message). */
/**
 * Story 8.1: `seat_kept` — this player's seat in a started run is remembered (their hold ran out),
 * but it can come back only in a build phase with its slot free: the phone waits and retries (D4).
 */
export type JoinRefusal = "invalid_options" | "balance_mismatch" | "run_started" | "rate_limited" | "already_joined" | "seat_kept";

/** Players per run (architecture › Run Room Rules); slots are 0 to MAX_PLAYERS − 1. */
export const MAX_PLAYERS = 4;
/**
 * Players needed before the host can start. Designer, 2026-11-23: 1 — a real online run can be
 * played alone (sized × 0.4 by the wave tables). Story 2.3 needed 2 and let only dev builds start
 * alone (`allowSoloStart`), which now changes nothing.
 */
export const MIN_PLAYERS_TO_START = 1;

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
    /**
     * Story 4.1: `DistrictMap.version` of the client's bundled map; must equal the server's, so
     * prediction collides with the same map. Missing or different → `balance_mismatch` ("Please
     * refresh"; review M1: a pre-4.1 tab would predict on the open street).
     */
    mapVersion: z.string().min(1).max(16),
    /** Tells this device's player apart (Story 2.3); the server keeps only its SHA-256. */
    guestToken: guestTokenSchema,
    /**
     * Story 2.10: a fixed test scenario (`?scenario=net150` on the host's create). The server
     * applies it only with `ALLOW_TEST_SCENARIOS=1`; otherwise the run is a normal one.
     */
    scenario: z.enum(TEST_SCENARIOS).optional(),
    /**
     * Story 4.4 (dev only): the run seed the host asks for (`?seed=` on the host's create). The
     * server applies it only with `DEV_ALLOW_RUN_SEED=1`, never in production.
     */
    devRunSeed: z.number().int().min(0).max(0xffffffff).optional(),
    /**
     * Story 7.1: the server-signed session ticket from `POST /api/account/session` (10 min). The room trusts only
     * this, never an account id sent by the client; a bad or expired one means "no account", never a refusal (P3).
     */
    ticket: z.string().min(1).max(200).optional(),
    /**
     * Story 7.9: the survivor look code. `unknown` on purpose: it never refuses a join; `RunRoom.checkAuth` decodes it
     * (`decodeLook` against what the account owns) and bad parts become default parts (L1). The whole-options size
     * cap (`MAX_CLIENT_MESSAGE_BYTES`) still applies.
     */
    look: z.unknown().optional(),
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

/** `evac.vote` payload (Story 6.11): the player's choice; the server ignores it outside phase "vote". */
export const evacVoteSchema = z.object({ choice: z.enum(["extract", "stay"]) }).strict();
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
 * `building.repair` (Story 3.7): the id of the building to repair (any player's). Only the shape is
 * checked here; `repairBuilding` validates phase, building, damage and wallet on the server's World.
 */
export const buildingRepairSchema = z
  .object({
    id: z.number().int().min(1).max(65535),
  })
  .strict();
export type BuildingRepair = z.infer<typeof buildingRepairSchema>;

/**
 * `building.upgrade` (Story 5.9): the id of one of the sender's own buildings. Only the shape is
 * checked here; `upgradeBuilding` validates phase, owner, tier and wallet on the server's World.
 */
export const buildingUpgradeSchema = z
  .object({
    id: z.number().int().min(1).max(65535),
  })
  .strict();
export type BuildingUpgrade = z.infer<typeof buildingUpgradeSchema>;

/**
 * `building.sell` (Story 5.20): the id of one of the sender's own buildings (take back / sell). Only
 * the shape is checked here; `sellBuilding` validates standing, phase, building and owner.
 */
export const buildingSellSchema = z
  .object({
    id: z.number().int().min(1).max(65535),
  })
  .strict();
export type BuildingSell = z.infer<typeof buildingSellSchema>;

/**
 * `building.move` (Story 5.22): one of the sender's own buildings to a new lattice corner (0–255, the
 * placement's range) and rotation. Only the shape is checked here; `moveBuilding` validates standing,
 * phase, building, owner and the new spot (the building itself ignored). Review L3: `seq` is the
 * client's number for this move, echoed in a refusal, so a late refusal of an older move of the same
 * building is never taken for the newer one's.
 */
export const buildingMoveSchema = z
  .object({
    id: z.number().int().min(1).max(65535),
    gx: z.number().int().min(0).max(255),
    gy: z.number().int().min(0).max(255),
    rot: z.number().int().min(0).max(3),
    seq: z.number().int().min(0).max(65535),
  })
  .strict();
export type BuildingMove = z.infer<typeof buildingMoveSchema>;

/**
 * `building.ghost` (Story 5.24): the building I hold (`type: ""` = none). Only the shape is checked
 * here; the server's `ghostError` decides whether it is relayed (silently dropped otherwise).
 */
export const buildingGhostSchema = z
  .object({
    type: z.string().max(32),
    gx: z.number().int().min(0).max(255),
    gy: z.number().int().min(0).max(255),
    rot: z.number().int().min(0).max(3),
  })
  .strict();
export type BuildingGhost = z.infer<typeof buildingGhostSchema>;

/**
 * `building.ghosted` payload (Story 5.24, D6), to every player but the sender: `[slot, typeIdx, gx,
 * gy, rot]` — the sender's lobby slot (stamped by the server), the index in `buildingTypeIds` (−1 =
 * the hand is empty). An array like the net events: 24 B on the wire instead of 66 with names.
 */
export type BuildingGhosted = [slot: number, typeIdx: number, gx: number, gy: number, rot: number];

/** Story 5.24 (D2): the sender's pacing: at most one ghost per this many ms (4 Hz)… */
export const GHOST_MIN_INTERVAL_MS = 250;
/** …and a keepalive this often while the held ghost is unchanged… */
export const GHOST_KEEPALIVE_MS = 500;
/** …so a receiver hides a ghost this long after its last update. */
export const GHOST_TIMEOUT_MS = 1000;

/** `building.move_refused` payload (Story 5.22), to the sender only. */
export interface BuildingMoveRefused {
  id: number;
  reason: MoveError;
  /** The refused move's `seq` (review L3). */
  seq: number;
}

/** `building.sell_refused` payload (Story 5.20), to the sender only. */
export interface BuildingSellRefused {
  id: number;
  reason: SellError;
}

/** `building.upgrade_refused` payload (Story 5.9), to the sender only. */
export interface BuildingUpgradeRefused {
  id: number;
  reason: UpgradeError;
}

/** `building.repair_refused` payload (Story 3.7), to the sender only. */
export interface BuildingRepairRefused {
  id: number;
  reason: RepairError;
}

/**
 * `shop.buy` (Story 3.3; Story 5.13: the card shop): buy card `card` (0–5) of the offer (`build`,
 * `rev`) I saw, showing `item`. `slot` (0 or 1) says which weapon a weapon card replaces when both
 * slots are full; otherwise ignored. Only the shape is checked here; `buyCard` decides on the World.
 */
export const shopBuySchema = z
  .object({
    build: z.number().int().min(0).max(255),
    rev: z.number().int().min(0).max(65535),
    card: z.number().int().min(0).max(5),
    item: z.string().regex(/^[a-z][a-z0-9_]*$/).max(32),
    slot: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict();
export type ShopBuy = z.infer<typeof shopBuySchema>;

/** `shop.reroll` (Story 5.13): reroll the offer (`build`, `rev`) I saw; a stale one is refused with no charge. */
export const shopRerollSchema = z
  .object({
    build: z.number().int().min(0).max(255),
    rev: z.number().int().min(0).max(65535),
  })
  .strict();
export type ShopReroll = z.infer<typeof shopRerollSchema>;

/** `shop.bought` payload (Story 3.3; 5.13: a card). `slot` only for a weapon card. */
export interface ShopBought {
  item: string;
  card: number;
  slot?: 0 | 1;
}

/** `shop.refused` payload (Story 3.3; 5.13): the `Result` error of `buyCard` / `reroll` (`item: "reroll"`, `card: -1`). */
export interface ShopRefused {
  item: string;
  card: number;
  error: ShopError;
}

/** `shop.offered` payload (Story 5.13): `cards` has `shop.json › cards` ids ("" = an empty slot); `sold` bit c = card c sold. */
export interface ShopOffered {
  build: number;
  rev: number;
  cards: string[];
  sold: number;
  rerollPrice: number;
  canReroll: boolean;
}

/**
 * `shop.upgrade` (Story 5.1): upgrade one of the sender's own weapons by one level. Only the shape
 * is checked here; `upgradeWeapon` validates phase, ownership, level and wallet on the server's World.
 */
export const shopUpgradeSchema = z
  .object({
    weapon: z.string().regex(/^[a-z][a-z0-9_]*$/).max(32),
  })
  .strict();
export type ShopUpgrade = z.infer<typeof shopUpgradeSchema>;

/** `shop.upgraded` payload (Story 5.1). */
export interface ShopUpgraded {
  weapon: string;
  slot: 0 | 1;
  level: number;
}

/** `shop.upgrade_refused` payload (Story 5.1): the `Result` error of `upgradeWeapon`. */
export interface ShopUpgradeRefused {
  weapon: string;
  error: WeaponUpgradeError;
}

/**
 * `shop.buy_item` (Story 5.11): buy one shop item by its balance id — gear (`gear.json`) now,
 * consumables (Story 5.12) later. Only the shape is checked here; `buyItem` decides on the World.
 */
export const shopBuyItemSchema = z
  .object({
    item: z.string().regex(/^[a-z][a-z0-9_]*$/).max(32),
  })
  .strict();
export type ShopBuyItem = z.infer<typeof shopBuyItemSchema>;

/** `shop.bought_item` payload (Story 5.11). */
export interface ShopBoughtItem {
  item: string;
}

/** `shop.refused_item` payload (Story 5.11): the `Result` error of `buyItem`. */
export interface ShopRefusedItem {
  item: string;
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
