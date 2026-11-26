import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSettings, resetSettingsCache, saveSettings, settingsPendingFor } from "../settings/settings";
import { SETTINGS_SYNC_DEBOUNCE_MS, acceptSessionSettings, changeSettings, pushSettings, setSettingsSyncDeps } from "./settingsSync";

/** Story 10.1 (AC 6, B9; review M1, L2): this phone's settings ↔ the logged-in account. */
describe("settingsSync", () => {
  let calls: { url: string; body: { settings: Record<string, unknown> } }[];
  let user: string | null;
  let ok: boolean;
  let timers: (() => void)[];
  let gate: Promise<void> | null;
  beforeEach(() => {
    resetSettingsCache();
    calls = [];
    user = "mo_42";
    ok = true;
    timers = [];
    gate = null;
    setSettingsSyncDeps({
      fetch: (async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { settings: Record<string, unknown> };
        calls.push({ url, body });
        if (gate) await gate;
        return new Response(JSON.stringify({ ok: true, settings: body.settings }), { status: ok ? 200 : 503 });
      }) as unknown as typeof fetch,
      url: () => "/api/account/settings",
      username: () => user,
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
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const flush = async () => {
    for (const t of timers.splice(0)) t();
    for (let i = 0; i < 5; i++) await tick();
  };

  it("a change applies at once and, logged in, is sent ONCE after the debounce with the changed fields only; success clears pending", async () => {
    changeSettings({ rain: "off" });
    changeSettings({ sfxVolume: 30 });
    expect(getSettings()).toMatchObject({ rain: "off", sfxVolume: 30 });
    expect(settingsPendingFor()).toBe("mo_42");
    expect(calls).toHaveLength(0);
    expect(SETTINGS_SYNC_DEBOUNCE_MS).toBe(1000);
    await flush();
    expect(calls).toEqual([{ url: "/api/account/settings", body: { settings: { rain: "off", sfxVolume: 30 } } }]);
    expect(settingsPendingFor()).toBeNull();
  });

  it("a guest never calls and its change is NOT marked pending (review M1)", async () => {
    user = null;
    changeSettings({ glow: "off" });
    await flush();
    expect(calls).toHaveLength(0);
    expect(await pushSettings()).toBe(false);
    expect(getSettings().glow).toBe("off");
    expect(settingsPendingFor()).toBeNull();
  });

  it("review M1: guest changes, then a login to an account WITH settings → the account's settings win, nothing is sent", async () => {
    user = null;
    changeSettings({ rain: "off" });
    user = "mo_42";
    expect(acceptSessionSettings("mo_42", { rain: "light", glow: "low" })).toBe("adopt");
    await flush();
    expect(calls).toHaveLength(0);
    expect(getSettings()).toMatchObject({ rain: "light", glow: "low" });
  });

  it("review M1: A's unsent change, then the phone switches to B → A's mark is dropped, B's settings are adopted, nothing reaches B", async () => {
    ok = false;
    changeSettings({ rain: "off" });
    await flush();
    expect(settingsPendingFor()).toBe("mo_42");
    ok = true;
    user = "bo_7";
    expect(acceptSessionSettings("bo_7", { glow: "off" })).toBe("adopt");
    await flush();
    expect(calls.filter((c) => c.body.settings.rain === "off")).toHaveLength(1); // only A's own failed try
    expect(settingsPendingFor()).toBeNull();
    expect(getSettings()).toMatchObject({ glow: "off", rain: "full" });
  });

  it("the upgrade path is kept: guest changes, the guest saves an account (none on it) → the phone's choices are sent", async () => {
    user = null;
    changeSettings({ aimAssist: false });
    user = "new_acct";
    expect(acceptSessionSettings("new_acct", null)).toBe("push");
    await flush();
    expect(calls.at(-1)?.body).toEqual({ settings: { aimAssist: false } });
  });

  it("a failed send keeps my mark; the next session answer for ME sends again instead of adopting the server's copy", async () => {
    ok = false;
    changeSettings({ rain: "light" });
    await flush();
    expect(settingsPendingFor()).toBe("mo_42");
    ok = true;
    expect(acceptSessionSettings("mo_42", { rain: "off" })).toBe("push");
    await flush();
    expect(getSettings().rain).toBe("light");
    expect(calls.at(-1)?.body).toEqual({ settings: { rain: "light" } });
    expect(settingsPendingFor()).toBeNull();
  });

  it("nothing pending: the account's settings are adopted; none on the account and nothing changed here → nothing; a guest answer does nothing", async () => {
    expect(acceptSessionSettings("mo_42", { glow: "low", aimAssist: false })).toBe("adopt");
    expect(getSettings()).toMatchObject({ glow: "low", aimAssist: false });
    resetSettingsCache();
    expect(acceptSessionSettings("mo_42", null)).toBe("none");
    expect(acceptSessionSettings(null, { rain: "off" })).toBe("none");
    expect(getSettings().rain).toBe("full");
    expect(calls).toHaveLength(0);
  });

  it("review L2: one send at a time; a change during it is sent once afterwards with the latest settings", async () => {
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    changeSettings({ rain: "off" });
    await flush();
    expect(calls).toHaveLength(1);
    changeSettings({ rain: "light" });
    await flush(); // the debounce fires while the first send is still waiting
    void pushSettings();
    expect(calls).toHaveLength(1); // no second request in flight
    gate = null;
    open();
    for (let i = 0; i < 10; i++) await tick();
    expect(calls.map((c) => c.body.settings.rain)).toEqual(["off", "light"]);
    expect(settingsPendingFor()).toBeNull();
  });

  it("a change made while a send is in flight stays pending until its own send", async () => {
    changeSettings({ rain: "off" });
    timers.splice(0);
    const p = pushSettings();
    saveSettings({ rain: "light" });
    expect(await p).toBe(true);
    expect(settingsPendingFor()).toBe("mo_42");
  });
});
