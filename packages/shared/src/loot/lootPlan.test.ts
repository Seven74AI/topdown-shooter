import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { createRng } from "../core/rng";
import { createSeedStreams, streamSeed } from "../core/seedStreams";
import { createWorld } from "../core/world";
import { lootKillIndex, makeLootPlan, pickLootVariant } from "./lootPlan";

const balance = loadBalance();

describe("Story 7.12 T1: the loot stream and the run's plan", () => {
  it("B1: 1,000 run seeds → 20 % ± 3 % runs with a planned bag, every wave in 3–10, never endless", () => {
    let has = 0;
    const waves = new Set<number>();
    const looks = new Set<number>();
    for (let seed = 1; seed <= 1000; seed++) {
      const w = createWorld({ balance, seed, loot: { salt: (seed * 2654435761) >>> 0 } });
      const p = w.loot.plan;
      if (!p.has) continue;
      has++;
      waves.add(p.wave);
      looks.add(p.variant);
      expect(p.wave).toBeGreaterThanOrEqual(3);
      expect(p.wave).toBeLessThanOrEqual(10);
      expect(p.wave).toBeLessThanOrEqual(balance.waves.runWaves); // endless (11+) never
      expect(p.killFrac).toBeGreaterThanOrEqual(0);
      expect(p.killFrac).toBeLessThan(1);
      expect(p.itemRoll).toBeGreaterThanOrEqual(0);
      expect(p.itemRoll).toBeLessThan(1);
    }
    expect(has / 1000).toBeGreaterThanOrEqual(0.17);
    expect(has / 1000).toBeLessThanOrEqual(0.23);
    expect([...waves].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]); // liveness: every wave is drawn
    expect([...looks].sort()).toEqual([0, 1, 2, 3, 4]); // all five looks (7-UI-6)
  });

  it("the plan is drawn in the story's order from the loot stream (has, wave, killFrac, itemRoll)", () => {
    for (let seed = 1; seed < 200; seed++) {
      const rng = createRng(streamSeed(seed, "loot"));
      const has = rng.next() < 0.2;
      const p = createWorld({ balance, seed }).loot.plan;
      expect(p.has).toBe(has);
      if (!has) continue;
      expect(p.wave).toBe(rng.int(3, 10));
      expect(p.killFrac).toBe(rng.next());
      expect(p.itemRoll).toBe(rng.next());
    }
  });

  it("same seed + salt → the same plan; another salt → an independent plan", () => {
    const a = createWorld({ balance, seed: 77, loot: { salt: 123 } }).loot.plan;
    const b = createWorld({ balance, seed: 77, loot: { salt: 123 } }).loot.plan;
    expect(b).toEqual(a);
    let differ = 0;
    for (let salt = 1; salt <= 200; salt++) {
      const p = createWorld({ balance, seed: 77, loot: { salt } }).streams.loot.next();
      const q = createWorld({ balance, seed: 77, loot: { salt: salt + 1000 } }).streams.loot.next();
      if (p !== q) differ++;
    }
    expect(differ).toBe(200);
  });

  it("B2: from the public run seed alone a client computes another plan (the salt ≠ 0); other streams don't change", () => {
    let wrong = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const server = createSeedStreams(seed, 0xa5a5a5a5 ^ seed);
      const client = createSeedStreams(seed); // what `RunState.runSeed` + the public code gives
      if (server.loot.next() !== client.loot.next()) wrong++;
      // the salt touches only `loot` (named streams: no other sequence moves)
      expect(server.decay.next()).toBe(client.decay.next());
      expect(server.spawns.next()).toBe(client.spawns.next());
      expect(server.events.next()).toBe(client.events.next());
      expect(server.combat.next()).toBe(client.combat.next());
    }
    expect(wrong).toBe(300);
  });

  it("practice (D2) and mirror Worlds make no plan and draw nothing", () => {
    const w = createWorld({ balance, seed: 5, loot: { off: true } });
    expect(w.loot.plan.has).toBe(false);
    expect(w.streams.loot.getState()).toEqual(createSeedStreams(5).loot.getState());
  });

  it("7-UI-6: the look is never the previous bag's, and every other look comes up", () => {
    const rng = createRng(9);
    for (let prev = 0; prev < 5; prev++) {
      const seen = new Set<number>();
      for (let i = 0; i < 400; i++) {
        const v = pickLootVariant(rng, 5, prev);
        expect(v).not.toBe(prev);
        seen.add(v);
      }
      expect(seen.size).toBe(4);
    }
    const p = makeLootPlan(createRng(1), { ...balance, loot: { ...balance.loot, runChance: 1 } }, 2);
    expect(p.has).toBe(true);
    expect(p.variant).not.toBe(2);
  });

  it("B1: a shorter run (runWaves 6) never plans a bag past its last wave (endless none)", () => {
    const short = loadBalance(withOverrides(bundledBalanceFiles(), [["waves", "runWaves", 6], ["loot", "runChance", 1]]));
    const seen = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) seen.add(createWorld({ balance: short, seed }).loot.plan.wave);
    expect([...seen].sort((a, b) => a - b)).toEqual([3, 4, 5, 6]);
  });

  it("kill index: 1 + floor(killFrac × size), always within the wave", () => {
    expect(lootKillIndex(0, 40)).toBe(1);
    expect(lootKillIndex(0.5, 40)).toBe(21);
    expect(lootKillIndex(0.999999, 40)).toBe(40);
  });
});
