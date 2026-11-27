import type { ColyseusTestServer } from "@colyseus/testing";
import { randomBytes } from "node:crypto";
import { C2S, damagePlayerBy, downPlayer, skipWave } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { accountsRepo, adminsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { runResultForTest } from "../db/testQueries";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { SAVE_SECRET, lobby, newPlayer, start, supplies, type Lobby, type Player } from "../test/saveKit";
import type { RunRoom } from "./RunRoom";

/**
 * Story 10.12 in a real room (AC 1–7; B2–B4, B7, B9): the server decides admin from the database (never the client),
 * refuses and logs everyone else, applies every cheat on its own World from the tick, restarts with a seed for
 * everyone, marks the run's stats row, and pays rewards exactly as for a clean run.
 */
let colyseus: ColyseusTestServer;
let database: Database;

beforeAll(async () => {
  database = openPglite();
  ({ colyseus } = await bootTestServer({ database, sessionSecret: SAVE_SECRET, checkTicketRows: false }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

let adminN = 0;
/** A registered account whose device row is this player's token (what a logged-in phone has), marked admin. */
async function adminPlayer(name: string, admin = true): Promise<Player> {
  const token = randomBytes(16).toString("hex");
  const acc = await accountsRepo(database).createGuest(hashGuestToken(token), name);
  const username = `admin${++adminN}${Date.now() % 1000}`;
  expect(await accountsRepo(database).setCredentials(acc.id, { username, passwordHash: "x", recoveryCodeHash: "y" })).toBe("ok");
  if (admin) expect(await adminsRepo(database).setAdmin(username.toLowerCase(), true)).not.toBeNull();
  return { name, accountId: acc.id, token, username } as Player & { username: string };
}

const world = (l: Lobby) => l.room.controller!.world;
const settled = async (room: RunRoom) => {
  await room.runResultWrites;
  await new Promise((r) => setTimeout(r, 20));
  await room.runResultWrites;
};
async function toWave(l: Lobby): Promise<void> {
  for (const c of l.clients) c.send(C2S.BUILD_SET_READY, { ready: true });
  await vi.waitFor(() => expect(world(l).run.phase).toBe("wave"));
}
/** A few ticks pass (the cheat queue drains in the next one). */
const ticks = async (l: Lobby, n = 3) => {
  const t = world(l).tick;
  await vi.waitFor(() => expect(world(l).tick).toBeGreaterThanOrEqual(t + n));
};

describe("Story 10.12: admin cheats online", () => {
  it("AC 1, 3, 7: an admin's Spawn 50 lands on the server World; the run's stats row is marked; used is logged", async () => {
    const a = await adminPlayer("Ana");
    const l = await lobby(colyseus, [a, await newPlayer(database, "Bo")]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    world(l).waves.paused = true;
    const info = vi.spyOn(l.room.log, "info");
    const before = world(l).zombies.aliveCount;
    l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "spawn", type: "walker", count: 50, where: "ring" });
    await vi.waitFor(() => expect(world(l).zombies.aliveCount).toBe(before + 50));
    await settled(l.room);
    expect((await runResultForTest(database, l.room.bank!.runId))?.cheated).toBe(true);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId: l.room.bank!.runId, accountId: a.accountId, cheat: "spawn", wave: 1 }), "admin_cheat_used");
    expect(JSON.stringify(info.mock.calls)).not.toContain("Ana"); // ids only (B4)
  });

  it("AC 2: a guest, a non-admin account and a forged extra field change nothing; refused is logged once per burst", async () => {
    const a = await adminPlayer("Ana", false); // registered, not admin
    const g = await newPlayer(database, "Gus", false); // a guest seat
    const l = await lobby(colyseus, [a, g]);
    await start(l);
    world(l).waves.paused = true;
    const warn = vi.spyOn(l.room.log, "warn");
    const p0 = world(l).players.get("p0")!;
    const wallet = p0.wallet;
    for (let i = 0; i < 8; i++) l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "money" });
    l.clients[1]!.send(C2S.ADMIN_CHEAT, { cheat: "spawn", type: "walker", count: 50, where: "ring" });
    l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "money", admin: true }); // the guard drops it (strict)
    await vi.waitFor(() => expect(warn.mock.calls.filter((c) => c[1] === "admin_cheat_refused")).toHaveLength(2));
    await ticks(l, 5);
    expect(p0.wallet).toBe(wallet);
    expect(world(l).zombies.aliveCount).toBe(0);
    const refused = warn.mock.calls.filter((c) => c[1] === "admin_cheat_refused").map((c) => c[0]);
    expect(refused).toEqual([
      expect.objectContaining({ playerId: "p0", accountId: a.accountId, cheat: "money" }),
      expect.objectContaining({ playerId: "p1", accountId: null, cheat: "spawn" }),
    ]);
    await settled(l.room);
    expect((await runResultForTest(database, l.room.bank!.runId))?.cheated).toBe(false);
  });

  it("B7: an admin whose mark is removed before the seat's first cheat is refused", async () => {
    const a = (await adminPlayer("Ana")) as Player & { username: string };
    const l = await lobby(colyseus, [a]);
    await start(l);
    await adminsRepo(database).setAdmin(a.username.toLowerCase(), false);
    const warn = vi.spyOn(l.room.log, "warn");
    l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "money" });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.objectContaining({ cheat: "money" }), "admin_cheat_refused"));
  });

  it("Q4 B, own money: god mode and +500 are the admin's own; a teammate still takes damage", async () => {
    const a = await adminPlayer("Ana");
    const l = await lobby(colyseus, [a, await newPlayer(database, "Bo")]);
    await start(l);
    const [p0, p1] = [world(l).players.get("p0")!, world(l).players.get("p1")!];
    const [w0, w1] = [p0.wallet, p1.wallet];
    l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "god", on: true });
    l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "money" });
    await vi.waitFor(() => expect(p0.wallet).toBe(w0 + 500));
    expect(p1.wallet).toBe(w1);
    expect(world(l).godPlayers.has("p0")).toBe(true);
    await toWave(l);
    expect(damagePlayerBy(world(l), p0, 40, "zombie", null)).toBe(0);
    expect(damagePlayerBy(world(l), p1, 40, "zombie", null)).toBe(40);
  });

  it("AC 4: a cheated run pays rewards like a clean one (Supplies banked at the wipe)", async () => {
    const a = await adminPlayer("Ana");
    const b = await newPlayer(database, "Bo");
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "skip_wave" });
    await vi.waitFor(() => expect(l.room.state.phase).toBe("build"));
    await toWave(l);
    for (const p of world(l).players.values()) downPlayer(world(l), p);
    await vi.waitFor(() => expect(l.room.state.phase).toBe("results"));
    await vi.waitFor(async () => expect(await supplies(database, b.accountId!)).toBeGreaterThan(0));
    expect(await supplies(database, a.accountId!)).toBeGreaterThan(0);
    await settled(l.room);
    expect(await runResultForTest(database, l.room.bank!.runId)).toMatchObject({ cheated: true, ending: "wiped" });
  });

  it("AC 6 (B3): Restart with seed restarts the run for everyone: old run banked (quit) and finished, a new run with that seed, cheated", async () => {
    const a = await adminPlayer("Ana");
    const b = await newPlayer(database, "Bo");
    const l = await lobby(colyseus, [a, b]);
    await start(l);
    world(l).debug.bossWaves = [];
    await toWave(l);
    skipWave(world(l));
    await vi.waitFor(() => expect(l.room.state.phase).toBe("build"));
    const oldRun = l.room.bank!.runId;
    l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "restart", seed: 424242 });
    await vi.waitFor(() => expect(l.room.bank?.runId).not.toBe(oldRun));
    await vi.waitFor(() => expect(l.room.controller?.world.run.phase).toBe("build"));
    expect(world(l).seed).toBe(424242);
    expect(world(l).waves.number).toBe(0);
    expect([...world(l).players.keys()].sort()).toEqual(["p0", "p1"]);
    await vi.waitFor(async () => expect(await supplies(database, b.accountId!)).toBeGreaterThan(0)); // wave 1 banked (quit)
    await settled(l.room);
    expect(await runResultForTest(database, oldRun)).toMatchObject({ cheated: true, ending: "lost" });
    expect((await runResultForTest(database, oldRun))?.ended_at).not.toBeNull();
    expect(await runResultForTest(database, l.room.bank!.runId)).toMatchObject({ cheated: true, ended_at: null });
  });

  it("B9: DEV_ADMIN_CHEATS=1 lets any seat cheat on a dev server (production ignores it)", async () => {
    vi.stubEnv("DEV_ADMIN_CHEATS", "1");
    const l = await lobby(colyseus, [await newPlayer(database, "Gus", false)]);
    await start(l);
    const p0 = world(l).players.get("p0")!;
    const w = p0.wallet;
    l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "money" });
    await vi.waitFor(() => expect(p0.wallet).toBe(w + 500));
    vi.stubEnv("NODE_ENV", "production");
    const l2 = await lobby(colyseus, [await newPlayer(database, "Hal", false)]);
    await start(l2);
    const q0 = world(l2).players.get("p0")!;
    const w2 = q0.wallet;
    const warn = vi.spyOn(l2.room.log, "warn");
    l2.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "money" });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.anything(), "admin_cheat_refused"));
    expect(q0.wallet).toBe(w2);
  });

  it("outside a run (the lobby) nothing happens", async () => {
    const a = await adminPlayer("Ana");
    const l = await lobby(colyseus, [a]);
    const info = vi.spyOn(l.room.log, "info");
    l.clients[0]!.send(C2S.ADMIN_CHEAT, { cheat: "money" });
    await new Promise((r) => setTimeout(r, 150));
    expect(l.room.controller).toBeNull();
    expect(info.mock.calls.filter((c) => c[1] === "admin_cheat_used")).toEqual([]);
  });
});
