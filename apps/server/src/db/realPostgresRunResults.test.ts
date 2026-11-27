import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { openPostgres, type Database } from "./client";
import { migrateDb } from "./migrate";
import { runResultsRepo, type RunSeatRow } from "./runResultsRepo";
import { SAVE_KEEP_MS, savedRunsRepo } from "./savedRunsRepo";

/**
 * Story 10.7 (B4) on a REAL PostgreSQL (PGlite runs on one connection and can't race): the room's finish racing the
 * expiry step, and resumes racing each other. Opt-in like the other real-PG files:
 * `TEST_DATABASE_URL=postgres://… npx vitest run realPostgres --no-file-parallelism` (CI: the `postgres` job).
 */
const URL = process.env.TEST_DATABASE_URL;
log.level = process.env.LOG_LEVEL ?? "silent";
let database: Database;
const acct = async () => (await accountsRepo(database).createGuest(randomUUID().replace(/-/g, "").padEnd(64, "c"), "Ana")).id;
const q = async <T,>(query: ReturnType<typeof sql>): Promise<T[]> => ((await (await database.db()).execute(query)) as unknown as { rows: T[] }).rows;
const snapshot = (id: string, accountId: string) => ({ schemaVersion: 1, runId: id, seed: 1, phase: "build", world: { run: { endless: false } }, seats: [{ seatKey: `acct:${accountId}`, accountId, name: "Ana", slot: 0, playerId: "p0", seatGen: 1, look: "", kills: 0, buildIdx: 0, player: { wavesIn: 3, endlessWavesIn: 0, kills: 1 } }] });

describe.skipIf(!URL)("Story 10.7: run stats rows on real PostgreSQL (TEST_DATABASE_URL)", () => {
  beforeAll(async () => {
    database = openPostgres(URL as string);
    await migrateDb({ kind: "postgres", db: await database.db() });
  });
  afterAll(async () => database?.close());

  it("B4: the room's finish and the expiry step at once ×20 → exactly one wins: ended once, seat rows from ONE writer, no error", async () => {
    const repo = runResultsRepo(database);
    const saves = savedRunsRepo(database);
    let room = 0;
    let step = 0;
    for (let round = 0; round < 20; round++) {
      const a = await acct();
      const id = randomUUID();
      await repo.start({ id, district: "downtown", seed: 1 });
      expect(await saves.saveResumable({ id, district: "downtown", seed: 1, snapshot: snapshot(id, a), schemaVersion: 1, wave: 3, names: [], roomCode: "ABCD", links: [{ accountId: a, seatKey: `acct:${a}` }] }, new Date(Date.now() + SAVE_KEEP_MS))).toBe(true);
      await q(sql`update saved_runs set expires_at = now() - interval '1 second' where id = ${id}`);
      const seats: RunSeatRow[] = [{ seat: "p0#1", accountId: a, slot: 0, loadout: "smg", wavesIn: 3, kills: 99 }, { seat: "p1#1", accountId: null, slot: 1, loadout: "", wavesIn: 3, kills: 99 }];
      // Rounds 0, 2 (mod 4): both at once (a real race); round 1: the finish 50 ms first; round 3: the step 50 ms first —
      // so both outcomes really happen (asserted below) whatever the machine's speed.
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const finish = wait(round % 4 === 3 ? 50 : 0).then(() => repo.finish({ id, district: "downtown", seed: 1, waveReached: 3, ending: "wiped", endless: false, nightMs: 1000 }, seats));
      const expire = wait(round % 4 === 1 ? 50 : 0).then(() => repo.expireAbandoned(1000));
      const [won] = await Promise.all([finish, expire]);
      const row = (await q<{ ending: string; ended_at: string | null; player_count: number }>(sql`select ending, ended_at, player_count from run_results where id = ${id}`))[0];
      const kills = (await q<{ kills: number }>(sql`select kills from run_result_players where run_id = ${id}`)).map((r) => r.kills);
      expect(row?.ended_at).not.toBeNull();
      if (won) {
        room++;
        expect(row).toMatchObject({ ending: "wiped", player_count: 2 });
        expect(kills).toEqual([99, 99]);
      } else {
        step++;
        expect(row).toMatchObject({ ending: "abandoned", player_count: 1 });
        expect(kills).toEqual([1]);
      }
      expect(await q(sql`select id from saved_runs where id = ${id}`)).toEqual([]); // the expired save is gone either way
    }
    expect(room + step).toBe(20);
    expect(room).toBeGreaterThan(0); // both writers really won some rounds
    expect(step).toBeGreaterThan(0);
  });

  it("8 resumes of one save at once; each winner counts a night → nights_played +1 exactly, ×5", async () => {
    const repo = runResultsRepo(database);
    const saves = savedRunsRepo(database);
    for (let round = 0; round < 5; round++) {
      const [a, b] = [await acct(), await acct()];
      const id = randomUUID();
      await repo.start({ id, district: "downtown", seed: 1 });
      await saves.saveResumable({ id, district: "downtown", seed: 1, snapshot: { schemaVersion: 1 }, schemaVersion: 1, wave: 2, names: [], roomCode: "ABCD", links: [a, b].map((x) => ({ accountId: x, seatKey: `acct:${x}` })) }, new Date(Date.now() + SAVE_KEEP_MS));
      await Promise.all(
        Array.from({ length: 8 }, async (_, i) => {
          const c = await saves.claim(id, i % 2 === 0 ? a : b, `R${round}${i}`);
          if (c.outcome === "claimed") await repo.resumed({ id, district: "downtown", seed: 1 }, `R${round}${i}`);
        }),
      );
      expect((await q<{ n: number }>(sql`select nights_played as n from run_results where id = ${id}`))[0]?.n).toBe(2);
    }
  });

  it("Story 10.12 (AC 7): migration 0010's column defaults to false; markCheated and a clean finish keep it true", async () => {
    const repo = runResultsRepo(database);
    const id = randomUUID();
    const clean = randomUUID();
    await repo.start({ id, district: "downtown", seed: 1 });
    await repo.start({ id: clean, district: "downtown", seed: 1 });
    await repo.markCheated({ id, district: "downtown", seed: 1 });
    await repo.finish({ id, district: "downtown", seed: 1, waveReached: 3, ending: "wiped", endless: false, nightMs: 1000 }, []);
    const read = await q<{ id: string; cheated: boolean }>(sql`select id, cheated from run_results where id in (${id}, ${clean})`);
    expect(Object.fromEntries(read.map((r) => [r.id, r.cheated]))).toEqual({ [id]: true, [clean]: false });
  });
});

