import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { lootPartKeys, milestonePartKey } from "@topdown/shared";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { type Database, openPglite } from "./client";
import { MIGRATIONS_FOLDER } from "./migrate";
import { progressRepo } from "./progressRepo";
import { seatMeta, type RunFacts } from "../meta/runMeta";
import type { MetaPlayer } from "../meta/banking";

/**
 * Stories 7.7 + 7.11 + 7.12 (brief 18, 21): the meta writes inside 7.2's bank transaction — milestone parts once per
 * account, lifetime stats added under the row lock (two runs at once both count), a retry writes nothing again, the
 * loot item from the unowned parts (Collector at ten), District 2 on an extraction from Downtown only.
 */
log.level = process.env.LOG_LEVEL ?? "silent";
const open: Database[] = [];
const fresh = (): Database => {
  const d = openPglite();
  open.push(d);
  return d;
};
afterEach(async () => {
  for (const d of open.splice(0)) await d.close();
});
let runN = 0;
const runId = (): string => `00000000-0000-4000-8000-${String(++runN).padStart(12, "0")}`;
const pay = () => () => ({ supplies: 10, breakdown: { waves: 10 } });
const waves = (a: number, b: number): number => {
  let m = 0;
  for (let n = a; n <= b; n++) m |= 1 << (n - 1);
  return m >>> 0;
};
const player = (over: Partial<MetaPlayer> = {}): MetaPlayer => ({ waveMask: waves(1, 5), kills: 30, revives: 2, downs10: 1, barricades: 3, bossesIn: 0, ...over });
const facts = (over: Partial<RunFacts> = {}): RunFacts => ({ district: "downtown", extractedAllFour: false, lootFoundBy: null, lootWave: 0, lootItemRoll: 0, ...over });
async function account(database: Database, hash = "e".repeat(64)) {
  return accountsRepo(database).createGuest(hash, "Ana");
}

describe("Stories 7.7 / 7.11 / 7.12: the bank's meta writes (PGlite)", () => {
  it("7.11: M1 granted with the first bank; a second qualifying run grants nothing new (M-F3); stats add up", async () => {
    const database = fresh();
    const acct = await account(database);
    const repo = progressRepo(database);
    const a = await repo.addSupplies(runId(), acct.id, pay(), seatMeta("p0", player() as never, false, facts()));
    expect(a.breakdown.newItems).toEqual([{ key: "head:fire", name: "Firefighter helmet", reason: "survived wave 5" }]);
    const b = await repo.addSupplies(runId(), acct.id, pay(), seatMeta("p0", player() as never, false, facts()));
    expect(b.breakdown.newItems).toEqual([]);
    const row = await repo.get(acct.id);
    expect(row?.cosmetics).toEqual(["head:fire"]);
    expect(row?.stats).toEqual({ revives: 4, kills: 60, barricades: 6, runs: 2 });
  });

  it("7.11 AC 5 / M-F5: lifetime milestones on the stats AFTER the increment; two runs of one account ending at once both add", async () => {
    const database = fresh();
    const acct = await account(database);
    const repo = progressRepo(database);
    await repo.addSupplies(runId(), acct.id, pay(), seatMeta("p0", player({ kills: 990, waveMask: 0 }) as never, false, facts()));
    const [x, y] = await Promise.all([
      repo.addSupplies(runId(), acct.id, pay(), seatMeta("p0", player({ kills: 5, waveMask: 0 }) as never, false, facts())),
      repo.addSupplies(runId(), acct.id, pay(), seatMeta("p0", player({ kills: 5, waveMask: 0 }) as never, false, facts())),
    ]);
    expect((await repo.get(acct.id))?.stats.kills).toBe(1000);
    // exactly one of the two (the second under the lock) crossed 1,000 and got the camo coat
    const granted = [x, y].map((r) => (r.breakdown.newItems as { key: string }[]).map((i) => i.key));
    expect(granted.flat()).toEqual([milestonePartKey("m6")]);
  });

  it("7.11 AC 6: a retry of the same run (or a second endRun) adds no stats and grants nothing again", async () => {
    const database = fresh();
    const acct = await account(database);
    const repo = progressRepo(database);
    const id = runId();
    const meta = seatMeta("p0", player() as never, false, facts());
    const first = await repo.addSupplies(id, acct.id, pay(), meta);
    const again = await repo.addSupplies(id, acct.id, pay(), meta);
    expect(again.banked).toBe(false);
    expect(again.breakdown.newItems).toEqual(first.breakdown.newItems); // replayed from run_rewards
    expect((await repo.get(acct.id))?.stats).toEqual({ revives: 2, kills: 30, barricades: 3, runs: 1 });
  });

  it("7.12 AC 8 / B6: the finder gets an unowned loot part from itemRoll; with all ten owned → Collector (no item)", async () => {
    const database = fresh();
    const acct = await account(database);
    const repo = progressRepo(database);
    const loot = lootPartKeys();
    const found = (roll: number) => seatMeta("p0", player({ waveMask: 0 }) as never, false, facts({ lootFoundBy: "p0", lootWave: 6, lootItemRoll: roll }));
    const r = await repo.addSupplies(runId(), acct.id, pay(), found(0));
    expect(r.breakdown.loot).toEqual({ wave: 6, key: loot[0], name: "Floral shirt" });
    const notFinder = await repo.addSupplies(runId(), acct.id, pay(), seatMeta("p1", player({ waveMask: 0 }) as never, false, facts({ lootFoundBy: "p0", lootWave: 6 })));
    expect(notFinder.breakdown.loot).toBeUndefined();
    for (let i = 1; i < 10; i++) await repo.addSupplies(runId(), acct.id, pay(), found(0)); // always the first unowned one
    expect((await repo.get(acct.id))?.cosmetics.sort()).toEqual([...loot].sort());
    const collector = await repo.addSupplies(runId(), acct.id, pay(), found(0.5));
    expect(collector.breakdown.loot).toEqual({ wave: 6, key: null, name: "" });
    expect((await repo.get(acct.id))?.cosmetics).toHaveLength(10);
  });

  it("7.7 R1: an extraction from Downtown adds District 2 once; a wipe, a quit or another district adds nothing", async () => {
    const database = fresh();
    const acct = await account(database);
    const repo = progressRepo(database);
    const wiped = await repo.addSupplies(runId(), acct.id, pay(), seatMeta("p0", player() as never, false, facts()));
    expect(wiped.breakdown.newDistricts).toEqual([]);
    const ext = await repo.addSupplies(runId(), acct.id, pay(), seatMeta("p0", player() as never, true, facts()));
    expect(ext.breakdown.newDistricts).toEqual([{ id: "district_2", name: "District 2" }]);
    expect(ext.breakdown.newItems).toContainEqual({ key: "head:riot", name: "Riot helmet", reason: "first extraction" }); // 7.11 M2 from the same extract
    const again = await repo.addSupplies(runId(), acct.id, pay(), seatMeta("p0", player() as never, true, facts()));
    expect(again.breakdown.newDistricts).toEqual([]);
    expect((await repo.get(acct.id))?.districts).toEqual(["district_2"]);
  });

  it("brief 21: migration 0003 runs forward on a copy of the 0002 schema with rows in it (defaults filled, rows kept)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mig3-"));
    try {
      cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
      const journalPath = join(dir, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      expect(journal.entries.map((e) => e.tag).slice(-2)).toEqual(["0002_look", "0003_milestones_loot"]);
      writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.tag !== "0003_milestones_loot") }));
      const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite"), import("drizzle-orm/pglite/migrator")]);
      const client = new PGlite();
      try {
        const db = drizzle({ client });
        await migrate(db, { migrationsFolder: dir });
        await db.execute(sql`insert into accounts (guest_token_hash, display_name) values (${"d".repeat(64)}, 'Old')`);
        await db.execute(sql`insert into progress (account_id, supplies, look) select id, 77, 'v1' from accounts`);
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
        const r = await db.execute(sql`select supplies, look, cosmetics, stats from progress`);
        expect((r as unknown as { rows: unknown[] }).rows).toEqual([{ supplies: 77, look: "v1", cosmetics: [], stats: { revives: 0, kills: 0, barricades: 0, runs: 0 } }]);
      } finally {
        await client.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
