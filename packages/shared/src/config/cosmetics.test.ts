import { describe, expect, it } from "vitest";
import raw from "./cosmetics.json" with { type: "json" };
import { COSMETIC_SLOTS, COSMETICS, CosmeticsError, DEFAULT_LOOK, STARTER_PARTS, cosmeticPart, layerSpinRevPerS, loadCosmetics } from "./cosmetics";
import { loadBalance } from "./balance";

const copy = (): { parts: Record<string, unknown>[] } & Record<string, unknown> => JSON.parse(JSON.stringify(raw));
const count = (pred: (p: (typeof COSMETICS.parts)[number]) => boolean): number => COSMETICS.parts.filter(pred).length;

/** Starter / milestone / loot per slot: the designer's final picks (`docs/epic-7-decisions.md` › Survivor parts). */
const PER_SLOT = {
  top: [4, 1, 1],
  head: [8, 7, 6],
  hair: [7, 0, 0],
  pack: [4, 2, 3],
  skin: [8, 0, 0],
} as const;

describe("cosmetics catalogue (Story 7.8)", () => {
  it("lists 51 parts: 31 starter, 10 milestone, 10 loot", () => {
    expect(COSMETICS.parts).toHaveLength(51);
    expect(count((p) => p.unlock === "starter")).toBe(31);
    expect(count((p) => p.unlock.startsWith("milestone:"))).toBe(10);
    expect(count((p) => p.unlock === "loot")).toBe(10);
  });

  it("has the per-slot counts of the story table", () => {
    for (const slot of COSMETIC_SLOTS) {
      const [s, m, l] = PER_SLOT[slot];
      expect([
        count((p) => p.slot === slot && p.unlock === "starter"),
        count((p) => p.slot === slot && p.unlock.startsWith("milestone:")),
        count((p) => p.slot === slot && p.unlock === "loot"),
      ]).toEqual([s, m, l]);
    }
  });

  it("ids are unique per slot, lowercase and at most 8 characters", () => {
    const keys = COSMETICS.parts.map((p) => `${p.slot}:${p.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of COSMETICS.parts) expect(p.id).toMatch(/^[a-z0-9]{1,8}$/);
  });

  it("maps milestones M1-M10 to the designer's picked items, one each", () => {
    const byMilestone = Object.fromEntries(COSMETICS.parts.filter((p) => p.unlock.startsWith("milestone:")).map((p) => [p.unlock.slice(10), `${p.slot}:${p.id}`]));
    expect(byMilestone).toEqual({
      m1: "head:fire",
      m2: "head:riot",
      m3: "head:gas",
      m4: "head:hockey",
      m5: "head:band",
      m6: "top:camo",
      m7: "pack:planks",
      m8: "head:laurel",
      m9: "head:weld",
      m10: "pack:golf",
    });
  });

  it("the default look: jacket, cap hiding the hair, backpack, skin 1; five slots, no accent", () => {
    expect(DEFAULT_LOOK).toMatchObject({ top: "jacket", head: "cap", hair: "short", pack: "backpack", skin: "1" });
    expect(COSMETIC_SLOTS).toEqual(["top", "head", "hair", "pack", "skin"]);
    expect(cosmeticPart("head", "cap")?.hidesHair).toBe(true);
    expect(cosmeticPart("skin", "1")?.hex).toBe("#c49a7c");
  });

  it("lists the starter parts per slot for Story 7.9", () => {
    expect(STARTER_PARTS.top).toEqual(["jacket", "hoodie", "track", "puffer"]);
    expect(STARTER_PARTS.head).toEqual(["none", "cap", "beanie", "hood", "bike", "headph", "bucket", "wide"]);
    expect(STARTER_PARTS.hair).toEqual(["short", "buzz", "flattop", "mohawk", "tied", "curly", "bald"]);
    expect(STARTER_PARTS.skin).toHaveLength(8);
    for (const slot of COSMETIC_SLOTS) expect(STARTER_PARTS[slot]).toContain(DEFAULT_LOOK[slot]);
    expect(Object.isFrozen(STARTER_PARTS.top)).toBe(true);
  });

  it("rejects a gameplay field on a part", () => {
    const c = copy();
    (c.parts[0] as Record<string, unknown>).armor = 5;
    expect(() => loadCosmetics(c)).toThrow(CosmeticsError);
  });

  it("rejects a duplicate id in a slot, a long id and a missing hidesHair", () => {
    const dup = copy();
    dup.parts.push({ ...dup.parts[0] });
    expect(() => loadCosmetics(dup)).toThrow(/duplicate id top:jacket/);
    const long = copy();
    (long.parts[1] as Record<string, unknown>).id = "hoodiehood";
    expect(() => loadCosmetics(long)).toThrow(CosmeticsError);
    const hair = copy();
    const cap = hair.parts.find((p) => p.slot === "head" && p.id === "cap") as Record<string, unknown>;
    delete cap.hidesHair;
    expect(() => loadCosmetics(hair)).toThrow(/hidesHair/);
  });

  it("rejects a stage 1 dim that isn't 1", () => {
    const c = copy();
    (c.look as { stageDim: number[] }).stageDim[0] = 0.9;
    expect(() => loadCosmetics(c)).toThrow(/stage 1/);
  });

  it("is not part of the balance version", () => {
    const before = loadBalance().version;
    expect(Object.keys(loadBalance())).not.toContain("cosmetics");
    expect(loadBalance().version).toBe(before);
  });

  it("the propeller cap declares the spinning propeller layer, with its speed here (designer 2026-11-24)", () => {
    expect(cosmeticPart("head", "prop")?.animated).toEqual({ layer: "propeller", spinRevPerS: 2 });
    expect(layerSpinRevPerS("propeller")).toBe(2);
    expect(COSMETICS.parts.filter((p) => p.animated)).toHaveLength(1);
  });

  it("rejects a second part declaring the same layer, and an unknown layer", () => {
    const two = copy();
    (two.parts[0] as Record<string, unknown>).animated = { layer: "propeller", spinRevPerS: 1 };
    expect(() => loadCosmetics(two)).toThrow(/declared by 2 parts/);
    const bad = copy();
    (bad.parts[0] as Record<string, unknown>).animated = { layer: "wings", spinRevPerS: 1 };
    expect(() => loadCosmetics(bad)).toThrow(CosmeticsError);
  });
});
