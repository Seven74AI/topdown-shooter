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
    expect(src.match(/options\("(create|join)", name, await sessionTicket\(\)\)/g)).toHaveLength(3);
    expect(src).not.toMatch(/options\("(create|join)", name\)/);
  });
});
