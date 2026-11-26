import { z } from "zod";
import { TEST_SCENARIOS } from "./testScenarios";
import { LOOK_CODE_MAX } from "../config/cosmetics";
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
  // Story 8.11: the input (20/s, Story 2.4) is the binary `BYTES.INPUT` now (net/input.ts › encodeInput), no longer "input.send".
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
  /**
   * `{}` (Story 7.2, decision 7.2 D4): "I am leaving this run now" — sent right before a consented Leave mid-run so
   * the server banks this player's run at once (ending `quit`) and answers with `run.rewards` while the socket is
   * still open. Never an amount (S6); a second one, one outside a run or one with no account does nothing more.
   */
  RUN_LEAVE: "run.leave",
  /**
   * `{ look }` (Story 7.10, D3): my new look from the editor while waiting in the lobby, so my card changes for everyone
   * before Start. Lobby phase only (mid-run it is ignored: the look changes from the next run); decoded against what my
   * account owns like the join's look; at most 2 per second per client.
   */
  LOBBY_SET_LOOK: "lobby.set_look",
  /**
   * `{ id }` (Story 7.7, R2/R4/R5): the host picks the run's district in the lobby. Accepted only in the lobby, from
   * the host, for a playable district some member has unlocked; anything else is logged and ignored.
   */
  LOBBY_DISTRICT: "lobby.district",
  // Story 8.7 (pings) ↓ — kept in one block (8.2+8.3 appends its own).
  /**
   * `{ kind }` (Story 8.7, D15): "ping where I am". Only the kind: the server stamps the sender's own position and slot
   * (P1). Build, wave and vote, standing or downed (E8-P4); its own 1/s bucket (E8-P5); dropped silently otherwise.
   */
  PING_SEND: "ping.send",
  // ── Story 8.3 (host remove) ──
  /**
   * `{ playerId }` (Story 8.3, H2/H3, Epic 8 D9): the host removes a player (connected, reconnecting, waiting or a
   * remembered seat) in the lobby or a build phase. Anything else (not the host, a wave or the vote, yourself, an
   * unknown id) is logged and ignored. "other" bucket.
   */
  HOST_REMOVE: "host.remove",
  // ── Stories 8.4–8.6 (save and resume) ──
  /** `{}` (Story 8.5, D12): the host saves the run and quits — build phase or vote only. "other" bucket. */
  RUN_SAVE_QUIT: "run.save_quit",
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
  /**
   * `RunRewards` to the owner only (Story 7.2 AC 5): this player's Supplies for the run, after the bank (status
   * `saved` / `failed`), or at once (`not_saved`) for a player without an account. Once per run (a repeat after a
   * rejoin carries the same result).
   */
  RUN_REWARDS: "run.rewards",
  /**
   * `{ runId }` (Story 7.2 re-review RR-L1, B18 amended): the run's id, to everyone at Start and to a seat that
   * attaches during the run or on its Results (before any `run.rewards` on that socket). The phone accepts
   * `run.rewards` only for this run id.
   */
  RUN_STARTED: "run.started",
  /** `{ from }` (Story 7.7 R3): the picked district's last holder left the lobby; the pick went back to Downtown. */
  LOBBY_DISTRICT_RESET: "lobby.district_reset",
  // Story 8.7 (pings) ↓ — kept in one block (8.2+8.3 appends its own).
  /** `PingShown` `[slot, kindIdx, x, y, tick]` to every player, the sender too (Story 8.7): a teammate's ping (never World state, P5). */
  PING_SHOWN: "ping.shown",
  // ── Story 8.3 (host remove) ──
  /** `{}` (Story 8.3, H3): to the removed player only, right before the server closes their socket with 4022. */
  PLAYER_REMOVED: "player.removed",
  // ── Stories 8.4–8.6 (save and resume) ──
  /** `{ expiresAt }` (Story 8.5): the run is saved; every socket closes with 4023 right after ("Run saved" screen). */
  RUN_SAVED: "run.saved",
  /** `{}` (Story 8.5, E8-S8): to the host only: the save failed; the room stays open and play goes on. */
  RUN_SAVE_FAILED: "run.save_failed",
} as const;
export type S2CType = (typeof S2C)[keyof typeof S2C];

/**
 * Story 8.10 (brief 19, decision 8.10 D5): the version of the binary wire formats (2 = the delta horde
 * stream). Sent in the join options; a client with another (or none: a tab from before 8.10) is
 * refused at join as `update_required` ("A new version is out. Please reload.").
 */
export const NET_PROTOCOL_VERSION = 4; // Story 8.11: 3 = the binary input (`BYTES.INPUT`, net/input.ts); Story 8.13: 4 = its tick ack

/**
 * Binary messages use numeric types (1 byte on the wire instead of a string). Story 2.5: `HORDE_FRAME` (server →
 * phone). Story 8.11: `INPUT` (phone → server, `encodeInput`/`decodeInput`; replaces the msgpack `input.send`).
 */
export const BYTES = { HORDE_FRAME: 1, INPUT: 2 } as const;

/** `RunState.phase` (Story 3.1: the run state machine's phases, `run/runStateMachine.ts`). */
export type { RunPhase } from "../run/runStateMachine";

/** Why the server refused a join (sent as the `ServerError` message). */
/**
 * Story 8.1: `seat_kept` — this player's seat in a started run is remembered (their hold ran out),
 * but it can come back only in a build phase with its slot free: the phone waits and retries (D4).
 */
/**
 * Story 8.2: `run_started` only while the run shows Results ("This run is ending"); `run_full` — every free slot is taken
 * or kept for a teammate's held or remembered seat (J3, decision E8-J3). Story 8.3: `removed` — the host removed this
 * seat from the room (H3, decision E8-H2: for the room's lifetime).
 */
export type JoinRefusal = "invalid_options" | "balance_mismatch" | "run_started" | "rate_limited" | "already_joined" | "seat_kept" | "update_required" | "run_full" | "removed" | "save_busy" | "save_gone" | "save_unavailable" | "save_too_old";

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
    /** Story 8.6: "resume" creates a room for a saved run (`savedRunId`, the caller's ticket must be linked to it). */
    intent: z.enum(["create", "join", "resume"]),
    /** Story 8.6: the saved run to resume (its run id). Only with intent "resume". */
    savedRunId: z.string().uuid().optional(),
    name: playerNameSchema,
    /** `balance.version` of the client; must equal the server's (AC 4). */
    balanceVersion: z.string().min(1).max(16),
    /**
     * Story 4.1: `DistrictMap.version` of the client's bundled map; must equal the server's, so
     * prediction collides with the same map. Missing or different → `balance_mismatch` ("Please
     * refresh"; review M1: a pre-4.1 tab would predict on the open street).
     */
    mapVersion: z.string().min(1).max(16),
    /**
     * Story 8.10: `NET_PROTOCOL_VERSION` of the client. Optional in the schema so that a pre-8.10 tab
     * (none) is told `update_required`, not `invalid_options`; the room checks the value.
     */
    netProtocolVersion: z.number().int().min(0).max(0xffff).optional(),
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
/** Story 7.7: `lobby.district`. */
export const lobbyDistrictSchema = z.object({ id: z.string().max(32) }).strict();
/** Story 7.7: `lobby.district_reset`. */
export interface LobbyDistrictReset {
  from: string;
}
export type LobbySetReady = z.infer<typeof lobbySetReadySchema>;

/** `lobby.set_look` (Story 7.10, D3): a look code (≤ 96, `LOOK_CODE_MAX`); decoded tolerant on the server. */
export const lobbySetLookSchema = z.object({ look: z.string().max(LOOK_CODE_MAX) }).strict();
export type LobbySetLook = z.infer<typeof lobbySetLookSchema>;

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
  /** Story 7.4 (K2): bit c = card c is borrowed (at most one). */
  borrowed: number;
  /** Story 7.4: the lender's slot (255 none) and name at build start ("" none: survives the lender leaving). */
  lender: number;
  lenderName: string;
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
/** Story 7.2: `run.leave` carries nothing. */
export const runLeaveSchema = z.object({}).strict();

/** Story 7.2 (AC 5): how this player's bank went. */
export type RunRewardsStatus = "saved" | "failed" | "not_saved";
const supplyAmount = z.number().int().min(0).max(1_000_000_000);
/**
 * Story 7.2 (AC 5): `run.rewards`. `lines` are the unscaled breakdown (`runSupplies`), `waveCount` /
 * `endlessWaveCount` the waves behind them (the "Waves 9 × 10" text), `total` the run's Supplies (rookie × 2
 * included), `newTotal` the account's Supplies after the bank (0 unless `saved`). `runId` marks the run (the start
 * screen shows a quitter's bank once, D4), `seed` matches the Results table's run seed (a late message of an earlier
 * run is never shown on a newer Results). 7.4 / 7.6 / 7.7 / 7.11 / 7.12 add their own fields (brief 26).
 */
export const runRewardsSchema = z
  .object({
    runId: z.string().uuid(),
    seed: z.number().int().min(0).max(0xffffffff),
    status: z.enum(["saved", "failed", "not_saved"]),
    lines: z.object({ waves: supplyAmount, boss: supplyAmount, extract: supplyAmount, endless: supplyAmount, endlessBoss: supplyAmount }).strict(),
    waveCount: z.number().int().min(0).max(0xff),
    endlessWaveCount: z.number().int().min(0).max(0xffff),
    rookie: z.boolean(),
    total: supplyAmount,
    newTotal: supplyAmount,
    /** Review L4: how this seat banked (`quit` = when it left mid-run; a seat that came back still sees that bank). */
    ending: z.enum(["wiped", "extracted", "lost", "quit"]).optional(),
    /** Review L4: the wave a `quit` bank was made in (0 / absent otherwise). */
    leftWave: z.number().int().min(0).max(0xffff).optional(),
    /** Story 7.6 (AC 10, D9): a guest's first bank of ≥ 200 Supplies: show "Save my progress" once (true only once per account). */
    nudge: z.boolean().optional(),
    /**
     * Story 7.4 (K7, AC 9; decision 7.4 D4): the last unlock this player used without owning it (a supply-drop weapon
     * or a bought borrowed card): Results shows "You used the Grenade Launcher: unlock it for 500". null / absent none.
     */
    lockedUsed: z
      .object({ unlockId: z.string().max(32), name: z.string().max(40), price: z.number().int().positive().max(1_000_000) })
      .nullable()
      .optional(),
    /** Story 7.11: the parts this run granted ("New item: Riot helmet (first extraction)"; `reason` = `resultLine`). */
    newItems: z.array(z.object({ key: z.string().max(32), name: z.string().max(32), reason: z.string().max(40) }).strict()).max(16).optional(),
    /** Story 7.12: my find — "Found in wave N: <name>", or Collector (`key` null). */
    loot: z.object({ wave: z.number().int().min(0).max(0xffff), key: z.string().max(32).nullable(), name: z.string().max(32) }).strict().optional(),
    /** Story 7.12 (D1): a teammate's find, on everyone else's Results ("Ana found: Traffic cone"). */
    teamLoot: z.object({ playerId: z.string().max(4), seatId: z.string().max(16).optional(), wave: z.number().int().min(0).max(0xffff), key: z.string().max(32).nullable(), name: z.string().max(32) }).strict().optional(),
    /** Story 7.7: districts this run unlocked ("Unlocked: District 2"). */
    newDistricts: z.array(z.object({ id: z.string().max(32), name: z.string().max(24) }).strict()).max(8).optional(),
  })
  .passthrough(); // later stories append fields; an older client keeps reading the ones it knows
export type RunRewards = z.infer<typeof runRewardsSchema>;
/** Story 7.2 (RR-L1): `run.started`. */
export const runStartedSchema = z.object({ runId: z.string().uuid() }).passthrough();
export type RunStarted = z.infer<typeof runStartedSchema>;

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
/** Story 8.3: `removed` — the host removed them (H3). */
export type PlayerLeftReason = "left" | "disconnected" | "removed";

/** `player.left` payload (Story 2.11), broadcast to the room in the lobby and during a run. */
export interface PlayerLeft {
  playerId: string;
  name: string;
  reason: PlayerLeftReason;
}

// ── Story 8.7: pings (kept in one block for the 8.2+8.3 merge) ───────────────────────────────────────────────────

/** Story 8.7 (FR76, D15): the four pings, in wire order (`PingShown` carries the index). Labels: `PING_LABELS`. */
export const PING_KINDS = ["help", "here", "big", "ready"] as const;
export type PingKind = (typeof PING_KINDS)[number];
/** Story 8.7 (AC 1): the words under each icon ("Big one!" covers the Brute and the Behemoth). */
export const PING_LABELS: Readonly<Record<PingKind, string>> = { help: "Help!", here: "Over here", big: "Big one!", ready: "Ready" };

/** `ping.send` (Story 8.7, P1): only the kind, strict — a position or a slot in the payload makes the message invalid. */
export const pingSendSchema = z.object({ kind: z.enum(PING_KINDS) }).strict();
export type PingSend = z.infer<typeof pingSendSchema>;

/**
 * `ping.shown` payload (Story 8.7, AC 5), to everyone: `[slot, kindIdx, xDm, yDm, tick]` — the sender's slot and the
 * sender's SERVER position at the tick the ping arrived, in whole decimetres (0.1 m), both stamped by the server (P1);
 * `tick16` = that tick & 0xffff (review L1: always 3 B; the client unwraps it against its own tick estimate).
 * An array of integers like `building.ghosted` (decision 8.7 B1): 24 B per message on the wire (msgpack floats would
 * be 36 B), so 4 pings/s cost a phone ≤ 96 B/s.
 */
export type PingShown = [slot: number, kindIdx: number, xDm: number, yDm: number, tick16: number];

/** Story 8.7 (D15): a ping stays on every screen this long (frame clock, ms). */
export const PING_SHOW_MS = 4000;
/**
 * Story 8.7 (AC 4, E8-P5; review M4): the client's own cooldown after a send. The server bucket is 1/s, burst 1; 1200 ms
 * leaves 200 ms for send jitter (a frame's quantisation, ±100 ms of line jitter), so an honest ping is never dropped.
 */
export const PING_COOLDOWN_MS = 1200;
// ── Story 8.3 (host remove) ──
/** `host.remove` (Story 8.3): the seat to remove, by player id (`p0`–`p3`). */
export const hostRemoveSchema = z.object({ playerId: z.string().regex(/^p[0-3]$/) }).strict();
export type HostRemove = z.infer<typeof hostRemoveSchema>;
/** `player.removed` payload (Story 8.3): nothing (the reason is the message itself). */
export type PlayerRemoved = Record<string, never>;

// ── Stories 8.4–8.6 (save and resume) ──
/** `run.save_quit` (Story 8.5): nothing. */
export const runSaveQuitSchema = z.object({}).strict();
/** `run.saved` payload (Story 8.5): when the save stops being resumable (ISO time). */
export interface RunSaved {
  expiresAt: string;
}
/**
 * `run.save_failed` payload (Story 8.5, E8-S8; review M4: every refusal answers): `failed` = the write failed, the rest
 * are refusals (`not_host`, `not_now` = not a build phase or the vote, `saving` = already saving, `no_database`).
 */
export interface RunSaveFailed {
  reason: "failed" | "not_host" | "not_now" | "saving" | "no_database";
}
/** Story 8.6: one row of `GET /api/saved-runs` (D13: newest first, at most 3). */
export interface SavedRunSummary {
  id: string;
  district: string;
  wave: number;
  names: { name: string; slot: number }[];
  savedAt: string;
  expiresAt: string;
}
