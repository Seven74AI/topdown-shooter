import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { REPORT_DAILY_MAX, reportRequestSchema, type ReportPayload } from "@topdown/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { openPostgres, type Database } from "./client";
import { migrateDb } from "./migrate";
import { reportsRepo } from "./reportsRepo";

/**
 * Story 10.6 (B3): the daily report limit under a race, on a REAL PostgreSQL (PGlite runs on one connection and can't
 * race). Opt-in like the other real-PG files: `TEST_DATABASE_URL=postgres://… npx vitest run realPostgresReports
 * --no-file-parallelism`.
 */
const URL = process.env.TEST_DATABASE_URL;
log.level = process.env.LOG_LEVEL ?? "silent";
let database: Database;
const hex = () => randomUUID().replace(/-/g, "").padEnd(64, "0");
const payload: ReportPayload = { lines: ["l"], device: { userAgent: "t", screen: { w: 1, h: 1 }, viewport: { w: 1, h: 1 }, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, input: "touch", language: "en", installed: false } };

describe.skipIf(!URL)("Story 10.6: the daily report limit on real PostgreSQL (TEST_DATABASE_URL)", () => {
  beforeAll(async () => {
    database = openPostgres(URL as string);
    await migrateDb({ kind: "postgres", db: await database.db() });
  });
  afterAll(async () => database?.close());

  it(`one account sends 25 reports at once over separate connections, ×5: exactly ${REPORT_DAILY_MAX} rows, 5 limited, no error`, async () => {
    for (let round = 0; round < 5; round++) {
      const token = hex();
      const a = await accountsRepo(database).createGuest(token, "");
      const repo = reportsRepo(database);
      const results = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => repo.insert(token, `r${round}.${i}`, payload)));
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected, rejected.map((r) => String((r as PromiseRejectedResult).reason)).join("; ")).toHaveLength(0);
      const outcomes = (results as PromiseFulfilledResult<{ outcome: string }>[]).map((r) => r.value.outcome);
      expect(outcomes.filter((o) => o === "stored")).toHaveLength(REPORT_DAILY_MAX);
      expect(outcomes.filter((o) => o === "limited")).toHaveLength(25 - REPORT_DAILY_MAX);
      const rows = (await (await database.db()).execute(sql`select count(*)::int as n from problem_reports where account_id = ${a.id}`)) as unknown as { rows: { n: number }[] };
      expect(rows.rows[0]?.n).toBe(REPORT_DAILY_MAX);
    }
  });

  it("review M1: NUL, a lone high and a lone low surrogate (note and lines) are refused raw by PostgreSQL, and stored once cleaned by the request schema", async () => {
    const repo = reportsRepo(database);
    for (const bad of ["a\u0000b", "x\uD83Dy", "x\uDE00y"]) {
      const token = hex();
      await accountsRepo(database).createGuest(token, "");
      // the raw string (what the route stored before the fix) fails on every try
      await expect(repo.insert(token, bad, { ...payload, lines: [bad] }), JSON.stringify(bad)).rejects.toThrow();
      // through the request schema (the route parses with it), it is stored
      const req = reportRequestSchema.parse({ note: bad, payload: { ...payload, lines: [bad, "ok 😀"] } });
      const r = await repo.insert(token, req.note, req.payload);
      expect(r.outcome, JSON.stringify(bad)).toBe("stored");
      if (r.outcome !== "stored") continue;
      const row = await repo.byId(r.id);
      // eslint-disable-next-line no-control-regex -- Story 10.6 review M1/M2: matching control characters is the point
      expect(row?.note).toBe(bad.replace(/\u0000|[\uD800-\uDFFF]/g, ""));
      expect(row?.payload.lines).toEqual([row?.note, "ok 😀"]);
    }
  });
});
