import { describe, expect, it } from "vitest";
import { C2S, S2C, loadBalance } from "@topdown/shared";
import { NetSession, parseShopBought, parseShopBoughtItem, parseShopOffered, parseShopRefused, parseShopRefusedItem, parseShopUpgradeRefused, parseShopUpgraded } from "../net/session";
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

const OFFER = { build: 0, rev: 0, cards: ["smg", "machete", "shotgun", "body_armor_1", "running_shoes", "revive_kit"], sold: 0, rerollPrice: 20, canReroll: true };

describe("NetSimHost card shop (Story 5.13; 3.3's shop tests moved to cards)", () => {
  it("buyCard sends one shop.buy with build, rev, card, item (slot only when given) and changes nothing locally", () => {
    const { room, host } = setup();
    host.update(1 / 60);
    host.buyCard(0, "smg", null); // no offer yet: nothing to name, nothing sent
    expect(room.sentOf(C2S.SHOP_BUY)).toEqual([]);
    room.deliver(S2C.SHOP_OFFERED, OFFER);
    host.buyCard(0, "smg", null);
    host.buyCard(2, "shotgun", 0);
    expect(room.sentOf(C2S.SHOP_BUY)).toEqual([
      { build: 0, rev: 0, card: 0, item: "smg" },
      { build: 0, rev: 0, card: 2, item: "shotgun", slot: 0 },
    ]);
    host.update(1 / 60);
    const me = host.world.players.get("p0");
    expect(me?.wallet).toBe(250);
    expect(me?.loadout.slots[1]).toBeNull();
  });

  it("reroll sends one shop.reroll naming the latest offer", () => {
    const { room, host } = setup();
    room.deliver(S2C.SHOP_OFFERED, { ...OFFER, rev: 3 });
    host.reroll();
    expect(room.sentOf(C2S.SHOP_REROLL)).toEqual([{ build: 0, rev: 3 }]);
  });

  it("late subscribe shows the latest offer (kept by the inbox from the join); an older offer after a newer one is ignored", () => {
    const { room, host, session } = setup();
    room.deliver(S2C.SHOP_OFFERED, { ...OFFER, rev: 2 });
    room.deliver(S2C.SHOP_OFFERED, { ...OFFER, rev: 1 }); // older: ignored
    expect(host.shopOffer()?.rev).toBe(2);
    expect(session.latestOffer()).toBe(host.shopOffer()); // the same object while unchanged
    room.deliver(S2C.SHOP_OFFERED, { ...OFFER, rev: 2, sold: 0b10 }); // a buy on the same offer: newer
    expect(host.shopOffer()?.sold).toBe(0b10);
    room.deliver(S2C.SHOP_OFFERED, { ...OFFER, rev: 2, sold: 0 }); // fewer sold on the same rev: older
    expect(host.shopOffer()?.sold).toBe(0b10);
    room.deliver(S2C.SHOP_OFFERED, { ...OFFER, build: 1, rev: 0 }); // the next build
    expect(host.shopOffer()).toMatchObject({ build: 1, rev: 0 });
    room.deliver(S2C.SHOP_OFFERED, { ...OFFER, cards: "smg" }); // malformed: dropped
    room.deliver(S2C.SHOP_OFFERED, { ...OFFER, build: 5, cards: Array.from({ length: 7 }, () => "smg") });
    expect(host.shopOffer()?.build).toBe(1);
    // A host made later (a late Game scene start) sees it at once.
    const late = new NetSimHost({ balance, session, now: () => 0 });
    expect(late.shopOffer()?.build).toBe(1);
  });

  it("answers arrive through takeShopAnswer, oldest first, each once; malformed ones are dropped", () => {
    const { room, host } = setup();
    room.deliver(S2C.SHOP_BOUGHT, { item: "smg", card: 0, slot: 1 });
    room.deliver(S2C.SHOP_BOUGHT, { item: "running_shoes", card: 4 });
    room.deliver(S2C.SHOP_REFUSED, { item: "shotgun", card: 2, error: "insufficient_funds" });
    room.deliver(S2C.SHOP_REFUSED, { item: "reroll", card: -1, error: "stale_offer" });
    room.deliver(S2C.SHOP_BOUGHT, { item: "smg", card: 0, slot: 3 });
    room.deliver(S2C.SHOP_BOUGHT, { weapon: "smg", slot: 1 }); // the 3.3 shape
    expect(host.takeShopAnswer()).toEqual({ ok: true, item: "smg", card: 0, slot: 1 });
    expect(host.takeShopAnswer()).toEqual({ ok: true, item: "running_shoes", card: 4, slot: null });
    expect(host.takeShopAnswer()).toEqual({ ok: false, item: "shotgun", card: 2, error: "insufficient_funds" });
    expect(host.takeShopAnswer()).toEqual({ kind: "reroll", ok: false, error: "stale_offer" });
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
    room.deliver(S2C.SHOP_OFFERED, OFFER);
    host.dispose();
    host.buyCard(0, "smg", null);
    host.reroll();
    room.deliver(S2C.SHOP_BOUGHT, { item: "smg", card: 0, slot: 1 });
    expect(room.sentOf(C2S.SHOP_BUY)).toEqual([]);
    expect(room.sentOf(C2S.SHOP_REROLL)).toEqual([]);
    expect(host.takeShopAnswer()).toBeNull();
  });

  it("parsers: an unknown error reads as not_for_sale; offers are checked", () => {
    expect(parseShopRefused({ item: "smg", card: 0, error: "weird" })).toEqual({ ok: false, item: "smg", card: 0, error: "not_for_sale" });
    expect(parseShopRefused({ item: 3, card: 0, error: "x" })).toBeNull();
    expect(parseShopBought(null)).toBeNull();
    expect(parseShopOffered(OFFER)).toEqual(OFFER);
    expect(parseShopOffered({ ...OFFER, rev: -1 })).toBeNull();
    expect(parseShopOffered({ ...OFFER, canReroll: "yes" })).toBeNull();
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

describe("NetSimHost gear (Story 5.11; 5.13: gear is a card, buy_item stays for consumables)", () => {
  it("buyItem sends one shop.buy_item and changes nothing locally; answers come through takeShopAnswer", () => {
    const { room, host } = setup();
    host.update(1 / 60);
    host.buyItem("running_shoes");
    expect(room.sentOf(C2S.SHOP_BUY_ITEM)).toEqual([{ item: "running_shoes" }]);
    host.update(1 / 60);
    expect(host.world.players.get("p0")?.gear).toBe(0);
    room.deliver(S2C.SHOP_BOUGHT_ITEM, { item: "running_shoes" });
    room.deliver(S2C.SHOP_REFUSED_ITEM, { item: "revive_kit", error: "insufficient_funds" });
    room.deliver(S2C.SHOP_BOUGHT_ITEM, { item: 3 });
    expect(host.takeShopAnswer()).toEqual({ kind: "item", ok: true, item: "running_shoes" });
    expect(host.takeShopAnswer()).toEqual({ kind: "item", ok: false, item: "revive_kit", error: "insufficient_funds" });
    expect(host.takeShopAnswer()).toBeNull();
    expect(parseShopRefusedItem({ item: "x", error: "weird" })).toEqual({ kind: "item", ok: false, item: "x", error: "not_for_sale" });
    expect(parseShopBoughtItem(null)).toBeNull();
  });

  it("mirror gear/maxHp from state (never the answer); revive progress uses the synced need (review L2)", () => {
    const room = new FakeRoom({
      ...fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 11, y: 10 })]),
      phase: "wave",
    });
    const session = new NetSession(room, { playerId: "p0", slot: 0, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => 0 });
    host.update(1 / 60);
    room.deliver(S2C.SHOP_BOUGHT_ITEM, { item: "body_armor_1" });
    host.update(1 / 60);
    expect(host.world.players.get("p0")).toMatchObject({ gear: 0, maxHp: 100 });
    const s0 = room.state.players.get("p0");
    const s1 = room.state.players.get("p1");
    if (!s0 || !s1) throw new Error("no players");
    s0.gear = 1;
    s0.maxHp = 125;
    s0.hp = 125;
    s0.status = "downed";
    s0.reviveProgress = 128; // half of the server's need …
    s0.reviveNeed = 30; // … 30 ticks (a kit in reach), synced
    s1.gear = 0; // the nearest mirrored teammate has no kit: the ring must still use the server's need
    room.state.tick++;
    host.update(1 / 60);
    const me = host.world.players.get("p0");
    expect(me).toMatchObject({ gear: 1, maxHp: 125, hp: 125 });
    expect(me?.reviverId).toBe("p1");
    expect(me?.reviveTicks).toBe(15);
    expect(me?.reviveNeedTicks).toBe(30);
  });
});
