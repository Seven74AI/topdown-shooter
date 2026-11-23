import { describe, expect, it } from "vitest";
import { consumableUsable, consumableVisible, createConsumablePending, tapConsumable, updateConsumablePending, type ConsumableButtonInput } from "./consumableButton";

const base: ConsumableButtonInput = { item: "grenades", count: 3, kind: "grenade", alive: true, running: true, placement: false, shopOpen: false, menuOpen: false, phase: "wave", hp: 100, maxHp: 100 };

describe("consumable button (Story 5.12, AC 1, 7)", () => {
  it("hidden with an empty slot, while downed/out, in placement mode, with the shop or the menu open", () => {
    expect(consumableVisible(base)).toBe(true);
    for (const over of [{ item: null }, { count: 0 }, { alive: false }, { placement: true }, { shopOpen: true }, { menuOpen: true }, { running: false }]) {
      expect(consumableVisible({ ...base, ...over }), JSON.stringify(over)).toBe(false);
    }
  });

  it("usable: medkit below max HP in build/wave (greyed at full HP); throwables in waves only", () => {
    const kit = { ...base, item: "medkit", count: 1, kind: "heal" as const };
    expect(consumableUsable({ ...kit, hp: 99 })).toBe(true);
    expect(consumableUsable({ ...kit, hp: 100 })).toBe(false);
    expect(consumableUsable({ ...kit, hp: 50, phase: "build" })).toBe(true);
    expect(consumableUsable({ ...base, phase: "build" })).toBe(false);
    expect(consumableUsable(base)).toBe(true);
  });

  it("pending: one send per tap; further taps ignored until the synced count drops (or 1 s passes)", () => {
    const p = createConsumablePending();
    expect(tapConsumable(p, 0, base)).toBe(true);
    expect(tapConsumable(p, 50, base)).toBe(false);
    expect(tapConsumable(p, 400, base)).toBe(false); // C1: tap spam under lag sends nothing more
    updateConsumablePending(p, 500, "grenades", 3);
    expect(p.active).toBe(true);
    updateConsumablePending(p, 520, "grenades", 2); // the server used it
    expect(p.active).toBe(false);
    expect(tapConsumable(p, 530, { ...base, count: 2 })).toBe(true);
    updateConsumablePending(p, 1529, "grenades", 2);
    expect(p.active).toBe(true);
    updateConsumablePending(p, 1530, "grenades", 2); // refused / ignored: the timeout
    expect(p.active).toBe(false);
    expect(tapConsumable(p, 1531, { ...base, count: 2 })).toBe(true);
    updateConsumablePending(p, 1540, null, 0); // the last one: the slot empties
    expect(p.active).toBe(false);
  });
});
