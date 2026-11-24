import { describe, expect, it } from "vitest";
import { loadBalance, shopConsumables, shopGear, shopWeapons, upgradePriceTable } from "@topdown/shared";
import {
  CLOSED_SHOP,
  consumableRows,
  SHOP_PENDING_TIMEOUT_MS,
  SHOP_TEXT,
  gearRows,
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

const weapons = shopWeapons(loadBalance());

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

const opened = (slots: readonly [string, string | null] = ["pistol", null], wallet = 250) =>
  run(CLOSED_SHOP, { type: "open", weapons }, { type: "sync", wallet, slots }).s;

describe("shopStep (Story 3.3)", () => {
  it("opens with the items, syncs wallet and slots, closes", () => {
    const s = opened();
    expect(s).toMatchObject({ open: true, wallet: 250, slots: ["pistol", null], pending: null, message: "" });
    expect(s.weapons.map((w) => w.id)).toEqual(["pistol", "machete", "smg", "hunting_rifle", "shotgun", "assault_rifle", "fire_axe", "chainsaw", "grenade_launcher", "gas_torch", "flamethrower"]); // Stories 5.5, 5.4
    expect(run(s, { type: "close" }).s.open).toBe(false);
  });

  it("sync with the same values returns the same object (no re-render)", () => {
    const s = opened();
    expect(shopStep(s, { type: "sync", wallet: 250, slots: ["pistol", null] }).state).toBe(s);
  });

  it("a tap with an empty second slot buys at once (one effect) and disables further taps until the answer", () => {
    const { s, effects } = run(opened(), { type: "buy", weapon: "smg" }, { type: "buy", weapon: "machete" }, { type: "buy", weapon: "smg" });
    expect(effects).toEqual([{ type: "buy", weapon: "smg", slot: null }]);
    expect(s.pending).toBe("smg");
    const after = run(s, { type: "answer", answer: { ok: true, weapon: "smg", slot: 1 } });
    expect(after.s).toMatchObject({ pending: null, refused: false });
    expect(after.s.message).toMatch(/Bought/);
  });

  it("a late answer for an earlier purchase doesn't unlock a newer pending one (3.3 review)", () => {
    const { s } = run(opened(), { type: "buy", weapon: "machete" });
    const timedOut = { ...s, pending: null, pendingAtMs: 0 }; // after the 3 s timeout
    const second = run(timedOut, { type: "buy", weapon: "smg" }).s;
    expect(second.pending).toBe("smg");
    const late = run(second, { type: "answer", answer: { ok: true, weapon: "machete", slot: 1 } }).s;
    expect(late.pending).toBe("smg"); // still waiting for the SMG's answer
    expect(late.message).toMatch(/Bought/);
  });

  it("shopAllowed: only in a build, with a run on screen, no menu, no stress run, not leaving (3.3 review)", () => {
    const ok = { phase: "build", running: true, gameOver: false, menuOpen: false, stressMode: false, leaving: false };
    expect(shopAllowed(ok)).toBe(true);
    for (const bad of [{ phase: "wave" }, { running: false }, { gameOver: true }, { menuOpen: true }, { stressMode: true }, { leaving: true }]) {
      expect(shopAllowed({ ...ok, ...bad })).toBe(false);
    }
  });

  it("a refusal shows Not enough money; nothing else changes", () => {
    const { s } = run(opened(["pistol", null], 100), { type: "buy", weapon: "smg" }, { type: "answer", answer: { ok: false, weapon: "smg", error: "insufficient_funds" } });
    expect(s).toMatchObject({ message: "Not enough money", refused: true, pending: null, wallet: 100, slots: ["pistol", null] });
  });

  it("both slots full: Replace which? then the chosen slot is sent; Cancel sends nothing", () => {
    const full = opened(["pistol", "machete"], 1000);
    const asked = run(full, { type: "buy", weapon: "hunting_rifle" });
    expect(asked.effects).toEqual([]);
    expect(asked.s.choosing).toBe("hunting_rifle");
    expect(run(asked.s, { type: "cancel" })).toMatchObject({ effects: [], s: { choosing: null, pending: null } });
    const chosen = run(asked.s, { type: "slot", slot: 0 }, { type: "slot", slot: 1 });
    expect(chosen.effects).toEqual([{ type: "buy", weapon: "hunting_rifle", slot: 0 }]);
    expect(chosen.s).toMatchObject({ choosing: null, pending: "hunting_rifle" });
  });

  it("owned weapons and unknown ids do nothing", () => {
    expect(run(opened(), { type: "buy", weapon: "pistol" }, { type: "buy", weapon: "rocket" }).effects).toEqual([]);
  });

  it("Story 5.16: the shop has no buildings: no list, no building action, no placement effect", () => {
    const s = opened();
    expect(Object.keys(s)).not.toContain("buildings");
    // A building id sent as a shop action (an old client path) is not a shop action any more: nothing happens.
    const { s: after, effects } = run(s, { type: "building", id: "wood_barricade" } as unknown as ShopInput);
    expect(effects).toEqual([]);
    expect(after.open).toBe(true);
  });

  it("nothing happens while closed (taps, answers)", () => {
    const { s, effects } = run(CLOSED_SHOP, { type: "buy", weapon: "smg" }, { type: "answer", answer: { ok: true, weapon: "smg", slot: 1 } });
    expect(effects).toEqual([]);
    expect(s).toBe(CLOSED_SHOP);
  });

  it("a pending purchase without an answer is given up after the timeout; a later buy starts a fresh clock", () => {
    let s = run(opened(), { type: "buy", weapon: "smg" }).s;
    s = run(s, { type: "time", nowMs: 1000 }, { type: "time", nowMs: 1000 + SHOP_PENDING_TIMEOUT_MS - 1 }).s;
    expect(s.pending).toBe("smg");
    s = run(s, { type: "time", nowMs: 1000 + SHOP_PENDING_TIMEOUT_MS }).s;
    expect(s.pending).toBeNull();
    s = run(s, { type: "buy", weapon: "machete" }, { type: "time", nowMs: 9000 }).s;
    expect(s.pending).toBe("machete");
    expect(s.pendingAtMs).toBe(9000);
  });

  it("an answer after an earlier answer resets the clock (no instant timeout for the next buy)", () => {
    let s = run(opened(), { type: "buy", weapon: "smg" }, { type: "time", nowMs: 100 }).s;
    s = run(s, { type: "answer", answer: { ok: false, weapon: "smg", error: "insufficient_funds" } }).s;
    s = run(s, { type: "buy", weapon: "machete" }, { type: "time", nowMs: 100 + SHOP_PENDING_TIMEOUT_MS * 2 }).s;
    expect(s.pending).toBe("machete");
  });

  it("error texts", () => {
    expect(shopErrorText("insufficient_funds")).toBe("Not enough money");
    expect(shopErrorText("not_build")).toBe("The shop is closed");
    expect(shopErrorText("already_owned")).toBe("You already have it");
    expect(shopErrorText("unknown_player")).toBe("Can't buy that");
  });
});

describe("shopStep upgrades (Story 5.1, F1)", () => {
  const balance = loadBalance();
  const prices = upgradePriceTable(balance);
  const openUp = (slots: readonly [string, string | null], levels: readonly [number, number], wallet = 500) =>
    run(CLOSED_SHOP, { type: "open", weapons, upgradePrices: prices, maxLevel: 4 }, { type: "sync", wallet, slots, levels }).s;

  it("rows follow my slots (slot 0 first) with the shown price; a weapon I don't own has no row", () => {
    const s = openUp(["pistol", "smg"], [1, 2]);
    expect(upgradeRows(s)).toEqual([
      { weapon: "pistol", slot: 0, level: 1, price: 60 },
      { weapon: "smg", slot: 1, level: 2, price: 120 },
    ]);
    expect(upgradeRows(openUp(["machete", null], [3, 0]))).toEqual([{ weapon: "machete", slot: 0, level: 3, price: 90 }]);
  });

  it("upgrade pending until the answer: one effect per tap, a second tap sends nothing", () => {
    const { s, effects } = run(openUp(["pistol", "smg"], [1, 1]), { type: "upgrade", weapon: "smg" }, { type: "upgrade", weapon: "smg" }, { type: "upgrade", weapon: "pistol" }, { type: "buy", weapon: "machete" });
    expect(effects).toEqual([{ type: "upgrade", weapon: "smg" }]);
    expect(s.pending).toBe(upgradeKey("smg"));
    // A buy answer for something else doesn't unlock it; the upgrade answer does, with its text.
    const late = run(s, { type: "answer", answer: { ok: true, weapon: "smg", slot: 1 } }).s;
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
    const s = run(openUp(["pistol", "smg"], [1, 3]), { type: "buy", weapon: "machete" }).s;
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

describe("shopStep gear (Story 5.11, AC 1/3/8)", () => {
  const b = loadBalance();
  const gear = shopGear(b);
  const open = (gearMask = 0, wallet = 500) => run(CLOSED_SHOP, { type: "open", weapons, gear }, { type: "sync", wallet, slots: ["pistol", null], gearMask }).s;
  const ok = (item: string): ShopInput => ({ type: "answer", answer: { kind: "item", ok: true, item } });

  it("lists the 4 shop items (no flashlight); owned / covered rows are Owned, armor II notes the replacement", () => {
    expect(gearRows(open()).map((r) => r.id)).toEqual(["body_armor_1", "body_armor_2", "running_shoes", "revive_kit"]);
    const withI = gearRows(open(1));
    expect(withI.map((r) => r.owned)).toEqual([true, false, false, false]);
    expect(withI[1]?.note).toBe(SHOP_TEXT.replacesArmor1);
    const withII = gearRows(open(2));
    expect(withII.map((r) => [r.owned, r.covered])).toEqual([
      [true, true],
      [true, false],
      [false, false],
      [false, false],
    ]);
    expect(withII[0]?.note).toBe(SHOP_TEXT.coveredByArmor2);
    expect(gearRows(open(0, 100)).map((r) => r.short)).toEqual([true, true, true, true]);
  });

  it("buy → pending (one effect; a double tap sends nothing) → bought answer → still pending until the state shows the bit", () => {
    const r = run(open(), { type: "item", item: "running_shoes" }, { type: "item", item: "running_shoes" }, { type: "item", item: "revive_kit" });
    expect(r.effects).toEqual([{ type: "item", item: "running_shoes" }]);
    expect(r.s.pending).toBe(itemKey("running_shoes"));
    const answered = run(r.s, ok("running_shoes")).s;
    expect(answered.message).toBe("Bought Running shoes");
    expect(answered.pending).toBe(itemKey("running_shoes")); // the state doesn't show it yet
    expect(answered.awaitGear).toBe(4);
    const synced = run(answered, { type: "sync", wallet: 350, slots: ["pistol", null], gearMask: 4 }).s;
    expect(synced.pending).toBeNull();
    expect(gearRows(synced).find((x) => x.id === "running_shoes")?.owned).toBe(true);
  });

  it("the state first (patch before the answer) unlocks too; the late answer only shows its text", () => {
    const r = run(open(), { type: "item", item: "body_armor_1" }, { type: "sync", wallet: 350, slots: ["pistol", null], gearMask: 1 });
    expect(r.s.pending).toBeNull();
    expect(run(r.s, ok("body_armor_1")).s.pending).toBeNull();
  });

  it("refused: text, unlocked, nothing owned; timeout gives the buttons back; owned rows send nothing", () => {
    const refused = run(open(), { type: "item", item: "revive_kit" }, { type: "answer", answer: { kind: "item", ok: false, item: "revive_kit", error: "insufficient_funds" } }).s;
    expect([refused.pending, refused.refused, refused.message, refused.gearMask]).toEqual([null, true, "Not enough money", 0]);
    const timed = run(open(), { type: "item", item: "revive_kit" }, { type: "time", nowMs: 1000 }, { type: "time", nowMs: 1000 + SHOP_PENDING_TIMEOUT_MS }).s;
    expect(timed.pending).toBeNull();
    expect(run(open(2), { type: "item", item: "body_armor_1" }).effects).toEqual([]); // covered by II
    expect(run(open(4), { type: "item", item: "running_shoes" }).effects).toEqual([]);
    expect(run(open(), { type: "item", item: "tactical_flashlight" }).effects).toEqual([]); // not listed
  });
});

describe("shopStep consumables (Story 5.12, AC 2)", () => {
  const consumables = shopConsumables(loadBalance());
  const open = (slotItem: string | null = null, slotCount = 0, wallet = 500) =>
    run(CLOSED_SHOP, { type: "open", weapons, consumables }, { type: "sync", wallet, slots: ["pistol", null], slotItem, slotCount }).s;
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
