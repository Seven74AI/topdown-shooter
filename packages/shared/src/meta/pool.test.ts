import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { MAX_UNLOCKS, PROGRESSION, ProgressionError, findUnlock, loadProgression, unlockList } from "../config/progression";
import { goodNextPick, itemCategories, ownedPerCategory, poolOf, unlockMask } from "./pool";

const balance = loadBalance();
const cats = itemCategories(balance);
const ids = (cat: string) => PROGRESSION.unlocks.filter((u) => u.category === cat).map((u) => u.id);

describe("Story 7.3 AC 1: the unlock list in progression.json", () => {
  it("has the 14 story entries at the story prices, 3,120 Supplies in all", () => {
    const flat = Object.fromEntries(PROGRESSION.unlocks.map((u) => [u.id, [u.category, u.price]]));
    expect(flat).toEqual({
      assault_rifle: ["weapon", 200],
      chainsaw: ["weapon", 300],
      gas_torch: ["weapon", 350],
      flamethrower: ["weapon", 400],
      grenade_launcher: ["weapon", 500],
      spike_trap: ["building", 100],
      bear_trap: ["building", 100],
      mine: ["building", 100],
      floodlight: ["building", 120],
      barricade_upgrades: ["building", 150],
      med_station: ["building", 300],
      tactical_flashlight: ["gear", 100],
      body_armor_2: ["gear", 250],
      molotovs: ["consumable", 150],
    });
    expect(PROGRESSION.unlocks.length).toBe(14);
    expect(PROGRESSION.unlocks.reduce((a, u) => a + u.price, 0)).toBe(3120);
    expect(findUnlock("barricade_upgrades")?.items).toEqual(["reinforced_barricade", "metal_barricade"]);
    expect(findUnlock("nope")).toBeUndefined();
    expect(unlockList).toBe(PROGRESSION.unlocks);
  });

  it("completeness: every balance item is in exactly one of starterPool or one unlock's items", () => {
    const places = new Map<string, number>();
    for (const id of PROGRESSION.starterPool) places.set(id, (places.get(id) ?? 0) + 1);
    for (const u of PROGRESSION.unlocks) for (const id of u.items) places.set(id, (places.get(id) ?? 0) + 1);
    const all = [...cats.keys()];
    expect(all.length).toBe(11 + 5 + 9 + 3);
    expect(all.filter((id) => places.get(id) !== 1)).toEqual([]);
    // and nothing in the file that the balance does not know
    expect([...places.keys()].filter((id) => !cats.has(id))).toEqual([]);
    expect(PROGRESSION.starterPool).toContain("pistol");
  });

  it("each unlock's category is the balance file its items are in", () => {
    for (const u of PROGRESSION.unlocks) for (const id of u.items) expect([u.id, cats.get(id)]).toEqual([u.id, u.category]);
  });

  it("the plain lines that quote a number match the balance (D4 texts vs real effects)", () => {
    const g = balance.gear.items;
    expect(findUnlock("body_armor_2")?.line).toBe(`+${g.body_armor_2?.maxHpBonus} max HP (Body armor I gives +${g.body_armor_1?.maxHpBonus})`);
    expect(PROGRESSION.starterLines.body_armor_1).toBe(`+${g.body_armor_1?.maxHpBonus} max HP`);
    expect(PROGRESSION.starterLines.running_shoes).toBe(`Run ${g.running_shoes?.speedBonusPct}% faster`);
    expect(PROGRESSION.starterLines.medkit).toBe(`Heals ${balance.consumables.items.medkit?.healHp} HP`);
    // gas torch is the short wide cone, the flamethrower the long narrow one
    const w = balance.weapons as Record<string, { rangeM: number; coneDeg?: number }>;
    expect(w.gas_torch!.rangeM).toBeLessThan(w.flamethrower!.rangeM);
    expect(w.gas_torch!.coneDeg!).toBeGreaterThan(w.flamethrower!.coneDeg!);
    expect(Object.keys(PROGRESSION.starterLines).sort()).toEqual([...PROGRESSION.starterPool].sort());
  });

  it("the schema refuses an item in two places, a duplicate unlock, a non-positive price, > 32 unlocks", () => {
    const base = JSON.parse(JSON.stringify(PROGRESSION)) as { unlocks: { id: string; items: string[]; price: number }[] } & Record<string, unknown>;
    const clone = () => JSON.parse(JSON.stringify(base)) as typeof base;
    const twice = clone();
    twice.unlocks[0]!.items.push("pistol");
    expect(() => loadProgression(twice)).toThrow(ProgressionError);
    const dup = clone();
    dup.unlocks.push({ ...dup.unlocks[0]!, items: ["zz"] });
    expect(() => loadProgression(dup)).toThrow(/duplicate/);
    const free = clone();
    free.unlocks[0]!.price = 0;
    expect(() => loadProgression(free)).toThrow(ProgressionError);
    const many = clone();
    for (let i = many.unlocks.length; i <= MAX_UNLOCKS; i++) many.unlocks.push({ ...many.unlocks[0]!, id: `x${i}`, items: [`x${i}`] });
    expect(many.unlocks.length).toBe(MAX_UNLOCKS + 1);
    expect(() => loadProgression(many)).toThrow(ProgressionError);
    expect(Object.isFrozen(PROGRESSION.unlocks[0])).toBe(true);
  });
});

describe("Story 7.3 AC 2: poolOf and unlockMask", () => {
  it("U4: a new account's pool is the 13 starter items", () => {
    const pool = poolOf(PROGRESSION, []);
    expect([...pool].sort()).toEqual([...PROGRESSION.starterPool].sort());
    expect(pool.size).toBe(13);
  });

  it("adds every item of each bought unlock, ignores unknown ids", () => {
    const pool = poolOf(PROGRESSION, ["barricade_upgrades", "chainsaw", "made_up"]);
    expect(pool.has("reinforced_barricade")).toBe(true);
    expect(pool.has("metal_barricade")).toBe(true);
    expect(pool.has("chainsaw")).toBe(true);
    expect(pool.has("made_up")).toBe(false);
    expect(pool.size).toBe(16);
  });

  it("the mask: bit i = unlock i in file order, fits 32 bits, unsigned", () => {
    expect(unlockMask(PROGRESSION, [])).toBe(0);
    expect(unlockMask(PROGRESSION, ["assault_rifle"])).toBe(1);
    expect(unlockMask(PROGRESSION, ["molotovs"])).toBe(1 << 13);
    const all = unlockMask(PROGRESSION, PROGRESSION.unlocks.map((u) => u.id));
    expect(all).toBe(2 ** 14 - 1);
    expect(PROGRESSION.unlocks.length).toBeLessThanOrEqual(32);
    // a 32-entry list still gives an unsigned value with the top bit
    const big = { starterPool: [], unlocks: Array.from({ length: 32 }, (_, i) => ({ id: `u${i}`, category: "gear" as const, price: 1, items: [`i${i}`], line: "x" })) };
    expect(unlockMask(big, ["u31"])).toBe(2 ** 31);
  });
});

describe("Story 7.3 AC 3 (decision 7.3 D1): Good next pick", () => {
  it("counts the starter pool: weapons 6, buildings 2, gear 3, consumables 2", () => {
    expect(ownedPerCategory(poolOf(PROGRESSION, []), cats)).toEqual({ weapon: 6, building: 2, gear: 3, consumable: 2 });
  });

  it("a new player's pick is the Spike trap (100)", () => {
    expect(goodNextPick(PROGRESSION, [], cats)).toBe("spike_trap");
  });

  it("ties on the count go to the cheapest locked item, then list order", () => {
    // buildings 2 vs consumables 2: Spike trap 100 beats Molotovs 150; after Spike trap, buildings = 3 > consumables 2
    expect(goodNextPick(PROGRESSION, ["spike_trap"], cats)).toBe("molotovs");
    // buildings 3, consumables 3 (molotovs), gear 3: bear trap 100 (index 6) vs flashlight 100 (index 11): list order
    expect(goodNextPick(PROGRESSION, ["spike_trap", "molotovs"], cats)).toBe("bear_trap");
  });

  it("review F6: a count tie goes to the CHEAPER category even when its unlock comes later in the list", () => {
    const syn = {
      starterPool: ["pistol", "medkit"], // weapon 1, consumable 1: a tie on the count
      unlocks: [
        { id: "smg_u", category: "weapon" as const, price: 300, items: ["smg"], line: "x" }, // list index 0, dearer
        { id: "molotov_u", category: "consumable" as const, price: 100, items: ["molotovs"], line: "x" }, // index 1, cheaper
      ],
    };
    expect(goodNextPick(syn, [], cats)).toBe("molotov_u");
    // equal prices → list order
    const even = { ...syn, unlocks: [syn.unlocks[0]!, { ...syn.unlocks[1]!, price: 300 }] };
    expect(goodNextPick(even, [], cats)).toBe("smg_u");
    // and inside a category the cheaper one wins over list order
    const inCat = { starterPool: ["pistol"], unlocks: [{ id: "a", category: "weapon" as const, price: 500, items: ["smg"], line: "x" }, { id: "b", category: "weapon" as const, price: 200, items: ["chainsaw"], line: "x" }] };
    expect(goodNextPick(inCat, [], cats)).toBe("b");
  });

  it("after all buildings, the next category by the rule; everything bought → null", () => {
    const pick = goodNextPick(PROGRESSION, [...ids("building")], cats);
    // buildings now 2 + 7 = 9; consumables 2 is the fewest
    expect(pick).toBe("molotovs");
    expect(goodNextPick(PROGRESSION, [...ids("building"), "molotovs"], cats)).toBe("tactical_flashlight");
    expect(goodNextPick(PROGRESSION, PROGRESSION.unlocks.map((u) => u.id), cats)).toBeNull();
  });
});
