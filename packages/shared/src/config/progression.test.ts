import { describe, expect, it } from "vitest";
import { loadBalance } from "./balance";
import { PROGRESSION, ProgressionError, loadProgression, starterPool } from "./progression";

const FR79 = [
  "pistol",
  "machete",
  "fire_axe",
  "shotgun",
  "smg",
  "hunting_rifle",
  "body_armor_1",
  "running_shoes",
  "revive_kit",
  "wood_barricade",
  "auto_turret",
  "medkit",
  "grenades",
];

describe("progression.json (Story 7.1)", () => {
  it("starts with exactly the 13 FR79 starter ids", () => {
    expect([...starterPool]).toEqual(FR79);
    expect(PROGRESSION.starterPool).toBe(starterPool);
  });

  it("every starter id exists in weapons / gear / buildings / consumables", () => {
    const b = loadBalance();
    const known = new Set([
      ...Object.keys(b.weapons),
      ...Object.keys(b.gear.items),
      ...Object.keys(b.buildings.types),
      ...Object.keys(b.consumables.items),
    ]);
    const missing = starterPool.filter((id) => !known.has(id));
    expect(missing).toEqual([]);
    expect(starterPool.length).toBe(13);
  });

  it("refuses duplicates, bad ids, extra keys and an empty pool", () => {
    const supplies = PROGRESSION.supplies;
    expect(() => loadProgression({ starterPool: ["pistol", "pistol"], supplies })).toThrow(ProgressionError);
    expect(() => loadProgression({ starterPool: ["Pistol"], supplies })).toThrow(ProgressionError);
    expect(() => loadProgression({ starterPool: [], supplies })).toThrow(ProgressionError);
    expect(() => loadProgression({ starterPool: ["pistol"], supplies, extra: 1 })).toThrow(ProgressionError);
    expect(loadProgression({ starterPool: ["pistol"], supplies, districts: PROGRESSION.districts }).starterPool).toEqual(["pistol"]); // Story 7.7: districts are required
  });

  it("Story 7.2: supplies are the FR78 / D1 / D3 / D5 numbers, integers only, all present", () => {
    expect(PROGRESSION.supplies).toEqual({ perWave: 10, behemoth: 50, extract: 100, perEndlessWave: 20, endlessBehemoth: 50, rookieLift: { belowLifetime: 300, multiplier: 2 } });
    const s = PROGRESSION.supplies;
    expect(() => loadProgression({ starterPool: ["pistol"] })).toThrow(ProgressionError);
    expect(() => loadProgression({ starterPool: ["pistol"], supplies: { ...s, perWave: 10.5 } })).toThrow(ProgressionError);
    expect(() => loadProgression({ starterPool: ["pistol"], supplies: { ...s, extract: -1 } })).toThrow(ProgressionError);
    expect(() => loadProgression({ starterPool: ["pistol"], supplies: { ...s, bonus: 1 } })).toThrow(ProgressionError);
    expect(Object.isFrozen(PROGRESSION.supplies)).toBe(true);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(PROGRESSION)).toBe(true);
    expect(Object.isFrozen(starterPool)).toBe(true);
  });
});
