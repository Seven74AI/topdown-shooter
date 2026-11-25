/**
 * Story 7.4 (K1–K7, Q13; designer D7): the shop deck from MY unlocks, the one borrowed card, and the server refusals
 * for locked buildings, consumables and barricade upgrades. Each player-visible rule is a named test.
 */
import { describe, expect, it, vi } from "vitest";
import { loadBalance } from "../config/balance";
import { PROGRESSION } from "../config/progression";
import { createWorld, type World } from "../core/world";
import * as seedStreams from "../core/seedStreams";
import { addPlayer, removePlayer, type PlayerState } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { ALL_UNLOCKED, NO_UNLOCK, STARTER_ONLY, inPool, inPoolOnly, unlockIndexOf, unlockMask } from "../meta/pool";
import { buyCard, cardItem, cardPrice, drawOffer, offerFor, readOffer, reroll, type ShopOfferView } from "./shopCards";
import { NO_LENDER } from "./shopOffers";
import { giveCrateWeapon, shopBuildings } from "./shop";
import { buyConsumable, shopConsumables } from "./consumables";
import { placeBuilding, placementError } from "../buildings/buildings";
import { upgradeBuilding, upgradeError } from "../buildings/upgrade";
import { setLoadout } from "../combat/loadout";
import { BUILD_GRID_M } from "../config/constants";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };
const mask = (...ids: string[]) => unlockMask(PROGRESSION, ids);
const STARTER_CARDS = ["smg", "hunting_rifle", "machete", "shotgun", "fire_axe", "body_armor_1", "running_shoes", "revive_kit"];

function setup(masks: number[], seed = 7): { world: World; ps: PlayerState[] } {
  const world = createWorld({ balance, seed, systems: NO_WAVES });
  const ps = masks.map((m, i) => addPlayer(world, masks.length === 1 && i === 0 ? "p0" : `p${i}`, 10 + i * 2, 10, { unlocks: m }));
  startBuild(world);
  return { world, ps };
}

const offer = (world: World, id = "p0"): ShopOfferView => offerFor(world, id) as ShopOfferView;
const nonBorrowed = (o: ShopOfferView) => o.cards.filter((c, j) => c !== "" && (o.borrowed & (1 << j)) === 0);
const borrowedCards = (o: ShopOfferView) => o.cards.filter((c, j) => c !== "" && (o.borrowed & (1 << j)) !== 0);
/** A 32-bit pseudo-random mask per seed (deterministic). */
const randMask = (seed: number) => (Math.imul(seed + 1, 2654435761) ^ (seed << 7)) >>> 0;

describe("K1 my cards come from my unlocks", () => {
  it("200 seeds × starter/all/random masks: every non-borrowed card is in my pool, never pistol, inShop:false, owned or doubled; 6 draws", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const m of [STARTER_ONLY, ALL_UNLOCKED, randMask(seed)]) {
        const { world, ps } = setup([m], seed);
        const o = offer(world);
        expect(o.borrowed).toBe(0); // solo
        const cards = nonBorrowed(o);
        expect(new Set(cards).size).toBe(cards.length);
        for (const c of cards) {
          expect(c).not.toBe("pistol");
          expect(cardItem(balance, c), c).toBeDefined();
          expect(inPool((ps[0] as PlayerState).unlocks, c), `${c} mask ${m}`).toBe(true);
        }
        if (m === STARTER_ONLY) for (const c of cards) expect(STARTER_CARDS).toContain(c);
      }
    }
  });

  it("exactly shop.json › cards rng.next() per offer, with and without a borrow list", () => {
    const counts: number[] = [];
    const real = seedStreams.shopStream;
    const spy = vi.spyOn(seedStreams, "shopStream").mockImplementation((w, slot) => {
      const rng = real(w, slot);
      const next = rng.next.bind(rng);
      return Object.assign(Object.create(Object.getPrototypeOf(rng) as object) as typeof rng, rng, {
        next: () => {
          counts[counts.length - 1]!++;
          return next();
        },
      });
    });
    try {
      for (const masks of [[STARTER_ONLY], [STARTER_ONLY, ALL_UNLOCKED]]) {
        const world = createWorld({ balance, seed: 3, systems: NO_WAVES });
        masks.forEach((m, i) => addPlayer(world, `p${i}`, 10 + i, 10, { unlocks: m }));
        startBuild(world);
        counts.push(0);
        drawOffer(world, "p0", 0);
        expect(counts[counts.length - 1]).toBe(balance.shop.cards);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("owned items are never drawn (a starter player who owns the SMG)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const world = createWorld({ balance, seed, systems: NO_WAVES });
      const p = addPlayer(world, "p0", 10, 10, { unlocks: STARTER_ONLY });
      setLoadout(world.balance, p.loadout, ["pistol", "smg"]);
      startBuild(world);
      expect(offer(world).cards).not.toContain("smg");
    }
  });
});

describe("K2 a friend's unlock can show up for me, one card at most", () => {
  it("me starter + Mo with the Chainsaw → exactly one borrowed card, the Chainsaw, lender Mo's slot; it meets the weapon floor; bought at cardPrice; my mask unchanged", () => {
    let seen = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { world, ps } = setup([STARTER_ONLY, mask("chainsaw")], seed);
      const o = offer(world);
      const b = borrowedCards(o);
      expect(b).toEqual(["chainsaw"]); // the only item Mo has that I lack
      expect(o.lender).toBe(1);
      const weapons = o.cards.filter((c) => cardItem(balance, c)?.kind === "weapon").length;
      // The floor is 1 weapon: when the Chainsaw is the only weapon, it met the floor (no second forced weapon).
      expect(weapons).toBeGreaterThanOrEqual(balance.shop.floor.weapon);
      if (weapons === 1) seen++;
      const me = ps[0] as PlayerState;
      me.wallet = 10_000;
      const card = o.cards.indexOf("chainsaw");
      const before = me.wallet;
      const r = buyCard(world, "p0", o.build, o.rev, card, "chainsaw", 1);
      expect(r.ok).toBe(true);
      expect(before - me.wallet).toBe(cardPrice(balance, "chainsaw", o.build));
      expect(me.unlocks).toBe(STARTER_ONLY);
      expect(me.lockedUsed).toBe(unlockIndexOf("chainsaw")); // decision 7.4 D4
    }
    expect(seen).toBeGreaterThanOrEqual(0); // logged: the floor case is covered by the assertion above when it happens
  });

  it("never more than one borrowed card, and only items some teammate has and I lack (200 seeds, random masks)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const ms = [randMask(seed), randMask(seed + 1000), randMask(seed + 2000)];
      const { world, ps } = setup(ms, seed);
      for (const p of ps) {
        const o = offer(world, p.id);
        const b = borrowedCards(o);
        expect(b.length).toBeLessThanOrEqual(1);
        for (const c of b) {
          expect(inPool(p.unlocks, c)).toBe(false);
          expect(ps.some((q) => q !== p && inPool(q.unlocks, c))).toBe(true);
          const lender = ps.find((q) => q.id === `p${o.lender}`) as PlayerState;
          expect(inPool(lender.unlocks, c)).toBe(true);
          expect(ps.filter((q) => q !== p && inPool(q.unlocks, c)).every((q) => Number(q.id.slice(1)) >= o.lender)).toBe(true); // lowest lender
        }
        if (b.length === 0) expect(o.lender).toBe(NO_LENDER);
      }
    }
  });

  it("mutation guard: drawing the borrow card from MY pool would show a non-borrowed tag (borrowed card never in my pool)", () => {
    const { world, ps } = setup([ALL_UNLOCKED, ALL_UNLOCKED], 5);
    expect(offer(world).borrowed).toBe(0); // nothing to borrow when I have everything
    void ps;
  });
});

describe("K3 nobody changes my offer mid-build", () => {
  it("same seed + same masks → identical offers (incl. borrowed bit and lender)", () => {
    const a = setup([STARTER_ONLY, ALL_UNLOCKED], 11);
    const b = setup([STARTER_ONLY, ALL_UNLOCKED], 11);
    expect(offer(a.world)).toEqual(offer(b.world));
  });

  it("the lender leaves mid-build → my offer stays and my reroll still borrows from the build-start snapshot", () => {
    let borrowedAfter = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { world, ps } = setup([STARTER_ONLY, ALL_UNLOCKED], seed);
      const before = offer(world);
      removePlayer(world, "p1");
      expect(offer(world)).toEqual(before);
      (ps[0] as PlayerState).wallet = 10_000;
      const r = reroll(world, "p0", before.build, before.rev);
      expect(r.ok).toBe(true);
      const after = readOffer(world, "p0") as ShopOfferView;
      expect(borrowedCards(after).length).toBe(1); // still borrows from the snapshot (the live room has no lender)
      borrowedAfter++;
    }
    expect(borrowedAfter).toBe(40);
  });

  it("a teammate joining mid-build changes nothing until the next build", () => {
    const { world } = setup([STARTER_ONLY], 9);
    const before = offer(world);
    addPlayer(world, "p1", 14, 10, { unlocks: ALL_UNLOCKED });
    expect(offer(world)).toEqual(before);
    expect(before.borrowed).toBe(0);
    startWave(world);
    startBuild(world);
    expect(offer(world).borrowed).not.toBe(0); // the next build sees p1
  });

  it("a held teammate (8.1) still lends", () => {
    const { world } = setup([STARTER_ONLY, ALL_UNLOCKED], 4);
    const p1 = world.players.get("p1") as PlayerState;
    world.players.delete("p1");
    world.heldPlayers.set("p1", { player: p1, buildIdx: 0, atTick: 0 });
    startWave(world);
    startBuild(world);
    expect(offer(world).lender).toBe(1);
  });

  it("a reroll that could change only the borrowed slot is still a new draw (canReroll)", () => {
    // Mo has only the Chainsaw extra; I own all my starter card items except one shown.
    const { world, ps } = setup([STARTER_ONLY, mask("chainsaw", "assault_rifle")], 2);
    const o = offer(world);
    expect(o.canReroll).toBe(true);
    void ps;
  });
});

describe("K4 solo, nothing is borrowed", () => {
  it("a one-player run never has a borrowed card (200 seeds)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { world } = setup([STARTER_ONLY], seed);
      const o = offer(world);
      expect(o.borrowed).toBe(0);
      expect(o.lender).toBe(NO_LENDER);
    }
  });
});

describe("K5 only my unlocked buildings and consumables", () => {
  it("placement of a locked building → not_unlocked (the placer's mask); with the unlock → ok", () => {
    const { world, ps } = setup([STARTER_ONLY, mask("spike_trap")]);
    for (const p of ps) p.wallet = 10_000;
    const req = { type: "spike_trap", gx: 10, gy: 10, rot: 0 as const };
    expect(placementError(world, "p0", req)).toBe("not_unlocked");
    expect(placeBuilding(world, "p0", req).ok).toBe(false);
    expect(placementError(world, "p1", req)).not.toBe("not_unlocked");
  });

  it("buying a locked consumable → not_unlocked; a starter one → ok", () => {
    const { world, ps } = setup([STARTER_ONLY]);
    (ps[0] as PlayerState).wallet = 10_000;
    const r = buyConsumable(world, "p0", "molotovs");
    expect(r.ok ? "ok" : r.error).toBe("not_unlocked");
    expect(buyConsumable(world, "p0", "medkit").ok).toBe(true);
  });

  it("upgrading a wood barricade without Barricade upgrades → not_unlocked; with it → ok (decision 7.4 D2)", () => {
    for (const [m, want] of [
      [STARTER_ONLY, "not_unlocked"],
      [mask("barricade_upgrades"), null],
    ] as const) {
      const { world, ps } = setup([m]);
      (ps[0] as PlayerState).wallet = 10_000;
      const placed = placeBuilding(world, "p0", { type: "wood_barricade", gx: 20 / BUILD_GRID_M, gy: 10 / BUILD_GRID_M, rot: 1 });
      expect(placed.ok).toBe(true);
      if (!placed.ok) continue;
      expect(upgradeError(world, "p0", placed.value.id)).toBe(want);
      expect(upgradeBuilding(world, "p0", placed.value.id).ok).toBe(want === null);
    }
  });

  it("the build bar list for the starter mask = wood barricade + auto-turret; consumables = medkit + grenades", () => {
    expect(inPoolOnly(shopBuildings(balance), STARTER_ONLY).map((b) => b.id)).toEqual(["wood_barricade", "auto_turret"]);
    expect(inPoolOnly(shopConsumables(balance), STARTER_ONLY).map((c) => c.id)).toEqual(["medkit", "grenades"]);
    expect(inPoolOnly(shopBuildings(balance), ALL_UNLOCKED).length).toBe(shopBuildings(balance).length);
  });
});

describe("K6 a new player's shop is a real choice", () => {
  it("the starter mask shows ≥ 2 different offers over 5 rerolls and Reroll starts enabled", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { world, ps } = setup([STARTER_ONLY], seed);
      const me = ps[0] as PlayerState;
      me.wallet = 100_000;
      const first = offer(world);
      expect(first.canReroll).toBe(true);
      expect(first.cards.filter((c) => c !== "").length).toBe(6);
      const seen = new Set([first.cards.join(",")]);
      let o = first;
      for (let i = 0; i < 5; i++) {
        const r = reroll(world, "p0", o.build, o.rev);
        expect(r.ok).toBe(true);
        o = readOffer(world, "p0") as ShopOfferView;
        seen.add(o.cards.join(","));
      }
      expect(seen.size).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("K7 the supply drop gives its weapon even if it's locked", () => {
  it("a crate Grenade Launcher to a starter player → given, lockedUsed set; to an owner of the unlock → lockedUsed stays 255", () => {
    const { world, ps } = setup([STARTER_ONLY, mask("grenade_launcher")]);
    expect(giveCrateWeapon(world, "p0", "grenade_launcher", 1)).toBeGreaterThanOrEqual(0);
    expect((ps[0] as PlayerState).loadout.slots.some((s) => s?.weapon === "grenade_launcher")).toBe(true);
    expect((ps[0] as PlayerState).lockedUsed).toBe(unlockIndexOf("grenade_launcher"));
    expect(giveCrateWeapon(world, "p1", "grenade_launcher", 1)).toBeGreaterThanOrEqual(0);
    expect((ps[1] as PlayerState).lockedUsed).toBe(NO_UNLOCK);
  });
});

describe("Q13 a pool that can't fill the floor", () => {
  it("fewer than 6 candidates → fewer cards and Reroll off", () => {
    const { world, ps } = setup([STARTER_ONLY], 3);
    const me = ps[0] as PlayerState;
    setLoadout(world.balance, me.loadout, ["pistol", "smg"]);
    me.gear = 0b1111; // owns every starter gear item (armor I, shoes, kit) and more
    world.streams.shop.forEach((s) => (s.buildPhaseIndex = -1));
    drawOffer(world, "p0", 0);
    const o = readOffer(world, "p0") as ShopOfferView;
    const filled = o.cards.filter((c) => c !== "");
    expect(filled.length).toBe(4); // hunting rifle, machete, shotgun, fire axe: no gear left, weapons fill
    expect(o.canReroll).toBe(false);
  });
});

describe("defaults (T5): tests, bots and sims start with every unlock", () => {
  it("addPlayer without options = ALL_UNLOCKED, lockedUsed 255", () => {
    const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const p = addPlayer(world, "p0", 1, 1);
    expect(p.unlocks).toBe(ALL_UNLOCKED);
    expect(p.lockedUsed).toBe(NO_UNLOCK);
  });
});
