import { loadBalance } from "@topdown/shared";
import type * as Phaser from "phaser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountStore, type AccountSnapshot } from "../net/accountStore";
import { installAdminGate } from "./adminGate";
import { DEV_SWITCH_KEYS, urlHasDevSwitch } from "./soloDevSwitches";
import { parseUrlOptions } from "./urlOptions";

/** Story 10.11: the admin mark on the client, the lazy panel gate and the dev link switches for admins' solo runs. */
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("Story 10.11 AC 2, 5: accountStore.admin", () => {
  it("true only with a username and admin: true; a missing field, a guest, a logout and an unsaved reply → false", () => {
    const s = new AccountStore(memory);
    expect(s.get().admin).toBe(false);
    s.accept("mo_42", true);
    expect(s.get()).toEqual({ known: true, username: "mo_42", admin: true });
    s.accept("mo_42"); // an older server (no field)
    expect(s.get().admin).toBe(false);
    s.accept("mo_42", true);
    s.dropAdmin();
    expect(s.get()).toEqual({ known: true, username: "mo_42", admin: false });
    s.accept(null, true); // a guest can never be one
    expect(s.get().admin).toBe(false);
  });

  it("listeners hear the change; the gone notice keeps admin as it is", () => {
    const st = memory();
    const s = new AccountStore(() => st);
    const seen: boolean[] = [];
    s.subscribe((x) => seen.push(x.admin));
    s.accept("mo_42", true);
    s.accept(null); // deleted elsewhere: gone
    expect(s.get().gone).toBe(true);
    s.dismissGone();
    expect(seen).toEqual([true, false, false]);
  });
});

describe("Story 10.11 AC 3, 5, 7: the admin gate loads the panel only for an admin", () => {
  const game = {} as Phaser.Game;
  function fakeStore(first: AccountSnapshot) {
    let snap = first;
    const ls = new Set<(s: AccountSnapshot) => void>();
    return {
      get: () => snap,
      subscribe: (l: (s: AccountSnapshot) => void) => (ls.add(l), () => ls.delete(l)),
      set: (s: AccountSnapshot) => {
        snap = s;
        for (const l of ls) l(s);
      },
    };
  }
  const guest: AccountSnapshot = { known: true, username: null, admin: false };
  const plain: AccountSnapshot = { known: true, username: "mo", admin: false };
  const admin: AccountSnapshot = { known: true, username: "mo", admin: true };

  it("a guest and a non-admin never load it; the first admin answer loads it once and shows it; losing admin hides it", async () => {
    const store = fakeStore({ known: false, username: null, admin: false });
    const visible: boolean[] = [];
    const mount = vi.fn((_g: Phaser.Game, o: { visible: boolean }) => (visible.push(o.visible), { setVisible: (x: boolean) => void visible.push(x) }));
    const load = vi.fn(async () => ({ mountAdminTools: mount }));
    installAdminGate(game, store, load);
    store.set(guest);
    store.set(plain);
    expect(load).not.toHaveBeenCalled();
    store.set(admin);
    store.set(admin); // a second answer while loading: still one download
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledTimes(1);
    store.set(guest); // logout
    store.set(admin); // log back in
    store.set(plain); // operator ran remove
    expect(load).toHaveBeenCalledTimes(1);
    expect(visible).toEqual([true, false, true, false]);
  });

  it("losing admin while the chunk downloads mounts it hidden; a failed download is retried at the next admin answer", async () => {
    const store = fakeStore(admin);
    let fail = true;
    const mount = vi.fn((_g: Phaser.Game, o: { visible: boolean }) => ({ setVisible: () => void o }));
    const load = vi.fn(async () => {
      if (fail) throw new Error("offline");
      return { mountAdminTools: mount };
    });
    installAdminGate(game, store, load);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    fail = false;
    store.set(admin);
    store.set(plain);
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    expect(mount.mock.calls[0]?.[1]).toEqual({ visible: false });
  });
});

describe("Story 10.11 AC 6: the dev link switches (AD-4)", () => {
  const Q = "?startwave=7&bosswave=3&bosshp=0.1&events=car_alarm@1&shopcards=fence&loot=3:0.5&shopall=1&zdmg=0.5&unlocks=all&training=1,2,0,3&devlayer=propeller&devlooks=3";

  it("every AD-4 switch is read with the dev flag and ignored without it", () => {
    const on = parseUrlOptions(Q, true);
    const off = parseUrlOptions(Q, false);
    expect(on.startWave).toBe("7");
    expect(on.bossWaves).toBe("3");
    expect(on.bossHpScale).toBe(0.1);
    expect(on.events).toBe("car_alarm@1");
    expect(on.shopCards).toBe("fence");
    expect(on.loot).toEqual([3, 0.5]);
    expect(on.shopAll).toBe(true);
    expect(on.unlocks).toBe("all");
    expect(on.training).toEqual({ maxHp: 1, damage: 2, startMoney: 0, reload: 3 });
    expect(on.devLayer).toBe("propeller");
    expect(on.devLooks).toBe(3);
    expect(off).toMatchObject({ startWave: null, bossWaves: null, bossHpScale: null, events: null, shopCards: null, loot: null, shopAll: false, unlocks: null, training: null, devLayer: null, devLooks: 0 });
    // `?zdmg` is parsed either way; only the solo balance decides whether it counts (soloOverrides).
    expect(on.zombieDamageScale).toBe(0.5);
  });

  it("urlHasDevSwitch names each AD-4 key and nothing else", () => {
    expect(DEV_SWITCH_KEYS).toHaveLength(12);
    for (const k of DEV_SWITCH_KEYS) expect(urlHasDevSwitch(`?solo=1&${k}=1`)).toBe(true);
    expect(urlHasDevSwitch("?solo=1&debug=1&wallet=500&seed=4")).toBe(false);
  });
});

describe("Story 10.11 AC 6: a production build (import.meta.env.DEV false)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function prod(search: string, admin: boolean) {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("location", { search });
    vi.resetModules();
    const { accountStore } = await import("../net/accountStore");
    accountStore.accept(admin ? "mo_admin" : "mo", admin);
    const cb = await import("./clientBalance");
    const sd = await import("./soloDevSwitches");
    const uo = await import("./urlOptions");
    return { cb, sd, uo };
  }

  it("an admin's solo run reads the switches and plays ?zdmg / ?shopall; the online balance and urlOptions() stay untouched", async () => {
    const { cb, sd, uo } = await prod("?zdmg=0.5&shopall=1&startwave=7", true);
    expect(sd.soloDevAllowed()).toBe(true);
    expect(sd.soloUrlOptions().startWave).toBe("7");
    const bundled = loadBalance();
    expect(cb.soloBalance().version).not.toBe(bundled.version);
    expect(cb.clientBalance().version).toBe(bundled.version); // online: the bundled balance, whatever the admin mark
    expect(uo.urlOptions().startWave).toBeNull(); // online / boot reads stay dev-build-only
    expect(uo.urlOptions().shopAll).toBe(false);
  });

  it("a non-admin's solo run ignores them exactly as before", async () => {
    const { cb, sd } = await prod("?zdmg=0.5&shopall=1&startwave=7", false);
    expect(sd.soloDevAllowed()).toBe(false);
    expect(sd.soloUrlOptions().startWave).toBeNull();
    expect(cb.soloBalance().version).toBe(loadBalance().version);
  });
});
