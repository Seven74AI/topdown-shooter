import type { ColyseusTestServer } from "@colyseus/testing";
import { C2S, CLOSE_RUN_SAVED, downPlayer, endWave, skipWave, type RunStateView } from "@topdown/shared";
import { MAX_TICK_ERRORS_IN_A_ROW } from "./RunRoom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Database, openPglite } from "../db/client";
import { runResultForTest, runResultSeatsForTest } from "../db/testQueries";
import { savedRunsRepo } from "../db/savedRunsRepo";
import { roomSavesRepo, setRoomSaves } from "../run/roomSaves";
import { bootTestServer } from "../test/bootTestServer";
import { SAVE_SECRET, joinOptions, listen, lobby, newPlayer, start, type Lobby } from "../test/saveKit";
import type { RunRoom } from "./RunRoom";

/**
 * Story 10.7 in a real room (AC 2–4; B1, B2): the run stats rows. A wipe, a team that left mid-wave, a saved run (no
 * finish), a Leave-then-rejoin seat (one row, final numbers), a reused player id (two seats) and a run over 3 nights.
 */
let colyseus: ColyseusTestServer;
let database: Database;

beforeAll(async () => {
  database = openPglite();
  ({ colyseus } = await bootTestServer({ database, sessionSecret: SAVE_SECRET, checkTicketRows: false }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  setRoomSaves(savedRunsRepo(database));
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

const world = (l: Lobby | { room: RunRoom }) => l.room.controller!.world;
const runRow = (id: string) => runResultForTest(database, id);
/** The seat rows, by slot, with the seat id's player part (`p1#3` → `p1`; the generation is the room's counter). */
const seats = async (id: string) => (await runResultSeatsForTest(database, id)).map((r) => ({ ...r, seat: r.seat.split("#")[0] }));
const seatIds = async (id: string) => (await runResultSeatsForTest(database, id)).map((r) => r.seat);
async function toWave(l: Lobby): Promise<void> {
  for (const c of l.clients) c.send(C2S.BUILD_SET_READY, { ready: true });
  await vi.waitFor(() => expect(world(l).run.phase).toBe("wave"));
}
async function clearWave(l: Lobby): Promise<void> {
  skipWave(world(l));
  await vi.waitFor(() => expect(l.room.state.phase).toBe("build"));
}
async function wipe(l: Lobby): Promise<void> {
  for (const p of world(l).players.values()) downPlayer(world(l), p);
  await vi.waitFor(() => expect(l.room.state.phase).toBe("results"));
}
async function saveQuit(l: Lobby): Promise<string> {
  const id = l.room.bank!.runId;
  l.clients[0]!.send(C2S.RUN_SAVE_QUIT, {});
  for (const got of l.inbox) await vi.waitFor(() => expect(got.closes).toEqual([CLOSE_RUN_SAVED]));
  return id;
}
/** The room's stats writes have settled (they run after the banks: wait for the row). */
const settled = async (room: RunRoom) => {
  await room.runResultWrites;
  await new Promise((r) => setTimeout(r, 20));
  await room.runResultWrites;
};

describe("Story 10.7: run stats rows from a real room", () => {
  it("AC 2, 3: a wipe finishes one row (open since Start) with one seat row each: slot, waves in, own kills, bought weapons", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo", false)];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    const id = l.room.bank!.runId;
    await settled(l.room);
    expect(await runRow(id)).toMatchObject({ ended_at: null, nights_played: 1, district: "downtown" });
    world(l).debug.bossWaves = [];
    await toWave(l);
    await clearWave(l);
    await toWave(l);
    world(l).players.get("p0")!.weaponsBought.push("smg", "fire_axe");
    world(l).players.get("p1")!.kills = 12;
    await wipe(l);
    await vi.waitFor(async () => expect((await runRow(id))?.ended_at).not.toBeNull());
    expect(await runRow(id)).toMatchObject({ ending: "wiped", extracted: false, wave_reached: 2, player_count: 2, endless: false, nights_played: 1 });
    expect(await seats(id)).toEqual([
      { seat: "p0", account_id: a.accountId, slot: 0, loadout: "fire_axe+smg", waves_in: 2, kills: 0 },
      { seat: "p1", account_id: null, slot: 1, loadout: "", waves_in: 2, kills: 12 }, // a seat with no account is a row too
    ]);
  });

  it("B2: everyone leaves mid-wave → lost (each Leaver's row from its own bank); a solo online run has player count 1", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    const id = l.room.bank!.runId;
    await toWave(l);
    world(l).players.get("p1")!.kills = 5;
    l.clients[1]!.send(C2S.RUN_LEAVE, {});
    await l.clients[1]!.leave(true);
    await vi.waitFor(() => expect(l.room.rememberedSeats.size).toBe(1));
    world(l).players.get("p0")!.kills = 3;

    await l.clients[0]!.leave(true);
    await vi.waitFor(async () => expect((await runRow(id))?.ended_at).not.toBeNull());
    expect(await runRow(id)).toMatchObject({ ending: "lost", player_count: 2, wave_reached: 1 });
    expect((await seats(id)).map((s) => [s.seat, s.kills])).toEqual([["p0", 3], ["p1", 5]]);
    // Solo online.
    const solo = await lobby(colyseus, [await newPlayer(database, "Cy")]);
    await start(solo);
    const soloId = solo.room.bank!.runId;
    await toWave(solo);
    await wipe(solo);
    await vi.waitFor(async () => expect((await runRow(soloId))?.player_count).toBe(1));
  });

  it("B2: Save and quit (everyone leaves in a calm phase, saved) finishes nothing: the row stays open", async () => {
    const l = await lobby(colyseus, [await newPlayer(database, "Ana")]);
    await start(l);
    const id = await saveQuit(l);
    await settled(l.room);
    await new Promise((r) => setTimeout(r, 200));
    expect(await runRow(id)).toMatchObject({ ended_at: null, ending: null });
    expect(await seats(id)).toEqual([]);
  });

  it("AC 2 (8.2): Leave mid-wave → come back in the build phase → run end: ONE row with the final numbers", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    const id = l.room.bank!.runId;
    const w = world(l);
    w.debug.bossWaves = [];
    await toWave(l);
    w.players.get("p1")!.kills = 4;
    l.clients[1]!.send(C2S.RUN_LEAVE, {});
    await l.clients[1]!.leave(true);
    await vi.waitFor(() => expect(l.room.rememberedSeats.size).toBe(1));
    endWave(w);
    await vi.waitFor(() => expect(l.room.state.phase).toBe("build"));
    const back = await colyseus.sdk.joinById<RunStateView>(l.room.roomId, joinOptions("join", b));
    listen(back);
    await vi.waitFor(() => expect(w.players.has("p1")).toBe(true));
    w.players.get("p1")!.kills = 9;
    w.players.get("p1")!.weaponsBought.push("shotgun");
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(l.room.state.phase).toBe("results"));
    await vi.waitFor(async () => expect((await runRow(id))?.ended_at).not.toBeNull());
    expect((await seats(id)).map((s) => [s.seat, s.kills, s.loadout])).toEqual([["p0", 0, ""], ["p1", 9, "shotgun"]]);
    expect((await runRow(id))?.player_count).toBe(2);
  });

  it("8.3 H1: a removed seat and the newcomer in its player id are two rows (seat ids); a waiting late joiner gets none", async () => {
    const [a, b, c] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo"), await newPlayer(database, "Cy")];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    const id = l.room.bank!.runId;
    l.clients[0]!.send(C2S.HOST_REMOVE, { playerId: "p1" });
    await vi.waitFor(() => expect(l.room.bannedSeats.length).toBe(1));
    const cy = await colyseus.sdk.joinById<RunStateView>(l.room.roomId, joinOptions("join", c));
    listen(cy);
    await vi.waitFor(() => expect(world(l).players.has("p1")).toBe(true));
    await toWave({ ...l, clients: [l.clients[0]!, cy] });
    const d = await colyseus.sdk.joinById<RunStateView>(l.room.roomId, joinOptions("join", await newPlayer(database, "Di")));
    listen(d);
    await vi.waitFor(() => expect([...l.room.members.values()].some((m) => m.waiting === true)).toBe(true));
    await wipe(l);
    await vi.waitFor(async () => expect((await runRow(id))?.ended_at).not.toBeNull());
    const rows = await seats(id);
    expect(rows.map((s) => s.seat)).toEqual(["p0", "p1", "p1"]);
    expect(new Set(await seatIds(id)).size).toBe(3); // two seats in player id p1: two seat ids
    expect(rows.map((s) => s.account_id)).toEqual([a.accountId, b.accountId, c.accountId]);
    expect((await runRow(id))?.player_count).toBe(3);
  });
});

describe("Story 10.7 AC 4: a run over three nights", () => {
  it("night 1 → Save and quit → resume → Save and quit → resume → wipe: ONE row, nights_played 3, started_at = night 1", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l1 = await lobby(colyseus, [a, b]);
    await start(l1);
    const id = l1.room.bank!.runId;
    world(l1).debug.bossWaves = [];
    await toWave(l1);
    await clearWave(l1);
    await settled(l1.room);
    const night1 = new Date((await runRow(id))?.started_at as string).getTime();
    await saveQuit(l1);
    const l2 = await lobby(colyseus, [a, b], id);
    await start(l2);
    await saveQuit(l2);
    await settled(l2.room);
    expect(await runRow(id)).toMatchObject({ ended_at: null, nights_played: 2 });
    const l3 = await lobby(colyseus, [b, a], id);
    await start(l3);
    world(l3).debug.bossWaves = [];
    await toWave(l3);
    await wipe(l3);
    await vi.waitFor(async () => expect((await runRow(id))?.ended_at).not.toBeNull());
    const r = await runRow(id);
    expect(r).toMatchObject({ ending: "wiped", nights_played: 3, wave_reached: 2, player_count: 2 });
    expect(new Date(r?.started_at as string).getTime()).toBe(night1);
    expect(night1).toBeLessThan(new Date(r?.ended_at as string).getTime());
    expect((await seats(id)).map((s) => [s.seat, s.waves_in])).toEqual([["p0", 2], ["p1", 2]]);
  });
});

describe("Story 10.7 review H1, M2, L5: saves and the extraction", () => {
  /** Night 1 mid-wave (its build's autosave stored), then `close` ends the room with a resumable save. */
  async function savedMidWave(close: (l: Lobby) => void): Promise<{ id: string; a: Awaited<ReturnType<typeof newPlayer>> }> {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    const id = l.room.bank!.runId;
    const info = vi.spyOn(l.room.log, "info");
    await new Promise((r) => setTimeout(r, 300)); // the build's autosave lands
    close(l);
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: id }), "run_resumable"));
    await vi.waitFor(() => expect(l.inbox[0]!.closes.length).toBe(1));
    await new Promise((r) => setTimeout(r, 200));
    await settled(l.room);
    expect(await runRow(id)).toMatchObject({ ended_at: null, ending: null }); // H1: never a false "lost"
    return { id, a };
  }
  async function resumeAndWipe(id: string, a: Awaited<ReturnType<typeof newPlayer>>): Promise<void> {
    const l2 = await lobby(colyseus, [a], id);
    await start(l2);
    world(l2).debug.bossWaves = [];
    await toWave(l2);
    await wipe(l2);
    await vi.waitFor(async () => expect((await runRow(id))?.ended_at).not.toBeNull());
    expect(await runRow(id)).toMatchObject({ ending: "wiped", nights_played: 2, player_count: 1 });
  }

  it("H1: a shutdown mid-wave saves the run: its row stays open; the resumed night's wipe finishes it (2 nights)", async () => {
    const { id, a } = await savedMidWave((l) => l.room.onBeforeShutdown());
    await resumeAndWipe(id, a);
  });

  it("H1: 20 tick errors save the run: its row stays open; the resumed night's wipe finishes it", async () => {
    const err = Object.assign(new Error("tick"), { cause: new Error("boom") });
    const { id, a } = await savedMidWave((l) => {
      for (let i = 0; i < MAX_TICK_ERRORS_IN_A_ROW; i++) l.room.onUncaughtException(err as never, "setFixedTimestep");
    });
    await resumeAndWipe(id, a);
  });

  it("L5: everyone leaves in a build phase (no Save and quit): saved through finalLeave, no finish", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    const id = l.room.bank!.runId;
    const info = vi.spyOn(l.room.log, "info");
    const room = l.room;
    await l.clients[1]!.leave(true);
    await l.clients[0]!.leave(true);
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: id, why: "all_left" }), "run_resumable"));
    await new Promise((r) => setTimeout(r, 200));
    await settled(room);
    expect(await runRow(id)).toMatchObject({ ended_at: null, ending: null });
  });

  /** Two players voted into the extraction (wave 10, the 6.11 / 12.2 vote). */
  async function toExtract(): Promise<Lobby> {
    const l = await lobby(colyseus, [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")]);
    await start(l);
    const w = world(l);
    w.debug.bossWaves = [];
    w.waves.number = 9;
    w.players.get("p0")!.weaponsBought.push("smg");
    await toWave(l);
    skipWave(w);
    await vi.waitFor(() => expect(l.room.state.phase).toBe("vote"));
    await new Promise((r) => setTimeout(r, 1100)); // the Ready taps emptied each client's guard bucket
    for (const c of l.clients) c.send(C2S.EVAC_VOTE, { choice: "extract" });
    await vi.waitFor(() => expect(l.room.state.phase).toBe("extract"), { timeout: 4000 });
    return l;
  }

  it("M2: everyone leaves during the extraction → the run is recorded extracted, not lost", async () => {
    const l = await toExtract();
    const id = l.room.bank!.runId;
    for (const c of l.clients) await c.leave(true);
    await vi.waitFor(async () => expect((await runRow(id))?.ended_at).not.toBeNull());
    expect(await runRow(id)).toMatchObject({ ending: "extracted", extracted: true, wave_reached: 10, player_count: 2 });
  });

  it("the extraction played to its end (run.extract_done) → extracted, with each seat's numbers", async () => {
    const l = await toExtract();
    const id = l.room.bank!.runId;
    const w = world(l);
    for (const p of w.players.values()) {
      p.x = w.extract.padX; // straight onto the pad: no walk (the fly-out still plays in full)
      p.y = w.extract.padY;
    }
    await vi.waitFor(() => expect(l.room.state.phase).toBe("results"), { timeout: 20_000, interval: 200 });
    await vi.waitFor(async () => expect((await runRow(id))?.ended_at).not.toBeNull());
    expect(await runRow(id)).toMatchObject({ ending: "extracted", extracted: true, wave_reached: 10, player_count: 2 });
    expect((await seats(id)).map((s) => [s.seat, s.loadout, s.waves_in])).toEqual([["p0", "smg", 1], ["p1", "", 1]]); // wave 10 only (the test jumped to wave 9)
  });

  it("L4: only a waiting joiner is left in the vote and the save FAILS → the run is finished lost (not left open)", async () => {
    const real = roomSavesRepo()!;
    const l = await lobby(colyseus, [await newPlayer(database, "Ana")]);
    await start(l);
    const id = l.room.bank!.runId;
    const w = world(l);
    w.debug.bossWaves = [];
    w.waves.number = 9;
    await toWave(l);
    skipWave(w);
    await vi.waitFor(() => expect(l.room.state.phase).toBe("vote"));
    const late = await colyseus.sdk.joinById<RunStateView>(l.room.roomId, joinOptions("join", await newPlayer(database, "Cy")));
    listen(late);
    await vi.waitFor(() => expect([...l.room.members.values()].some((m) => m.waiting === true)).toBe(true));
    setRoomSaves({ ...real, saveResumable: async () => false }); // the all-left save fails
    await l.clients[0]!.leave(true);
    await vi.waitFor(async () => expect((await runRow(id))?.ended_at).not.toBeNull());
    expect(await runRow(id)).toMatchObject({ ending: "lost", player_count: 1, wave_reached: 10 });
  });
});
