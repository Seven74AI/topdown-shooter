import type { ColyseusTestServer } from "@colyseus/testing";
import { C2S, CLOSE_RUN_SAVED, RUN_ROOM_NAME, downPlayer, skipWave, type RunStateView } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Database, openPglite } from "../db/client";
import { savedRunsRepo, type SavedRunsRepo } from "../db/savedRunsRepo";
import { countRunRewards } from "../db/testQueries";
import { bootTestServer } from "../test/bootTestServer";
import { SAVE_SECRET, joinOptions, listen, lobby, newPlayer, start, supplies, type Lobby, type Player } from "../test/saveKit";
import { setRoomSaves } from "../run/roomSaves";

/**
 * Story 8.6 in a real room (S1, S3, S4, S5, S9; AC 11–14): resume a saved run — claim once, the seats come back,
 * newcomers get late-join money, missing seats wait, bans hold, Supplies are banked once across nights.
 */
let colyseus: ColyseusTestServer;
let database: Database;
let saves: SavedRunsRepo;

beforeAll(async () => {
  database = openPglite();
  ({ colyseus } = await bootTestServer({ database, sessionSecret: SAVE_SECRET, checkTicketRows: false }));
  saves = savedRunsRepo(database);
});
afterEach(async () => {
  vi.restoreAllMocks();
  setRoomSaves(saves);
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

const world = (l: Lobby) => l.room.controller!.world;
async function toWave(l: Lobby): Promise<void> {
  for (const c of l.clients) c.send(C2S.BUILD_SET_READY, { ready: true });
  await vi.waitFor(() => expect(world(l).run.phase).toBe("wave"));
}
async function clearWave(l: Lobby): Promise<void> {
  skipWave(world(l));
  await vi.waitFor(() => expect(l.room.state.phase).toBe("build"));
}
async function saveQuit(l: Lobby): Promise<string> {
  const id = l.room.bank!.runId;
  l.clients[0]!.send(C2S.RUN_SAVE_QUIT, {});
  for (const got of l.inbox) await vi.waitFor(() => expect(got.closes).toEqual([CLOSE_RUN_SAVED]));
  return id;
}
/** Night 1: the players play `waves` waves and the host saves and quits in the next build. */
async function nightOne(players: Player[], waves = 1, setup?: (l: Lobby) => void): Promise<{ id: string; l: Lobby }> {
  const l = await lobby(colyseus, players);
  await start(l);
  world(l).debug.bossWaves = [];
  for (let i = 0; i < waves; i++) {
    await toWave(l);
    await clearWave(l);
  }
  setup?.(l);
  return { id: await saveQuit(l), l };
}
const refusal = (p: Promise<unknown>): Promise<string> => p.then(() => "joined", (e: Error) => e.message);

describe("Story 8.6: resume", () => {
  it("AC 12, 13 (S1, S5): the resumer hosts a new lobby 'Resuming · wave N'; a returning seat gets its own slot and state; the save is restored exactly (digest checked)", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const { id, l: night1 } = await nightOne([a, b], 2, (l) => {
      world(l).players.get("p1")!.wallet = 4321;
    });
    expect(night1.room.state.phase).toBe("build");
    const l = await lobby(colyseus, [b, a], id); // Bo resumes this time (E8-R1)
    expect(l.room.state.resumeWave).toBe(2);
    expect(l.room.state.district).toBe("downtown");
    expect([...l.room.members.values()].map((m) => [m.name, m.playerId])).toEqual([["Bo", "p1"], ["Ana", "p0"]]);
    expect(l.room.state.hostSlot).toBe(1);
    const info = vi.spyOn(l.room.log, "info");
    await start(l);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: id, wave: 2, seatsBack: 2, newcomers: 0, digestChecked: true }), "run_resumed");
    const w = world(l);
    expect(l.room.bank!.runId).toBe(id); // E8-S3: the same run id
    expect(w.waves.number).toBe(2);
    expect(w.players.get("p1")!.wallet).toBe(4321);
    expect(w.run.phase).toBe("build");
    expect(w.run.buildTicksLeft).toBeGreaterThan(400); // a fresh build timer (E8-R4)
    await vi.waitFor(async () => expect((await saves.listForAccount(a.accountId!)).length).toBe(0)); // 'open' while played
  });

  it("S3: a second Resume says save_busy; another account, no account or a guessed id: save_gone", async () => {
    const [a, b, c] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo"), await newPlayer(database, "Cy")];
    const { id } = await nightOne([a, b]);
    const l = await lobby(colyseus, [a], id);
    expect(await refusal(colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, joinOptions("resume", b, { savedRunId: id })))).toBe("save_busy");
    expect(await refusal(colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, joinOptions("resume", c, { savedRunId: id })))).toBe("save_gone");
    expect(await refusal(colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, joinOptions("resume", { ...b, accountId: null }, { savedRunId: id })))).toBe("save_gone");
    expect(await refusal(colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, joinOptions("resume", b, { savedRunId: "0f1e2d3c-4b5a-4968-8776-655443322110" })))).toBe("save_gone");
    // the resumed lobby closes before Start → resumable again
    await l.clients[0]!.leave(true);
    await vi.waitFor(async () => expect((await saves.listForAccount(a.accountId!)).length).toBe(1));
    const again = await lobby(colyseus, [b], id);
    expect(again.room.state.resumeWave).toBe(1);
  });

  it("S5 + E8-R2 + E8-R3: a newcomer gets late-join money and a free slot; a missing seat waits as a remembered seat and comes back with its state", async () => {
    const [a, b, c] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo"), await newPlayer(database, "Cy")];
    const { id } = await nightOne([a, b], 1, (l) => {
      world(l).players.get("p1")!.wallet = 777;
      for (const p of world(l).players.values()) p.earned = 500;
    });
    const l = await lobby(colyseus, [a, c], id);
    expect([...l.room.members.values()].map((m) => [m.name, m.slot])).toEqual([["Ana", 0], ["Cy", 2]]); // p1 stays Bo's (J3)
    await start(l);
    const w = world(l);
    expect([...w.players.keys()].sort()).toEqual(["p0", "p2"]); // wave size counts tonight's seats
    expect(w.players.get("p2")!.wallet).toBe(w.balance.economy.lateJoin.base + Math.floor(w.balance.economy.lateJoin.avgShare * 500));
    expect(w.run.joinExtendedBuild).toBe(false); // no +15 s on a resume
    expect(JSON.parse(l.room.state.leftSeats)).toEqual([["p1", "Bo"]]);
    const back = await colyseus.sdk.joinById<RunStateView>(l.room.roomId, joinOptions("join", b));
    listen(back);
    await vi.waitFor(() => expect(w.players.has("p1")).toBe(true));
    expect(w.players.get("p1")!.wallet).toBe(777);
  });

  it("S9 (E8-S10): a removed player can't come back by joining the resumed lobby", async () => {
    const [a, b, c] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo"), await newPlayer(database, "Cy")];
    const l1 = await lobby(colyseus, [a, b, c]);
    await start(l1);
    l1.clients[0]!.send(C2S.HOST_REMOVE, { playerId: "p2" });
    await vi.waitFor(() => expect(l1.room.bannedSeats.length).toBe(1));
    l1.inbox.pop();
    const id = await saveQuit({ ...l1, clients: l1.clients.slice(0, 2), inbox: l1.inbox });
    const l = await lobby(colyseus, [a], id);
    expect(await refusal(colyseus.sdk.joinById<RunStateView>(l.room.roomId, joinOptions("join", c)))).toBe("removed");
  });

  it("S4: Supplies across nights — saved twice with nothing played between pays nothing more; the final Results top up to one uninterrupted run; the row is deleted at the end", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const { id } = await nightOne([a, b], 1);
    await vi.waitFor(async () => expect(await supplies(database, a.accountId!)).toBe(20)); // 1 wave × 10, rookie × 2
    // night 2: resume and save at once (farming Save and quit + resume pays nothing)
    const l2 = await lobby(colyseus, [a, b], id);
    await start(l2);
    await saveQuit(l2);
    await new Promise((r) => setTimeout(r, 300));
    expect(await supplies(database, a.accountId!)).toBe(20);
    // night 3: play wave 2, then wipe in wave 3
    const l3 = await lobby(colyseus, [a, b], id);
    await start(l3);
    world(l3).debug.bossWaves = [];
    await toWave(l3);
    await clearWave(l3);
    await toWave(l3);
    for (const p of world(l3).players.values()) downPlayer(world(l3), p);
    await vi.waitFor(() => expect(l3.room.state.phase).toBe("results"));
    // 3 waves in (2 cleared + the wipe wave) × 10 × 2 = 60: the same as one run of 3 waves, banked in one row
    await vi.waitFor(async () => expect(await supplies(database, a.accountId!)).toBe(60));
    expect(await supplies(database, b.accountId!)).toBe(60);
    expect(await countRunRewards(database, a.accountId!)).toBe(1);
    await vi.waitFor(async () => expect((await (await database.db()).execute(`select count(*)::int as n from saved_runs where id = '${id}'`) as unknown as { rows: { n: number }[] }).rows[0]!.n).toBe(0));
    expect(await refusal(colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, joinOptions("resume", a, { savedRunId: id })))).toBe("save_gone");
  });
});
