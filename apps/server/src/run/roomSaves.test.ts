import { randomBytes } from "node:crypto";
import { captureRunSave, playToBuild } from "@topdown/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { SAVE_KEEP_MS, savedRunsRepo, type SaveRow, type SavedRunsRepo } from "../db/savedRunsRepo";
import { listSavedRuns } from "../auth/savedRunsRoute";
import { SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { SaveWriter, releaseSavesOnBoot } from "./roomSaves";

/** Stories 8.4–8.6: the SaveWriter (E8-S7), the boot sweep (E8-S6), the saved-runs list (AC 11) and the capture cost. */
log.level = process.env.LOG_LEVEL ?? "silent";
const open: Database[] = [];
afterEach(async () => {
  for (const d of open.splice(0)) await d.close();
});
const fresh = (): Database => {
  const d = openPglite();
  open.push(d);
  return d;
};
const quiet = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const RUN = "0f1e2d3c-4b5a-4968-8776-655443322110";
const row = (wave: number, accountId?: string): SaveRow => ({ id: RUN, district: "downtown", seed: 1, snapshot: { schemaVersion: 1, wave }, schemaVersion: 1, wave, names: [{ name: "Ana", slot: 0 }], roomCode: "ABCD", links: accountId ? [{ accountId, seatKey: `acct:${accountId}` }] : [] });

describe("Story 8.4 (E8-S7): SaveWriter", () => {
  it("one write in flight; a newer autosave replaces the queued one; a final write runs after them", async () => {
    const writes: number[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const repo = { upsertOpen: async (s: SaveRow) => (writes.push(s.wave), s.wave === 1 ? await gate : undefined, true) } as unknown as SavedRunsRepo;
    const log = quiet();
    const w = new SaveWriter(repo, log);
    w.autosave({ row: row(1), bytes: 10, kind: "a" });
    await vi.waitFor(() => expect(writes).toEqual([1])); // in flight
    w.autosave({ row: row(2), bytes: 10, kind: "b" }); // queued
    w.autosave({ row: row(3), bytes: 10, kind: "c" }); // replaces 2
    const final = w.after(async () => "done");
    release();
    expect(await final).toEqual({ ok: true, value: "done" });
    expect(writes).toEqual([1, 3]);
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ kind: "c", bytes: 10 }), "run_saved");
  });

  it("a failed write is logged run_save_failed and never rejects; a final op that throws is { ok: false }", async () => {
    const repo = { upsertOpen: () => Promise.reject(new Error("down")) } as unknown as SavedRunsRepo;
    const log = quiet();
    const w = new SaveWriter(repo, log);
    w.autosave({ row: row(1), bytes: 1, kind: "a" });
    expect(await w.after(() => Promise.reject(new Error("x")))).toEqual({ ok: false });
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ why: "db" }), "run_save_failed");
  });
});

describe("Story 8.4 (AC 8, E8-S6): the boot sweep", () => {
  it("every open run becomes resumable; each is handed on for its Supplies top-up; logged with the count", async () => {
    const database = fresh();
    const repo = savedRunsRepo(database);
    const a = await accountsRepo(database).createGuest(randomBytes(32).toString("hex"), "Ana");
    await repo.upsertOpen(row(4, a.id));
    const banked: string[] = [];
    const lg = quiet();
    expect(await releaseSavesOnBoot(repo, lg, async (id) => void banked.push(id))).toBe(1);
    await vi.waitFor(() => expect(banked).toEqual([RUN]));
    expect(lg.info).toHaveBeenCalledWith({ count: 1 }, "saved_runs_released");
    expect((await repo.listForAccount(a.id)).map((r) => r.wave)).toEqual([4]);
    expect(await releaseSavesOnBoot(null, lg)).toBe(0);
  });
});

describe("Story 8.6 (AC 11): GET /saved-runs", () => {
  it("the cookie's account's runs only; no cookie / unknown device → []; database down → 503; rate limited → 429", async () => {
    const database = fresh();
    const saves = savedRunsRepo(database);
    const accounts = accountsRepo(database);
    const token = randomBytes(16).toString("hex");
    const { hashGuestToken } = await import("./lobby");
    const a = await accounts.createGuest(hashGuestToken(token), "Ana");
    await saves.saveResumable(row(6, a.id), new Date(Date.now() + SAVE_KEEP_MS));
    const ipLimiter = new SlidingWindowLimiter(100, 60_000);
    const ok = await listSavedRuns(token, "1.2.3.4", { accounts, saves, ipLimiter });
    expect(ok.status).toBe(200);
    expect(ok.status === 200 && ok.body.map((r) => [r.id, r.wave, r.names])).toEqual([[RUN, 6, [{ name: "Ana", slot: 0 }]]]);
    expect(await listSavedRuns(undefined, "1.2.3.4", { accounts, saves, ipLimiter })).toEqual({ status: 200, body: [] });
    expect(await listSavedRuns(randomBytes(16).toString("hex"), "1.2.3.4", { accounts, saves, ipLimiter })).toEqual({ status: 200, body: [] });
    const down = { ...saves, listForAccount: () => Promise.reject(new Error("down")) };
    expect(await listSavedRuns(token, "1.2.3.4", { accounts, saves: down, ipLimiter })).toEqual({ status: 503, error: "save_unavailable" });
    expect(await listSavedRuns(token, "9.9.9.9", { accounts, saves, ipLimiter: new SlidingWindowLimiter(0, 60_000) })).toEqual({ status: 429, error: "rate_limited" });
  });
});

describe("Story 8.4 (AC 5): capture cost", () => {
  it("capture + JSON of a 4-player wave-6 build ≤ 3 ms p99 (asserted with PERF_ASSERT=1; always measured)", () => {
    const { world, seats } = playToBuild({ players: 4, waves: 6, buildings: 24 });
    const meta = { runId: RUN, district: "downtown" };
    for (let i = 0; i < 20; i++) JSON.stringify(captureRunSave(world, seats, meta)); // warm-up (the JIT)
    const ms: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      JSON.stringify(captureRunSave(world, seats, meta));
      ms.push(performance.now() - t0);
    }
    ms.sort((x, y) => x - y);
    const p99 = ms[Math.floor(ms.length * 0.99)] as number;
    expect(p99).toBeGreaterThan(0);
    if (process.env.PERF_ASSERT === "1") expect(p99).toBeLessThanOrEqual(3);
  });
});
