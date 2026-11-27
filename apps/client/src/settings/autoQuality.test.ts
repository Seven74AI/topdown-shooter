import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYER_SETTINGS_DEFAULTS, parseStoredSettings, playerSettingsSchema } from "@topdown/shared";
import { AUTO_QUALITY_KEY, AUTO_QUALITY_TOAST, AUTO_QUALITY_WINDOW_MS, AutoQuality, stepForFps, type AutoQualityFrame } from "./autoQuality";
import { getSettings, getStoredSettings, resetSettingsCache, saveSettings, setSettingsDefaults } from "./settings";

function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m };
}

const WAVE: AutoQualityFrame = { firstWave: true, hidden: false };
const BUILD: AutoQualityFrame = { firstWave: false, hidden: false };

/** Feeds `fps` frames for `ms` (from `t0`) with frame flags `f`; returns every toast the check gave and the end time. */
function feed(aq: AutoQuality, fps: number, ms: number, f: AutoQualityFrame = WAVE, t0 = 0): { toasts: string[]; t: number } {
  const toasts: string[] = [];
  const dt = 1000 / fps;
  let t = t0;
  for (; t <= t0 + ms; t += dt) {
    const s = aq.frame(t, f);
    if (s !== "") toasts.push(s);
  }
  return { toasts, t };
}

describe("Story 10.2-Q3 B: the one-time quality check (autoQuality)", () => {
  afterEach(() => {
    resetSettingsCache();
    vi.unstubAllGlobals();
  });
  const make = (store = memStorage(), disabled = false) => ({ store, aq: new AutoQuality(() => store, setSettingsDefaults, getStoredSettings, disabled) });

  it("thresholds: < 40 FPS one step, < 30 two, else none", () => {
    expect([45, 40, 39.9, 30, 29.9, 5].map(stepForFps)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("45 FPS → no change, no toast, remembered as checked", () => {
    const { store, aq } = make();
    const { toasts } = feed(aq, 45, AUTO_QUALITY_WINDOW_MS + 500);
    expect(toasts).toEqual([]);
    expect(aq.phase).toBe("done");
    expect(aq.step).toBe(0);
    expect(getSettings()).toEqual(PLAYER_SETTINGS_DEFAULTS);
    expect(JSON.parse(store.map.get(AUTO_QUALITY_KEY) ?? "{}")).toEqual({ step: 0 });
  });

  it("39 FPS → one step (Resolution Balanced, Rain Light), the toast once", () => {
    const { store, aq } = make();
    const { toasts, t } = feed(aq, 39, AUTO_QUALITY_WINDOW_MS + 500);
    expect(toasts).toEqual([AUTO_QUALITY_TOAST]);
    expect(getSettings()).toMatchObject({ resolution: "balanced", rain: "light", glow: "full" });
    expect(getStoredSettings()).toEqual({}); // only the defaults moved
    expect(feed(aq, 10, 2 * AUTO_QUALITY_WINDOW_MS, WAVE, t).toasts).toEqual([]); // runs once
    expect(JSON.parse(store.map.get(AUTO_QUALITY_KEY) ?? "{}")).toEqual({ step: 1 });
  });

  it("29 FPS → two steps (Resolution Fast, Rain Light, Glow Low)", () => {
    const { aq } = make();
    expect(feed(aq, 29, AUTO_QUALITY_WINDOW_MS + 500).toasts).toEqual([AUTO_QUALITY_TOAST]);
    expect(getSettings()).toMatchObject({ resolution: "fast", rain: "light", glow: "low" });
  });

  it("a stored player choice still wins; when every lowered field is the player's own, no toast", () => {
    saveSettings({ resolution: "sharp" });
    const a = make();
    feed(a.aq, 29, AUTO_QUALITY_WINDOW_MS + 500);
    expect(getSettings()).toMatchObject({ resolution: "sharp", rain: "light", glow: "low" });
    resetSettingsCache();
    saveSettings({ resolution: "sharp", rain: "full", glow: "off" });
    const b = make();
    expect(feed(b.aq, 29, AUTO_QUALITY_WINDOW_MS + 500).toasts).toEqual([]);
    expect(getSettings()).toMatchObject({ resolution: "sharp", rain: "full", glow: "off" });
  });

  it("the next boot applies the remembered step without checking again", () => {
    const store = memStorage({ [AUTO_QUALITY_KEY]: JSON.stringify({ step: 2 }) });
    const { aq } = make(store);
    aq.boot();
    expect(aq.phase).toBe("done");
    expect(getSettings()).toMatchObject({ resolution: "fast", rain: "light", glow: "low" });
    expect(feed(aq, 10, AUTO_QUALITY_WINDOW_MS + 500).toasts).toEqual([]);
  });

  it("junk or a throwing storage: no remembered step (checks), and a result that can't be stored still applies", () => {
    for (const raw of ["{", "null", JSON.stringify({ step: 7 }), JSON.stringify({})]) {
      const { aq } = make(memStorage({ [AUTO_QUALITY_KEY]: raw }));
      aq.boot();
      expect(aq.phase, raw).toBe("idle");
    }
    const boom = () => {
      throw new Error("blocked");
    };
    const aq = new AutoQuality(() => ({ getItem: boom, setItem: boom }), setSettingsDefaults, getStoredSettings);
    aq.boot();
    expect(feed(aq, 35, AUTO_QUALITY_WINDOW_MS + 500).toasts).toEqual([AUTO_QUALITY_TOAST]);
    expect(getSettings().resolution).toBe("balanced");
  });

  it("never in the lobby / a build phase, never under ?stress", () => {
    const { aq } = make();
    expect(feed(aq, 10, 3 * AUTO_QUALITY_WINDOW_MS, BUILD).toasts).toEqual([]);
    expect(aq.phase).toBe("idle");
    const s = make(memStorage(), true);
    expect(feed(s.aq, 10, 3 * AUTO_QUALITY_WINDOW_MS).toasts).toEqual([]);
    expect(s.aq.phase).toBe("idle");
    expect(getSettings()).toEqual(PLAYER_SETTINGS_DEFAULTS);
  });

  it("a hidden tab (or the wave ending) during the window cancels that try; the next first wave checks afresh", () => {
    const { aq } = make();
    let r = feed(aq, 20, 5000); // half the window at 20 FPS
    expect(aq.phase).toBe("running");
    aq.frame(r.t, { firstWave: true, hidden: true });
    expect(aq.phase).toBe("idle");
    r = feed(aq, 50, 5000, WAVE, r.t + 1);
    aq.frame(r.t, BUILD); // the wave ended before 10 s
    expect(aq.phase).toBe("idle");
    expect(getSettings()).toEqual(PLAYER_SETTINGS_DEFAULTS);
    expect(feed(aq, 50, AUTO_QUALITY_WINDOW_MS + 500, WAVE, r.t + 1).toasts).toEqual([]); // the fresh try: 50 FPS
    expect(aq.step).toBe(0);
    expect(aq.phase).toBe("done");
  });
});

describe("Story 10.2-Q2 A: the resolution field", () => {
  it("is in the schema (default sharp); an older client's value without it still parses; junk dropped", () => {
    expect(PLAYER_SETTINGS_DEFAULTS.resolution).toBe("sharp");
    expect(playerSettingsSchema.parse({ resolution: "fast" })).toEqual({ resolution: "fast" });
    expect(parseStoredSettings({ rain: "light" })).toEqual({ rain: "light" });
    expect(parseStoredSettings({ resolution: "ultra", rain: "off" })).toEqual({ rain: "off" });
  });
});
