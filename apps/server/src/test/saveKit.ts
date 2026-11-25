/**
 * Stories 8.4–8.6 test kit: a real server with a PGlite database, accounts with tickets, and a run driven to a build
 * phase / a wave. Used by `RunRoom.save.test.ts` and `RunRoom.resume.test.ts`.
 */
import { randomBytes } from "node:crypto";
import type { Room as SdkRoom } from "@colyseus/sdk";
import type { ColyseusTestServer } from "@colyseus/testing";
import { BYTES, C2S, DOWNTOWN_MAP, NET_PROTOCOL_VERSION, RUN_ROOM_NAME, S2C, type RunStateView } from "@topdown/shared";
import { expect, vi } from "vitest";
import { signTicket } from "../auth/ticket";
import { accountsRepo } from "../db/accountsRepo";
import type { Database } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { hashGuestToken } from "../run/lobby";
import type { RunRoom } from "../rooms/RunRoom";
import { serverBalance } from "../rooms/RunRoom";

export const SAVE_SECRET = "save-secret-".padEnd(48, "s");
export type RunSdkRoom = SdkRoom<unknown, RunStateView>;
export const hex = (): string => randomBytes(16).toString("hex");

export interface Player {
  readonly name: string;
  readonly accountId: string | null;
  readonly token: string;
}

export async function newPlayer(database: Database, name: string, withAccount = true): Promise<Player> {
  const accountId = withAccount ? (await accountsRepo(database).createGuest(randomBytes(32).toString("hex"), name)).id : null;
  return { name, accountId, token: hex() };
}

export function joinOptions(intent: "create" | "join" | "resume", p: Player, extra: Record<string, unknown> = {}) {
  return {
    intent,
    name: p.name,
    balanceVersion: serverBalance.version,
    mapVersion: DOWNTOWN_MAP.version,
    netProtocolVersion: NET_PROTOCOL_VERSION,
    guestToken: p.token,
    ...(p.accountId ? { ticket: signTicket(p.accountId, hashGuestToken(p.token), SAVE_SECRET) } : {}),
    ...extra,
  };
}

/** What a client received that the save tests look at. */
export interface Inbox {
  saved: { expiresAt: string }[];
  failed: number;
  shutdown: string[];
  closes: number[];
}

export function listen(c: RunSdkRoom): Inbox {
  const got: Inbox = { saved: [], failed: 0, shutdown: [], closes: [] };
  for (const t of [BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.PLAYER_LEFT, S2C.SHOP_OFFERED, S2C.RUN_JOINED, S2C.RUN_STARTED, S2C.RUN_REWARDS]) c.onMessage(t, () => {});
  c.onMessage(S2C.RUN_SAVED, (m: { expiresAt: string }) => got.saved.push(m));
  c.onMessage(S2C.RUN_SAVE_FAILED, () => got.failed++);
  c.onMessage(S2C.SERVER_SHUTDOWN_STARTED, (m: { message: string }) => got.shutdown.push(m.message));
  c.onLeave((code: number) => got.closes.push(code));
  return got;
}

export interface Lobby {
  readonly clients: RunSdkRoom[];
  readonly inbox: Inbox[];
  readonly room: RunRoom;
}

/** Everyone in one lobby: the first creates (or resumes `savedRunId`), the rest join by code. */
export async function lobby(colyseus: ColyseusTestServer, players: readonly Player[], savedRunId?: string): Promise<Lobby> {
  const [first, ...rest] = players as [Player, ...Player[]];
  const host = savedRunId ? await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, joinOptions("resume", first, { savedRunId })) : await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, joinOptions("create", first));
  const clients = [host];
  const inbox = [listen(host)];
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  room.bankRetryMs = 20;
  for (const p of rest) {
    const c = await colyseus.sdk.joinById<RunStateView>(host.roomId, joinOptions("join", p));
    inbox.push(listen(c));
    await c.waitForInitialState();
    clients.push(c);
  }
  return { clients, inbox, room };
}

/** Ready → Start → the first build phase (or the restored calm phase). */
export async function start(l: Lobby): Promise<void> {
  for (const c of l.clients) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...l.room.members.values()].every((m) => l.room.state.players.get(m.playerId)?.ready)).toBe(true));
  l.clients[0]!.send(C2S.RUN_START, {});
  await vi.waitFor(() => expect(l.room.controller?.world.run.phase === "build" || l.room.controller?.world.run.phase === "vote").toBe(true));
}

export const supplies = async (database: Database, accountId: string): Promise<number> => (await progressRepo(database).get(accountId))?.supplies ?? 0;
