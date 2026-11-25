import { describe, expect, it } from "vitest";
import { KeyboardMouse } from "../input/KeyboardMouse";
import { PingModel } from "../render/pingModel";
import type { SimHost } from "../sim/SimHost";
import { createHudModel } from "./hudModel";
import { pingFrame, pingPan } from "./pingFrame";

/** Story 8.7 (AC 2–4, P4, P6, brief 30 latch): the GameScene's ping step, with a fake host. */
function fakeHost(phase: string, status: string, online = true) {
  const sent: number[] = [];
  const pings = online ? new PingModel() : null;
  const host = {
    localPlayerId: "p1",
    world: { run: { phase }, players: new Map([["p1", { status }]]) },
    pings,
    playerInfo: () => ({ slot: 1 }),
    sendPing: (k: number) => sent.push(k),
  } as unknown as SimHost;
  return { host, sent, pings };
}

describe("pingFrame (Story 8.7)", () => {
  it("P4: the button shows standing or downed in build / wave / vote; not out, lobby, results, offline (link down), solo, busy or blocked", () => {
    const kb = new KeyboardMouse();
    const shown = (phase: string, status: string, o: { link?: boolean; run?: boolean; blocked?: boolean; busy?: boolean; online?: boolean } = {}): boolean => {
      const m = createHudModel();
      pingFrame(m, kb, fakeHost(phase, status, o.online ?? true).host, o.link ?? true, o.run ?? true, o.blocked ?? false, o.busy ?? false, 0);
      return m.pingButton;
    };
    for (const ph of ["build", "wave", "vote"]) {
      expect(shown(ph, "alive")).toBe(true);
      expect(shown(ph, "downed")).toBe(true);
      expect(shown(ph, "out")).toBe(false);
    }
    expect([shown("lobby", "alive"), shown("results", "alive")]).toEqual([false, false]);
    expect(shown("wave", "alive", { link: false }), "reconnecting / seat kept").toBe(false);
    expect(shown("wave", "alive", { online: false }), "solo (B8)").toBe(false);
    expect(shown("build", "alive", { busy: true }), "holding a building / one selected").toBe(false);
    expect(shown("build", "alive", { blocked: true }), "menu or shop open").toBe(false);
    expect(shown("wave", "alive", { run: false }), "game over / not running").toBe(false);
  });

  it("F toggles the wheel only while the button shows; 1–4 pick (sent once, latched with the press), 5–7 ignored, no build pick while open", () => {
    const m = createHudModel();
    const kb = new KeyboardMouse();
    const { host, sent } = fakeHost("build", "alive");
    kb.keyDown("KeyF");
    pingFrame(m, kb, host, true, true, false, false, 0);
    expect(m.ping.open).toBe(true);
    expect(m.pingSlot).toBe(1);
    kb.keyDown("Digit6"); // a build tile key while open: eaten, nothing picked
    pingFrame(m, kb, host, true, true, false, false, 16);
    expect(kb.takeBuild()).toBe(-1);
    expect(m.ping.open).toBe(true);
    kb.keyDown("Digit3");
    pingFrame(m, kb, host, true, true, false, false, 33);
    expect(sent).toEqual([2]);
    expect(m.ping.open).toBe(false);
    pingFrame(m, kb, host, true, true, false, false, 50);
    expect(sent).toEqual([2]); // once
    // closed: the digit goes to the build bar again
    kb.keyUp("Digit3");
    kb.keyDown("Digit3");
    pingFrame(m, kb, host, true, true, false, false, 66);
    expect(kb.takeBuild()).toBe(2);
    // F while the button is hidden does nothing (and the latch is used up)
    const out = fakeHost("wave", "out");
    kb.keyUp("KeyF");
    kb.keyDown("KeyF");
    pingFrame(m, kb, out.host, true, true, false, false, 2000);
    expect(m.ping.open).toBe(false);
    expect(kb.takePing()).toBe(false);
  });

  it("a chip tap (the HUD's pick) is sent the same frame; a ping is shown nowhere outside build / wave / vote", () => {
    const m = createHudModel();
    const kb = new KeyboardMouse();
    const { host, sent, pings } = fakeHost("wave", "downed");
    m.ping.pick = 0; // the HUD set it on the tap
    pingFrame(m, kb, host, true, true, false, false, 0);
    expect(sent).toEqual([0]);
    expect(m.ping.pick).toBe(-1);
    pings?.show(0, 0, 1, 1, 0);
    const res = fakeHost("results", "alive");
    (res.host as { pings: PingModel | null }).pings = pings;
    pingFrame(m, kb, res.host, true, true, false, false, 10);
    expect(pings?.live(0)).toBeNull();
  });

  it("pan: −1 at the left edge, 0 in the middle, 1 at the right, clamped off screen", () => {
    expect([pingPan(0, 640), pingPan(320, 640), pingPan(640, 640), pingPan(-500, 640), pingPan(5000, 640), pingPan(10, 0)]).toEqual([-1, 0, 1, -1, 1, 0]);
  });
});
