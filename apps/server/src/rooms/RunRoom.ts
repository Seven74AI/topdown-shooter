import { Room, ServerError, matchMaker, type AuthContext, type Client } from "@colyseus/core";
import {
  C2S,
  MAX_PLAYERS,
  S2C,
  TICK_RATE_HZ,
  joinOptionsSchema,
  loadBalance,
  lobbySetReadySchema,
  playerInputSchema,
  runStartSchema,
  startBlocker,
  type JoinRefusal,
  type PlayerInput,
  type RunJoined,
} from "@topdown/shared";
import type { Logger } from "pino";
import { MAX_CLIENT_MESSAGE_BYTES } from "../net/limits";
import { MessageGuard } from "../net/messageGuard";
import { roomLog } from "../ops/logger";
import { assignSlot, hashGuestToken, nextHost, type Member } from "../run/lobby";
import { uniqueRoomCode } from "./roomCode";
import { PlayerState, RunState } from "./schema/RunState";

/** The balance this server runs; clients must send the same `balance.version` (AC 4). */
export const serverBalance = loadBalance();

/** HTTP-ish status for every join refusal; the message is the `JoinRefusal` reason. */
export const JOIN_REFUSED_CODE = 526;

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
  /** See `RunRoomOptions`; tests may flip it on a live room. */
  allowSoloStart = false;

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
      joinedAtMs: Date.now(),
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
    this.log.info({ playerId, code }, "player_left");
    // Story 2.4 also removes the player from the World here; Epic 8 handles a host leaving mid-run.
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
    // Story 2.4 hooks the RunController into this exact transition; until then nothing simulates.
    this.state.phase = "wave";
    this.log.info({ players: this.members.size }, "run_started");
  }

  override onDispose(): void {
    reservedCodes.delete(this.roomId);
    this.log.info("room_disposed");
  }

  /** `input.send` (already validated and rate-limited). Story 2.4 queues it for the World. */
  onInput(client: RunClient, input: PlayerInput): void {
    void client; // Story 2.4: controller.queueInput(playerId, input)
    void input;
  }
}
