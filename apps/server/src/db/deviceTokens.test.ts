import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SQL, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { type Database, type Db, openPglite } from "./client";
import { deviceTokensRepo } from "./deviceTokensRepo";
import { MIGRATIONS_FOLDER } from "./migrate";
import { progressRepo } from "./progressRepo";

/** Story 7.6 (AC 1, 2, 4, 6, 7, 10; A1, A2, A5): device rows, the guest merge, logout, the bank of a merged guest, the nudge. */
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
const H = (c: string) => c.repeat(64);
const RUN = "0f1e2d3c-4b5a-4968-8776-655443322110";
const RUN2 = "1f1e2d3c-4b5a-4968-8776-655443322111";

/** A full account with this progress (made through the real repos, then the numbers set directly). */
async function setup(database: Database, tokenHash: string, values: { supplies?: number; lifetime?: number; unlocks?: string[]; training?: Record<string, number> }, username?: string) {
  const acc = accountsRepo(database);
  const a = await acc.createGuest(tokenHash, "");
  const db = await database.db();
  await db.execute(
    sql`update progress set supplies = ${values.supplies ?? 0}, lifetime_supplies = ${values.lifetime ?? 0}, unlocks = ${JSON.stringify(values.unlocks ?? [])}::jsonb, training = ${JSON.stringify(values.training ?? {})}::jsonb where account_id = ${a.id}`,
  );
  if (username) expect(await acc.setCredentials(a.id, { username, passwordHash: "$argon2id$p", recoveryCodeHash: "$argon2id$r" })).toBe("ok");
  return a;
}

describe("Story 7.6: accounts and devices (PGlite)", () => {
  it("A1: saving a guest keeps the same account row and progress; only username + hashes are added; a second save is refused", async () => {
    const database = fresh();
    const g = await setup(database, H("a"), { supplies: 340, lifetime: 500, unlocks: ["mine"], training: { max_hp: 2 } });
    const acc = accountsRepo(database);
    expect(await acc.setCredentials(g.id, { username: "Mo_42", passwordHash: "$argon2id$p", recoveryCodeHash: "$argon2id$r" })).toBe("ok");
    expect(await acc.findByTokenHash(H("a"))).toEqual({ id: g.id, displayName: "", username: "Mo_42" });
    expect(await acc.findByUsernameLower("mo_42")).toEqual({ id: g.id, username: "Mo_42", passwordHash: "$argon2id$p", recoveryCodeHash: "$argon2id$r" });
    expect(await progressRepo(database).get(g.id)).toMatchObject({ supplies: 340, lifetimeSupplies: 500, unlocks: ["mine"], training: { max_hp: 2 } });
    expect(await acc.setCredentials(g.id, { username: "other", passwordHash: "x", recoveryCodeHash: "y" })).toBe("not_guest");
  });

  it("AC 2: a username is unique ignoring case (MO_42 after mo_42 → taken), and the guest stays a guest", async () => {
    const database = fresh();
    await setup(database, H("a"), {}, "mo_42");
    const g = await setup(database, H("b"), {});
    expect(await accountsRepo(database).setCredentials(g.id, { username: "MO_42", passwordHash: "x", recoveryCodeHash: "y" })).toBe("taken");
    expect((await accountsRepo(database).findByTokenHash(H("b")))?.username).toBeNull();
  });

  it("A2 / AC 6: logging in a guest device merges it in one transaction (770), re-points the device to a FRESH token, retires the guest", async () => {
    const database = fresh();
    const account = await setup(database, H("a"), { supplies: 400, lifetime: 900, unlocks: ["mine", "chainsaw"], training: { max_hp: 3 } }, "mo_42");
    const guest = await setup(database, H("b"), { supplies: 120, lifetime: 300, unlocks: ["mine"], training: { max_hp: 2 } });
    const r = await deviceTokensRepo(database).logIn({ oldTokenHash: H("b"), newTokenHash: H("c"), accountId: account.id });
    if (r.outcome !== "ok") throw new Error("login failed");
    expect(r.merged).toEqual({ guestId: guest.id, refunds: { unlocks: { mine: 100 }, training: { max_hp: 150 }, total: 250 } });
    expect(r.progress).toMatchObject({ accountId: account.id, supplies: 770, lifetimeSupplies: 1200, training: { max_hp: 3 } });
    expect(new Set(r.progress.unlocks)).toEqual(new Set(["mine", "chainsaw"]));
    const acc = accountsRepo(database);
    expect((await acc.findByTokenHash(H("c")))?.id).toBe(account.id); // the device's new token is the account
    expect(await acc.findByTokenHash(H("b"))).toBeNull(); // the old guest token is dead (B1)
    expect((await acc.findByTokenHash(H("a")))?.id).toBe(account.id); // the account's other phone is untouched
    const db = await database.db();
    expect(await rows(db, sql`select merged_into from accounts where id = ${guest.id}`)).toEqual([{ merged_into: account.id }]);
    expect(await progressRepo(database).get(guest.id)).toBeNull(); // nothing left to count twice
  });

  it("a device already on another FULL account just switches (no merge, both accounts untouched)", async () => {
    const database = fresh();
    const a = await setup(database, H("a"), { supplies: 10 }, "ana");
    const b = await setup(database, H("b"), { supplies: 20 }, "bo");
    const r = await deviceTokensRepo(database).logIn({ oldTokenHash: H("b"), newTokenHash: H("c"), accountId: a.id });
    expect(r).toMatchObject({ outcome: "ok", merged: null, progress: { supplies: 10 } });
    expect(await progressRepo(database).get(b.id)).toMatchObject({ supplies: 20 });
    expect(await accountsRepo(database).findByTokenHash(H("b"))).toBeNull();
  });

  it("a guest is merged once: two logins of one guest device at once → one merge, Supplies added once", async () => {
    const database = fresh();
    const a = await setup(database, H("a"), { supplies: 100 }, "ana");
    await setup(database, H("b"), { supplies: 50 });
    const devices = deviceTokensRepo(database);
    const [r1, r2] = await Promise.allSettled([
      devices.logIn({ oldTokenHash: H("b"), newTokenHash: H("c"), accountId: a.id }),
      devices.logIn({ oldTokenHash: H("b"), newTokenHash: H("d"), accountId: a.id }),
    ]);
    const merged = [r1, r2].filter((r) => r.status === "fulfilled" && r.value.outcome === "ok" && r.value.merged !== null);
    expect(merged).toHaveLength(1);
    expect((await progressRepo(database).get(a.id))?.supplies).toBe(150);
  });

  it("a reset's credentials are written only if the recovery hash is still the verified one (two resets, one code: one wins)", async () => {
    const database = fresh();
    const a = await setup(database, H("a"), {}, "ana");
    const devices = deviceTokensRepo(database);
    const one = await devices.logIn({ oldTokenHash: null, newTokenHash: H("c"), accountId: a.id, credentials: { expectRecoveryHash: "$argon2id$r", passwordHash: "p2", recoveryCodeHash: "r2" } });
    const two = await devices.logIn({ oldTokenHash: null, newTokenHash: H("d"), accountId: a.id, credentials: { expectRecoveryHash: "$argon2id$r", passwordHash: "p3", recoveryCodeHash: "r3" } });
    expect(one.outcome).toBe("ok");
    expect(two.outcome).toBe("stale_credentials");
    expect(await accountsRepo(database).findByUsernameLower("ana")).toMatchObject({ passwordHash: "p2", recoveryCodeHash: "r2" });
    expect(await accountsRepo(database).findByTokenHash(H("d"))).toBeNull(); // the losing reset logged nothing in
  });

  it("A5 / AC 7: logging out makes the device a new empty guest; the account and its other device are untouched; a guest can't log out", async () => {
    const database = fresh();
    const a = await setup(database, H("a"), { supplies: 77 }, "ana");
    const devices = deviceTokensRepo(database);
    await devices.logIn({ oldTokenHash: null, newTokenHash: H("b"), accountId: a.id }); // a second phone
    const out = await devices.logOut(H("b"), H("c"));
    if (out.outcome !== "ok") throw new Error("logout failed");
    expect(out.previousAccountId).toBe(a.id);
    expect(out.account).toMatchObject({ username: null });
    expect(out.account.id).not.toBe(a.id);
    expect(await progressRepo(database).get(out.account.id)).toMatchObject({ supplies: 0, unlocks: [] });
    expect((await accountsRepo(database).findByTokenHash(H("a")))?.id).toBe(a.id);
    expect(await accountsRepo(database).findByTokenHash(H("b"))).toBeNull();
    expect((await progressRepo(database).get(a.id))?.supplies).toBe(77);
    expect(await devices.logOut(H("c"), H("d"))).toEqual({ outcome: "not_logged_in" }); // the new guest
  });

  it("beat the rule 4: a run that ends after its guest was merged pays the ACCOUNT, once, keyed by (run, guest)", async () => {
    const database = fresh();
    const a = await setup(database, H("a"), { supplies: 400, lifetime: 900 }, "ana");
    const g = await setup(database, H("b"), { supplies: 10, lifetime: 10 });
    await deviceTokensRepo(database).logIn({ oldTokenHash: H("b"), newTokenHash: H("c"), accountId: a.id });
    const repo = progressRepo(database);
    const lifetimes: number[] = [];
    const pay = (l: number) => (lifetimes.push(l), { supplies: 60, breakdown: { waves: 60 } });
    expect(await repo.addSupplies(RUN, g.id, pay)).toMatchObject({ banked: true, supplies: 60, newTotal: 470, nudge: false });
    expect(lifetimes).toEqual([910]); // the rookie lift reads the account's lifetime
    expect(await repo.addSupplies(RUN, g.id, pay)).toMatchObject({ banked: false });
    expect(await repo.get(a.id)).toMatchObject({ supplies: 470, lifetimeSupplies: 970 });
    expect(await repo.get(g.id)).toBeNull();
  });

  it("a bank and a merge of the same guest at once: the Supplies land on the account exactly once, whichever goes first", async () => {
    for (let i = 0; i < 4; i++) {
      const database = fresh();
      const a = await setup(database, H("a"), { supplies: 100 }, "ana");
      const g = await setup(database, H("b"), { supplies: 5 });
      const devices = deviceTokensRepo(database);
      const repo = progressRepo(database);
      const ops = [() => repo.addSupplies(RUN2, g.id, () => ({ supplies: 30, breakdown: {} })), () => devices.logIn({ oldTokenHash: H("b"), newTokenHash: H("c"), accountId: a.id })];
      if (i % 2) ops.reverse();
      await Promise.all(ops.map((f) => f()));
      expect((await repo.get(a.id))?.supplies).toBe(135);
      await database.close();
      open.pop();
    }
  });

  it("AC 10: a guest's first bank of ≥ 200 nudges once; a smaller one, a second one and a full account's never", async () => {
    const database = fresh();
    const g = await setup(database, H("a"), {});
    const full = await setup(database, H("b"), {}, "ana");
    const repo = progressRepo(database);
    const pays = (n: number) => () => ({ supplies: n, breakdown: {} });
    expect((await repo.addSupplies("2f1e2d3c-4b5a-4968-8776-655443322112", g.id, pays(199))).nudge).toBe(false);
    expect((await repo.addSupplies("3f1e2d3c-4b5a-4968-8776-655443322113", g.id, pays(200))).nudge).toBe(true);
    expect((await repo.addSupplies("4f1e2d3c-4b5a-4968-8776-655443322114", g.id, pays(500))).nudge).toBe(false);
    expect((await repo.addSupplies("5f1e2d3c-4b5a-4968-8776-655443322115", full.id, pays(500))).nudge).toBe(false);
  });

  it("brief 21: the 7.6 migration runs forward on a copy of the previous schema with guests in it: each token becomes a device row", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mig76-"));
    try {
      cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
      const journalPath = join(dir, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      const mine = journal.entries.findIndex((e) => e.tag.endsWith("_accounts_devices"));
      expect(mine).toBeGreaterThan(0);
      writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, mine) }));
      const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite"), import("drizzle-orm/pglite/migrator")]);
      const client = new PGlite();
      try {
        const db = drizzle({ client });
        await migrate(db, { migrationsFolder: dir });
        const made = await rows<{ id: string }>(db as unknown as Db, sql`insert into accounts (guest_token_hash, display_name) values (${H("d")}, 'Old'), (${H("e")}, 'Two') returning id`);
        await db.execute(sql`insert into progress (account_id, supplies) values (${made[0]?.id}, 33)`);
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
        const devs = await rows<{ token_hash: string; account_id: string }>(db as unknown as Db, sql`select token_hash, account_id from device_tokens order by token_hash`);
        expect(devs).toEqual([
          { token_hash: H("d"), account_id: made[0]?.id },
          { token_hash: H("e"), account_id: made[1]?.id },
        ]);
        const cols = await rows<{ column_name: string; is_nullable: string }>(db as unknown as Db, sql`select column_name, is_nullable from information_schema.columns where table_name = 'accounts' order by column_name`);
        // review ops item: kept (nullable, unused) for one release so a rollback to a 7.1–7.3 build still finds its guests
        expect(cols.find((c) => c.column_name === "guest_token_hash")?.is_nullable).toBe("YES");
        expect(cols.map((c) => c.column_name)).toEqual(expect.arrayContaining(["username_lower", "merged_into", "save_nudged"]));
        expect(await rows(db as unknown as Db, sql`select supplies from progress`)).toEqual([{ supplies: 33 }]);
        // a guest made after 7.6 has no guest_token_hash (nothing writes it); a rollback build simply doesn't find it
        await db.execute(sql`insert into accounts (display_name) values ('New')`);
      } finally {
        await client.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
