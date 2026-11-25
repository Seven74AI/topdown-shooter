import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance } from "../config/balance";
import { createWorld } from "../core/world";
import { addPlayer } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { buildingStats, footprint, type Box } from "../buildings/buildings";
import { BOT_LIST_DONE, botBuildPhase, botPlaceCandidate, botPlaceTries, botShopNext as botShopNextRaw, botWeaponSlot, createBotShopResult, type BotShopSelf } from "./botShop";
import { cardCatalog, readOffer, type ShopOfferView } from "../economy/shopCards";

const balance = loadBalance();
const none = () => 0;
const self = (wallet: number, weapon1 = "", active = 0, weapon0 = "pistol"): BotShopSelf => ({ wallet, weapon0, weapon1, active });
/** Story 5.13: an offer showing every card item (the list-walk rules apart from the draw). */
const ALL: ShopOfferView = { build: 0, rev: 0, cards: cardCatalog(balance).map((c) => c.id), sold: 0, rerollPrice: 20, canReroll: true, borrowed: 0, lender: 255, lenderName: "" };
const botShopNext = (b: typeof balance, me: BotShopSelf, owned: (t: string) => number, list: readonly string[], skip = 0, offer: ShopOfferView | null = ALL) => botShopNextRaw(b, me, owned, list, skip, offer);

describe("botShopNext (Story 3.10): the shopping list in order", () => {
  const list = ["smg", "wood_barricade", "wood_barricade", "auto_turret"];

  it("buys the first entry it can pay; saves up (stops) at the first it can't", () => {
    expect(botShopNext(balance, self(250), none, list)).toBe(0); // SMG 200
    expect(botShopNext(balance, self(150), none, list)).toBe(-1); // can't pay the SMG: no barricade instead
  });

  it("skips weapons it holds, and counts building entries (listed twice = own two)", () => {
    const owned = (n: number) => (t: string) => (t === "wood_barricade" ? n : 0);
    expect(botShopNext(balance, self(100, "smg"), owned(0), list)).toBe(1);
    expect(botShopNext(balance, self(100, "smg"), owned(1), list)).toBe(2);
    expect(botShopNext(balance, self(100, "smg"), owned(2), list)).toBe(-1); // turret 250: saving up
    expect(botShopNext(balance, self(300, "smg"), owned(2), list)).toBe(3);
    expect(botShopNext(balance, self(300, "smg", 1, "pistol"), (t) => (t === "auto_turret" ? 1 : 2), list)).toBe(BOT_LIST_DONE); // all done
  });

  it("Story 5.13: a weapon or gear entry not on my offer (or sold there) → next, never a stop", () => {
    const offer: ShopOfferView = { ...ALL, cards: ["machete", "running_shoes"], sold: 0b10 };
    expect(botShopNext(balance, self(500), none, ["smg", "running_shoes", "machete"], 0, offer)).toBe(2);
    expect(botShopNext(balance, self(500), none, ["smg", "wood_barricade"], 0, null)).toBe(1);
    expect(botShopNext(balance, self(500), none, ["pistol"], 0, ALL)).toBe(BOT_LIST_DONE); // never a card
  });

  it("skips entries tried and failed this build (skip mask) and ids the shop doesn't sell", () => {
    expect(botShopNext(balance, self(500, "smg"), none, ["ghost", "wood_barricade"])).toBe(1);
    expect(botShopNext(balance, self(500, "smg"), none, list, 1 << 1)).toBe(2);
  });

  it("botWeaponSlot: the empty second slot first, else the one not in hands", () => {
    expect(botWeaponSlot(self(0))).toBeNull();
    expect(botWeaponSlot(self(0, "smg", 0))).toBe(1);
    expect(botWeaponSlot(self(0, "smg", 1))).toBe(0);
  });
});

describe("botPlaceCandidate", () => {
  it("offers 8 directions per radius, the long side facing the bot, then runs out", () => {
    const out = { gx: 0, gy: 0, rot: 0 };
    const stats = buildingStats(balance, "wood_barricade");
    if (!stats) throw new Error("no barricade");
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const n = botPlaceTries(balance);
    expect(n).toBe(8 * balance.bots.buildRadiiM.length);
    for (let a = 0; a < n; a++) {
      expect(botPlaceCandidate(balance, "wood_barricade", 24, 16, a, out)).toBe(true);
      footprint(stats, out.gx, out.gy, out.rot, box);
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      const r = balance.bots.buildRadiiM[Math.floor(a / 8)] as number;
      expect(Math.abs(Math.hypot(cx - 24, cy - 16) - r)).toBeLessThan(0.6); // snapped to the 0.5 m lattice
      if (a % 8 === 0) expect(out.rot).toBe(1); // east: turned, so the 2 m side faces the bot
      if (a % 8 === 2) expect(out.rot).toBe(0); // south
    }
    expect(botPlaceCandidate(balance, "wood_barricade", 24, 16, n, out)).toBe(false);
    expect(botPlaceCandidate(balance, "ghost", 24, 16, 0, out)).toBe(false);
  });
});

describe("botBuildPhase (headless bots)", () => {
  function world(wallet: number) {
    const w = createWorld({ balance, seed: 1 });
    const p = addPlayer(w, "p0", 24, 16);
    p.wallet = wallet;
    w.debug.shopCards = ["smg", "hunting_rifle"]; // Story 5.13: the weapons these tests buy are on the offer
    startBuild(w);
    return { w, p };
  }

  it("buys through the real shop and places through the real rules, then taps Ready", () => {
    const { w, p } = world(600);
    const r = botBuildPhase(w, "p0", ["smg", "wood_barricade", "wood_barricade", "auto_turret"], createBotShopResult());
    expect(r.bought).toEqual(["smg"]);
    expect(r.weapons).toBe(1);
    expect(r.buildings).toBe(3);
    expect(r.spent).toBe(200 + 40 + 40 + 250);
    expect(p.wallet).toBe(600 - 530);
    expect(p.loadout.slots[1]?.weapon).toBe("smg");
    expect(r.swap).toBe(true); // the SMG is in slot 2, the Pistol in hands
    expect(w.buildings.list.map((b) => b.type)).toEqual(["wood_barricade", "wood_barricade", "auto_turret"]);
    expect(p.buildReady).toBe(true);
  });

  it("two weapons in one build: the second replaces the Pistol, not the weapon just bought", () => {
    const { w, p } = world(600);
    const r = botBuildPhase(w, "p0", ["smg", "hunting_rifle"], createBotShopResult());
    expect(r.bought).toEqual(["smg", "hunting_rifle"]);
    expect(p.loadout.slots.map((s) => s?.weapon)).toEqual(["hunting_rifle", "smg"]);
    expect(r.swap).toBe(false); // the rifle (the last bought) is already in hands
  });

  it("does nothing outside a build phase", () => {
    const { w, p } = world(600);
    startWave(w);
    const r = botBuildPhase(w, "p0", ["smg"], createBotShopResult());
    expect(r.weapons).toBe(0);
    expect(p.wallet).toBe(600);
  });

  it("moves on when an entry can't be placed (the 6-building cap): the next entry is still bought", () => {
    const { w, p } = world(1000);
    const list = [...Array.from({ length: 7 }, () => "wood_barricade"), "smg"];
    const r = botBuildPhase(w, "p0", list, createBotShopResult());
    expect(r.buildings).toBe(balance.buildings.maxPerPlayer);
    expect(r.bought[0]).toBe("smg"); // the 7th barricade was skipped, the SMG after it bought
    expect(p.wallet).toBe(1000 - r.spent);
    expect(r.bought.slice(1).every((id) => balance.gear.items[id] !== undefined)).toBe(true);
  });
});

describe("Story 5.1: upgrade:<weapon> shopping entries", () => {
  function world(wallet: number) {
    const w = createWorld({ balance, seed: 1 });
    const p = addPlayer(w, "p0", 24, 16);
    p.wallet = wallet;
    w.debug.shopCards = ["smg", "hunting_rifle"]; // Story 5.13: the weapons these tests buy are on the offer
    startBuild(w);
    return { w, p };
  }

  it("bot upgrades its SMG twice when it can afford it", () => {
    const { w, p } = world(200 + 120 * 2 + 50);
    const log: string[] = [];
    const r = botBuildPhase(w, "p0", ["smg", "upgrade:smg", "upgrade:smg", "upgrade:pistol"], createBotShopResult(), true, (c) => void log.push(c.kind));
    expect(r.bought).toEqual(["smg", "upgrade:smg", "upgrade:smg"]);
    expect(r.upgrades).toBe(2);
    expect(p.loadout.slots[1]?.level).toBe(3); // liveness: the level really rose
    expect(p.loadout.slots[0].level).toBe(1); // Pistol 60 > the 50 left: saving up
    expect(p.wallet).toBe(50);
    expect(r.spent).toBe(440);
    expect(log).toEqual(["buyCard", "upgrade", "upgrade", "ready"]);
    // Next build phase with money: the list is already satisfied for the SMG (level 3 = two entries).
    p.wallet = 1000;
    const r2 = botBuildPhase(w, "p0", ["smg", "upgrade:smg", "upgrade:smg", "upgrade:pistol"], createBotShopResult());
    expect(r2.bought[0]).toBe("upgrade:pistol"); // then (list done) Story 5.13's cheapest usable cards
    expect(r2.bought).not.toContain("upgrade:smg");
    expect(p.loadout.slots[1]?.level).toBe(3);
  });

  it("botShopNext: not held → next; too dear → stop (save up); at max → next", () => {
    const list = ["upgrade:smg", "upgrade:machete", "wood_barricade"];
    expect(botShopNext(balance, self(500), none, list)).toBe(2); // holds neither
    expect(botShopNext(balance, { ...self(100, "smg") }, none, list)).toBe(-1); // SMG 120 > 100
    expect(botShopNext(balance, { ...self(500, "smg"), level1: 4 }, none, ["upgrade:smg", "upgrade:smg", "upgrade:smg", "upgrade:smg", "wood_barricade"])).toBe(4);
    expect(botShopNext(balance, { ...self(500, "smg"), level1: 2 }, none, ["upgrade:smg", "upgrade:smg"])).toBe(1);
  });

  it("bots.json accepts upgrade entries and refuses malformed ones", () => {
    const files = bundledBalanceFiles();
    (files.bots as { shoppingList: string[] }).shoppingList = ["smg", "upgrade:smg"];
    expect(loadBalance(files).bots.shoppingList).toEqual(["smg", "upgrade:smg"]);
    (files.bots as { shoppingList: string[] }).shoppingList = ["upgrade:SMG"];
    expect(() => loadBalance(files)).toThrow(/bots\.json: shoppingList\.0/);
  });
});

describe("botShopNext gear (Story 5.11)", () => {
  it("skips owned gear and armor a higher tier covers (II owned → I skipped); stops at gear it can't pay", () => {
    const list = ["body_armor_1", "running_shoes"];
    expect(botShopNext(balance, { ...self(500), gear: 0 }, none, list)).toBe(0);
    expect(botShopNext(balance, { ...self(500), gear: 2 }, none, list)).toBe(1); // armor II covers armor I
    expect(botShopNext(balance, { ...self(500), gear: 1 }, none, list)).toBe(1);
    expect(botShopNext(balance, { ...self(500), gear: 1 | 4 }, none, list)).toBe(BOT_LIST_DONE);
    expect(botShopNext(balance, { ...self(100), gear: 0 }, none, list)).toBe(-1); // saves up for armor I
  });
});

describe("Story 5.13: bots buy from their cards", () => {
  function world(wallet: number, forced: string[] | null = null, seed = 1) {
    const w = createWorld({ balance, seed });
    const p = addPlayer(w, "p0", 24, 16);
    p.wallet = wallet;
    w.debug.shopCards = forced;
    startBuild(w);
    return { w, p };
  }

  it("list done: buys the cheapest usable card (gear; a weapon only into an empty slot) through the real buyCard", () => {
    const { w, p } = world(400, ["machete", "running_shoes"]);
    const log: string[] = [];
    const r = botBuildPhase(w, "p0", [], createBotShopResult(), true, (c) => void log.push(c.kind));
    expect(r.cards).toBeGreaterThanOrEqual(1);
    expect(r.bought[0]).toBe("machete"); // 150, empty slot (tie with the shoes: offer order)
    expect(p.loadout.slots[1]?.weapon).toBe("machete");
    expect(log.filter((k) => k === "buyCard").length).toBe(r.cards);
    expect(p.wallet).toBe(400 - r.spent);
  });

  it("rerolls (at most bots.maxRerollsPerBuild) when nothing it wants is on offer; records each", () => {
    // Wants only the Grenade Launcher (800); a rich bot rerolls up to the cap looking for it.
    const { w, p } = world(5000, null, 3);
    const log: string[] = [];
    const r = botBuildPhase(w, "p0", ["grenade_launcher"], createBotShopResult(), true, (c) => void log.push(c.kind));
    expect(r.rerolls).toBeGreaterThanOrEqual(1);
    expect(r.rerolls).toBeLessThanOrEqual(balance.bots.maxRerollsPerBuild);
    expect(r.rerollSpent).toBe(20 * r.rerolls);
    expect(log.filter((k) => k === "reroll").length).toBe(r.rerolls);
    expect(readOffer(w, "p0")?.rev).toBe(r.rerolls);
    expect(p.wallet).toBe(5000 - r.spent);
  });

  it("a saving bot (a list entry too dear) spends nothing on cards or rerolls", () => {
    const { w, p } = world(100, ["machete"]);
    const r = botBuildPhase(w, "p0", ["auto_turret"], createBotShopResult());
    expect([r.cards, r.rerolls, p.wallet]).toEqual([0, 0, 100]);
  });
});
