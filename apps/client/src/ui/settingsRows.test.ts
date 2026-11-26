import { describe, expect, it } from "vitest";
import { PLAYER_SETTINGS_DEFAULTS } from "@topdown/shared";
import { SETTINGS_GROUPS, SETTINGS_TEXT, shownKeys, visibleRows } from "./settingsRows";
import { MENU_ITEMS, visibleMenuItems } from "./menuItems";
import { menuStep } from "./uiState";
import { inRoom } from "./accountModel";

describe("Story 10.1: the Settings rows (AC 1–3; B2, B16, B18)", () => {
  it("AC 1: aim assist, screen shake, vibration, full speed, show performance, rain, fog detail, light glow and two volumes are shown", () => {
    expect(shownKeys().sort()).toEqual(["aimAssist", "alwaysFullSpeed", "ambienceVolume", "fog", "glow", "haptics", "rain", "screenShake", "sfxVolume", "showPerformance"].sort());
    for (const k of shownKeys()) expect(PLAYER_SETTINGS_DEFAULTS).toHaveProperty(k);
  });
  it("B2: gore, film grain and music volume are stored fields but have no row yet", () => {
    for (const k of ["gore", "filmGrain", "musicVolume"]) {
      expect(PLAYER_SETTINGS_DEFAULTS).toHaveProperty(k);
      expect(shownKeys()).not.toContain(k);
    }
  });
  it("AC 2: nothing for blackout darkness or the fog vision limit", () => {
    const text = JSON.stringify(SETTINGS_GROUPS).toLowerCase();
    expect(text).not.toMatch(/blackout|darkness|vision|radius|10 m/);
  });
  it("B18: Vibration only where the phone can vibrate", () => {
    const controls = SETTINGS_GROUPS[0]!;
    expect(visibleRows(controls, true).map((r) => r.key)).toContain("haptics");
    expect(visibleRows(controls, false).map((r) => r.key)).not.toContain("haptics");
  });
  it("AC 7: the confirm names what goes", () => {
    expect(SETTINGS_TEXT.confirmGoes).toEqual(["Supplies", "Unlocks", "Training", "Your survivor's look", "Saved games"]);
    expect(SETTINGS_TEXT.confirmAccount("mo_42")).toContain("mo_42");
  });
  it("the ☰ menu still opens Settings and Back returns; the start screen's Settings is never 'in a room'", () => {
    expect(visibleMenuItems({ online: true, isHost: false }, MENU_ITEMS).map((i) => i.id)).toContain("settings");
    expect(menuStep("open", "settings")).toBe("settings");
    expect(menuStep("settings", "back")).toBe("open");
    expect(menuStep("settings", "toggle")).toBe("closed");
    expect(inRoom({ kind: "settings", view: "main" })).toBe(false);
  });
});
