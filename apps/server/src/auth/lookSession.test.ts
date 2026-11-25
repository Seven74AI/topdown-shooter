/** Story 7.9 AC 1: the session response carries the saved look (canonical; null = default), and a failing read never unsaves. */
import { accountSessionResponseSchema } from "@topdown/shared";
import { afterEach, describe, expect, it } from "vitest";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo, type ProgressRepo } from "../db/progressRepo";
import { SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
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
    { accounts: accountsRepo(database), progress, newGuestLimiter: new SlidingWindowLimiter(20, 3_600_000), sessionLimiter: new SlidingWindowLimiter(30, 60_000), logGate: new SlidingWindowLimiter(1, 60_000), sessionSecret: SECRET },
  );
  return accountSessionResponseSchema.parse(response);
}
/** The real progress row, with `look` as 7.10's editor would have saved it (the column read itself: db/look.db.test.ts). */
function storedLook(database: Database, look: string): ProgressRepo {
  const real = progressRepo(database);
  return { ...real, get: async (id) => {
    const row = await real.get(id);
    return row === null ? null : { ...row, look };
  } };
}

describe("session response look (Story 7.9 AC 1)", () => {
  it("a new guest: progress.look is null (the default look)", async () => {
    const database = openPglite();
    open.push(database);
    const r = await session(database);
    expect(r.saved && r.progress).toEqual({ supplies: 0, lifetimeSupplies: 0, unlocks: [], look: null, districts: [], cosmetics: [] }); // Story 7.3 merge: one progress object (+ 7.7 / 7.11 lists)
  });

  it("a stored look comes back as saved; junk in the column comes back canonical (never a client parse failure)", async () => {
    const database = openPglite();
    open.push(database);
    await session(database);
    expect(await session(database, storedLook(database, CODE))).toMatchObject({ progress: { look: CODE } });
    const r = await session(database, storedLook(database, "v1|head:zzz|" + "x".repeat(500)));
    expect(r.saved && r.progress?.look).toBe("v1|top:jacket|head:cap|hair:short|pack:backpack|skin:1|c:3c5670,231f1c,1f2326");
  });

  it("beat the rule 5 (as merged with 7.3, decision 7.3 B17): a progress read that fails keeps the session saved; progress is null, so the phone keeps its own look copy", async () => {
    const database = openPglite();
    open.push(database);
    const broken: ProgressRepo = { ...progressRepo(database), get: async () => Promise.reject(new Error("db hiccup")) };
    const r = await session(database, broken);
    expect(r.saved).toBe(true);
    expect(r.saved && r.progress).toBeNull();
  });
});
