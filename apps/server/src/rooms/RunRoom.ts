import { randomBytes } from "node:crypto";
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
  ByteRate,
  C2S,
  MAX_PLAYERS,
  S2C,
  TICK_RATE_HZ,
  buildSetReadySchema,
  evacVoteSchema,
  DOWNTOWN_MAP,
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
  netPongSchema,
  parseWaveMix,
  playerInputSchema,
  runStartSchema,
  shopBuySchema,
  shopRerollSchema,
  shopBuyItemSchema,
  shopUpgradeSchema,
  spectateTarget,
  startBlocker,
  zombieNetId,
  type BuildingPlace,
  type BuildingRefused,
  type BuildingRepairRefused,
  type BuildingUpgradeRefused,
  type BuildingSellRefused,
  type BuildingMoveRefused,
  type BuildingGhost,
  type BuildingGhosted,
  type JoinRefusal,
  type NetEvent,
  type NetEventContext,
  type NetPinged,
  type PlayerInput,
  type PlayerLeft,
  type PlayerLeftReason,
  type RunJoined,
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
import { CLOSE_SEAT_KEPT, CLOSE_TAKEN_OVER, HOLD_S, MAX_CLIENT_MESSAGE_BYTES, RESUME_COUNT_S } from "../net/limits";
import { MessageGuard } from "../net/messageGuard";
import { roomCreateLimiter } from "../net/rateLimit";
import { log, roomLog } from "../ops/logger";
import { assignSlot, hashGuestToken, nextHost, seatKey, type Member } from "../run/lobby";
import { RunController, parseDevHpFraction } from "../run/RunController";
import { SLOW_PATCH_MESSAGE, SlowTickWatch } from "../run/slowTick";
import { pickDevRunSeed } from "../run/devRunSeed";
import { pickDevDecayStages } from "../run/devDecayStages";
import { pickDevForceBlackout } from "../run/devForceBlackout";
import { pickDevBossWaves } from "../run/devBossWaves";
import { parseDevEvents } from "@topdown/shared";
import { pickDevStartWave } from "../run/devStartWave";
import { pickDevShopCards } from "../run/devShopCards";
import { pickDevShopAll } from "../run/devShopAll";
import { resetRunFields, syncState } from "./schema/syncState";
import { uniqueRoomCode } from "./roomCode";
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

/** What `onAuth` hands to `onJoin` as `client.auth`. */
export interface RunAuth {
  name: string;
  ip: string | undefined;
  /** SHA-256 of the guest token (Story 2.3); the raw token never leaves `onAuth`. */
  guestTokenHash: string;
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
  readonly player: SimPlayer;
  readonly kills: number;
}

/** `ms` rounded to one decimal, for log lines. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** State patches every 50 ms (20 Hz, the simulation rate). */
const PATCH_RATE_MS = 50;

/** RTT probe period (Story 2.4): one `net.pinged` per client per second during a run. */
export const PING_INTERVAL_MS = 1000;
/** Pings whose send time is kept: a pong up to 5 s late still counts (Story 2.4 review; 2.7 needs high RTTs). */
export const PING_HISTORY = 5;
/** Weight of a new RTT sample in the EWMA. */
const RTT_EWMA = 0.25;
/** Tick exceptions in a row before the room gives up and disconnects everyone. */
export const MAX_TICK_ERRORS_IN_A_ROW = 20;
export const TICK_ERROR_MESSAGE = "The game hit an error, sorry";

/** A random uint32 run seed (`node:crypto`; never Math.random). */
export function randomUint32(): number {
  return randomBytes(4).readUInt32BE(0);
}

/** Codes picked by rooms still being created (not yet visible to `getLocalRoomById`). */
const reservedCodes = new Set<string>();

const refuse = (reason: JoinRefusal): ServerError => new ServerError(JOIN_REFUSED_CODE, reason);
/** onAuth runs before a room is picked: its lines carry `roomId: "auth"`. */
const authLog = roomLog("auth");

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
  /** Increments on every join; the lowest `joinOrder` is the longest-connected member. */
  private joinCounter = 0;
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
  /** Story 8.1: the hold length in seconds (HOLD_S; tests may shorten it on a live room, like `allowSoloStart`). */
  holdS = HOLD_S;
  /** Story 8.1 (F6): the 3-2-1 after a freeze (null: none running). */
  private resumeTimer: Delayed | null = null;
  private frozenAtMs = 0;

  /** Validates join options before a seat is reserved (runs for create and join). */
  static override async onAuth(_token: string, options: unknown, ctx: AuthContext): Promise<RunAuth> {
    try {
      return RunRoom.checkAuth(options, ctx);
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
    if (parsed.data.balanceVersion !== serverBalance.version) throw refuse("balance_mismatch");
    // Story 4.1: a client built with another map would predict against other walls.
    if (parsed.data.mapVersion !== DOWNTOWN_MAP.version) throw refuse("balance_mismatch");
    // Story 2.2 AC 3: `ctx.ip` is X-Real-IP, which Caddy sets from Cloudflare's Cf-Connecting-Ip.
    if (parsed.data.intent === "create" && !roomCreateLimiter.allow(ctx.ip ?? "unknown")) {
      log.warn({ ip: ctx.ip ?? "unknown" }, "room_create_rate_limited");
      throw refuse("rate_limited");
    }
    return { name: parsed.data.name, ip: ctx.ip, guestTokenHash: hashGuestToken(parsed.data.guestToken) };
  }

  override async onCreate(options: { intent?: unknown } & Partial<RunRoomOptions>): Promise<void> {
    if (options.intent !== "create") throw refuse("invalid_options");
    this.allowSoloStart = options.allowSoloStart === true;
    const code = uniqueRoomCode((c) => reservedCodes.has(c) || matchMaker.getLocalRoomById(c) !== undefined);
    reservedCodes.add(code);
    this.roomId = code;
    this.log = roomLog(code);
    this.takeScenario(options as { scenario?: unknown; allowTestScenarios?: unknown });
    this.takeDevRunSeed((options as { devRunSeed?: unknown }).devRunSeed);
    this.maxClients = MAX_PLAYERS;
    this.patchRate = PATCH_RATE_MS;
    // Only reachable by its code (joinById), never by a "join any run" matchmaking call.
    await this.setPrivate(true, false);
    this.setState(new RunState({ phase: "lobby", hostSlot: 0 }));

    this.onMessage(
      C2S.INPUT_SEND,
      this.net.guard(playerInputSchema, (c, input) => this.onInput(c, input), "input", (c, m) => this.onInputRateDropped(c, m)),
    );
    this.onMessage(C2S.LOBBY_SET_READY, this.net.guard(lobbySetReadySchema, (c, m) => this.onSetReady(c, m.ready)));
    this.onMessage(C2S.RUN_START, this.net.guard(runStartSchema, (c) => this.onStart(c)));
    this.onMessage(C2S.NET_PONG, this.net.guard(netPongSchema, (c, m) => this.onPong(c, m.id)));
    this.onMessage(C2S.LOBBY_RETURN, this.net.guard(lobbyReturnSchema, (c) => this.onLobbyReturn(c)));
    this.onMessage(C2S.BUILD_SET_READY, this.net.guard(buildSetReadySchema, (c, m) => this.onBuildReady(c, m.ready)));
    this.onMessage(C2S.EVAC_VOTE, this.net.guard(evacVoteSchema, (c, m) => this.onEvacVote(c, m.choice))); // Story 6.11
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

  override onJoin(client: RunClient): void {
    try {
      this.join(client);
    } catch (e) {
      if (e instanceof ServerError) this.log.info({ reason: e.message }, "join_refused");
      throw e;
    }
  }

  private join(client: RunClient): void {
    const auth = client.auth;
    if (!auth) throw refuse("invalid_options");
    const key = seatKey(auth);
    if (this.state.phase !== "lobby") {
      // Story 8.1: a started run takes back only its own seats (Story 8.2 opens build-phase joins for new players).
      for (const m of this.members.values()) if (m.seatKey === key) return this.takeOver(m, client); // D5: the newest connection takes the seat
      const seat = this.rememberedSeats.get(key);
      if (seat) return this.restoreRemembered(key, seat, client);
      throw refuse("run_started");
    }
    for (const m of this.members.values()) if (m.seatKey === key) throw refuse("already_joined"); // the lobby keeps the refusal (D5)
    const slot = assignSlot(Array.from(this.members.values(), (m) => m.slot));
    if (slot < 0) throw refuse("invalid_options"); // unreachable: maxClients locks the room at 4
    const playerId = `p${slot}`;
    const member: Member = {
      playerId,
      slot,
      sessionId: client.sessionId,
      name: auth.name,
      guestTokenHash: auth.guestTokenHash,
      seatKey: key,
      joinOrder: ++this.joinCounter, // a counter, not the clock: a clock jump can't reorder hosts
      rttMs: 0,
    };
    // The creator is host (slot 0); later joiners never take it over.
    if (this.members.size === 0) this.state.hostSlot = slot;
    this.members.set(client.sessionId, member);
    this.state.players.set(playerId, new PlayerState({ slot, name: auth.name, ready: false }));
    this.attachClient(client, member);
    this.log.info({ playerId, slot }, "player_joined");
  }

  /** The per-socket parts of a join (a first join, a reconnect, a takeover): guard, byte meters, `run.joined`. */
  private attachClient(client: RunClient, member: Member): void {
    this.net.add(client, member.playerId);
    this.countBytes(client);
    client.send(S2C.RUN_JOINED, { playerId: member.playerId, slot: member.slot, tickRateHz: TICK_RATE_HZ } satisfies RunJoined);
    // A frame over maxPayload is refused by ws, which closes this socket (AC 5 "too large").
    client.ref.on("error", (e: { code?: string }) => {
      if (e.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") this.net.drop(client, "too_large");
    });
  }

  /** Story 8.1: build, wave and vote (and endless, which is build/wave): a drop is held. Lobby and results: a drop is a leave (D7). */
  inRun(): boolean {
    const phase = this.state.phase;
    return this.controller !== null && (phase === "build" || phase === "wave" || phase === "vote");
  }

  /**
   * Story 8.1 (AC 6, decision 8.1 D5): the same seat (`seatKey`) joins a started run while its seat
   * is held or still open: the new connection takes it. The old socket is closed (CLOSE_TAKEN_OVER 4021, not a
   * consented leave) or its pending reconnection is rejected; the member record moves to the new
   * session first, so the old socket's onDrop/onLeave find no member and do nothing (no hold restart).
   */
  private takeOver(old: Member, client: RunClient): void {
    const member: Member = { ...old, sessionId: client.sessionId };
    this.members.delete(old.sessionId);
    this.members.set(client.sessionId, member);
    this.netMeters.delete(old.sessionId);
    this.lastPongId.delete(old.sessionId);
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
    if (!controller.restoreSeat(seat.player, seat.kills)) throw refuse("seat_kept");
    this.rememberedSeats.delete(key);
    const member: Member = {
      playerId: seat.playerId,
      slot: seat.slot,
      sessionId: client.sessionId,
      name: seat.name,
      guestTokenHash: seat.guestTokenHash,
      seatKey: key,
      joinOrder: ++this.joinCounter, // the newest member: the host role never moves back (Epic 8 D8)
      rttMs: 0,
    };
    this.members.set(client.sessionId, member);
    this.state.players.set(seat.playerId, new PlayerState({ slot: seat.slot, name: seat.name, ready: false }));
    this.hordeStats.set(seat.playerId, newHordeStats());
    this.attachClient(client, member);
    syncState(this.state, controller); // the seat's fields in the first patch
    this.sendOffer(client, seat.playerId);
    this.log.info({ playerId: seat.playerId, slot: seat.slot, wallet: seat.player.wallet }, "seat_restored");
  }

  /**
   * Story 8.1 (AC 1, 2): puts a seat on hold. A drop gets Colyseus's 120 s reconnection; a quiet
   * player (already out of the World, `RunController.onQuietHold`) the room's own 120 s timer. A
   * quiet seat that then drops switches to the reconnection window.
   */
  private startHold(member: Member, reason: HoldReason, client: RunClient | null): void {
    const controller = this.controller;
    if (!controller) return;
    controller.holdPlayer(member.playerId); // false when already held (quiet → drop)
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
    if (s && fresh) s.heldUntilTick = controller.world.tick + Math.round(this.holdS * TICK_RATE_HZ);
    this.log.info({ playerId: member.playerId, reason, wave: controller.world.waves.number, phase: this.state.phase }, "player_held");
    this.updateFreeze();
  }

  /** Story 8.1 (AC 3): the seat's hold ends (a reconnect, a takeover or inputs again after a quiet hold). */
  private endHold(member: Member, via: "token" | "guest" | "input"): void {
    const hold = this.holds.get(member.playerId);
    if (!hold) return;
    hold.timer?.clear();
    this.holds.delete(member.playerId);
    this.controller?.returnPlayer(member.playerId);
    const s = this.state.players.get(member.playerId);
    if (s) s.heldUntilTick = 0;
    if (this.controller) syncState(this.state, this.controller); // the placed body and protection in the next patch
    this.log.info({ playerId: member.playerId, afterMs: Math.round(performance.now() - hold.atMs), via, reason: hold.reason }, "player_returned");
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
   * starts a 3-2-1 on the room clock (1 s each); everyone gone again cancels it.
   */
  private updateFreeze(): void {
    const controller = this.controller;
    if (!controller || !this.inRun()) return;
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
    const expired = this.holds.has(member.playerId) && code !== CloseCode.CONSENTED;
    this.finalLeave(member, expired ? "hold_expired" : code === CloseCode.CONSENTED ? "left" : "disconnected", code);
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
    const controller = this.controller;
    if (controller && this.inRun()) {
      controller.holdPlayer(playerId); // a present player leaves the World the same way (no-op when held)
      const seat = controller.releaseHeld(playerId);
      if (seat) this.rememberedSeats.set(member.seatKey, { playerId, slot, name, guestTokenHash: member.guestTokenHash, player: seat.player, kills: seat.kills });
    } else {
      controller?.removePlayer(playerId);
    }
    this.hordeStats.delete(playerId); // no zero horde_stats lines for a player who left
    this.lastPongId.delete(member.sessionId);
    this.netMeters.delete(member.sessionId);
    const reason: PlayerLeftReason = why === "left" ? "left" : "disconnected";
    if (why === "hold_expired") this.log.info({ playerId, wave: controller?.world.waves.number ?? 0 }, "player_hold_expired");
    this.log.info({ playerId, reason, code, wave: controller?.world.waves.number ?? 0 }, "player_left");
    this.broadcast(S2C.PLAYER_LEFT, { playerId, name, reason } satisfies PlayerLeft);
    // The longest-connected member takes over as host (lobby and mid-run alike).
    const host = slot === this.state.hostSlot ? nextHost(this.members.values()) : undefined;
    if (host) {
      this.state.hostSlot = host.slot;
      this.log.info({ playerId: host.playerId, slot: host.slot }, "host_changed");
    }
    if (this.members.size === 0 && controller && this.inRun()) {
      // Epic 8 D5/D11: everyone gone (the last hold ran out): the run is lost (Story 8.4 saves build phases).
      this.log.info({ runSeed: this.runSeed, wave: controller.world.waves.number, phase: this.state.phase }, "run_abandoned");
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

  /** `lobby.set_ready`: the sender's own flag, lobby only. */
  onSetReady(client: RunClient, ready: boolean): void {
    if (this.state.phase !== "lobby") return;
    const member = this.members.get(client.sessionId);
    const player = member && this.state.players.get(member.playerId);
    if (player) player.ready = ready;
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
    client.send(S2C.SHOP_OFFERED, { build: o.build, rev: o.rev, cards: [...o.cards], sold: o.sold, rerollPrice: o.rerollPrice, canReroll: o.canReroll } satisfies ShopOffered);
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
    if (reason !== null) {
      this.log.info({ playerId: member.playerId, reason }, "run_start_refused");
      return;
    }
    this.startRun();
  }

  /**
   * Builds the World from the members (join order, `teamSpawnPoint` by slot) and starts the 20 Hz loop.
   * Story 3.1: the run starts in its first build phase; `syncState` writes phase "build".
   */
  private startRun(): void {
    const players = Array.from(this.members.values(), (m) => ({ playerId: m.playerId, slot: m.slot }));
    const runSeed = this.devRunSeed ?? randomUint32();
    this.runSeed = runSeed;
    if (this.devRunSeed !== null) this.log.warn({ runSeed }, "dev_run_seed");
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
    const controller = new RunController({
      balance: serverBalance,
      seed: runSeed,
      players,
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
      // Story 3.7 (dev only, read per run like DEV_NO_WAVES): DEV_PLACED_BUILDING_HP=0.5 places buildings at half HP.
      devPlacedHpFraction: devPlacedHp,
      // Story 2.12: rewound hit testing; DEV_NO_REWIND=1 (dev only) turns it off for A/B checks of the overlay's reversed hits.
      lagCompensation: !(devAllowed && process.env.DEV_NO_REWIND === "1"),
      // Story 2.12 review M1: telemetry only (at most once per wave per player), never a kick.
      onSeqResync: (playerId, wave, resyncs) => this.log.info({ playerId, wave, resyncs }, "seq_gap_suspect"),
      // Story 8.1 (D1): a connected player quiet for 3 s in a wave is held like a drop.
      onQuietHold: (playerId) => {
        for (const m of this.members.values()) if (m.playerId === playerId) this.startHold(m, "quiet", null);
      },
      onSpreadCancelSuspect: (s) =>
        this.log.info({ playerId: s.playerId, wave: s.wave, matchRatio: +s.matchRatio.toFixed(2), k: +s.k.toFixed(2), t: +s.t.toFixed(1), samples: s.samples }, "spread_cancel_suspect"),
    });
    if (!controller.world.zombieHistory.enabled) this.log.warn("dev_no_rewind");
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
    // Story 8.1: a held seat keeps a reserved seat in Colyseus, so a takeover join (D5) or a held
    // player's reconnect must fit beside 4 seats: room for one spare connection per seat. Joins that
    // are not one of the run's seats are refused in `join()` (run_started) whatever the count.
    this.maxClients = MAX_PLAYERS * 2;
    void this.unlock();
    const zombies = controller.world.zombies;
    this.eventCtx = { balance: serverBalance, zombieNetId: (id) => zombieNetId(id, zombies.generation[id] ?? 0) };
    this.horde = new HordeEncoder();
    for (const p of players) this.hordeStats.set(p.playerId, newHordeStats());
    this.slowTicks = new SlowTickWatch(this.roomId, this.log, () => performance.now());
    this.slowPatches = new SlowTickWatch(this.roomId, this.log, () => performance.now(), SLOW_PATCH_MESSAGE);
    syncState(this.state, controller); // spawn positions in the same patch as phase "build"
    // 0.18 fixed timestep: at most 5 catch-up steps, then the backlog is dropped.
    this.setFixedTimestep(() => this.onTick(), TICK_RATE_HZ);
    this.pingTimer?.clear();
    this.pingTimer = this.clock.setInterval(() => this.ping(), PING_INTERVAL_MS);
    this.waveStartMs = performance.now();
    this.lastClearedWave = 0;
    this.peakZombiesAlive = 0;
    this.log.info({ runSeed, players: players.length }, "run_started");
    if (this.scenario) {
      this.state.scenario = this.scenario;
      this.log.info({ scenario: this.scenario, startWave: controller.world.waves.number + 1 }, "test_scenario_started");
    }
  }

  /**
   * One server tick: step, copy to schema, forward events, send horde frames (all inside the
   * slow-tick timing). The patch goes out between ticks, timed by `broadcastPatch`. Only phases
   * "build", "wave" and (Story 6.11) "vote" step the World (Story 3.1): after Results nothing moves
   * any more (Story 2.8).
   */
  onTick(): void {
    const controller = this.controller;
    const phase = this.state.phase;
    if (!controller || this.shuttingDown || (phase !== "build" && phase !== "wave" && phase !== "vote")) return;
    if (this.state.frozen) return; // Story 8.1 (F6): nobody connected, or the 3-2-1 is running: the World waits
    const t0 = performance.now();
    const events = controller.tick();
    syncState(this.state, controller);
    this.forwardEvents(controller.world.tick, events);
    this.sendHorde(controller.world);
    this.slowTicks?.observe(performance.now() - t0, controller.world.tick);
    const alive = controller.world.zombies.aliveCount;
    if (alive > this.peakZombiesAlive) this.peakZombiesAlive = alive;
    for (let i = 0; i < events.length; i++) {
      const e = events[i] as SimEvent;
      if (e.type === "wave.started") this.startWaveStats();
      else if (e.type === "wave.ended") {
        this.lastClearedWave = e.number;
        this.logWaveStats(e.number);
      }
      else if (e.type === "team.wiped") this.endRun(controller, e.wave);
      else if (e.type === "run.extracted") this.endRun(controller, e.wave); // Story 6.11
      else if (e.type === "run.vote_resolved") this.log.info({ wave: controller.world.waves.number, extract: e.extract, stay: e.stay, silent: e.silent, choice: e.choice }, "vote_resolved"); // Story 6.11 (run stats)
      else if (e.type === "build.started") this.sendOffers(); // Story 5.13: each player's new cards (after the tick's events)
      else if (e.type === "decay.stage_changed") this.log.info({ stage: e.stage, from: e.from, wave: controller.world.waves.number + 1, variants: controller.world.decay.variants }, "decay_stage_changed"); // Story 4.5 (architecture › logging: decay stage)
    }
    this.tickErrors = 0;
  }

  /**
   * Team wipe (Story 2.8 AC 4) or, Story 6.11, the team extracted: the run ends for everyone.
   * `team.wiped` / `run.extracted` was already forwarded this tick; the World's run state machine
   * already went to "results" (`endRun`, which set `run.ending`), and the patch with phase "results"
   * follows. The World stays as it was (no more ticks). `earned` includes the last wave's bonus
   * (paid by the economy system in the same tick). Story 6.12 (F7): the log splits each player's
   * earnings at the first Stay (`earnedBeforeEndless`) and marks the after-10 part lost on a wipe.
   */
  private endRun(controller: RunController, wave: number): void {
    const run = controller.world.run;
    this.state.phase = "results"; // syncState already copied it from the World; kept explicit
    this.state.resultWave = wave;
    this.state.resultEnding = run.ending;
    const kills: Record<string, number> = {};
    const earned: Record<string, number> = {};
    const earnedBeforeEndless: Record<string, number> = {};
    const earnedAfter10Lost: Record<string, number> = {};
    for (const [playerId, p] of controller.world.players) {
      kills[playerId] = controller.kills(playerId);
      earned[playerId] = p.earned; // Story 3.2 (3.10 compares it with the GDD target)
      earnedBeforeEndless[playerId] = run.endless ? p.earnedAtEvac : p.earned;
      earnedAfter10Lost[playerId] = run.ending === "lost" ? p.earned - p.earnedAtEvac : 0;
    }
    const endlessWaves = run.endless ? Math.max(0, this.lastClearedWave - controller.world.balance.waves.runWaves) : 0; // review L11: waves really cleared (a wipe in a build phase too)
    this.log.info({ runSeed: this.runSeed, wave, ending: run.ending, endless: run.endless, endlessWaves, kills, earned, earnedBeforeEndless, earnedAfter10Lost }, "run_ended");
  }

  /**
   * `lobby.return` (Story 2.8), from any member, in phase "results": the whole room goes back to the
   * lobby. The run is dropped; members, slots and the host stay; every Ready flag and fight field is
   * reset. The next `run.start` builds a new run.
   */
  onLobbyReturn(client: RunClient): void {
    const member = this.members.get(client.sessionId);
    if (!member || this.state.phase !== "results") return;
    this.controller = null;
    this.horde = null;
    this.eventCtx = null;
    this.hordeStats.clear();
    this.slowTicks = null;
    this.slowPatches = null;
    this.pingTimer?.clear();
    this.pingTimer = null;
    this.clearHolds();
    this.maxClients = MAX_PLAYERS;
    resetRunFields(this.state);
    this.state.phase = "lobby";
    this.log.info({ playerId: member.playerId }, "lobby_returned");
  }

  /** Colyseus's patch interval: encode + send the state patch, timed like a tick (`slow_patch`). */
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
    const p = world?.players.get(playerId);
    if (!world || !p) return undefined;
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
      s.bytesSent = 0;
    }
    this.slowTicks?.takeWindow();
    this.slowPatches?.takeWindow();
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
        },
        "net_stats",
      );
    }
  }

  /** `horde_stats` per player for the wave that just ended; the counters restart for the next. */
  private logHordeStats(wave: number): void {
    for (const [playerId, s] of this.hordeStats) {
      const avgBytes = s.framesSent === 0 ? 0 : Math.round(s.bytesSent / s.framesSent);
      this.log.info({ wave, playerId, framesSent: s.framesSent, framesSkipped: s.framesSkipped, avgBytes }, "horde_stats");
      s.framesSent = 0;
      s.framesSkipped = 0;
      s.bytesSent = 0;
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
    this.broadcast(S2C.SERVER_SHUTDOWN_STARTED, { message: TICK_ERROR_MESSAGE });
    void this.disconnect();
  }

  /** Stop or redeploy (Story 2.2 AC 5): tell everyone, then close with 4001. Autosave is Epic 8. */
  override onBeforeShutdown(): void {
    this.broadcast(S2C.SERVER_SHUTDOWN_STARTED, { message: SERVER_RESTARTING_MESSAGE });
    this.log.info("room_shutdown");
    this.disconnect(CloseCode.SERVER_SHUTDOWN).catch(() => {});
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
    this.resumeTimer?.clear();
    this.resumeTimer = null;
  }

  override onDispose(): void {
    this.clearHolds();
    reservedCodes.delete(this.roomId);
    this.controller = null;
    this.log.info("room_disposed");
  }

  /** `input.send` (already validated and rate-limited): queued for the World (lobby: ignored). */
  /**
   * Story 2.12 re-review M-B: an `input.send` the rate bucket dropped (an honest burst after a stall).
   * Only seq and edge flags are read; the controller counts the seq as received and carries the edges.
   */
  onInputRateDropped(client: RunClient, message: unknown): void {
    const member = this.members.get(client.sessionId);
    if (member) this.controller?.rateDroppedInput(member.playerId, message);
  }

  onInput(client: RunClient, input: PlayerInput): void {
    const member = this.members.get(client.sessionId);
    if (!member) return;
    // Story 8.1 (AC 2): inputs again on the same socket after a quiet hold: the seat returns (F4) first.
    // A late input made while the line was down (F7: `isStaleInput`) is no sign of life.
    if (this.holds.get(member.playerId)?.reason === "quiet" && this.controller && !this.controller.isStaleInput(input)) this.endHold(member, "input");
    this.controller?.queueInput(member.playerId, input);
  }
}
