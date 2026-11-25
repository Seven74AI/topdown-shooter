import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 7.10 (R2): every hookup of the editor's tested models fails a check when its line is deleted. */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const UI = "apps/client/src/ui/";

describe("Story 7.10 wiring", () => {
  it("App renders the editor; the hub's Survivor tab and MY lobby card open it (AC 1, O4)", () => {
    expect(read(`${UI}App.tsx`)).toMatch(/<SurvivorEditor \/>/);
    const hub = read(`${UI}ProgressScreen.tsx`);
    expect(hub).toMatch(/if \(t\.id === SURVIVOR_TAB_ID\) return uiStore\.set\(openSurvivor\(\{ kind: "progress", back: screen\.back \}\)\);/);
    const lobby = read(`${UI}LobbyScreen.tsx`);
    expect(lobby).toMatch(/\{\.\.\.\(you\s*\?\s*\{[\s\S]*?onClick: \(\) => uiStore\.set\(openSurvivor\(\{ kind: "lobby", code \}\)\)/);
    expect((lobby.match(/openSurvivor\(/g) ?? []).length).toBe(2); // click + Enter, both inside the `you` branch only
  });

  it("the editor draws the tested models: tiles, pick, random, setColour, Done → saveFromEditor, D3 → lobbyStore.setLook", () => {
    const s = read(`${UI}SurvivorEditor.tsx`);
    expect(s).toMatch(/tilesFor\(st\.tab, st\.owned\)/);
    expect(s).toMatch(/pick\(s, t\.slot, t\.id\)/);
    expect(s).toMatch(/random\(s\)/);
    expect(s).toMatch(/setColour\(s, k, hex\)/);
    expect(s).toMatch(/partTileUrl\(t\.slot, t\.id, tileDraft, t\.state\)/);
    expect(s).toMatch(/const r = await saveFromEditor\(code\);/);
    expect(s).toMatch(/lobbyStore\.setLook\(r\.look \?\? DEFAULT_LOOK_CODE\)/);
    expect(s).toMatch(/ownedFrom\(progressStore\.get\(\)\.progress/);
    expect(s).toMatch(/openEditor\(deviceLook\.get\(\)/);
  });

  it("previews: one rAF loop while open, the game-size picture per change, redraw on visibilitychange (brief 20)", () => {
    const s = read(`${UI}SurvivorEditor.tsx`);
    expect(s).toMatch(/preview\.frame\(g, cv\.width, cv\.height, t, slot\)/);
    expect(s).toMatch(/preview\.setLook\(draft\)/);
    expect(s).toMatch(/drawGamePreview\(g, cv\.width, cv\.height, window\.devicePixelRatio \|\| 1, resolveLook\(cur\.draft, 1\), slot\)/);
    expect(s).toMatch(/const unwatch = watchVisible\(document, drawGame\);/);
    expect(s).toMatch(/cancelAnimationFrame\(raf\);/);
  });

  it("the start screen retries a pending look once (AC 9); the device copy follows server answers; joins use it", () => {
    expect(read(`${UI}StartScreen.tsx`)).toMatch(/void syncPendingLookOnce\(\);/);
    expect(read("apps/client/src/net/progressStore.ts")).toMatch(/if \(progress\.look !== undefined\) \(this\.deps\.looks \?\? deviceLook\)\.set\(progress\.look\);/);
    expect(read("apps/client/src/net/account.ts")).toMatch(/const look = looks\.get\(\);/);
  });

  it("server: the look route is on the router and the lobby message under net.guard", () => {
    const app = read("apps/server/src/app.ts");
    expect(app).toMatch(/routes: createRouter\(\{ health, accountSession, accountUnlock, accountTraining, accountUpgrade, accountLogin, accountRecover, accountLogout, accountLook(, savedRuns)? \}\)/); // Story 8.6: + savedRuns
    expect(app).toMatch(/look: \{ progress, ipLimiter: lookIpLimiter, accountLimiter: lookAccountLimiter \}/);
    expect(read("apps/server/src/rooms/RunRoom.ts")).toMatch(/this\.onMessage\(C2S\.LOBBY_SET_LOOK, this\.net\.guard\(lobbySetLookSchema, \(c, m\) => this\.onSetLook\(c, m\.look\)\)\)/);
    expect(read("apps/client/src/net/lobbyStore.ts")).toMatch(/this\.room\?\.send\(C2S\.LOBBY_SET_LOOK, \{ look \}\)/);
  });
});
