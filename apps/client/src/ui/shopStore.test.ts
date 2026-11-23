import { describe, expect, it } from "vitest";
import { loadBalance, shopWeapons, upgradePriceTable, type ShopBuilding } from "@topdown/shared";
import {
  CLOSED_SHOP,
  SHOP_PENDING_TIMEOUT_MS,
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
const buildings: ShopBuilding[] = [{ id: "wood_barricade", name: "Wood Barricade", price: 40 }];

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
  run(CLOSED_SHOP, { type: "open", weapons, buildings }, { type: "sync", wallet, slots }).s;

describe("shopStep (Story 3.3)", () => {
  it("opens with the items, syncs wallet and slots, closes", () => {
    const s = opened();
    expect(s).toMatchObject({ open: true, wallet: 250, slots: ["pistol", null], pending: null, message: "" });
    expect(s.weapons.map((w) => w.id)).toEqual(["pistol", "machete", "smg", "hunting_rifle", "shotgun", "assault_rifle"]);
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

  it("a building starts placement (3.4 contract) and closes the shop; never a purchase", () => {
    const { s, effects } = run(opened(), { type: "building", id: "wood_barricade" });
    expect(effects).toEqual([{ type: "startPlacement", id: "wood_barricade" }]);
    expect(s.open).toBe(false);
    expect(run(opened(), { type: "building", id: "nope" }).effects).toEqual([]);
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
    run(CLOSED_SHOP, { type: "open", weapons, buildings, upgradePrices: prices, maxLevel: 4 }, { type: "sync", wallet, slots, levels }).s;

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
    const done = run(s, { type: "answer", answer: { kind: "upgrade", ok: true, weapon: "smg", slot: 1, level: 2 } }, { type: "sync", wallet: 380, slots: ["pistol", "smg"], levels: [1, 2] });
    expect(done.s).toMatchObject({ pending: null, message: "smg upgraded to II", refused: false, wallet: 380, levels: [1, 2] });
    const refused = run(s, { type: "answer", answer: { kind: "upgrade", ok: false, weapon: "smg", error: "insufficient_funds" } }).s;
    expect(refused).toMatchObject({ pending: null, message: "Not enough money", refused: true });
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
