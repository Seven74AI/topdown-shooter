import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 7.6 (R2): every hookup of the account models, stores, routes and the merge fails a check when its line is deleted. */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const UI = "apps/client/src/ui/";
const SRV = "apps/server/src/";

describe("Story 7.6 wiring (account upgrade, login, merge)", () => {
  it("App renders the account screen; the start screen, the hub header and Results draw the account line / nudge", () => {
    expect(read(`${UI}App.tsx`)).toMatch(/<AccountScreen \/>/);
    expect(read(`${UI}StartScreen.tsx`)).toMatch(/<AccountLineView line=\{accountLine\(account\)\} from=\{screen\} \/>/);
    expect(read(`${UI}StartScreen.tsx`)).toMatch(/accountStore\.subscribe\(setAccount\)/);
    const hub = read(`${UI}ProgressScreen.tsx`);
    expect(hub).toMatch(/<AccountLineView line=\{accountLine\(account\)\} from=\{screen\} compact \/>\s*<\/header>/);
    expect(hub).toMatch(/accountStore\.subscribe\(setAccount\)/);
    const res = read(`${UI}ResultsScreen.tsx`);
    expect(res).toMatch(/<RunRewardsCard view=\{view\} nudge=\{screen\.online && rewards\?\.seed === screen\.seed && showNudge\(rewards, account\) \? screen : null\} \/>/);
    expect(res).toMatch(/uiStore\.set\(openAccount\("save", nudge\)\)/);
  });

  it("the account screen sends each form to its call and returns / shows the code from the server's answer", () => {
    const s = read(`${UI}AccountScreen.tsx`);
    expect(s).toMatch(/if \(screen\.kind !== "account"\) return null;/);
    expect(s).toMatch(/upgradeAccount\(fields\.username, fields\.password\)/);
    expect(s).toMatch(/logInAccount\(fields\.username, fields\.password\)\.then\(\(r\) => done\(r, goBack\)\)/);
    expect(s).toMatch(/recoverAccount\(fields\.username, fields\.code, fields\.password\)/);
    expect(s).toMatch(/openAccount\("code", from, r\.body\.recoveryCode\)/);
    expect(s).toMatch(/openAccount\("code", from, r\.body\.recoveryCode, true\)/); // review M2: the reset card says other phones are out
    expect(s).toMatch(/\{screen\.reset \? \(/);
    expect(s).toMatch(/form === "login" && showMergeWarning\(accountStore\.get\(\), progressStore\.get\(\)\.progress\)/); // review L7
    expect(s).toMatch(/name="recovery-code"\s*autocomplete="off"/); // review N4
    expect(s).toMatch(/void logOutAccount\(\)/);
    expect(s).toMatch(/const blocked = inRoom\(screen\.back\);/);
    expect(s).toMatch(/if \(form !== "save" && blocked\) return setError\(ACCOUNT_TEXT\.leaveFirst\);/);
    expect(s).toMatch(/autocomplete=\{form === "login" \? "current-password" : "new-password"\}/);
    expect(s).toMatch(/autocomplete="username"/);
  });

  it("every session answer feeds the account line; a login/reset/logout adopts the new token and drops the old ticket", () => {
    const a = read("apps/client/src/net/account.ts");
    expect(a).toMatch(/if \(parsed\.data\.saved\) \{\s*accountStore\.accept\(parsed\.data\.account\.username\);[^\n]*\n\s*if \(parsed\.data\.progress\) progressStore\.accept\(parsed\.data\.progress\);/);
    expect(a).toMatch(/tokens\.set\(s\.deviceToken\);\s*forgetTicket\(\);\s*accountStore\.accept\(s\.account\.username\);\s*if \(s\.progress\) progressStore\.accept\(s\.progress\);/);
    for (const fn of ["logInAccount", "recoverAccount", "logOutAccount"]) expect(a).toMatch(new RegExp(`export async function ${fn}[\\s\\S]*?if \\(r\\.kind === "ok"\\) adopt\\(r\\.body, over\\.tokens \\?\\? guestTokens\\);`));
  });

  it("the server registers the four routes with their limiters and the device repository; rooms register their devices", () => {
    const app = read(`${SRV}app.ts`);
    expect(app).toMatch(/createRouter\(\{ health, accountSession, accountUnlock, accountUpgrade, accountLogin, accountRecover, accountLogout \}\)/);
    expect(app).toMatch(/auth: \{ devices: deviceTokensRepo\(database\), loginIpLimiter, loginNameLimiter, actionIpLimiter: accountActionIpLimiter, actionLimiter: accountActionLimiter \}/);
    const r = read(`${SRV}auth/accountRoutes.ts`);
    expect(r).toMatch(/if \(!loginIpAllowed\(ip, authDeps\)\) throw ctx\.error\(429[\s\S]*?const body = loginRequestSchema/);
    expect(r).toMatch(/if \(!loginIpAllowed\(ip, authDeps\)\) throw ctx\.error\(429[\s\S]*?const body = recoverRequestSchema/);
    expect(r).toMatch(/if \(out\.deviceToken !== undefined\) setGuestCookie\(ctx, out\.deviceToken\);/);
    const room = read(`${SRV}rooms/RunRoom.ts`);
    expect(room).toMatch(/this\.unregisterDevices = registerRoomDevices\(\(\) => Array\.from\(this\.members\.values\(\), \(m\) => m\.guestTokenHash\)\);/);
    expect(room).toMatch(/override onDispose\(\): void \{\s*this\.unregisterDevices\?\.\(\);/);
    expect(read(`${SRV}test/bootTestServer.ts`).match(/resetAccountLimiters\(\);/g)?.length).toBe(2);
    // review L1 / L2: the join re-checks the ticket's device row and refuses a token in the middle of a switch
    expect(room).toMatch(/if \(auth\.accountId !== null\) auth\.accountId = await ticketStillCurrent\(auth\.accountId, auth\.guestTokenHash\);/);
    expect(room).toMatch(/if \(isSwitching\(guestTokenHash\)\) throw refuse\("rate_limited"\);/);
    expect(room).toMatch(/if \(client\.auth && isSwitching\(client\.auth\.guestTokenHash\)\) throw refuse\("rate_limited"\);\s*this\.join\(client\);/);
    expect(app).toMatch(/setRoomAccounts\(\{ sessionSecret, accounts, progress, checkTicketRows \}\)/);
    const auth = read(`${SRV}auth/accountAuth.ts`);
    expect(auth.match(/return await switching\(/g)?.length).toBe(3); // login, recover, logout
  });

  it("the bank sends the nudge and pays a merged guest's account; login merges through meta/merge.ts", () => {
    expect(read(`${SRV}meta/banking.ts`)).toMatch(/return r\.nudge \? \{ \.\.\.m, nudge: true \} : m;/);
    const p = read(`${SRV}db/progressRepo.ts`);
    expect(p).toMatch(/const payee = acc\[0\]\?\.mergedInto \?\? accountId;/);
    expect(p).toMatch(/\.for\("no key update"\)/);
    expect(read(`${SRV}db/deviceTokensRepo.ts`)).toMatch(/const \{ row, refunds \} = mergeProgress\(a as unknown as MergeRow, g as unknown as MergeRow\);/);
  });
});
