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
    expect(() => loadProgression({ starterPool: ["pistol", "pistol"] })).toThrow(ProgressionError);
    expect(() => loadProgression({ starterPool: ["Pistol"] })).toThrow(ProgressionError);
    expect(() => loadProgression({ starterPool: [] })).toThrow(ProgressionError);
    expect(() => loadProgression({ starterPool: ["pistol"], extra: 1 })).toThrow(ProgressionError);
    expect(loadProgression({ starterPool: ["pistol"] }).starterPool).toEqual(["pistol"]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(PROGRESSION)).toBe(true);
    expect(Object.isFrozen(starterPool)).toBe(true);
  });
});
