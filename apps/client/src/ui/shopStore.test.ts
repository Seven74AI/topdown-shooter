import { describe, expect, it } from "vitest";
import { loadBalance, shopWeapons, type ShopBuilding } from "@topdown/shared";
import { CLOSED_SHOP, SHOP_PENDING_TIMEOUT_MS, shopAllowed, shopErrorText, shopStep, type ShopInput, type ShopState } from "./shopStore";

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
