import { type SQL, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { type Database, type Db, openPglite } from "./client";
import { SAVE_KEEP_MS, savedRunsRepo, type SaveRow } from "./savedRunsRepo";

/** Stories 8.4–8.6 (AC 1, 2; S3, D13, E8-S6, E8-S11): the saved_runs migration and `savedRunsRepo`. */
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
async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}
const RUN = "0f1e2d3c-4b5a-4968-8776-655443322110";
const RUN2 = "1f1e2d3c-4b5a-4968-8776-655443322111";
const later = () => new Date(Date.now() + SAVE_KEEP_MS);
let hashN = 0;
const guest = (database: Database) => accountsRepo(database).createGuest((++hashN).toString(16).padStart(64, "0"), "Ana");
const row = (id: string, links: { id: string }[], over: Partial<SaveRow> = {}): SaveRow => ({
  id,
  district: "downtown",
  seed: 4_000_000_000,
  snapshot: { schemaVersion: 1, wave: 3, big: "x".repeat(100) },
  schemaVersion: 1,
  wave: 3,
  names: [{ name: "Ana", slot: 0 }, { name: "Bo", slot: 1 }],
  roomCode: "ABCD",
  links: links.map((l) => ({ accountId: l.id, seatKey: `acct:${l.id}` })),
  ...over,
});

describe("Story 8.4 AC 1: the saved_runs migration", () => {
  it("creates both tables, the status check and the account index", async () => {
    const database = fresh();
    const db = await database.db();
    const t = await rows<{ table_name: string }>(db, sql`select table_name from information_schema.tables where table_name in ('saved_runs','saved_run_players') order by 1`);
    expect(t.map((r) => r.table_name)).toEqual(["saved_run_players", "saved_runs"]);
    const idx = await rows<{ indexname: string }>(db, sql`select indexname from pg_indexes where tablename = 'saved_run_players'`);
    expect(idx.map((r) => r.indexname)).toContain("saved_run_players_account_idx");
    await expect(db.execute(sql`insert into saved_runs (id, district, seed, snapshot, schema_version, wave, names, status) values (${RUN}, 'd', 1, '{}', 1, 1, '[]', 'lost')`)).rejects.toThrow();
  });
});

describe("Story 8.4–8.6: savedRunsRepo", () => {
  it("an autosave is 'open' (nobody can resume it); a resumable save is listed to its linked accounts only", async () => {
    const database = fresh();
    const [a, b, c] = [await guest(database), await guest(database), await guest(database)];
    const repo = savedRunsRepo(database);
    expect(await repo.upsertOpen(row(RUN, [a, b]))).toBe(true);
    expect(await repo.listForAccount(a.id)).toEqual([]);
    expect((await repo.claim(RUN, a.id, "WXYZ")).outcome).toBe("busy");
    expect(await repo.saveResumable(row(RUN, [a, b], { wave: 4 }), later())).toBe(true);
    const list = await repo.listForAccount(a.id);
    expect(list.map((r) => [r.id, r.wave, r.names.length])).toEqual([[RUN, 4, 2]]);
    expect(await repo.listForAccount(c.id)).toEqual([]);
    // a made-up account id never fails a save (no link)
    expect(await repo.saveResumable(row(RUN2, [a, { id: "9f1e2d3c-4b5a-4968-8776-655443322119" }]), later())).toBe(true);
    // a 'saved' row is never overwritten (its room is gone; only a claim reopens it)
    expect(await repo.saveResumable(row(RUN, [a]), later())).toBe(false);
  });

  it("S3: claim opens the save once; a second claim says busy; another account or a guessed id says gone", async () => {
    const database = fresh();
    const [a, b, c] = [await guest(database), await guest(database), await guest(database)];
    const repo = savedRunsRepo(database);
    await repo.upsertOpen(row(RUN, [a, b]));
    await repo.saveResumable(row(RUN, [a, b]), later());
    const first = await repo.claim(RUN, a.id, "ROOM");
    expect(first.outcome).toBe("claimed");
    if (first.outcome === "claimed") expect(first.snapshot.wave).toBe(3);
    expect((await repo.claim(RUN, b.id, "ROM2")).outcome).toBe("busy");
    expect((await repo.claim(RUN, c.id, "ROM3")).outcome).toBe("gone");
    expect((await repo.claim(RUN2, a.id, "ROM4")).outcome).toBe("gone");
    expect((await repo.claim("not-a-uuid", a.id, "ROM5")).outcome).toBe("gone");
    // the winner's lobby closed before Start: resumable again; a stale room can't release or delete it
    expect(await repo.releaseOpen(RUN, "ROM2")).toBe(false);
    expect(await repo.deleteRun(RUN, "ROM2")).toBe(false);
    expect(await repo.releaseOpen(RUN, "ROOM")).toBe(true);
    expect((await repo.claim(RUN, b.id, "ROM6")).outcome).toBe("claimed");
    // only the holder writes it
    expect(await repo.upsertOpen(row(RUN, [a, b], { roomCode: "ROOM" }))).toBe(false);
    expect(await repo.upsertOpen(row(RUN, [a, b], { roomCode: "ROM6", wave: 5 }))).toBe(true);
  });

  it("concurrent claims: exactly one wins", async () => {
    const database = fresh();
    const [a, b] = [await guest(database), await guest(database)];
    const repo = savedRunsRepo(database);
    await repo.saveResumable(row(RUN, [a, b]), later());
    const r = await Promise.all([repo.claim(RUN, a.id, "R001"), repo.claim(RUN, b.id, "R002"), repo.claim(RUN, a.id, "R003")]);
    expect(r.filter((x) => x.outcome === "claimed")).toHaveLength(1);
  });

  it("an expired save is gone (not listed, not claimable)", async () => {
    const database = fresh();
    const a = await guest(database);
    const repo = savedRunsRepo(database);
    await repo.saveResumable(row(RUN, [a]), new Date(Date.now() - 1000));
    expect(await repo.listForAccount(a.id)).toEqual([]);
    expect((await repo.claim(RUN, a.id, "R001")).outcome).toBe("gone");
  });

  it("mid-wave shutdown: markSaved makes this room's last autosave resumable; deleteRun loses it", async () => {
    const database = fresh();
    const a = await guest(database);
    const repo = savedRunsRepo(database);
    await repo.upsertOpen(row(RUN, [a]));
    expect(await repo.markSaved(RUN, "OTHR", later())).toBe(false);
    expect(await repo.markSaved(RUN, "ABCD", later())).toBe(true);
    expect((await repo.listForAccount(a.id)).length).toBe(1);
    await repo.upsertOpen(row(RUN2, [a]));
    expect(await repo.deleteRun(RUN2, "ABCD")).toBe(true);
    expect((await database.db()).select).toBeDefined();
    expect((await repo.listForAccount(a.id)).map((r) => r.id)).toEqual([RUN]);
  });

  it("E8-S6: the boot sweep turns every open row resumable", async () => {
    const database = fresh();
    const a = await guest(database);
    const repo = savedRunsRepo(database);
    await repo.upsertOpen(row(RUN, [a]));
    await repo.upsertOpen(row(RUN2, [a], { roomCode: "EFGH" }));
    const swept = await repo.releaseOpenOnBoot(later());
    expect(swept.map((s) => s.id).sort()).toEqual([RUN, RUN2]);
    expect(swept[0]!.snapshot.wave).toBe(3);
    expect((await repo.listForAccount(a.id)).length).toBe(2);
    expect(await repo.releaseOpenOnBoot(later())).toEqual([]);
  });

  it("E8-S11: each account keeps its newest 3; a run nobody is linked to any more is deleted", async () => {
    const database = fresh();
    const [a, b] = [await guest(database), await guest(database)];
    const repo = savedRunsRepo(database);
    const ids = ["0", "1", "2", "3"].map((d) => `${d}f1e2d3c-4b5a-4968-8776-65544332211${d}`);
    for (const [i, id] of ids.entries()) {
      await repo.saveResumable(row(id, i === 0 ? [a, b] : i === 1 ? [a] : [a]), later());
      await new Promise((r) => setTimeout(r, 5));
    }
    const p = await repo.pruneAccount(a.id);
    expect(p.unlinked).toBe(1);
    expect(p.deleted).toEqual([]); // the oldest is still b's
    expect((await repo.listForAccount(a.id)).map((r) => r.id)).toEqual([ids[3], ids[2], ids[1]]);
    expect((await repo.listForAccount(b.id)).map((r) => r.id)).toEqual([ids[0]]);
    const db = await database.db();
    // an orphan (only a's, pushed out) is deleted
    await repo.saveResumable(row("4f1e2d3c-4b5a-4968-8776-655443322114", [a]), later());
    const q = await repo.pruneAccount(a.id);
    expect(q.deleted).toEqual([ids[1]]);
    const left = await rows<{ n: number }>(db, sql`select count(*)::int as n from saved_runs`);
    expect(left[0]!.n).toBe(4);
  });

  it("a dead database rejects (the caller logs and plays on)", async () => {
    const database: Database = { kind: "pglite", db: () => Promise.reject(new Error("down")), close: async () => {} };
    const repo = savedRunsRepo(database, 50);
    await expect(repo.upsertOpen(row(RUN, []))).rejects.toThrow();
    await expect(repo.listForAccount(RUN)).rejects.toThrow();
    await expect(repo.claim(RUN, RUN, "X")).rejects.toThrow();
  });
});
