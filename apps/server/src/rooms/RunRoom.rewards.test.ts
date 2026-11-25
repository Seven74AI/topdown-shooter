import { randomBytes } from "node:crypto";
import type { Room as SdkRoom } from "@colyseus/sdk";
import type { ColyseusTestServer } from "@colyseus/testing";
import { endWave, LOOT_BAG, BYTES, C2S, DOWNTOWN_MAP, RUN_ROOM_NAME, S2C, downPlayer, runRewardsSchema, type RunRewards, type RunStateView, type World, NET_PROTOCOL_VERSION } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { signTicket } from "../auth/ticket";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { countRunRewards } from "../db/testQueries";
import { hashGuestToken } from "../run/lobby";
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

// Story 7.6 review L1: these tickets name made-up accounts with no device rows (seat keys / banking are tested here);
// the device-row re-check has its own tests in auth/accountAuth.test.ts.
beforeAll(async () => {
  database = openPglite();
  ({ colyseus } = await bootTestServer({ database, sessionSecret: SECRET, checkTicketRows: false }));
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
const options = (intent: "create" | "join", name: string, accountId: string | null, guestToken = hex()) => {
  return {
    intent,
    name,
    balanceVersion: serverBalance.version,
    mapVersion: DOWNTOWN_MAP.version, netProtocolVersion: NET_PROTOCOL_VERSION,
    guestToken,
    ...(accountId ? { ticket: signTicket(accountId, hashGuestToken(guestToken), SECRET) } : {}),
  };
};
/** `run.rewards` received (in order); `runIds` the `run.started` ids, and `order` both kinds as they came. */
function listen(c: RunSdkRoom): RunRewards[] & { runIds: string[]; order: string[] } {
  const got = Object.assign([] as RunRewards[], { runIds: [] as string[], order: [] as string[] });
  for (const t of [BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.PLAYER_LEFT, S2C.SHOP_OFFERED, S2C.RUN_JOINED]) c.onMessage(t, () => {});
  c.onMessage(S2C.RUN_STARTED, (m: { runId: string }) => {
    got.runIds.push(m.runId);
    got.order.push("started");
  });
  c.onMessage(S2C.RUN_REWARDS, (m: unknown) => {
    got.push(runRewardsSchema.parse(m));
    got.order.push("rewards");
  });
  return got;
}

/** Players (with or without an account) in a run, in wave 1. */
async function toWave(accounts: (string | null)[], tokens: string[] = accounts.map(() => hex())) {
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana", accounts[0] ?? null, tokens[0]));
  const clients = [host];
  const inbox = [listen(host)];
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  room.bankRetryMs = 20;
  for (let i = 1; i < accounts.length; i++) {
    const c = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", `P${i}`, accounts[i] ?? null, tokens[i]));
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
/** Review M1: the bag lies at (x, y) for the next 20 s (as if the planned kill had just dropped it). */
function bagAt(w: World, x: number, y: number): void {
  Object.assign(w.loot, { state: LOOT_BAG.OUT, x, y, dropTick: w.tick, untilTick: w.tick + 400, foundBy: null });
}
const idOf = (room: RunRoom, c: RunSdkRoom): string => room.members.get(c.sessionId)?.playerId ?? "";
const rewardRows = (accountId: string): Promise<number> => countRunRewards(database, accountId);
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
      expect(got.runIds).toEqual([room.bank?.runId]); // RR-L1: run.started at Start, before the rewards
      expect(got.order).toEqual(["started", "rewards"]);
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
    expect(inbox[1]![0]).toMatchObject({ status: "saved", lines: { waves: 30, extract: 0 }, total: 60, ending: "quit", leftWave: 1 }); // rookie × 2; review L4
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

  it("review L3: a seat dropped mid-wave (held) is banked at the run end, and when it comes back on Results it gets run.rewards again", async () => {
    const [a, b] = [await newAccount(), await newAccount()];
    const toks = [hex(), hex()];
    const { clients, inbox, room, w } = await toWave([a, b], toks);
    const guest = clients[1]!;
    const bId = idOf(room, guest);
    w.players.get(bId)!.wavesIn = 2;
    guest.reconnection.enabled = false;
    (room.clients.find((c) => c.sessionId === guest.sessionId)?.ref as unknown as { terminate(): void }).terminate(); // a drop
    await vi.waitFor(() => expect(room.holds.has(bId)).toBe(true));
    expect(await rewardRows(b)).toBe(0); // brief 17: a drop is not a Leave, nothing banked
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    await vi.waitFor(async () => expect(await rewardRows(b)).toBe(1)); // the held seat banked with the run's ending
    expect(inbox[1]!.length).toBe(0); // its socket was gone
    const back = await colyseus.sdk.joinById<RunStateView>(guest.roomId, options("join", "P1", b, toks[1]));
    const got = listen(back);
    await vi.waitFor(() => expect(got.length).toBe(1));
    expect(got[0]).toMatchObject({ status: "saved", ending: "wiped", waveCount: 3, total: 60 }); // 2 waves + the wipe wave (D8), rookie × 2
    expect(got.order).toEqual(["started", "rewards"]); // RR-L1: the run id first, so the phone accepts the resend
    expect(got.runIds).toEqual([room.bank?.runId]);
    expect(await rewardRows(b)).toBe(1);
  });

  it("Story 8.2 (AC 13, E8-J6; replaces 7.2 B5): Leave mid-wave (banked quit) → come back in the build phase → run end: one row, raised to the whole run (top-up)", async () => {
    const [a, b] = [await newAccount(), await newAccount()];
    const toks = [hex(), hex()];
    const { clients, inbox, room, w } = await toWave([a, b], toks);
    const guest = clients[1]!;
    const bId = idOf(room, guest);
    w.players.get(bId)!.wavesIn = 3;
    guest.send(C2S.RUN_LEAVE, {});
    await vi.waitFor(() => expect(inbox[1]!.length).toBe(1));
    expect(inbox[1]![0]).toMatchObject({ ending: "quit", leftWave: 1, total: 60 });
    await guest.leave(true);
    await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(1));
    endWave(w);
    await vi.waitFor(() => expect(room.state.phase).toBe("build"));
    const back = await colyseus.sdk.joinById<RunStateView>(guest.roomId, options("join", "P1", b, toks[1]));
    const got = listen(back);
    await back.waitForInitialState();
    await vi.waitFor(() => expect(w.players.has(bId)).toBe(true));
    await vi.waitFor(() => expect(got.runIds).toEqual([room.bank?.runId])); // the run id on the rejoin
    w.players.get(bId)!.wavesIn = 9; // plays on: the waves after the rejoin are paid by the top-up
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    await vi.waitFor(() => expect(got.length).toBe(1));
    expect(got[0]).toMatchObject({ status: "saved", ending: "wiped", waveCount: 9 });
    const total = (got[0] as { total: number }).total;
    expect(total).toBeGreaterThan(60);
    expect(await rewardRows(b)).toBe(1); // one row, raised
    expect(await supplies(b)).toBe(total); // 60 at the Leave + (total − 60) now: the whole run, once
  });

  it("review M1 (B): run.leave keeps the socket, but the banked seat can't take the bag; a teammate still can", async () => {
    const [a, b] = [await newAccount(), await newAccount()];
    const { clients, inbox, room, w } = await toWave([a, b]);
    const host = clients[0]!;
    const guest = clients[1]!;
    const gId = idOf(room, guest);
    guest.send(C2S.RUN_LEAVE, {});
    await vi.waitFor(() => expect(inbox[1]!.length).toBe(1));
    expect(w.loot.banked.has(gId)).toBe(true);
    const g = w.players.get(gId)!;
    bagAt(w, g.x, g.y);
    const t0 = w.tick;
    await vi.waitFor(() => expect(w.tick).toBeGreaterThan(t0 + 5));
    expect(w.loot.state).toBe(LOOT_BAG.OUT);
    const h = w.players.get(idOf(room, host))!;
    bagAt(w, h.x, h.y);
    await vi.waitFor(() => expect(w.loot.foundBy).toBe(h.id));
  });

  it("review M1 (A): Leave mid-wave (banked), come back in the build phase: standing on the bag doesn't take it", async () => {
    const [a, b] = [await newAccount(), await newAccount()];
    const toks = [hex(), hex()];
    const { clients, inbox, room, w } = await toWave([a, b], toks);
    const guest = clients[1]!;
    const bId = idOf(room, guest);
    guest.send(C2S.RUN_LEAVE, {});
    await vi.waitFor(() => expect(inbox[1]!.length).toBe(1));
    await guest.leave(true);
    await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(1));
    endWave(w);
    await vi.waitFor(() => expect(room.state.phase).toBe("build"));
    const back = await colyseus.sdk.joinById<RunStateView>(guest.roomId, options("join", "P1", b, toks[1]));
    const got = listen(back);
    await back.waitForInitialState();
    await vi.waitFor(() => expect(w.players.has(bId)).toBe(true));
    const p = w.players.get(bId)!;
    bagAt(w, p.x, p.y);
    const t0 = w.tick;
    await vi.waitFor(() => expect(w.tick).toBeGreaterThan(t0 + 5));
    expect(w.loot.state).toBe(LOOT_BAG.OUT);
    expect(w.loot.foundBy).toBeNull();
    for (const q of w.players.values()) downPlayer(w, q);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    await vi.waitFor(() => expect(got.length).toBe(1));
    expect(got[0]?.loot).toBeUndefined();
    expect(got[0]?.teamLoot).toBeUndefined();
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
    expect(got.length).toBe(0);
    expect(got.order).toEqual([]); // no run: no run.started either
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

describe("Story 8.2+8.3 review: banking with seats that come and go", () => {
  it("H1: Di is removed, Eve joins into Di's player id → at the run end Eve banks on HER account and sees HER rewards", async () => {
    const [a, d, e] = [await newAccount(), await newAccount(), await newAccount()];
    const { clients, inbox, room, w } = await toWave([a, d]);
    const diId = idOf(room, clients[1]!);
    endWave(w); // a build phase: Remove is allowed
    await vi.waitFor(() => expect(room.state.phase).toBe("build"));
    clients[0]!.send(C2S.HOST_REMOVE, { playerId: diId });
    await vi.waitFor(async () => expect(await rewardRows(d)).toBe(1)); // Di banked "quit" at the remove (Di's socket is closed: Di sees "removed")
    const eve = await colyseus.sdk.joinById<RunStateView>(clients[0]!.roomId, options("join", "Eve", e));
    const eveGot = listen(eve);
    await eve.waitForInitialState();
    await vi.waitFor(() => expect(w.players.has(diId)).toBe(true)); // Eve took Di's id
    expect(idOf(room, eve)).toBe(diId);
    w.players.get(diId)!.wavesIn = 2;
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    await vi.waitFor(() => expect(eveGot.length).toBe(1));
    expect(eveGot[0]).toMatchObject({ status: "saved", ending: "wiped", waveCount: 2 }); // her own record, not Di's quit
    expect(await rewardRows(e)).toBe(1);
    expect(await supplies(e)).toBe((eveGot[0] as { total: number }).total);
    expect(await rewardRows(d)).toBe(1); // Di's one row from the remove, nothing more
    expect(inbox[1]!.length).toBe(0); // the removed Di's socket is gone
  });

  it("M2: a late joiner still waiting when the run ends gets a zero not_saved run.rewards (never 'Saving…' forever)", async () => {
    const a = await newAccount();
    const { clients, room, w } = await toWave([a]);
    const late = await colyseus.sdk.joinById<RunStateView>(clients[0]!.roomId, options("join", "Bo", await newAccount()));
    const got = listen(late);
    await late.waitForInitialState();
    await vi.waitFor(() => expect(room.state.players.get("p1")?.waiting).toBe(true));
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    await vi.waitFor(() => expect(got.length).toBe(1));
    expect(got[0]).toMatchObject({ status: "not_saved", total: 0 });
  });
});
