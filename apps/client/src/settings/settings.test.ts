import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYER_SETTINGS_DEFAULTS } from "@topdown/shared";
import { SETTINGS_KEY, clearSettings, getSettings, getStoredSettings, replaceStoredSettings, resetSettingsCache, saveSettings, setSettingsDefaults, setSettingsPending, settingsPending, subscribeSettings } from "./settings";

/** A Map-backed localStorage. */
function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m };
}

describe("settings (Story 10.1 store; 5.23 / full-speed fields kept)", () => {
  afterEach(() => {
    resetSettingsCache();
    vi.unstubAllGlobals();
  });
  it("Always full speed defaults off and can be turned on", () => {
    expect(getSettings().alwaysFullSpeed).toBe(false);
    saveSettings({ alwaysFullSpeed: true });
    expect(getSettings().alwaysFullSpeed).toBe(true);
  });
  it("settings saved before 10.1 (3 fields) still read, the new fields at their defaults", () => {
    vi.stubGlobal("localStorage", memStorage({ [SETTINGS_KEY]: JSON.stringify({ screenShake: false, haptics: true }) }));
    expect(getSettings()).toEqual({ ...PLAYER_SETTINGS_DEFAULTS, screenShake: false, haptics: true, alwaysFullSpeed: false });
  });
  it("a throwing localStorage falls back to the defaults and keeps changes in memory", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(getSettings()).toEqual(PLAYER_SETTINGS_DEFAULTS);
    saveSettings({ alwaysFullSpeed: true, rain: "off" });
    expect(getSettings()).toMatchObject({ alwaysFullSpeed: true, rain: "off" });
    expect(settingsPending()).toBe(true);
    clearSettings();
    expect(getSettings()).toEqual(PLAYER_SETTINGS_DEFAULTS);
  });
  it("junk in storage (bad JSON, bad fields) gives the defaults for those fields only", () => {
    vi.stubGlobal("localStorage", memStorage({ [SETTINGS_KEY]: "{not json" }));
    expect(getSettings()).toEqual(PLAYER_SETTINGS_DEFAULTS);
    resetSettingsCache();
    vi.stubGlobal("localStorage", memStorage({ [SETTINGS_KEY]: JSON.stringify({ rain: "light", sfxVolume: "loud" }) }));
    expect(getSettings()).toEqual({ ...PLAYER_SETTINGS_DEFAULTS, rain: "light" });
  });
  it("B1: only the changed fields are stored, so new defaults (10.2) apply to everything else", () => {
    const st = memStorage();
    vi.stubGlobal("localStorage", st);
    saveSettings({ glow: "low" });
    expect(JSON.parse(st.map.get(SETTINGS_KEY) as string)).toEqual({ glow: "low" });
    setSettingsDefaults({ rain: "light", glow: "off" });
    expect(getSettings()).toMatchObject({ rain: "light", glow: "low" }); // the choice wins over the new default
    expect(getStoredSettings()).toEqual({ glow: "low" });
  });
  it("AC 4: subscribers hear every change at once (save, adopt, defaults); getSettings is the same object until a change", () => {
    vi.stubGlobal("localStorage", memStorage());
    const seen: string[] = [];
    subscribeSettings((s) => seen.push(`${s.sfxVolume}/${s.rain}`));
    const a = getSettings();
    expect(getSettings()).toBe(a);
    saveSettings({ sfxVolume: 40 });
    replaceStoredSettings({ rain: "off" });
    setSettingsDefaults({ sfxVolume: 80 });
    expect(seen).toEqual(["40/full", "100/off", "80/off"]);
    expect(getSettings()).not.toBe(a);
  });
  it("B9: a change marks pending (in storage); adopting the account's copy does not", () => {
    const st = memStorage();
    vi.stubGlobal("localStorage", st);
    replaceStoredSettings({ rain: "off" });
    expect(settingsPending()).toBe(false);
    saveSettings({ rain: "light" });
    expect(st.map.get("topdown-shooter.settings.pending")).toBe("1");
    resetSettingsCache();
    expect(settingsPending()).toBe(true); // survives a reload
    setSettingsPending(false);
    expect(st.map.has("topdown-shooter.settings.pending")).toBe(false);
  });
  it("AC 10: clearSettings removes the stored value and the pending mark", () => {
    const st = memStorage();
    vi.stubGlobal("localStorage", st);
    saveSettings({ rain: "off" });
    clearSettings();
    expect(st.map.has(SETTINGS_KEY)).toBe(false);
    expect(st.map.has("topdown-shooter.settings.pending")).toBe(false);
    expect(getSettings()).toEqual(PLAYER_SETTINGS_DEFAULTS);
  });
});
