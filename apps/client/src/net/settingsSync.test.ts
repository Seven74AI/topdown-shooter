import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings, resetSettingsCache, saveSettings, settingsPending } from "../settings/settings";
import { SETTINGS_SYNC_DEBOUNCE_MS, acceptSessionSettings, changeSettings, pushSettings, setSettingsSyncDeps } from "./settingsSync";

/** Story 10.1 (AC 6, B9): this phone's settings ↔ the logged-in account. */
describe("settingsSync", () => {
  let calls: { url: string; body: unknown }[];
  let loggedIn: boolean;
  let ok: boolean;
  let timers: (() => void)[];
  beforeEach(() => {
    resetSettingsCache();
    calls = [];
    loggedIn = true;
    ok = true;
    timers = [];
    setSettingsSyncDeps({
      fetch: (async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { settings: unknown };
        calls.push({ url, body });
        return new Response(JSON.stringify({ ok: true, settings: body.settings }), { status: ok ? 200 : 503 });
      }) as unknown as typeof fetch,
      url: () => "/api/account/settings",
      loggedIn: () => loggedIn,
      setTimeout: (fn) => (timers.push(fn), timers.length),
      clearTimeout: (h) => {
        timers[(h as number) - 1] = () => {};
      },
    });
  });
  afterEach(() => {
    setSettingsSyncDeps(null);
    resetSettingsCache();
  });
  const flush = async () => {
    for (const t of timers.splice(0)) t();
    await vi.waitFor(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
  };

  it("a change applies at once and, logged in, is sent ONCE after the debounce with the changed fields only; success clears pending", async () => {
    changeSettings({ rain: "off" });
    changeSettings({ sfxVolume: 30 });
    expect(getSettings()).toMatchObject({ rain: "off", sfxVolume: 30 });
    expect(calls).toHaveLength(0);
    expect(SETTINGS_SYNC_DEBOUNCE_MS).toBe(1000);
    await flush();
    expect(calls).toEqual([{ url: "/api/account/settings", body: { settings: { rain: "off", sfxVolume: 30 } } }]);
    expect(settingsPending()).toBe(false);
  });

  it("a guest never calls (AC: synced when logged in); the change stays local and pending", async () => {
    loggedIn = false;
    changeSettings({ glow: "off" });
    await flush();
    expect(calls).toHaveLength(0);
    expect(await pushSettings()).toBe(false);
    expect(getSettings().glow).toBe("off");
    expect(settingsPending()).toBe(true);
  });

  it("a failed send keeps pending; the next session answer sends again instead of adopting the server's copy", async () => {
    ok = false;
    changeSettings({ rain: "light" });
    await flush();
    expect(settingsPending()).toBe(true);
    ok = true;
    expect(acceptSessionSettings("mo_42", { rain: "off" })).toBe("push");
    await flush();
    expect(getSettings().rain).toBe("light");
    expect(calls.at(-1)?.body).toEqual({ settings: { rain: "light" } });
    expect(settingsPending()).toBe(false);
  });

  it("nothing pending: the account's settings are adopted (applied at once); none on the account and I changed some → mine are sent; a guest answer does nothing", async () => {
    expect(acceptSessionSettings("mo_42", { glow: "low", aimAssist: false })).toBe("adopt");
    expect(getSettings()).toMatchObject({ glow: "low", aimAssist: false });
    expect(calls).toHaveLength(0);
    expect(acceptSessionSettings("mo_42", null)).toBe("push");
    await flush();
    expect(calls.at(-1)?.body).toEqual({ settings: { glow: "low", aimAssist: false } });
    resetSettingsCache();
    expect(acceptSessionSettings("mo_42", null)).toBe("none"); // nothing changed here, nothing on the account
    expect(acceptSessionSettings(null, { rain: "off" })).toBe("none");
    expect(getSettings().rain).toBe("full");
  });

  it("a change made while a send is in flight stays pending", async () => {
    saveSettings({ rain: "off" });
    const p = pushSettings();
    saveSettings({ rain: "light" });
    expect(await p).toBe(true);
    expect(settingsPending()).toBe(true);
  });
});
