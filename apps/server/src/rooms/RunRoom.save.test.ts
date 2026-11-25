import type { ColyseusTestServer } from "@colyseus/testing";
import { C2S, CLOSE_RUN_SAVED, S2C, downPlayer, skipWave, migrateRunSave, type RunSave } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Database, openPglite } from "../db/client";
import { savedRunsRepo, type SavedRunsRepo } from "../db/savedRunsRepo";
import { bootTestServer } from "../test/bootTestServer";
import { SAVE_SECRET, lobby, newPlayer, start, supplies, type Lobby } from "../test/saveKit";
import { setRoomSaves } from "../run/roomSaves";
import { MAX_TICK_ERRORS_IN_A_ROW, SERVER_RESTARTING_MESSAGE, SERVER_RESTARTING_SAVED_MESSAGE } from "./RunRoom";

/**
 * Stories 8.4 + 8.5 in a real room (S2, S4, S7, S8; AC 5–9): autosaves, Save and quit, everyone leaving, shutdown and
 * the tick-error close, with the saves in PGlite.
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

async function rowOf(id: string): Promise<{ status: string; wave: number; snapshot: RunSave } | null> {
  const db = await database.db();
  const r = (await db.execute(`select status, wave, snapshot from saved_runs where id = '${id}'`)) as unknown as { rows: { status: string; wave: number; snapshot: RunSave }[] };
  return r.rows[0] ?? null;
}
const runIdOf = (l: Lobby): string => l.room.bank!.runId;
const world = (l: Lobby) => l.room.controller!.world;

/** Ends the build (everyone Ready) and waits for the wave. */
async function toWave(l: Lobby): Promise<void> {
  for (const c of l.clients) c.send(C2S.BUILD_SET_READY, { ready: true });
  await vi.waitFor(() => expect(world(l).run.phase).toBe("wave"));
}
/** Clears the wave (dev path) and waits for the next build. */
async function toBuild(l: Lobby): Promise<void> {
  skipWave(world(l));
  await vi.waitFor(() => expect(l.room.state.phase).toBe("build"));
}

describe("Story 8.4: autosave", () => {
  it("AC 5: saved at the build start and on the build's last tick ('open': nobody can resume it); never awaited by the tick", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    const info = vi.spyOn(l.room.log, "info");
    await start(l);
    world(l).debug.bossWaves = [];
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ kind: "build_start", runId: runIdOf(l) }), "run_saved"));
    world(l).players.get("p0")!.wallet = 999; // bought something
    await toWave(l);
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ kind: "build_end" }), "run_saved"));
    const row = await rowOf(runIdOf(l));
    expect(row?.status).toBe("open");
    expect(row?.snapshot.phase).toBe("build"); // the last build tick: every purchase in it, before the wave (E8-S2)
    expect((row?.snapshot.seats[0]!.player as { wallet: number }).wallet).toBe(999);
    expect(await saves.listForAccount(a.accountId!)).toEqual([]);
    await toBuild(l);
    await vi.waitFor(async () => expect((await rowOf(runIdOf(l)))?.wave).toBe(1));
  });

  it("no database: play goes on, one log line per run", async () => {
    setRoomSaves(null);
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    const warn = vi.spyOn(l.room.log, "warn");
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    await toBuild(l);
    await toWave(l);
    expect(warn.mock.calls.filter((c) => c[1] === "run_save_no_database")).toHaveLength(1);
  });
});

describe("Story 8.5: Save and quit", () => {
  it("S7 + AC 9: host only, build phase only; saved → run.saved to all, every socket closes with 4023, the run is resumable", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    const info = vi.spyOn(l.room.log, "info");
    await start(l);
    world(l).debug.bossWaves = [];
    l.clients[1]!.send(C2S.RUN_SAVE_QUIT, {}); // not the host
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ reason: "not_host" }), "save_quit_refused"));
    await toWave(l);
    l.clients[0]!.send(C2S.RUN_SAVE_QUIT, {}); // mid-wave
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ reason: "not_now" }), "save_quit_refused"));
    await toBuild(l);
    const id = runIdOf(l);
    l.clients[0]!.send(C2S.RUN_SAVE_QUIT, {});
    for (const got of l.inbox) await vi.waitFor(() => expect(got.closes).toEqual([CLOSE_RUN_SAVED]));
    for (const got of l.inbox) expect(got.saved).toHaveLength(1);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: id, why: "save_quit" }), "run_resumable");
    const row = await rowOf(id);
    expect(row?.status).toBe("saved");
    expect(row?.wave).toBe(1);
    const list = await saves.listForAccount(b.accountId!);
    expect(list.map((r) => [r.id, r.wave, r.names.map((n) => n.name)])).toEqual([[id, 1, ["Ana", "Bo"]]]);
    // S4: each linked seat's Supplies were topped up for the wave played (rookie × 2), no extract bonus
    await vi.waitFor(async () => expect(await supplies(database, a.accountId!)).toBe(20));
    expect(await supplies(database, b.accountId!)).toBe(20);
  });

  it("S8: the save write fails → the host sees run.save_failed, the room stays open and play goes on", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    vi.spyOn(saves, "saveResumable");
    const failing: SavedRunsRepo = { ...saves, saveResumable: () => Promise.reject(new Error("db down")) };
    setRoomSaves(failing);
    l.clients[0]!.send(C2S.RUN_SAVE_QUIT, {});
    await vi.waitFor(() => expect(l.inbox[0]!.failed).toBe(1));
    expect(l.inbox[0]!.closes).toEqual([]);
    const t0 = world(l).tick;
    await vi.waitFor(() => expect(world(l).tick).toBeGreaterThan(t0 + 3)); // ticks go on
    expect(l.room.state.phase).toBe("build");
    setRoomSaves(saves);
    l.clients[0]!.send(C2S.RUN_SAVE_QUIT, {}); // try again: works
    await vi.waitFor(() => expect(l.inbox[0]!.closes).toEqual([CLOSE_RUN_SAVED]));
  });
});

describe("Story 8.4 (S2): everyone leaving", () => {
  it("everyone leaves mid-wave → the run is lost: its save row is deleted", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    const info = vi.spyOn(l.room.log, "info");
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l); // the build-end autosave exists now
    const id = runIdOf(l);
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("open"));
    for (const c of l.clients) await c.leave(true);
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: id, why: "lost" }), "run_save_deleted"));
    expect(await rowOf(id)).toBeNull();
    expect(await saves.listForAccount(a.accountId!)).toEqual([]);
  });

  it("everyone leaves in a build phase → resumable (a real build-phase save)", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    await toBuild(l);
    const id = runIdOf(l);
    for (const c of l.clients) await c.leave(true);
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("saved"));
    const row = await rowOf(id);
    expect(row!.snapshot.seats.map((s) => s.playerId)).toEqual(["p0", "p1"]); // both remembered seats are in it
    expect(row!.snapshot.phase).toBe("build");
  });
});

describe("Story 8.4 (AC 7): shutdown and the tick-error close", () => {
  it("shutdown in a build phase: saved now, 'Server restarting, your run is saved'", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    const id = runIdOf(l);
    l.room.onBeforeShutdown();
    await vi.waitFor(() => expect(l.inbox[0]!.shutdown).toEqual([SERVER_RESTARTING_SAVED_MESSAGE]));
    expect((await rowOf(id))?.status).toBe("saved");
  });

  it("shutdown mid-wave: the LAST autosave (the build's last tick) becomes the save — the wave replays from its start", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    const id = runIdOf(l);
    await vi.waitFor(async () => expect((await rowOf(id))?.snapshot.wave).toBe(0));
    const t0 = world(l).tick;
    await vi.waitFor(() => expect(world(l).tick).toBeGreaterThan(t0 + 10));
    l.room.onBeforeShutdown();
    await vi.waitFor(() => expect(l.inbox[0]!.shutdown).toEqual([SERVER_RESTARTING_SAVED_MESSAGE]));
    const row = await rowOf(id);
    expect(row?.status).toBe("saved");
    expect(row?.snapshot.phase).toBe("build");
    expect(row?.snapshot.wave).toBe(0);
    expect(migrateRunSave(row?.snapshot).ok).toBe(true);
  });

  it("shutdown without a database: the old text, no save", async () => {
    setRoomSaves(null);
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    l.room.onBeforeShutdown();
    await vi.waitFor(() => expect(l.inbox[0]!.shutdown).toEqual([SERVER_RESTARTING_MESSAGE]));
  });

  it("20 failed ticks: the last autosave is made resumable before the room closes", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    const info = vi.spyOn(l.room.log, "info");
    await start(l);
    const id = runIdOf(l);
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("open"));
    const err = Object.assign(new Error("tick"), { cause: new Error("boom") });
    for (let i = 0; i < MAX_TICK_ERRORS_IN_A_ROW; i++) l.room.onUncaughtException(err as never, "setFixedTimestep");
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: id, why: "tick_error" }), "run_resumable"));
    expect((await rowOf(id))?.status).toBe("saved");
  });
});

describe("Story 8.4 (S3): a finished run deletes its save", () => {
  it("a wipe → the row is gone", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    world(l).debug.bossWaves = [];
    const id = runIdOf(l);
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("open"));
    await toWave(l);
    for (const p of world(l).players.values()) downPlayer(world(l), p);
    await vi.waitFor(() => expect(l.room.state.phase).toBe("results"));
    await vi.waitFor(async () => expect(await rowOf(id)).toBeNull());
    expect(S2C.RUN_SAVED).toBe("run.saved");
  });
});
