import { afterEach, describe, expect, it } from "vitest";
import { vibrate } from "./haptics";
import { resetSettingsCache, saveSettings } from "../settings/settings";

describe("Story 5.23: haptics (AC 5, D9)", () => {
  afterEach(() => resetSettingsCache());
  it("vibrates the pattern when the setting is on and the browser can", () => {
    const calls: unknown[] = [];
    const nav = { vibrate: (p: number | readonly number[]) => (calls.push(p), true) };
    expect(vibrate(12, nav)).toBe(true);
    expect(vibrate([30, 40, 30], nav)).toBe(true);
    expect(calls).toEqual([12, [30, 40, 30]]);
  });
  it("nothing with the setting off, without vibrate (iOS, desktop) or when the call throws", () => {
    const calls: unknown[] = [];
    const nav = { vibrate: (p: number | readonly number[]) => (calls.push(p), true) };
    saveSettings({ haptics: false });
    expect(vibrate(12, nav)).toBe(false);
    saveSettings({ haptics: true });
    expect(vibrate(12, {})).toBe(false);
    expect(vibrate(12, undefined)).toBe(false);
    expect(
      vibrate(12, {
        vibrate: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
    expect(calls).toEqual([]);
  });
});
