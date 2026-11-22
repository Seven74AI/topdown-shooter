import { describe, expect, it } from "vitest";
import { C2S, S2C, loadBalance } from "@topdown/shared";
import { NetSession, parseShopBought, parseShopRefused } from "../net/session";
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
