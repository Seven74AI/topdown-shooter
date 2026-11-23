import { describe, expect, it } from "vitest";
import { C2S, S2C, loadBalance } from "@topdown/shared";
import { NetSession, parseShopBought, parseShopRefused, parseShopUpgradeRefused, parseShopUpgraded } from "../net/session";
import { DevThrottle } from "../net/devThrottle";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";

/** Story 3.3: online the shop only asks; the server's answer and the state decide. */
const balance = loadBalance();

function setup() {
  const room = new FakeRoom({ ...fakeState([fakePlayer(0, { x: 10, y: 10, wallet: 250 })]), phase: "build" });
  const session = new NetSession(room, { playerId: "p0", slot: 0, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host, session };
}

describe("NetSimHost shop (Story 3.3)", () => {
  it("buyWeapon sends one shop.buy (slot only when given) and changes nothing locally", () => {
    const { room, host } = setup();
    host.update(1 / 60);
    host.buyWeapon("smg", null);
    host.buyWeapon("hunting_rifle", 0);
    expect(room.sentOf(C2S.SHOP_BUY)).toEqual([{ weapon: "smg" }, { weapon: "hunting_rifle", slot: 0 }]);
    host.update(1 / 60);
    const me = host.world.players.get("p0");
    expect(me?.wallet).toBe(250);
    expect(me?.loadout.slots[1]).toBeNull();
  });

  it("answers arrive through takeShopAnswer, oldest first, each once; malformed ones are dropped", () => {
    const { room, host } = setup();
    room.deliver(S2C.SHOP_BOUGHT, { weapon: "smg", slot: 1 });
    room.deliver(S2C.SHOP_REFUSED, { weapon: "hunting_rifle", error: "insufficient_funds" });
    room.deliver(S2C.SHOP_BOUGHT, { weapon: "smg", slot: 3 });
    expect(host.takeShopAnswer()).toEqual({ ok: true, weapon: "smg", slot: 1 });
    expect(host.takeShopAnswer()).toEqual({ ok: false, weapon: "hunting_rifle", error: "insufficient_funds" });
    expect(host.takeShopAnswer()).toBeNull();
  });

  it("the weapons come from the state: a bought SMG appears in slot 2 with the state's ammo", () => {
    const { room, host } = setup();
    host.update(1 / 60);
    const s = room.state.players.get("p0");
    if (s) {
      s.weapon1 = "smg";
      s.ammo1 = 40;
      s.wallet = 50;
    }
    host.update(1 / 60);
    const me = host.world.players.get("p0");
    expect(me?.loadout.slots[1]?.weapon).toBe("smg");
    expect(me?.wallet).toBe(50);
  });

  it("after dispose: no message is sent and answers are no longer delivered", () => {
    const { room, host } = setup();
    host.dispose();
    host.buyWeapon("smg", null);
    room.deliver(S2C.SHOP_BOUGHT, { weapon: "smg", slot: 1 });
    expect(room.sentOf(C2S.SHOP_BUY)).toEqual([]);
    expect(host.takeShopAnswer()).toBeNull();
  });

  it("parsers: an unknown error reads as not_for_sale", () => {
    expect(parseShopRefused({ weapon: "smg", error: "weird" })).toEqual({ ok: false, weapon: "smg", error: "not_for_sale" });
    expect(parseShopRefused({ weapon: 3, error: "x" })).toBeNull();
    expect(parseShopBought(null)).toBeNull();
  });
});

describe("NetSimHost weapon upgrades (Story 5.1)", () => {
  it("upgradeWeapon sends one shop.upgrade and changes nothing locally", () => {
    const { room, host } = setup();
    host.update(1 / 60);
    host.upgradeWeapon("pistol");
    expect(room.sentOf(C2S.SHOP_UPGRADE)).toEqual([{ weapon: "pistol" }]);
    host.update(1 / 60);
    const me = host.world.players.get("p0");
    expect(me?.loadout.slots[0].level).toBe(1);
    expect(me?.wallet).toBe(250);
  });

  it("level shown from state only: the answer alone changes nothing, the state's level0/level1 do", () => {
    const { room, host } = setup();
    host.update(1 / 60);
    host.upgradeWeapon("pistol");
    room.deliver(S2C.SHOP_UPGRADED, { weapon: "pistol", slot: 0, level: 2 });
    host.update(1 / 60);
    expect(host.takeShopAnswer()).toEqual({ kind: "upgrade", ok: true, weapon: "pistol", slot: 0, level: 2 });
    expect(host.world.players.get("p0")?.loadout.slots[0].level).toBe(1); // pending until the state agrees
    const s = room.state.players.get("p0");
    if (!s) throw new Error("no p0");
    s.level0 = 2;
    s.weapon1 = "smg";
    s.ammo1 = 40;
    s.level1 = 3;
    s.wallet = 190;
    room.patch();
    host.update(1 / 60);
    const me = host.world.players.get("p0");
    expect(me?.loadout.slots[0].level).toBe(2);
    expect(me?.loadout.slots[1]?.level).toBe(3);
    expect(me?.wallet).toBe(190);
    // Another player's level comes the same way (teammates' HUDs never show it, but the mirror is exact).
    s.level1 = 4;
    room.patch();
    host.update(1 / 60);
    expect(host.world.players.get("p0")?.loadout.slots[1]?.level).toBe(4);
  });

  it("?lag throttle copies level0/level1 (150 ms, jitter 20): nothing before the delay, the levels after", () => {
    const room = new FakeRoom({ ...fakeState([fakePlayer(0, { weapon1: "smg", ammo1: 40, level1: 1 })]), phase: "build" });
    let now = 0;
    const throttle = new DevThrottle(room, { lagMs: 150, jitterMs: 20, random: () => 0.5, now: () => now });
    const s = room.state.players.get("p0");
    if (!s) throw new Error("no p0");
    room.patch();
    now = 200;
    throttle.pump(now);
    s.level0 = 3;
    s.level1 = 2;
    room.patch();
    throttle.pump(now + 10);
    expect(throttle.state.players.get("p0")).toMatchObject({ level0: 1, level1: 1 }); // still the delayed copy
    now = 400;
    throttle.pump(now);
    expect(throttle.state.players.get("p0")).toMatchObject({ level0: 3, level1: 2 });
  });

  it("parsers: upgrade answers (an unknown error reads as not_owned; malformed ones are null)", () => {
    expect(parseShopUpgraded({ weapon: "smg", slot: 1, level: 3 })).toEqual({ kind: "upgrade", ok: true, weapon: "smg", slot: 1, level: 3 });
    expect(parseShopUpgraded({ weapon: "smg", slot: 2, level: 3 })).toBeNull();
    expect(parseShopUpgraded({ weapon: "smg", slot: 0, level: 2.5 })).toBeNull();
    expect(parseShopUpgradeRefused({ weapon: "smg", error: "max_level" })).toEqual({ kind: "upgrade", ok: false, weapon: "smg", error: "max_level" });
    expect(parseShopUpgradeRefused({ weapon: "smg", error: "weird" })).toEqual({ kind: "upgrade", ok: false, weapon: "smg", error: "not_owned" });
    expect(parseShopUpgradeRefused(null)).toBeNull();
  });
});
