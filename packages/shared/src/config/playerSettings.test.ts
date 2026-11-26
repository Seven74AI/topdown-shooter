import { describe, expect, it } from "vitest";
import { GLOW_LEVEL_K, PLAYER_SETTINGS_DEFAULTS, RAIN_LEVEL_K, parseStoredSettings, playerSettingsSchema } from "./playerSettings";
import { progressViewSchema } from "../net/account";

describe("Story 10.1: the player settings schema (B1, B2)", () => {
  it("every field has a default, and the defaults pass the schema (aim assist on, performance off)", () => {
    expect(Object.keys(PLAYER_SETTINGS_DEFAULTS).sort()).toEqual(Object.keys(playerSettingsSchema.shape).sort());
    expect(playerSettingsSchema.parse(PLAYER_SETTINGS_DEFAULTS)).toEqual(PLAYER_SETTINGS_DEFAULTS);
    expect(PLAYER_SETTINGS_DEFAULTS.aimAssist).toBe(true);
    expect(PLAYER_SETTINGS_DEFAULTS.showPerformance).toBe(false);
  });

  it("B2: the not-built features are stored fields with defaults (gore, film grain, music volume)", () => {
    expect(PLAYER_SETTINGS_DEFAULTS).toMatchObject({ gore: "full", filmGrain: "full", musicVolume: 100 });
    expect(playerSettingsSchema.parse({ gore: "bloodOnly", filmGrain: "off", musicVolume: 0 })).toEqual({ gore: "bloodOnly", filmGrain: "off", musicVolume: 0 });
  });

  it("parseStoredSettings keeps each valid field and drops bad or unknown ones (one bad field never loses the rest)", () => {
    expect(parseStoredSettings({ rain: "off", sfxVolume: 101, glow: "neon", screenShake: false, extra: 1 })).toEqual({ rain: "off", screenShake: false });
    for (const junk of [null, 3, "x", [1], undefined]) expect(parseStoredSettings(junk)).toEqual({});
  });

  it("the old 3-field value still reads", () => {
    expect(parseStoredSettings({ screenShake: false, haptics: true, alwaysFullSpeed: true })).toEqual({ screenShake: false, haptics: true, alwaysFullSpeed: true });
  });

  it("B3 / B5 multipliers: Full 1, Light/Low 0.5, Off 0", () => {
    expect(RAIN_LEVEL_K).toEqual({ full: 1, light: 0.5, off: 0 });
    expect(GLOW_LEVEL_K).toEqual({ full: 1, low: 0.5, off: 0 });
  });

  it("the session's progress view carries settings (optional, nullable) and drops a bad settings value's bad field only at parse", () => {
    expect(progressViewSchema.parse({ supplies: 0, lifetimeSupplies: 0, unlocks: [], settings: { rain: "light" } }).settings).toEqual({ rain: "light" });
    expect(progressViewSchema.parse({ supplies: 0, lifetimeSupplies: 0, unlocks: [], settings: null }).settings).toBeNull();
    expect(progressViewSchema.parse({ supplies: 0, lifetimeSupplies: 0, unlocks: [] }).settings).toBeUndefined();
  });
});
