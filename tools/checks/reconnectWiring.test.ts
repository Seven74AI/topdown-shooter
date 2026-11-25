import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 8.1 (brief 26: a wiring test per hookup): the lines that connect the tested reconnect models
 * to the game. Each expectation fails when its line is deleted.
 */
const client = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8");
const server = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "apps", "server", "src", ...p), "utf8");

describe("Story 8.1 reconnect wiring", () => {
  it("GameScene gives NetSimHost the link status (F7: no input while the link is down) and follows a recovered seat", () => {
    const src = client("scenes", "GameScene.ts");
    expect(src).toMatch(/new NetSimHost\(\{[^}]*linkUp: \(\) => linkStore\.get\(\)\.status === "ok"/);
    expect(src).toMatch(/uiStore\.handle\("startOnline", \(next\) => \{\s*if \(this\.scene\.isActive\(\)\) this\.scene\.restart\(\{ mode: "online", session: next \}/);
  });

  it("RR1-M1: GameScene adds held seats to the vote panel", () => {
    expect(client("scenes", "GameScene.ts")).toMatch(/if \(host\.heldSeatSlots\) this\.voteCount = addHeldVoters\(this\.votePlayers, this\.voteCount, host\.heldSeatSlots\(\)\);/);
  });

  it("main.ts passes the takeover and the recovered room to the lobby store, resumes a saved seat, and runs the hidden-tab rescue", () => {
    const src = client("main.ts");
    expect(src).toMatch(/rejoin: \(\) => c\.rejoinGame\(room\.roomId,/);
    expect(src).toMatch(/onRecovered: \(next\) => \{[\s\S]*?enterRoom\(next, c\);/);
    expect(src).toMatch(/\nresumeSavedSeat\(\);/);
    expect(src).toMatch(/shouldRescueReload\(hiddenForMs, performance\.now\(\) - shownAt, linkStore\.get\(\)\.status === "reconnecting"\)\) location\.reload\(\)/);
  });

  it("BootScene listens for startOnline from its first frame (a reload's resumed seat asks during the title)", () => {
    const src = client("scenes", "BootScene.ts");
    const create = src.slice(src.indexOf("create(data?: BootSceneData)"), src.indexOf("const title = this.add"));
    expect(create).toMatch(/uiStore\.handle\("startOnline", \(session\) => this\.startOnline\(session\)\);/);
  });

  it("the overlay is mounted, and the player view blinks protection", () => {
    expect(client("ui", "App.tsx")).toMatch(/<ConnectionOverlay \/>/);
    expect(client("render", "PlayerView.ts")).toMatch(/protectBlinkAlpha\(p\.protectTicks, timeMs\)/);
    expect(client("sim", "NetSimHost.ts")).toMatch(/p\.protectTicks = s\.protectTicks;/);
  });

  it("the server holds drops, freezes the tick, and uses the patient transport", () => {
    const room = server("rooms", "RunRoom.ts");
    expect(room).toMatch(/override onDrop\(client: RunClient[^)]*\): void \{[\s\S]*?this\.startHold\(member, "drop", client\);/);
    expect(room).toMatch(/if \(this\.state\.frozen\) return; \/\/ Story 8\.1/);
    expect(room).toMatch(/onQuietHold: \(playerId\) =>/);
    const app = server("app.ts");
    expect(app).toMatch(/pingMaxRetries: TRANSPORT_PING_MAX_RETRIES/);
    expect(server("net", "limits.ts")).toMatch(/TRANSPORT_PING_MAX_RETRIES = 4;/);
  });
});
