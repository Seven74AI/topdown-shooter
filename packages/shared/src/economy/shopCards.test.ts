import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides, type Balance } from "../config/balance";
import { setLoadout } from "../combat/loadout";
import { createWorld, type World } from "../core/world";
import { snapshotSeedStreams } from "../core/seedStreams";
import { createRngFromState } from "../core/rng";
import { worldDigest } from "../core/worldSnapshot";
import { addPlayer, type PlayerState } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { buyGear, gearBit } from "./gear";
import { buyCard, cardCatalog, cardItem, cardPrice, drawOffer, offerFor, readOffer, reroll, rerollPrice, slotOf, type ShopOfferView } from "./shopCards";
import { NO_CARD } from "./shopOffers";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };

function setup(players = 1, seed = 7, b: Balance = balance): { world: World; ps: PlayerState[] } {
  const world = createWorld({ balance: b, seed, systems: NO_WAVES });
  const ps: PlayerState[] = [];
  for (let i = 0; i < players; i++) ps.push(addPlayer(world, `p${i}`, 10 + i * 2, 10));
  startBuild(world);
  return { world, ps };
}

const offer = (world: World, id = "p0"): ShopOfferView => offerFor(world, id) as ShopOfferView;
const kindOf = (id: string) => cardItem(balance, id)?.kind;
const streamState = (world: World) => JSON.stringify(snapshotSeedStreams(world.streams).shop);

describe("card catalog and prices (Story 5.13 T2; D2, D7, F9)", () => {
  it("weapons (weapons.json order) then gear; no Pistol, no inShop:false gear; rarity by price", () => {
    const cat = cardCatalog(balance);
    expect(cat.map((c) => c.id)).toEqual([
      "smg",
      "hunting_rifle",
      "machete",
      "shotgun",
      "assault_rifle",
      "fire_axe",
      "chainsaw",
      "grenade_launcher",
      "flamethrower",
      "gas_torch",
      "body_armor_1",
      "body_armor_2",
      "running_shoes",
      "revive_kit",
    ]);
    const tier = (id: string) => cardItem(balance, id)?.rarity;
    for (const id of ["machete", "smg", "shotgun", "body_armor_1", "running_shoes", "revive_kit"]) expect(tier(id), id).toBe("common");
    for (const id of ["fire_axe", "hunting_rifle", "assault_rifle", "body_armor_2"]) expect(tier(id), id).toBe("rare");
    for (const id of ["chainsaw", "gas_torch", "flamethrower", "grenade_launcher"]) expect(tier(id), id).toBe("epic");
    expect(cardItem(balance, "pistol")).toBeUndefined();
    expect(cardItem(balance, "tactical_flashlight")).toBeUndefined();
    expect(cardCatalog(balance)).toBe(cat); // cached
  });

  it("the dev shop-all balance adds the flashlight card (one switch, 5.10/5.11)", async () => {
    const { loadDevBalance } = await import("../config/devBalance");
    expect(cardItem(loadDevBalance({ zombieDamageScale: null, shopAll: true }), "tactical_flashlight")?.kind).toBe("gear");
  });

  it("card price shown = charged (F9): integers from the item's price; scale rounds once; reroll 20 flat", () => {
    expect(cardPrice(balance, "smg", 0)).toBe(200);
    expect(cardPrice(balance, "smg", 5)).toBe(200); // D6: no scaling
    expect(cardPrice(balance, "rocket", 0)).toBeNull();
    const scaled = loadBalance(withOverrides(bundledBalanceFiles(), [["shop", "priceScalePerBuild", 0.05]]));
    expect(cardPrice(scaled, "machete", 3)).toBe(Math.round(150 * 1.15));
    expect(rerollPrice(balance, 0)).toBe(20);
    expect(rerollPrice(balance, 7)).toBe(20);
    const { world, ps } = setup();
    const p = ps[0] as PlayerState;
    p.wallet = 5000;
    const o = offer(world);
    for (let c = 0; c < o.cards.length; c++) {
      const id = o.cards[c] as string;
      if (id === "" || kindOf(id) !== "gear") continue;
      const before = p.wallet;
      expect(buyCard(world, "p0", o.build, o.rev, c, id, null).ok).toBe(true);
      expect(before - p.wallet).toBe(cardPrice(balance, id, o.build));
    }
  });

  it("slotOf: p<N> → N, solo local → 0, anything else → -1", () => {
    expect([slotOf("p0"), slotOf("p3"), slotOf("local"), slotOf("p4"), slotOf("bob"), slotOf("p")]).toEqual([0, 3, 0, -1, -1, -1]);
  });
});

describe("the draw (Story 5.13 AC 2; F2, F6, F7, F8)", () => {
  it("every offer has ≥ 1 weapon and ≥ 1 gear, 6 cards, no item twice (seeds 1–500 × builds 0–5 × 4 slots)", () => {
    let offers = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const { world } = setup(4, seed);
      for (let build = 0; build <= 5; build++) {
        world.waves.number = build;
        for (let s = 0; s < 4; s++) {
          drawOffer(world, `p${s}`);
          const o = readOffer(world, `p${s}`) as ShopOfferView;
          expect(o.cards.length).toBe(6);
          expect(o.cards.every((id) => id !== "")).toBe(true);
          expect(new Set(o.cards).size).toBe(6);
          expect(o.cards.some((id) => kindOf(id) === "weapon")).toBe(true);
          expect(o.cards.some((id) => kindOf(id) === "gear")).toBe(true);
          expect(o.cards).not.toContain("pistol");
          offers++;
        }
      }
    }
    expect(offers).toBe(500 * 6 * 4);
  });

  it("the floor itself, not the pool's mix, guarantees each category (a 2-card offer from 1 weapon + 4 gear, and from 9 weapons + 1 gear)", () => {
    const small = (exclude: string[]) => {
      const files = bundledBalanceFiles();
      const shop = files.shop as Record<string, unknown>;
      shop.cards = 2;
      shop.excludeFromCards = ["pistol", ...exclude];
      return loadBalance(files);
    };
    const oneWeapon = small(["hunting_rifle", "machete", "shotgun", "assault_rifle", "fire_axe", "chainsaw", "grenade_launcher", "flamethrower", "gas_torch"]);
    const oneGear = small(["body_armor_1", "body_armor_2", "running_shoes"]);
    for (let seed = 1; seed <= 300; seed++) {
      const a = setup(1, seed, oneWeapon);
      expect(readOffer(a.world, "p0")?.cards, `seed ${seed}`).toContain("smg");
      const b = setup(1, seed, oneGear);
      expect(readOffer(b.world, "p0")?.cards, `seed ${seed}`).toContain("revive_kit");
    }
  });

  it("never an owned weapon, owned gear or armor I after II", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { world, ps } = setup(1, seed);
      const p = ps[0] as PlayerState;
      setLoadout(balance, p.loadout, ["smg", "shotgun"]);
      p.gear = gearBit(balance, "body_armor_2") | gearBit(balance, "revive_kit");
      drawOffer(world, "p0");
      const o = readOffer(world, "p0") as ShopOfferView;
      for (const id of ["smg", "shotgun", "body_armor_1", "body_armor_2", "revive_kit"]) expect(o.cards, `seed ${seed}`).not.toContain(id);
    }
  });

  it("floor filled as far as possible when all gear is owned; the rest weapons; empty slots show none (7.4 fallback)", () => {
    const { world, ps } = setup();
    const p = ps[0] as PlayerState;
    p.gear = gearBit(balance, "body_armor_2") | gearBit(balance, "running_shoes") | gearBit(balance, "revive_kit");
    drawOffer(world, "p0");
    let o = readOffer(world, "p0") as ShopOfferView;
    expect(o.cards.every((id) => kindOf(id) === "weapon")).toBe(true);
    expect(o.canReroll).toBe(true);
    // A pool of only 3 card items (the rest excluded by balance): 3 cards + 3 "—".
    const files = bundledBalanceFiles();
    (files.shop as { excludeFromCards: string[] }).excludeFromCards = ["pistol", "machete", "shotgun", "assault_rifle", "fire_axe", "chainsaw", "grenade_launcher", "flamethrower", "gas_torch", "body_armor_1", "body_armor_2", "running_shoes"];
    const small = loadBalance(files);
    const s2 = setup(1, 3, small);
    drawOffer(s2.world, "p0");
    o = readOffer(s2.world, "p0") as ShopOfferView;
    expect(o.cards.filter((id) => id !== "").sort()).toEqual(["hunting_rifle", "revive_kit", "smg"]);
    expect(o.cards.slice(3)).toEqual(["", "", ""]); // empty slots last
    expect(o.canReroll).toBe(false); // nothing new can come
    (s2.ps[0] as PlayerState).wallet = 1000;
    expect(reroll(s2.world, "p0", o.build, o.rev)).toEqual({ ok: false, error: "no_new_cards" });
    expect((s2.ps[0] as PlayerState).wallet).toBe(1000);
    expect(s2.world.shop.cards[3]).toBe(NO_CARD);
  });

  it("exactly 6 draws per offer (a reroll is the next 6 values of the same stream)", () => {
    const { world, ps } = setup();
    const rng = world.streams.shop[0]!.rng;
    const check = (act: () => void) => {
      const twin = createRngFromState(rng.getState());
      act();
      for (let i = 0; i < 6; i++) twin.next();
      expect(rng.getState()).toEqual(twin.getState());
    };
    check(() => drawOffer(world, "p0", 0));
    (ps[0] as PlayerState).wallet = 100;
    check(() => {
      const o = offer(world);
      expect(reroll(world, "p0", o.build, o.rev).ok).toBe(true);
    });
    (ps[0] as PlayerState).gear = gearBit(balance, "body_armor_2") | gearBit(balance, "running_shoes") | gearBit(balance, "revive_kit");
    check(() => drawOffer(world, "p0", 0)); // no gear left: the gear floor draw still consumes its value
  });

  it("same seed + same actions → same offers (F8); another seed differs", () => {
    const run = (seed: number) => {
      const { world, ps } = setup(2, seed);
      (ps[0] as PlayerState).wallet = 1000;
      const seen: string[][] = [[...offer(world).cards], [...offer(world, "p1").cards]];
      const o = offer(world);
      reroll(world, "p0", o.build, o.rev);
      seen.push([...offer(world).cards]);
      return { seen, digest: worldDigest(world) };
    };
    expect(run(11)).toEqual(run(11));
    expect(run(11).seen).not.toEqual(run(12).seen);
  });

  it("p1's rerolls never change p0's offer (F1, B9); teammates' buys neither", () => {
    const { world, ps } = setup(2);
    (ps[1] as PlayerState).wallet = 10_000;
    const mine = JSON.stringify(offer(world));
    const myStream = JSON.stringify(snapshotSeedStreams(world.streams).shop[0]);
    for (let i = 0; i < 10; i++) {
      const o = offer(world, "p1");
      expect(reroll(world, "p1", o.build, o.rev).ok).toBe(true);
    }
    const o1 = offer(world, "p1");
    const c = o1.cards.findIndex((id) => kindOf(id) === "gear");
    expect(buyCard(world, "p1", o1.build, o1.rev, c, o1.cards[c] as string, null).ok).toBe(true);
    expect(JSON.stringify(offer(world))).toBe(mine);
    expect(JSON.stringify(snapshotSeedStreams(world.streams).shop[0])).toBe(myStream);
  });

  it("nothing but a reroll changes the offer (F2, B7): reads, snapshots and a new World view draw nothing", () => {
    const { world } = setup();
    const o = JSON.stringify(offer(world));
    const st = streamState(world);
    for (let i = 0; i < 5; i++) {
      readOffer(world, "p0");
      offerFor(world, "p0");
      worldDigest(world);
    }
    expect(JSON.stringify(offer(world))).toBe(o);
    expect(streamState(world)).toBe(st);
  });

  it("a new build draws a new offer from shop:<slot>:<build>", () => {
    const { world } = setup();
    const b0 = offer(world);
    startWave(world);
    world.waves.number = 1;
    world.run.phase = "wave";
    startBuild(world);
    const b1 = offer(world);
    expect(b1.build).toBe(1);
    expect(b1.rev).toBe(0);
    expect(b1.cards).not.toEqual(b0.cards); // seed 7: different (checked, not guaranteed by the rule)
  });

  it("rarity weights follow shop.json (χ² over 20 000 seeded draws, loose)", () => {
    // Single-card offers with no floor: the pick is the plain weighted draw.
    const files = bundledBalanceFiles();
    (files.shop as Record<string, unknown>).cards = 1;
    (files.shop as Record<string, unknown>).floor = { weapon: 0, gear: 0 };
    const one = loadBalance(files);
    const cat = cardCatalog(one);
    const counts = new Map<string, number>();
    const N = 20_000;
    const { world } = setup(1, 1, one);
    for (let i = 0; i < N; i++) {
      world.streams.shop[0]!.buildPhaseIndex = -1;
      (world as { seed: number }).seed = i + 1;
      drawOffer(world, "p0");
      const id = readOffer(world, "p0")?.cards[0] as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const total = cat.reduce((a, c) => a + c.weight, 0);
    let chi2 = 0;
    for (const c of cat) {
      const exp = (N * c.weight) / total;
      const got = counts.get(c.id) ?? 0;
      chi2 += ((got - exp) * (got - exp)) / exp;
    }
    expect(chi2).toBeLessThan(40); // 13 d.o.f.: p ≈ 0.0001 at 40
  });

  it("fishing cost table (B2): expected rerolls and money to see each item (seeds 1–2000)", () => {
    const lines: string[] = [];
    const avg: Record<string, number> = {};
    for (const target of ["grenade_launcher", "flamethrower", "smg", "revive_kit"]) {
      let sum = 0;
      for (let seed = 1; seed <= 2000; seed++) {
        const { world, ps } = setup(1, seed);
        const p = ps[0] as PlayerState;
        p.wallet = 100_000;
        let n = 0;
        while (!offer(world).cards.includes(target) && n < 200) {
          const o = offer(world);
          reroll(world, "p0", o.build, o.rev);
          n++;
        }
        sum += n;
      }
      avg[target] = sum / 2000;
      lines.push(`${target}: ${avg[target]?.toFixed(2)} rerolls ≈ ${Math.round((avg[target] as number) * 20)} money`);
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[fishing]\n${lines.join("\n")}`);
    expect(avg.grenade_launcher).toBeGreaterThanOrEqual(3);
    expect(avg.smg).toBeLessThan(avg.grenade_launcher as number);
  }, 120_000);

  it("no allocation in drawOffer: the draw writes only into preallocated arrays", () => {
    const { world } = setup(4);
    const arrays = [world.shop.build, world.shop.rev, world.shop.cards, world.shop.sold];
    for (let i = 0; i < 100; i++) drawOffer(world, `p${i % 4}`);
    expect([world.shop.build, world.shop.rev, world.shop.cards, world.shop.sold]).toEqual(arrays);
    for (let i = 0; i < 4; i++) expect(arrays[i]).toBe([world.shop.build, world.shop.rev, world.shop.cards, world.shop.sold][i]);
  });
});

describe("buying and rerolling (Story 5.13 AC 5–6; F3–F5, B3, B5, B6, B10, B11)", () => {
  /** p0 with `wallet`, its offer and the index of its first card of `kind`. */
  function withCard(kind: "weapon" | "gear", wallet = 2000) {
    const { world, ps } = setup();
    const p = ps[0] as PlayerState;
    p.wallet = wallet;
    const o = offer(world);
    const c = o.cards.findIndex((id) => kindOf(id) === kind);
    return { world, p, o, c, item: o.cards[c] as string };
  }

  it("a weapon card fills the empty slot at its price, full magazine, level I; the card is sold", () => {
    const { world, p, o, c, item } = withCard("weapon");
    const r = buyCard(world, "p0", o.build, o.rev, c, item, null);
    expect(r).toEqual({ ok: true, value: { item, kind: "weapon", card: c, price: cardPrice(balance, item, 0), slot: 1 } });
    expect(p.loadout.slots[1]?.weapon).toBe(item);
    expect(p.loadout.slots[1]?.level).toBe(1);
    expect(p.loadout.slots[1]?.ammo).toBeGreaterThan(0); // a full magazine (createSlot)
    expect(p.wallet).toBe(2000 - (cardPrice(balance, item, 0) as number));
    const after = offer(world);
    expect(after.sold & (1 << c)).not.toBe(0);
    expect(after.cards[c]).toBe(item); // shows "Sold"
    expect(after.rev).toBe(o.rev); // buys don't change rev
  });

  it("both slots full: slot_required, then the chosen slot is replaced", () => {
    const { world, p, o, c, item } = withCard("weapon");
    setLoadout(balance, p.loadout, ["pistol", item === "machete" ? "smg" : "machete"]);
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null)).toEqual({ ok: false, error: "slot_required" });
    expect(p.wallet).toBe(2000);
    expect(buyCard(world, "p0", o.build, o.rev, c, item, 0).ok).toBe(true);
    expect(p.loadout.slots[0].weapon).toBe(item);
  });

  it("a gear card applies its 5.11 effect", () => {
    const { world, p, o, c, item } = withCard("gear");
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null).ok).toBe(true);
    expect(p.gear & gearBit(balance, item)).not.toBe(0);
  });

  it("not enough money: insufficient_funds; nothing changes (card not sold)", () => {
    const { world, p, o, c, item } = withCard("weapon", 10);
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(p.wallet).toBe(10);
    expect(offer(world).sold).toBe(0);
  });

  it("double buy of one card (B5): the second is not_in_offer, charged once", () => {
    const { world, p, o, c, item } = withCard("gear");
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null).ok).toBe(true);
    const w = p.wallet;
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null)).toEqual({ ok: false, error: "not_in_offer" });
    expect(p.wallet).toBe(w);
  });

  it("a sold card never comes back this offer (B10): drop the weapon, the card stays sold; no refill", () => {
    const { world, p, o, c, item } = withCard("weapon");
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null).ok).toBe(true);
    p.loadout.slots[1] = null; // "drop" it
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null)).toEqual({ ok: false, error: "not_in_offer" });
    expect(offer(world).cards[c]).toBe(item);
    expect(offer(world).sold & (1 << c)).not.toBe(0);
  });

  it("stale rev never buys (B6), even if the new offer has the same item at that index", () => {
    const { world, p, o, c, item } = withCard("weapon");
    expect(reroll(world, "p0", o.build, o.rev).ok).toBe(true);
    const w = p.wallet;
    // Force the same item at the same index in the new offer: a stale rev is still refused.
    world.shop.cards[c] = cardCatalog(balance).findIndex((x) => x.id === item);
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null)).toEqual({ ok: false, error: "stale_offer" });
    expect(buyCard(world, "p0", o.build + 1, o.rev + 1, c, item, null)).toEqual({ ok: false, error: "stale_offer" });
    expect(p.wallet).toBe(w);
  });

  it("forged buys: wrong item, bad index, an empty slot → not_in_offer; unknown player", () => {
    const { world, p, o, c, item } = withCard("weapon");
    const other = cardCatalog(balance).find((x) => !o.cards.includes(x.id))?.id as string;
    expect(buyCard(world, "p0", o.build, o.rev, c, other, null)).toEqual({ ok: false, error: "not_in_offer" });
    expect(buyCard(world, "p0", o.build, o.rev, 9, item, null)).toEqual({ ok: false, error: "not_in_offer" });
    expect(buyCard(world, "p0", o.build, o.rev, -1, item, null)).toEqual({ ok: false, error: "not_in_offer" });
    expect(buyCard(world, "p0", o.build, o.rev, 1.5, item, null)).toEqual({ ok: false, error: "not_in_offer" });
    expect(buyCard(world, "p0", o.build, o.rev, c, "pistol", null)).toEqual({ ok: false, error: "not_in_offer" });
    expect(buyCard(world, "p9", o.build, o.rev, c, item, null)).toEqual({ ok: false, error: "unknown_player" });
    expect(p.wallet).toBe(2000);
  });

  it("armor I after armor II is refused (B11): the card shows owned, buy → already_owned", () => {
    const { world, ps } = setup();
    const p = ps[0] as PlayerState;
    p.wallet = 5000;
    world.debug.shopCards = ["body_armor_1", "body_armor_2"];
    world.streams.shop[0]!.buildPhaseIndex = -1;
    drawOffer(world, "p0");
    const o = offer(world);
    const i2 = o.cards.indexOf("body_armor_2");
    const i1 = o.cards.indexOf("body_armor_1");
    expect(buyCard(world, "p0", o.build, o.rev, i2, "body_armor_2", null).ok).toBe(true);
    const w = p.wallet;
    expect(buyCard(world, "p0", o.build, o.rev, i1, "body_armor_1", null)).toEqual({ ok: false, error: "already_owned" });
    expect(p.wallet).toBe(w);
    expect(buyGear(world, "p0", "body_armor_2")).toEqual({ ok: false, error: "already_owned" });
  });

  it("reroll charges once, rev + 1, 6 new cards from the next draws; sold slots replaced too", () => {
    const { world, p, o, c, item } = withCard("gear");
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null).ok).toBe(true);
    const w = p.wallet;
    const r = reroll(world, "p0", o.build, o.rev);
    expect(r).toEqual({ ok: true, value: { rev: 1, price: 20 } });
    expect(p.wallet).toBe(w - 20);
    const n = offer(world);
    expect(n.rev).toBe(1);
    expect(n.sold).toBe(0);
    expect(n.cards).not.toContain(item); // owned now
    expect(n.cards.every((id) => id !== "")).toBe(true);
    // B1: a repeat with the old rev is stale, no charge.
    expect(reroll(world, "p0", o.build, o.rev)).toEqual({ ok: false, error: "stale_offer" });
    expect(p.wallet).toBe(w - 20);
  });

  it("reroll with too little money: insufficient_funds, the offer stays", () => {
    const { world, p, o } = withCard("gear", 19);
    expect(reroll(world, "p0", o.build, o.rev)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(p.wallet).toBe(19);
    expect(offer(world)).toEqual(o);
  });

  it("only in a build phase (buy and reroll; B3): not_build, no charge; the offer is dead in the wave", () => {
    const { world, p, o, c, item } = withCard("weapon");
    startWave(world);
    expect(buyCard(world, "p0", o.build, o.rev, c, item, null)).toEqual({ ok: false, error: "not_build" });
    expect(reroll(world, "p0", o.build, o.rev)).toEqual({ ok: false, error: "not_build" });
    expect(offerFor(world, "p0")).toBeNull();
    expect(readOffer(world, "p0")).toBeNull();
    expect(p.wallet).toBe(2000);
  });

  it("downed in build: card buy and reroll refused (not_alive), no charge", () => {
    for (const status of ["downed", "out"] as const) {
      const { world, p, o, c, item } = withCard("weapon");
      p.status = status;
      expect(buyCard(world, "p0", o.build, o.rev, c, item, null)).toEqual({ ok: false, error: "not_alive" });
      expect(reroll(world, "p0", o.build, o.rev)).toEqual({ ok: false, error: "not_alive" });
      expect(p.wallet).toBe(2000);
    }
  });

  it("a player added after the build start gets the same offer as a build-start draw (keyed by slot and build)", () => {
    const { world } = setup(1, 21);
    addPlayer(world, "p1", 14, 10);
    const late = offer(world, "p1");
    const { world: w2 } = setup(2, 21);
    expect(offer(w2, "p1").cards).toEqual(late.cards);
  });
});

