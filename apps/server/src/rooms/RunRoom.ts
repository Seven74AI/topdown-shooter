import { isSwitching, registerRoomDevices } from "../auth/devicesInRooms";
import { randomBytes, randomUUID } from "node:crypto";
import {
  CloseCode,
  Room,
  ServerError,
  matchMaker,
  type AuthContext,
  type Client,
  type Delayed,
  type Deferred,
  type RoomException,
  type RoomMethodName,
} from "@colyseus/core";
import {
  stageSealsUnresolved,
  ByteRate,
  C2S,
  MAX_PLAYERS,
  NO_LENDER,
  NO_TRAINING,
  STARTER_ONLY,
  S2C,
  TICK_RATE_HZ,
  buildSetReadySchema,
  evacVoteSchema,
  runLeaveSchema,
  DOWNTOWN_MAP,
  type DistrictMap,
  NET_PROTOCOL_VERSION,
  buildingPlaceSchema,
  buildingRepairSchema,
  buildingUpgradeSchema,
  buildingSellSchema,
  buildingMoveSchema,
  buildingGhostSchema,
  buildingTypeIds,
  ghostError,
  isTestScenario,
  joinOptionsSchema,
  loadDevBalance,
  parseDevScale,
  parseDevWallet,
  lobbyReturnSchema,
  lobbySetReadySchema,
  lobbySetLookSchema,
  netPongSchema,
  parseWaveMix,
  BYTES,
  NEUTRAL_INPUT,
  decodeInput,
  decodeInputAck,
  decodeInputSendMs,
  runStartSchema,
  shopBuySchema,
  shopRerollSchema,
  shopBuyItemSchema,
  shopUpgradeSchema,
  spectateTarget,
  startBlocker,
  zombieNetId,
  averageEarned,
  endRun as endWorldRun,
  hostRemoveSchema,
  lateJoinWallet,
  trainedStartMoney,
  buildEndsThisTick,
  captureRunSave,
  migrateRunSave,
  restoreRunSave,
  runSaveQuitSchema,
  saveBlocker,
  SaveBlockedError,
  type RunSave,
  type RunSaved,
  type RunSaveFailed,
  type SavedSeat,
  type SeatMeta,
  type BuildingPlace,
  type BuildingRefused,
  type BuildingRepairRefused,
  type BuildingUpgradeRefused,
  type BuildingSellRefused,
  type BuildingMoveRefused,
  type BuildingGhost,
  type BuildingGhosted,
  PING_KINDS,
  pingSendSchema,
  type PingSend,
  type PingShown,
  type JoinRefusal,
  type NetEvent,
  type NetEventContext,
  type NetPinged,
  type PlayerInput,
  type PlayerLeft,
  type PlayerLeftReason,
  type PlayerRemoved,
  type RunJoined,
  type RunRewards,
  type RunStarted,
  type ShopBought,
  type ShopOffered,
  type ShopBoughtItem,
  type ShopRefusedItem,
  type ShopRefused,
  type ShopUpgraded,
  type ShopUpgradeRefused,
  type SimEvent,
  type TestScenario,
  type World,
  type PlayerState as SimPlayer,
} from "@topdown/shared";
import type { Logger } from "pino";
import { HordeEncoder, newHordeStats, type HordeStats } from "../net/hordeEncoder";
import { EventInterest } from "../net/eventInterest";
import { CLOSE_REMOVED, CLOSE_RUN_SAVED, CLOSE_SEAT_KEPT, CLOSE_TAKEN_OVER, HOLD_S, SHUTDOWN_SAVE_WAIT_MS, MAX_CLIENT_MESSAGE_BYTES, MAX_LOBBY_LOOKS_PER_S, RESUME_COUNT_S, TICKET_ROW_CHECK_MS } from "../net/limits";
import { MessageGuard, bytesParser } from "../net/messageGuard";
import { roomCreateLimiter } from "../net/rateLimit";
import { log, roomLog } from "../ops/logger";
import { assignSlot, hashGuestToken, nextConnectedHost, sameSeat, seatIdOf, seatKey, type Member } from "../run/lobby";
import { roomAccountsRepo, roomChecksTicketRows, roomProgressRepo, ticketAccountId } from "../auth/roomAccounts";
import { BANK_RETRY_MS, RunBank } from "../meta/banking";
import { bankSavedRun } from "../meta/saveBank";
import { SaveWriter, roomSavesRepo, saveExpiry, withTimeout } from "../run/roomSaves";
import type { SaveRow } from "../db/savedRunsRepo";
import { RunController, parseDevHpFraction } from "../run/RunController";
import { SLOW_PATCH_MESSAGE, SlowTickWatch } from "../run/slowTick";
import { pickDevRunSeed } from "../run/devRunSeed";
import { pickDevDecayStages } from "../run/devDecayStages";
import { pickDevForceBlackout } from "../run/devForceBlackout";
import { pickDevBossWaves } from "../run/devBossWaves";
import { DEFAULT_DISTRICT, decodeLook, districtIndex, encodeLook, lobbyDistrictSchema, openMask, ownedParts, parseDevEvents, pickRefusal, type LobbyDistrictReset } from "@topdown/shared";
import { pickDevStartWave } from "../run/devStartWave";
import { pickDevShopCards } from "../run/devShopCards";
import { pickDevShopAll } from "../run/devShopAll";
import { loadRunInits, pickDevUnlocks, runPlayers, type RunPlayerInit } from "../meta/runStart";
import { pickDevLoot } from "../run/devLoot";
import { resetRunFields, syncState } from "./schema/syncState";
import { uniqueRoomCode } from "./roomCode";
import { recordRunResult } from "../run/roomRunResults";
import { AdminCheatGate, devAdminCheats } from "../run/adminCheatGate";
import { adminCheatSchema, applyAdminCheat, type AdminCheat } from "@topdown/shared";
import { resultRow, seatRow } from "../meta/runResult";
import { PlayerState, RunState } from "./schema/RunState";

/**
 * The balance this server runs; clients must send the same `balance.version` (AC 4). Dev/test only
 * (Epic 2 retro A5): `DEV_ZOMBIE_DAMAGE_SCALE=0.1` scales zombie damage for browser checks; a dev
 * client opened with `?zdmg=0.1` builds the same balance (same version), so it can still join.
 * Story 3.3: `DEV_STARTING_WALLET=2000` (client `?wallet=2000`) sets every starting wallet for shop checks.
 */
// Never in production (3.1 review): a production server ignores the dev switches and says so.
const devAllowed = process.env.NODE_ENV !== "production";
const devZombieDamageScale = devAllowed ? parseDevScale(process.env.DEV_ZOMBIE_DAMAGE_SCALE) : null;
const devStartingWallet = devAllowed ? parseDevWallet(process.env.DEV_STARTING_WALLET) : null;
/**
 * Stories 5.10 + 5.11, ONE switch: `DEV_SHOP_ALL=1` (client `?shopall=1`) lists, places and sells
 * every `inShop: false` item (floodlight, tactical flashlight). Production ignores it (`pickDevShopAll`, tested).
 */
const devShopAll = pickDevShopAll(process.env).shopAll;
export const serverBalance = loadDevBalance({ zombieDamageScale: devZombieDamageScale, startingWallet: devStartingWallet, shopAll: devShopAll });
if (devZombieDamageScale !== null || devStartingWallet !== null || devShopAll) {
  log.warn({ scale: devZombieDamageScale, wallet: devStartingWallet, shopAll: devShopAll, version: serverBalance.version }, "dev_balance_override");
} else if (process.env.DEV_ZOMBIE_DAMAGE_SCALE || process.env.DEV_STARTING_WALLET || process.env.DEV_SHOP_ALL) {
  log.warn({ scale: process.env.DEV_ZOMBIE_DAMAGE_SCALE, wallet: process.env.DEV_STARTING_WALLET, shopAll: process.env.DEV_SHOP_ALL }, "dev_balance_override_ignored");
}

/** HTTP-ish status for every join refusal; the message is the `JoinRefusal` reason. */
export const JOIN_REFUSED_CODE = 526;

/** Sent as `S2C.SERVER_SHUTDOWN_STARTED` before a stop or redeploy closes the room (Story 2.2). */
export const SERVER_RESTARTING_MESSAGE = "Server restarting";
/** Story 8.4 (AC 7): the shutdown text when the run is saved (it can be resumed from the start screen). */
export const SERVER_RESTARTING_SAVED_MESSAGE = "Server restarting, your run is saved";

/** What `onAuth` hands to `onJoin` as `client.auth`. */
export interface RunAuth {
  name: string;
  ip: string | undefined;
  /** SHA-256 of the guest token (Story 2.3); the raw token never leaves `onAuth`. */
  guestTokenHash: string;
  /** Story 7.1: the account of a valid session ticket, else null (no ticket, bad, expired: unsaved play, never a refusal). */
  accountId: string | null;
  /** Story 7.9: the canonical look code (`decodeLook` against the account's owned parts; bad parts → default parts). */
  look: string;
  /** Story 7.11: the look the client asked for, kept until the account's owned parts load (the join itself reads no database). */
  rawLook?: unknown;
}

export type RunClient = Client<{ auth: RunAuth }>;

/** Options the server adds to every `onCreate` (`defineRoom` defaults win over client options). */
export interface RunRoomOptions {
  /** The host may start alone (dev and tests; never in the production image, Story 2.2). */
  allowSoloStart: boolean;
  /** Story 2.10: the host's `scenario` join option is honoured (`ALLOW_TEST_SCENARIOS=1`). */
  allowTestScenarios: boolean;
}

/**
 * Story 2.10: one client's traffic. `out` counts every frame Colyseus 0.18 writes to the socket
 * (messages, `sendBytes` horde frames, state patches and the full state all go through
 * `client.raw`); `in` counts every frame the socket receives. Payload bytes only (KB = 1024 B).
 */
export interface NetMeters {
  readonly out: ByteRate;
  readonly in: ByteRate;
}

/** Story 8.1: why a seat is on hold. */
export type HoldReason = "drop" | "quiet";

/** Story 8.1: one seat on hold (by player id). */
interface Hold {
  reason: HoldReason;
  /** performance.now() at the hold (the `player_returned` afterMs). */
  readonly atMs: number;
  /** A drop: Colyseus's 120 s reconnection (rejected by a takeover). */
  reconnection: Deferred<RunClient> | null;
  /** A quiet hold: the room's own 120 s timer. */
  timer: Delayed | null;
}

/** Story 8.1 (F8, Epic 8 D4): a seat whose hold ran out, kept for the run by `seatKey`. */
export interface RememberedSeat {
  readonly playerId: string;
  readonly slot: number;
  readonly name: string;
  readonly guestTokenHash: string;
  readonly accountId: string | null;
  /** Story 7.9 (NP 21): a remembered seat keeps its look. */
  readonly look: string;
  readonly player: SimPlayer;
  readonly kills: number;
  /** Review H2: `buildStartIndex` when the seat was held (restored with it: no free build-start heal). */
  readonly buildIdx: number;
  /** Story 8.3 review H1: the seat's generation (`Member.seatGen`), kept so its bank and rewards stay its own. */
  readonly seatGen?: number;
}

/** `ms` rounded to one decimal, for log lines. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * State patches every 50 ms (20 Hz) in the lobby before the first run. Story 8.11 (AC 1): once a run started, the
 * fixed timestep (which keeps running after Results and Back to lobby) patches itself, once per call of `onTick`.
 */
const LOBBY_PATCH_RATE_MS = 50;

/** RTT probe period (Story 2.4): one `net.pinged` per client per second during a run. */
export const PING_INTERVAL_MS = 1000;
/** Pings whose send time is kept: a pong up to 5 s late still counts (Story 2.4 review; 2.7 needs high RTTs). */
export const PING_HISTORY = 5;
/** Weight of a new RTT sample in the EWMA. */
const RTT_EWMA = 0.25;
/** Tick exceptions in a row before the room gives up and disconnects everyone. */
export const MAX_TICK_ERRORS_IN_A_ROW = 20;
export const TICK_ERROR_MESSAGE = "The game hit an error, sorry";

/** Story 8.7: why a `ping.send` is refused (null = shown). */
export type PingRefusal = "phase" | "frozen" | "held" | "waiting" | "status";

/**
 * Story 8.7 (P4, decision E8-P4): who may ping. The World's phase is build, wave or vote (never the lobby or Results),
 * the World runs (not frozen, 8.1), the seat is not held (8.1), the member is not an 8.2 waiting late joiner (refused by
 * name, whether or not it has a World player yet), and the sender's World player is standing or downed (out = spectating
 * can't).
 */
export function pingRefusal(phase: string, frozen: boolean, held: boolean, status: string | undefined, waiting = false): PingRefusal | null {
  if (phase !== "build" && phase !== "wave" && phase !== "vote" && phase !== "extract") return "phase"; // Story 12.2 (AC 3): pings still work while extracting
  if (frozen) return "frozen";
  if (held) return "held";
  if (waiting) return "waiting";
  if (status !== "alive" && status !== "downed") return "status";
  return null;
}

/** A random uint32 run seed (`node:crypto`; never Math.random). */
export function randomUint32(): number {
  return randomBytes(4).readUInt32BE(0);
}

/**
 * Story 7.12 (7-UI-6): the look of this server's last DROPPED loot bag, so the next one differs ("never the same twice
 * in a row", per process); −1 before the first. Review M6: set on `loot.dropped`, not on the plan, so a run that ends
 * before its bag drops doesn't steer the next look. Server memory only (a restart forgets it).
 */
let lastLootVariant = -1;

/** Story 7.7: the playable districts' maps by id (v1: Downtown only; Epic 11 / later districts add theirs). */
const DISTRICT_MAPS: Readonly<Record<string, DistrictMap>> = { [DOWNTOWN_MAP.name]: DOWNTOWN_MAP };
/** Story 8.4–8.6: a district's map (the boot sweep and the save banks use the same table as the rooms). */
export const mapForDistrict = (district: string): DistrictMap => DISTRICT_MAPS[district] ?? DOWNTOWN_MAP;
/** Decision 8.6-B8: this server build (a save's digest is checked only by the same build). */
export const SAVE_CODE_VERSION = process.env.GIT_SHA?.trim() || "dev";

/** Codes picked by rooms still being created (not yet visible to `getLocalRoomById`). */
const reservedCodes = new Set<string>();

const refuse = (reason: JoinRefusal): ServerError => new ServerError(JOIN_REFUSED_CODE, reason);

/**
 * Story 7.6 review L1: the ticket's account if the token's device row still names it, null if the row is gone or
 * names another account (an old ticket after a log in / reset / log out). No database, a failure or no answer within
 * TICKET_ROW_CHECK_MS → the ticket's account, as before the check (P3: the save server being down never refuses).
 */
export async function ticketStillCurrent(accountId: string, guestTokenHash: string): Promise<string | null> {
  const repo = roomAccountsRepo();
  if (repo === null || !roomChecksTicketRows()) return accountId;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), TICKET_ROW_CHECK_MS);
  });
  try {
    const found = repo.findByTokenHash(guestTokenHash);
    found.catch(() => undefined);
    const r = await Promise.race([found, late]);
    if (r === "late") return accountId;
    return r !== null && r.id === accountId ? accountId : null;
  } catch {
    return accountId;
  } finally {
    clearTimeout(timer);
  }
}
/**
 * Story 8.10 (brief 19, D5): a client built for another wire format would decode garbage; it is
 * refused at join. Review RM1 (like Story 4.1 M1): a pre-8.10 tab sends no version and only knows
 * `balance_mismatch` ("Please refresh" + Refresh), so a MISSING version gets that; a present but
 * different one (a tab from 8.10 on) gets `update_required` ("A new version is out. Please reload.").
 * One small function so Story 8.1's onAuth/onJoin changes merge around it.
 */
export function checkNetProtocol(version: number | undefined): void {
  if (version === undefined) throw refuse("balance_mismatch");
  if (version !== NET_PROTOCOL_VERSION) throw refuse("update_required");
}
/** onAuth runs before a room is picked: its lines carry `roomId: "auth"`. */
export const authLog = roomLog("auth"); // exported for tests (Story 7.9: look_replaced)

/** Story 10.7: what a run's stats finish reads, taken together (one run's bank, district, seed and night start). */
interface RunResultRun {
  readonly bank: RunBank;
  readonly district: string;
  readonly seed: number;
  readonly nightStartedAt: number;
  /** Story 10.12 (B8): an admin cheat was used in this run (the stats row's mark; `finish` never clears it). */
  readonly cheated: boolean;
}

/** Story 10.12 (B2): one admin cheat waiting for the next tick. */
interface QueuedCheat {
  readonly playerId: string;
  readonly seatId: string;
  readonly accountId: string | null;
  readonly cheat: AdminCheat;
}

/**
 * One run: lobby now (Story 2.1), the fight from Story 2.4. The room id is the 4-letter code.
 * Player ids are slots `p0`–`p3`, never the Colyseus sessionId.
 */
export class RunRoom extends Room<{ state: RunState; client: RunClient }> {
  log: Logger = roomLog("pending");
  readonly net = new MessageGuard<RunClient>(
    () => this.clock.currentTime,
    { warn: (obj, msg) => this.log.warn(obj, msg) },
  );
  /** sessionId → server-only member record, in join order (Story 2.3). */
  readonly members = new Map<string, Member>();
  /** Story 7.6: removes this room from `auth/devicesInRooms` (set in onCreate). */
  private unregisterDevices: (() => void) | null = null;
  /** Increments on every join; the lowest `joinOrder` is the longest-connected member. */
  private joinCounter = 0;
  /** Story 8.3 review H1: increments for every NEW seat (never for a takeover, a return or a restored seat). */
  private seatCounter = 0;
  /** Story 8.3 review M5: the host's seat (`hostKeyOf`: player id + join order); `state.hostSlot` follows it. */
  private hostKey: string | null = null;
  /** See `RunRoomOptions`; tests may flip it on a live room. */
  allowSoloStart = false;
  /** Story 2.10: the test scenario this room's runs use (only with `allowTestScenarios`), or null. */
  scenario: TestScenario | null = null;
  /** Story 4.4 (dev only): the seed every run of this room uses (host's `?seed=` + `DEV_ALLOW_RUN_SEED=1`), or null (random). */
  devRunSeed: number | null = null;
  /** sessionId → byte counters (Story 2.10, `net_stats`). */
  readonly netMeters = new Map<string, NetMeters>();
  /** Story 2.10: when the current wave started (or the run, before the first wave), and its most zombies alive. */
  private waveStartMs = 0;
  private peakZombiesAlive = 0;
  /** Review L11: the last wave whose `wave.ended` fired this run (the run_ended log's endlessWaves). */
  private lastClearedWave = 0;
  /** The fight (Story 2.4): set when the run starts; the room is its only writer. */
  controller: RunController | null = null;
  /** Tick durations; logs `slow_tick` (AC 5). */
  slowTicks: SlowTickWatch | null = null;
  /** Patch encode + send durations (Colyseus runs them on its own interval, outside the tick). */
  slowPatches: SlowTickWatch | null = null;
  /** Horde frames (Story 2.5): one encoder per room, counters per player id. */
  private horde: HordeEncoder | null = null;
  readonly hordeStats = new Map<string, HordeStats>();
  private eventCtx: NetEventContext | null = null;
  /** Story 3.6 review M2: per-client interest for turret events (reused every tick). */
  private readonly eventInterest = new EventInterest();
  private readonly eventsMsg: { tick: number; events: readonly NetEvent[] } = { tick: 0, events: [] };
  private tickErrors = 0;
  private shuttingDown = false;
  /** The current run's seed (for `run_ended`) and its ping interval (cleared on the way back to the lobby). */
  private runSeed = 0;
  /** Story 7.4 (AC 5): each slot's name at run start (a borrowed card's "Borrowed from <name>" survives the lender leaving). */
  private readonly runNames = new Map<number, string>();
  /** Stories 7.4/7.5 (AC 2): the run-start progress read is in flight (a second Start is ignored meanwhile). */
  private starting = false;
  private pingTimer: Delayed | null = null;
  /** Latest `net.pinged` id; send times of the last PING_HISTORY ids (slot `id % PING_HISTORY`). */
  private pingId = 0;
  private readonly pingSentAtMs = new Float64Array(PING_HISTORY);
  /** sessionId → highest ping id it answered: each id counts once, and an older id after a newer one is ignored. */
  private readonly lastPongId = new Map<string, number>();
  /** Story 8.1: seats on hold, by player id (dropped or quiet). */
  readonly holds = new Map<string, Hold>();
  /** Story 8.1 (F8): seats whose hold ran out, by `seatKey`, for the rest of the run. */
  readonly rememberedSeats = new Map<string, RememberedSeat>();
  /** Stories 7.7 / 7.11: each member's saved districts and owned parts, loaded at join (absent: none / not loaded). */
  private readonly memberProgress = new Map<string, { readonly districts: readonly string[]; readonly cosmetics: readonly string[] }>();
  /** Stories 7.10 + 7.11: the look each member last asked for (join, then `lobby.set_look`), re-checked once its owned parts load. */
  private readonly askedLook = new WeakMap<Member, unknown>();
  /** Review M3: the run end's banks (settled), so the lobby reloads progress after this run's grants are written. */
  private runBanked: Promise<unknown> = Promise.resolve();
  /** Story 10.7: the run stats writes, in order (start/resumed, then finish; tests await it). Never awaited by a tick. */
  runResultWrites: Promise<void> = Promise.resolve();
  /** Story 10.7 (B8): when this night's Start happened (a lost start row is inserted with this night's length). */
  private nightStartedAt = 0;
  /** Story 10.12 (B2): admin cheats checked and waiting for the next tick (drained before the World steps; reused). */
  private readonly cheatQueue: QueuedCheat[] = [];
  /** Story 10.12 (B7, B4): the run's admin answers per seat and the cheat log rate (a new one per run). */
  private cheatGate = new AdminCheatGate(roomAccountsRepo);
  /** Story 10.12 (AC 7): an admin cheat was used in this run (its stats row is marked once). */
  private cheated = false;
  /** Story 10.12 (B3): the seed and the cheated mark of the run an online "Restart with seed" starts next. */
  private cheatRestartSeed: number | null = null;
  /** Story 8.1: the hold length in seconds (HOLD_S; tests may shorten it on a live room, like `allowSoloStart`). */
  holdS = HOLD_S;
  /** Story 8.1 (F6): the 3-2-1 after a freeze (null: none running). */
  private resumeTimer: Delayed | null = null;
  private frozenAtMs = 0;
  /** PR #19 review L: the 1/s ping timer fired; `onTick` sends it after the step and the patch. */
  private pingDue = false;
  /** Story 8.11: the decoded binary input (reused; `RunController.queueInput` copies it), and a rate-dropped one's. */
  private readonly inputIn: { -readonly [K in keyof PlayerInput]: PlayerInput[K] } = { ...NEUTRAL_INPUT };
  private readonly rateDroppedIn: { -readonly [K in keyof PlayerInput]: PlayerInput[K] } = { ...NEUTRAL_INPUT };
  /** Story 8.13: the tick ack of the input `inputParser` decoded last (`decodeInputAck`; read in `onInput`). */
  private inputAck = -1;
  /** Story 8.13 re-review M1b-R1: the send time (ms, low 16 bits) of the same input (`decodeInputSendMs`). */
  private inputSendMs = -1;
  private readonly inputParser = bytesParser((b: Uint8Array, out: typeof this.inputIn): boolean => {
    if (!decodeInput(b, out)) return false;
    this.inputAck = decodeInputAck(b);
    this.inputSendMs = decodeInputSendMs(b);
    return true;
  }, this.inputIn);
  /** Story 7.2: this run's bank (`meta/banking.ts`; made at Start with the run id), null outside a run. */
  bank: RunBank | null = null;
  /** Story 7.2: the bank's one retry delay (tests shorten it on a live room, like `holdS`). */
  bankRetryMs = BANK_RETRY_MS;
  /**
   * Story 8.3 (H3, decision E8-H2): seats the host removed, for the room's lifetime (the lobby and every later run).
   * Matched with `sameSeat` (the same account or the same guest token). 8.4–8.6 save them (E8-S10).
   */
  readonly bannedSeats: { readonly seatKey: string; readonly guestTokenHash: string }[] = [];
  /** Story 8.2: each waiting late joiner's run-start data (unlocks, Training) by player id, loaded off the join (absent: still loading). */
  private readonly lateInits = new Map<string, RunPlayerInit>();
  /** Story 8.2: this run's dev unlock mask (`DEV_UNLOCKS`, read at Start), applied to late joiners too. */
  private devUnlocksMask: number | null = null;
  /** Story 8.2: player ids of waiting members (kept with `Member.waiting`; the horde view reads it per tick without a scan). */
  private readonly waitingIds = new Set<string>();
  /** Story 8.6: this room resumes a saved run (claimed in onCreate; its lobby, then its Start). Null: a fresh room. */
  private resume: { readonly save: RunSave; readonly expiresAt: Date } | null = null;
  /** Story 8.4 (E8-S7): this run's save writes (one in flight; never awaited by the tick). Null: no run or no database. */
  private saveWriter: SaveWriter | null = null;
  /** Story 8.4: the run's latest save taken (the last autosave): what a mid-wave shutdown / tick error makes resumable. */
  private lastSave: RunSave | null = null;
  /** Story 8.4: an autosave waits for a clean World (a shot still flying at a build start): its kind, else null. */
  private autosavePending: string | null = null;
  /** Story 8.4 (AC 5): "no database" logged once per run. */
  private saveSkipLogged = false;
  /** Story 8.5: Save and quit is writing (ticks pause, a second request is ignored). */
  private savingQuit = false;
  /** Story 8.4: the run's row reached its end state here (resumable or deleted): no later write touches it. */
  private saveSettled = false;
  /** Story 10.7 review H1: this run was saved as resumable here (Save and quit, all left, shutdown, tick error): it plays on. */
  private savedResumable = false;
  /** Story 8.4: the run's save row exists (an autosave or a claim). */
  private saveRowOpen = false;
  /** Review L: bumped at every Start, so a late save of an earlier run never settles the next run's row. */
  private runToken = 0;
  /** Review M5: a final save (everyone left) is in flight: onDispose leaves the row to it. */
  private finalizing = false;

  /** Validates join options before a seat is reserved (runs for create and join). */
  static override async onAuth(_token: string, options: unknown, ctx: AuthContext): Promise<RunAuth> {
    try {
      const auth = RunRoom.checkAuth(options, ctx);
      // Story 7.6 review L1: a valid ticket counts only while its token's device row still names that account (an old
      // ticket after a log in, a reset or a log out stops seating). Save server slow or down → the ticket as before (P3).
      if (auth.accountId !== null) auth.accountId = await ticketStillCurrent(auth.accountId, auth.guestTokenHash);
      return auth;
    } catch (e) {
      // Logged here because Colyseus's own line has no context (no IP, no token: just the reason).
      if (e instanceof ServerError) authLog.info({ reason: e.message }, "join_refused");
      throw e;
    }
  }

  private static checkAuth(options: unknown, ctx: AuthContext): RunAuth {
    let size: number;
    try {
      size = JSON.stringify(options ?? null).length;
    } catch {
      throw refuse("invalid_options");
    }
    if (size > MAX_CLIENT_MESSAGE_BYTES) throw refuse("invalid_options");
    const parsed = joinOptionsSchema.safeParse(options);
    if (!parsed.success) {
      // Story 4.1 review M1: a client older than the map (no mapVersion) is an old build: "Please refresh".
      // Re-review L3: only a MISSING one; a present but malformed one (a number, 17 chars) is invalid_options.
      const absent = typeof options === "object" && options !== null && (options as { mapVersion?: unknown }).mapVersion === undefined;
      if (absent && parsed.error.issues.every((i) => i.path[0] === "mapVersion")) throw refuse("balance_mismatch");
      throw refuse("invalid_options");
    }
    checkNetProtocol(parsed.data.netProtocolVersion); // Story 8.10
    if (parsed.data.balanceVersion !== serverBalance.version) throw refuse("balance_mismatch");
    // Story 4.1: a client built with another map would predict against other walls.
    if (parsed.data.mapVersion !== DOWNTOWN_MAP.version) throw refuse("balance_mismatch");
    // Story 2.2 AC 3: `ctx.ip` is X-Real-IP, which Caddy sets from Cloudflare's Cf-Connecting-Ip.
    if ((parsed.data.intent === "create" || parsed.data.intent === "resume") && !roomCreateLimiter.allow(ctx.ip ?? "unknown")) {
      log.warn({ ip: ctx.ip ?? "unknown" }, "room_create_rate_limited");
      throw refuse("rate_limited");
    }
    // Story 7.1 (P4): only a server-signed ticket names an account; pure HMAC, no database (AC 9). Never logged.
    // Review M1: the ticket counts only with the guest token it was issued for.
    const guestTokenHash = hashGuestToken(parsed.data.guestToken);
    // Story 7.6 review L2: this device is in the middle of a log in / reset / log out: its token is about to change.
    if (isSwitching(guestTokenHash)) throw refuse("rate_limited");
    const accountId = ticketAccountId(parsed.data.ticket, guestTokenHash);
    // Story 7.9 (L1, L2): a look never refuses a join; parts the account doesn't own become default parts. The join stays
    // database-free (7.1 AC 9): starter parts here; 7.11's owned parts re-check the asked look once the room loads the
    // member's progress (`loadMemberProgress`, B26). Logged as a count only, never the player-chosen text.
    const look = decodeLook(parsed.data.look, ownedParts());
    if (look.replaced > 0) authLog.info({ fields: look.replaced }, "look_replaced");
    return { name: parsed.data.name, ip: ctx.ip, guestTokenHash, accountId, look: encodeLook(look.look), rawLook: parsed.data.look };
  }

  override async onCreate(options: { intent?: unknown } & Partial<RunRoomOptions>): Promise<void> {
    if (options.intent !== "create" && options.intent !== "resume") throw refuse("invalid_options");
    this.allowSoloStart = options.allowSoloStart === true;
    const code = uniqueRoomCode((c) => reservedCodes.has(c) || matchMaker.getLocalRoomById(c) !== undefined);
    reservedCodes.add(code);
    if (options.intent === "resume") {
      try {
        await this.claimResume(options as unknown as Record<string, unknown>, code); // Story 8.6 (AC 12): before the room opens
      } catch (e) {
        reservedCodes.delete(code);
        throw e;
      }
    }
    // Story 7.6 (AC 9): account switches are refused while a device is a member here (connected or held).
    this.unregisterDevices = registerRoomDevices(() => Array.from(this.members.values(), (m) => m.guestTokenHash));
    this.roomId = code;
    this.log = roomLog(code);
    this.takeScenario(options as { scenario?: unknown; allowTestScenarios?: unknown });
    this.takeDevRunSeed((options as { devRunSeed?: unknown }).devRunSeed);
    this.maxClients = MAX_PLAYERS;
    this.patchRate = LOBBY_PATCH_RATE_MS;
    // Story 8.11 (AC 2, decision 8.11 D2): everything one tick sends a client (horde frame, events, ping, patch)
    // reaches its socket as one write: Colyseus 0.18.29 corks each socket for the timestep's callback.
    this.autoBatchMessages = true;
    // Only reachable by its code (joinById), never by a "join any run" matchmaking call.
    await this.setPrivate(true, false);
    this.setState(new RunState({ phase: "lobby", hostSlot: 0 }));
    if (this.resume) {
      // Story 8.6 (E8-R1, E8-S10): "Resuming · <district> · wave N"; the saved run's bans hold in this room too.
      this.state.district = this.resume.save.district;
      this.state.resumeWave = Math.max(1, this.resume.save.wave);
      for (const b of this.resume.save.bannedSeats) this.bannedSeats.push({ seatKey: b.seatKey, guestTokenHash: b.guestTokenHash });
      this.seatCounter = Math.max(0, ...this.resume.save.seats.map((x) => x.seatGen));
      this.saveRowOpen = true;
      this.log.info({ runId: this.resume.save.runId, wave: this.resume.save.wave, seats: this.resume.save.seats.length }, "run_resume_lobby");
    }

    // Story 8.11 (AC 3, F2): the binary input, through the same guard: its own 25/s bucket (unchanged), then
    // `decodeInput` (exactly the schema's rules); a malformed or over-long one is dropped and counted as `invalid`.
    this.onMessageBytes(
      BYTES.INPUT,
      this.net.guard(this.inputParser, (c, input) => this.onInput(c, input), "input", (c, m) => this.onInputRateDropped(c, m)),
    );
    this.onMessage(C2S.LOBBY_SET_READY, this.net.guard(lobbySetReadySchema, (c, m) => this.onSetReady(c, m.ready)));
    this.onMessage(C2S.LOBBY_SET_LOOK, this.net.guard(lobbySetLookSchema, (c, m) => this.onSetLook(c, m.look))); // Story 7.10 (D3)
    this.onMessage(C2S.RUN_START, this.net.guard(runStartSchema, (c) => this.onStart(c)));
    this.onMessage(C2S.NET_PONG, this.net.guard(netPongSchema, (c, m) => this.onPong(c, m.id)));
    this.onMessage(C2S.LOBBY_RETURN, this.net.guard(lobbyReturnSchema, (c) => this.onLobbyReturn(c)));
    this.onMessage(C2S.BUILD_SET_READY, this.net.guard(buildSetReadySchema, (c, m) => this.onBuildReady(c, m.ready)));
    this.onMessage(C2S.EVAC_VOTE, this.net.guard(evacVoteSchema, (c, m) => this.onEvacVote(c, m.choice))); // Story 6.11
    this.onMessage(C2S.RUN_LEAVE, this.net.guard(runLeaveSchema, (c) => this.onRunLeave(c))); // Story 7.2 (D4)
    this.onMessage(C2S.LOBBY_DISTRICT, this.net.guard(lobbyDistrictSchema, (c, m) => this.onLobbyDistrict(c, m.id))); // Story 7.7
    this.onMessage(C2S.BUILDING_PLACE, this.net.guard(buildingPlaceSchema, (c, m) => this.onPlaceBuilding(c, m)));
    this.onMessage(C2S.SHOP_BUY, this.net.guard(shopBuySchema, (c, m) => this.onShopBuy(c, m.build, m.rev, m.card, m.item, m.slot ?? null)));
    this.onMessage(C2S.SHOP_REROLL, this.net.guard(shopRerollSchema, (c, m) => this.onShopReroll(c, m.build, m.rev))); // Story 5.13
    this.onMessage(C2S.BUILDING_REPAIR, this.net.guard(buildingRepairSchema, (c, m) => this.onRepairBuilding(c, m.id)));
    this.onMessage(C2S.BUILDING_UPGRADE, this.net.guard(buildingUpgradeSchema, (c, m) => this.onUpgradeBuilding(c, m.id))); // Story 5.9
    this.onMessage(C2S.BUILDING_SELL, this.net.guard(buildingSellSchema, (c, m) => this.onSellBuilding(c, m.id))); // Story 5.20
    this.onMessage(C2S.BUILDING_MOVE, this.net.guard(buildingMoveSchema, (c, m) => this.onMoveBuilding(c, m))); // Story 5.22
    this.onMessage(C2S.BUILDING_GHOST, this.net.guard(buildingGhostSchema, (c, m) => this.onGhost(c, m), "ghost")); // Story 5.24: own bucket (D1)
    this.onMessage(C2S.SHOP_UPGRADE, this.net.guard(shopUpgradeSchema, (c, m) => this.onShopUpgrade(c, m.weapon))); // Story 5.1
    this.onMessage(C2S.SHOP_BUY_ITEM, this.net.guard(shopBuyItemSchema, (c, m) => this.onShopBuyItem(c, m.item))); // Story 5.11
    this.onMessage(C2S.HOST_REMOVE, this.net.guard(hostRemoveSchema, (c, m) => this.onHostRemove(c, m.playerId))); // Story 8.3 (D9)
    this.onMessage(C2S.RUN_SAVE_QUIT, this.net.guard(runSaveQuitSchema, (c) => this.onSaveQuit(c))); // Story 8.5 (D12)
    this.onMessage(C2S.ADMIN_CHEAT, this.net.guard(adminCheatSchema, (c, m) => this.onAdminCheat(c, m))); // Story 10.12 ("other" bucket)
    // Story 8.7 (pings) ↓ — one block (8.2+8.3 adds its own): own 1/s bucket (E8-P5), rate drops counted (`pingDropped`).
    this.onMessage(C2S.PING_SEND, this.net.guard(pingSendSchema, (c, m) => this.onPing(c, m), "ping", (c) => this.countPingDrop(c)));
    // Story 8.7 ↑
    this.onMessage("*", (client) => this.net.unknown(client));
  }

  /** Story 2.10: the creator's `scenario`, honoured only when the server allows test scenarios. */
  private takeScenario(options: { scenario?: unknown; allowTestScenarios?: unknown }): void {
    if (options.scenario === undefined) return;
    if (!isTestScenario(options.scenario)) return; // onAuth refused anything else already
    if (options.allowTestScenarios === true) this.scenario = options.scenario;
    else this.log.warn({ scenario: options.scenario }, "test_scenario_refused");
  }

  /** Story 4.4: the creator's `devRunSeed`, honoured only by a dev server with `DEV_ALLOW_RUN_SEED=1`. */
  private takeDevRunSeed(requested: unknown): void {
    const pick = pickDevRunSeed(requested, process.env);
    this.devRunSeed = pick.seed;
    if (pick.ignored) this.log.warn({ seed: requested, reason: pick.ignored }, "dev_run_seed_ignored");
  }

  override async onJoin(client: RunClient): Promise<void> {
    try {
      // Story 7.6 re-review RR2: the ticket's device row is checked AGAIN when the socket arrives — a seat reserved
      // (≤ 15 s) before a reset, a log in or a log out must not seat the account (nor rename it): the seat is unsaved.
      if (client.auth && client.auth.accountId !== null) client.auth.accountId = await ticketStillCurrent(client.auth.accountId, client.auth.guestTokenHash);
      // Story 7.6 review L2: re-checked here, synchronously with the member being added (an account switch that
      // started after onAuth either sees this member in its room re-check, or this join sees its mark).
      if (client.auth && isSwitching(client.auth.guestTokenHash)) throw refuse("rate_limited");
      this.join(client);
    } catch (e) {
      if (e instanceof ServerError) this.log.info({ reason: e.message }, "join_refused");
      throw e;
    }
    if (client.auth) this.saveDisplayName(client.auth);
  }

  /**
   * Story 7.1 AC 7: the name used at a successful join becomes the account's display name. Async, best effort,
   * never awaited (a slow or dead database never delays a join or a tick; the repository logs `db_error`).
   */
  private saveDisplayName(auth: RunAuth): void {
    this.log.info({ accountId: auth.accountId }, "join_account");
    const accounts = roomAccountsRepo();
    if (auth.accountId === null || accounts === null) return;
    accounts.setDisplayName(auth.accountId, auth.name).catch(() => undefined);
  }

  private join(client: RunClient): void {
    const auth = client.auth;
    if (!auth) throw refuse("invalid_options");
    const key = seatKey(auth);
    // Story 8.3 (H3, E8-H2): a removed seat never joins this room again (lobby or any later run).
    if (this.bannedSeats.some((b) => sameSeat(b, auth))) throw refuse("removed");
    if (this.state.phase !== "lobby") {
      // Story 8.1: a started run takes back its own seats first (J2: own seat, never late-joiner money).
      // Story 7.1: "its own" = the same account or the same guest token (`sameSeat`, decision 7.1 D5).
      for (const m of this.members.values()) if (sameSeat(m, auth)) return this.takeOver(m, client); // D5: the newest connection takes the seat
      for (const [seatKeyOf, seat] of this.rememberedSeats) {
        // E8-J5: a remembered seat mid-wave keeps getting `seat_kept` (back at a build phase), never a waiting member.
        if (sameSeat({ seatKey: seatKeyOf, guestTokenHash: seat.guestTokenHash }, auth)) return this.restoreRemembered(seatKeyOf, seat, client);
      }
      return this.joinLate(client, auth, key); // Story 8.2: a new seat (build) or a waiting one (wave, vote)
    }
    for (const m of this.members.values()) if (sameSeat(m, auth)) throw refuse("already_joined"); // the lobby keeps the refusal (D5)
    // Story 8.6 (AC 13, J3): in a resumed run's lobby a returning seat takes its own slot; a newcomer only a slot no saved seat holds.
    const savedSeat = this.resume ? this.savedSeatOf(auth) : undefined;
    const taken = Array.from(this.members.values(), (m) => m.slot);
    const slot = savedSeat ? (taken.includes(savedSeat.slot) ? -1 : savedSeat.slot) : assignSlot(this.resume ? [...taken, ...this.resume.save.seats.map((x) => x.slot)] : taken);
    if (slot < 0 && this.resume) throw refuse("run_full");
    if (slot < 0) throw refuse("invalid_options"); // unreachable: maxClients locks the room at 4
    const playerId = `p${slot}`;
    const member: Member = {
      playerId,
      slot,
      sessionId: client.sessionId,
      name: auth.name,
      guestTokenHash: auth.guestTokenHash,
      accountId: auth.accountId,
      look: auth.look,
      seatKey: key,
      joinOrder: ++this.joinCounter, // a counter, not the clock: a clock jump can't reorder hosts
      rttMs: 0,
      seatGen: savedSeat ? savedSeat.seatGen : ++this.seatCounter, // Story 8.6: a returning seat keeps its generation (its bank key)
    };
    // The creator is host (slot 0); later joiners never take it over.
    if (this.members.size === 0) {
      this.state.hostSlot = slot;
      this.hostKey = hostKeyOf(member); // review M5
    }
    this.members.set(client.sessionId, member);
    this.state.players.set(playerId, new PlayerState({ slot, name: auth.name, ready: false, look: auth.look, seat: seatIdOf(member) }));
    this.attachClient(client, member);
    this.log.info({ playerId, slot }, "player_joined");
    this.askedLook.set(member, auth.rawLook);
    void this.loadMemberProgress(member, auth.rawLook); // Stories 7.7 / 7.11: districts and owned parts (async, never awaited)
  }

  /** The per-socket parts of a join (a first join, a reconnect, a takeover): guard, byte meters, `run.joined`. */
  private attachClient(client: RunClient, member: Member): void {
    // Review L2: a reconnect (same sessionId) keeps its guard: buckets and drop counters carry over.
    this.net.add(client, member.playerId, true);
    // Story 8.10 × 8.1: every caller passes a NEW Colyseus client object (0.18 builds a new client on a reconnect,
    // `_onJoin` › `reconnection.resolve(client)`), so the WeakMap-per-client encoder starts with a keyframe by
    // itself; resetting the stream here is belt and braces (first join, reconnect, takeover, restored seat).
    this.horde?.resetHordeStream(client);
    this.countBytes(client);
    client.send(S2C.RUN_JOINED, { playerId: member.playerId, slot: member.slot, tickRateHz: TICK_RATE_HZ } satisfies RunJoined);
    // Story 7.2 (RR-L1): the run's id first, during a run or on its Results, so the phone accepts only this run's rewards.
    if (this.bank && this.state.phase !== "lobby") client.send(S2C.RUN_STARTED, { runId: this.bank.runId } satisfies RunStarted);
    // Story 7.2: a seat that comes back on Results gets its run rewards again (it may have missed them while away).
    const rewards = this.state.phase === "results" ? this.bank?.resultFor(seatIdOf(member)) : undefined;
    if (rewards) client.send(S2C.RUN_REWARDS, rewards);
    // A frame over maxPayload is refused by ws, which closes this socket (AC 5 "too large").
    client.ref.on("error", (e: { code?: string }) => {
      if (e.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") this.net.drop(client, "too_large");
    });
  }

  /**
   * Story 8.2 (J3, decision E8-J3): THE taken slots — members (connected, held or waiting) and remembered seats. A late
   * joiner never takes a teammate's slot (its player id, building cap and turret pay).
   */
  takenSlots(): number[] {
    const out = Array.from(this.members.values(), (m) => m.slot);
    for (const seat of this.rememberedSeats.values()) out.push(seat.slot);
    return out;
  }

  /**
   * Story 8.2 (AC 1, 4, 6; J1, J3, J4): a new player joins a started run. Results → `run_started` ("This run is
   * ending"). No free slot (members + held + remembered seats hold all 4) → `run_full`. Otherwise a WAITING member
   * with a reserved slot: not in the World, watching; its unlocks and Training load off the join (2 s timeout, the
   * join reads no database, 7.1 AC 9); it enters the World in a build phase once they have loaded (at once in a
   * build phase, else at the next `build.started`), with the late-join money computed then.
   */
  private joinLate(client: RunClient, auth: RunAuth, key: string): void {
    const controller = this.controller;
    if (!controller || !this.inRun()) throw refuse("run_started");
    if (this.state.phase === "extract") throw refuse("run_started"); // Story 12.2 (AC 13): the run is ending: no waiting joiner
    const slot = assignSlot(this.takenSlots());
    if (slot < 0) throw refuse("run_full");
    const playerId = `p${slot}`;
    const member: Member = {
      playerId,
      slot,
      sessionId: client.sessionId,
      name: auth.name,
      guestTokenHash: auth.guestTokenHash,
      accountId: auth.accountId,
      look: auth.look,
      seatKey: key,
      joinOrder: ++this.joinCounter,
      rttMs: 0,
      waiting: true,
      seatGen: ++this.seatCounter, // review H1: a new seat, even in a removed player's slot
    };
    this.members.set(client.sessionId, member);
    this.waitingIds.add(playerId);
    this.state.players.set(playerId, new PlayerState({ slot, name: auth.name, ready: false, look: auth.look, waiting: true, seat: seatIdOf(member) }));
    this.hordeStats.set(playerId, newHordeStats()); // J4: a waiting member watches the fight (horde frames from its spectate view)
    this.runNames.set(slot, auth.name);
    this.attachClient(client, member);
    this.log.info({ playerId, slot, phase: this.state.phase, wave: controller.world.waves.number }, "player_waiting");
    this.syncJoinPending();
    void this.loadLateInit(member);
    void this.loadMemberProgress(member, auth.rawLook); // review nit: its owned look parts (no districts mid-run)
  }

  /**
   * Story 8.2 review L3: while a waiting joiner is loading in a build phase, everyone else being Ready does not start the
   * wave early (`run.joinPending`; the build timer still runs). Recomputed whenever waiting members or the phase change.
   */
  private syncJoinPending(): void {
    const w = this.controller?.world;
    if (!w) return;
    let pending = false;
    if (this.state.phase === "build") for (const m of this.members.values()) if (m.waiting === true) pending = true;
    if (w.run.joinPending !== pending) w.run.joinPending = pending;
  }

  /** Story 8.2: the waiting member's unlocks and Training (like a run start's read), then it enters if it can. */
  private async loadLateInit(member: Member): Promise<void> {
    let init: RunPlayerInit | undefined;
    try {
      [init] = await loadRunInits([{ playerId: member.playerId, slot: member.slot, accountId: member.accountId }], roomProgressRepo());
    } catch {
      init = undefined;
    }
    // Left meanwhile (a takeover keeps the seat's joinOrder; a new joiner in the freed slot has another).
    const still = Array.from(this.members.values()).some((m) => m.playerId === member.playerId && m.joinOrder === member.joinOrder && m.waiting === true);
    if (!still) return;
    if (init?.source === "read_failed") this.log.warn({ playerId: member.playerId }, "run_progress_read_failed");
    this.lateInits.set(member.playerId, init ?? { playerId: member.playerId, slot: member.slot, unlocks: STARTER_ONLY, training: NO_TRAINING, source: "read_failed" });
    if (this.state.phase === "build") this.enterWaiting();
  }

  /**
   * Story 8.2 (AC 1, 2, 3; J1, J5, J6): every waiting member whose start data has loaded enters the World — a build
   * phase only (called on `build.started` and when a build-phase joiner's data arrives). Money: `lateJoinWallet` over
   * the seats in the fight (present + held; E8-J2), with the member's own start money (Training) as the floor; dev
   * `DEV_STARTING_WALLET` sets the exact number. The first entry of the build adds +15 s (E8-J4).
   */
  private enterWaiting(atBuildStart = false): void {
    const controller = this.controller;
    if (!controller || this.state.phase !== "build" || controller.world.run.phase !== "build") return;
    let entered = false;
    const world = controller.world;
    // Review M4: the team average once, before anyone enters (a second waiter's money doesn't count the first one's 0).
    const seats = [...world.players.values(), ...[...world.heldPlayers.values()].map((h) => h.player)];
    const avgEarned = Math.round(averageEarned(seats));
    for (const [sessionId, member] of this.members) {
      const init = member.waiting === true ? this.lateInits.get(member.playerId) : undefined;
      if (!init) continue;
      const training = devStartingWallet !== null ? { ...init.training, startMoney: 0 } : init.training;
      const ownStart = trainedStartMoney(world.balance, training.startMoney);
      const wallet = devStartingWallet !== null ? devStartingWallet : lateJoinWallet(seats, world.balance, ownStart);
      if (!controller.addLatePlayer(member.playerId, member.slot, wallet, { unlocks: this.devUnlocksMask ?? init.unlocks, training })) {
        this.log.warn({ playerId: member.playerId }, "late_join_failed");
        continue;
      }
      this.lateInits.delete(member.playerId);
      this.waitingIds.delete(member.playerId);
      member.waiting = false;
      const s = this.state.players.get(member.playerId);
      if (s) s.waiting = false;
      entered = true;
      this.log.info({ playerId: member.playerId, slot: member.slot, wave: world.waves.number, wallet, avgEarned, source: init.source }, "player_joined_mid_run");
      const client = this.clients.getById(sessionId) as RunClient | undefined;
      if (client && !atBuildStart) this.sendOffer(client, member.playerId); // at a build start `sendOffers` sends it (once)
    }
    this.syncJoinPending();
    if (!entered) return;
    syncState(this.state, controller); // the new survivors, wallets and the extended timer in the next patch
    this.updateFreeze(); // review nit: no host move here (a held host keeps the role until a return or its hold ends, H1)
  }

  /**
   * Story 8.3 (H1, AC 8, Epic 8 D8): if the host's member is held, gone or waiting, the role moves AT ONCE to the
   * longest-connected connected, non-waiting member (`nextConnectedHost`); none → it stays (everyone is held: the room
   * is frozen; the first one back takes it by this rule). It never moves back to a returning old host.
   */
  private moveHostIfGone(why: "left" | "held" | "removed" | "returned" | "lobby"): void {
    const held = (id: string): boolean => this.holds.has(id);
    // Review M5: the host is a SEAT (player id + join order), not a slot: a remembered old host coming back into the
    // same slot is a new connection and never takes the role back silently.
    for (const m of this.members.values()) {
      if (hostKeyOf(m) === this.hostKey && m.waiting !== true && !held(m.playerId)) return; // the host is here
    }
    const host = nextConnectedHost(this.members.values(), held);
    if (!host) return;
    this.hostKey = hostKeyOf(host);
    if (this.state.hostSlot !== host.slot) this.state.hostSlot = host.slot;
    this.log.info({ playerId: host.playerId, slot: host.slot, why }, "host_changed");
  }

  /** Story 8.3 (AC 11): `state.leftSeats` follows `rememberedSeats` (the host's Players list can remove them). On change only. */
  private syncLeftSeats(): void {
    const list = Array.from(this.rememberedSeats.values(), (s) => [s.playerId, s.name]);
    const json = list.length === 0 ? "" : JSON.stringify(list);
    if (this.state.leftSeats !== json) this.state.leftSeats = json;
  }

  /** Story 8.1: build, wave and vote (and endless, which is build/wave): a drop is held. Lobby and results: a drop is a leave (D7). */
  inRun(): boolean {
    const phase = this.state.phase;
    return this.controller !== null && (phase === "build" || phase === "wave" || phase === "vote" || phase === "extract"); // Story 12.2: the extraction
  }

  /**
   * Story 8.1 (AC 6, decision 8.1 D5): the same seat (`seatKey`) joins a started run while its seat
   * is held or still open: the new connection takes it. The old socket is closed (CLOSE_TAKEN_OVER 4021, not a
   * consented leave) or its pending reconnection is rejected; the member record moves to the new
   * session first, so the old socket's onDrop/onLeave find no member and do nothing (no hold restart).
   */
  private takeOver(old: Member, client: RunClient): void {
    // Story 7.1: a seat that joined unsaved gains the account of a later valid ticket; an account seat keeps its own.
    // Review L1: re-keyed to `acct:` then, so the same account from another device takes it over too (8.1 D5).
    const accountId = old.accountId ?? client.auth?.accountId ?? null;
    const member: Member = { ...old, sessionId: client.sessionId, accountId, seatKey: seatKey({ guestTokenHash: old.guestTokenHash, accountId }) };
    this.members.delete(old.sessionId);
    this.members.set(client.sessionId, member);
    this.netMeters.delete(old.sessionId);
    this.lastPongId.delete(old.sessionId);
    this.net.rename(old.sessionId, client.sessionId); // review L2: the seat's buckets and drop counters move with it
    const oldClient = this.clients.getById(old.sessionId);
    if (oldClient) this.horde?.forgetClient(oldClient); // Story 8.10: the old socket's horde baseline goes with it
    const hold = this.holds.get(member.playerId);
    if (hold?.reconnection) {
      hold.reconnection.reject(new Error("taken_over"));
      hold.reconnection = null;
    } else {
      const oldClient = this.clients.getById(old.sessionId);
      if (oldClient) oldClient.leave(CLOSE_TAKEN_OVER);
    }
    this.attachClient(client, member);
    if (hold) this.endHold(member, "guest");
    else this.controller?.resetInputs(member.playerId); // a connected seat: the new tab's seqs start afresh
    this.sendOffer(client, member.playerId);
    this.log.info({ playerId: member.playerId, held: hold !== undefined }, "seat_taken_over");
  }

  /**
   * Story 8.1 (AC 9, F8): a remembered seat rejoins: only in a build phase and only into its own
   * slot while free (never late-joiner money). Anything else: `seat_kept` (the phone retries).
   */
  private restoreRemembered(key: string, seat: RememberedSeat, client: RunClient): void {
    const controller = this.controller;
    const slotTaken = Array.from(this.members.values()).some((m) => m.slot === seat.slot);
    if (!controller || this.state.phase !== "build" || slotTaken) throw refuse("seat_kept");
    if (!controller.restoreSeat(seat.player, seat.kills, seat.buildIdx)) throw refuse("seat_kept");
    this.rememberedSeats.delete(key);
    this.syncLeftSeats();
    this.bank?.reopen(seatIdOf(seat)); // Story 8.2 (AC 13, E8-J6): a seat that banked on its Leave banks the difference at the end
    const accountId = seat.accountId ?? client.auth?.accountId ?? null;
    const member: Member = {
      playerId: seat.playerId,
      slot: seat.slot,
      sessionId: client.sessionId,
      name: seat.name,
      guestTokenHash: seat.guestTokenHash,
      accountId,
      look: seat.look, // Story 7.9: the seat's look, not the new connection's (mid-run the look never changes)
      seatKey: seatKey({ guestTokenHash: seat.guestTokenHash, accountId }), // review L1: `acct:` once it has an account
      joinOrder: ++this.joinCounter, // the newest member: the host role never moves back (Epic 8 D8)
      rttMs: 0,
      ...(seat.seatGen !== undefined ? { seatGen: seat.seatGen } : {}), // review H1: the same seat
    };
    this.members.set(client.sessionId, member);
    this.state.players.set(seat.playerId, new PlayerState({ slot: seat.slot, name: seat.name, ready: false, look: seat.look, seat: seatIdOf(member) }));
    this.hordeStats.set(seat.playerId, newHordeStats());
    this.attachClient(client, member);
    syncState(this.state, controller); // the seat's fields in the first patch
    this.sendOffer(client, seat.playerId);
    this.log.info({ playerId: seat.playerId, slot: seat.slot, wallet: seat.player.wallet }, "seat_restored");
    this.moveHostIfGone("returned"); // review M5: a remembered old host back in its slot is not the host by itself
    this.updateFreeze();
    void this.loadMemberProgress(member, undefined, false); // review round 2 L2: its districts count again (finalLeave dropped them); the look stays
  }

  /**
   * Story 8.1 (AC 1, 2): puts a seat on hold. A drop gets Colyseus's 120 s reconnection; a quiet
   * player (already out of the World, `RunController.onQuietHold`) the room's own 120 s timer. A
   * quiet seat that then drops switches to the reconnection window.
   */
  private startHold(member: Member, reason: HoldReason, client: RunClient | null): void {
    const controller = this.controller;
    if (!controller) return;
    // Decision 8.1 B16: a drop leaves the body standing for 3 s mid-wave (it vanishes then, `onDropHold`); a quiet seat
    // is already out of the World (the controller held it); either is a no-op when already held (quiet → drop).
    if (reason === "drop") controller.dropPlayer(member.playerId);
    else controller.holdPlayer(member.playerId);
    let hold = this.holds.get(member.playerId);
    const fresh = !hold;
    if (!hold) {
      hold = { reason, atMs: performance.now(), reconnection: null, timer: null };
      this.holds.set(member.playerId, hold);
    }
    hold.reason = reason;
    hold.timer?.clear();
    hold.timer = null;
    // A quiet seat that then drops keeps its clock: the 120 s run from the first hold (Epic 8 D1), never restart.
    const leftS = Math.max(1, this.holdS - (performance.now() - hold.atMs) / 1000);
    if (reason === "drop" && client) {
      const reconnection = this.allowReconnection(client, leftS);
      reconnection.catch(() => {}); // a timeout or takeover: Colyseus calls onLeave (expiry) itself
      hold.reconnection = reconnection;
    } else {
      hold.timer = this.clock.setTimeout(() => this.expireQuiet(member.playerId), leftS * 1000);
    }
    const s = this.state.players.get(member.playerId);
    // Re-review RR2-M1: `heldUntilTick` (the chip, the vote panel, and the mirror hiding the body) only once the body
    // has really left the World — a B16 dropping body stays visible for its 3 s; `onDropHold` writes it at the vanish.
    if (s && fresh && !controller.isDropping(member.playerId)) s.heldUntilTick = controller.world.tick + Math.round(this.holdS * TICK_RATE_HZ);
    this.log.info({ playerId: member.playerId, reason, wave: controller.world.waves.number, phase: this.state.phase }, "player_held");
    this.moveHostIfGone("held"); // Story 8.3 (H1): at once, not after the 120 s
    this.updateFreeze();
  }

  /** Story 8.1 (AC 3): the seat's hold ends (a reconnect, a takeover or inputs again after a quiet hold). */
  private endHold(member: Member, via: "token" | "guest" | "input"): void {
    const hold = this.holds.get(member.playerId);
    if (!hold) return;
    hold.timer?.clear();
    this.holds.delete(member.playerId);
    const wasHost = hostKeyOf(member) === this.hostKey;
    member.joinOrder = ++this.joinCounter; // Story 8.3 (E8-H1): back from a hold = the newest connection (the role never moves back)
    if (wasHost) this.hostKey = hostKeyOf(member); // still the host (the role had nowhere to go): the same seat
    // B16: back while the dropped body still stands: it plays on in place (no return placement, no protection).
    // Decision 8.1 B18: back into a frozen World, the 3-2-1 replaces the return protection (and placement).
    if (!this.controller?.returnPlayer(member.playerId, !this.state.frozen)) this.controller?.cancelDrop(member.playerId);
    const s = this.state.players.get(member.playerId);
    if (s) s.heldUntilTick = 0;
    if (this.controller) syncState(this.state, this.controller); // the placed body and protection in the next patch
    this.log.info({ playerId: member.playerId, afterMs: Math.round(performance.now() - hold.atMs), via, reason: hold.reason }, "player_returned");
    this.moveHostIfGone("returned"); // everyone was held: the first one back becomes host (H1)
    this.updateFreeze();
  }

  /** Story 8.1: a quiet hold ran out with the socket still open: the seat is remembered and the socket closed (CLOSE_SEAT_KEPT 4020). */
  private expireQuiet(playerId: string): void {
    const hold = this.holds.get(playerId);
    if (!hold || hold.reason !== "quiet") return;
    for (const [sessionId, m] of this.members) {
      if (m.playerId !== playerId) continue;
      this.finalLeave(m, "hold_expired", undefined);
      this.clients.getById(sessionId)?.leave(CLOSE_SEAT_KEPT); // member gone: its onDrop/onLeave do nothing
      return;
    }
  }

  /**
   * Story 8.1 (F6, Epic 8 D5): nobody present in the World (all dropped or quiet) → the World
   * freezes (`onTick` stops stepping; tick-counted timers wait by construction). The first one back
   * starts a 3-2-1 on the room clock (1 s each); everyone gone again cancels it — decision 8.1 B19: a B16
   * dropping body counts as present, so a solo drop (or a re-drop during the 3-2-1) first runs its 3 s in a
   * stepped World (the count finishes, the body stands hittable) and only then freezes.
   */
  private updateFreeze(): void {
    const controller = this.controller;
    if (!controller || !this.inRun()) return;
    if (this.state.phase === "extract") {
      // Story 12.2 review H1: nothing can hurt anyone and the extraction ends in ≤ 18 s: it runs to Results (and banks
      // "extracted") even with nobody connected; never frozen, no 3-2-1.
      this.resumeTimer?.clear();
      this.resumeTimer = null;
      this.state.resumeIn = 0;
      this.state.frozen = false;
      return;
    }
    if (controller.activeCount() === 0) {
      this.resumeTimer?.clear();
      this.resumeTimer = null;
      this.state.resumeIn = 0;
      if (!this.state.frozen) {
        this.state.frozen = true;
        this.frozenAtMs = performance.now();
        this.log.info({ tick: controller.world.tick, wave: controller.world.waves.number, phase: this.state.phase }, "room_frozen");
      }
      return;
    }
    if (!this.state.frozen || this.resumeTimer) return;
    this.state.resumeIn = RESUME_COUNT_S;
    this.resumeTimer = this.clock.setInterval(() => {
      this.state.resumeIn--;
      if (this.state.resumeIn > 0) return;
      this.resumeTimer?.clear();
      this.resumeTimer = null;
      this.state.frozen = false;
      this.log.info({ frozenMs: Math.round(performance.now() - this.frozenAtMs), tick: this.controller?.world.tick ?? 0 }, "room_resumed");
    }, 1000);
  }

  /**
   * Story 2.10: counts this client's bytes both ways. Wrapping `raw` (bound once per join) sees
   * everything the server writes to this socket; the `ws` `message` listener sees every frame it
   * receives, whole (so `in` is exact, not an estimate). Nothing is allocated per message.
   */
  private countBytes(client: RunClient): void {
    const meters: NetMeters = { out: new ByteRate(), in: new ByteRate() };
    this.netMeters.set(client.sessionId, meters);
    const raw = client.raw.bind(client);
    client.raw = (data, options, cb) => {
      meters.out.add(performance.now(), data.byteLength);
      raw(data, options, cb);
    };
    (client.ref as { on(event: "message", cb: (data: { byteLength: number }) => void): void }).on("message", (data) =>
      meters.in.add(performance.now(), data.byteLength),
    );
  }

  /**
   * A player left (Story 2.11): out of the members, the state and (mid-run) the World, then
   * `player.left` to everyone still here, in the lobby too, so the lobby list and the toast agree.
   * `reason` is "left" for a consented leave (`room.leave(true)`, close code 4000) and
   * "disconnected" otherwise. Colyseus 0.18 calls `onDrop` before `onLeave` for a dropped socket
   * when `onDrop` is defined; Epic 2 defines none, so every leave lands here. Note for Story 8.1:
   * reconnect adds `onDrop` with `allowReconnection(client, 120)`; a consented leave never reaches
   * `onDrop`, so a deliberate leave keeps getting no reconnect window.
   * Mid-run, the World drops the player at once: zombies retarget next tick, and if the leaver was
   * the last one standing the next tick's wipe check ends the run (Story 2.8). The room disposes
   * itself when the last client leaves (Colyseus `autoDispose`).
   */
  override onLeave(client: RunClient, code?: number): void {
    const member = this.members.get(client.sessionId);
    this.net.remove(client);
    if (member === undefined) return; // a seat taken over or already freed: nothing to do
    if (code === CloseCode.CONSENTED) this.bankLeaver(member); // Story 7.2 (S3): a Leave mid-run banks at once (before the state leaves the World)
    const expired = this.holds.has(member.playerId) && code !== CloseCode.CONSENTED;
    this.finalLeave(member, expired ? "hold_expired" : code === CloseCode.CONSENTED ? "left" : "disconnected", code);
  }

  /**
   * Story 7.2 (S3, D2, D4): a consented Leave mid-run banks this seat now, ending `quit` (the waves and boss it was
   * there for, never the extract bonus). Fire and forget (never awaited); once per seat per run (`RunBank`). A seat
   * remembered after this Leave (8.1 F8) that comes back plays on, but this run is already banked for it (brief 18).
   */
  private bankLeaver(member: Member): void {
    const world = this.controller?.world;
    if (!world || !this.inRun() || !this.bank) return;
    const p = world.players.get(member.playerId) ?? world.heldPlayers.get(member.playerId)?.player;
    if (!p) return;
    world.loot.banked.add(member.playerId); // review M1: a banked seat can no longer take the bag
    // Story 12.2 (AC 12): a seat leaving during the extraction was there at the Extract: it banks "extracted".
    const ending = world.run.phase === "extract" ? "extracted" : "quit";
    void this.bank.bank({ playerId: member.playerId, seatId: seatIdOf(member), accountId: member.accountId, record: p, ending, wave: world.waves.number, lockedUsed: p.lockedUsed, meta: this.bank.seatMetaNow(world, p), result: seatRow(p, seatIdOf(member), member.slot, member.accountId) }); // 7.11 AC 6: with what it had then
  }

  /** `run.leave` (Story 7.2, D4): the client is about to Leave: bank now, so `run.rewards` reaches it before the socket closes. */
  onRunLeave(client: RunClient): void {
    const member = this.members.get(client.sessionId);
    if (member) this.bankLeaver(member);
  }

  /**
   * `host.remove` (Story 8.3, AC 10; H2, H3, Epic 8 D9; "other" bucket): the host removes a player — a member
   * (connected, held or waiting) or a remembered seat — in the lobby or a build phase. Never on yourself, never in a
   * wave, the vote or on Results. Anything else is ignored and logged `remove_refused {reason}`.
   */
  onHostRemove(client: RunClient, playerId: string): void {
    const sender = this.members.get(client.sessionId);
    if (!sender) return;
    const refuse = (reason: string): void => this.log.info({ playerId: sender.playerId, target: playerId, reason }, "remove_refused");
    if (hostKeyOf(sender) !== this.hostKey || sender.waiting === true || this.holds.has(sender.playerId)) return refuse("not_host"); // review M5: the host seat
    const phase = this.state.phase;
    if (phase !== "lobby" && phase !== "build") return refuse("not_now");
    if (phase === "lobby" && this.starting) return refuse("not_now"); // Start's progress read is in flight
    if (this.savingQuit) return refuse("not_now"); // review L (E8-S10): the run is being saved this moment
    if (playerId === sender.playerId) return refuse("self");
    const target = Array.from(this.members.values()).find((m) => m.playerId === playerId);
    if (target) return this.afterRemove(() => this.removeSeat(target, sender));
    for (const [key, seat] of this.rememberedSeats) if (seat.playerId === playerId) return this.afterRemove(() => this.removeRemembered(key, seat, sender));
    return refuse("unknown");
  }

  /**
   * Stories 8.4–8.6 review L (E8-S10): in a build phase a fresh autosave follows a Remove at once — the save row no longer
   * lists the seat (its account is unlinked) and no older autosave can bring it back on a mid-wave shutdown.
   */
  private afterRemove(remove: () => void): void {
    remove();
    const world = this.controller?.world;
    if (!world || !this.inRun()) return;
    if (this.state.phase === "build") this.autosave("removed");
  }

  /**
   * Story 8.3 (H3, decisions E8-H2…H4): the seat is gone for this room: banned by `seatKey` and guest token (lobby and
   * every later run), told `player.removed` and closed with 4022 (terminal, never 4000), a pending 8.1 reconnection
   * rejected; mid-run it banks like a Leave ("quit", E8-H4), leaves the World and is NOT remembered (no stuff to come
   * back to); its buildings stay and pay nobody (E8-H3). Everyone gets `player.left { reason: "removed" }`.
   */
  private removeSeat(member: Member, by: Member): void {
    const { playerId, slot, name } = member;
    this.bannedSeats.push({ seatKey: member.seatKey, guestTokenHash: member.guestTokenHash });
    const controller = this.controller;
    if (controller && this.inRun()) this.bankLeaver(member); // E8-H4: before the state leaves the World
    const hold = this.holds.get(playerId);
    hold?.timer?.clear();
    if (hold?.reconnection) hold.reconnection.reject(new Error("removed"));
    this.holds.delete(playerId);
    this.members.delete(member.sessionId); // the socket's onDrop/onLeave find no member: nothing is held or remembered
    this.state.players.delete(playerId);
    this.memberProgress.delete(playerId);
    this.lateInits.delete(playerId);
    this.waitingIds.delete(playerId);
    this.syncJoinPending();
    if (controller) {
      controller.removePlayer(playerId); // present or held: out of the World for good
      controller.disownBuildings(playerId);
    }
    this.hordeStats.delete(playerId);
    const gone = this.clients.getById(member.sessionId) as RunClient | undefined;
    if (gone) this.horde?.forgetClient(gone);
    this.lastPongId.delete(member.sessionId);
    this.netMeters.delete(member.sessionId);
    if (this.state.phase === "lobby") this.recomputeDistricts();
    this.log.info({ playerId, slot, by: by.playerId, phase: this.state.phase, held: hold !== undefined, waiting: member.waiting === true, wave: controller?.world.waves.number ?? 0 }, "player_removed");
    this.broadcast(S2C.PLAYER_LEFT, { playerId, name, reason: "removed" } satisfies PlayerLeft, gone ? { except: gone } : undefined); // review nit: the removed phone gets player.removed only
    if (gone) {
      gone.send(S2C.PLAYER_REMOVED, {} satisfies PlayerRemoved);
      gone.leave(CLOSE_REMOVED);
    }
    if (controller) syncState(this.state, controller); // the disowned owner marks in the next patch
    this.moveHostIfGone("removed");
    this.updateFreeze();
  }

  /** Story 8.3 (H3): a remembered seat (its hold ran out, or it left) is removed: its slot frees, it banks `quit` now. */
  private removeRemembered(key: string, seat: RememberedSeat, by: Member): void {
    this.rememberedSeats.delete(key);
    this.syncLeftSeats();
    this.bannedSeats.push({ seatKey: key, guestTokenHash: seat.guestTokenHash });
    const controller = this.controller;
    if (controller && this.bank) {
      const world = controller.world;
      void this.bank.bank({ playerId: seat.playerId, seatId: seatIdOf(seat), accountId: seat.accountId, record: seat.player, ending: "quit", wave: world.waves.number, lockedUsed: seat.player.lockedUsed, meta: this.bank.seatMetaNow(world, seat.player), result: seatRow(seat.player, seatIdOf(seat), seat.slot, seat.accountId) });
    }
    controller?.disownBuildings(seat.playerId);
    if (controller) syncState(this.state, controller);
    this.log.info({ playerId: seat.playerId, slot: seat.slot, by: by.playerId, phase: this.state.phase, remembered: true }, "player_removed");
    this.broadcast(S2C.PLAYER_LEFT, { playerId: seat.playerId, name: seat.name, reason: "removed" } satisfies PlayerLeft);
  }

  /** Story 8.3 review H1: the members and remembered seats for `bankRunEnd`, each with its seat id. */
  private bankMembers(): { playerId: string; accountId: string | null; seatId: string }[] {
    return Array.from(this.members.values(), (m) => ({ playerId: m.playerId, accountId: m.accountId, seatId: seatIdOf(m), slot: m.slot }));
  }
  private bankRemembered(): (RememberedSeat & { seatId: string })[] {
    return Array.from(this.rememberedSeats.values(), (s) => ({ ...s, seatId: seatIdOf(s) }));
  }

  /** Story 7.2: `run.rewards` to the seat's owner, if connected now. */
  private deliverRewards(seatId: string, msg: RunRewards): void {
    for (const m of this.members.values()) {
      if (seatIdOf(m) === seatId) this.clients.getById(m.sessionId)?.send(S2C.RUN_REWARDS, msg); // review H1: the seat, not a reused id
    }
  }

  /**
   * Story 8.1: the seat is freed for good (a consented Leave, a lobby/results drop, a hold that ran
   * out). Mid-run the seat (its state and kills) is remembered by `seatKey` for the rest of the run
   * (F8: never fresh-joiner money; also after a deliberate Leave), and its buildings pay nobody (F5).
   */
  private finalLeave(member: Member, why: "left" | "disconnected" | "hold_expired", code: number | undefined): void {
    const { playerId, slot, name } = member;
    const hold = this.holds.get(playerId);
    hold?.timer?.clear();
    this.holds.delete(playerId);
    this.members.delete(member.sessionId); // frees the slot
    this.state.players.delete(playerId);
    this.memberProgress.delete(playerId); // review M3: on every final leave (a leaver mid-run no longer opens a district)
    if (this.state.phase === "lobby") this.recomputeDistricts(); // Story 7.7 R3: the pick can't strand anyone
    const controller = this.controller;
    if (controller && this.inRun()) {
      controller.holdPlayer(playerId); // a present player leaves the World the same way (no-op when held)
      const seat = controller.releaseHeld(playerId);
      if (seat) this.rememberedSeats.set(member.seatKey, { playerId, slot, name, guestTokenHash: member.guestTokenHash, accountId: member.accountId, look: member.look, player: seat.player, kills: seat.kills, buildIdx: seat.buildIdx, ...(member.seatGen !== undefined ? { seatGen: member.seatGen } : {}) });
      this.syncLeftSeats();
    } else {
      controller?.removePlayer(playerId);
    }
    this.hordeStats.delete(playerId); // no zero horde_stats lines for a player who left
    const gone = this.clients.getById(member.sessionId);
    if (gone) this.horde?.forgetClient(gone); // Story 8.10: its horde baseline goes with it
    this.lastPongId.delete(member.sessionId);
    this.netMeters.delete(member.sessionId);
    const reason: PlayerLeftReason = why === "left" ? "left" : "disconnected";
    if (why === "hold_expired") this.log.info({ playerId, wave: controller?.world.waves.number ?? 0 }, "player_hold_expired");
    this.log.info({ playerId, reason, code, wave: controller?.world.waves.number ?? 0 }, "player_left");
    this.broadcast(S2C.PLAYER_LEFT, { playerId, name, reason } satisfies PlayerLeft);
    this.lateInits.delete(playerId);
    this.waitingIds.delete(playerId);
    this.syncJoinPending();
    // The longest-connected connected member takes over as host (lobby and mid-run alike; Story 8.3 H1).
    this.moveHostIfGone("left");
    // Review L: the last of a resumed run's own seats left its lobby: the save is resumable again, the lobby a plain one.
    if (this.resume && this.state.phase === "lobby" && !this.resumeSeatPresent()) {
      void this.releaseResume(this.resume.save.runId);
      this.resume = null;
      this.state.resumeWave = 0;
    }
    const players = Array.from(this.members.values()).filter((m) => m.waiting !== true).length;
    if (players === 0 && this.members.size > 0 && controller && this.inRun()) {
      // Story 8.2 (AC 4): only waiting late joiners are left: the run ends for them (Results; they played nothing).
      this.log.info({ runSeed: this.runSeed, wave: controller.world.waves.number, phase: this.state.phase, waiting: this.members.size }, "run_abandoned");
      // Story 8.4 (S2): everyone who played left in a calm phase: the run is saved for them (taken before the Results).
      const keep = (this.state.phase === "build" || this.state.phase === "vote") && this.saveWriter !== null && !this.saveSettled;
      const saving = keep ? this.makeResumable("all_left") : null; // captured now, in the calm phase
      const run = this.runResultRun(); // re-review: this run's inputs, before anything can start another
      endWorldRun(controller.world);
      syncState(this.state, controller);
      this.endRun(controller, controller.world.waves.number, keep, "lost");
      // Story 10.7 review L4: the save failed → the run is lost after all (its stats row finished, not left to the orphan rule).
      if (saving) void this.finishIfNotSaved(saving, controller.world, controller.world.waves.number, run);
    } else if (this.members.size === 0 && controller && this.inRun()) {
      // Epic 8 D5/D11: everyone gone (the last hold ran out). Story 8.4 (S2): in a build phase or the vote the run is
      // SAVED (resumable; its Supplies topped up by the save); mid-wave it is LOST (its save row deleted).
      const calm = this.state.phase === "build" || this.state.phase === "vote";
      this.log.info({ runSeed: this.runSeed, wave: controller.world.waves.number, phase: this.state.phase, saved: calm && this.saveWriter !== null }, "run_abandoned");
      const bankNow = (): void => {
        this.runBanked = this.bank?.bankRunEnd(controller.world, this.bankMembers(), this.bankRemembered()) ?? this.runBanked; // Story 7.2: every remembered seat banks `quit`
        this.finishRunResult(controller.world, controller.world.waves.number, true); // Story 10.7: the run is lost (B2)
      };
      if (calm && this.saveWriter && !this.saveSettled) {
        void this.saveAllLeft(bankNow);
      } else {
        bankNow();
        this.dropSave("lost");
      }
    }
    this.updateFreeze();
  }

  /**
   * Story 8.1 (AC 1): a non-consented close in a run phase is a drop, not a leave (brief 21): the
   * seat is held for HOLD_S. In the lobby and on Results nothing is held (D7): Colyseus calls
   * `onLeave` right after (no reconnection allowed), as before.
   */
  override onDrop(client: RunClient): void {
    const member = this.members.get(client.sessionId);
    if (!member || !this.inRun()) return;
    if (member.waiting === true) return; // Story 8.2: a waiting joiner has nothing to keep: the drop frees the reserved slot (onLeave)
    this.startHold(member, "drop", client);
  }

  /** Story 8.1 (AC 3): the SDK reconnected with its token (same session id): the seat comes back. */
  override onReconnect(client: RunClient): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    this.lastPongId.delete(client.sessionId);
    this.attachClient(client, member);
    const hold = this.holds.get(member.playerId);
    if (hold) hold.reconnection = null;
    this.endHold(member, "token");
    this.sendOffer(client, member.playerId);
  }

  /**
   * Stories 7.7 (AC 3) + 7.11 (AC 2): a member's saved progress, loaded once at join (2 s timeout; nothing on failure or
   * without an account): its districts open the lobby's picker (R2), its owned parts re-check the look it asked for —
   * in the lobby only (a look never changes mid-run). Fire and forget: the join never waits for the database.
   * Review M3: also after `lobby.return` (`relook` false: the look stays), so this run's new parts and districts count.
   */
  private async loadMemberProgress(member: Member, rawLook: unknown, relook = true): Promise<void> {
    const repo = roomProgressRepo();
    if (!repo || member.accountId === null) return;
    let row: Awaited<ReturnType<typeof repo.get>>;
    try {
      row = await repo.get(member.accountId);
    } catch (e) {
      this.log.warn({ playerId: member.playerId, err: e instanceof Error ? e.message.slice(0, 120) : "?" }, "member_progress_unavailable");
      return;
    }
    if (!row || this.members.get(member.sessionId) !== member) return; // left meanwhile
    this.memberProgress.set(member.playerId, { districts: row.districts, cosmetics: row.cosmetics });
    if (this.state.phase === "lobby") {
      // 7.10: a `lobby.set_look` sent before this load wins over the join's look; never once Start began (7.10 review L1)
      const asked = this.askedLook.has(member) ? this.askedLook.get(member) : rawLook;
      const look = !relook || this.starting || this.controller !== null ? member.look : encodeLook(decodeLook(asked, ownedParts(row.cosmetics)).look);
      if (look !== member.look) {
        member.look = look;
        const player = this.state.players.get(member.playerId);
        if (player) player.look = look;
      }
      this.recomputeDistricts();
    } else if (relook && member.waiting === true) {
      // Story 8.2 review nit: a late joiner hasn't entered yet: its look is checked against what its account owns
      // (7.11/7.12 parts), like a lobby join's, before its survivor appears.
      const look = encodeLook(decodeLook(rawLook, ownedParts(row.cosmetics)).look);
      if (look !== member.look) {
        member.look = look;
        const player = this.state.players.get(member.playerId);
        if (player) player.look = look;
      }
    }
  }

  /** Review M3: after `lobby.return`, once this run's banks settled, every member's progress again (the look stays). */
  private async reloadProgress(members: readonly Member[]): Promise<void> {
    try {
      await this.runBanked;
    } catch {
      // a failed bank still settles: the progress read below shows what is saved
    }
    await Promise.all(members.map((m) => this.loadMemberProgress(m, undefined, false)));
  }

  /** Story 7.7 (R2, R3): the open mask from the members' districts; a pick nobody here has goes back to Downtown. */
  private recomputeDistricts(): void {
    const lists: (readonly string[])[] = [];
    for (const m of this.members.values()) lists.push(this.memberProgress.get(m.playerId)?.districts ?? []);
    const mask = openMask(lists);
    if (this.state.districtsOpen !== mask) this.state.districtsOpen = mask;
    const i = districtIndex(this.state.district);
    if (!this.resume && (i < 0 || (mask & (1 << i)) === 0)) { // Story 8.6: a resumed run's district is the save's
      const from = this.state.district;
      this.state.district = DEFAULT_DISTRICT;
      this.log.info({ from }, "district_reset");
      this.broadcast(S2C.LOBBY_DISTRICT_RESET, { from } satisfies LobbyDistrictReset);
    }
  }

  /** `lobby.district` (Story 7.7 R2, R4, R5): the host's pick, lobby only; a refusal is only logged (like Start). */
  onLobbyDistrict(client: RunClient, id: string): void {
    const member = this.members.get(client.sessionId);
    if (!member || this.state.phase !== "lobby" || this.resume) return; // Story 8.6: a resumed run keeps its district
    const refusal = pickRefusal(id, this.state.districtsOpen, member.slot === this.state.hostSlot);
    if (refusal !== null) {
      this.log.info({ playerId: member.playerId, reason: refusal }, "district_pick_refused");
      return;
    }
    if (this.state.district !== id) this.state.district = id;
  }

  /** `lobby.set_ready`: the sender's own flag, lobby only. */
  onSetReady(client: RunClient, ready: boolean): void {
    if (this.state.phase !== "lobby") return;
    const member = this.members.get(client.sessionId);
    const player = member && this.state.players.get(member.playerId);
    if (player) player.ready = ready;
  }

  /** Story 7.10 (D3): when each member last changed its look in the lobby (ms), for the 2-per-second limit. */
  private readonly lookTimes = new WeakMap<Member, number[]>(); // per member object: gone with the member

  /**
   * `lobby.set_look` (Story 7.10, D3): my new look, shown on my lobby card for everyone before Start. Lobby phase only
   * (a build or a wave ignores it: the run keeps the look it started with); decoded against what my account owns, the
   * same rule as the join (7.9 L2: starter parts until 7.11 feeds the owned items); at most
   * `MAX_LOBBY_LOOKS_PER_S` per second per member, extra ones are dropped silently (never a kick).
   */
  onSetLook(client: RunClient, code: string): void {
    // Review L1: after `run.start` the phase reads "lobby" while the members' progress loads (7.4/7.5 `starting`) and
    // until the first tick (`controller` built): the run has started, its look is the one it started with.
    if (this.state.phase !== "lobby" || this.starting || this.controller !== null) return;
    const member = this.members.get(client.sessionId);
    const player = member && this.state.players.get(member.playerId);
    if (!member || !player) return;
    const now = Date.now();
    const times = (this.lookTimes.get(member) ?? []).filter((t) => now - t < 1000);
    if (times.length >= MAX_LOBBY_LOOKS_PER_S) return;
    times.push(now);
    this.lookTimes.set(member, times);
    this.askedLook.set(member, code);
    // Story 7.11 / 7.12: the member's owned milestone and loot parts once loaded (starter parts until then; the load re-checks)
    const look = decodeLook(code, ownedParts(this.memberProgress.get(member.playerId)?.cosmetics));
    if (look.replaced > 0) authLog.info({ fields: look.replaced }, "look_replaced");
    const canonical = encodeLook(look.look);
    member.look = canonical;
    player.look = canonical;
  }

  /**
   * `evac.vote` (Story 6.11): the sender's vote; the World ignores it outside phase "vote" (F1, D2:
   * the last one that arrived counts). Under the guard's bucket like every non-input message.
   */
  onEvacVote(client: RunClient, choice: "extract" | "stay"): void {
    const member = this.members.get(client.sessionId);
    if (member && this.state.phase === "vote") this.controller?.castVote(member.playerId, choice);
  }

  /** `build.set_ready` (Story 3.1): the sender's build-phase Ready; the World ignores it outside a build. */
  onBuildReady(client: RunClient, ready: boolean): void {
    const member = this.members.get(client.sessionId);
    if (member) this.controller?.setBuildReady(member.playerId, ready);
  }

  /**
   * `building.place` (Story 3.4, already shape-checked and rate-limited by the shared bucket): the
   * shared `placeBuilding` validates phase, type, cap, money and spot from the server's World and
   * charges the price. A refusal goes back to the sender only, as `building.refused { reason }`.
   */
  onPlaceBuilding(client: RunClient, m: BuildingPlace): void {
    const member = this.members.get(client.sessionId);
    const controller = this.controller;
    if (!member) return;
    const r = controller ? controller.placeBuilding(member.playerId, m) : null;
    if (r?.ok) {
      this.log.info({ playerId: member.playerId, type: m.type, gx: m.gx, gy: m.gy, rot: m.rot, id: r.value.id }, "building_placed");
      return;
    }
    const reason = r ? r.error : "not_build_phase";
    this.log.debug({ playerId: member.playerId, type: m.type, gx: m.gx, gy: m.gy, rot: m.rot, reason }, "building_refused"); // debug: a flood must not flood the log
    client.send(S2C.BUILDING_REFUSED, { reason } satisfies BuildingRefused);
  }

  /**
   * `building.repair` (Story 3.7, shape-checked and rate-limited by the shared "other" bucket): the
   * shared `repairBuilding` validates phase, building, damage and the sender's wallet on the server's
   * World and charges the sender. A refusal goes back to the sender only, as
   * `building.repair_refused { id, reason }`; HP and wallet reach every client through the next patch.
   */
  onRepairBuilding(client: RunClient, id: number): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    const controller = this.controller;
    const r = controller ? controller.repairBuilding(member.playerId, id) : null;
    if (r?.ok) {
      this.log.info({ playerId: member.playerId, id, owner: r.value.building.ownerId, cost: r.value.cost }, "building_repaired");
      return;
    }
    const reason = r ? r.error : "not_build_phase";
    this.log.debug({ playerId: member.playerId, id, reason }, "building_repair_refused"); // debug: a flood must not flood the log
    client.send(S2C.BUILDING_REPAIR_REFUSED, { id, reason } satisfies BuildingRepairRefused);
  }

  /**
   * `building.upgrade` (Story 5.9, shape-checked and rate-limited by the shared "other" bucket): the
   * shared `upgradeBuilding` validates phase, owner, tier and the sender's wallet on the server's
   * World and charges the step price. A refusal goes back to the sender only, as
   * `building.upgrade_refused { id, reason }`; the new type, HP and wallet arrive in the next patch.
   */
  onUpgradeBuilding(client: RunClient, id: number): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    const controller = this.controller;
    const r = controller ? controller.upgradeBuilding(member.playerId, id) : null;
    if (r?.ok) {
      this.log.info({ playerId: member.playerId, id, from: r.value.fromType, to: r.value.building.type, cost: r.value.cost }, "building_upgraded");
      return;
    }
    const reason = r ? r.error : "not_build_phase";
    this.log.debug({ playerId: member.playerId, id, reason }, "building_upgrade_refused");
    client.send(S2C.BUILDING_UPGRADE_REFUSED, { id, reason } satisfies BuildingUpgradeRefused);
  }

  /**
   * `building.sell` (Story 5.20, shape-checked and rate-limited by the shared "other" bucket): the
   * shared `sellBuilding` validates standing, phase, building and owner on the server's World,
   * refunds (100 % of this phase's spend, 50 % of the rest) and removes it. A refusal goes back to
   * the sender only, as `building.sell_refused { id, reason }`; the removal and wallet arrive in the
   * next patch, `building.sold` with the tick's events.
   */
  onSellBuilding(client: RunClient, id: number): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    const controller = this.controller;
    const r = controller ? controller.sellBuilding(member.playerId, id) : null;
    if (r?.ok) {
      this.log.info({ playerId: member.playerId, id, type: r.value.type, refund: r.value.refund }, "building_sold");
      return;
    }
    const reason = r ? r.error : "not_build_phase";
    this.log.debug({ playerId: member.playerId, id, reason }, "building_sell_refused"); // debug: a flood must not flood the log
    client.send(S2C.BUILDING_SELL_REFUSED, { id, reason } satisfies BuildingSellRefused);
  }

  /**
   * `building.move` (Story 5.22, shape-checked and rate-limited by the shared "other" bucket): the
   * shared `moveBuilding` validates standing, phase, building, owner and the new spot (the building
   * itself ignored) on the server's World; free. A refusal goes back to the sender only, as
   * `building.move_refused { id, reason }`; the new spot arrives in the next patch, `building.moved`
   * with the tick's events.
   */
  onMoveBuilding(client: RunClient, m: { id: number; gx: number; gy: number; rot: number; seq: number }): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    const controller = this.controller;
    const r = controller ? controller.moveBuilding(member.playerId, { id: m.id, gx: m.gx, gy: m.gy, rot: m.rot }) : null;
    if (r?.ok) {
      this.log.info({ playerId: member.playerId, id: m.id, gx: m.gx, gy: m.gy, rot: m.rot }, "building_moved");
      return;
    }
    const reason = r ? r.error : "not_build_phase";
    this.log.debug({ playerId: member.playerId, id: m.id, gx: m.gx, gy: m.gy, rot: m.rot, reason }, "building_move_refused"); // debug: a flood must not flood the log
    client.send(S2C.BUILDING_MOVE_REFUSED, { id: m.id, reason, seq: m.seq } satisfies BuildingMoveRefused); // review L3: seq echoed
  }

  /** Story 8.7: the one `ping.shown` payload, reused (`broadcast` encodes synchronously). */
  private readonly pingMsg: PingShown = [0, 0, 0, 0, 0];
  /** Story 8.7 (P2): pings the 1/s bucket dropped, per player id, since the wave started (`net_stats` `pingDropped`). */
  readonly pingDropped = new Map<string, number>();

  /** Story 8.7 (P2): a `ping.send` over the player's 1/s bucket: dropped silently, counted. */
  private countPingDrop(client: RunClient): void {
    const member = this.members.get(client.sessionId);
    if (member) this.pingDropped.set(member.playerId, (this.pingDropped.get(member.playerId) ?? 0) + 1);
  }

  /**
   * `ping.send` (Story 8.7, D15; shape-checked and rate-limited by its own "ping" bucket). Allowed for a seated member
   * whose World player is standing or downed (E8-P4), in a build phase, a wave or the vote, while the World runs (not
   * frozen) and the seat is not held. The server stamps the sender's slot and SERVER position at this tick (P1) and
   * broadcasts `ping.shown` to everyone, the sender too. Never stored: not in the World, the schema, the event bus or
   * a replay (P5). A refused ping gets no answer (logged at debug: a flood must not flood the log).
   */
  onPing(client: RunClient, m: PingSend): void {
    const member = this.members.get(client.sessionId);
    const world = this.controller?.world;
    if (!member || !world) return;
    const p = world.players.get(member.playerId);
    const reason = pingRefusal(world.run.phase, this.state.frozen, this.holds.has(member.playerId), p?.status, member.waiting === true);
    if (reason !== null || !p) {
      this.log.debug({ playerId: member.playerId, kind: m.kind, reason }, "ping_refused");
      return;
    }
    const g = this.pingMsg;
    g[0] = member.slot; // P1: the sender's own slot and position, never anything from the payload
    g[1] = PING_KINDS.indexOf(m.kind);
    g[2] = Math.round(p.x * 10); // decimetres (B1: integers are 3 B on the wire, floats 9)
    g[3] = Math.round(p.y * 10);
    g[4] = world.tick & 0xffff; // review L1: 16 bits on the wire (3 B); the client unwraps it
    this.log.debug({ playerId: member.playerId, kind: m.kind, x: g[2], y: g[3], tick: g[4] }, "ping_shown");
    this.broadcast(S2C.PING_SHOWN, g);
  }

  /** Story 5.24: the one relay payload, reused (`broadcast` encodes synchronously). */
  private readonly ghostMsg: BuildingGhosted = [0, -1, 0, 0, 0];

  /**
   * `building.ghost` (Story 5.24, shape-checked and rate-limited by its own "ghost" bucket): what the
   * sender holds, relayed to every other client as `building.ghosted` when the shared `ghostError`
   * allows it (known, standing player, build phase, known type, inside the sender's view). Cosmetic
   * (F7): stored nowhere, never in the World or the schema; a dropped ghost gets no answer (D3).
   */
  onGhost(client: RunClient, m: BuildingGhost): void {
    const member = this.members.get(client.sessionId);
    const world = this.controller?.world;
    if (!member || !world) return;
    const e = ghostError(world, member.playerId, m);
    if (e !== null) {
      this.log.debug({ playerId: member.playerId, type: m.type, reason: e }, "building_ghost_dropped"); // debug: a flood must not flood the log
      return;
    }
    const g = this.ghostMsg;
    g[0] = member.slot; // B10: the sender's own slot, never one from the payload
    g[1] = m.type === "" ? -1 : buildingTypeIds(world.balance).indexOf(m.type); // known: ghostError checked it
    g[2] = m.gx;
    g[3] = m.gy;
    g[4] = m.rot;
    this.broadcast(S2C.BUILDING_GHOSTED, g, { except: client });
  }

  /**
   * `shop.buy` (Story 3.3; Story 5.13: a card of my offer): the shared `buyCard` rules decide (build
   * phase, standing, the offer's build and rev, the card holds the item and is unsold, not owned,
   * slot, wallet via `spendMoney`). The sender alone gets `shop.bought` + its new `shop.offered`, or
   * `shop.refused` with the `Result` error. Wallet and loadout reach every client through the next
   * patch. Rate: the shared "other" bucket (10/s); repeats can't overspend or buy a card twice.
   */
  onShopBuy(client: RunClient, build: number, rev: number, card: number, item: string, slot: 0 | 1 | null): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    const controller = this.controller;
    const r = controller ? controller.buyCard(member.playerId, build, rev, card, item, slot) : ({ ok: false, error: "not_build" } as const);
    if (r.ok) {
      client.send(S2C.SHOP_BOUGHT, (r.value.slot === null ? { item, card } : { item, card, slot: r.value.slot }) satisfies ShopBought);
      this.sendOffer(client, member.playerId);
      this.log.info({ playerId: member.playerId, item, card, price: r.value.price, slot: r.value.slot, wallet: controller?.world.players.get(member.playerId)?.wallet }, "shop_bought");
    } else {
      client.send(S2C.SHOP_REFUSED, { item, card, error: r.error } satisfies ShopRefused);
      this.log.debug({ playerId: member.playerId, item, card, build, rev, error: r.error }, "shop_refused");
    }
  }

  /**
   * `shop.reroll` (Story 5.13; shape-checked, "other" bucket): the shared `reroll` rules decide
   * (build phase, standing, build and rev — a repeat with the old rev is `stale_offer`, no charge —,
   * a new card possible, wallet). The sender alone gets the new `shop.offered` or `shop.refused`
   * (`item: "reroll"`, `card: -1`).
   */
  onShopReroll(client: RunClient, build: number, rev: number): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    const controller = this.controller;
    const r = controller ? controller.reroll(member.playerId, build, rev) : ({ ok: false, error: "not_build" } as const);
    if (r.ok) {
      this.sendOffer(client, member.playerId);
      this.log.info({ playerId: member.playerId, build, rev: r.value.rev, price: r.value.price, wallet: controller?.world.players.get(member.playerId)?.wallet }, "shop_rerolled");
    } else {
      client.send(S2C.SHOP_REFUSED, { item: "reroll", card: -1, error: r.error } satisfies ShopRefused);
      this.log.debug({ playerId: member.playerId, build, rev, error: r.error }, "shop_reroll_refused");
    }
  }

  /** Story 5.13 (F1, F2): sends a player their stored offer, to their own client only (nothing outside a build phase). */
  private sendOffer(client: RunClient, playerId: string): void {
    const o = this.controller?.offerFor(playerId);
    if (!o) return;
    // Story 7.4 (AC 5): the lender's name as it was at run start, so it survives the lender leaving.
    const lenderName = o.lender === NO_LENDER ? "" : (this.runNames.get(o.lender) ?? "");
    client.send(S2C.SHOP_OFFERED, { build: o.build, rev: o.rev, cards: [...o.cards], sold: o.sold, rerollPrice: o.rerollPrice, canReroll: o.canReroll, borrowed: o.borrowed, lender: o.lender, lenderName } satisfies ShopOffered);
  }

  /** Story 5.13: every member's own offer (each build start; the stored one, never redrawn). */
  private sendOffers(): void {
    for (const client of this.clients) {
      const member = this.members.get(client.sessionId);
      if (member) this.sendOffer(client as RunClient, member.playerId);
    }
  }

  /**
   * `shop.upgrade` (Story 5.1, shape-checked and rate-limited by the shared "other" bucket): the
   * shared `upgradeWeapon` rules decide (build phase, own weapon, below the max level, the sender's
   * wallet). The sender alone gets `shop.upgraded` or `shop.upgrade_refused`; the level and wallet
   * reach every client in the next patch (`level0`/`level1`). Repeats can't overspend: each one is
   * checked against the wallet and the level as they are by then.
   */
  onShopUpgrade(client: RunClient, weapon: string): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    const controller = this.controller;
    const r = controller ? controller.upgradeWeapon(member.playerId, weapon) : ({ ok: false, error: "not_build" } as const);
    if (r.ok) {
      client.send(S2C.SHOP_UPGRADED, { weapon, slot: r.value.slot, level: r.value.level } satisfies ShopUpgraded);
      this.log.info({ playerId: member.playerId, weapon, slot: r.value.slot, level: r.value.level, price: r.value.price }, "shop_upgraded");
    } else {
      client.send(S2C.SHOP_UPGRADE_REFUSED, { weapon, error: r.error } satisfies ShopUpgradeRefused);
      this.log.info({ playerId: member.playerId, weapon, error: r.error }, "shop_upgrade_refused");
    }
  }

  /**
   * `shop.buy_item` (Story 5.11 gear; Story 5.12 consumables; shape-checked and rate-limited by the
   * shared "other" bucket): the shared `buyItem` decides (build phase, for sale, not owned, the
   * sender's wallet). The sender alone gets `shop.bought_item` or `shop.refused_item`; gear, max HP
   * and wallet reach every client in the next patch. A repeat is `already_owned`: no double charge.
   */
  onShopBuyItem(client: RunClient, item: string): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    const controller = this.controller;
    const r = controller ? controller.buyItem(member.playerId, item) : ({ ok: false, error: "not_build" } as const);
    if (r.ok) {
      client.send(S2C.SHOP_BOUGHT_ITEM, { item } satisfies ShopBoughtItem);
      this.log.info({ playerId: member.playerId, item, price: r.value.price, wallet: controller?.world.players.get(member.playerId)?.wallet }, "shop_bought_item");
    } else {
      client.send(S2C.SHOP_REFUSED_ITEM, { item, error: r.error } satisfies ShopRefusedItem);
      this.log.info({ playerId: member.playerId, item, error: r.error }, "shop_refused_item");
    }
  }

  /**
   * `run.start`: accepted only in the lobby, from the host, with everyone Ready and enough players
   * (`startBlocker`, shared with the client's Start button). A refusal is only logged: the
   * client's button is disabled anyway.
   */
  onStart(client: RunClient): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    const players = Array.from(this.members.values(), (m) => ({ ready: this.state.players.get(m.playerId)?.ready === true }));
    const reason =
      this.state.phase !== "lobby"
        ? "not_lobby"
        : startBlocker(players, member.slot === this.state.hostSlot, this.allowSoloStart);
    if (reason !== null || this.starting) {
      this.log.info({ playerId: member.playerId, reason: reason ?? "starting" }, "run_start_refused");
      return;
    }
    // Review L: a resumed run needs at least one of its own seats here (never a run of strangers on someone's save).
    if (this.resume && !this.resumeSeatPresent()) {
      this.log.info({ playerId: member.playerId, reason: "no_saved_seat" }, "run_start_refused");
      return;
    }
    void this.loadAndStart();
  }

  /** Story 8.6: a lobby member owns one of the resumed run's saved seats. */
  private resumeSeatPresent(): boolean {
    for (const m of this.members.values()) if (this.savedSeatOf(m)?.playerId === m.playerId) return true;
    return false;
  }

  /**
   * Stories 7.4 (AC 2, K8; D3) and 7.5 (AC 6): reads every member's progress (parallel, 2 s timeout each, off the
   * tick), then starts the run with those unlock masks and Training levels. A failed read plays with the starter pool
   * and Training 0 (logged). Members, phase and Ready are checked again after the read (someone may have left).
   */
  private async loadAndStart(force = false): Promise<void> {
    this.starting = true;
    let inits: RunPlayerInit[];
    try {
      inits = await loadRunInits(
        Array.from(this.members.values(), (m) => ({ playerId: m.playerId, slot: m.slot, accountId: m.accountId })),
        roomProgressRepo(),
      );
    } finally {
      this.starting = false;
    }
    if (this.state.phase !== "lobby" || this.shuttingDown || this.members.size === 0) return;
    const players = Array.from(this.members.values(), (m) => ({ ready: this.state.players.get(m.playerId)?.ready === true }));
    const host = Array.from(this.members.values()).some((m) => m.slot === this.state.hostSlot);
    // Story 10.12 (B3): an admin's "Restart with seed" starts the same members again (no Ready step).
    const reason = force ? (host ? null : "no_host") : startBlocker(players, host, this.allowSoloStart);
    if (reason !== null) {
      this.log.info({ reason }, "run_start_refused");
      this.cheatRestartSeed = null;
      return;
    }
    for (const i of inits) if (i.source === "read_failed") this.log.warn({ playerId: i.playerId }, "run_progress_read_failed");
    this.startRun(inits);
  }

  /**
   * Builds the World from the members (join order, `teamSpawnPoint` by slot) and starts the 20 Hz loop.
   * Story 3.1: the run starts in its first build phase; `syncState` writes phase "build".
   */
  private startRun(inits: readonly RunPlayerInit[] = []): void {
    // Stories 7.4/7.5: each member's unlock mask and Training from the run-start read; a member who joined during the
    // read (or a test calling this directly) has none: the starter pool and Training 0 (decision 7.4 D3).
    const devUnlocks = pickDevUnlocks(process.env, devShopAll);
    this.devUnlocksMask = devUnlocks.mask; // Story 8.2: late joiners get the same dev mask
    if (devUnlocks.mask !== null) this.log.warn({ mask: devUnlocks.mask }, "dev_unlocks");
    else if (devUnlocks.ignored !== null) this.log.warn({ value: process.env.DEV_UNLOCKS, reason: devUnlocks.ignored }, "dev_unlocks_ignored");
    const initOf = new Map(inits.map((i) => [i.playerId, i]));
    // DEV_STARTING_WALLET sets the exact start money (dev wins over Training's start money): `runPlayers` (review L4).
    const players = runPlayers(Array.from(this.members.values()), inits, devUnlocks.mask, devStartingWallet);
    this.runNames.clear();
    for (const m of this.members.values()) this.runNames.set(m.slot, m.name);
    // Story 10.12 (B3): an online "Restart with seed" picks this run's seed (once).
    const restartSeed = this.cheatRestartSeed;
    this.cheatRestartSeed = null;
    const runSeed = restartSeed ?? this.devRunSeed ?? randomUint32();
    this.runSeed = runSeed;
    if (this.devRunSeed !== null && restartSeed === null) this.log.warn({ runSeed }, "dev_run_seed");
    const devPlacedHp = devAllowed ? parseDevHpFraction(process.env.DEV_PLACED_BUILDING_HP) : null;
    // Story 4.5 (dev only, read per run like DEV_NO_WAVES): DEV_DECAY_STAGES=2,3 = the decay stage of waves 1, 2, ….
    const decayPick = pickDevDecayStages(process.env); // review L4: production ignores it (tested)
    const devDecayStages = decayPick.stages;
    // Story 5.13 (dev only, read per run): DEV_SHOP_CARDS=flamethrower,revive_kit starts every build-start offer with them.
    const shopPick = pickDevShopCards(process.env, serverBalance);
    // Story 6.3 (dev only, read per run): DEV_FORCE_BLACKOUT=5 draws every phase at that blackout level.
    const blackoutPick = pickDevForceBlackout(process.env);
    // Story 6.5 (dev only, read per run): DEV_BOSS_WAVES=3 brings the Behemoth in wave 3.
    const bossPick = pickDevBossWaves(process.env);
    // Story 6.8 (dev only, read per run): DEV_EVENTS=car_alarm@3,stampede@4 replaces the event schedule.
    const devEvents = process.env.NODE_ENV === "production" ? null : parseDevEvents(process.env.DEV_EVENTS);
    // Story 6.1 (dev only, read per run): DEV_START_WAVE=7 starts the run at wave 7 (its decay stage applied at the first build).
    const startWavePick = pickDevStartWave(process.env, serverBalance);
    // Story 7.12 (D3): the loot stream's secret salt (never on the room state); DEV_LOOT=3:0.1 forces a bag (dev only).
    const lootSalt = randomUint32();
    const lootPick = pickDevLoot(process.env);
    // Story 7.7 (AC 5): the host's pick chooses the map; in v1 only Downtown has one (R5: nothing else is pickable).
    const map = DISTRICT_MAPS[this.state.district] ?? DOWNTOWN_MAP;
    const resume = this.resume;
    const resumedIds = new Set<string>();
    if (resume) for (const m of this.members.values()) if (this.savedSeatOf(m)?.playerId === m.playerId) resumedIds.add(m.playerId);
    let controller: RunController;
    try {
      controller = new RunController({
        balance: serverBalance,
        seed: resume ? resume.save.seed : runSeed,
        players,
        // Story 8.6 (AC 13): a resume restores the save (returning members' seats in the World; the rest away).
        ...(resume ? { restore: { save: resume.save, present: (seat: SavedSeat) => resumedIds.has(seat.playerId), codeVersion: SAVE_CODE_VERSION, onDropped: (d: object) => this.log.warn(d, "save_item_dropped") } } : {}),
        map,
        pauseWaves: process.env.DEV_NO_WAVES === "1",
        // Story 3.9 dev hook, kept by 3.10 as an override: DEV_WAVE_MIX=walker,crawler replaces the waves.json mix.
        waveMix: parseWaveMix(process.env.DEV_WAVE_MIX, serverBalance),
        decayStageByWave: devDecayStages,
        shopCards: shopPick.cards,
        forceBlackoutPct: blackoutPick.pct,
        bossWaves: bossPick.waves,
        events: devEvents,
        scenario: this.scenario,
        startWave: startWavePick.wave,
        lootSalt,
        lootPrevVariant: lastLootVariant,
        devLoot: lootPick.plan,
        // Story 3.7 (dev only, read per run like DEV_NO_WAVES): DEV_PLACED_BUILDING_HP=0.5 places buildings at half HP.
        devPlacedHpFraction: devPlacedHp,
        // Story 2.12: rewound hit testing; DEV_NO_REWIND=1 (dev only) turns it off for A/B checks of the overlay's reversed hits.
        lagCompensation: !(devAllowed && process.env.DEV_NO_REWIND === "1"),
        // Story 2.12 review M1: telemetry only (at most once per wave per player), never a kick.
        onSeqResync: (playerId, wave, resyncs) => this.log.info({ playerId, wave, resyncs }, "seq_gap_suspect"),
        // Story 8.1 (D1): a connected player quiet for 3 s in a wave is held like a drop.
        // Decision 8.1 B16: a dropped body's 3 s ran out: it vanished; the room may freeze now.
        onDropHold: (playerId) => {
          this.log.info({ playerId, wave: this.controller?.world.waves.number ?? 0 }, "player_vanished");
          // RR2-M1: the body left the World now: teammates' chips and mirrors follow; the 120 s still run from the drop.
          const hold = this.holds.get(playerId);
          const s = this.state.players.get(playerId);
          const w = this.controller?.world;
          if (hold && s && w) s.heldUntilTick = w.tick + Math.max(1, Math.round((this.holdS - (performance.now() - hold.atMs) / 1000) * TICK_RATE_HZ));
          this.updateFreeze();
        },
        onQuietHold: (playerId) => {
          for (const m of this.members.values()) if (m.playerId === playerId) this.startHold(m, "quiet", null);
        },
        onSpreadCancelSuspect: (s) =>
          this.log.info({ playerId: s.playerId, wave: s.wave, matchRatio: +s.matchRatio.toFixed(2), k: +s.k.toFixed(2), t: +s.t.toFixed(1), samples: s.samples }, "spread_cancel_suspect"),
      });
    } catch (e) {
      if (!resume) throw e;
      // Story 8.6: the save didn't restore (claimResume's trial passed, so a bug): never a crashed Start — the lobby
      // stays (a plain one now) and the save is released (resumable again).
      this.log.error({ runId: resume.save.runId, why: (e as Error).message }, "save_unreadable");
      void roomSavesRepo()?.releaseOpen(resume.save.runId, this.roomId).catch(() => undefined);
      this.resume = null; // a plain lobby from now on
      this.state.resumeWave = 0;
      return;
    }
    if (!controller.world.zombieHistory.enabled) this.log.warn("dev_no_rewind");
    if (lootPick.plan !== null) this.log.warn({ plan: lootPick.plan }, "dev_loot");
    else if (lootPick.ignored !== null) this.log.warn({ value: process.env.DEV_LOOT, reason: lootPick.ignored }, "dev_loot_ignored");
    if (devDecayStages !== null) this.log.warn({ stages: devDecayStages }, "dev_decay_stages");
    else if (decayPick.ignored !== null) this.log.warn({ value: process.env.DEV_DECAY_STAGES, reason: decayPick.ignored }, "dev_decay_stages_ignored");
    if (bossPick.waves !== null) this.log.warn({ waves: bossPick.waves }, "dev_boss_waves");
    else if (bossPick.ignored !== null) this.log.warn({ value: process.env.DEV_BOSS_WAVES, reason: bossPick.ignored }, "dev_boss_waves_ignored");
    if (devEvents !== null) this.log.warn({ events: devEvents }, "dev_events"); // review L8: after the boss's else-if
    if (startWavePick.wave !== null) this.log.warn({ wave: startWavePick.wave }, "dev_start_wave");
    else if (startWavePick.ignored !== null) this.log.warn({ value: process.env.DEV_START_WAVE, reason: startWavePick.ignored }, "dev_start_wave_ignored");
    if (shopPick.cards !== null) this.log.warn({ cards: shopPick.cards }, "dev_shop_cards");
    else if (shopPick.ignored !== null) this.log.warn({ value: process.env.DEV_SHOP_CARDS, reason: shopPick.ignored }, "dev_shop_cards_ignored");
    if (blackoutPick.pct !== null) this.log.warn({ pct: blackoutPick.pct }, "dev_force_blackout");
    else if (blackoutPick.ignored !== null) this.log.warn({ value: process.env.DEV_FORCE_BLACKOUT, reason: blackoutPick.ignored }, "dev_force_blackout_ignored");
    if (devPlacedHp !== null) this.log.warn({ fraction: devPlacedHp }, "dev_placed_building_hp");
    else if (process.env.DEV_PLACED_BUILDING_HP) this.log.warn({ value: process.env.DEV_PLACED_BUILDING_HP }, "dev_placed_building_hp_ignored");
    this.controller = controller;
    if (resume) this.runSeed = resume.save.seed;
    // Story 7.2 (+ 7.7: the run's district). Story 8.6 (E8-S3): a resume keeps the run id and every bank is a top-up.
    this.bank = new RunBank(this.runSeed, { repo: roomProgressRepo, log: this.log, deliver: (id, msg) => this.deliverRewards(id, msg), retryMs: this.bankRetryMs, district: this.state.district, ...(resume ? { runId: resume.save.runId, resumed: true } : {}) });
    this.saveSettled = false;
    this.savedResumable = false;
    this.finalizing = false;
    this.runToken++;
    this.saveRowOpen = resume !== null; // a resume's row is open (claimed); a fresh run has none until its first autosave
    // Review M5: a resumed run's stored row IS its last save until the first autosave lands (an early tick error marks it).
    this.lastSave = resume ? resume.save : null;
    this.autosavePending = null;
    this.saveSkipLogged = false;
    const savesRepo = roomSavesRepo();
    this.saveWriter = savesRepo ? new SaveWriter(savesRepo, this.log) : null;
    if (resume) this.resumeSeats(controller, resume.save, inits);
    this.autosavePending = resume ? "resumed" : "build_start"; // Story 8.4: the run's first calm phase is saved on its first tick
    // Story 10.7 (B1): the run's stats row opens at its first Start; a resumed Start counts one more night.
    this.nightStartedAt = Date.now();
    const started = { id: this.bank.runId, district: this.state.district, seed: this.runSeed };
    const claimKey = randomUUID(); // re-review: one key per Start (room codes are reused); a retry of this write keeps it
    this.runResultWrites = recordRunResult(started.id, resume ? "resumed" : "start", (r) => (resume ? r.resumed(started, claimKey) : r.start(started)), this.log, this.bankRetryMs);
    // Story 10.12: every run starts clean (a resumed cheated run's row keeps its mark: B8); a restart's run is cheated.
    this.cheated = false;
    this.cheatQueue.length = 0;
    this.cheatGate = new AdminCheatGate(roomAccountsRepo);
    if (restartSeed !== null) this.markRunCheated();
    this.broadcast(S2C.RUN_STARTED, { runId: this.bank.runId } satisfies RunStarted); // Story 7.2 (RR-L1)
    // Story 8.1: a held seat keeps a reserved seat in Colyseus, so a takeover join (D5) or a held
    // player's reconnect must fit beside 4 seats: room for one spare connection per seat. Story 8.2: the
    // 4-seat limit is `join()`'s (`takenSlots`: members + held + remembered → `run_full`), not this count.
    this.maxClients = MAX_PLAYERS * 2;
    void this.unlock();
    const zombies = controller.world.zombies;
    this.eventCtx = { balance: serverBalance, zombieNetId: (id) => zombieNetId(id, zombies.generation[id] ?? 0) };
    this.horde = new HordeEncoder();
    for (const m of this.members.values()) this.hordeStats.set(m.playerId, newHordeStats());
    this.slowTicks = new SlowTickWatch(this.roomId, this.log, () => performance.now());
    this.slowPatches = new SlowTickWatch(this.roomId, this.log, () => performance.now(), SLOW_PATCH_MESSAGE);
    syncState(this.state, controller); // spawn positions in the same patch as phase "build"
    // 0.18 fixed timestep: at most 5 catch-up steps, then the backlog is dropped.
    this.setFixedTimestep(() => this.onTick(), TICK_RATE_HZ);
    // Story 8.11 (AC 1, F3): from now on every patch comes from `onTick` (one per tick). Set after the timestep:
    // null without a simulation interval would add Colyseus's own clock interval (two clock ticks per step).
    this.patchRate = null;
    this.pingTimer?.clear();
    this.pingTimer = this.clock.setInterval(() => (this.pingDue = true), PING_INTERVAL_MS); // sent by onTick, after the patch
    this.waveStartMs = performance.now();
    this.lastClearedWave = 0;
    this.peakZombiesAlive = 0;
    this.log.info(
      {
        runSeed,
        lootSalt, // Story 7.12 (D3): the salt in the server's log line only (never on the room state)
        players: Array.from(this.members.values(), (m) => {
          const p = players.find((x) => x.playerId === m.playerId);
          return { accountId: m.accountId, unlocks: p?.unlocks ?? 0, training: p?.training ?? NO_TRAINING, source: initOf.get(m.playerId)?.source ?? "none" };
        }),
      },
      "run_started",
    );
    if (this.scenario) {
      this.state.scenario = this.scenario;
      this.log.info({ scenario: this.scenario, startWave: controller.world.waves.number + 1 }, "test_scenario_started");
    }
  }

  /**
   * Story 8.11 (AC 1, F3): one call of the fixed timestep = at most one step, then the state patch (timed by
   * `broadcastPatch`), so each patch carries exactly one tick (a catch-up runs this several times: one patch each).
   * Outside the stepping phases (lobby after a run, Results, an 8.1 frozen room, a Save and quit) nothing steps and
   * the patch still goes out here at 20 Hz when something changed (Ready flags, `frozen`/`resumeIn`, Results). The
   * whole call is one socket write per client (`autoBatchMessages`): horde frame, events, then the patch (D3).
   */
  onTick(): void {
    try {
      this.step();
    } finally {
      // Review list 6: even after a tick error, so the state still reaches the phones. PR #19 review nit: a patch error
      // is logged on its own and never hides the step's error (that one still reaches onUncaughtException).
      try {
        this.broadcastPatch();
      } catch (e) {
        this.log.error({ err: e, tick: this.controller?.world.tick ?? null }, "patch_failed");
      }
      // PR #19 review L: the ping goes last, so its send time is stamped after the step and the patch (the corked
      // callback writes it right after; a stamp before the step would add its 1–5 ms to every RTT sample).
      if (this.pingDue) {
        this.pingDue = false;
        this.ping();
      }
    }
  }

  /**
   * One server tick: step, copy to schema, forward events, send horde frames (all inside the
   * slow-tick timing). Only phases "build", "wave", (Story 6.11) "vote" and (Story 12.2) "extract" step the World
   * (Story 3.1): after Results nothing moves any more (Story 2.8).
   */
  private step(): void {
    const controller = this.controller;
    const phase = this.state.phase;
    if (!controller || this.shuttingDown || (phase !== "build" && phase !== "wave" && phase !== "vote" && phase !== "extract")) return;
    if (this.state.frozen) return; // Story 8.1 (F6): nobody connected, or the 3-2-1 is running: the World waits
    if (this.savingQuit) return; // Story 8.5: Save and quit is writing: the World waits (nothing after the save is lost)
    // Story 10.12 (B2): admin cheats apply here, before the step (one-threaded, a stable tick order). A restart ends the run.
    if (this.cheatQueue.length > 0 && this.applyCheats(controller)) return;
    const t0 = performance.now();
    // Story 8.4 (D10, E8-S2): the build's last tick: saved BEFORE the step that starts the wave (every purchase in it).
    if (buildEndsThisTick(controller.world)) this.autosave("build_end");
    const events = controller.tick();
    syncState(this.state, controller);
    this.forwardEvents(controller.world.tick, events);
    this.sendHorde(controller.world);
    this.slowTicks?.observe(performance.now() - t0, controller.world.tick);
    const alive = controller.world.zombies.aliveCount;
    if (alive > this.peakZombiesAlive) this.peakZombiesAlive = alive;
    for (let i = 0; i < events.length; i++) {
      const e = events[i] as SimEvent;
      if (e.type === "wave.started") {
        this.startWaveStats();
        this.syncJoinPending(); // re-review nit: a still-loading join's hold never carries into the wave
      }
      else if (e.type === "loot.dropped") lastLootVariant = e.variant; // Story 7.12 (review M6): only a bag players saw
      else if (e.type === "loot.found") {
        // Story 8.3 review H1: the bank credits the finding SEAT (a removed finder's id may be reused later).
        let noted = false;
        for (const m of this.members.values()) if (m.playerId === e.playerId) {
          this.bank?.noteLootFinder(seatIdOf(m));
          noted = true;
        }
        if (!noted) this.log.error({ playerId: e.playerId, wave: controller.world.waves.number }, "loot_finder_unknown"); // PR #9 review L1 nit: never silent
      }
      else if (e.type === "wave.ended") {
        this.lastClearedWave = e.number;
        this.logWaveStats(e.number);
      }
      else if (e.type === "team.wiped") this.endRun(controller, e.wave);
      else if (e.type === "run.extract_done") this.endRun(controller, e.wave); // Story 12.2: Results after the fly-out (6.11 ended at `run.extracted`)
      else if (e.type === "run.vote_resolved") this.log.info({ wave: controller.world.waves.number, extract: e.extract, stay: e.stay, silent: e.silent, choice: e.choice }, "vote_resolved"); // Story 6.11 (run stats)
      else if (e.type === "build.started") {
        this.enterWaiting(true); // Story 8.2 (J4): waiting late joiners enter now (before their offers go out)
        this.sendOffers(); // Story 5.13: each player's new cards (after the tick's events)
        this.autosavePending = "build_start"; // Story 8.4 (D10): after the tick's events (below)
      }
      else if (e.type === "run.vote_opened") this.autosavePending = "vote"; // Story 8.4 (E8-S12): the vote is a calm phase
      else if (e.type === "decay.stage_changed") {
        this.log.info({ stage: e.stage, from: e.from, wave: controller.world.waves.number + 1, variants: controller.world.decay.variants }, "decay_stage_changed"); // Story 4.5 (architecture › logging: decay stage)
        // Story 12.1 re-review round 2: a stage left part of the map sealed with no wall to clear: never silent.
        const unresolved = stageSealsUnresolved(controller.world);
        if (unresolved > 0) this.log.warn({ stage: e.stage, vertices: unresolved }, "stage_seal_unresolved");
      }
    }
    // Story 8.4: a pending autosave (build start, vote) once the World is clean (a last shot may still be in flight).
    if (this.autosavePending !== null && this.inRun() && saveBlocker(controller.world) === null) this.autosave(this.autosavePending);
    this.tickErrors = 0;
  }

  /**
   * Team wipe (Story 2.8 AC 4) or, Story 6.11, the team extracted: the run ends for everyone.
   * `team.wiped` / `run.extract_done` (Story 12.2; 6.11's `run.extracted`) was already forwarded this tick; the World's run state machine
   * already went to "results" (`endRun`, which set `run.ending`), and the patch with phase "results"
   * follows. The World stays as it was (no more ticks). `earned` includes the last wave's bonus
   * (paid by the economy system in the same tick). Story 6.12 (F7): the log splits each player's
   * earnings at the first Stay (`earnedBeforeEndless`) and marks the after-10 part lost on a wipe.
   */
  private endRun(controller: RunController, wave: number, keepSave = false, dropWhy: "lost" | "ended" = "ended"): void {
    const run = controller.world.run;
    this.state.phase = "results"; // syncState already copied it from the World; kept explicit
    this.state.resultWave = wave;
    this.state.resultEnding = run.ending;
    const kills: Record<string, number> = {};
    const earned: Record<string, number> = {};
    const earnedBeforeEndless: Record<string, number> = {};
    const earnedAfter10Lost: Record<string, number> = {};
    // Story 8.1 review L1: a seat held when the run ends counts too.
    const seats = [...controller.world.players.entries(), ...[...controller.world.heldPlayers.entries()].map(([id, h]) => [id, h.player] as const)];
    for (const [playerId, p] of seats) {
      kills[playerId] = controller.kills(playerId);
      earned[playerId] = p.earned; // Story 3.2 (3.10 compares it with the GDD target)
      earnedBeforeEndless[playerId] = run.endless ? p.earnedAtEvac : p.earned;
      earnedAfter10Lost[playerId] = run.ending === "lost" ? p.earned - p.earnedAtEvac : 0;
    }
    const endlessWaves = run.endless ? Math.max(0, this.lastClearedWave - controller.world.balance.waves.runWaves) : 0; // review L11: waves really cleared (a wipe in a build phase too)
    this.log.info({ runSeed: this.runSeed, runId: this.bank?.runId, wave, ending: run.ending, endless: run.endless, endlessWaves, kills, earned, earnedBeforeEndless, earnedAfter10Lost }, "run_ended");
    this.runBanked = this.bank?.bankRunEnd(controller.world, this.bankMembers(), this.bankRemembered()) ?? this.runBanked; // Story 7.2: one call (never awaited by the tick)
    if (!keepSave) this.dropSave(dropWhy); // Story 8.4 (S3): a finished run (won, extracted, wiped) deletes its save; review L: an abandoned one is "lost"
    if (!keepSave) this.finishRunResult(controller.world, wave, dropWhy === "lost"); // Story 10.7 (B2): a saved run plays on another night
    // Story 8.2 review M2: a joiner still waiting played nothing: a zero not_saved result now.
    for (const m of this.members.values()) if (m.waiting === true) this.bank?.nothingFor(seatIdOf(m), run.ending === "none" ? "wiped" : run.ending);
  }

  /**
   * Story 10.7 (AC 2, B2, B4, B8): the run is over: its stats row is finished with every seat banked in it (members,
   * held, remembered, Leavers: `RunBank.resultSeats`), fire and forget, after the start write. `left`: lost because
   * the team left. `run`: this run's inputs (re-review: taken at the call site, so a later Start can't mix runs).
   */
  private finishRunResult(world: World, wave: number, left: boolean, run: RunResultRun | null = this.runResultRun()): void {
    // Review H1: a run saved as resumable here (a shutdown / tick-error save, then everyone's socket closes) plays on: no
    // finish. A shutdown whose save failed leaves the row open too: the boot sweep makes its last autosave resumable, so
    // the run can still end on another night; the orphan rule applies only when no save row exists at all.
    if (!run || this.savedResumable || this.shuttingDown) return;
    const { bank } = run;
    const row = { ...resultRow(world, { id: bank.runId, district: run.district, seed: run.seed, nightMs: Date.now() - run.nightStartedAt }, wave, left), cheated: run.cheated };
    const seats = bank.resultSeats();
    this.runResultWrites = recordRunResult(row.id, "finish", (r) => r.finish(row, seats), this.log, this.bankRetryMs, this.runResultWrites);
  }

  /** Story 10.7: the current run's stats inputs (null outside a run). */
  private runResultRun(): RunResultRun | null {
    return this.bank ? { bank: this.bank, district: this.state.district, seed: this.runSeed, nightStartedAt: this.nightStartedAt, cheated: this.cheated } : null;
  }

  /** Story 10.7 review L4: the waiting-only all-left save; when it failed, the run is lost: its stats row is finished. */
  private async finishIfNotSaved(saving: Promise<Date | null>, world: World, wave: number, run: RunResultRun | null): Promise<void> {
    if ((await saving) === null) this.finishRunResult(world, wave, true, run);
  }

  /**
   * Story 10.12 (AC 1–3, B2, B7): `admin.cheat`. Only in a run, only from a member; the SERVER decides admin
   * (`AdminCheatGate`: the seat's account read from the database once per run, never a client claim). A refused one
   * changes nothing and is only logged (no reply); an accepted one waits for the next tick (`applyCheats`).
   */
  onAdminCheat(client: RunClient, cheat: AdminCheat): void {
    const member = this.members.get(client.sessionId);
    if (!member || !this.controller || !this.inRun()) return;
    const seat = { seatId: seatIdOf(member), guestTokenHash: member.guestTokenHash, accountId: member.accountId };
    const answer = this.cheatGate.isAdmin(seat);
    const gate = this.cheatGate;
    const settle = (ok: boolean): void => {
      // A read that settled after the run changed (a new run, the member gone) does nothing.
      if (gate !== this.cheatGate || this.members.get(client.sessionId) !== member || !this.inRun()) return;
      if (ok) this.cheatQueue.push({ playerId: member.playerId, seatId: seat.seatId, accountId: member.accountId, cheat });
      else if (gate.shouldLog(seat.seatId, cheat.cheat, "refused")) this.log.warn({ roomId: this.roomId, playerId: member.playerId, accountId: member.accountId, cheat: cheat.cheat }, "admin_cheat_refused");
    };
    if (typeof answer === "boolean") settle(answer);
    else void this.afterAdminRead(answer, settle);
  }

  /** Story 10.12 (B7): the seat's admin read settles off the tick (the gate never rejects), then the cheat is queued or refused. */
  private async afterAdminRead(read: Promise<boolean>, settle: (ok: boolean) => void): Promise<void> {
    settle(await read);
  }

  /** Story 10.12 (B2): applies the queued cheats on the World; true when a restart replaced the run (no step this tick). */
  private applyCheats(controller: RunController): boolean {
    const world = controller.world;
    for (let i = 0; i < this.cheatQueue.length; i++) {
      const q = this.cheatQueue[i] as QueuedCheat;
      if (q.cheat.cheat === "restart") {
        this.cheatQueue.length = 0;
        this.noteCheatUsed(q, world.waves.number);
        this.restartWithSeed(controller, q.cheat.seed);
        return true;
      }
      if (applyAdminCheat(world, q.playerId, q.cheat)) this.noteCheatUsed(q, world.waves.number);
    }
    this.cheatQueue.length = 0;
    return false;
  }

  /** Story 10.12 (AC 7, B4): the run's stats row is marked at its first cheat; `admin_cheat_used` per the rate rule. */
  private noteCheatUsed(q: QueuedCheat, wave: number): void {
    if (this.cheatGate.shouldLog(q.seatId, q.cheat.cheat, "used")) this.log.info({ runId: this.bank?.runId, accountId: q.accountId, cheat: q.cheat.cheat, wave, ...(devAdminCheats() ? { dev: true } : {}) }, "admin_cheat_used");
    this.markRunCheated();
  }

  /** Story 10.12 (AC 7, B8): marks the run cheated once; its stats row after the run's earlier writes (fire and forget). */
  private markRunCheated(): void {
    if (this.cheated || !this.bank) return;
    this.cheated = true;
    const row = { id: this.bank.runId, district: this.state.district, seed: this.runSeed };
    this.runResultWrites = recordRunResult(row.id, "cheated", (r) => r.markCheated(row), this.log, this.bankRetryMs, this.runResultWrites);
  }

  /**
   * Story 10.12 (AC 6, B3): the room's run restarts for everyone with `seed`. The run ends as if everyone left at once
   * (ending "none": every seat banks `quit`, its waves so far; the save dropped; the stats row finished, cheated), the
   * room goes back to its lobby state (a resumed run's resume is over), then the same members start a fresh run with
   * that seed through the normal Start path (progress reads), with no Ready step. The new run is cheated too.
   */
  private restartWithSeed(controller: RunController, seed: number): void {
    this.endRun(controller, controller.world.waves.number);
    if (this.resume) {
      this.resume = null;
      this.state.resumeWave = 0;
    }
    this.toLobby();
    this.cheatRestartSeed = seed;
    this.log.info({ seed }, "admin_restart");
    void this.loadAndStart(true);
  }

  /**
   * `lobby.return` (Story 2.8), from any member, in phase "results": the whole room goes back to the
   * lobby. The run is dropped; members, slots and the host stay; every Ready flag and fight field is
   * reset. The next `run.start` builds a new run.
   */
  onLobbyReturn(client: RunClient): void {
    const member = this.members.get(client.sessionId);
    if (!member || this.state.phase !== "results") return;
    this.toLobby();
    this.log.info({ playerId: member.playerId }, "lobby_returned");
  }

  /** The room back in its lobby after a run's Results (`lobby.return`; Story 10.12: an online restart, B3). */
  private toLobby(): void {
    this.controller = null;
    this.saveWriter = null; // Story 8.4: the next Start is a new run (new id, new save)
    this.lastSave = null;
    this.bank = null; // Story 7.2: banks still in flight finish and deliver (the client matches them by run seed)
    this.horde = null;
    this.eventCtx = null;
    this.hordeStats.clear();
    this.slowTicks = null;
    this.slowPatches = null;
    this.pingTimer?.clear();
    this.pingDue = false;
    this.pingTimer = null;
    this.clearHolds();
    for (const m of this.members.values()) m.waiting = false; // Story 8.2: a late joiner still waiting is a lobby member now
    this.waitingIds.clear();
    this.lateInits.clear();
    this.moveHostIfGone("lobby"); // review H3: a run that ended with only waiting joiners left the role with nobody
    this.maxClients = MAX_PLAYERS;
    resetRunFields(this.state);
    this.state.phase = "lobby";
    // Review M3 (Story 7.7 R3 across runs): leavers' districts are gone now; once this run's banks settle, every
    // member's progress is read again (new districts open, new parts are owned).
    this.recomputeDistricts();
    const members = [...this.members.values()];
    void this.reloadProgress(members);
  }

  /** The state patch (Story 8.11: from `onTick`; the lobby interval before the first run): timed like a tick (`slow_patch`). */
  override broadcastPatch(): boolean {
    const watch = this.slowPatches;
    if (!watch) return super.broadcastPatch();
    const t0 = performance.now();
    const sent = super.broadcastPatch();
    watch.observe(performance.now() - t0, this.controller?.world.tick ?? 0);
    return sent;
  }

  /**
   * Where a player's horde view is centred: their own survivor, or for an "out" player the teammate
   * they spectate (Story 2.8: shared `spectateTarget`, the same choice as the client camera).
   */
  viewTargetFor(playerId: string): { readonly x: number; readonly y: number } | undefined {
    const world = this.controller?.world;
    if (!world) return undefined;
    const p = world.players.get(playerId);
    // Story 8.2 (J4): a waiting late joiner (no survivor yet) watches like an out player.
    if (!p) return this.waitingIds.has(playerId) ? (spectateTarget(world, playerId) ?? undefined) : undefined;
    return p.status === "out" ? (spectateTarget(world, playerId) ?? p) : p;
  }

  /** One horde frame per client whose player is in the run (AC 1, 4). */
  private sendHorde(world: World): void {
    const horde = this.horde;
    if (!horde) return;
    horde.prepare(world);
    for (let i = 0; i < this.clients.length; i++) {
      const client = this.clients[i] as RunClient;
      const member = this.members.get(client.sessionId);
      if (!member) continue;
      const at = this.viewTargetFor(member.playerId);
      const stats = this.hordeStats.get(member.playerId);
      if (!at || !stats) continue;
      horde.send(world, client, stats, at.x, at.y);
    }
  }

  /**
   * Story 2.10, `wave.started`: every per-wave counter restarts (`net_stats` averages and peaks,
   * `horde_stats`, `tick_stats`), so the lines on `wave.ended` cover exactly that wave.
   */
  private startWaveStats(): void {
    const now = performance.now();
    this.waveStartMs = now;
    this.peakZombiesAlive = 0;
    for (const m of this.netMeters.values()) {
      m.out.mark(now);
      m.in.mark(now);
    }
    for (const s of this.hordeStats.values()) {
      s.framesSent = 0;
      s.framesSkipped = 0;
      s.keyframes = 0;
      s.bytesSent = 0;
      s.lineSkipped = 0; // Story 8.13
      s.maxLineWaitMs = 0;
      s.lineCapKeys = 0;
    }
    this.slowTicks?.takeWindow();
    this.slowPatches?.takeWindow();
    this.pingDropped.clear(); // Story 8.7
  }

  /** On `wave.ended`: `net_stats` per player and `tick_stats` (2.10), `horde_stats` (2.5). */
  private logWaveStats(wave: number): void {
    this.logNetStats(wave);
    this.logHordeStats(wave);
    const tick = this.slowTicks?.takeWindow();
    const patch = this.slowPatches?.takeWindow();
    if (tick && patch) {
      this.log.info(
        { wave, peakZombiesAlive: this.peakZombiesAlive, ticks: tick.ticks, tickAvgMs: tick.avgMs, tickMaxMs: tick.maxMs, slowTicks: tick.slow, patchAvgMs: patch.avgMs, patchMaxMs: patch.maxMs, slowPatches: patch.slow },
        "tick_stats",
      );
    }
  }

  /**
   * `net_stats` per player (Story 2.10): payload KB/s (KB = 1024 B) sent to and received from that
   * client since the wave started, the busiest second, the RTT, and how much of the download was
   * the horde stream (`hordeKBps`; the rest is state patches and events).
   */
  private logNetStats(wave: number): void {
    const now = performance.now();
    const waveS = (now - this.waveStartMs) / 1000;
    for (const [sessionId, m] of this.netMeters) {
      const member = this.members.get(sessionId);
      if (!member) continue;
      this.log.info(
        {
          wave,
          playerId: member.playerId,
          avgOutKBps: round1(m.out.avgKBps(now)),
          peakOutKBps: round1(m.out.peakKBps(now)),
          avgInKBps: round1(m.in.avgKBps(now)),
          hordeKBps: round1(waveS > 0 ? (this.hordeStats.get(member.playerId)?.bytesSent ?? 0) / 1024 / waveS : 0),
          rttMs: Math.round(member.rttMs),
          pingDropped: this.pingDropped.get(member.playerId) ?? 0, // Story 8.7 (P2)
        },
        "net_stats",
      );
    }
    this.pingDropped.clear(); // review L5: each net_stats line counts its own wave only
  }

  /** `horde_stats` per player for the wave that just ended; the counters restart for the next. */
  private logHordeStats(wave: number): void {
    for (const [playerId, s] of this.hordeStats) {
      const avgBytes = s.framesSent === 0 ? 0 : Math.round(s.bytesSent / s.framesSent);
      this.log.info({ wave, playerId, framesSent: s.framesSent, framesSkipped: s.framesSkipped, keyframes: s.keyframes, avgBytes, lineSkipped: s.lineSkipped, maxLineWaitMs: Math.round(s.maxLineWaitMs), lineCapKeys: s.lineCapKeys }, "horde_stats");
      s.framesSent = 0;
      s.framesSkipped = 0;
      s.keyframes = 0;
      s.bytesSent = 0;
      s.lineSkipped = 0; // Story 8.13
      s.maxLineWaitMs = 0;
      s.lineCapKeys = 0;
    }
  }

  /**
   * One reliable `sim.events_flushed` per tick that has events, in emit order. Story 3.6 review M2:
   * turret shots and their non-killing hits go only to clients whose view contains them
   * (`EventInterest`); with none in the tick, one broadcast as before.
   */
  private forwardEvents(tick: number, events: readonly SimEvent[]): void {
    const ctx = this.eventCtx;
    const world = this.controller?.world;
    if (events.length === 0 || !ctx || !world) return;
    const interest = this.eventInterest;
    interest.prepare(world, events, ctx);
    if (interest.all.length === 0) return;
    const msg = this.eventsMsg;
    msg.tick = tick;
    if (interest.localCount === 0) {
      msg.events = interest.all;
      this.broadcast(S2C.SIM_EVENTS_FLUSHED, msg); // encoded synchronously: the arrays are reused
      return;
    }
    for (let i = 0; i < this.clients.length; i++) {
      const client = this.clients[i] as RunClient;
      const member = this.members.get(client.sessionId);
      const at = member ? this.viewTargetFor(member.playerId) : undefined;
      msg.events = at ? interest.eventsFor(world, at.x, at.y) : interest.all;
      if (msg.events.length > 0) client.send(S2C.SIM_EVENTS_FLUSHED, msg); // encoded synchronously
    }
  }

  /** Every second: each client gets the same ping id and its own RTT so far. */
  private ping(): void {
    this.pingId++;
    this.pingSentAtMs[this.pingId % PING_HISTORY] = performance.now();
    for (const client of this.clients) {
      const member = this.members.get(client.sessionId);
      if (!member) continue;
      client.send(S2C.NET_PINGED, { id: this.pingId, rttMs: Math.round(member.rttMs) } satisfies NetPinged);
    }
  }

  /**
   * `net.pong` for one of the last PING_HISTORY pings: EWMA, then the controller. Unknown, too old,
   * repeated, or older-than-last ids are ignored.
   */
  onPong(client: RunClient, id: number): void {
    const member = this.members.get(client.sessionId);
    if (!member || id > this.pingId || id <= this.pingId - PING_HISTORY || id < 1) return;
    if (id <= (this.lastPongId.get(client.sessionId) ?? 0)) return;
    this.lastPongId.set(client.sessionId, id);
    const sample = performance.now() - (this.pingSentAtMs[id % PING_HISTORY] as number);
    member.rttMs = member.rttMs === 0 ? sample : member.rttMs + RTT_EWMA * (sample - member.rttMs);
    this.controller?.setRtt(member.playerId, member.rttMs);
  }

  // ── Stories 8.4–8.6: saves ──

  /**
   * Story 8.6 (AC 12, S3): the resume's claim, in `onCreate` (before the room opens). The caller's ticket names the
   * account (pure HMAC like `onAuth`, re-checked against its device row; never an account id from the client); the
   * claim is ONE conditional UPDATE (`savedRunsRepo.claim`): a second resume of the same run is `save_busy`, an expired,
   * finished, foreign or guessed one `save_gone`. A claimed save that can't be read is released and refused.
   */
  private async claimResume(options: Record<string, unknown>, code: string): Promise<void> {
    const repo = roomSavesRepo();
    const id = options.savedRunId;
    const guestToken = options.guestToken;
    if (typeof id !== "string" || typeof guestToken !== "string") throw refuse("invalid_options");
    const tokenHash = hashGuestToken(guestToken);
    const ticketAccount = ticketAccountId(typeof options.ticket === "string" ? options.ticket : undefined, tokenHash);
    const accountId = ticketAccount === null ? null : await ticketStillCurrent(ticketAccount, tokenHash);
    if (accountId === null) throw refuse("save_gone"); // no account: nothing of yours is saved
    if (repo === null) throw refuse("save_unavailable");
    let claim;
    try {
      claim = await repo.claim(id, accountId, code);
    } catch {
      throw refuse("save_unavailable");
    }
    if (claim.outcome === "busy") throw refuse("save_busy");
    if (claim.outcome === "gone") throw refuse("save_gone");
    const migrated = migrateRunSave(claim.snapshot);
    if (!migrated.ok) {
      // A newer save (a rollback): released untouched for the newer server. Anything else can never be read.
      this.log.error({ runId: id, why: migrated.reason, version: migrated.version }, "save_unreadable");
      if (migrated.reason === "newer") {
        await repo.releaseOpen(id, code).catch(() => undefined);
        throw refuse("save_gone");
      }
      await repo.deleteRun(id, code).catch(() => undefined);
      throw refuse("save_too_old");
    }
    const save = await this.followMerges(migrated.save);
    try {
      // A trial (corrupt → refused now, not at Start). Review M3 (8.6-B8): another build restores best-effort.
      const trial = restoreRunSave(save, { balance: serverBalance, map: mapForDistrict(save.district), codeVersion: SAVE_CODE_VERSION });
      if (!trial.digestChecked) this.log.warn({ runId: id, from: save.codeVersion, to: SAVE_CODE_VERSION, balance: save.balanceVersion }, "save_restored_crossversion");
    } catch (e) {
      // Review M3 (8.6-B8): another map, or a save this build can't rebuild: "This saved game is too old". It is deleted
      // (never listed again) and its waves are still paid (records only).
      this.log.error({ runId: id, why: (e as Error).message }, "save_unreadable");
      await repo.deleteRun(id, code).catch(() => undefined);
      void bankSavedRun(save, { balance: serverBalance, map: mapForDistrict(save.district), repo: roomProgressRepo, log: this.log, codeVersion: SAVE_CODE_VERSION });
      this.log.info({ runId: id, why: "too_old" }, "run_save_deleted");
      throw refuse("save_too_old");
    }
    this.resume = { save, expiresAt: claim.expiresAt };
  }

  /**
   * Review M6: a guest seat whose account later logged into another account (7.6 merge) is that account's seat now:
   * the save's `acct:<guest>` seats are rewritten to the account it was merged into (the links were re-pointed).
   */
  private async followMerges(save: RunSave): Promise<RunSave> {
    const repo = roomSavesRepo();
    const ids = save.seats.map((x) => x.accountId).filter((a): a is string => a !== null);
    if (!repo || ids.length === 0) return save;
    let merged: Map<string, string>;
    try {
      merged = await repo.mergedTargets(ids);
    } catch {
      return save;
    }
    if (merged.size === 0) return save;
    return { ...save, seats: save.seats.map((x) => (x.accountId && merged.has(x.accountId) ? { ...x, accountId: merged.get(x.accountId) as string, seatKey: `acct:${merged.get(x.accountId) as string}` } : x)) };
  }

  /** Story 8.6: the saved seat a joiner owns (`seatKey`: the same account, or the same guest token for a guest seat). */
  private savedSeatOf(auth: { readonly guestTokenHash: string; readonly accountId?: string | null }): SavedSeat | undefined {
    const key = seatKey(auth);
    return this.resume?.save.seats.find((x) => x.seatKey === key || x.seatKey === `guest:${auth.guestTokenHash}`);
  }

  /**
   * Story 8.6 (AC 13; E8-R2, E8-R3, E8-R4): after the restore — saved seats with no member become remembered seats
   * (they can still join at a build phase tonight, and stay in the next save); newcomers enter by 8.2's late-join rule
   * (money from the returning seats' average earned; no +15 s in a fresh timer).
   */
  private resumeSeats(controller: RunController, save: RunSave, inits: readonly RunPlayerInit[]): void {
    const restored = controller.restored;
    if (!restored) return;
    for (const { seat, player } of restored.away) {
      const guestTokenHash = seat.seatKey.startsWith("guest:") ? seat.seatKey.slice(6) : "";
      this.rememberedSeats.set(seat.seatKey, { playerId: seat.playerId, slot: seat.slot, name: seat.name, guestTokenHash, accountId: seat.accountId, look: seat.look, player, kills: seat.kills, buildIdx: seat.buildIdx, seatGen: seat.seatGen });
    }
    this.syncLeftSeats();
    const world = controller.world;
    // Builder decision 8.6-B5: every bank of a resumed run is a top-up (a find is granted then), so a seat banked on an
    // earlier night's Leave may take the bag again tonight (7.12 M1's "closed run" no longer holds).
    world.loot.banked.clear();
    const returning = restored.present.map((r) => r.player);
    const newcomers: string[] = [];
    this.seatCounter = Math.max(this.seatCounter, save.seatCounter ?? 0);
    if (save.lootFinderSeat) this.bank?.noteLootFinder(save.lootFinderSeat); // review H1: the finder is a seat
    for (const m of this.members.values()) {
      if (world.players.has(m.playerId)) continue;
      const init = inits.find((i) => i.playerId === m.playerId);
      if (world.run.phase !== "build") {
        // Review M1: resumed into the vote: a newcomer waits (8.2's path) and enters at the next build start.
        m.waiting = true;
        this.waitingIds.add(m.playerId);
        this.lateInits.set(m.playerId, init ?? { playerId: m.playerId, slot: m.slot, unlocks: STARTER_ONLY, training: NO_TRAINING, source: "read_failed" });
        const st = this.state.players.get(m.playerId);
        if (st) st.waiting = true;
        newcomers.push(m.playerId);
        continue;
      }
      const training = init?.training ?? NO_TRAINING;
      const wallet = devStartingWallet !== null ? devStartingWallet : lateJoinWallet(returning, world.balance, trainedStartMoney(world.balance, training.startMoney));
      if (controller.addLatePlayer(m.playerId, m.slot, wallet, { unlocks: this.devUnlocksMask ?? init?.unlocks ?? STARTER_ONLY, training }, false)) newcomers.push(m.playerId);
      else this.log.warn({ playerId: m.playerId }, "late_join_failed");
    }
    this.log.info({ runId: save.runId, wave: save.wave, seatsBack: restored.present.length, newcomers: newcomers.length, away: restored.away.length, digestChecked: restored.digestChecked }, "run_resumed");
    this.resume = null; // the lobby part is over; the run is a run now (its save row stays 'open' for this room)
    this.state.resumeWave = 0;
  }

  /** Builder decision 8.4-B3: a save is kept only for a run with at least one seat that has an account (7.1). */
  private anySavedSeat(): boolean {
    for (const m of this.members.values()) if (m.accountId !== null && m.waiting !== true) return true;
    for (const r of this.rememberedSeats.values()) if (r.accountId !== null) return true;
    return false;
  }

  /** Story 8.4 (AC 6): every seat of the run for a save — members in the World or held, and remembered seats. */
  private saveSeats(world: World): SeatMeta[] {
    const out: SeatMeta[] = [];
    for (const m of this.members.values()) {
      if (m.waiting === true) continue; // 8.2: a waiting member has no seat yet (never saved)
      if (!world.players.has(m.playerId) && !world.heldPlayers.has(m.playerId)) continue;
      out.push({ seatKey: m.seatKey, accountId: m.accountId, name: m.name, slot: m.slot, playerId: m.playerId, seatGen: m.seatGen ?? 0, look: m.look, kills: this.controller?.kills(m.playerId) ?? 0 });
    }
    for (const [key, r] of this.rememberedSeats) out.push({ seatKey: key, accountId: r.accountId, name: r.name, slot: r.slot, playerId: r.playerId, seatGen: r.seatGen ?? 0, look: r.look, kills: r.kills, player: r.player, buildIdx: r.buildIdx });
    return out;
  }

  /** The run's save now, or null (not a calm phase, a live shot, no run). Logged when it can't be taken. */
  private captureSave(why: string): RunSave | null {
    const controller = this.controller;
    const bank = this.bank;
    if (!controller || !bank) return null;
    try {
      return captureRunSave(controller.world, this.saveSeats(controller.world), { runId: bank.runId, district: this.state.district, bannedSeats: this.bannedSeats, codeVersion: SAVE_CODE_VERSION, lootFinderSeat: bank.lootFinderSeat, seatCounter: this.seatCounter });
    } catch (e) {
      if (e instanceof SaveBlockedError) this.log.info({ why: e.why, kind: why }, "run_save_skipped");
      else this.log.error({ err: e, kind: why }, "run_save_failed");
      return null;
    }
  }

  /** The database row of a save. */
  private saveRow(save: RunSave): SaveRow {
    return {
      id: save.runId,
      district: save.district,
      seed: save.seed,
      snapshot: save as unknown as Record<string, unknown>,
      schemaVersion: save.schemaVersion,
      wave: save.wave,
      names: save.seats.map((x) => ({ name: x.name, slot: x.slot })),
      roomCode: this.roomId,
      links: save.seats.filter((x) => x.accountId !== null).map((x) => ({ accountId: x.accountId as string, seatKey: x.seatKey })),
    };
  }

  /**
   * Story 8.4 (AC 5, E8-S7): an autosave ('open': nobody can resume it) — at a build start, on the build's last tick
   * (E8-S2) and when the vote opens (E8-S12). Capture + JSON in the tick (≤ 3 ms), the write never awaited. No
   * database: skipped, logged once per run.
   */
  private autosave(kind: string): void {
    this.autosavePending = null;
    if (this.saveSettled) return;
    if (!this.saveWriter) {
      if (!this.saveSkipLogged) this.log.warn({ runId: this.bank?.runId }, "run_save_no_database");
      this.saveSkipLogged = true;
      return;
    }
    if (!this.anySavedSeat()) return; // builder decision 8.4-B3: no seat has an account → nobody could resume it
    const save = this.captureSave(kind);
    if (!save) return;
    const row = this.saveRow(save);
    this.saveRowOpen = true;
    const token = this.runToken;
    // Review L: the "last autosave" is the last STORED one (a mid-wave shutdown marks what the row really holds).
    this.saveWriter.autosave({ row, bytes: JSON.stringify(save).length, kind, onSaved: () => {
      if (this.runToken === token) this.lastSave = save;
    } });
  }

  /**
   * Story 8.4 (AC 7, D11): the run becomes resumable for 7 days. `save` null = take it now (a calm phase), else the
   * given one (the last autosave: a mid-wave shutdown, a tick error). Each linked seat's Supplies are topped up for the
   * waves played so far (E8-S4); the account keeps its newest 3 (E8-S11). Resolves with the expiry, or null when it
   * failed (nothing changed: S8). Never awaited by a tick.
   */
  private async makeResumable(why: "save_quit" | "all_left" | "shutdown" | "tick_error" | "disposed", given: RunSave | null = null, awaitBank = false): Promise<Date | null> {
    const writer = this.saveWriter;
    if (!writer || this.saveSettled) return null;
    const token = this.runToken;
    const save = given ?? (this.anySavedSeat() ? this.captureSave(why) : null);
    if (!save) return null;
    const expiresAt = saveExpiry();
    const repo = roomSavesRepo();
    if (!repo) return null;
    const asIs = given !== null; // the last autosave is already stored: mark it
    const r = await writer.after(() => (asIs ? repo.markSaved(save.runId, this.roomId, expiresAt) : repo.saveResumable(this.saveRow(save), expiresAt)));
    if (!r.ok || !r.value) {
      this.log.error({ runId: save.runId, why }, "run_save_failed");
      return null;
    }
    if (this.runToken === token) {
      this.saveSettled = true; // review L: never the next run's row
      this.savedResumable = true; // Story 10.7 review H1: the run plays on another night (no stats finish)
    }
    this.log.info({ runId: save.runId, why, wave: save.wave, phase: save.phase }, "run_resumable");
    // E8-S4: the Supplies of the waves so far (top-up: never twice); then E8-S11 per linked account. Review M2: a
    // shutdown waits for it (inside its bounded wait), so the database never closes under a top-up.
    if (awaitBank) await this.bankAndPrune(save);
    else void this.bankAndPrune(save);
    return expiresAt;
  }

  /** Story 8.4: everyone left in a calm phase: saved; if the save failed, banked as before (7.2) and the run is lost. */
  private async saveAllLeft(bankNow: () => void): Promise<void> {
    this.finalizing = true;
    if ((await this.makeResumable("all_left")) !== null) return;
    // Review M5: the fresh save failed: the last STORED autosave (this build's start) becomes the save; if that fails too
    // the row is deleted — never an 'open' row left for a dead room (the boot sweep would revive it).
    if (this.lastSave && (await this.makeResumable("all_left", this.lastSave)) !== null) return;
    bankNow();
    this.dropSave("lost");
  }

  /** E8-S4 then E8-S11: the save's Supplies top-up, then each linked account keeps its newest 3. Never rejects. */
  private async bankAndPrune(save: RunSave): Promise<void> {
    await bankSavedRun(save, { balance: serverBalance, map: mapForDistrict(save.district), repo: roomProgressRepo, log: this.log, retryMs: this.bankRetryMs, codeVersion: SAVE_CODE_VERSION });
    const repo = roomSavesRepo();
    if (!repo) return;
    for (const x of save.seats) {
      if (x.accountId === null) continue;
      try {
        const pruned = await repo.pruneAccount(x.accountId);
        for (const id of pruned.deleted) this.log.info({ runId: id, why: "pruned" }, "run_save_deleted");
      } catch {
        // logged as db_error by the repository; the next save prunes again
      }
    }
  }

  /** Story 8.4 (S2, S3): the run's save row goes — lost mid-wave, or the run finished. Never awaited by a tick. */
  private dropSave(why: "lost" | "ended"): void {
    const writer = this.saveWriter;
    const repo = roomSavesRepo();
    const runId = this.bank?.runId;
    if (!writer || !repo || !runId || this.saveSettled || !this.saveRowOpen) return;
    this.saveSettled = true;
    this.autosavePending = null;
    void this.deleteSave(writer, runId, why);
  }

  private async deleteSave(writer: SaveWriter, runId: string, why: "lost" | "ended"): Promise<void> {
    const repo = roomSavesRepo();
    if (!repo) return;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await writer.after(() => repo.deleteRun(runId, this.roomId));
      if (r.ok) {
        if (r.value) this.log.info({ runId, why }, "run_save_deleted");
        return;
      }
      // Review M5: a failed delete is tried once more (an 'open' row left behind would come back at the next boot).
      if (attempt === 1) await new Promise((res) => setTimeout(res, this.bankRetryMs));
    }
    this.log.error({ runId, why }, "run_save_delete_failed");
  }

  /**
   * `run.save_quit` (Story 8.5, AC 9; D12, S7, S8; "other" bucket): the host saves in a build phase or the vote. The
   * ticks pause while it writes (nothing after the capture can happen); success → `run.saved` to everyone, then every
   * socket closes with 4023 (terminal: no hold); failure → `run.save_failed` to the host, the room plays on.
   */
  onSaveQuit(client: RunClient): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    // Review M4: every refusal answers the sender (`run.save_failed {reason}`), so a phone never waits on "Saving…".
    const refuse = (reason: RunSaveFailed["reason"]): void => {
      this.log.info({ playerId: member.playerId, reason }, "save_quit_refused");
      client.send(S2C.RUN_SAVE_FAILED, { reason } satisfies RunSaveFailed);
    };
    if (hostKeyOf(member) !== this.hostKey || member.waiting === true) return refuse("not_host");
    const phase = this.state.phase;
    if (!this.inRun() || (phase !== "build" && phase !== "vote")) return refuse("not_now");
    if (this.savingQuit || this.shuttingDown || this.saveSettled) return refuse("saving");
    if (!this.saveWriter) return refuse("no_database");
    this.savingQuit = true;
    void this.saveAndQuit();
  }

  private async saveAndQuit(): Promise<void> {
    const expiresAt = await this.makeResumable("save_quit");
    this.savingQuit = false;
    if (expiresAt !== null) return this.closeSaved(expiresAt);
    // S8: the host now (the role may have moved meanwhile) is told; nothing else changes.
    for (const m of this.members.values()) if (hostKeyOf(m) === this.hostKey) this.clients.getById(m.sessionId)?.send(S2C.RUN_SAVE_FAILED, { reason: "failed" } satisfies RunSaveFailed);
  }

  /** Story 8.5: everyone is told and closed with 4023; the members go first, so no drop or leave holds or saves anything. */
  private closeSaved(expiresAt: Date): void {
    this.shuttingDown = true; // no more ticks
    this.broadcast(S2C.RUN_SAVED, { expiresAt: expiresAt.toISOString() } satisfies RunSaved);
    const clients = Array.from(this.members.values(), (m) => this.clients.getById(m.sessionId));
    for (const hold of this.holds.values()) {
      hold.timer?.clear();
      hold.reconnection?.reject(new Error("saved"));
    }
    this.holds.clear();
    this.members.clear();
    for (const c of clients) c?.leave(CLOSE_RUN_SAVED);
    this.log.info({ runId: this.bank?.runId }, "room_closed_saved");
  }

  /**
   * The room's one error handler (architecture › Error Handling): logs with roomId, method and
   * tick, and the simulation keeps going. After MAX_TICK_ERRORS_IN_A_ROW failed ticks the room
   * tells everyone and closes (saving a snapshot is Epic 8). Join refusals (`ServerError`) are
   * expected and already logged as `join_refused`.
   */
  override onUncaughtException(error: RoomException, method: RoomMethodName): void {
    const cause = (error as Error).cause;
    if (cause instanceof ServerError) return;
    const tick = this.controller?.world.tick ?? null;
    this.log.error({ err: cause ?? error, method, tick }, "room_exception");
    if (method !== "setFixedTimestep") return;
    this.tickErrors++;
    if (this.tickErrors < MAX_TICK_ERRORS_IN_A_ROW || this.shuttingDown) return;
    this.shuttingDown = true;
    this.log.error({ tick, errors: this.tickErrors }, "room_closed_after_tick_errors");
    // Story 8.4 (AC 7): "the simulation is corrupted": never a fresh capture — the last autosave (the last build's
    // last tick, or this calm phase's start) becomes the resumable save.
    const last = this.inRun() ? this.lastSave : null;
    void this.closeAfterSave(last ? this.makeResumable("tick_error", last, true) : Promise.resolve(null), () => TICK_ERROR_MESSAGE, undefined);
  }

  /**
   * Stop or redeploy (Story 2.2 AC 5): tell everyone, then close with 4001. Story 8.4 (AC 7, D11): a run in a build
   * phase or the vote is saved now; mid-wave the last autosave (the previous build's last tick: the wave replays from
   * its start) becomes the save. The write is waited for (≤ SHUTDOWN_SAVE_WAIT_MS; Colyseus waits for every room).
   */
  override onBeforeShutdown(): void {
    const calm = this.state.phase === "build" || this.state.phase === "vote";
    const saving = !this.inRun() || this.saveSettled || this.savingQuit ? Promise.resolve(null) : calm ? this.makeResumable("shutdown", null, true) : this.lastSave ? this.makeResumable("shutdown", this.lastSave, true) : Promise.resolve(null);
    this.shuttingDown = true; // no tick after the capture
    this.log.info("room_shutdown");
    void this.closeAfterSave(saving, (saved) => (saved ? SERVER_RESTARTING_SAVED_MESSAGE : SERVER_RESTARTING_MESSAGE), CloseCode.SERVER_SHUTDOWN);
  }

  /** Story 8.4 (AC 7): waits for the save (≤ SHUTDOWN_SAVE_WAIT_MS), then tells everyone and closes the room. */
  private async closeAfterSave(saving: Promise<Date | null>, text: (saved: boolean) => string, code: number | undefined): Promise<void> {
    const expiresAt = await withTimeout(saving, SHUTDOWN_SAVE_WAIT_MS);
    this.broadcast(S2C.SERVER_SHUTDOWN_STARTED, { message: text(expiresAt !== null) });
    try {
      await this.disconnect(code);
    } catch {
      // already closing
    }
  }

  /**
   * Story 8.1: back to the lobby: a pending reconnection becomes a normal leave (D7: no holds in the
   * lobby), quiet timers stop, remembered seats and the freeze are gone with the run.
   */
  private clearHolds(): void {
    for (const hold of this.holds.values()) {
      hold.timer?.clear();
      hold.reconnection?.reject(new Error("lobby"));
    }
    this.holds.clear();
    this.rememberedSeats.clear();
    this.state.leftSeats = "";
    this.resumeTimer?.clear();
    this.resumeTimer = null;
  }

  /** Story 8.6: a resumed lobby that never started gives its save back. */
  private async releaseResume(id: string): Promise<void> {
    try {
      if (await roomSavesRepo()?.releaseOpen(id, this.roomId)) this.log.info({ runId: id }, "run_resume_released");
    } catch {
      // logged as db_error by the repository; the boot sweep releases it at the latest
    }
  }

  override onDispose(): void {
    this.unregisterDevices?.();
    // Story 8.6: a resumed lobby closed before its Start: the run is resumable again (its expiry unchanged).
    if (this.resume) {
      void this.releaseResume(this.resume.save.runId);
      this.resume = null;
    } else if (this.saveRowOpen && !this.saveSettled && !this.finalizing && !this.savingQuit && !this.shuttingDown && this.controller) {
      // Review M5: a row this room still holds is settled (never left 'open' for the boot sweep): the last stored save
      // becomes resumable when there is one, else the row goes.
      if (this.lastSave) void this.makeResumable("disposed", this.lastSave);
      else {
        this.dropSave("lost");
        this.finishRunResult(this.controller.world, this.controller.world.waves.number, true); // Story 10.7 review L4
      }
    }
    this.clearHolds();
    reservedCodes.delete(this.roomId);
    this.controller = null;
    this.log.info("room_disposed");
  }

  /** The input (Story 8.11: `BYTES.INPUT`, already decoded, validated and rate-limited): queued for the World (lobby: ignored). */
  /**
   * Story 2.12 re-review M-B: an input the rate bucket dropped (an honest burst after a stall).
   * Only seq and edge flags are read; the controller counts the seq as received and carries the edges.
   */
  onInputRateDropped(client: RunClient, message: unknown): void {
    const member = this.members.get(client.sessionId);
    // Story 8.11: the dropped binary input is decoded (seq, edges); one that doesn't decode carries nothing.
    if (member && message instanceof Uint8Array && decodeInput(message, this.rateDroppedIn)) {
      this.controller?.rateDroppedInput(member.playerId, this.rateDroppedIn);
      this.horde?.ack(client, decodeInputAck(message), performance.now(), decodeInputSendMs(message)); // Story 8.13: its ack still times the line
    }
  }

  onInput(client: RunClient, input: PlayerInput): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    // Story 8.13: the newest tick this phone has received times the line to it (the slow-line horde skip).
    this.horde?.ack(client, this.inputAck, performance.now(), this.inputSendMs);
    this.inputAck = -1;
    this.inputSendMs = -1;
    // Story 8.1 (AC 2): inputs again on the same socket after a quiet hold: the seat returns (F4) first.
    // A late input made while the line was down (F7: `isStaleInput`) is no sign of life.
    if (this.holds.get(member.playerId)?.reason === "quiet" && this.controller && !this.controller.isStaleInput(input)) this.endHold(member, "input");
    this.controller?.queueInput(member.playerId, input);
  }
}

/** Story 8.3 review M5: the host's seat key (a takeover keeps it; a return from a hold or a restored seat gets a new join order). */
function hostKeyOf(m: Pick<Member, "playerId" | "joinOrder">): string {
  return `${m.playerId}#${m.joinOrder}`;
}

