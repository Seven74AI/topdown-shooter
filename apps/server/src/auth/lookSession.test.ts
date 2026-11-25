/** Story 7.9 AC 1: the session response carries the saved look (canonical; null = default), and a failing read never unsaves. */
import { sql } from "drizzle-orm";
import { accountSessionResponseSchema } from "@topdown/shared";
import { afterEach, describe, expect, it } from "vitest";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo, type ProgressRepo } from "../db/progressRepo";
import { SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";
import { resolveGuestSession } from "./guestSession";

log.level = process.env.LOG_LEVEL ?? "silent";
const SECRET = "k".repeat(43);
const TOKEN = "e7".repeat(16);
const CODE = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:aa0000,00bb00,0000cc";
const open: Database[] = [];
afterEach(async () => {
  for (const d of open.splice(0)) await d.close();
});

async function session(database: Database, progress: ProgressRepo = progressRepo(database)) {
  const { response } = await resolveGuestSession(
    { cookieToken: null, deviceToken: TOKEN, ip: "1.2.3.4" },
    { accounts: accountsRepo(database), progress, newGuestLimiter: new SlidingWindowLimiter(20, 3_600_000), sessionSecret: SECRET },
  );
  return accountSessionResponseSchema.parse(response);
}
async function storeLook(database: Database, look: string): Promise<void> {
  const acct = await accountsRepo(database).findByTokenHash(hashGuestToken(TOKEN));
  const db = await database.db();
  await db.execute(sql`update progress set look = ${look} where account_id = ${acct?.id ?? ""}`);
}

describe("session response look (Story 7.9 AC 1)", () => {
  it("a new guest: progress.look is null (the default look)", async () => {
    const database = openPglite();
    open.push(database);
    const r = await session(database);
    expect(r.saved && r.progress).toEqual({ look: null });
  });

  it("a stored look comes back as saved; junk in the column comes back canonical (never a client parse failure)", async () => {
    const database = openPglite();
    open.push(database);
    await session(database);
    await storeLook(database, CODE);
    expect(await session(database)).toMatchObject({ progress: { look: CODE } });
    await storeLook(database, "v1|head:zzz|" + "x".repeat(500));
    const r = await session(database);
    expect(r.saved && r.progress?.look).toBe("v1|top:jacket|head:cap|hair:short|pack:backpack|skin:1|c:3c5670,231f1c,1f2326");
  });

  it("beat the rule 5: a progress read that fails keeps the session saved with the default look", async () => {
    const database = openPglite();
    open.push(database);
    const broken: ProgressRepo = { get: async () => Promise.reject(new Error("db hiccup")), createEmpty: async () => {} };
    const r = await session(database, broken);
    expect(r.saved).toBe(true);
    expect(r.saved && r.progress).toEqual({ look: null });
  });
});
