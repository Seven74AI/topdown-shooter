import { describe, expect, it } from "vitest";
import { loadBalance, loadDevBalance, type Balance } from "@topdown/shared";
import {
  BUILD_BAR_SLOTS,
  SLOT_EMPTY,
  SLOT_MORE,
  SLOT_SHOP,
  TILE_CAP,
  TILE_SHORT,
  buildBarItems,
  buildBarPages,
  buildBarSlots,
  layoutBuildBar,
  newBuildBarLayout,
  pickError,
  pickRefusalText,
  readyLeftX,
  stepBuildBar,
  tileState,
  type BuildBarFrame,
  type BuildBarStep,
  type BuildTile,
} from "./buildBar";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX, MIN_BUTTON_CSS_PX, READY_BUTTON_BOTTOM_CSS_PX, READY_BUTTON_H_CSS_PX, READY_BUTTON_W_CSS_PX } from "../ui/sizes";

const balance = loadBalance();

/** The bundled balance plus extra building types (a 5.10-style hidden floodlight, new types). */
function withTypes(extra: Record<string, Record<string, unknown>>): Balance {
  return { ...balance, buildings: { ...balance.buildings, types: { ...balance.buildings.types, ...extra } } } as unknown as Balance;
}
const box = (price: number, more: Record<string, unknown> = {}) => ({ name: "", price, widthM: 1, depthM: 1, hp: 100, solid: true, forSale: true, ...more });

describe("buildBarItems (Story 5.16 AC 2)", () => {
  it("lists today's buyable types from balance (Story 5.10: + the med station), in balance order, with prices, the turret flag and footprints", () => {
    expect(buildBarItems(balance).map((t) => [t.id, t.name, t.price, t.turret, t.widthM, t.depthM])).toEqual([
      ["wood_barricade", "Wood barricade", 40, false, 2, 0.5],
      ["auto_turret", "Auto-turret", 250, true, 1, 1],
      ["spike_trap", "Spike trap", 80, false, 2, 2],
      ["mine", "Mine", 60, false, 0.5, 0.5],
      ["med_station", "Med station", 400, false, 1, 1],
      ["bear_trap", "Bear trap", 50, false, 1, 1], // Story 5.14: appears without UI work (AC 20: world-art tile)
    ]);
  });

  it("leaves out upgrade-only tiers and any `inShop: false` type (5.10's floodlight); a new type appears without UI work", () => {
    const b = withTypes({ floodlight: box(100, { name: "Floodlight", inShop: false }), bear_trap: box(70, { name: "Bear trap" }) });
    const ids = buildBarItems(b).map((t) => t.id);
    expect(ids).not.toContain("reinforced_barricade");
    expect(ids).not.toContain("metal_barricade");
    expect(ids).not.toContain("floodlight");
    expect(ids).toEqual(["wood_barricade", "auto_turret", "spike_trap", "mine", "med_station", "bear_trap"]);
  });

  it("Story 5.10 review M2: with the dev shop-all balance (?shopall / DEV_SHOP_ALL) the hidden floodlight is a tile (between mine and med station, balance order)", () => {
    const devBal = loadDevBalance({ zombieDamageScale: null, shopAll: true });
    const all = buildBarItems(devBal);
    expect(all.map((t) => t.id)).toEqual(["wood_barricade", "auto_turret", "spike_trap", "mine", "floodlight", "med_station", "bear_trap"]);
    expect(all.find((t) => t.id === "floodlight")).toMatchObject({ name: "Floodlight", price: 100, turret: false, widthM: 1, depthM: 1 });
    expect(buildBarItems(devBal)).toBe(all);
    expect(buildBarItems(balance).map((t) => t.id)).not.toContain("floodlight");
  });

  it("is cached per balance (the same array every frame: no allocation)", () => {
    expect(buildBarItems(balance)).toBe(buildBarItems(balance));
  });
});

describe("buildBarSlots (AC 2, 3; D1 Shop last)", () => {
  const slots = new Int16Array(BUILD_BAR_SLOTS);
  it("today: four tiles on the top row, empties, and Shop in the bottom-right slot", () => {
    expect(Array.from(buildBarSlots(4, 0, slots))).toEqual([0, 1, 2, 3, SLOT_EMPTY, SLOT_EMPTY, SLOT_EMPTY, SLOT_SHOP]);
    expect(buildBarPages(4)).toBe(1);
  });

  it("seven types fill the grid with no More", () => {
    expect(Array.from(buildBarSlots(7, 0, slots))).toEqual([0, 1, 2, 3, 4, 5, 6, SLOT_SHOP]);
    expect(buildBarPages(7)).toBe(1);
  });

  it("more than seven: six per page, More ▸ in slot 6, Shop in slot 7, the page wraps", () => {
    expect(buildBarPages(9)).toBe(2);
    expect(Array.from(buildBarSlots(9, 0, slots))).toEqual([0, 1, 2, 3, 4, 5, SLOT_MORE, SLOT_SHOP]);
    expect(Array.from(buildBarSlots(9, 1, slots))).toEqual([6, 7, 8, SLOT_EMPTY, SLOT_EMPTY, SLOT_EMPTY, SLOT_MORE, SLOT_SHOP]);
    expect(Array.from(buildBarSlots(9, 2, slots))).toEqual([0, 1, 2, 3, 4, 5, SLOT_MORE, SLOT_SHOP]);
    expect(Array.from(buildBarSlots(9, -1, slots))).toEqual([6, 7, 8, SLOT_EMPTY, SLOT_EMPTY, SLOT_EMPTY, SLOT_MORE, SLOT_SHOP]); // negative pages wrap too
  });

  it("no types: only Shop", () => {
    expect(Array.from(buildBarSlots(0, 0, slots))).toEqual([SLOT_EMPTY, SLOT_EMPTY, SLOT_EMPTY, SLOT_EMPTY, SLOT_EMPTY, SLOT_EMPTY, SLOT_EMPTY, SLOT_SHOP]);
  });
});

describe("layoutBuildBar (AC 1, 13)", () => {
  it("800 × 360, no insets: 56 px tiles, 8 px gaps, 16 px inside the bottom-right corner; the count above the top-right", () => {
    const l = layoutBuildBar(800, 360, 0, 0, 1, newBuildBarLayout());
    expect(l.tile).toBe(56);
    expect(Array.from(l.x)).toEqual([536, 600, 664, 728, 536, 600, 664, 728]);
    expect(Array.from(l.y)).toEqual([224, 224, 224, 224, 288, 288, 288, 288]);
    expect([l.left, l.top, l.countX, l.countY]).toEqual([536, 224, 784, 220]);
  });

  it("respects the safe-area insets × dpr (right 24, bottom 16 at dpr 2)", () => {
    const l = layoutBuildBar(1600, 720, 24, 16, 2, newBuildBarLayout());
    expect(l.tile).toBe(112);
    expect(l.x[7]! + l.tile).toBe(1600 - (16 + 24) * 2);
    expect(l.y[7]! + l.tile).toBe(720 - (16 + 16) * 2);
    expect(l.left).toBe(1024);
    expect(l.top).toBe(416);
  });

  it("Ready: 40 px left of centre where it fits, else ≥ 12 px left of the grid (568 × 320 → centre 208)", () => {
    const w = READY_BUTTON_W_CSS_PX;
    const at = (W: number) => readyLeftX(W, w, layoutBuildBar(W, 320, 0, 0, 1, newBuildBarLayout()).left, 1);
    expect(at(800)).toBe(276);
    expect(at(1024)).toBe(388);
    expect(at(568) + w / 2).toBe(208);
  });

  for (const [W, H] of [
    [568, 320],
    [640, 360],
    [800, 360],
    [915, 412],
    [1024, 768],
    [1366, 1024],
  ] as const) {
    for (const k of [1, 2, 3]) {
      it(`${W} × ${H} at dpr ${k}: tiles ≥ 48 px and ≥ 8 px apart, inside the screen, clear of Ready (≥ 12 px) and of ☰`, () => {
        const insetR = 12;
        const insetB = 8;
        const l = layoutBuildBar(W * k, H * k, insetR, insetB, k, newBuildBarLayout());
        expect(l.tile / k).toBeGreaterThanOrEqual(Math.max(48, MIN_BUTTON_CSS_PX));
        for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
          expect(l.x[s]!).toBeGreaterThanOrEqual(0);
          expect(l.y[s]!).toBeGreaterThanOrEqual(0);
          expect(l.x[s]! + l.tile).toBeLessThanOrEqual((W - 16 - insetR) * k + 1e-6);
          expect(l.y[s]! + l.tile).toBeLessThanOrEqual((H - 16 - insetB) * k + 1e-6);
          if (s % 4 !== 3) expect(l.x[s + 1]! - (l.x[s]! + l.tile)).toBeCloseTo(8 * k);
        }
        const rw = READY_BUTTON_W_CSS_PX * k;
        const rx = readyLeftX(W * k, rw, l.left, k);
        expect(l.left - (rx + rw)).toBeGreaterThanOrEqual(12 * k - 1e-6);
        expect(rx).toBeGreaterThanOrEqual(0);
        // Ready's row overlaps the grid's rows; the horizontal gap above is what keeps them apart.
        const readyTop = H * k - (READY_BUTTON_BOTTOM_CSS_PX + insetB) * k - READY_BUTTON_H_CSS_PX * k;
        expect(readyTop).toBeLessThan(H * k);
        // ☰ (top-right) ends above the count line (≈ 20 px of text above the grid).
        const menuBottom = (MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX) * k;
        expect(l.countY - 20 * k).toBeGreaterThan(menuBottom);
      });
    }
  }
});

describe("pick rule (AC 5, 7)", () => {
  it("the cap first, then money; null when both pass", () => {
    expect(pickError(6, 6, 0, 250)).toBe("limit");
    expect(pickError(6, 6, 999, 40)).toBe("limit");
    expect(pickError(5, 6, 180, 250)).toBe("money");
    expect(pickError(5, 6, 250, 250)).toBeNull();
    expect(pickError(0, 6, 40, 40)).toBeNull();
  });

  it("the toasts (ux-spec §7.2 wording)", () => {
    expect(pickRefusalText("limit", 250, 180, 6)).toBe("Building limit reached (6)");
    expect(pickRefusalText("money", 250, 180, 6)).toBe("Need $250 (you have $180)");
  });

  it("tile looks: short when the wallet is below the price, cap when I own the max (D2)", () => {
    expect(tileState(0, 6, 250, 250)).toBe(0);
    expect(tileState(0, 6, 249, 250)).toBe(TILE_SHORT);
    expect(tileState(6, 6, 999, 40)).toBe(TILE_CAP);
    expect(tileState(6, 6, 10, 40)).toBe(TILE_SHORT | TILE_CAP);
  });
});

describe("stepBuildBar (AC 6–10)", () => {
  const items = buildBarItems(balance);
  const model = () => ({ buildBar: true, buildPick: "", buildItems: items as readonly BuildTile[], buildOwned: 0, buildCap: 0 });
  const frame = (over: Partial<BuildBarFrame> = {}): BuildBarFrame => ({ can: true, holding: false, selected: false, owned: 0, cap: 6, wallet: 300, ...over });
  const out = (): BuildBarStep => ({ show: false, pick: "", toast: "" });

  it("an affordable tile under the cap is picked and the pick is consumed", () => {
    const m = model();
    m.buildPick = "auto_turret";
    const r = stepBuildBar(m, frame({ wallet: 250 }), out());
    expect(r).toEqual({ show: true, pick: "auto_turret", toast: "" });
    const n = model();
    stepBuildBar(n, frame({ owned: 4, cap: 6 }), out());
    expect([n.buildOwned, n.buildCap]).toEqual([4, 6]); // the count line reads this frame's World
    expect(m.buildPick).toBe("");
    expect([m.buildOwned, m.buildCap]).toEqual([0, 6]);
    expect(stepBuildBar(m, frame(), out()).pick).toBe(""); // consumed: a second frame picks nothing
  });

  it("Story 5.18 (Q2): within the quiet window after the hand empties a tap picks nothing and toasts nothing (it was meant for Place); the bar still shows and the tap is consumed", () => {
    const m = model();
    m.buildPick = "spike_trap";
    expect(stepBuildBar(m, frame({ wallet: 20, quiet: true }), out())).toEqual({ show: true, pick: "", toast: "" });
    expect(m.buildPick).toBe("");
    m.buildPick = "wood_barricade";
    expect(stepBuildBar(m, frame({ quiet: false }), out()).pick).toBe("wood_barricade");
    expect(balance.controls.build.barQuietMs).toBe(300);
  });

  it("too expensive → the money toast, nothing picked; at the cap → the limit toast first", () => {
    const m = model();
    m.buildPick = "auto_turret";
    expect(stepBuildBar(m, frame({ wallet: 180 }), out())).toEqual({ show: true, pick: "", toast: "Need $250 (you have $180)" });
    m.buildPick = "auto_turret";
    expect(stepBuildBar(m, frame({ wallet: 180, owned: 6 }), out())).toEqual({ show: true, pick: "", toast: "Building limit reached (6)" });
  });

  it("hidden while holding, while a building is selected, when placement isn't possible; a pick then does nothing", () => {
    for (const over of [{ holding: true }, { selected: true }, { can: false }]) {
      const m = model();
      m.buildPick = "wood_barricade";
      expect(stepBuildBar(m, frame(over), out())).toEqual({ show: false, pick: "", toast: "" });
      expect(m.buildPick).toBe("");
    }
  });

  it("a tap on a bar that wasn't on screen last frame does nothing (B5: the frame the wave starts / it just hid)", () => {
    const m = model();
    m.buildBar = false;
    m.buildPick = "wood_barricade";
    expect(stepBuildBar(m, frame(), out())).toEqual({ show: true, pick: "", toast: "" });
  });

  it("an id that isn't a tile of this balance does nothing", () => {
    const m = model();
    m.buildPick = "metal_barricade"; // upgrade-only tier
    expect(stepBuildBar(m, frame({ wallet: 9999 }), out())).toEqual({ show: true, pick: "", toast: "" });
  });
});
