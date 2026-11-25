import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, loadDevBalance, type Balance } from "@topdown/shared";
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
  layoutBuildCluster,
  layoutBuildPanel,
  newBuildClusterLayout,
  newBuildPanelLayout,
  PANEL_CELLS,
  PANEL_TAP_CLOSE,
  PANEL_TAP_CONSUME,
  PANEL_TAP_KEEP,
  PANEL_TAP_NONE,
  buildPanelSlots,
  dropQuietPresses,
  onPanelCard,
  readyClearLeft,
  panelAllowed,
  panelStaysOpen,
  panelTapOutside,
  pickError,
  pickRefusalText,
  readyLeftX,
  quickType,
  stepBuildBar,
  tileState,
  togglePanelKey,
  type BuildBarFrame,
  type BuildBarStep,
  type BuildTile,
} from "./buildBar";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX, READY_BUTTON_W_CSS_PX } from "../ui/sizes";

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
      ["mine", "Mine", 35, false, 0.5, 0.5],
      ["floodlight", "Floodlight", 100, false, 1, 1], // Story 6.3 (D8): a tile from wave 1, no UI change
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

  it("Story 5.10 review M2: with the dev shop-all balance (?shopall / DEV_SHOP_ALL) a hidden floodlight (test balance since 6.3) is a tile (between mine and med station, balance order)", () => {
    const raw = bundledBalanceFiles();
    ((raw.buildings as { types: Record<string, { inShop?: boolean }> }).types.floodlight as { inShop?: boolean }).inShop = false;
    const hidden = loadBalance(raw);
    const devBal = loadDevBalance({ zombieDamageScale: null, shopAll: true }, raw);
    const all = buildBarItems(devBal);
    expect(all.map((t) => t.id)).toEqual(["wood_barricade", "auto_turret", "spike_trap", "mine", "floodlight", "med_station", "bear_trap"]);
    expect(all.find((t) => t.id === "floodlight")).toMatchObject({ name: "Floodlight", price: 100, turret: false, widthM: 1, depthM: 1 });
    expect(buildBarItems(devBal)).toBe(all);
    expect(buildBarItems(hidden).map((t) => t.id)).not.toContain("floodlight");
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

describe("Story 10.10: layoutBuildCluster (BU-1 = B, AC 1)", () => {
  it("568 × 320, no insets: B's still — Build 496,248; quick 432,248; Shop chip 500,188 (48 px); the box for the neighbours", () => {
    const c = layoutBuildCluster(568, 320, 0, 0, 1, newBuildClusterLayout());
    expect([c.tile, c.chip]).toEqual([56, 48]);
    expect([c.buildX, c.buildY, c.quickX, c.quickY, c.chipX, c.chipY]).toEqual([496, 248, 432, 248, 500, 188]);
    expect([c.left, c.top, c.right]).toEqual([432, 188, 552]);
    expect(c.badgeX).toBeGreaterThan(c.buildX + c.tile); // the badge sticks out of Build's top-right corner
    expect(c.badgeY).toBeLessThan(c.buildY);
  });

  it("844 × 390: Build 772,318 (mock.html); insets × dpr (right 24, bottom 16 at dpr 2)", () => {
    const c = layoutBuildCluster(844, 390, 0, 0, 1, newBuildClusterLayout());
    expect([c.buildX, c.buildY]).toEqual([772, 318]);
    const d = layoutBuildCluster(1600, 720, 24, 16, 2, newBuildClusterLayout());
    expect(d.buildX + d.tile).toBe(1600 - (16 + 24) * 2);
    expect(d.buildY + d.tile).toBe(720 - (16 + 16) * 2);
    expect(d.buildX - (d.quickX + d.tile)).toBe(16); // 8 px × dpr 2
    expect(d.buildY - (d.chipY + d.chip)).toBe(24); // 12 px × dpr 2
  });
});

describe("Story 10.10: layoutBuildPanel (BU-4, AC 3, 5)", () => {
  it("568 × 320, no insets: cells 368…552 × 120…304, Close on Build's spot, the card 360…560 below ping", () => {
    const p = layoutBuildPanel(568, 320, 0, 0, 1, newBuildPanelLayout());
    expect(p.tile).toBe(56);
    expect([p.x[0], p.y[0]]).toEqual([368, 120]);
    expect([p.x[PANEL_CELLS - 1]! + p.tile, p.y[PANEL_CELLS - 1]! + p.tile]).toEqual([552, 304]);
    const c = layoutBuildCluster(568, 320, 0, 0, 1, newBuildClusterLayout());
    expect([p.x[PANEL_CELLS - 1], p.y[PANEL_CELLS - 1]]).toEqual([c.buildX, c.buildY]);
    expect([p.cardX, p.cardX + p.cardW, p.cardY + p.cardH]).toEqual([360, 560, 312]);
    expect(p.cardY).toBeGreaterThanOrEqual(MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX + 12);
    expect(p.headerY).toBeGreaterThan(p.cardY);
    expect(p.headerY).toBeLessThan(p.y[0]!);
  });

  it("844 × 390: cells 644…828 × 190…374 (mock.html)", () => {
    const p = layoutBuildPanel(844, 390, 0, 0, 1, newBuildPanelLayout());
    expect([p.x[0], p.y[0], p.x[8]! + p.tile, p.y[8]! + p.tile]).toEqual([644, 190, 828, 374]);
  });

  it("review 7: with a top inset on a short screen the cells shrink so the card keeps 12 px under ping / ☰ (never below 48 px)", () => {
    for (const [w, h, b] of [
      [568, 320, 21],
      [568, 320, 0],
      [640, 360, 21],
    ] as const) {
      const p = layoutBuildPanel(w, h, 44, b, 1, newBuildPanelLayout(), 20);
      expect(p.cardY, `${w}x${h} bottom ${b}`).toBeGreaterThanOrEqual(20 + MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX + 12 - 1e-6);
      expect(p.tile).toBeGreaterThanOrEqual(48);
    }
    expect(layoutBuildPanel(568, 320, 44, 21, 1, newBuildPanelLayout(), 20).tile).toBe(49);
    expect(layoutBuildPanel(844, 390, 0, 0, 1, newBuildPanelLayout(), 20).tile).toBe(56); // room to spare
  });

  it("10.10-B3: only 568 × 320 with 44 px side insets shrinks the cells (≥ 48 px) to keep the survivor's 48 px; dpr scales alike", () => {
    expect(layoutBuildPanel(568, 320, 44, 21, 1, newBuildPanelLayout()).tile).toBe(50);
    expect(layoutBuildPanel(640, 360, 44, 21, 1, newBuildPanelLayout()).tile).toBe(56);
    expect(layoutBuildPanel(568 * 3, 320 * 3, 44, 21, 3, newBuildPanelLayout()).tile).toBe(152); // whole canvas px (50.67 CSS px × 3)
  });

  it("Ready: 40 px left of centre where it fits, else ≥ 12 px left of the open card (it never jumps when the panel opens)", () => {
    const w = READY_BUTTON_W_CSS_PX;
    const at = (W: number) => readyLeftX(W, w, readyClearLeft(layoutBuildPanel(W, 320, 0, 0, 1, newBuildPanelLayout())), 1);
    expect(at(800)).toBe(276);
    expect(at(1024)).toBe(388);
    expect(at(568) + w / 2).toBe(244); // back to 40 px left of centre (5.16's grid pushed it to 208)
  });
});

describe("Story 10.10: the quick tile, BU-3 and the panel's open / close rules", () => {
  const items = buildBarItems(balance);
  it("quickType (BU-5): the first unlocked before any placement; the last placed after; a type no longer in the list falls back", () => {
    expect(quickType(items, "")).toBe(items[0]!.id);
    expect(quickType(items, "mine")).toBe("mine");
    expect(quickType(items, "no_such_type")).toBe(items[0]!.id);
    const starter = buildBarItems(balance, 0); // a new account's mask: only the starter types
    expect(starter.some((t) => t.id === "mine")).toBe(false);
    expect(quickType(starter, "mine")).toBe(starter[0]!.id); // the type left the unlock list
    expect(quickType([], "mine")).toBe("");
  });

  it("BU-3: no panel with ≤ 2 types; a new account has the short list", () => {
    expect(panelAllowed(0)).toBe(false);
    expect(panelAllowed(2)).toBe(false);
    expect(panelAllowed(3)).toBe(true);
    expect(panelAllowed(buildBarItems(balance, 0).length)).toBe(false);
    expect(panelAllowed(items.length)).toBe(true);
  });

  it("AC 6: a pick, the cluster going away (phase end, downed, menu, shop, holding, a selection, waiting), the ping wheel, BU-3 close it", () => {
    const n = items.length;
    expect(panelStaysOpen(true, true, false, false, n)).toBe(true);
    expect(panelStaysOpen(false, true, false, false, n)).toBe(false); // never opens by itself
    expect(panelStaysOpen(true, false, false, false, n)).toBe(false);
    expect(panelStaysOpen(true, true, true, false, n)).toBe(false);
    expect(panelStaysOpen(true, true, false, true, n)).toBe(false);
    expect(panelStaysOpen(true, true, false, false, 2)).toBe(false);
  });

  it("AC 6 (review 4, 5): a touch while open — right half / world consumed; move-stick half closes and still walks; another button closes and passes it on; the card itself keeps it open; a cell / Close nothing", () => {
    expect(panelTapOutside(false, null)).toBe(PANEL_TAP_NONE);
    expect(panelTapOutside(false, null, false, true)).toBe(PANEL_TAP_NONE);
    expect(panelTapOutside(true, null)).toBe(PANEL_TAP_CONSUME);
    expect(panelTapOutside(true, null, false, true)).toBe(PANEL_TAP_CLOSE); // review 4: the move stick still starts
    for (const id of ["ready", "menu", "ping", "consumable"]) expect(panelTapOutside(true, id)).toBe(PANEL_TAP_CLOSE);
    for (const id of ["ptile0", "ptile7", "build"]) expect(panelTapOutside(true, id, true)).toBe(PANEL_TAP_NONE);
    expect(panelTapOutside(true, null, true)).toBe(PANEL_TAP_KEEP); // review 5: the header, the padding, an empty cell
    const p = layoutBuildPanel(568, 320, 0, 0, 1, newBuildPanelLayout());
    expect(onPanelCard(p, p.cardX + 20, p.cardY + 6)).toBe(true); // the header
    expect(onPanelCard(p, p.cardX + p.cardW - 2, p.cardY + p.cardH - 2)).toBe(true); // the padding by Close
    expect(onPanelCard(p, p.cardX - 1, p.cardY + 40)).toBe(false);
    expect(onPanelCard(p, 284, 160)).toBe(false); // the survivor
  });

  it("review 9 (B13): the open panel's cell 7 — the quick tile's own spot — holds the quick type; Shop in cell 6; the rest in balance order; paging past 6 others", () => {
    const out = new Int16Array(BUILD_BAR_SLOTS);
    expect(Array.from(buildPanelSlots(7, 0, 0, out))).toEqual([1, 2, 3, 4, 5, 6, SLOT_SHOP, 0]);
    expect(Array.from(buildPanelSlots(7, 3, 0, out))).toEqual([0, 1, 2, 4, 5, 6, SLOT_SHOP, 3]);
    expect(Array.from(buildPanelSlots(7, 6, 0, out))).toEqual([0, 1, 2, 3, 4, 5, SLOT_SHOP, 6]);
    expect(Array.from(buildPanelSlots(4, 1, 0, out))).toEqual([0, 2, 3, SLOT_EMPTY, SLOT_EMPTY, SLOT_EMPTY, SLOT_SHOP, 1]);
    expect(Array.from(buildPanelSlots(9, 0, 0, out))).toEqual([1, 2, 3, 4, 5, SLOT_MORE, SLOT_SHOP, 0]); // 8 others: five a page
    expect(Array.from(buildPanelSlots(9, 0, 1, out))).toEqual([6, 7, 8, SLOT_EMPTY, SLOT_EMPTY, SLOT_MORE, SLOT_SHOP, 0]);
    expect(Array.from(buildPanelSlots(9, 0, 2, out))).toEqual(Array.from(buildPanelSlots(9, 0, 0, new Int16Array(BUILD_BAR_SLOTS)))); // wraps
    expect(Array.from(buildPanelSlots(7, -1, 0, out))).toEqual([0, 1, 2, 3, 4, 5, 6, SLOT_SHOP]); // no quick type: 5.16's order
    // cell 7 sits exactly on the quick tile's spot (56 px cells)
    const p = layoutBuildPanel(844, 390, 0, 0, 1, newBuildPanelLayout());
    const c = layoutBuildCluster(844, 390, 0, 0, 1, newBuildClusterLayout());
    expect([p.x[7], p.y[7]]).toEqual([c.quickX, c.quickY]);
  });

  it("review 1, 2 + re-review 1: in 5.18's quiet window ↶, swap, quick-use, Build and Ready presses are dropped; outside it they stay", () => {
    const m = { undoPressed: true, swapPressed: true, consumablePressed: true, buildPanelPressed: true, readyPressed: true };
    dropQuietPresses(m, false);
    expect(m).toEqual({ undoPressed: true, swapPressed: true, consumablePressed: true, buildPanelPressed: true, readyPressed: true });
    dropQuietPresses(m, true);
    expect(m).toEqual({ undoPressed: false, swapPressed: false, consumablePressed: false, buildPanelPressed: false, readyPressed: false });
  });

  it("AC 9: B toggles the panel only while the cluster is up and there is a panel", () => {
    const m = { buildPanelOpen: false, buildBar: true, buildItems: items };
    togglePanelKey(m);
    expect(m.buildPanelOpen).toBe(true);
    togglePanelKey(m);
    expect(m.buildPanelOpen).toBe(false);
    togglePanelKey({ ...m, buildBar: false });
    expect(m.buildPanelOpen).toBe(false);
    const short = { buildPanelOpen: false, buildBar: true, buildItems: items.slice(0, 2) };
    togglePanelKey(short);
    expect(short.buildPanelOpen).toBe(false);
  });
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
