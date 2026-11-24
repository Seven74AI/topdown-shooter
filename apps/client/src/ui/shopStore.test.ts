import { describe, expect, it } from "vitest";
import { allGear, cardCatalog, loadBalance, shopConsumables, upgradePriceTable, type ShopOfferView } from "@topdown/shared";
import {
  CLOSED_SHOP,
  REROLL_KEY,
  SHOP_PENDING_TIMEOUT_MS,
  SHOP_TEXT,
  canReroll,
  cardKey,
  cardViews,
  consumableRows,
  itemKey,
  replaceWarning,
  shopAllowed,
  shopErrorText,
  shopStep,
  upgradeErrorText,
  upgradeKey,
  upgradeRows,
  type ShopInput,
  type ShopState,
} from "./shopStore";

const balance = loadBalance();
const catalog = cardCatalog(balance);
const cardPrices: Record<string, number> = Object.fromEntries(catalog.map((c) => [c.id, c.basePrice]));
const gear = allGear(balance);

/** Runs inputs from a state; returns the last state and every effect. */
function run(from: ShopState, ...inputs: ShopInput[]) {
  let s = from;
  const effects: unknown[] = [];
  for (const i of inputs) {
    const r = shopStep(s, i);
    s = r.state;
    if (r.effect) effects.push(r.effect);
  }
  return { s, effects };
}

/** An offer of build `build`, rev `rev`, showing `cards` (padded to 6 with ""). */
const offer = (cards: string[], rev = 0, sold = 0, build = 0, canReroll = true): ShopOfferView => ({
  build,
  rev,
  cards: [...cards, ...Array.from({ length: 6 - cards.length }, () => "")],
  sold,
  rerollPrice: 20,
  canReroll,
});
const feed = (o: ShopOfferView | null, build = 0): ShopInput => ({ type: "offer", offer: o, build });
const CARDS = ["smg", "machete", "shotgun", "body_armor_1", "running_shoes", "revive_kit"];

const opened = (slots: readonly [string, string | null] = ["pistol", null], wallet = 250, o: ShopOfferView | null = offer(CARDS), gearMask = 0) =>
  run(CLOSED_SHOP, { type: "open", catalog, cardPrices, cardStats: { smg: "8 dmg · 12/s" }, gear }, { type: "sync", wallet, slots, gearMask }, feed(o)).s;

describe("shopStep cards (Story 5.13 AC 8–9; D8, F4, F9)", () => {
  it("opens with the cards of the current offer, syncs wallet and slots, closes (the offer is kept)", () => {
    const s = opened();
    expect(s).toMatchObject({ open: true, wallet: 250, slots: ["pistol", null], pending: null, message: "", selected: -1 });
    expect(cardViews(s).map((c) => [c.item, c.kind, c.price])).toEqual([
      ["smg", "weapon", 200],
      ["machete", "weapon", 150],
      ["shotgun", "weapon", 250],
      ["body_armor_1", "gear", 150],
      ["running_shoes", "gear", 150],
      ["revive_kit", "gear", 150],
    ]);
    expect(cardViews(s)[0]?.stat).toBe("8 dmg · 12/s");
    const closed = run(s, { type: "close" }).s;
    expect(closed.open).toBe(false);
    expect(closed.offer).toBe(s.offer);
  });

  it("feeding the same offer and build returns the same object (no re-render)", () => {
    const s = opened();
    expect(shopStep(s, feed(s.offer)).state).toBe(s);
    expect(shopStep(s, { type: "sync", wallet: 250, slots: ["pistol", null], gearMask: 0 }).state).toBe(s);
  });

  it("first tap selects, second tap buys (one effect); further taps send nothing while pending", () => {
    const sel = run(opened(), { type: "card", card: 1 });
    expect(sel.effects).toEqual([]);
    expect(sel.s.selected).toBe(1);
    expect(cardViews(sel.s)[1]?.selected).toBe(true);
    const { s, effects } = run(sel.s, { type: "card", card: 1 }, { type: "card", card: 1 }, { type: "card", card: 0 }, { type: "card", card: 0 }, { type: "reroll" });
    expect(effects).toEqual([{ type: "card", card: 1, item: "machete", slot: null }]);
    expect(s.pending).toBe(cardKey(1));
    expect(s.pendingOffer).toEqual({ build: 0, rev: 0, card: 1 });
    expect(canReroll(s)).toBe(false);
  });

  it("tapping another card moves the selection; tapping elsewhere deselects", () => {
    const s = run(opened(), { type: "card", card: 1 }, { type: "card", card: 3 }).s;
    expect(s.selected).toBe(3);
    expect(run(s, { type: "deselect" }).s.selected).toBe(-1);
  });

  it("pending until the offer shows the card sold (the answer alone keeps it); then Bought", () => {
    const sent = run(opened(), { type: "card", card: 0 }, { type: "card", card: 0 }).s;
    const answered = run(sent, { type: "answer", answer: { ok: true, item: "smg", card: 0, slot: 1 } }).s;
    expect(answered.pending).toBe(cardKey(0)); // the server's offer hasn't shown it sold yet
    const sold = run(answered, feed(offer(CARDS, 0, 1))).s;
    expect(sold).toMatchObject({ pending: null, pendingOffer: null, selected: -1 });
    expect(sold.message).toBe("Bought SMG");
    expect(cardViews(sold)[0]).toMatchObject({ sold: true, owned: false });
    // The offer first (before the answer) unlocks too; the late answer only shows its text.
    const first = run(sent, feed(offer(CARDS, 0, 1))).s;
    expect(first.pending).toBeNull();
    expect(run(first, { type: "answer", answer: { ok: true, item: "smg", card: 0, slot: 1 } }).s.pending).toBeNull();
  });

  it("a refusal shows its text and unlocks (selection kept); nothing else changes", () => {
    const { s } = run(opened(["pistol", null], 100), { type: "card", card: 0 }, { type: "card", card: 0 }, { type: "answer", answer: { ok: false, item: "smg", card: 0, error: "insufficient_funds" } });
    expect(s).toMatchObject({ message: "Not enough money", refused: true, pending: null, wallet: 100, slots: ["pistol", null], selected: 0 });
  });

  it("Too dear is dimmed but still selectable and sendable (the server decides); price on the card = cardPrice()", () => {
    const s = opened(["pistol", null], 100);
    const v = cardViews(s)[0];
    expect(v).toMatchObject({ short: true, price: 200 });
    expect(run(s, { type: "card", card: 0 }, { type: "card", card: 0 }).effects).toEqual([{ type: "card", card: 0, item: "smg", slot: null }]);
  });

  it("owned, sold and empty cards do nothing; armor I shows Owned with armor II", () => {
    const s = opened(["pistol", "smg"], 1000, offer(["smg", "body_armor_1"], 0, 0), 2 /* armor II */);
    const v = cardViews(s);
    expect(v.map((c) => [c.owned, c.sold])).toEqual([
      [true, false],
      [true, false],
      [false, false],
      [false, false],
      [false, false],
      [false, false],
    ]);
    expect(v[2]?.item).toBe("");
    expect(run(s, { type: "card", card: 0 }, { type: "card", card: 0 }, { type: "card", card: 1 }, { type: "card", card: 1 }, { type: "card", card: 2 }, { type: "card", card: 2 }).effects).toEqual([]);
    const sold = opened(["pistol", null], 1000, offer(CARDS, 0, 0b100));
    expect(run(sold, { type: "card", card: 2 }, { type: "card", card: 2 }).effects).toEqual([]);
  });

  it("both slots full: Replace which? then the chosen slot is sent; Cancel sends nothing", () => {
    const full = opened(["pistol", "machete"], 1000);
    const asked = run(full, { type: "card", card: 2 }, { type: "card", card: 2 });
    expect(asked.effects).toEqual([]);
    expect(asked.s.choosing).toBe("shotgun");
    expect(run(asked.s, { type: "cancel" })).toMatchObject({ effects: [], s: { choosing: null, pending: null } });
    const chosen = run(asked.s, { type: "slot", slot: 0 }, { type: "slot", slot: 1 });
    expect(chosen.effects).toEqual([{ type: "card", card: 2, item: "shotgun", slot: 0 }]);
    expect(chosen.s).toMatchObject({ choosing: null, pending: cardKey(2) });
  });

  it("reroll pending until rev rises; a second tap while pending does nothing", () => {
    const r = run(opened(), { type: "card", card: 0 }, { type: "reroll" }, { type: "reroll" }, { type: "card", card: 1 });
    expect(r.effects).toEqual([{ type: "reroll" }]);
    expect(r.s).toMatchObject({ pending: REROLL_KEY, selected: -1 });
    const same = run(r.s, feed(offer(CARDS, 0, 0))).s;
    expect(same.pending).toBe(REROLL_KEY);
    const next = run(r.s, feed(offer(["shotgun", "revive_kit"], 1))).s;
    expect(next.pending).toBeNull();
    expect(cardViews(next).map((c) => c.item)).toEqual(["shotgun", "revive_kit", "", "", "", ""]);
    // A refused reroll unlocks with its text.
    const refused = run(r.s, { type: "answer", answer: { kind: "reroll", ok: false, error: "stale_offer" } }).s;
    expect(refused).toMatchObject({ pending: null, refused: true, message: "Your cards changed: look again" });
  });

  it("Reroll is disabled when the pool is spent (canReroll false) and without a current offer", () => {
    expect(canReroll(opened(["pistol", null], 250, offer(CARDS, 0, 0, 0, false)))).toBe(false);
    expect(run(opened(["pistol", null], 250, offer(CARDS, 0, 0, 0, false)), { type: "reroll" }).effects).toEqual([]);
    expect(canReroll(opened())).toBe(true);
  });

  it("an offer of another build is not shown (Loading cards…): no cards, no taps, no reroll", () => {
    const stale = opened(["pistol", null], 250, offer(CARDS, 0, 0, 2));
    expect(cardViews(stale)).toEqual([]);
    expect(run(stale, { type: "card", card: 0 }, { type: "card", card: 0 }, { type: "reroll" }).effects).toEqual([]);
    const none = opened(["pistol", null], 250, null);
    expect(cardViews(none)).toEqual([]);
    expect(SHOP_TEXT.loading).toBe("Loading cards…");
    // The current build's offer arriving later shows the cards.
    expect(cardViews(run(none, feed(offer(CARDS))).s)).toHaveLength(6);
  });

  it("a late answer for an older request doesn't unlock a newer one (3.3 review rule kept)", () => {
    const first = run(opened(["pistol", null], 1000), { type: "card", card: 1 }, { type: "card", card: 1 }).s;
    const timedOut = run(first, { type: "time", nowMs: 1 }, { type: "time", nowMs: 1 + SHOP_PENDING_TIMEOUT_MS }).s;
    expect(timedOut.pending).toBeNull();
    const second = run(timedOut, { type: "card", card: 3 }, { type: "card", card: 3 }).s;
    expect(second.pending).toBe(cardKey(3));
    const late = run(second, { type: "answer", answer: { ok: true, item: "machete", card: 1, slot: 1 } }).s;
    expect(late.pending).toBe(cardKey(3));
    expect(late.message).toMatch(/Bought/);
  });

  it("a new offer (rev or build) drops the selection", () => {
    const s = run(opened(), { type: "card", card: 2 }).s;
    expect(run(s, feed(offer(CARDS, 1))).s.selected).toBe(-1);
    expect(run(s, feed(offer(CARDS, 0, 0b1))).s.selected).toBe(2); // the same offer with a sale: kept
  });

  it("shopAllowed: only in a build, with a run on screen, no menu, no stress run, not leaving (3.3 review)", () => {
    const ok = { phase: "build", running: true, gameOver: false, menuOpen: false, stressMode: false, leaving: false };
    expect(shopAllowed(ok)).toBe(true);
    for (const bad of [{ phase: "wave" }, { running: false }, { gameOver: true }, { menuOpen: true }, { stressMode: true }, { leaving: true }]) {
      expect(shopAllowed({ ...ok, ...bad })).toBe(false);
    }
  });

  it("Story 5.16: no buildings; old actions (building, 3.3's buy) do nothing", () => {
    const s = opened();
    expect(Object.keys(s)).not.toContain("buildings");
    for (const old of [{ type: "building", id: "wood_barricade" }, { type: "buy", weapon: "smg" }]) {
      const { s: after, effects } = run(s, old as unknown as ShopInput);
      expect(effects).toEqual([]);
      expect(after.open).toBe(true);
    }
  });

  it("nothing happens while closed (taps, answers)", () => {
    const { s, effects } = run(CLOSED_SHOP, { type: "card", card: 0 }, { type: "reroll" }, { type: "answer", answer: { ok: true, item: "smg", card: 0, slot: 1 } });
    expect(effects).toEqual([]);
    expect(s.pending).toBeNull();
    expect(s.open).toBe(false);
  });

  it("a pending purchase without an answer is given up after the timeout (the stored offer wins); a later buy starts a fresh clock", () => {
    let s = run(opened(["pistol", null], 1000), { type: "card", card: 0 }, { type: "card", card: 0 }).s;
    s = run(s, { type: "time", nowMs: 1000 }, { type: "time", nowMs: 1000 + SHOP_PENDING_TIMEOUT_MS - 1 }).s;
    expect(s.pending).toBe(cardKey(0));
    s = run(s, { type: "time", nowMs: 1000 + SHOP_PENDING_TIMEOUT_MS }).s;
    expect(s.pending).toBeNull();
    s = run(s, { type: "card", card: 1 }, { type: "card", card: 1 }, { type: "time", nowMs: 9000 }).s;
    expect(s.pending).toBe(cardKey(1));
    expect(s.pendingAtMs).toBe(9000);
  });

  it("error texts", () => {
    expect(shopErrorText("insufficient_funds")).toBe("Not enough money");
    expect(shopErrorText("not_build")).toBe("The shop is closed");
    expect(shopErrorText("already_owned")).toBe("You already have it");
    expect(shopErrorText("not_alive")).toBe("You can't shop while down");
    expect(shopErrorText("not_in_offer")).toBe("That card is gone");
    expect(shopErrorText("no_new_cards")).toBe("No new cards left");
    expect(shopErrorText("unknown_player")).toBe("Can't buy that");
  });
});

describe("shopStep upgrades (Story 5.1, F1)", () => {
  const balance = loadBalance();
  const prices = upgradePriceTable(balance);
  const openUp = (slots: readonly [string, string | null], levels: readonly [number, number], wallet = 500) =>
    run(CLOSED_SHOP, { type: "open", catalog, upgradePrices: prices, maxLevel: 4 }, { type: "sync", wallet, slots, levels }).s;

  it("rows follow my slots (slot 0 first) with the shown price; a weapon I don't own has no row", () => {
    const s = openUp(["pistol", "smg"], [1, 2]);
    expect(upgradeRows(s)).toEqual([
      { weapon: "pistol", slot: 0, level: 1, price: 60 },
      { weapon: "smg", slot: 1, level: 2, price: 120 },
    ]);
    expect(upgradeRows(openUp(["machete", null], [3, 0]))).toEqual([{ weapon: "machete", slot: 0, level: 3, price: 90 }]);
  });

  it("upgrade pending until the answer: one effect per tap, a second tap sends nothing", () => {
    const { s, effects } = run(openUp(["pistol", "smg"], [1, 1]), { type: "upgrade", weapon: "smg" }, { type: "upgrade", weapon: "smg" }, { type: "upgrade", weapon: "pistol" }, { type: "reroll" });
    expect(effects).toEqual([{ type: "upgrade", weapon: "smg" }]);
    expect(s.pending).toBe(upgradeKey("smg"));
    // A card answer for something else doesn't unlock it; the upgrade answer does, with its text.
    const late = run(s, { type: "answer", answer: { ok: true, item: "smg", card: 0, slot: 1 } }).s;
    expect(late.pending).toBe(upgradeKey("smg"));
    // The ok answer alone keeps it pending (review fix): the state hasn't shown the new level yet.
    const answered = run(s, { type: "answer", answer: { kind: "upgrade", ok: true, weapon: "smg", slot: 1, level: 2 } }).s;
    expect(answered).toMatchObject({ pending: upgradeKey("smg"), message: "smg upgraded to II", refused: false, levels: [1, 1] });
    // A sync without the new level (e.g. the wallet first) still keeps it; the one with it unlocks.
    const walletOnly = run(answered, { type: "sync", wallet: 380, slots: ["pistol", "smg"], levels: [1, 1] }).s;
    expect(walletOnly.pending).toBe(upgradeKey("smg"));
    const done = run(walletOnly, { type: "sync", wallet: 380, slots: ["pistol", "smg"], levels: [1, 2] });
    expect(done.s).toMatchObject({ pending: null, awaitLevel: null, message: "smg upgraded to II", refused: false, wallet: 380, levels: [1, 2] });
    const refused = run(s, { type: "answer", answer: { kind: "upgrade", ok: false, weapon: "smg", error: "insufficient_funds" } }).s;
    expect(refused).toMatchObject({ pending: null, message: "Not enough money", refused: true });
  });

  it("review probe: open → upgrade → ok answer → upgrade with no sync between sends ONE effect (no double buy from a stale row)", () => {
    const { s, effects } = run(
      openUp(["pistol", "smg"], [1, 1]),
      { type: "upgrade", weapon: "smg" },
      { type: "answer", answer: { kind: "upgrade", ok: true, weapon: "smg", slot: 1, level: 2 } },
      { type: "upgrade", weapon: "smg" },
    );
    expect(effects).toEqual([{ type: "upgrade", weapon: "smg" }]);
    expect(s.pending).toBe(upgradeKey("smg"));
    // After the state agrees, the next tap is a new, honest upgrade (II → III at the shown price).
    const next = run(s, { type: "sync", wallet: 380, slots: ["pistol", "smg"], levels: [1, 2] }, { type: "upgrade", weapon: "smg" });
    expect(next.effects).toEqual([{ type: "upgrade", weapon: "smg" }]);
    // No state ever (lost patch): the 3 s timeout still gives the buttons back.
    const t = run(s, { type: "time", nowMs: 1000 }, { type: "time", nowMs: 1000 + SHOP_PENDING_TIMEOUT_MS });
    expect(t.s).toMatchObject({ pending: null, awaitLevel: null });
  });

  it("the shown level is the World's (sync), never the answer's", () => {
    const s = run(openUp(["pistol", null], [1, 0]), { type: "upgrade", weapon: "pistol" }, { type: "answer", answer: { kind: "upgrade", ok: true, weapon: "pistol", slot: 0, level: 2 } }).s;
    expect(upgradeRows(s)[0]?.level).toBe(1); // until the state agrees
    expect(upgradeRows(run(s, { type: "sync", wallet: 440, slots: ["pistol", null], levels: [2, 0] }).s)[0]?.level).toBe(2);
  });

  it("max row disabled: at IV the row has no price and a tap sends nothing", () => {
    const s = openUp(["smg", null], [4, 0]);
    expect(upgradeRows(s)).toEqual([{ weapon: "smg", slot: 0, level: 4, price: null }]);
    expect(run(s, { type: "upgrade", weapon: "smg" }).effects).toEqual([]);
    expect(run(s, { type: "upgrade", weapon: "machete" }).effects).toEqual([]); // not mine
  });

  it("replace warns when levels would be lost (only for a slot above I)", () => {
    const base = run(openUp(["pistol", "smg"], [1, 3]), feed(offer(["machete", "body_armor_1"]))).s;
    const s = run(base, { type: "card", card: 0 }, { type: "card", card: 0 }).s;
    expect(s.choosing).toBe("machete");
    expect(replaceWarning(s, 1)).toBe("Its upgrades are lost.");
    expect(replaceWarning(s, 0)).toBe("");
    expect(run(s, { type: "upgrade", weapon: "smg" }).effects).toEqual([]); // no upgrade while choosing
  });

  it("refusal texts", () => {
    expect(upgradeErrorText("max_level")).toBe("Already at max level");
    expect(upgradeErrorText("not_owned")).toBe("You don't have that weapon");
    expect(upgradeErrorText("not_build")).toBe("The shop is closed");
    expect(upgradeErrorText("insufficient_funds")).toBe("Not enough money");
    expect(upgradeErrorText("unknown_player")).toBe("Can't upgrade that");
  });
});

describe("shopStep consumables (Story 5.12, AC 2)", () => {
  const consumables = shopConsumables(loadBalance());
  const open = (slotItem: string | null = null, slotCount = 0, wallet = 500) =>
    run(CLOSED_SHOP, { type: "open", catalog, consumables }, { type: "sync", wallet, slots: ["pistol", null], slotItem, slotCount }).s;
  const ok = (item: string): ShopInput => ({ type: "answer", answer: { kind: "item", ok: true, item } });

  it("always lists the three; a full slot reads Full; a partial one notes the refill; another item notes the replacement", () => {
    expect(consumableRows(open()).map((r) => [r.id, r.pack, r.price, r.full, r.note])).toEqual([
      ["medkit", 1, 60, false, ""],
      ["grenades", 3, 80, false, ""],
      ["molotovs", 2, 100, false, ""],
    ]);
    const two = consumableRows(open("grenades", 2));
    expect(two.map((r) => r.note)).toEqual(["Replaces Grenades ×2", "Refills to ×3", "Replaces Grenades ×2"]);
    expect(consumableRows(open("grenades", 3)).find((r) => r.id === "grenades")?.full).toBe(true);
    expect(consumableRows(open(null, 0, 70)).map((r) => r.short)).toEqual([false, true, true]);
  });

  it("buy → one effect → pending until the state shows the full slot; a full row sends nothing", () => {
    const r = run(open("grenades", 3), { type: "item", item: "grenades" });
    expect(r.effects).toEqual([]);
    const b = run(open("grenades", 1), { type: "item", item: "grenades" }, { type: "item", item: "medkit" });
    expect(b.effects).toEqual([{ type: "item", item: "grenades" }]);
    const answered = run(b.s, ok("grenades")).s;
    expect(answered.message).toBe("Bought Grenades ×3");
    expect(answered.pending).toBe(itemKey("grenades"));
    const synced = run(answered, { type: "sync", wallet: 420, slots: ["pistol", null], slotItem: "grenades", slotCount: 3 }).s;
    expect(synced.pending).toBeNull();
    // the state first (patch before the answer) unlocks too
    const first = run(open(), { type: "item", item: "molotovs" }, { type: "sync", wallet: 400, slots: ["pistol", null], slotItem: "molotovs", slotCount: 2 }).s;
    expect(first.pending).toBeNull();
    expect(shopErrorText("already_full")).toBe("Already full");
  });
});
