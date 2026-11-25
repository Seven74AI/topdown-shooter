import type { ColyseusTestServer } from "@colyseus/testing";
import { C2S, CLOSE_RUN_SAVED, DOWNTOWN_MAP, LOOT_BAG, RUN_ROOM_NAME, S2C, downPlayer, lootPartKeys, migrateRunSave, skipWave, type RunSave, type RunStateView, type World } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { deviceTokensRepo } from "../db/deviceTokensRepo";
import { progressRepo } from "../db/progressRepo";
import { savedRunsRepo, type SavedRunsRepo } from "../db/savedRunsRepo";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { SAVE_SECRET, joinOptions, listen, lobby, newPlayer, start, supplies, type Lobby, type Player } from "../test/saveKit";
import { setRoomSaves } from "../run/roomSaves";
import { MAX_TICK_ERRORS_IN_A_ROW, SERVER_RESTARTING_SAVED_MESSAGE } from "./RunRoom";

/** Stories 8.4–8.6 review round 1: H1, M1–M6 and the room-side lows, each beaten in a real room (PGlite). */
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

const world = (l: Lobby): World => l.room.controller!.world;
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
  await vi.waitFor(() => expect(l.inbox[0]!.closes).toEqual([CLOSE_RUN_SAVED]));
  return id;
}
async function rowOf(id: string): Promise<{ status: string; snapshot: RunSave; saved_at: string | null; expires_at: string | null } | null> {
  const db = await database.db();
  const r = (await db.execute(`select status, snapshot, saved_at, expires_at from saved_runs where id = '${id}'`)) as unknown as { rows: { status: string; snapshot: RunSave; saved_at: string | null; expires_at: string | null }[] };
  return r.rows[0] ?? null;
}
const refusal = (p: Promise<unknown>): Promise<string> => p.then(() => "joined", (e: Error) => e.message);
const lootOwned = async (accountId: string): Promise<string[]> => {
  const keys = new Set(lootPartKeys());
  return ((await progressRepo(database).get(accountId))?.cosmetics ?? []).filter((k) => keys.has(k));
};

describe("H1: one loot bag pays out once across a remove, a reused player id, a save and a resume", () => {
  it("find → removed (banks the item) → a late joiner takes the same player id → save → bank → resume → wipe: exactly one account owns it", async () => {
    const [a, b, c] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo"), await newPlayer(database, "Cy")];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    const w = world(l);
    w.debug.bossWaves = [];
    w.loot.plan.has = true;
    w.loot.plan.itemRoll = 0;
    await toWave(l);
    const bo = w.players.get("p1")!;
    Object.assign(w.loot, { state: LOOT_BAG.OUT, x: bo.x, y: bo.y, dropTick: w.tick, untilTick: w.tick + 400, foundBy: null, foundWave: w.waves.number });
    await vi.waitFor(() => expect(w.loot.foundBy).toBe("p1"));
    await clearWave(l);
    l.clients[0]!.send(C2S.HOST_REMOVE, { playerId: "p1" }); // Bo banks the find on his removal
    await vi.waitFor(async () => expect((await lootOwned(b.accountId!)).length).toBe(1));
    expect(w.loot.foundBy).toBe("p1"); // kept (re-review L3): the noted SEAT, not the player id, is the finder
    const cy = await colyseus.sdk.joinById<RunStateView>(l.room.roomId, joinOptions("join", c));
    const cyIn = listen(cy);
    await vi.waitFor(() => expect(w.players.has("p1")).toBe(true)); // Cy took p1 (a new seat)
    const id = await saveQuit({ ...l, clients: [l.clients[0]!, cy], inbox: [l.inbox[0]!, cyIn] });
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("saved"));
    await new Promise((r) => setTimeout(r, 300)); // the save's top-up
    // night 2: Ana and Cy resume, play, wipe
    const l2 = await lobby(colyseus, [a, c], id);
    await start(l2);
    world(l2).debug.bossWaves = [];
    await toWave(l2);
    for (const p of world(l2).players.values()) downPlayer(world(l2), p);
    await vi.waitFor(() => expect(l2.room.state.phase).toBe("results"));
    await new Promise((r) => setTimeout(r, 400));
    const owners = [];
    for (const p of [a, b, c]) if ((await lootOwned(p.accountId!)).length > 0) owners.push(p.name);
    expect(owners).toEqual(["Bo"]);
  });

  it("the DB guard: two accounts banking a find for the same run → only the first gets the item, even at once", async () => {
    const repo = progressRepo(database);
    const [x, y] = [await accountsRepo(database).createGuest("e".repeat(63) + "1", "X"), await accountsRepo(database).createGuest("e".repeat(63) + "2", "Y")];
    const run = "3f1e2d3c-4b5a-4968-8776-655443322113";
    const key = lootPartKeys()[0] as string;
    const meta = { statsDelta: { revives: 0, kills: 0, barricades: 0, runs: 1 }, grant: () => ({ cosmetics: [key], districts: [], breakdown: { loot: { wave: 3, key, name: "x" } } }) };
    await Promise.all([repo.addSupplies(run, x.id, () => ({ supplies: 10, breakdown: {} }), meta), repo.addSupplies(run, y.id, () => ({ supplies: 10, breakdown: {} }), meta)]);
    const owned = [(await repo.get(x.id))!.cosmetics.includes(key), (await repo.get(y.id))!.cosmetics.includes(key)];
    expect(owned.filter(Boolean)).toHaveLength(1);
  });
});

describe("M1: a newcomer in a run resumed into the vote waits and enters at the build start", () => {
  it("resume into the vote with a newcomer → waiting; Stay → the next build → in the World with late-join money", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a]);
    await start(l);
    const w = world(l);
    w.debug.bossWaves = [];
    await toWave(l);
    w.waves.number = w.balance.waves.runWaves; // clearing it opens the vote
    skipWave(w);
    await vi.waitFor(() => expect(l.room.state.phase).toBe("vote"));
    const id = await saveQuit(l);
    expect((await rowOf(id))?.snapshot.phase).toBe("vote");
    const l2 = await lobby(colyseus, [a, b], id);
    await start(l2);
    const w2 = world(l2);
    expect(w2.run.phase).toBe("vote");
    const bo = [...l2.room.members.values()].find((m) => m.name === "Bo")!;
    expect(bo.waiting).toBe(true);
    expect(w2.players.has(bo.playerId)).toBe(false);
    for (const c of l2.clients) c.send(C2S.EVAC_VOTE, { choice: "stay" });
    await vi.waitFor(() => expect(w2.run.phase).toBe("build"), { timeout: 30_000 });
    await vi.waitFor(() => expect(w2.players.has(bo.playerId)).toBe(true));
    expect(w2.players.get(bo.playerId)!.wallet).toBeGreaterThanOrEqual(w2.balance.economy.lateJoin.base);
  }, 60_000);
});

describe("M2: a shutdown waits for the save's Supplies top-up; the boot sweep pays a save whose top-up was lost", () => {
  it("the top-up has landed when 'your run is saved' goes out", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    await clearWave(l);
    l.room.onBeforeShutdown();
    await vi.waitFor(() => expect(l.inbox[0]!.shutdown).toEqual([SERVER_RESTARTING_SAVED_MESSAGE]));
    expect(await supplies(database, a.accountId!)).toBe(20); // already paid, before the close
  });

  it("listUnbanked finds a resumable save with a linked account and no run_rewards row", async () => {
    const a = await newPlayer(database, "Ana");
    const id = "4f1e2d3c-4b5a-4968-8776-655443322114";
    await saves.saveResumable({ id, district: "downtown", seed: 1, snapshot: { schemaVersion: 1 }, schemaVersion: 1, wave: 2, names: [], roomCode: "R", links: [{ accountId: a.accountId!, seatKey: `acct:${a.accountId}` }] }, new Date(Date.now() + 86_400_000));
    expect((await saves.listUnbanked()).map((r) => r.id)).toContain(id);
    await progressRepo(database).addSupplies(id, a.accountId!, () => ({ supplies: 1, breakdown: {} }));
    expect((await saves.listUnbanked()).map((r) => r.id)).not.toContain(id);
  });
});

describe("M3 (8.6-B8): updates never kill a save; another map refuses cleanly", () => {
  it("another code version restores best-effort (logged); another map version: 'too old', the row is deleted and its waves paid once", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    await clearWave(l);
    const id = await saveQuit(l);
    await vi.waitFor(async () => expect(await supplies(database, a.accountId!)).toBe(20));
    const db = await database.db();
    await db.execute(`update saved_runs set snapshot = jsonb_set(snapshot, '{codeVersion}', '"older-build"') where id = '${id}'`);
    const l2 = await lobby(colyseus, [a], id);
    expect(l2.room.state.resumeWave).toBe(1); // resumed (no digest check)
    await l2.clients[0]!.leave(true);
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("saved"));
    await db.execute(`update saved_runs set snapshot = jsonb_set(snapshot, '{mapVersion}', '"old-map"') where id = '${id}'`);
    expect(await refusal(colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, joinOptions("resume", a, { savedRunId: id })))).toBe("save_too_old");
    expect(await rowOf(id)).toBeNull(); // never listed again
    await new Promise((r) => setTimeout(r, 300));
    expect(await supplies(database, a.accountId!)).toBe(20); // its waves were paid, once
    expect(DOWNTOWN_MAP.version).not.toBe("old-map");
  });
});

describe("M4: a refused Save and quit always answers", () => {
  it("a non-host and a mid-wave request get run.save_failed with the reason", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    const reasons: string[][] = [[], []];
    l.clients.forEach((c, i) => c.onMessage(S2C.RUN_SAVE_FAILED, (m: { reason: string }) => reasons[i]!.push(m.reason)));
    await start(l);
    world(l).debug.bossWaves = [];
    l.clients[1]!.send(C2S.RUN_SAVE_QUIT, {});
    await vi.waitFor(() => expect(reasons[1]).toEqual(["not_host"]));
    await toWave(l);
    l.clients[0]!.send(C2S.RUN_SAVE_QUIT, {});
    await vi.waitFor(() => expect(reasons[0]).toEqual(["not_now"]));
  });
});

describe("M5: no 'open' row outlives its room", () => {
  it("everyone leaves in a build phase and the fresh save fails → the last stored autosave becomes the save (never 'open')", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    const id = l.room.bank!.runId;
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("open"));
    await vi.waitFor(() => expect((l.room as unknown as { lastSave: unknown }).lastSave).not.toBeNull());
    setRoomSaves({ ...saves, saveResumable: () => Promise.reject(new Error("down")) });
    await l.clients[0]!.leave(true);
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("saved"));
  });

  it("… and when marking it fails too, the row is deleted", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    const id = l.room.bank!.runId;
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("open"));
    setRoomSaves({ ...saves, saveResumable: () => Promise.reject(new Error("down")), markSaved: () => Promise.reject(new Error("down")) });
    await l.clients[0]!.leave(true);
    await vi.waitFor(async () => expect(await rowOf(id)).toBeNull());
  });

  it("a resumed run's early tick errors make the claimed save resumable again", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    const id = await saveQuit(l);
    const l2 = await lobby(colyseus, [a], id);
    vi.spyOn(saves, "upsertOpen").mockResolvedValue(false); // no autosave lands: the row is still the claimed one
    setRoomSaves({ ...saves, upsertOpen: () => Promise.resolve(false) });
    await start(l2);
    expect((await rowOf(id))?.status).toBe("open");
    const err = Object.assign(new Error("tick"), { cause: new Error("boom") });
    for (let i = 0; i < MAX_TICK_ERRORS_IN_A_ROW; i++) l2.room.onUncaughtException(err as never, "setFixedTimestep");
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("saved"));
  });
});

describe("M6: a guest's saved runs follow it into the account it logs into", () => {
  it("merge re-points the link; the merged player resumes and gets the guest's own seat back", async () => {
    const gToken = "cd".repeat(16);
    const guest: Player = { name: "Gus", accountId: (await accountsRepo(database).createGuest(hashGuestToken(gToken), "Gus")).id, token: gToken };
    const l = await lobby(colyseus, [guest]);
    await start(l);
    world(l).players.get("p0")!.wallet = 999;
    const id = await saveQuit(l);
    // the guest logs into an existing account on the same device (7.6 merge)
    const target = await accountsRepo(database).createGuest("f".repeat(64), "Old");
    const db = await database.db();
    await db.execute(`update accounts set username = 'olduser', username_lower = 'olduser' where id = '${target.id}'`);
    const newToken = "ab".repeat(16);
    await deviceTokensRepo(database).logIn({ oldTokenHash: hashGuestToken(guest.token), newTokenHash: hashGuestToken(newToken), accountId: target.id });
    expect((await saves.listForAccount(target.id)).map((r) => r.id)).toEqual([id]);
    expect(await saves.listForAccount(guest.accountId!)).toEqual([]);
    const merged: Player = { name: "Gus", accountId: target.id, token: newToken };
    const l2 = await lobby(colyseus, [merged], id);
    expect([...l2.room.members.values()][0]!.playerId).toBe("p0");
    await start(l2);
    expect(world(l2).players.get("p0")!.wallet).toBe(999); // the guest's own seat
    // Re-review H: the guest's save bank (20, wave 0 → 0 waves… the Save and quit after 0 waves paid 0) plus this
    // resume's save pay the run ONCE: one run_rewards row for the person, Supplies unchanged by the second save.
    const before = await supplies(database, target.id);
    await saveQuit(l2);
    await new Promise((r) => setTimeout(r, 400));
    expect(await supplies(database, target.id)).toBe(before);
    const rows = (await db.execute(`select count(*)::int as n from run_rewards where run_id = '${id}'`)) as unknown as { rows: { n: number }[] };
    expect(rows.rows[0]!.n).toBe(1);
  });

  it("re-review H: a guest that banked waves, then merged, resumes and saves at once → paid once (Supplies unchanged, one row)", async () => {
    const gToken = "ef".repeat(16);
    const guest: Player = { name: "Gil", accountId: (await accountsRepo(database).createGuest(hashGuestToken(gToken), "Gil")).id, token: gToken };
    const l = await lobby(colyseus, [guest]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    await clearWave(l);
    const id = await saveQuit(l);
    await vi.waitFor(async () => expect(await supplies(database, guest.accountId!)).toBe(20));
    const target = await accountsRepo(database).createGuest("9".repeat(64), "Acc");
    const db = await database.db();
    await db.execute(`update accounts set username = 'accuser', username_lower = 'accuser' where id = '${target.id}'`);
    const newToken = "fe".repeat(16);
    await deviceTokensRepo(database).logIn({ oldTokenHash: hashGuestToken(gToken), newTokenHash: hashGuestToken(newToken), accountId: target.id });
    expect(await supplies(database, target.id)).toBe(20); // the merge carried the 20
    const l2 = await lobby(colyseus, [{ name: "Gil", accountId: target.id, token: newToken }], id);
    await start(l2);
    await saveQuit(l2);
    await new Promise((r) => setTimeout(r, 400));
    expect(await supplies(database, target.id)).toBe(20); // never 40
    const rows = (await db.execute(`select count(*)::int as n from run_rewards where run_id = '${id}'`)) as unknown as { rows: { n: number }[] };
    expect(rows.rows[0]!.n).toBe(1);
    expect((await saves.listUnbanked()).map((r) => r.id)).not.toContain(id); // the boot sweep sees it as banked
  });
});

describe("Lows (room)", () => {
  it("E8-S10: Remove in a build phase autosaves at once: the removed seat's account is no longer linked to the save", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    const id = l.room.bank!.runId;
    await vi.waitFor(async () => expect((await rowOf(id))?.snapshot.seats.length).toBe(2));
    l.clients[0]!.send(C2S.HOST_REMOVE, { playerId: "p1" });
    await vi.waitFor(async () => expect((await rowOf(id))?.snapshot.seats.map((s) => s.playerId)).toEqual(["p0"]));
    const db = await database.db();
    const links = (await db.execute(`select account_id from saved_run_players where saved_run_id = '${id}'`)) as unknown as { rows: { account_id: string }[] };
    expect(links.rows.map((r) => r.account_id)).toEqual([a.accountId]);
  });

  it("a resumed lobby needs one of its own seats: the last one leaving releases the save and the lobby turns plain", async () => {
    const [a, c] = [await newPlayer(database, "Ana"), await newPlayer(database, "Cy")];
    const l = await lobby(colyseus, [a]);
    await start(l);
    const id = await saveQuit(l);
    const l2 = await lobby(colyseus, [a, c], id);
    await l2.clients[0]!.leave(true);
    await vi.waitFor(() => expect(l2.room.state.resumeWave).toBe(0));
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("saved"));
  });

  it("saved_at moves only when the run becomes resumable; a claim and a release keep it and the expiry", async () => {
    const a = await newPlayer(database, "Ana");
    const l = await lobby(colyseus, [a]);
    await start(l);
    const id = await saveQuit(l);
    const before = await rowOf(id);
    expect(before?.saved_at).not.toBeNull();
    const l2 = await lobby(colyseus, [a], id);
    await l2.clients[0]!.leave(true);
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("saved"));
    const after = await rowOf(id);
    expect([after?.saved_at, after?.expires_at]).toEqual([before?.saved_at, before?.expires_at]);
  });

  it("the save carries the finder's seat, the seat counter and the code version; seat generations never repeat after a resume", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    const id = await saveQuit(l);
    const save = migrateRunSave((await rowOf(id))?.snapshot);
    expect(save.ok && [save.save.codeVersion, save.save.seatCounter]).toEqual(["dev", 2]);
    const c = await newPlayer(database, "Cy");
    const l2 = await lobby(colyseus, [a, c], id);
    const cy = [...l2.room.members.values()].find((m) => m.name === "Cy")!;
    expect(cy.seatGen).toBeGreaterThan(2);
  });

  it("the resumed wave is sized by tonight's seats (one returning of two)", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    const twoPlayerSize = world(l).waves.size;
    await clearWave(l);
    const id = await saveQuit(l);
    const l2 = await lobby(colyseus, [a], id);
    await start(l2);
    world(l2).debug.bossWaves = [];
    await toWave(l2);
    const w = world(l2);
    expect(w.players.size).toBe(1);
    expect(w.waves.number).toBe(2);
    expect(w.waves.size).toBeLessThan(twoPlayerSize * 2); // wave 2 for ONE player is smaller than for two
    const solo = await lobby(colyseus, [await newPlayer(database, "Solo")]);
    await start(solo);
    world(solo).debug.bossWaves = [];
    world(solo).waves.number = 1;
    await toWave(solo);
    expect(w.waves.size).toBe(world(solo).waves.size); // exactly the one-player size of wave 2
  });

  it("E8-S10: Remove is refused while Save and quit is writing", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    const info = vi.spyOn(l.room.log, "info");
    await start(l);
    (l.room as unknown as { savingQuit: boolean }).savingQuit = true;
    l.clients[0]!.send(C2S.HOST_REMOVE, { playerId: "p1" });
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ target: "p1", reason: "not_now" }), "remove_refused"));
    expect(l.room.members.size).toBe(2);
    (l.room as unknown as { savingQuit: boolean }).savingQuit = false;
  });

  it("only a waiting joiner is left mid-wave → the run ends for it and its save is deleted as 'lost'", async () => {
    const [a, c] = [await newPlayer(database, "Ana"), await newPlayer(database, "Cy")];
    const l = await lobby(colyseus, [a]);
    const info = vi.spyOn(l.room.log, "info");
    await start(l);
    world(l).debug.bossWaves = [];
    const id = l.room.bank!.runId;
    await toWave(l);
    await vi.waitFor(async () => expect((await rowOf(id))?.status).toBe("open"));
    const cy = await colyseus.sdk.joinById<RunStateView>(l.room.roomId, joinOptions("join", c));
    listen(cy);
    await vi.waitFor(() => expect([...l.room.members.values()].some((m) => m.waiting === true)).toBe(true));
    await l.clients[0]!.leave(true);
    await vi.waitFor(() => expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: id, why: "lost" }), "run_save_deleted"));
    expect(await rowOf(id)).toBeNull();
  });

  it("re-review L3: after the finder's seat is removed, the teammates' Results still name the find ('A teammate found …', by seat)", async () => {
    const [a, b] = [await newPlayer(database, "Ana"), await newPlayer(database, "Bo")];
    const l = await lobby(colyseus, [a, b]);
    const got: { teamLoot?: { seatId?: string; key: string | null } }[] = [];
    l.clients[0]!.onMessage(S2C.RUN_REWARDS, (m: { teamLoot?: { seatId?: string; key: string | null } }) => got.push(m));
    await start(l);
    const w = world(l);
    w.debug.bossWaves = [];
    w.loot.plan.has = true;
    w.loot.plan.itemRoll = 0;
    await toWave(l);
    const bo = w.players.get("p1")!;
    const boSeat = [...l.room.members.values()].find((m) => m.playerId === "p1")!;
    Object.assign(w.loot, { state: LOOT_BAG.OUT, x: bo.x, y: bo.y, dropTick: w.tick, untilTick: w.tick + 400, foundBy: null, foundWave: w.waves.number });
    await vi.waitFor(() => expect(w.loot.foundBy).toBe("p1"));
    await clearWave(l);
    l.clients[0]!.send(C2S.HOST_REMOVE, { playerId: "p1" });
    await vi.waitFor(async () => expect((await lootOwned(b.accountId!)).length).toBe(1));
    expect(w.loot.foundBy).toBe("p1"); // kept: the seat note decides who the finder is
    await toWave(l);
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(got.length).toBe(1));
    expect(got[0]!.teamLoot?.seatId).toBe(`p1#${boSeat.seatGen}`);
    expect(got[0]!.teamLoot?.key).not.toBeNull();
    expect(await lootOwned(a.accountId!)).toEqual([]);
  });
});
