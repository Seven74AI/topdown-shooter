import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReportPayload } from "@topdown/shared";
import { type Database, openPglite } from "../db/client";
import { reportsRepo } from "../db/reportsRepo";
import { accountsRepo } from "../db/accountsRepo";
import { backdateReportsForTest, countReportsForTest } from "../db/testQueries";
import { hashGuestToken } from "../run/lobby";
import { HOUSEKEEPING_BATCH, housekeepingSteps, runHousekeeping, startHousekeeping, type HousekeepingStep } from "./housekeeping";
import { log } from "./logger";

/** Story 10.6 (AC 6; B5): the daily housekeeping job. */
const payload: ReportPayload = { lines: [], device: { userAgent: "t", screen: { w: 1, h: 1 }, viewport: { w: 1, h: 1 }, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, input: "mouse", language: "en", installed: false } };
let database: Database;
const silent = { info: vi.fn(), error: vi.fn() };

beforeAll(async () => {
  log.level = "silent";
  database = openPglite(); // migrated on first use
});
afterAll(async () => database.close());

async function guestWith(reports: number, token: string): Promise<{ id: string; ids: string[] }> {
  const acc = await accountsRepo(database).createGuest(hashGuestToken(token), "t");
  const repo = reportsRepo(database);
  const ids: string[] = [];
  for (let i = 0; i < reports; i++) {
    const r = await repo.insert(hashGuestToken(token), `n${i}`, payload, { dailyMax: 1_000_000 });
    if (r.outcome !== "stored") throw new Error(r.outcome);
    ids.push(r.id);
  }
  return { id: acc!.id, ids };
}

describe("Story 10.6 AC 6: housekeeping deletes reports older than 30 days", () => {
  it("31-day rows go, 29-day rows stay; the count is logged in housekeeping_done", async () => {
    const before = await countReportsForTest(database);
    const a = await guestWith(4, "1".repeat(32));
    await backdateReportsForTest(database, { ids: a.ids.slice(0, 2) }, 31 * 24);
    await backdateReportsForTest(database, { ids: a.ids.slice(2) }, 29 * 24);
    const logger = { info: vi.fn(), error: vi.fn() };
    const done = await runHousekeeping({ reports: reportsRepo(database) }, housekeepingSteps, logger);
    expect(done).toEqual({ problemReports: 2 });
    expect(logger.info).toHaveBeenCalledWith({ problemReports: 2 }, "housekeeping_done");
    expect(await countReportsForTest(database)).toBe(before + 2);
  });

  it(`deletes in batches (2500 rows / 1000 = 3 statements, scaled down: 25 rows / 10); the job passes ${HOUSEKEEPING_BATCH}`, async () => {
    const statements: number[] = [];
    const repo = reportsRepo(database, undefined, (n) => statements.push(n));
    const a = await guestWith(25, "2".repeat(32));
    await backdateReportsForTest(database, { accountId: a.id }, 40 * 24);
    expect(await repo.deleteOlderThan(30, 10)).toBe(25);
    expect(statements).toEqual([10, 10, 5]);
    expect((await repo.list(5000)).filter((r) => a.ids.includes(r.id))).toHaveLength(0);
    const spy = vi.fn(async () => 0);
    await runHousekeeping({ reports: { deleteOlderThan: spy } }, housekeepingSteps, silent);
    expect(spy).toHaveBeenCalledWith(30, HOUSEKEEPING_BATCH);
  });

  it("a failing step is logged alone (housekeeping_step_failed) and the next step still runs", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const steps: HousekeepingStep[] = [
      { name: "broken", run: () => Promise.reject(new Error("boom")) },
      { name: "fine", run: async () => 7 },
    ];
    const done = await runHousekeeping({ reports: reportsRepo(database) }, steps, logger);
    expect(done).toEqual({ fine: 7 });
    expect(logger.error).toHaveBeenCalledWith({ step: "broken", err: "boom" }, "housekeeping_step_failed");
    expect(logger.info).toHaveBeenCalledWith({ fine: 7 }, "housekeeping_done");
  });

  it("the schedule: first run after the delay, then every interval; stop() stops it", async () => {
    vi.useFakeTimers();
    try {
      const deleteOlderThan = vi.fn(async () => 0);
      const stop = startHousekeeping({ reports: { deleteOlderThan } }, { firstDelayMs: 1000, intervalMs: 5000 });
      await vi.advanceTimersByTimeAsync(999);
      expect(deleteOlderThan).toHaveBeenCalledTimes(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(deleteOlderThan).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(deleteOlderThan).toHaveBeenCalledTimes(3);
      stop();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(deleteOlderThan).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
