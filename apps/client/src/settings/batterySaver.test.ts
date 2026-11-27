import { afterEach, describe, expect, it } from "vitest";
import { PLAYER_SETTINGS_DEFAULTS, loadBalance, parseStoredSettings, playerSettingsSchema } from "@topdown/shared";
import { LocalSimHost } from "../sim/LocalSimHost";
import { bindBatterySaver, capFrames, frameCap, type CappableLoop } from "./batterySaver";
import { resetSettingsCache, saveSettings } from "./settings";

const balance = loadBalance();

/** 2 s of display frames at `hz` with ±0.15 ms rAF rounding, through the (maybe capped) loop into a solo sim host. */
function run(on: boolean, hz: number) {
  const host = new LocalSimHost({ balance, seed: 1 });
  let draws = 0;
  let drawnMs = 0;
  const loop: CappableLoop = {
    callback: (_t, delta) => {
      draws++;
      drawnMs += delta;
      host.update(delta / 1000);
    },
  };
  capFrames(loop);
  frameCap.on = on;
  const frame = 1000 / hz;
  let t = 0;
  for (let i = 1; i <= 2 * hz; i++) {
    const now = Math.round((i * frame + (i % 2 ? 0.15 : -0.15)) * 10) / 10; // Chrome rounds rAF timestamps
    loop.callback(now, now - t);
    t = now;
  }
  return { draws, drawnMs, ticks: host.stats.totalSteps, wallMs: t };
}

describe("Story 10.3-Q1 A: Battery saver caps the draw at 30 frames a second, the sim keeps 20 Hz", () => {
  afterEach(() => {
    frameCap.on = false;
    resetSettingsCache();
  });

  it("off: every display frame is drawn; on: every other one at 60 Hz, every 4th at 120 Hz", () => {
    expect(run(false, 60).draws).toBe(120);
    expect(run(true, 60).draws).toBe(60);
    expect(run(true, 120).draws).toBe(60);
    expect(run(true, 144).draws).toBeLessThanOrEqual(60);
  });

  it("the same 20 Hz ticks over 2 s with the draw capped (no wall time lost or counted twice)", () => {
    const off = run(false, 60);
    const on = run(true, 60);
    expect(off.ticks).toBe(Math.floor(off.wallMs / 50)); // 39: the last frame lands at 1999.85 ms
    expect(on.ticks).toBe(off.ticks);
    expect(on.drawnMs).toBeCloseTo(on.wallMs, 6);
    expect(off.drawnMs).toBeCloseTo(off.wallMs, 6);
  });

  it("a slow frame (≥ 29.3 ms) is drawn at once", () => {
    const seen: number[] = [];
    const loop: CappableLoop = { callback: (_t, d) => seen.push(d) };
    capFrames(loop);
    frameCap.on = true;
    loop.callback(50, 50);
    loop.callback(66.7, 16.7);
    loop.callback(83.3, 16.6);
    expect(seen).toEqual([50, 33.3]);
  });

  it("review L3: turning the saver off between two drawn frames keeps the skipped frame's time", () => {
    const seen: number[] = [];
    const loop: CappableLoop = { callback: (_t, d) => seen.push(d) };
    capFrames(loop);
    frameCap.on = true;
    loop.callback(33.3, 33.3); // drawn
    loop.callback(50, 16.7); // skipped
    frameCap.on = false;
    loop.callback(66.7, 16.7); // drawn with 16.7 + 16.7
    expect(seen).toEqual([33.3, 33.4]);
  });

  it("follows the setting at once (no reload); off by default; stored and parsed like the other switches", () => {
    expect(PLAYER_SETTINGS_DEFAULTS.batterySaver).toBe(false);
    expect(playerSettingsSchema.parse({ batterySaver: true })).toEqual({ batterySaver: true });
    expect(parseStoredSettings({ batterySaver: "yes", rain: "off" })).toEqual({ rain: "off" });
    const unbind = bindBatterySaver();
    expect(frameCap.on).toBe(false);
    saveSettings({ batterySaver: true });
    expect(frameCap.on).toBe(true);
    saveSettings({ batterySaver: false });
    expect(frameCap.on).toBe(false);
    unbind();
  });
});
