import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, LOOT_BAG, createWorld, loadBalance, type SimEvent } from "@topdown/shared";
import { mirrorLootBag } from "../net/mirrorEvent";
import { fakeState } from "../net/fakeRoom";
import { createLootBagLook, lootBagLook } from "./lootBagLook";
import { LOOT_FOUND_MINE, createLootCue, lootCue, lootFoundText } from "./lootBagCue";
import { ABOVE_DARK } from "./darkness/aboveDark";
import { fakeScene } from "./darkness/fakeScene.testkit";
import { LootBagView } from "./LootBagView";
import { LOOT_ATLAS, LOOT_BADGE_FRAME, LOOT_FRAMES, LOOT_GLINT_FRAME, LOOT_RING_FRAME } from "./city/lootBagAtlas";
import { EVENT_ATLAS } from "./city/eventArt";

/** Story 7.12 (AC 5–7, B4, OA2, BF2): the client side of the loot bag. */
const balance = loadBalance();
const mirror = () => createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { buildings: () => {} }, loot: { off: true } });
const out = (x: number, y: number, until: number, variant = 2) => Object.assign(fakeState(), { lootBagState: LOOT_BAG.OUT, lootBagX: x, lootBagY: y, lootBagUntilTick: until, lootBagVariant: variant });

describe("Story 7.12: the bag from the room record (B4, late join, woken tab)", () => {
  it("two clients draw the same bag at the same spot and both hide it at untilTick, or when the record says found / gone", () => {
    const a = mirror();
    const b = mirror();
    const s = out(12.5, 30.25, 1400, 3);
    mirrorLootBag(a, s);
    mirrorLootBag(b, s);
    const la = createLootBagLook();
    const lb = createLootBagLook();
    // client B is a late joiner (a later server tick): same spot, same look
    lootBagLook(a, 1000, la);
    lootBagLook(b, 1250, lb);
    expect(la).toMatchObject({ visible: true, x: 12.5, y: 30.25, variant: 3 });
    expect(lb).toMatchObject({ visible: true, x: 12.5, y: 30.25, variant: 3 });
    expect(lootBagLook(a, 1399, la).visible).toBe(true);
    expect(lootBagLook(a, 1400, la).visible).toBe(false); // gone at the same server tick for everyone
    expect(lootBagLook(b, 1400, lb).visible).toBe(false);
    for (const st of [LOOT_BAG.FOUND, LOOT_BAG.GONE, LOOT_BAG.NONE]) {
      mirrorLootBag(a, Object.assign(out(12.5, 30.25, 1400), { lootBagState: st }));
      expect(lootBagLook(a, 1000, la).visible).toBe(false);
    }
  });

  it("the glint flashes from the drop tick (period / flash ticks), the ring breathes, the badge ring empties over 20 s", () => {
    const w = mirror();
    const g = balance.loot.glint;
    mirrorLootBag(w, out(5, 5, 400 + balance.loot.bagTicks));
    const l = createLootBagLook();
    expect(lootBagLook(w, 400, l).glint).toBe(0); // the flash's first tick is its dark edge
    expect(lootBagLook(w, 400 + g.flashTicks / 2, l).glint).toBeCloseTo(1, 6);
    expect(lootBagLook(w, 400 + g.flashTicks, l).glint).toBe(0);
    expect(lootBagLook(w, 400 + g.periodTicks + g.flashTicks / 2, l).glint).toBeCloseTo(1, 6);
    expect(lootBagLook(w, 400, l).left).toBe(1);
    expect(lootBagLook(w, 600, l).left).toBeCloseTo(0.5, 9);
    lootBagLook(w, 400, l);
    expect(l.ringAlpha).toBeLessThanOrEqual(g.ringAlpha);
    expect(l.ringAlpha).toBeGreaterThan(0);
  });
});

describe("Story 7.12: the cue (AC 7, BF2)", () => {
  it("'Bag found!' for the finder, '<name> found a bag!' for teammates, the slot colour; stale backlog: no line, no sound", () => {
    expect(lootFoundText("Ana", true)).toBe(LOOT_FOUND_MINE);
    expect(lootFoundText("Ana", false)).toBe("Ana found a bag!");
    expect(lootFoundText("  ", false)).toBe(LOOT_FOUND_MINE);
    const c = createLootCue();
    const names: Record<string, string> = { p0: "Me", p2: "Ana" };
    const found: SimEvent = { type: "loot.found", playerId: "p2", wave: 4 };
    lootCue(found, "p0", (id) => names[id] ?? "", (id) => Number(id.slice(1)), 3, c);
    expect(c).toEqual({ text: "Ana found a bag!", slot: 2, sound: "loot_found" });
    lootCue({ type: "loot.found", playerId: "p0", wave: 4 }, "p0", (id) => names[id] ?? "", () => 0, 3, c);
    expect(c.text).toBe("Bag found!");
    lootCue({ ...found, ageS: 2 } as SimEvent, "p0", () => "Ana", () => 2, 3, c);
    expect(c).toMatchObject({ text: "Ana found a bag!", sound: "" }); // line still fresh, sound stale
    lootCue({ ...found, ageS: 3.5 } as SimEvent, "p0", () => "Ana", () => 2, 3, c);
    expect(c).toEqual({ text: "", slot: -1, sound: "" });
    lootCue({ type: "loot.dropped", x: 1, y: 1, untilTick: 9, variant: 0 }, "p0", () => "", () => 0, 3, c);
    expect(c).toEqual({ text: "", slot: -1, sound: "loot_drop" });
    lootCue({ type: "loot.dropped", x: 1, y: 1, untilTick: 9, variant: 0, ageS: 5 }, "p0", () => "", () => 0, 3, c);
    expect(c.sound).toBe("");
  });
});

describe("Story 7.12: LootBagView (pooled, above the darkness, OA2 badge)", () => {
  const view = () => {
    const f = fakeScene([LOOT_ATLAS, EVENT_ATLAS]);
    const w = mirror();
    const v = new LootBagView(f.scene, w);
    return { f, w, v };
  };
  const insets = { left: 44, right: 44, top: 21, bottom: 21 };

  it("one sprite each (bag, ring, glint, badge, tip, arc), made once; the bag, ring and glint in ABOVE_DARK.pickup", () => {
    const { f, w, v } = view();
    expect(f.objects).toHaveLength(6);
    const bag = f.objects.find((o) => o.texture === LOOT_ATLAS && o.frame === LOOT_FRAMES[0]);
    const ring = f.objects.find((o) => o.frame === LOOT_RING_FRAME);
    const glint = f.objects.find((o) => o.frame === LOOT_GLINT_FRAME);
    const badge = f.objects.find((o) => o.frame === LOOT_BADGE_FRAME);
    for (const o of [bag, ring, glint]) expect(o?.depth).toBe(ABOVE_DARK.pickup);
    expect(badge?.depth).toBe(ABOVE_DARK.marker);
    mirrorLootBag(w, out(20, 20, 800, 4));
    for (let t = 400; t < 800; t += 7) v.update(t, 10, 10, 24, 1136, 640, 2, insets, [], null);
    expect(f.objects).toHaveLength(6); // nothing made per frame
    expect(bag?.visible).toBe(true);
    expect(bag?.frame).toBe(LOOT_FRAMES[4]);
    expect([bag?.x, bag?.y]).toEqual([20, 20]);
    v.update(800, 10, 10, 24, 1136, 640, 2, insets, [], null);
    expect(bag?.visible).toBe(false);
    expect(ring?.visible).toBe(false);
  });

  it("OA2: off screen → the badge at the edge (inside the safe area); on screen → none", () => {
    const { w, v } = view();
    mirrorLootBag(w, out(20, 20, 800));
    v.update(500, 10, 10, 24, 1136, 640, 2, insets, [], null); // the bag is in view (10…34 × 10…23.5)
    expect(v.badgeShown()).toBe(false);
    v.update(500, 40, 10, 24, 1136, 640, 2, insets, [], null); // camera moved right: the bag is off its left edge
    expect(v.badgeShown()).toBe(true);
    expect(v.lastLook().left).toBeCloseTo(0.75, 9);
  });
});
