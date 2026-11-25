import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Stories 8.2 + 8.3 (brief R2: a wiring test per hookup): the client lines that connect the tested models (waitingView,
 * hostToast, the Remove confirm, the removed close) to the game. Each expectation fails when its line is deleted.
 */
const client = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "apps", "client", "src", ...p), "utf8");

describe("Stories 8.2 + 8.3 client wiring", () => {
  it("NetSimHost: waiting teammates have no body, my waiting body is out, and a waiting phone sends no input (J4)", () => {
    const src = client("sim", "NetSimHost.ts");
    expect(src).toMatch(/\(s\.heldUntilTick > 0 \|\| s\.waiting === true\) && id !== this\.localPlayerId\)\) removePlayer\(this\.world, id\)/);
    expect(src).toMatch(/if \(\(p\.heldUntilTick > 0 \|\| p\.waiting === true\) && id !== this\.localPlayerId\) return;/);
    expect(src).toMatch(/if \(s\.waiting === true\) p\.status = "out";/);
    expect(src).toMatch(/if \(!this\.linkUp\(\) \|\| this\.waiting\) \{/);
    expect(src).toMatch(/return waitingView\(state\?\.players\?\.get\(this\.localPlayerId\), state\?\.phase\)\.waiting;/);
  });

  it("GameScene: the waiting line and the host toast", () => {
    const src = client("scenes", "GameScene.ts");
    expect(src).toMatch(/const waitingLine = this\.host instanceof NetSimHost \? this\.host\.waitingLine : "";/);
    expect(src).toMatch(/m\.statusText = waitingLine !== "" \? waitingLine :/);
    expect(src).toContain("m.watching = host instanceof NetSimHost && host.waiting;"); // AC 4: only ☰ while waiting
    expect(src).toContain("m.buildBar = r.show && !m.watching;");
    const hud = client("scenes", "HudScene.ts");
    expect(hud).toContain("!this.model.voting && !this.model.watching"); // the sticks
    expect(hud).toContain("m.repairOpen || m.voting || m.watching"); // the weapon panel
    expect(hud).toContain("this.hpText.setVisible(!watching);"); // no "0 / 0" HP row while waiting
    expect(hud).toContain("this.moneyText.setVisible(!m.watching);"); // no "$0" while waiting
    expect(src).toMatch(/this\.hostWatch\.observe\(host\.hostSlot, host\.mySlot\)\) this\.toasts\.push\(HOST_TOAST_TEXT\)/);
    expect(src).toMatch(/this\.hostWatch\.reset\(\);/);
  });

  it("LobbyScreen: the host toast, Remove on others' cards and its confirm sends host.remove", () => {
    const src = client("ui", "LobbyScreen.tsx");
    expect(src).toMatch(/if \(hostWatch\.observe\(lobby\.hostSlot, mine\)\) setNotice\(HOST_TOAST_TEXT\);/);
    expect(src).toMatch(/\{view\.isHost && !you && \(/);
    expect(src).toMatch(/lobbyStore\.remove\(confirmRemove\.playerId\);/);
  });

  it("InRunMenu: the Players list's confirm sends host.remove only in a phase that allows it", () => {
    const src = client("ui", "InRunMenu.tsx");
    expect(src).toMatch(/if \(target && canRemoveIn\(lobby\.phase\)\) lobbyStore\.remove\(target\.playerId\);/);
    expect(src).toMatch(/menuRemoveTarget\.set\(\{ playerId: p\.playerId, name: p\.name \}\);/);
  });

  it("lobbyStore sends host.remove; main.ts shows the removed notice; the overlay has an OK for it", () => {
    expect(client("net", "lobbyStore.ts")).toMatch(/this\.room\?\.send\(C2S\.HOST_REMOVE, \{ playerId \}\);/);
    expect(client("main.ts")).toMatch(/if \(reason === "removed"\) \{[\s\S]*?serverNotice\.show\(JOIN_ERROR_TEXT\.removed\);/);
    expect(client("ui", "ServerNotice.tsx")).toMatch(/text === JOIN_ERROR_TEXT\.removed \? "OK" : "Back to start"/);
  });
});
