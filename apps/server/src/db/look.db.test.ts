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

  it("runs forward on 7.1's schema with rows in it: the rows stay, their look is null", async () => {
    // A migrations folder with only the migrations before this one (7.1's 0000_init), as the VPS has today.
    const dir = mkdtempSync(join(tmpdir(), "td-mig-"));
    try {
      const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
      const before = journal.entries.filter((e) => `${e.tag}.sql` !== look7);
      expect(before.length).toBe(journal.entries.length - 1);
      cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
      for (const f of readdirSync(dir)) if (f === look7) rmSync(join(dir, f));
      writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: before }));
      const client = new PGlite();
      const db = drizzle({ client });
      await migrate(db, { migrationsFolder: dir });
      await db.execute(sql`insert into accounts (guest_token_hash, display_name) values (${"c".repeat(64)}, 'Ana')`);
      await db.execute(sql`insert into progress (account_id, supplies) select id, 7 from accounts`);
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }); // the deploy: only the new migration runs
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
