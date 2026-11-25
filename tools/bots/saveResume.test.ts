import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { CLOSE_RUN_SAVED, downPlayer, migrateRunSave, saveDigest, skipWave, type RunSave } from "@topdown/shared";
import { bootTestServer } from "../../apps/server/src/test/bootTestServer";
import { openPglite, type Database } from "../../apps/server/src/db/client";
import type { RunRoom } from "../../apps/server/src/rooms/RunRoom";
import { BotClient } from "./botClient";

/**
 * Stories 8.4–8.6 T8 liveness: real bots with accounts on a real server (PGlite). Two bots play wave 1; the host bot
 * saves and quits in the next build (both get `run.saved` and the 4023 close); the save row is resumable; the bots
 * resume it in a new room (the restored World's digest == the saved digest); waves continue (wave 2 really ends);
 * the run reaches Results and its save row is deleted. Everything asserted from the server and the bots' own lines.
 */
let colyseus: ColyseusTestServer;
let port = 0;
let database: Database;

beforeAll(async () => {
  database = openPglite();
  ({ colyseus, port } = await bootTestServer({ database }));
});
afterAll(async () => {
  await colyseus.shutdown();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean | Promise<boolean>, timeoutMs: number, stepMs = 50): Promise<boolean> {
  const t0 = performance.now();
  while (!(await ok())) {
    if (performance.now() - t0 > timeoutMs) return false;
    await sleep(stepMs);
  }
  return true;
}
async function saveRow(id: string): Promise<{ status: string; snapshot: RunSave } | null> {
  const db = await database.db();
  const r = (await db.execute(`select status, snapshot from saved_runs where id = '${id}'`)) as unknown as { rows: { status: string; snapshot: RunSave }[] };
  return r.rows[0] ?? null;
}

describe("Stories 8.4–8.6 bots (T8)", () => {
  it("save and quit → resume with the same accounts → the restored digest is the saved one → waves continue → Results → the save is gone", async () => {
    const lines: Record<string, unknown>[] = [];
    const log = (l: Record<string, unknown>): void => void lines.push(l);
    const url = `http://127.0.0.1:${port}`;
    const host = await BotClient.connect({ url, name: "Bot 1", log, account: true });
    const b2 = await BotClient.connect({ url, name: "Bot 2", roomId: host.roomId, log, account: true });
    const tokens = [host.deviceToken, b2.deviceToken];
    let room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
    expect([...room.members.values()].every((m) => m.accountId !== null)).toBe(true); // account seats: saves are kept
    expect(await until(() => room.members.size === 2 && [...room.state.players.values()].every((p) => p.ready), 30_000)).toBe(true);
    host.room.send("run.start", {});
    expect(await until(() => room.state.phase === "build", 30_000)).toBe(true);
    room.controller!.world.debug.bossWaves = [];
    expect(await until(() => room.state.phase === "wave", 120_000)).toBe(true);
    // Story 8.11 (PR #19 CI): no Ready in the save build, like `npm run bots --save-quit-at` (run.ts). Since 8.11 the
    // patch leaves in the tick that changed the phase, so the bots' Ready used to beat this test's poll and end the
    // build (a `build_end` autosave, then `save_quit_refused: not_now`); before, the 0–50 ms patch lag hid the race.
    for (const b of [host, b2]) b.holdReadyAfterWave = 1;
    skipWave(room.controller!.world); // wave 1 cleared (the bots fought in it)
    expect(await until(() => room.state.phase === "build", 10_000)).toBe(true);
    const runId = host.runId;
    expect(runId).toMatch(/^[0-9a-f-]{36}$/);
    host.saveQuit();
    expect(await until(() => host.closeCode === CLOSE_RUN_SAVED && b2.closeCode === CLOSE_RUN_SAVED, 10_000)).toBe(true);
    expect(lines.filter((l) => l.msg === "bot_run_saved")).toHaveLength(2);
    const saved = await saveRow(runId);
    expect(saved?.status).toBe("saved");
    const migrated = migrateRunSave(saved?.snapshot);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.save.wave).toBe(1);

    // Night 2: the same two accounts resume.
    const h2 = await BotClient.connect({ url, name: "Bot 1", log, account: true, deviceToken: tokens[0] as string, resume: runId });
    const g2 = await BotClient.connect({ url, name: "Bot 2", roomId: h2.roomId, log, account: true, deviceToken: tokens[1] as string });
    room = colyseus.getRoomById<RunRoom>(h2.roomId) as unknown as RunRoom;
    const info = vi.spyOn(room.log, "info");
    expect(room.state.resumeWave).toBe(1);
    expect(await until(() => room.members.size === 2 && [...room.state.players.values()].every((p) => p.ready), 30_000)).toBe(true);
    h2.room.send("run.start", {});
    expect(await until(() => room.controller !== null, 30_000)).toBe(true);
    const restored = room.controller!.restored!;
    expect(saveDigest(restored.world, restored.away.map((r) => r.player)) === migrated.save.digest || restored.digestChecked).toBe(true);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ runId, wave: 1, seatsBack: 2, digestChecked: true }), "run_resumed");
    expect(h2.runId === runId || (await until(() => h2.runId === runId, 5000))).toBe(true); // the same run id
    const w = room.controller!.world;
    w.debug.bossWaves = [];
    expect(await until(() => room.state.phase === "wave", 120_000)).toBe(true);
    expect(w.waves.number).toBe(2);
    skipWave(w);
    expect(await until(() => w.waves.number === 2 && room.state.phase === "build", 10_000)).toBe(true);
    expect(await until(() => h2.lastEndedWave === 2 && g2.lastEndedWave === 2, 10_000)).toBe(true); // the bots saw wave 2 end
    expect(await until(() => room.state.phase === "wave", 120_000)).toBe(true);
    for (const p of w.players.values()) downPlayer(w, p);
    expect(await until(() => room.state.phase === "results", 10_000)).toBe(true);
    expect(await until(async () => (await saveRow(runId)) === null, 10_000)).toBe(true);
    for (const b of [h2, g2]) await b.stop();
  }, 300_000);
});
