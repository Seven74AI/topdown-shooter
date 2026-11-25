import { describe, expect, it } from "vitest";
import raw from "./milestones.json" with { type: "json" };
import { COSMETICS } from "./cosmetics";
import { loadBalance } from "./balance";
import { MILESTONES, MILESTONE_IDS, MilestonesError, loadMilestones, lootPartKeys, milestonePartKey } from "./milestones";

describe("Stories 7.10 + 7.11: milestones.json", () => {
  it("ten milestones m1…m10, each unlocking exactly one catalogue part (the 7.11 table)", () => {
    expect(MILESTONES.map((m) => m.id)).toEqual([...MILESTONE_IDS]);
    expect(MILESTONE_IDS.map((id) => milestonePartKey(id))).toEqual(["head:fire", "head:riot", "head:gas", "head:hockey", "head:band", "top:camo", "pack:planks", "head:laurel", "head:weld", "pack:golf"]);
    expect(MILESTONES[1]).toMatchObject({ howTo: "Extract from Downtown once", resultLine: "first extraction", rule: { kind: "extracted", district: "downtown" } });
    expect(MILESTONES[3]?.rule).toEqual({ kind: "wave_cleared", n: 15 }); // 7.11 D2: the 5th endless wave
    // review L8: M10's waves are the run's waves (the downs counter stops at runWaves too)
    expect(MILESTONES[9]?.rule).toEqual({ kind: "wave10_never_downed", n: loadBalance().waves.runWaves });
  });

  it("refuses a broken file: a missing / reordered id, an unknown rule, a part count ≠ 1", () => {
    const bad = (f: (j: { milestones: Record<string, unknown>[] }) => void) => {
      const j = JSON.parse(JSON.stringify(raw)) as { milestones: Record<string, unknown>[] };
      f(j);
      return () => loadMilestones(j);
    };
    expect(bad((j) => j.milestones.pop())).toThrow(MilestonesError);
    expect(bad((j) => j.milestones.reverse())).toThrow(/expected m1/);
    expect(bad((j) => ((j.milestones[0] as { rule: unknown }).rule = { kind: "nope" }))).toThrow(MilestonesError);
    expect(bad((j) => ((j.milestones[0] as { extra?: number }).extra = 1))).toThrow(MilestonesError);
    const noFire = { ...COSMETICS, parts: COSMETICS.parts.filter((p) => p.id !== "fire") };
    expect(() => loadMilestones(raw, noFire)).toThrow(/m1 unlocks 0 parts/);
  });

  it("Story 7.12: the ten loot parts in catalogue order", () => {
    expect(lootPartKeys()).toEqual(["top:floral", "head:cone", "head:chef", "head:pot", "head:bunny", "head:viking", "head:prop", "pack:teddy", "pack:cat", "pack:plant"]);
  });
});
