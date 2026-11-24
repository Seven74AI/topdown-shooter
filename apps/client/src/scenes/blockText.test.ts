import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, bundledBalanceFiles, withOverrides, addBuildingAt, addPlayer, applyDecayStage, legalDecayMasks, blockReason, buildingStats, createWorld, footprint, loadBalance, spawnZombie, type BlockReason, type Box, type MapBox } from "@topdown/shared";
import { COVER_WORDS, SOLID_NAMES, blockText, placementHintText, solidWord } from "./blockText";
import { placeRefusalText } from "./placement";

/** Story 5.17 (AC 3): the reason line's words. */
const balance = loadBalance();
const names = (id: string): string => (id === "p1" ? "Bo" : id);
const reason = (r: Partial<BlockReason>): BlockReason => ({ cause: "off_map", index: -1, id: 0, playerId: "", ...r });

function downtown() {
  const w = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
  return w;
}

/** The first box of a solid (its own rect, shrunk to stay inside), explained on the World. */
function explainSolid(w: ReturnType<typeof downtown>, name: string): string {
  const s = w.obstacles.solids.find((b) => b.name === name);
  if (!s) throw new Error(name);
  const r = blockReason(w, "nobody", { minX: s.minX + 0.01, minY: s.minY + 0.01, maxX: s.minX + 0.02, maxY: s.minY + 0.02 });
  // The spot may also be near a spawn (earlier cause); only check solids reached.
  return r ? blockText(w, r, names) : "clear";
}

describe("blockText (Story 5.17, AC 3)", () => {
  it("says each cause", () => {
    const w = downtown();
    expect(blockText(w, reason({ cause: "off_map" }), names)).toBe("Off the street");
    expect(blockText(w, reason({ cause: "spawn", index: 0 }), names)).toBe("Too close to a zombie spawn (2 m)");
    expect(blockText(w, reason({ cause: "building", id: 3 }), names)).toBe("Overlaps a building");
    expect(blockText(w, reason({ cause: "me", playerId: "p0" }), names)).toBe("You're standing there");
    expect(blockText(w, reason({ cause: "teammate", playerId: "p1" }), names)).toBe("Bo is standing there");
    expect(blockText(w, reason({ cause: "zombie", id: 7 }), names)).toBe("A zombie is in the way");
    expect(blockText(w, reason({ cause: "teammate", playerId: "p2" }), () => "")).toBe("A teammate is standing there");
    // Review M12: the distance comes from balance (buildings.spawnClearM), not a literal.
    const w3 = createWorld({ balance: loadBalance(withOverrides(bundledBalanceFiles(), [["buildings", "spawnClearM", 3]])), seed: 1, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    expect(blockText(w3, reason({ cause: "spawn", index: 0 }), names)).toBe("Too close to a zombie spawn (3 m)");
  });

  it("names Downtown's objects: the bus, a car, the sandbags, the police barrier, a wall", () => {
    const w = downtown();
    applyDecayStage(w, 3, 0); // sandbags and police lines are later-stage cover
    const words = new Set(w.obstacles.solids.map((s, i) => blockText(w, reason({ cause: "solid", index: i }), names)));
    for (const t of ["Blocked by the bus", "Blocked by a car", "Blocked by the sandbags", "Blocked by the police barrier", "Blocked by a wall", "Blocked by a petrol pump"]) expect(words, t).toContain(t);
    expect(explainSolid(w, "city_bus")).toBe("Blocked by the bus");
    expect(explainSolid(w, "sw_diner")).toBe("Blocked by a wall");
    // Every solid has a word; cover goes by kind, unknown names fall back to "a wall".
    for (const s of w.obstacles.solids) expect(solidWord(s)).toMatch(/^(a|the) |^rubble$/);
    expect(solidWord({ name: "mystery_box", minX: 0, minY: 0, maxX: 1, maxY: 1 })).toBe("a wall");
    expect(solidWord({ name: "x", kind: "sandbags", minX: 0, minY: 0, maxX: 1, maxY: 1 } as MapBox)).toBe(COVER_WORDS.sandbags);
    expect(solidWord(undefined)).toBe("a wall");
    expect(SOLID_NAMES.city_bus).toBe("the bus");
  });

  it("Story 6.2 (F3): every rubble box at stage 4 reads \"Blocked by rubble\" (one prefix rule)", () => {
    const w = downtown();
    applyDecayStage(w, 4, legalDecayMasks(DOWNTOWN_MAP)[0] as number);
    const rubble = w.obstacles.solids.map((s, i) => ({ s, i })).filter(({ s }) => s.name.startsWith("rubble_"));
    expect(rubble.length).toBeGreaterThanOrEqual(4); // 3 piles + the alley (liveness)
    for (const { i } of rubble) expect(blockText(w, reason({ cause: "solid", index: i }), names)).toBe("Blocked by rubble");
    expect(solidWord({ name: "rubble_pile_9", minX: 0, minY: 0, maxX: 1, maxY: 1 })).toBe("rubble");
  });

  it("cap and money come before the spot (5.16's texts); other errors fall back to the 3.4 text", () => {
    const w = downtown();
    const c = { price: 250, wallet: 180, nameOf: names, refusal: (e: Parameters<typeof placeRefusalText>[0]) => placeRefusalText(e, balance) };
    expect(placementHintText(w, "limit", null, c)).toBe("Building limit reached (6)");
    expect(placementHintText(w, "money", null, c)).toBe("Need $250 (you have $180)");
    expect(placementHintText(w, "blocked", reason({ cause: "teammate", playerId: "p1" }), c)).toBe("Bo is standing there");
    expect(placementHintText(w, "blocked", null, c)).toBe("Can't build here");
    expect(placementHintText(w, "not_build_phase", null, c)).toBe("Only during the build phase");
  });

  it("a real World: teammate, zombie and building reasons from blockReason read right", () => {
    const w = downtown();
    const at = (x: number, y: number): Box => ({ minX: x - 0.5, minY: y - 0.5, maxX: x + 0.5, maxY: y + 0.5 });
    // Four clear 1 m spots on the empty World (no spawn circle, no map box), 3 m apart.
    const clear: { x: number; y: number }[] = [];
    for (let y = 2; y < 30 && clear.length < 4; y += 3) for (let x = 2; x < 46 && clear.length < 4; x += 3) if (!blockReason(w, "p0", at(x, y)) && !blockReason(w, "p0", { minX: x - 1, minY: y - 1, maxX: x + 1, maxY: y + 1 })) clear.push({ x, y });
    const [a, b, c, d] = clear as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    addPlayer(w, "p0", a.x, a.y);
    addPlayer(w, "p1", b.x, b.y);
    const say = (b: Box): string => {
      const r = blockReason(w, "p0", b);
      return r ? blockText(w, r, names) : "clear";
    };
    expect(say(at(a.x, a.y))).toBe("You're standing there");
    expect(say(at(b.x, b.y))).toBe("Bo is standing there");
    spawnZombie(w, "walker", c.x, c.y);
    expect(say(at(c.x, c.y))).toBe("A zombie is in the way");
    const stats = buildingStats(balance, "auto_turret");
    if (!stats) throw new Error("turret");
    const gx = Math.round((d.x - 0.5) * 2);
    const gy = Math.round((d.y - 0.5) * 2);
    addBuildingAt(w, { id: 1, type: "auto_turret", ownerId: "p0", gx, gy, rot: 0, hp: 300 });
    expect(say(footprint(stats, gx, gy, 0, { minX: 0, minY: 0, maxX: 0, maxY: 0 }))).toBe("Overlaps a building");
  });
});
