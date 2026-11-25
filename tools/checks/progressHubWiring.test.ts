import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 7.3 (R2): every hookup of the hub models, the store and the route fails a check when its line is deleted. */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const UI = "apps/client/src/ui/";

describe("Story 7.3 wiring", () => {
  it("App renders the hub; the start screen and the lobby open it (D2), with the screen to come back to", () => {
    expect(read(`${UI}App.tsx`)).toMatch(/<ProgressScreen \/>/);
    expect(read(`${UI}StartScreen.tsx`)).toMatch(/uiStore\.set\(openProgress\(\{ kind: "start" \}\)\)/);
    expect(read(`${UI}LobbyScreen.tsx`)).toMatch(/uiStore\.set\(openProgress\(\{ kind: "lobby", code \}\)\)/);
  });

  it("the hub refreshes from the server on open, draws hubSections/rowAction, and Back returns to `back`", () => {
    const s = read(`${UI}ProgressScreen.tsx`);
    expect(s).toMatch(/if \(screen\.kind !== "progress"\) return null;/);
    expect(s).toMatch(/void progressStore\.refresh\(\);/);
    expect(s).toMatch(/hubSections\(progress\)/);
    expect(s).toMatch(/rowAction\(row, buy, offline\)/);
    expect(s).toMatch(/if \(s\.kind === "progress"\) uiStore\.set\(s\.back\);/);
    expect(s).toMatch(/const offline = snap\.source !== "server";/);
  });

  it("a tap goes through tapUnlock; the answer through answerUnlock; the SERVER's progress is shown (U5)", () => {
    const s = read(`${UI}ProgressScreen.tsx`);
    expect(s).toMatch(/tapUnlock\(buyRef\.current, row\.unlockId, performance\.now\(\), newRequestId, offline\)/);
    expect(s).toMatch(/unlockItem\(send\.unlockId, send\.requestId\)/);
    expect(s).toMatch(/answerUnlock\(buyRef\.current, send\.requestId, call\)/);
    expect(s).toMatch(/if \(r\.progress\) progressStore\.accept\(r\.progress\);/);
    // review F2 / F7: a failure marks the hub offline AND asks the server again (so "try again" can work)
    expect(s).toMatch(/const sentAt = performance\.now\(\);\s*void unlockItem\(send\.unlockId, send\.requestId\)/);
    expect(s).toMatch(/progressStore\.markOffline\(\);\s*setTimeout\(\(\) => void progressStore\.refresh\(\), refreshAfterFailureMs\(sentAt, performance\.now\(\)\)\);/);
    expect(s).toMatch(/expireConfirm\(b, performance\.now\(\)\)/);
  });

  it("the server registers /account/unlock with the account limiter, the IP limiter, the request memo and the progress repo", () => {
    const app = read("apps/server/src/app.ts");
    expect(app).toMatch(/createRouter\(\{ health, accountSession, accountUnlock[,} ]/); // 7.6 appends its routes
    expect(app).toMatch(/unlock: \{ progress, ipLimiter: unlockIpLimiter, accountLimiter: unlockAccountLimiter, requests: unlockRequests \}/);
    expect(app).toMatch(/progress, \/\/ Story 7\.3 \(AC 4\)/);
    const routes = read("apps/server/src/auth/accountRoutes.ts");
    expect(routes).toMatch(/createEndpoint\(ACCOUNT_UNLOCK_PATH/);
    expect(routes).toMatch(/originAllowed\(origin, deps\.allowedOrigins\)[\s\S]*buyUnlock\(/);
  });
});
