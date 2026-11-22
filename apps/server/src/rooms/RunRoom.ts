import { randomBytes } from "node:crypto";
import {
  CloseCode,
  Room,
  ServerError,
  matchMaker,
  type AuthContext,
  type Client,
  type RoomException,
  type RoomMethodName,
} from "@colyseus/core";
import {
  C2S,
  MAX_PLAYERS,
  S2C,
  TICK_RATE_HZ,
  encodeNetEvent,
  joinOptionsSchema,
  loadBalance,
  lobbySetReadySchema,
  netPongSchema,
  playerInputSchema,
  runStartSchema,
  startBlocker,
  type JoinRefusal,
  type NetEvent,
  type NetEventContext,
  type NetPinged,
  type PlayerInput,
  type RunJoined,
  type SimEvent,
  type SimEventsFlushed,
} from "@topdown/shared";
import type { Logger } from "pino";
import { MAX_CLIENT_MESSAGE_BYTES } from "../net/limits";
import { MessageGuard } from "../net/messageGuard";
import { roomCreateLimiter } from "../net/rateLimit";
import { log, roomLog } from "../ops/logger";
import { assignSlot, hashGuestToken, nextHost, type Member } from "../run/lobby";
import { RunController } from "../run/RunController";
import { SlowTickWatch } from "../run/slowTick";
import { syncState } from "./schema/syncState";
import { uniqueRoomCode } from "./roomCode";
import { PlayerState, RunState } from "./schema/RunState";

/** The balance this server runs; clients must send the same `balance.version` (AC 4). */
export const serverBalance = loadBalance();

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
}

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
  /** The fight (Story 2.4): set when the run starts; the room is its only writer. */
  controller: RunController | null = null;
  /** Tick durations; logs `slow_tick` (AC 5). */
  slowTicks: SlowTickWatch | null = null;
  private eventCtx: NetEventContext | null = null;
  private tickErrors = 0;
  private shuttingDown = false;
  /** Latest `net.pinged` id; send times of the last PING_HISTORY ids (slot `id % PING_HISTORY`). */
  private pingId = 0;
  private readonly pingSentAtMs = new Float64Array(PING_HISTORY);
  /** sessionId → highest ping id it answered: each id counts once, and an older id after a newer one is ignored. */
  private readonly lastPongId = new Map<string, number>();

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
    if (!parsed.success) throw refuse("invalid_options");
    if (parsed.data.balanceVersion !== serverBalance.version) throw refuse("balance_mismatch");
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
    this.maxClients = MAX_PLAYERS;
    this.patchRate = PATCH_RATE_MS;
    // Only reachable by its code (joinById), never by a "join any run" matchmaking call.
    await this.setPrivate(true, false);
    this.setState(new RunState({ phase: "lobby", hostSlot: 0 }));

    this.onMessage(C2S.INPUT_SEND, this.net.guard(playerInputSchema, (c, input) => this.onInput(c, input), "input"));
    this.onMessage(C2S.LOBBY_SET_READY, this.net.guard(lobbySetReadySchema, (c, m) => this.onSetReady(c, m.ready)));
    this.onMessage(C2S.RUN_START, this.net.guard(runStartSchema, (c) => this.onStart(c)));
    this.onMessage(C2S.NET_PONG, this.net.guard(netPongSchema, (c, m) => this.onPong(c, m.id)));
    this.onMessage("*", (client) => this.net.unknown(client));
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
    // Joins only in the lobby; Story 8.2 opens Build-phase joins.
    if (this.state.phase !== "lobby") throw refuse("run_started");
    const auth = client.auth;
    if (!auth) throw refuse("invalid_options");
    for (const m of this.members.values()) if (m.guestTokenHash === auth.guestTokenHash) throw refuse("already_joined");
    const slot = assignSlot(Array.from(this.members.values(), (m) => m.slot));
    if (slot < 0) throw refuse("invalid_options"); // unreachable: maxClients locks the room at 4
    const playerId = `p${slot}`;
    const member: Member = {
      playerId,
      slot,
      sessionId: client.sessionId,
      name: auth.name,
      guestTokenHash: auth.guestTokenHash,
      joinOrder: ++this.joinCounter, // a counter, not the clock: a clock jump can't reorder hosts
      rttMs: 0,
    };
    // The creator is host (slot 0); later joiners never take it over.
    if (this.members.size === 0) this.state.hostSlot = slot;
    this.members.set(client.sessionId, member);
    this.state.players.set(playerId, new PlayerState({ slot, name: auth.name, ready: false }));
    this.net.add(client, playerId);
    client.send(S2C.RUN_JOINED, { playerId, slot, tickRateHz: TICK_RATE_HZ } satisfies RunJoined);
    // A frame over maxPayload is refused by ws, which closes this socket (AC 5 "too large").
    client.ref.on("error", (e: { code?: string }) => {
      if (e.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") this.net.drop(client, "too_large");
    });
    this.log.info({ playerId, slot }, "player_joined");
  }

  override onLeave(client: RunClient, code?: number): void {
    const member = this.members.get(client.sessionId);
    this.net.remove(client);
    if (member === undefined) return;
    const { playerId, slot } = member;
    this.members.delete(client.sessionId); // frees the slot
    this.state.players.delete(playerId);
    // Mid-run: out of the World too; zombies retarget next tick. Reconnect is Epic 8, "left" is 2.11.
    this.controller?.removePlayer(playerId);
    this.lastPongId.delete(client.sessionId);
    this.log.info({ playerId, code }, "player_left");
    // Epic 8 handles a host leaving mid-run.
    const host = slot === this.state.hostSlot ? nextHost(this.members.values()) : undefined;
    if (host) {
      this.state.hostSlot = host.slot;
      this.log.info({ playerId: host.playerId, slot: host.slot }, "host_changed");
    }
  }

  /** `lobby.set_ready`: the sender's own flag, lobby only. */
  onSetReady(client: RunClient, ready: boolean): void {
    if (this.state.phase !== "lobby") return;
    const member = this.members.get(client.sessionId);
    const player = member && this.state.players.get(member.playerId);
    if (player) player.ready = ready;
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
    this.state.phase = "wave";
    this.startRun();
  }

  /** Builds the World from the members (join order, `teamSpawnPoint` by slot) and starts the 20 Hz loop. */
  private startRun(): void {
    const players = Array.from(this.members.values(), (m) => ({ playerId: m.playerId, slot: m.slot }));
    const runSeed = randomUint32();
    const controller = new RunController({
      balance: serverBalance,
      seed: runSeed,
      players,
      pauseWaves: process.env.DEV_NO_WAVES === "1",
    });
    this.controller = controller;
    const zombies = controller.world.zombies;
    this.eventCtx = { balance: serverBalance, zombieNetId: (id) => id | ((zombies.generation[id] ?? 0) << 8) };
    this.slowTicks = new SlowTickWatch(this.roomId, this.log, () => performance.now());
    syncState(this.state, controller); // spawn positions in the same patch as phase "wave"
    // 0.18 fixed timestep: at most 5 catch-up steps, then the backlog is dropped.
    this.setFixedTimestep(() => this.onTick(), TICK_RATE_HZ);
    this.clock.setInterval(() => this.ping(), PING_INTERVAL_MS);
    this.log.info({ runSeed, players: players.length }, "run_started");
  }

  /** One server tick: step, copy to schema, forward events. The patch goes out between ticks. */
  onTick(): void {
    const controller = this.controller;
    if (!controller || this.shuttingDown) return;
    const t0 = performance.now();
    const events = controller.tick();
    syncState(this.state, controller);
    this.forwardEvents(controller.world.tick, events);
    // Story 2.5: send horde frames here.
    this.slowTicks?.observe(performance.now() - t0, controller.world.tick);
    this.tickErrors = 0;
  }

  /** One reliable `sim.events_flushed` per tick that has events, in emit order. */
  private forwardEvents(tick: number, events: readonly SimEvent[]): void {
    const ctx = this.eventCtx;
    if (events.length === 0 || !ctx) return;
    const out: NetEvent[] = [];
    for (let i = 0; i < events.length; i++) {
      const t = encodeNetEvent(events[i] as SimEvent, ctx);
      if (t) out.push(t);
    }
    if (out.length > 0) this.broadcast(S2C.SIM_EVENTS_FLUSHED, { tick, events: out } satisfies SimEventsFlushed);
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

  override onDispose(): void {
    reservedCodes.delete(this.roomId);
    this.controller = null;
    this.log.info("room_disposed");
  }

  /** `input.send` (already validated and rate-limited): queued for the World (lobby: ignored). */
  onInput(client: RunClient, input: PlayerInput): void {
    const member = this.members.get(client.sessionId);
    if (member) this.controller?.queueInput(member.playerId, input);
  }
}
