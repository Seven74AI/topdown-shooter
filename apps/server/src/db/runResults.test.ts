import { type SQL, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../ops/logger";
import { runHousekeeping } from "../ops/housekeeping";
import { accountsRepo } from "./accountsRepo";
import { type Database, type Db, openPglite } from "./client";
import { ORPHAN_RUN_MS, runResultsRepo, savedSeats, type RunEndRow, type RunSeatRow } from "./runResultsRepo";
import { SAVE_KEEP_MS, savedRunsRepo, type SaveRow } from "./savedRunsRepo";

/** Story 10.7 (AC 1, 2, 4, 5, 6; B1–B6, B8): `runResultsRepo` and the expiry step on PGlite. */
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
const RUN3 = "2f1e2d3c-4b5a-4968-8776-655443322112";
let hashN = 0;
const guest = (database: Database) => accountsRepo(database).createGuest((++hashN).toString(16).padStart(64, "0"), "Ana");
const noReports = { deleteOlderThan: async () => 0 };
const start = { id: RUN, district: "downtown", seed: 4_000_000_000 };
const end = (over: Partial<RunEndRow> = {}): RunEndRow => ({ ...start, waveReached: 7, ending: "wiped", endless: false, nightMs: 60_000, ...over });
const seat = (n: number, accountId: string | null, over: Partial<RunSeatRow> = {}): RunSeatRow => ({ seat: `p${n}#0`, accountId, slot: n, loadout: "smg", wavesIn: 6, kills: 40 + n, ...over });
const runRow = async (d: Database, id = RUN) => (await rows<Record<string, unknown>>(await d.db(), sql`select * from run_results where id = ${id}`))[0];
const seatRows = async (d: Database, id = RUN) => rows<Record<string, unknown>>(await d.db(), sql`select seat, account_id, slot, loadout, waves_in, kills from run_result_players where run_id = ${id} order by seat`);

/** A minimal version-1 RunSave snapshot (what `migrateRunSave` accepts) with these seats. */
function snapshot(id: string, seats: { playerId: string; seatGen: number; accountId: string | null; slot: number; player: Record<string, unknown> }[], endless = false): Record<string, unknown> {
  return { schemaVersion: 1, runId: id, seed: 7, phase: "build", world: { run: { endless } }, seats: seats.map((s) => ({ seatKey: s.accountId ? `acct:${s.accountId}` : "guest:x", name: "Ana", look: "", kills: 0, buildIdx: 0, ...s })) };
}
const saveRow = (id: string, snap: Record<string, unknown>, links: string[]): SaveRow => ({ id, district: "harbor", seed: 9, snapshot: snap, schemaVersion: 1, wave: 4, names: [], roomCode: "ABCD", links: links.map((a) => ({ accountId: a, seatKey: `acct:${a}` })) });

describe("Story 10.7 AC 1: the run_results migration", () => {
  it("creates both tables, the ending check, both indexes, the cascade and the set-null foreign keys", async () => {
    const d = fresh();
    const db = await d.db();
    const idx = await rows<{ indexname: string }>(db, sql`select indexname from pg_indexes where tablename in ('run_results', 'run_result_players') order by 1`);
    expect(idx.map((r) => r.indexname)).toEqual(expect.arrayContaining(["run_result_players_account_idx", "run_results_ended_idx"]));
    await expect(db.execute(sql`insert into run_results (id, district, seed, ending) values (${RUN}, 'd', 1, 'quit')`)).rejects.toThrow();
    const fks = await rows<{ delete_rule: string; constraint_name: string }>(db, sql`select constraint_name, delete_rule from information_schema.referential_constraints where constraint_name like 'run_result_players%' order by 1`);
    expect(fks.map((f) => f.delete_rule).sort()).toEqual(["CASCADE", "SET NULL"]);
  });
});

describe("Story 10.7: start, resumed, finish (B1, B4, B8)", () => {
  it("start → finish: one finished row, one seat row each; the stats see it", async () => {
    const d = fresh();
    const a = await guest(d);
    const repo = runResultsRepo(d);
    await repo.start(start);
    const open = await runRow(d);
    expect(open?.ended_at).toBeNull();
    expect(open?.nights_played).toBe(1);
    expect((await repo.statsRows(null)).runs).toEqual([]); // open rows are never read
    expect(await repo.finish(end({ ending: "extracted", waveReached: 10 }), [seat(0, a.id, { loadout: "shotgun+smg" }), seat(1, null)])).toBe(true);
    const r = await runRow(d);
    expect(r).toMatchObject({ ending: "extracted", extracted: true, wave_reached: 10, player_count: 2, endless: false, nights_played: 1 });
    expect(r?.ended_at).not.toBeNull();
    expect(new Date(r?.started_at as string).getTime()).toBe(new Date(open?.started_at as string).getTime()); // night 1's start kept
    expect(await seatRows(d)).toEqual([
      { seat: "p0#0", account_id: a.id, slot: 0, loadout: "shotgun+smg", waves_in: 6, kills: 40 },
      { seat: "p1#0", account_id: null, slot: 1, loadout: "smg", waves_in: 6, kills: 41 },
    ]);
    const stats = await repo.statsRows(null);
    expect(stats.runs).toHaveLength(1);
    expect(stats.seats.map((s) => s.member)).toEqual([a.id, null]);
  });

  it("B8: a finish whose start write was lost inserts the run (started_at = now − the night)", async () => {
    const d = fresh();
    const repo = runResultsRepo(d);
    expect(await repo.finish(end({ nightMs: 3_600_000 }), [seat(0, null)])).toBe(true);
    const r = await runRow(d);
    const ms = new Date(r?.ended_at as string).getTime() - new Date(r?.started_at as string).getTime();
    expect(ms).toBeGreaterThanOrEqual(3_600_000 - 1000);
    expect(ms).toBeLessThanOrEqual(3_600_000 + 1000);
  });

  it("B4: a second finish changes nothing and writes no seats (exactly one finisher)", async () => {
    const d = fresh();
    const repo = runResultsRepo(d);
    await repo.start(start);
    expect(await repo.finish(end(), [seat(0, null)])).toBe(true);
    expect(await repo.finish(end({ ending: "extracted", waveReached: 12 }), [seat(0, null, { loadout: "x" }), seat(1, null)])).toBe(false);
    expect(await runRow(d)).toMatchObject({ ending: "wiped", wave_reached: 7, player_count: 1 });
    expect(await seatRows(d)).toHaveLength(1);
  });

  it("AC 4: two resumes → nights_played 3; a resume of a finished run changes nothing; a lost start row is a 2-night row", async () => {
    const d = fresh();
    const repo = runResultsRepo(d);
    await repo.start(start);
    await repo.start(start); // a repeat start does nothing
    await repo.resumed(start);
    await repo.resumed(start);
    expect((await runRow(d))?.nights_played).toBe(3);
    await repo.finish(end(), []);
    await repo.resumed(start);
    expect((await runRow(d))?.nights_played).toBe(3);
    await repo.resumed({ ...start, id: RUN2 });
    expect((await runRow(d, RUN2))?.nights_played).toBe(2);
  });

  it("B5: a seat whose account was deleted (or never existed) is written with a null account, never a 23503", async () => {
    const d = fresh();
    const repo = runResultsRepo(d);
    expect(await repo.finish(end(), [seat(0, RUN3), seat(1, "not-a-uuid")])).toBe(true);
    expect((await seatRows(d)).map((s) => s.account_id)).toEqual([null, null]);
  });

  it("a seat id is the key: a reused slot (8.3) is two rows; a repeated seat is one", async () => {
    const d = fresh();
    const repo = runResultsRepo(d);
    await repo.finish(end(), [seat(0, null), { ...seat(0, null), seat: "p0#1" }, seat(0, null)]);
    expect((await seatRows(d)).map((s) => s.seat)).toEqual(["p0#0", "p0#1"]);
    expect((await runRow(d))?.player_count).toBe(3); // as the room passed it (its seats are unique by construction)
  });
});

describe("Story 10.7 AC 6 (B5, B6): account deletion and merged guests", () => {
  it("deleting an account nulls its seat rows in the same transaction (merged guest too); the run and the numbers stay", async () => {
    const d = fresh();
    const db = await d.db();
    const accts = accountsRepo(d);
    const tokenA = (++hashN).toString(16).padStart(64, "0");
    const a = await accts.createGuest(tokenA, "Ana");
    const g = await guest(d);
    const other = await guest(d);
    await db.execute(sql`update accounts set merged_into = ${a.id} where id = ${g.id}`);
    const repo = runResultsRepo(d);
    await repo.finish(end(), [seat(0, a.id), seat(1, g.id), seat(2, other.id)]);
    const before = await repo.statsRows(null);
    expect(before.seats.map((s) => s.member)).toEqual([a.id, a.id, other.id]); // B6: the guest counts as its account
    expect((await accts.deleteAccount(tokenA, a.id, null, new Set([tokenA]))).outcome).toBe("deleted");
    expect(await seatRows(d)).toEqual([
      { seat: "p0#0", account_id: null, slot: 0, loadout: "smg", waves_in: 6, kills: 40 },
      { seat: "p1#0", account_id: null, slot: 1, loadout: "smg", waves_in: 6, kills: 41 },
      { seat: "p2#0", account_id: other.id, slot: 2, loadout: "smg", waves_in: 6, kills: 42 },
    ]);
    expect(await runRow(d)).toMatchObject({ ending: "wiped", wave_reached: 7, player_count: 3 });
  });
});

describe("Story 10.7 AC 5 (B3): the expiry step", () => {
  it("savedSeats reads an older (v1) snapshot through migrateRunSave: seat ids, endless waves added, bought weapons sorted", () => {
    const r = savedSeats(snapshot(RUN, [{ playerId: "p0", seatGen: 2, accountId: null, slot: 0, player: { wavesIn: 10, endlessWavesIn: 3, kills: 9, weaponsBought: ["smg", "axe", "smg"] } }, { playerId: "p1", seatGen: 0, accountId: null, slot: 1, player: { wavesIn: 2, endlessWavesIn: 0, kills: 1 } }], true));
    expect(r).toEqual({ endless: true, seats: [{ seat: "p0#2", accountId: null, slot: 0, loadout: "axe+smg", wavesIn: 13, kills: 9 }, { seat: "p1#0", accountId: null, slot: 1, loadout: "", wavesIn: 2, kills: 1 }] });
    expect(savedSeats({ junk: true })).toBeNull();
  });

  it("an expired unresumed save → abandoned at its expiry, seats from the save, the save deleted; a live save and an open run untouched; an 8-day orphan finished with no seats", async () => {
    const d = fresh();
    const db = await d.db();
    const a = await guest(d);
    const saves = savedRunsRepo(d);
    const repo = runResultsRepo(d);
    // RUN: expired unresumed (its row open since night 1).
    await repo.start(start);
    await saves.saveResumable(saveRow(RUN, snapshot(RUN, [{ playerId: "p0", seatGen: 0, accountId: a.id, slot: 0, player: { wavesIn: 4, endlessWavesIn: 0, kills: 12, weaponsBought: ["smg"] } }]), [a.id]), new Date(Date.now() + SAVE_KEEP_MS));
    const expiresAt = new Date(Date.now() - 3600_000);
    await db.execute(sql`update saved_runs set expires_at = ${expiresAt.toISOString()} where id = ${RUN}`);
    // RUN2: a live save (not expired) and RUN3: a run open in a room ('open' save row), both untouched.
    await repo.start({ ...start, id: RUN2 });
    await saves.saveResumable(saveRow(RUN2, snapshot(RUN2, []), [a.id]), new Date(Date.now() + SAVE_KEEP_MS));
    await repo.start({ ...start, id: RUN3 });
    await saves.upsertOpen(saveRow(RUN3, snapshot(RUN3, []), [a.id]));
    await db.execute(sql`update run_results set started_at = now() - ${`${ORPHAN_RUN_MS * 2} milliseconds`}::interval where id = ${RUN3}`);
    // An orphan: open, older than ORPHAN_RUN_MS, no save at all; and a young one with no save (left alone).
    const ORPHAN = "3f1e2d3c-4b5a-4968-8776-655443322113";
    const YOUNG = "4f1e2d3c-4b5a-4968-8776-655443322114";
    await repo.start({ ...start, id: ORPHAN });
    await repo.start({ ...start, id: YOUNG });
    await db.execute(sql`update run_results set started_at = now() - ${`${ORPHAN_RUN_MS + 60_000} milliseconds`}::interval where id = ${ORPHAN}`);

    const done = await runHousekeeping({ runResults: repo, reports: noReports }, undefined, { info: () => {}, error: () => {} });
    expect(done).toEqual({ problemReports: 0, expireAbandonedRuns: 2 });
    const r = await runRow(d);
    expect(r).toMatchObject({ ending: "abandoned", extracted: false, wave_reached: 4, player_count: 1, district: "harbor" });
    expect(new Date(r?.ended_at as string).getTime()).toBe(expiresAt.getTime());
    expect(await seatRows(d)).toEqual([{ seat: "p0#0", account_id: a.id, slot: 0, loadout: "smg", waves_in: 4, kills: 12 }]);
    expect(await rows(db, sql`select id from saved_runs where id = ${RUN}`)).toEqual([]);
    expect((await runRow(d, RUN2))?.ended_at).toBeNull();
    expect((await runRow(d, RUN3))?.ended_at).toBeNull();
    expect(await rows(db, sql`select id from saved_runs where id in (${RUN2}, ${RUN3})`)).toHaveLength(2);
    expect(await runRow(d, ORPHAN)).toMatchObject({ ending: "abandoned", player_count: 0 });
    expect(await seatRows(d, ORPHAN)).toEqual([]);
    expect((await runRow(d, YOUNG))?.ended_at).toBeNull();
    // A second run finds nothing more; a later room finish of the abandoned run is refused (one finisher).
    expect(await runHousekeeping({ runResults: repo, reports: noReports }, undefined, { info: () => {}, error: () => {} })).toEqual({ problemReports: 0, expireAbandonedRuns: 0 });
    expect(await repo.finish(end(), [seat(0, null)])).toBe(false);
    // The stats: abandoned runs show only in runs/week.
    expect((await repo.statsRows(null)).runs.map((x) => x.ending).sort()).toEqual(["abandoned", "abandoned"]);
  });

  it("an expired save with no open row (its start write lost) is inserted as abandoned; an unreadable snapshot → a row with no seats and a warn", async () => {
    const d = fresh();
    const db = await d.db();
    const a = await guest(d);
    const saves = savedRunsRepo(d);
    const warn = vi.fn();
    const repo = runResultsRepo(d, undefined, undefined, { warn } as never);
    await saves.saveResumable(saveRow(RUN, snapshot(RUN, [{ playerId: "p0", seatGen: 0, accountId: a.id, slot: 0, player: { wavesIn: 1, endlessWavesIn: 0, kills: 0 } }]), [a.id]), new Date());
    await saves.saveResumable(saveRow(RUN2, { schemaVersion: 99 }, [a.id]), new Date());
    await db.execute(sql`update saved_runs set expires_at = now() - interval '1 minute'`);
    expect(await repo.expireAbandoned(10)).toBe(2);
    expect(await runRow(d)).toMatchObject({ ending: "abandoned", player_count: 1, nights_played: 1 });
    expect(await runRow(d, RUN2)).toMatchObject({ ending: "abandoned", player_count: 0 });
    expect(warn).toHaveBeenCalledWith({ runId: RUN2 }, "run_result_unreadable_save");
  });
});
