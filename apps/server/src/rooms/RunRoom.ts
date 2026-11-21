import { CloseCode, Room, ServerError, matchMaker, type AuthContext, type Client } from "@colyseus/core";
import {
  C2S,
  joinOptionsSchema,
  loadBalance,
  playerInputSchema,
  S2C,
  type JoinRefusal,
  type PlayerInput,
} from "@topdown/shared";
import type { Logger } from "pino";
import { MAX_CLIENT_MESSAGE_BYTES } from "../net/limits";
import { MessageGuard } from "../net/messageGuard";
import { roomCreateLimiter } from "../net/rateLimit";
import { log, roomLog } from "../ops/logger";
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
}

export type RunClient = Client<{ auth: RunAuth }>;

/** Players per run (architecture › Run Room Rules). */
const MAX_PLAYERS = 4;
/** State patches every 50 ms (20 Hz, the simulation rate). */
const PATCH_RATE_MS = 50;

/** Codes picked by rooms still being created (not yet visible to `getLocalRoomById`). */
const reservedCodes = new Set<string>();

const refuse = (reason: JoinRefusal): ServerError => new ServerError(JOIN_REFUSED_CODE, reason);

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
  /** sessionId → player id. */
  private readonly playerIds = new Map<string, string>();

  /** Validates join options before a seat is reserved (runs for create and join). */
  static override async onAuth(_token: string, options: unknown, ctx: AuthContext): Promise<RunAuth> {
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
    return { name: parsed.data.name, ip: ctx.ip };
  }

  override async onCreate(options: { intent?: unknown }): Promise<void> {
    if (options.intent !== "create") throw refuse("invalid_options");
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
    this.onMessage("*", (client) => this.net.drop(client, "unknown_type"));
  }

  override onJoin(client: RunClient): void {
    // Story 2.3 adds joining by code, slots and the host hand-over; until then the creator is alone.
    if (this.playerIds.size > 0) throw refuse("invalid_options");
    const slot = 0;
    const playerId = `p${slot}`;
    const name = client.auth?.name ?? "";
    this.playerIds.set(client.sessionId, playerId);
    this.state.players.set(playerId, new PlayerState({ slot, name }));
    this.state.hostSlot = slot;
    this.net.add(client, playerId);
    // A frame over maxPayload is refused by ws, which closes this socket (AC 5 "too large").
    client.ref.on("error", (e: { code?: string }) => {
      if (e.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") this.net.drop(client, "too_large");
    });
    this.log.info({ playerId, slot }, "player_joined");
  }

  override onLeave(client: RunClient, code?: number): void {
    const playerId = this.playerIds.get(client.sessionId);
    this.net.remove(client);
    if (playerId === undefined) return;
    this.playerIds.delete(client.sessionId);
    this.state.players.delete(playerId);
    this.log.info({ playerId, code }, "player_left");
  }

  /** Stop or redeploy (Story 2.2 AC 5): tell everyone, then close with 4001. Autosave is Epic 8. */
  override onBeforeShutdown(): void {
    this.broadcast(S2C.SERVER_SHUTDOWN_STARTED, { message: SERVER_RESTARTING_MESSAGE });
    this.log.info("room_shutdown");
    this.disconnect(CloseCode.SERVER_SHUTDOWN).catch(() => {});
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
