/**
 * Story 7.5 (T1, T2; decisions 7.5 D1, D2, D4): Training is small and capped, applies in full and only to its owner.
 */
import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { PROGRESSION, loadProgression } from "../config/progression";
import { createWorld } from "../core/world";
import { addPlayer } from "../player/player";
import { buyGear } from "../economy/gear";
import { startBuild } from "../run/runStateMachine";
import { playerWeaponDamage, reloadSecondsFor, weaponDamage, weaponIds } from "../combat/weapons";
// The source checks (no stray weaponDamage call, no team-average path, the five reload sites) are in
// tools/checks/progressionWiring.test.ts (they read files: node types live in the tools project).
import { ticksFor } from "../core/time";
import { clampLevel, damageMul, levelsFromProgress, reloadTicksFor, trainedMaxHp, trainedStartMoney, trainingCost } from "./training";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };

describe("T1 Training is small and capped", () => {
  it("max HP 102/104/106/108/110; money 210…250; damage × 1.01…1.05; costs 50…250; level 6 clamps to 5", () => {
    expect([1, 2, 3, 4, 5].map((l) => trainedMaxHp(balance, l))).toEqual([102, 104, 106, 108, 110]);
    expect([0, 1, 2, 3, 4, 5].map((l) => trainedStartMoney(balance, l))).toEqual([200, 210, 220, 230, 240, 250]);
    expect([1, 2, 3, 4, 5].map((l) => damageMul(l))).toEqual([1.01, 1.02, 1.03, 1.04, 1.05]);
    expect([1, 2, 3, 4, 5].map((l) => trainingCost(l))).toEqual([50, 100, 150, 200, 250]);
    expect([1, 2, 3, 4, 5].reduce((a: number, l: number) => a + trainingCost(l), 0) * 4).toBe(3000);
    expect(clampLevel(6)).toBe(5);
    expect(trainedMaxHp(balance, 6)).toBe(110);
    expect(levelsFromProgress({ max_hp: 9, damage: -2, start_money: "x", reload: 2.7 })).toEqual({ maxHp: 5, damage: 0, startMoney: 0, reload: 2 });
  });

  it("the reload tick table for every ammo weapon at levels 0–5 (decision 7.5 D4: rounded to whole ticks)", () => {
    const table: Record<string, number[]> = {};
    for (const id of weaponIds(balance)) {
      const w = balance.weapons[id] as { reloadS?: number };
      if (typeof w.reloadS !== "number") continue;
      table[id] = [0, 1, 2, 3, 4, 5].map((l) => reloadTicksFor(w.reloadS as number, l));
      expect(table[id]?.[0]).toBe(ticksFor(w.reloadS));
      for (let l = 1; l <= 5; l++) expect((table[id] as number[])[l]).toBeLessThanOrEqual((table[id] as number[])[l - 1] as number);
    }
    // 1.0 s (pistol) = 20 ticks: 1 % = 19.8 → 20; 3 % = 19.4 → 19; 5 % = 19.
    expect(table.pistol).toEqual([20, 20, 20, 19, 19, 19]);
    expect(Object.keys(table).length).toBeGreaterThan(4);
  });

  it("the progression schema refuses a training block out of order or with both pct and perLevel", () => {
    const t = PROGRESSION.training;
    const base = { ...PROGRESSION };
    expect(() => loadProgression({ ...base, training: { ...t, boosts: [...t.boosts].reverse() } })).toThrow();
    expect(() => loadProgression({ ...base, training: { ...t, boosts: t.boosts.map((b) => ({ ...b, perLevel: 1, pctPerLevel: 1 })) } })).toThrow();
  });

  it("Training numbers are part of the balance version (decision 7.5 D3)", () => {
    expect(balance.version).not.toBe("bbdd6c4d"); // the pre-7.5 version: bumped once
  });
});

describe("T2 it always applies in full, and only to me", () => {
  it("p0 at 5/5/5/5, p1 at 0: p0 trained, p1 untouched", () => {
    const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const p0 = addPlayer(world, "p0", 10, 10, { training: { maxHp: 5, damage: 5, startMoney: 5, reload: 5 } });
    const p1 = addPlayer(world, "p1", 12, 10);
    expect([p0.maxHp, p0.hp, p0.wallet]).toEqual([110, 110, 250]);
    expect([p1.maxHp, p1.hp, p1.wallet]).toEqual([100, 100, 200]);
    expect(playerWeaponDamage(balance, p0, "smg", 1)).toBeCloseTo(weaponDamage(balance, "smg", 1) * 1.05, 10);
    expect(playerWeaponDamage(balance, p1, "smg", 1)).toBe(weaponDamage(balance, "smg", 1));
    const stats = { reloadS: 2.5 };
    expect(reloadSecondsFor(p0, stats)).toBeCloseTo(2.375, 10);
    expect(reloadSecondsFor(p1, stats)).toBe(2.5);
  });

  it("level 0 keeps the 5.1 damage table exactly (every weapon × level)", () => {
    for (const id of weaponIds(balance)) for (let l = 1; l <= 4; l++) expect(playerWeaponDamage(balance, { trainDmg: 0 }, id, l)).toBe(weaponDamage(balance, id, l));
    expect(playerWeaponDamage(balance, null, "smg", 2)).toBe(weaponDamage(balance, "smg", 2)); // an owner who left
  });

  it("armor adds on top, unscaled (decision 7.5 D1): Training 5 + Armor II = 160; Training 3 + Armor I bought mid-run = 131", () => {
    const world = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const a = addPlayer(world, "p0", 10, 10, { training: { maxHp: 5, damage: 0, startMoney: 0, reload: 0 } });
    const b = addPlayer(world, "p1", 12, 10, { training: { maxHp: 3, damage: 0, startMoney: 0, reload: 0 } });
    startBuild(world);
    a.wallet = b.wallet = 10_000;
    expect(buyGear(world, "p0", "body_armor_2").ok).toBe(true);
    expect(a.maxHp).toBe(160);
    expect(buyGear(world, "p1", "body_armor_1").ok).toBe(true);
    expect(b.maxHp).toBe(131);
  });

});
