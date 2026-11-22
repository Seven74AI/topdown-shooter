import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { createWorld } from "../core/world";
import { addPlayer } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { buildingStats, footprint, type Box } from "../buildings/buildings";
import { botBuildPhase, botPlaceCandidate, botPlaceTries, botShopNext, botWeaponSlot, createBotShopResult, type BotShopSelf } from "./botShop";

const balance = loadBalance();
const none = () => 0;
const self = (wallet: number, weapon1 = "", active = 0, weapon0 = "pistol"): BotShopSelf => ({ wallet, weapon0, weapon1, active });

describe("botShopNext (Story 3.10): the shopping list in order", () => {
  const list = ["smg", "wood_barricade", "wood_barricade", "auto_turret"];

  it("buys the first entry it can pay; saves up (stops) at the first it can't", () => {
    expect(botShopNext(balance, self(250), none, list)).toBe(0); // SMG 200
    expect(botShopNext(balance, self(150), none, list)).toBe(-1); // can't pay the SMG: no barricade instead
  });

  it("skips weapons it holds, and counts building entries (listed twice = own two)", () => {
    const owned = (n: number) => (t: string) => (t === "wood_barricade" ? n : 0);
    expect(botShopNext(balance, self(100, "smg"), owned(0), list)).toBe(1);
    expect(botShopNext(balance, self(100, "smg"), owned(1), list)).toBe(2);
    expect(botShopNext(balance, self(100, "smg"), owned(2), list)).toBe(-1); // turret 250: saving up
    expect(botShopNext(balance, self(300, "smg"), owned(2), list)).toBe(3);
    expect(botShopNext(balance, self(300, "smg", 1, "pistol"), (t) => (t === "auto_turret" ? 1 : 2), list)).toBe(-1); // all done
  });

  it("skips entries tried and failed this build (skip mask) and ids the shop doesn't sell", () => {
    expect(botShopNext(balance, self(500, "smg"), none, ["ghost", "wood_barricade"])).toBe(1);
    expect(botShopNext(balance, self(500, "smg"), none, list, 1 << 1)).toBe(2);
  });

  it("botWeaponSlot: the empty second slot first, else the one not in hands", () => {
    expect(botWeaponSlot(self(0))).toBeNull();
    expect(botWeaponSlot(self(0, "smg", 0))).toBe(1);
    expect(botWeaponSlot(self(0, "smg", 1))).toBe(0);
  });
});

describe("botPlaceCandidate", () => {
  it("offers 8 directions per radius, the long side facing the bot, then runs out", () => {
    const out = { gx: 0, gy: 0, rot: 0 };
    const stats = buildingStats(balance, "wood_barricade");
    if (!stats) throw new Error("no barricade");
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const n = botPlaceTries(balance);
    expect(n).toBe(8 * balance.bots.buildRadiiM.length);
    for (let a = 0; a < n; a++) {
      expect(botPlaceCandidate(balance, "wood_barricade", 24, 16, a, out)).toBe(true);
      footprint(stats, out.gx, out.gy, out.rot, box);
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      const r = balance.bots.buildRadiiM[Math.floor(a / 8)] as number;
      expect(Math.abs(Math.hypot(cx - 24, cy - 16) - r)).toBeLessThan(0.6); // snapped to the 0.5 m lattice
      if (a % 8 === 0) expect(out.rot).toBe(1); // east: turned, so the 2 m side faces the bot
      if (a % 8 === 2) expect(out.rot).toBe(0); // south
    }
    expect(botPlaceCandidate(balance, "wood_barricade", 24, 16, n, out)).toBe(false);
    expect(botPlaceCandidate(balance, "ghost", 24, 16, 0, out)).toBe(false);
  });
});

describe("botBuildPhase (headless bots)", () => {
  function world(wallet: number) {
    const w = createWorld({ balance, seed: 1 });
    const p = addPlayer(w, "p0", 24, 16);
    p.wallet = wallet;
    startBuild(w);
    return { w, p };
  }

  it("buys through the real shop and places through the real rules, then taps Ready", () => {
    const { w, p } = world(600);
    const r = botBuildPhase(w, "p0", ["smg", "wood_barricade", "wood_barricade", "auto_turret"], createBotShopResult());
    expect(r.bought).toEqual(["smg"]);
    expect(r.weapons).toBe(1);
    expect(r.buildings).toBe(3);
    expect(r.spent).toBe(200 + 40 + 40 + 250);
    expect(p.wallet).toBe(600 - 530);
    expect(p.loadout.slots[1]?.weapon).toBe("smg");
    expect(r.swap).toBe(true); // the SMG is in slot 2, the Pistol in hands
    expect(w.buildings.list.map((b) => b.type)).toEqual(["wood_barricade", "wood_barricade", "auto_turret"]);
    expect(p.buildReady).toBe(true);
  });

  it("two weapons in one build: the second replaces the Pistol, not the weapon just bought", () => {
    const { w, p } = world(600);
    const r = botBuildPhase(w, "p0", ["smg", "hunting_rifle"], createBotShopResult());
    expect(r.bought).toEqual(["smg", "hunting_rifle"]);
    expect(p.loadout.slots.map((s) => s?.weapon)).toEqual(["hunting_rifle", "smg"]);
    expect(r.swap).toBe(false); // the rifle (the last bought) is already in hands
  });

  it("does nothing outside a build phase", () => {
    const { w, p } = world(600);
    startWave(w);
    const r = botBuildPhase(w, "p0", ["smg"], createBotShopResult());
    expect(r.weapons).toBe(0);
    expect(p.wallet).toBe(600);
  });

  it("moves on when an entry can't be placed (the 6-building cap): the next entry is still bought", () => {
    const { w, p } = world(1000);
    const list = [...Array.from({ length: 7 }, () => "wood_barricade"), "smg"];
    const r = botBuildPhase(w, "p0", list, createBotShopResult());
    expect(r.buildings).toBe(balance.buildings.maxPerPlayer);
    expect(r.bought).toEqual(["smg"]); // the 7th barricade was skipped, the SMG after it bought
    expect(p.wallet).toBe(1000 - 6 * 40 - 200);
  });
});
