import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYER_SETTINGS_DEFAULTS } from "@topdown/shared";
import { PLAYER_STORAGE_KEYS, resetPhoneAfterDelete } from "./deleteProgress";
import { SETTINGS_KEY, SETTINGS_PENDING_KEY, getSettings, resetSettingsCache, saveSettings, setSettingsPending } from "../settings/settings";

describe("Story 10.1 (AC 10, B15): after a delete the phone forgets the player and reloads", () => {
  afterEach(() => {
    resetSettingsCache();
    vi.unstubAllGlobals();
  });
  it("clears the guest token, name, look, progress cache, last bank, seat, settings and the pending mark; keeps graphics caches; reloads", () => {
    const m = new Map<string, string>([
      ["topdown.guestToken", "a".repeat(32)],
      ["topdown.name", "Ana"],
      ["topdown.look", "x"],
      ["topdown.progress", "{}"],
      ["tds.lastBank", "{}"],
      ["topdown.seat", "{}"],
      ["fx_darkness", "keep"],
    ]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
    saveSettings({ rain: "off" });
    setSettingsPending("mo_42");
    expect(m.has(SETTINGS_KEY) && m.has(SETTINGS_PENDING_KEY)).toBe(true);
    const reload = vi.fn();
    resetPhoneAfterDelete(() => globalThis.localStorage, reload);
    expect([...m.keys()]).toEqual(["fx_darkness"]);
    expect(getSettings()).toEqual(PLAYER_SETTINGS_DEFAULTS);
    expect(reload).toHaveBeenCalledOnce();
    expect(PLAYER_STORAGE_KEYS).toContain("topdown.guestToken");
  });
  it("blocked storage: still resets the settings in memory and reloads", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    saveSettings({ glow: "off" });
    const reload = vi.fn();
    resetPhoneAfterDelete(() => globalThis.localStorage, reload);
    expect(getSettings().glow).toBe("full");
    expect(reload).toHaveBeenCalledOnce();
  });
});
