import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 7.1 (brief R2): the client hookups of the account session, each fails when its line is deleted.
 * (Source checks live here: the client's tsconfig has no Node types.) The join options' ticket is covered by
 * `apps/client/src/net/connection.account.test.ts` (a fake SDK).
 */
const NET = join(__dirname, "..", "..", "apps", "client", "src", "net");
const UI = join(__dirname, "..", "..", "apps", "client", "src", "ui");

describe("account wiring (Story 7.1 T7)", () => {
  it("the start screen asks for the account on start-up and prefills the name through prefillName (AC 7)", () => {
    const src = readFileSync(join(UI, "StartScreen.tsx"), "utf8");
    expect(src).toMatch(/import \{ accountSession, prefillName \} from "\.\.\/net\/account";/);
    expect(src).toMatch(/void accountSession\(\)\.then\(\(session\) => \{\s*if \(live\) setName\(\(current\) => prefillName\(current, session\)\);/);
  });

  it("account.ts posts to serverUrl() + /account/session (the browser path /api/account/session)", () => {
    const src = readFileSync(join(NET, "account.ts"), "utf8");
    expect(src).toContain("url: () => `${serverUrl()}${ACCOUNT_SESSION_PATH}`");
  });

  it("every join path in connection.ts fetches the ticket right before joining", () => {
    const src = readFileSync(join(NET, "connection.ts"), "utf8");
    // Story 7.9: `joinAccount()` fetches the session (ticket + my look) right before each create / join.
    expect(src.match(/options\("(create|join)", name, await joinAccount\(\)\)/g)).toHaveLength(2);
    const account = readFileSync(join(NET, "account.ts"), "utf8");
    const body = account.slice(account.indexOf("export async function joinAccount("));
    expect(body.slice(0, body.indexOf("\n}\n"))).toContain("const s = await accountSession(over);");
    expect(account).toMatch(/if \(s\?\.saved\) out\.ticket = s\.ticket;/);
    // Re-review N-R3: seat recovery (rejoinGame) reuses a recent ticket (Story 7.9: + the device look copy).
    expect(src).toMatch(/export async function rejoinGame[\s\S]*?options\("join", name, await recoveryAccount\(\)\)/);
    const rec = account.slice(account.indexOf("export async function recoveryAccount("));
    expect(rec.slice(0, rec.indexOf("\n}\n"))).toContain("const ticket = await recoveryTicket(over);");
    expect(src).not.toMatch(/options\("(create|join)", name\)/);
  });
});
