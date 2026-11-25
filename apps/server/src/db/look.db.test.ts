/**
 * Story 7.9 T2 (AC 1): the `progress.look` column. The migration adds `look` and nothing else; it runs forward on a
 * copy of 7.1's schema with rows in it (brief 21); the repository reads it (null by default, a stored code unchanged).
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { type Database, openPglite } from "./client";
import { MIGRATIONS_FOLDER } from "./migrate";
import { progressRepo } from "./progressRepo";

log.level = process.env.LOG_LEVEL ?? "silent";
const open: Database[] = [];
afterEach(async () => {
  for (const d of open.splice(0)) await d.close();
});

const CODE = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:aa0000,00bb00,0000cc";
const look7 = readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith(".sql")).find((f) => f.endsWith("_look.sql"));

describe("progress.look (Story 7.9 AC 1)", () => {
  it("the 7.9 migration adds the nullable look column to progress and nothing else", () => {
    expect(look7).toBeDefined();
    const text = readFileSync(join(MIGRATIONS_FOLDER, look7 as string), "utf8").trim();
    expect(text).toBe('ALTER TABLE "progress" ADD COLUMN "look" text;');
  });

  it("review M3: the look migration's journal `when` is newer than every earlier one (Drizzle skips older ones silently)", () => {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as { entries: { tag: string; when: number; idx: number }[] };
    const mine = journal.entries.find((e) => `${e.tag}.sql` === look7);
    expect(mine).toBeDefined();
    const earlier = journal.entries.filter((e) => e.idx < (mine as { idx: number }).idx);
    expect(earlier.length).toBeGreaterThanOrEqual(2); // 7.1's 0000_init and 7.2's 0001_run_rewards come first
    for (const e of earlier) expect((mine as { when: number }).when).toBeGreaterThan(e.when);
    expect(look7).toBe("0002_look.sql");
  });

  it("runs forward on the schema before it (7.1 + 7.2, as the VPS has it) with rows in it: the rows stay, the look column exists, null", async () => {
    // A migrations folder with only the migrations before this one (7.1's 0000_init), as the VPS has today.
    const dir = mkdtempSync(join(tmpdir(), "td-mig-"));
    try {
      const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
      // Story 7.6: later migrations (0003_accounts_devices) follow the look one: keep only the ones BEFORE it.
      const lookAt = journal.entries.findIndex((e) => `${e.tag}.sql` === look7);
      expect(lookAt).toBeGreaterThan(0);
      const before = journal.entries.slice(0, lookAt);
      cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
      for (const f of readdirSync(dir)) if (f === look7) rmSync(join(dir, f));
      writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: before }));
      const client = new PGlite();
      const db = drizzle({ client });
      await migrate(db, { migrationsFolder: dir });
      const applied = (await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)) as unknown as { rows: { n: number }[] };
      expect(applied.rows[0]?.n).toBe(lookAt); // 0000 and 7.2's 0001 applied, not the look
      const noLook = (await db.execute(sql`select count(*)::int as n from information_schema.columns where table_name = 'progress' and column_name = 'look'`)) as unknown as { rows: { n: number }[] };
      expect(noLook.rows[0]?.n).toBe(0);
      await db.execute(sql`insert into accounts (guest_token_hash, display_name) values (${"c".repeat(64)}, 'Ana')`);
      await db.execute(sql`insert into progress (account_id, supplies) select id, 7 from accounts`);
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }); // the deploy: only the new migration runs
      const hasLook = (await db.execute(sql`select count(*)::int as n from information_schema.columns where table_name = 'progress' and column_name = 'look'`)) as unknown as { rows: { n: number }[] };
      expect(hasLook.rows[0]?.n).toBe(1); // review M3: the migration really ran (not skipped)
      const rows = (await db.execute(sql`select supplies, look from progress`)) as unknown as { rows: { supplies: number; look: string | null }[] };
      expect(rows.rows).toEqual([{ supplies: 7, look: null }]);
      await client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the repository returns null by default and a stored code unchanged (this story never writes it)", async () => {
    const database = openPglite();
    open.push(database);
    const acct = await accountsRepo(database).createGuest("d".repeat(64), "");
    const progress = progressRepo(database);
    expect((await progress.get(acct.id))?.look).toBeNull();
    const db = await database.db();
    await db.execute(sql`update progress set look = ${CODE} where account_id = ${acct.id}`); // 7.10's editor writes it
    expect((await progress.get(acct.id))?.look).toBe(CODE);
  });
});
