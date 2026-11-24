import { describe, expect, it } from "vitest";
import { ABOVE_BAR_GAP_CSS_PX, CENTRE_CLEAR_CSS_PX, rectCentreGap, consumableUsable, consumableVisible, createConsumablePending, layoutRightButtons, newRightButtonsLayout, tapConsumable, updateConsumablePending, type ConsumableButtonInput } from "./consumableButton";
import { layoutBuildBar, newBuildBarLayout, readyLeftX } from "./buildBar";
import { BUILD_COUNT_TEXT_CSS_PX, MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX, READY_BUTTON_BOTTOM_CSS_PX, READY_BUTTON_H_CSS_PX, READY_BUTTON_W_CSS_PX } from "../ui/sizes";

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


/** The ⚙ button left of ☰ (same size, 12 px apart: HudScene's layout). */
const ms_ = (w: number, k: number) => {
  const s = MENU_BUTTON_CSS_PX * k;
  return { s, x: w - MENU_BUTTON_INSET_CSS_PX * k - 2 * s - MENU_BUTTON_INSET_CSS_PX * k, y: MENU_BUTTON_INSET_CSS_PX * k };
};

describe("swap + consumable above the build bar (Story 5.12, main-session decision; 5.16 D3)", () => {
  type Rect = { name: string; x: number; y: number; w: number; h: number };
  const gapOf = (a: Rect, b: Rect): number => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
  for (const [W, H] of [
    [568, 320],
    [800, 360],
    [1024, 768],
  ] as const) {
    for (const k of [1, 2]) {
      it(`${W}×${H} at dpr ${k}: on screen, ≥ 12 px from the tiles, the count line, Ready, ☰ and each other`, () => {
        const w = W * k;
        const h = H * k;
        const bar = layoutBuildBar(w, h, 0, 0, k, newBuildBarLayout());
        const l = layoutRightButtons(w, h, 0, 0, k, true, bar.left, bar.top, newRightButtonsLayout(), bar.countX);
        const cons: Rect = { name: "consumable", x: l.consX, y: l.consY, w: l.size, h: l.size };
        const swap: Rect = { name: "swap", x: l.swapX, y: l.swapY, w: l.size, h: l.size };
        const others: Rect[] = [];
        for (let s = 0; s < bar.x.length; s++) others.push({ name: `tile ${s}`, x: bar.x[s] as number, y: bar.y[s] as number, w: bar.tile, h: bar.tile });
        const countH = BUILD_COUNT_TEXT_CSS_PX * k * 1.3;
        others.push({ name: "count", x: bar.countX - 48 * k, y: bar.countY - countH, w: 48 * k, h: countH }); // "10/12" right-aligned
        const set = ms_(w, k);
        others.push({ name: "settings", x: set.x, y: set.y, w: set.s, h: set.s });
        const rw = READY_BUTTON_W_CSS_PX * k;
        const rh = READY_BUTTON_H_CSS_PX * k;
        others.push({ name: "ready", x: readyLeftX(w, rw, bar.left, k), y: h - READY_BUTTON_BOTTOM_CSS_PX * k - rh, w: rw, h: rh });
        const ms = MENU_BUTTON_CSS_PX * k;
        others.push({ name: "menu", x: w - MENU_BUTTON_INSET_CSS_PX * k - ms, y: MENU_BUTTON_INSET_CSS_PX * k, w: ms, h: ms });
        for (const b of [cons, swap]) {
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(w);
          for (const o of others) expect(gapOf(b, o), `${b.name} vs ${o.name}`).toBeGreaterThanOrEqual(ABOVE_BAR_GAP_CSS_PX * k - 1e-6);
        }
        expect(gapOf(cons, swap)).toBeGreaterThanOrEqual(ABOVE_BAR_GAP_CSS_PX * k - 1e-6);
        // review L6: clear of the survivor at the screen centre
        for (const b of [cons, swap]) expect(rectCentreGap(b.x, b.y, b.w, b.h, w / 2, h / 2), `${b.name} vs the screen centre`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX * k);
      });
    }
  }

  it("outside the build bar: swap bottom right, the consumable 16 px left of it (D5)", () => {
    const l = layoutRightButtons(800, 360, 0, 0, 1, false, 0, 0, newRightButtonsLayout());
    expect([l.swapX, l.swapY, l.consX, l.consY]).toEqual([800 - 24 - 64, 360 - 120 - 64, 800 - 24 - 64 - 16 - 64, 360 - 120 - 64]);
  });
});
