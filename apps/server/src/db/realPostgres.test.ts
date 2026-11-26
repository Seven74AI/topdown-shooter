import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import net from "node:net";
import pg from "pg";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { BANK_RETRY_MS, RunBank } from "../meta/banking";
import { accountsRepo } from "./accountsRepo";
import { PG_QUERY_TIMEOUT_MS, openPostgres, type Database } from "./client";
import { migrateDb } from "./migrate";
import { progressRepo } from "./progressRepo";
import { countRunRewards } from "./testQueries";
import { RequestMemo, buyUnlock } from "../auth/unlock";
import { SlidingWindowLimiter } from "../net/rateLimit";
import { hashGuestToken } from "../run/lobby";

/**
 * Story 7.2 review L1 + M1 (brief 18, 20): banking on a REAL PostgreSQL (the PGlite tests run on one connection, so
 * they can't see a race). Opt-in: skipped unless `TEST_DATABASE_URL` points at an empty scratch database (CI, the VPS
 * or a local `postgres`), e.g. `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/t72 npx vitest run realPostgres`.
 * From the review's probe (`_bmad-output/implementation-artifacts/7-2-review-probes/realPostgres.probe.ts.txt`).
 */
/**
 * Review nit (Stories 8.4–8.6): the real-PostgreSQL files share one scratch database and each migrates it; run them
 * one file at a time: `TEST_DATABASE_URL=… npx vitest run realPostgres --no-file-parallelism` (CI skips them).
 */
const URL = process.env.TEST_DATABASE_URL;
log.level = process.env.LOG_LEVEL ?? "silent";
let database: Database;

describe.skipIf(!URL)("Story 7.2: banking on real PostgreSQL (TEST_DATABASE_URL)", () => {
  beforeAll(async () => {
    database = openPostgres(URL as string);
    await migrateDb({ kind: "postgres", db: await database.db() });
  });
  afterAll(async () => database?.close());

  const acct = async () => accountsRepo(database).createGuest(randomUUID().replace(/-/g, "").padEnd(64, "a"), "Ana");
  const rookiePay = (raw: number) => (life: number) => ({ supplies: life < 300 ? raw * 2 : raw, breakdown: { life } });

  it("L1 (FOR UPDATE): two runs ending at once around lifetime 250 → only one doubled (400, never 450), 10 tries", async () => {
    for (let k = 0; k < 10; k++) {
      const a = await acct();
      const repo = progressRepo(database);
      await repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 250, breakdown: {} }));
      await Promise.all([repo.addSupplies(randomUUID(), a.id, rookiePay(50)), repo.addSupplies(randomUUID(), a.id, rookiePay(50))]);
      expect((await repo.get(a.id))?.lifetimeSupplies).toBe(400); // 250 + 100 (the first, rookie) + 50
    }
  });

  it("20 runs ending at once for one account add up exactly", async () => {
    const a = await acct();
    const repo = progressRepo(database);
    await Promise.all(Array.from({ length: 20 }, () => repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 7, breakdown: {} }))));
    expect((await repo.get(a.id))?.supplies).toBe(140);
  });

  it("a concurrent double-submit of ONE (run, account) ×10 pays once", async () => {
    const a = await acct();
    const repo = progressRepo(database);
    const run = randomUUID();
    const rs = await Promise.all(Array.from({ length: 10 }, () => repo.addSupplies(run, a.id, () => ({ supplies: 33, breakdown: { x: 1 } }))));
    expect(rs.filter((r) => r.banked).length).toBe(1);
    expect((await repo.get(a.id))?.supplies).toBe(33);
    expect(await countRunRewards(database, a.id)).toBe(1);
  });

  it("a brand-new account (no progress row): two banks at once both land", async () => {
    const a = await acct();
    const db = await database.db();
    await db.execute(sql`delete from progress where account_id = ${a.id}`);
    const repo = progressRepo(database);
    await Promise.all([repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 5, breakdown: {} })), repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 5, breakdown: {} }))]);
    expect((await repo.get(a.id))?.supplies).toBe(10);
  });

  /** Another session holds the progress row (`FOR UPDATE`) for `ms`. */
  async function lockFor(accountId: string, ms: number): Promise<void> {
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    await c.query("begin");
    await c.query("select * from progress where account_id = $1 for update", [accountId]);
    setTimeout(() => void c.query("commit").then(() => c.end()), ms);
  }

  for (const [lockMs, expected] of [
    [3000, { status: "saved", supplies: 1050, rows: 1 }], // the first attempt gives up, the retry (after 2 s) gets the row: paid once
    [5500, { status: "failed", supplies: 1000, rows: 0 }], // M1: both attempts give up AND nothing commits later
  ] as const) {
    it(`M1: a row locked ${lockMs / 1000} s → ${expected.status}, and the money matches what the player was told`, async () => {
      const a = await acct();
      const repo = progressRepo(database);
      await repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 1000, breakdown: {} })); // lifetime 1000: no rookie
      const before = await countRunRewards(database, a.id);
      await lockFor(a.id, lockMs);
      const bank = new RunBank(7, { repo: () => repo, log: { info: () => {}, error: () => {} }, deliver: () => {}, retryMs: BANK_RETRY_MS });
      const r = await bank.bank({ playerId: "p1", accountId: a.id, record: { wavesIn: 5, endlessWavesIn: 0, bossesIn: 0, endlessBossesIn: 0 }, ending: "wiped" });
      await new Promise((res) => setTimeout(res, Math.max(0, lockMs - 3000) + 2000)); // well past the lock: any late commit has landed
      expect(r.status).toBe(expected.status);
      expect((await repo.get(a.id))?.supplies).toBe(expected.supplies);
      expect((await countRunRewards(database, a.id)) - before).toBe(expected.rows);
    }, 20_000);
  }

  // Re-review RR-M1 (from `7-2-review-probes/rereview1-realPostgres.probe.ts.txt`): the invariant in every case is
  // "the result the caller gets equals what was committed" — rejected/failed ⇒ nothing paid, resolved/saved ⇒ paid once.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const rec5 = { wavesIn: 5, endlessWavesIn: 0, bossesIn: 0, endlessBossesIn: 0 };
  async function seeded() {
    const a = await acct();
    const repo = progressRepo(database);
    await repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 1000, breakdown: {} }));
    return { a, repo, before: await countRunRewards(database, a.id) };
  }
  /** The repository's own pool (max 5) is busy: n banks on other accounts each wait on a held row lock. */
  async function saturate(n: number, holdMs: number, repo: ReturnType<typeof progressRepo>) {
    const others = await Promise.all(Array.from({ length: n }, () => acct()));
    for (const o of others) await repo.addSupplies(randomUUID(), o.id, () => ({ supplies: 1, breakdown: {} }));
    await Promise.all(others.map((o) => lockFor(o.id, holdMs)));
    return others.map((o) => repo.addSupplies(randomUUID(), o.id, () => ({ supplies: 1, breakdown: {} })).catch((e: unknown) => e));
  }

  for (const lockMs of [1400, 1600, 2500]) {
    it(`RR-M1 A: a row locked ${lockMs} ms, through RunBank → the status matches the money`, async () => {
      const { a, repo, before } = await seeded();
      await lockFor(a.id, lockMs);
      const t0 = Date.now();
      const bank = new RunBank(7, { repo: () => repo, log: { info: () => {}, error: () => {} }, deliver: () => {}, retryMs: BANK_RETRY_MS });
      const r = await bank.bank({ playerId: "p1", accountId: a.id, record: rec5, ending: "wiped" });
      await sleep(Math.max(0, lockMs - (Date.now() - t0)) + 1500);
      expect((await countRunRewards(database, a.id)) - before).toBe(r.status === "saved" ? 1 : 0);
    }, 20_000);
  }

  it("RR-M1 B1: pool saturated + row lock → addSupplies resolves ⇔ it committed (never rejected-then-committed)", async () => {
    const { a, repo, before } = await seeded();
    await lockFor(a.id, 2300);
    const busy = await saturate(5, 1300, repo);
    const res = await repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 50, breakdown: {} })).then(() => "resolved", () => "rejected");
    await Promise.all(busy);
    await sleep(2500);
    expect((await countRunRewards(database, a.id)) - before).toBe(res === "resolved" ? 1 : 0);
  }, 30_000);

  it("RR-M1 B2: RunBank with the pool squeezed before both attempts → the status matches the money", async () => {
    const { a, repo, before } = await seeded();
    const bank = new RunBank(7, { repo: () => repo, log: { info: () => {}, error: () => {} }, deliver: () => {}, retryMs: BANK_RETRY_MS });
    await lockFor(a.id, 2300);
    const busy1 = await saturate(5, 1300, repo);
    const t0 = Date.now();
    const p = bank.bank({ playerId: "p1", accountId: a.id, record: rec5, ending: "wiped" });
    await sleep(Math.max(0, 3700 - (Date.now() - t0)));
    await lockFor(a.id, 2600);
    const busy2 = await saturate(5, 1300, repo);
    const r = await p;
    await Promise.all([...busy1, ...busy2]);
    await sleep(3000);
    expect((await countRunRewards(database, a.id)) - before).toBe(r.status === "saved" ? 1 : 0);
  }, 40_000);

  it("RR-M1 C: statements each under 1.5 s but summing past the budget → rejected AND rolled back (the PostgreSQL < 17 path)", async () => {
    const { a, repo, before } = await seeded();
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    await c.query(`create or replace function rr72_slow() returns trigger language plpgsql as $$ begin perform pg_sleep(1.2); return new; end $$`);
    await c.query(`drop trigger if exists rr72 on run_rewards; create trigger rr72 before insert on run_rewards for each row when (new.supplies = 51) execute function rr72_slow()`);
    try {
      await lockFor(a.id, 1000);
      const res = await repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 51, breakdown: {} })).then(() => "resolved", () => "rejected");
      await sleep(2000);
      const paid = (await countRunRewards(database, a.id)) - before;
      expect(paid).toBe(res === "resolved" ? 1 : 0);
      expect(res).toBe("rejected"); // 1.0 s lock + 1.2 s insert > the 1.8 s budget: the pre-COMMIT check (or transaction_timeout) rolls back
    } finally {
      await c.query(`drop trigger if exists rr72 on run_rewards`);
      await c.end();
    }
  }, 20_000);

  // Re-review 2 (from `7-2-review-probes/rereview2-realPostgres.probe.ts.txt`).
  // RR2-M1's fix (an `error` handler on every checked-out pool client) is Story 7.1's, in db/client.ts. Until it is
  // merged this test is skipped (without the handler the killed backend crashes the test process); then it runs.
  const hasClientErrorHandler = /pool\.on\("connect"/.test(readFileSync(new globalThis.URL("./client.ts", import.meta.url), "utf8"));
  it.skipIf(!hasClientErrorHandler)("RR2-M1: the bank's backend is terminated mid-transaction → the server process survives, the retry runs, paid once, status matches", async () => {
    const admin = new pg.Client({ connectionString: URL });
    await admin.connect();
    try {
      const { a, repo, before } = await seeded();
      await lockFor(a.id, 1200);
      const bank = new RunBank(7, { repo: () => repo, log: { info: () => {}, error: () => {} }, deliver: () => {}, retryMs: BANK_RETRY_MS });
      const p = bank.bank({ playerId: "p1", accountId: a.id, record: rec5, ending: "wiped" });
      await sleep(500);
      const k = await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`);
      expect(k.rowCount).toBeGreaterThanOrEqual(1); // liveness: the bank's backend really was killed
      const r = await p; // without the pool "connect" error handler the client's 'error' event crashes the process here
      await sleep(1500);
      const paid = (await countRunRewards(database, a.id)) - before;
      expect(r.status).toBe("saved"); // the retry after 2 s
      expect(paid).toBe(1);
    } finally {
      await admin.end();
    }
  }, 20_000);

  /** A TCP proxy in front of PostgreSQL that can forward a COMMIT and drop its reply (a half-open connection). */
  function proxy() {
    const pgPort = Number(new globalThis.URL(URL as string).port || 5432);
    const st = { mode: "pass" as "pass" | "blackholeAfterCommit", sockets: [] as net.Socket[], sawCommit: 0 };
    const server = net.createServer((c) => {
      const up = net.connect(pgPort, "127.0.0.1");
      st.sockets.push(c, up);
      let drop = false;
      c.on("data", (d) => {
        if (st.mode === "blackholeAfterCommit" && d.toString("latin1").toLowerCase().includes("commit")) {
          st.sawCommit++;
          drop = true;
        }
        up.write(d);
      });
      up.on("data", (d) => {
        if (!drop) c.write(d);
      });
      c.on("error", () => {});
      up.on("error", () => {});
      c.on("close", () => up.destroy());
      up.on("close", () => c.destroy());
    });
    return {
      st,
      listen: () => new Promise<number>((r) => server.listen(0, "127.0.0.1", () => r((server.address() as net.AddressInfo).port))),
      cutAll: () => st.sockets.forEach((x) => x.destroy()),
      close: () => new Promise<void>((r) => server.close(() => r())),
    };
  }

  it("RR2-L1: a black-holed COMMIT reply settles (client query timeout) instead of 'Saving…' forever; the retry finds the row: saved, paid once", async () => {
    const px = proxy();
    const port = await px.listen();
    const pgPort = new globalThis.URL(URL as string).port || "5432";
    const db2 = openPostgres((URL as string).replace(`:${pgPort}/`, `:${port}/`));
    try {
      const a = await acct();
      const repo2 = progressRepo(db2);
      await repo2.addSupplies(randomUUID(), a.id, () => ({ supplies: 1000, breakdown: {} }));
      const before = await countRunRewards(database, a.id);
      const t0 = Date.now();
      px.st.mode = "blackholeAfterCommit";
      const first = await repo2.addSupplies(randomUUID(), a.id, () => ({ supplies: 77, breakdown: {} })).then(() => "resolved", () => "rejected");
      const ms = Date.now() - t0;
      expect(px.st.sawCommit).toBeGreaterThanOrEqual(1);
      expect(first).toBe("rejected"); // the reply never came: settled by the client query timeout
      expect(ms).toBeLessThan(2 * PG_QUERY_TIMEOUT_MS + 2000); // the COMMIT times out, then the ROLLBACK on the same dead line too
      expect((await countRunRewards(database, a.id)) - before).toBe(1); // …although the COMMIT landed (documented case)
      // Through RunBank (a fresh pool): the same lost reply on attempt 1, the line back before the retry → the retry
      // finds the row (duplicate key) → saved, paid once.
      const db3 = openPostgres((URL as string).replace(`:${pgPort}/`, `:${port}/`));
      try {
        const repo3 = progressRepo(db3);
        const fails: number[] = [];
        const bank = new RunBank(7, { repo: () => repo3, log: { info: () => {}, error: () => void fails.push(Date.now()) }, deliver: () => {}, retryMs: BANK_RETRY_MS });
        px.st.mode = "blackholeAfterCommit";
        const p = bank.bank({ playerId: "p1", accountId: a.id, record: rec5, ending: "wiped" });
        while (fails.length === 0) await sleep(50); // attempt 1 settled (rejected) after the client timeouts
        px.st.mode = "pass";
        px.cutAll(); // the half-open socket goes; the retry opens a fresh one
        const r = await p;
        expect(fails.length).toBe(1);
        expect(r.status).toBe("saved");
        expect((await countRunRewards(database, a.id)) - before).toBe(2); // the 77 above + this run, each once
      } finally {
        await db3.close().catch(() => {});
      }
    } finally {
      px.cutAll();
      await px.close();
      await db2.close().catch(() => {});
    }
  }, 40_000);
});

describe.skipIf(!URL)("Story 7.3: unlocks on real PostgreSQL (TEST_DATABASE_URL)", () => {
  let db7: Database;
  beforeAll(async () => {
    db7 = openPostgres(URL as string);
    await migrateDb({ kind: "postgres", db: await db7.db() });
  });
  afterAll(async () => db7?.close());
  const acct = async (supplies: number) => {
    const a = await accountsRepo(db7).createGuest(randomUUID().replace(/-/g, "").padEnd(64, "b"), "Bo");
    if (supplies > 0) await progressRepo(db7).addSupplies(randomUUID(), a.id, () => ({ supplies, breakdown: {} }));
    return a;
  };

  it("brief 18: two different items at once with Supplies for one → exactly one unlocked + one not_enough, ×10", async () => {
    for (let k = 0; k < 10; k++) {
      const a = await acct(350);
      const repo = progressRepo(db7);
      const rs = await Promise.all([repo.unlock(a.id, "gas_torch", 350), repo.unlock(a.id, "med_station", 300)]);
      expect(rs.map((r) => r.outcome).sort()).toEqual(["not_enough", "unlocked"]);
      const row = await repo.get(a.id);
      expect(row?.unlocks.length).toBe(1);
      expect(row?.supplies).toBe(row?.unlocks[0] === "gas_torch" ? 0 : 50);
    }
  });

  it("the same item ×10 at once → one unlocked, nine already_unlocked, charged once", async () => {
    const a = await acct(1000);
    const repo = progressRepo(db7);
    const rs = await Promise.all(Array.from({ length: 10 }, () => repo.unlock(a.id, "mine", 100)));
    expect(rs.filter((r) => r.outcome === "unlocked").length).toBe(1);
    expect(rs.filter((r) => r.outcome === "already_unlocked").length).toBe(9);
    expect(await repo.get(a.id)).toMatchObject({ supplies: 900, unlocks: ["mine"] });
  });

  it("a bank and an unlock at once both land (Supplies add up exactly)", async () => {
    const a = await acct(100);
    const repo = progressRepo(db7);
    await Promise.all([repo.unlock(a.id, "spike_trap", 100), repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 40, breakdown: {} }))]);
    const row = await repo.get(a.id);
    // either order: the unlock saw 100 or 140 → bought; 100 + 40 − 100 = 40
    expect(row).toMatchObject({ supplies: 40, unlocks: ["spike_trap"] });
  });

  it("the 7.2 M1 bound: a row locked 3 s → the unlock fails inside 2 s and never commits later", async () => {
    const a = await acct(500);
    const repo = progressRepo(db7);
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    await c.query("begin");
    await c.query("select * from progress where account_id = $1 for update", [a.id]);
    await expect(repo.unlock(a.id, "bear_trap", 100)).rejects.toThrow();
    await new Promise((res) => setTimeout(res, 1500));
    await c.query("commit");
    await c.end();
    await new Promise((res) => setTimeout(res, 500));
    expect(await repo.get(a.id)).toMatchObject({ supplies: 500, unlocks: [] });
  }, 15_000);

  it("review F1 (route level): DB slower than 2 s — row locked 2.5 s by another session → 503 AND the row unchanged afterwards", async () => {
    const token = randomUUID().replace(/-/g, "");
    const a = await accountsRepo(db7).createGuest(hashGuestToken(token), "Cy");
    const repo = progressRepo(db7);
    await repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 300, breakdown: {} }));
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    await c.query("begin");
    await c.query("select * from progress where account_id = $1 for update", [a.id]);
    const release = new Promise<void>((res) => setTimeout(() => void c.query("commit").then(() => c.end()).then(() => res()), 2500));
    const out = await buyUnlock(
      { cookieToken: token, unlockId: "chainsaw", requestId: randomUUID(), ip: "10.0.0.1" },
      { accounts: accountsRepo(db7), progress: repo, ipLimiter: new SlidingWindowLimiter(99, 60_000), accountLimiter: new SlidingWindowLimiter(99, 60_000), logGate: new SlidingWindowLimiter(1, 60_000), requests: new RequestMemo() },
    );
    expect(out).toEqual({ status: 503, error: "save_unavailable" });
    await release;
    await new Promise((res) => setTimeout(res, 500)); // any late commit would have landed by now
    expect(await repo.get(a.id)).toMatchObject({ supplies: 300, unlocks: [] });
  }, 15_000);
});
