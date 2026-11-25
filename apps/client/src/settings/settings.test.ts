import { afterEach, describe, expect, it, vi } from "vitest";
import { getSettings, resetSettingsCache, saveSettings } from "./settings";

describe("settings", () => {
  afterEach(() => {
    resetSettingsCache();
    vi.unstubAllGlobals();
  });
  it("Always full speed defaults off and can be turned on", () => {
    expect(getSettings().alwaysFullSpeed).toBe(false);
    saveSettings({ alwaysFullSpeed: true });
    expect(getSettings().alwaysFullSpeed).toBe(true);
  });
  it("settings saved before Always full speed existed read it as off", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ screenShake: false, haptics: true }), setItem: () => {} });
    expect(getSettings()).toEqual({ screenShake: false, haptics: true, alwaysFullSpeed: false });
  });
  it("a throwing localStorage falls back to the defaults", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(getSettings().alwaysFullSpeed).toBe(false);
    saveSettings({ alwaysFullSpeed: true });
    expect(getSettings().alwaysFullSpeed).toBe(true);
  });
  it("defaults to screen shake on, even without localStorage (node)", () => {
    expect(getSettings().screenShake).toBe(true);
  });
  it("keeps saved values in memory when storage is unavailable", () => {
    saveSettings({ screenShake: false });
    expect(getSettings().screenShake).toBe(false);
  });
});
