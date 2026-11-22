import { randomBytes } from "node:crypto";
import {
  CloseCode,
  Room,
  ServerError,
  matchMaker,
  type AuthContext,
  type Client,
  type Delayed,
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
  buildingPlaceSchema,
  encodeNetEvent,
  isTestScenario,
  joinOptionsSchema,
  loadDevBalance,
  parseDevScale,
  lobbyReturnSchema,
  lobbySetReadySchema,
  netPongSchema,
  parseWaveMix,
  playerInputSchema,
  runStartSchema,
  spectateTarget,
  startBlocker,
  zombieNetId,
  type BuildingPlace,
  type BuildingRefused,
  type JoinRefusal,
  type NetEvent,
  type NetEventContext,
  type NetPinged,
  type PlayerInput,
  type PlayerLeft,
  type PlayerLeftReason,
  type RunJoined,
  type SimEvent,
  type SimEventsFlushed,
  type TestScenario,
  type World,
} from "@topdown/shared";
import type { Logger } from "pino";
import { HordeEncoder, newHordeStats, type HordeStats } from "../net/hordeEncoder";
import { MAX_CLIENT_MESSAGE_BYTES } from "../net/limits";
import { MessageGuard } from "../net/messageGuard";
import { roomCreateLimiter } from "../net/rateLimit";
import { log, roomLog } from "../ops/logger";
import { assignSlot, hashGuestToken, nextHost, type Member } from "../run/lobby";
import { RunController } from "../run/RunController";
import { SLOW_PATCH_MESSAGE, SlowTickWatch } from "../run/slowTick";
import { resetRunFields, syncState } from "./schema/syncState";
import { uniqueRoomCode } from "./roomCode";
import { PlayerState, RunState } from "./schema/RunState";

/**
 * The balance this server runs; clients must send the same `balance.version` (AC 4). Dev/test only
 * (Epic 2 retro A5): `DEV_ZOMBIE_DAMAGE_SCALE=0.1` scales zombie damage for browser checks; a dev
 * client opened with `?zdmg=0.1` builds the same balance (same version), so it can still join.
 */
export const serverBalance = loadDevBalance({ zombieDamageScale: parseDevScale(process.env.DEV_ZOMBIE_DAMAGE_SCALE) });
if (process.env.DEV_ZOMBIE_DAMAGE_SCALE) log.warn({ scale: process.env.DEV_ZOMBIE_DAMAGE_SCALE, version: serverBalance.version }, "dev_balance_override");

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
  /** sessionId → byte counters (Story 2.10, `net_stats`). */
  readonly netMeters = new Map<string, NetMeters>();
  /** Story 2.10: when the current wave started (or the run, before the first wave), and its most zombies alive. */
  private waveStartMs = 0;
  private peakZombiesAlive = 0;
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
    this.takeScenario(options as { scenario?: unknown; allowTestScenarios?: unknown });
    this.maxClients = MAX_PLAYERS;
    this.patchRate = PATCH_RATE_MS;
    // Only reachable by its code (joinById), never by a "join any run" matchmaking call.
    await this.setPrivate(true, false);
    this.setState(new RunState({ phase: "lobby", hostSlot: 0 }));

    this.onMessage(C2S.INPUT_SEND, this.net.guard(playerInputSchema, (c, input) => this.onInput(c, input), "input"));
    this.onMessage(C2S.LOBBY_SET_READY, this.net.guard(lobbySetReadySchema, (c, m) => this.onSetReady(c, m.ready)));
    this.onMessage(C2S.RUN_START, this.net.guard(runStartSchema, (c) => this.onStart(c)));
    this.onMessage(C2S.NET_PONG, this.net.guard(netPongSchema, (c, m) => this.onPong(c, m.id)));
    this.onMessage(C2S.LOBBY_RETURN, this.net.guard(lobbyReturnSchema, (c) => this.onLobbyReturn(c)));
    this.onMessage(C2S.BUILD_SET_READY, this.net.guard(buildSetReadySchema, (c, m) => this.onBuildReady(c, m.ready)));
    this.onMessage(C2S.BUILDING_PLACE, this.net.guard(buildingPlaceSchema, (c, m) => this.onPlaceBuilding(c, m)));
    this.onMessage("*", (client) => this.net.unknown(client));
  }

  /** Story 2.10: the creator's `scenario`, honoured only when the server allows test scenarios. */
  private takeScenario(options: { scenario?: unknown; allowTestScenarios?: unknown }): void {
    if (options.scenario === undefined) return;
    if (!isTestScenario(options.scenario)) return; // onAuth refused anything else already
    if (options.allowTestScenarios === true) this.scenario = options.scenario;
    else this.log.warn({ scenario: options.scenario }, "test_scenario_refused");
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
    this.countBytes(client);
    client.send(S2C.RUN_JOINED, { playerId, slot, tickRateHz: TICK_RATE_HZ } satisfies RunJoined);
    // A frame over maxPayload is refused by ws, which closes this socket (AC 5 "too large").
    client.ref.on("error", (e: { code?: string }) => {
      if (e.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") this.net.drop(client, "too_large");
    });
    this.log.info({ playerId, slot }, "player_joined");
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
    if (member === undefined) return;
    const { playerId, slot, name } = member;
    this.members.delete(client.sessionId); // frees the slot
    this.state.players.delete(playerId);
    this.controller?.removePlayer(playerId);
    this.hordeStats.delete(playerId); // no zero horde_stats lines for a player who left
    this.lastPongId.delete(client.sessionId);
    this.netMeters.delete(client.sessionId);
    const reason: PlayerLeftReason = code === CloseCode.CONSENTED ? "left" : "disconnected";
    this.log.info({ playerId, reason, code, wave: this.controller?.world.waves.number ?? 0 }, "player_left");
    this.broadcast(S2C.PLAYER_LEFT, { playerId, name, reason } satisfies PlayerLeft);
    // The longest-connected member takes over as host (lobby and mid-run alike).
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
    const runSeed = randomUint32();
    this.runSeed = runSeed;
    const controller = new RunController({
      balance: serverBalance,
      seed: runSeed,
      players,
      pauseWaves: process.env.DEV_NO_WAVES === "1",
      // Story 3.9 dev hook (until 3.10): e.g. DEV_WAVE_MIX=walker,crawler mixes Crawlers into waves.
      waveMix: parseWaveMix(process.env.DEV_WAVE_MIX, serverBalance),
      scenario: this.scenario,
    });
    this.controller = controller;
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
   * "build" and "wave" step the World (Story 3.1): after a team wipe (Results) nothing moves any more
   * (Story 2.8).
   */
  onTick(): void {
    const controller = this.controller;
    const phase = this.state.phase;
    if (!controller || this.shuttingDown || (phase !== "build" && phase !== "wave")) return;
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
      else if (e.type === "wave.ended") this.logWaveStats(e.number);
      else if (e.type === "team.wiped") this.endRun(controller, e.wave);
    }
    this.tickErrors = 0;
  }

  /**
   * Team wipe (Story 2.8 AC 4): the run ends for everyone. `team.wiped` was already forwarded this
   * tick; the World's run state machine already went to "results" (Story 3.1 `endRun`), and the
   * patch with phase "results" follows. The World stays as it was (no more ticks).
   */
  private endRun(controller: RunController, wave: number): void {
    this.state.phase = "results"; // syncState already copied it from the World; kept explicit
    this.state.resultWave = wave;
    const kills: Record<string, number> = {};
    const earned: Record<string, number> = {};
    for (const [playerId, p] of controller.world.players) {
      kills[playerId] = controller.kills(playerId);
      earned[playerId] = p.earned; // Story 3.2 (3.10 compares it with the GDD target)
    }
    this.log.info({ runSeed: this.runSeed, wave, kills, earned }, "run_ended");
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
