import { Callbacks, Client, type Room } from "@colyseus/sdk";
import {
  DOWNTOWN_MAP,
  NET_PROTOCOL_VERSION,
  RUN_ROOM_NAME,
  err,
  isRoomCode,
  normalizeRoomCode,
  ok,
  type JoinOptions,
  type PlayerStateView,
  type RecoveryJoin,
  type Result,
  type RunStateView,
} from "@topdown/shared";
import { JOIN_ERROR_TEXT, joinErrorText } from "./joinErrors";
import { clientBalance } from "../debug/clientBalance";
import { getGuestToken } from "./guestToken";
import { netMeter } from "./netMeter";
import { urlOptions } from "../debug/urlOptions";

/** A connected run room; `state` is read through the plain views from shared. */
export type RunConnection = Room<unknown, RunStateView>;

/**
 * The game server, always on the page's own origin under `/api` (the Vite proxy in dev, Caddy in
 * production, Story 2.2), so a phone on the same Wi-Fi works too. `VITE_SERVER_URL` overrides it.
 */
export function serverUrl(): string {
  const override = import.meta.env.VITE_SERVER_URL as string | undefined;
  return override ?? `${location.origin}/api`;
}

let client: Client | null = null;
let balanceVersion: string | null = null;

const sdk = (): Client => (client ??= new Client(serverUrl()));
/** The bundled balance version (or the dev `?zdmg` one, retro A5); the server refuses any other one (AC 4). */
const clientBalanceVersion = (): string => (balanceVersion ??= clientBalance().version);

const options = (intent: JoinOptions["intent"], name: string): JoinOptions => {
  const o: JoinOptions = { intent, name, balanceVersion: clientBalanceVersion(), mapVersion: DOWNTOWN_MAP.version, netProtocolVersion: NET_PROTOCOL_VERSION, guestToken: getGuestToken() };
  // Story 2.10: `?scenario=net150` on the host's create asks for the fixed test scenario.
  const scenario = urlOptions().scenario;
  if (intent === "create" && scenario) o.scenario = scenario;
  // Story 4.4 (dev builds only): `?seed=` on the host's create asks for that run seed (DEV_ALLOW_RUN_SEED=1).
  const runSeed = urlOptions().runSeed;
  if (import.meta.env.DEV && intent === "create" && runSeed !== null) o.devRunSeed = runSeed;
  return o;
};

/** Story 2.10: the overlay's byte counters follow the room just joined. */
const counted = (room: RunConnection): RunConnection => {
  netMeter.attach(room as unknown as Parameters<typeof netMeter.attach>[0]);
  return room;
};

/** Creates a run (Story 2.1). The error is player text from `joinErrorText`. */
export async function createGame(name: string): Promise<Result<RunConnection, string>> {
  try {
    const room = await sdk().create<RunStateView>(RUN_ROOM_NAME, options("create", name));
    return ok(counted(room as RunConnection));
  } catch (e) {
    return err(joinErrorText(e));
  }
}

/**
 * Joins a run by its code (Story 2.3). A code that can't exist is "Game not found" without asking
 * the server. The error is player text from `joinErrorText`.
 */
export async function joinGame(code: string, name: string): Promise<Result<RunConnection, string>> {
  const roomId = normalizeRoomCode(code);
  if (!isRoomCode(roomId)) return err(JOIN_ERROR_TEXT.notFound);
  try {
    const room = await sdk().joinById<RunStateView>(roomId, options("join", name));
    return ok(counted(room as RunConnection));
  } catch (e) {
    return err(joinErrorText(e));
  }
}

/**
 * Story 8.1 (AC 6, 9): what a takeover join's failure means for the seat. `seat_kept`: the hold ran
 * out, the seat waits for a build phase (D4); a refusal that can never change (`run_started`: no seat
 * of mine here; the room is gone; another version) is `gone`; anything else (no answer: the line is
 * still cut, a proxy error, the rate limit) is `network` and is tried again.
 */
export function recoveryFailure(e: unknown): "seat_kept" | "gone" | "network" {
  if (typeof e !== "object" || e === null) return "network";
  const code = (e as { code?: unknown }).code;
  const message = String((e as { message?: unknown }).message ?? "");
  if (typeof code !== "number") return "network";
  if (message === "seat_kept") return "seat_kept";
  if (message === "run_started" || message === "balance_mismatch" || message === "invalid_options" || message === "already_joined") return "gone";
  if (code === 522 && /not found/i.test(message)) return "gone";
  return "network";
}

/**
 * Story 8.1 (AC 6): takes my seat in a started run back with a fresh join by guest token (the
 * server matches it: a held or still-open seat is taken over, a remembered one restored in a build phase).
 */
export async function rejoinGame(roomId: string, name: string): Promise<RecoveryJoin<RunConnection>> {
  try {
    const room = await sdk().joinById<RunStateView>(roomId, options("join", name));
    return { ok: true, room: counted(room as RunConnection) };
  } catch (e) {
    return { ok: false, reason: recoveryFailure(e) };
  }
}

/** Story 8.1 (AC 6): a reload's first try: the SDK's reconnection token from sessionStorage (`roomId:token`). */
export async function reconnectSeat(token: string): Promise<RunConnection | null> {
  try {
    return counted((await sdk().reconnect<RunStateView>(token)) as RunConnection);
  } catch {
    return null;
  }
}

/**
 * Calls `onChange` whenever a lobby field changes: players added or removed, a name or Ready
 * flag, `hostSlot` or `phase` (schema 5 `Callbacks`). Lives here, not in lobbyStore, so the SDK
 * stays in the lazily loaded chunk. Returns the unsubscribe.
 */
export function watchLobby(room: RunConnection, onChange: () => void): () => void {
  // The schema callback types need the decoded schema classes; the client only has plain views.
  const $ = Callbacks.get(room as unknown as Parameters<typeof Callbacks.get>[0]) as unknown as LobbyCallbacks;
  const perPlayer = new Map<PlayerStateView, (() => void)[]>();
  const offs = [
    $.listen("phase", onChange),
    $.listen("hostSlot", onChange),
    $.onAdd("players", (player: PlayerStateView) => {
      perPlayer.set(player, [$.listen(player, "ready", onChange), $.listen(player, "name", onChange)]);
      onChange();
    }),
    $.onRemove("players", (player: PlayerStateView) => {
      for (const off of perPlayer.get(player) ?? []) off();
      perPlayer.delete(player);
      onChange();
    }),
  ];
  return () => {
    for (const off of offs) off();
    for (const list of perPlayer.values()) for (const off of list) off();
    perPlayer.clear();
  };
}

/** The slice of the schema `StateCallbackStrategy` API `watchLobby` uses. */
interface LobbyCallbacks {
  listen(property: "phase" | "hostSlot", handler: () => void): () => void;
  listen(instance: PlayerStateView, property: "ready" | "name", handler: () => void): () => void;
  onAdd(property: "players", handler: (player: PlayerStateView, key: string) => void): () => void;
  onRemove(property: "players", handler: (player: PlayerStateView, key: string) => void): () => void;
}
