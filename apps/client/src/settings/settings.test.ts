import { afterEach, describe, expect, it } from "vitest";
import { getSettings, resetSettingsCache, saveSettings } from "./settings";

describe("settings", () => {
  afterEach(() => resetSettingsCache());
  it("defaults to screen shake on, even without localStorage (node)", () => {
    expect(getSettings().screenShake).toBe(true);
  });
  it("keeps saved values in memory when storage is unavailable", () => {
    saveSettings({ screenShake: false });
    expect(getSettings().screenShake).toBe(false);
  });
});
