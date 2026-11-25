import { randomBytes } from "node:crypto";
import type { Room as SdkRoom } from "@colyseus/sdk";
import type { ColyseusTestServer } from "@colyseus/testing";
import { BYTES, C2S, DOWNTOWN_MAP, RUN_ROOM_NAME, S2C, downPlayer, runRewardsSchema, type RunRewards, type RunStateView } from "@topdown/shared";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { signTicket } from "../auth/ticket";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/**
 * Story 7.2 (AC 3, 4, 5, 8; S2, S3, S6, brief 18): banking in a real room — the run end banks each member once,
 * a consented Leave banks at once (`quit`) and nothing again at the run end, a member without an account gets
 * `not_saved`, the in-run wallet is never touched, and `run.rewards` carries the server's numbers.
 */
const SECRET = "rewards-secret-".padEnd(48, "w");
let colyseus: ColyseusTestServer;
let database: Database;

beforeAll(async () => {
  database = openPglite();
  ({ colyseus } = await bootTestServer({ database, sessionSecret: SECRET }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

type RunSdkRoom = SdkRoom<unknown, RunStateView>;
const hex = (): string => randomBytes(16).toString("hex");

async function newAccount(): Promise<string> {
  return (await accountsRepo(database).createGuest(randomBytes(32).toString("hex"), "")).id;
}
const options = (intent: "create" | "join", name: string, accountId: string | null) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  guestToken: hex(),
  ...(accountId ? { ticket: signTicket(accountId, SECRET) } : {}),
});
function listen(c: RunSdkRoom): RunRewards[] {
  const got: RunRewards[] = [];
  for (const t of [BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.PLAYER_LEFT, S2C.SHOP_OFFERED, S2C.RUN_JOINED]) c.onMessage(t, () => {});
  c.onMessage(S2C.RUN_REWARDS, (m: unknown) => got.push(runRewardsSchema.parse(m)));
  return got;
}

/** Players (with or without an account) in a run, in wave 1. */
async function toWave(accounts: (string | null)[]) {
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana", accounts[0] ?? null));
  const clients = [host];
  const inbox = [listen(host)];
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  room.bankRetryMs = 20;
  for (let i = 1; i < accounts.length; i++) {
    const c = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", `P${i}`, accounts[i] ?? null));
    inbox.push(listen(c));
    await c.waitForInitialState();
    clients.push(c);
  }
  for (const c of clients) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  await vi.waitFor(() => expect(room.state.phase).toBe("build"));
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  w.debug.bossWaves = [];
  for (const c of clients) c.send(C2S.BUILD_SET_READY, { ready: true });
  await vi.waitFor(() => expect(w.run.phase).toBe("wave"));
  return { clients, inbox, room, w };
}
const idOf = (room: RunRoom, c: RunSdkRoom): string => room.members.get(c.sessionId)?.playerId ?? "";
async function rewardRows(accountId: string): Promise<number> {
  const db = await database.db();
  const r = (await db.execute(sql`select count(*)::int as n from run_rewards where account_id = ${accountId}`)) as unknown as { rows: { n: number }[] };
  return r.rows[0]?.n ?? 0;
}
const supplies = async (accountId: string) => (await progressRepo(database).get(accountId))?.supplies ?? -1;

describe("Story 7.2: banking in the room", () => {
  it("S1/S6: a wipe in wave 1 banks each member once from the server's record (rookie × 2), sends run.rewards, wallets untouched", async () => {
    const [a, b] = [await newAccount(), await newAccount()];
    const { clients, inbox, room, w } = await toWave([a, b]);
    const info = vi.spyOn(room.log, "info");
    const wallets = [...w.players.values()].map((p) => p.wallet);
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    for (const got of inbox) await vi.waitFor(() => expect(got.length).toBe(1));
    for (const got of inbox) {
      expect(got[0]).toMatchObject({ runId: room.bank?.runId, seed: room.state.runSeed, status: "saved", lines: { waves: 10, boss: 0, extract: 0 }, waveCount: 1, rookie: true, total: 20, newTotal: 20 });
    }
    expect(await supplies(a)).toBe(20);
    expect(await supplies(b)).toBe(20);
    expect([await rewardRows(a), await rewardRows(b)]).toEqual([1, 1]);
    expect([...w.players.values()].map((p) => p.wallet)).toEqual(wallets); // the in-run money is never touched
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: room.bank?.runId, ending: "wiped" }), "run_ended");
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: room.bank?.runId, supplies: { [idOf(room, clients[0]!)]: 20, [idOf(room, clients[1]!)]: 20 } }), "run_supplies"));
    // brief 18: the same run end again (a double endRun) pays nothing more
    (room as unknown as { endRun(c: unknown, wave: number): void }).endRun(room.controller, 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(await supplies(a)).toBe(20);
    expect(await rewardRows(a)).toBe(1);
  });

  it("a member without an account gets not_saved at once; the account member is saved", async () => {
    const a = await newAccount();
    const { inbox, room, w } = await toWave([a, null]);
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    await vi.waitFor(() => expect(inbox[1]!.length).toBe(1));
    expect(inbox[1]![0]!.status).toBe("not_saved");
    await vi.waitFor(() => expect(inbox[0]![0]?.status).toBe("saved"));
  });

  it("S3/D4: run.leave mid-wave banks at once (quit) and the reply reaches the leaver; after the Leave the run end banks nothing more for them", async () => {
    const [a, b] = [await newAccount(), await newAccount()];
    const { clients, inbox, room, w } = await toWave([a, b]);
    const guest = clients[1]!;
    const guestId = idOf(room, guest);
    w.players.get(guestId)!.wavesIn = 3; // as if three waves had ended with the guest in the run
    guest.send(C2S.RUN_LEAVE, {});
    await vi.waitFor(() => expect(inbox[1]!.length).toBe(1));
    expect(inbox[1]![0]).toMatchObject({ status: "saved", lines: { waves: 30, extract: 0 }, total: 60 }); // rookie × 2
    guest.send(C2S.RUN_LEAVE, {}); // a second one: the same result, no new bank
    await vi.waitFor(() => expect(inbox[1]!.length).toBe(2));
    expect(inbox[1]![1]).toEqual(inbox[1]![0]);
    await guest.leave(true);
    await vi.waitFor(() => expect(room.members.size).toBe(1));
    expect(await supplies(b)).toBe(60);
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    await vi.waitFor(() => expect(inbox[0]!.length).toBe(1));
    await new Promise((r) => setTimeout(r, 100));
    expect(await supplies(b)).toBe(60);
    expect(await rewardRows(b)).toBe(1);
  });

  it("S3: a consented Leave without run.leave still banks at once (before the state leaves the World)", async () => {
    const [a, b] = [await newAccount(), await newAccount()];
    const { clients, room, w } = await toWave([a, b]);
    w.players.get(idOf(room, clients[1]!))!.wavesIn = 2;
    await clients[1]!.leave(true);
    await vi.waitFor(async () => expect(await supplies(b)).toBe(40));
    expect(await rewardRows(b)).toBe(1);
    expect(w.players.size).toBe(1);
  });

  it("run.leave outside a run (lobby) or from a client with a garbage body does nothing", async () => {
    const a = await newAccount();
    const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana", a));
    const got = listen(host);
    await host.waitForInitialState();
    host.send(C2S.RUN_LEAVE, {});
    host.send(C2S.RUN_LEAVE, { supplies: 99999 });
    await new Promise((r) => setTimeout(r, 150));
    expect(got).toEqual([]);
    expect(await rewardRows(a)).toBe(0);
  });

  it("the database down at the run end: retried once, then failed (Couldn't save), nothing banked, the room carries on", async () => {
    const a = await newAccount();
    const { inbox, room, w } = await toWave([a]);
    const repo = progressRepo(database);
    const { setRoomAccounts } = await import("../auth/roomAccounts");
    const failing = { ...repo, addSupplies: () => Promise.reject(new Error("db down")) };
    const restore = { sessionSecret: SECRET, accounts: accountsRepo(database), progress: progressRepo(database) };
    setRoomAccounts({ ...restore, progress: failing });
    try {
      const err = vi.spyOn(room.log, "error");
      for (const p of w.players.values()) downPlayer(w, p);
      await vi.waitFor(() => expect(inbox[0]!.length).toBe(1));
      expect(inbox[0]![0]!.status).toBe("failed");
      expect(err.mock.calls.filter((c) => c[1] === "supplies_bank_failed").length).toBe(2);
      expect(await supplies(a)).toBe(0);
      expect(await rewardRows(a)).toBe(0);
    } finally {
      setRoomAccounts(restore);
    }
  });
});
