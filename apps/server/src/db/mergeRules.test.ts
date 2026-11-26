import { getTableColumns } from "drizzle-orm";
import { PROGRESSION, findUnlock, trainingSpent } from "@topdown/shared";
import { describe, expect, it } from "vitest";
import { ACCOUNT_TABLE_MERGES, MERGE_RULES, mergeProgress, type MergeRow } from "../meta/merge";
import * as schema from "./schema";
import { progress } from "./schema";

/** Story 7.6 (AC 6, A2; D1, D2, D11): the merge-writers list and the merge rules. */
const row = (o: Partial<MergeRow> & { accountId: string }): MergeRow => ({
  supplies: 0,
  lifetimeSupplies: 0,
  unlocks: [],
  training: {},
  districts: [],
  updatedAt: new Date(0),
  look: null,
  cosmetics: [],
  stats: { revives: 0, kills: 0, barricades: 0, runs: 0 },
  ...o,
});

describe("merge-writers list (Story 7.6 AC 6)", () => {
  it("every progress column (read from the Drizzle schema) has a merge rule, and no rule names a missing column", () => {
    const columns = Object.keys(getTableColumns(progress)).sort();
    expect(columns.length).toBeGreaterThanOrEqual(7); // liveness: the schema really was read
    expect(Object.keys(MERGE_RULES).sort()).toEqual(columns);
  });

  it("a column with no rule makes the merge throw (never silently dropped)", () => {
    expect(() => mergeProgress(row({ accountId: "a", savedRun: ["x"] }), row({ accountId: "g" }))).toThrow(/progress\.savedRun has no merge rule/); // a future column (7.11 gave cosmetics its rule)
  });
});

describe("Review M6: every table keyed by an account has a merge rule", () => {
  it("tables with an accountId column (read from the Drizzle schema) are all in ACCOUNT_TABLE_MERGES", () => {
    const keyed = Object.entries(schema)
      .filter(([, t]) => typeof t === "object" && t !== null && Symbol.for("drizzle:IsDrizzleTable") in (t as object))
      .filter(([, t]) => "accountId" in getTableColumns(t as never))
      .map(([name]) => name)
      .sort();
    expect(keyed).toContain("savedRunPlayers"); // liveness
    expect(Object.keys(ACCOUNT_TABLE_MERGES).sort()).toEqual(keyed);
  });
});

describe("mergeProgress (Story 7.6 A2)", () => {
  it("A2: the story's example: unlocks joined, 400 + 120 + 100 (mine refunded) + 150 (guest's HP 1+2) = 770, lifetime added, HP 3", () => {
    const mine = findUnlock("mine")?.price;
    expect(mine).toBe(100); // the example's price is the server's
    expect(PROGRESSION.training.costPerLevel).toBe(50);
    const account = row({ accountId: "a", supplies: 400, lifetimeSupplies: 900, unlocks: ["mine", "chainsaw"], training: { max_hp: 3 }, districts: ["downtown"] });
    const guest = row({ accountId: "g", supplies: 120, lifetimeSupplies: 300, unlocks: ["mine"], training: { max_hp: 2 }, districts: ["harbor"] });
    const { row: out, refunds } = mergeProgress(account, guest, PROGRESSION, new Date(5));
    expect(out.accountId).toBe("a");
    expect(new Set(out.unlocks)).toEqual(new Set(["mine", "chainsaw"]));
    expect(out.supplies).toBe(770);
    expect(out.lifetimeSupplies).toBe(1200);
    expect(out.training).toEqual({ max_hp: 3 });
    expect(new Set(out.districts)).toEqual(new Set(["downtown", "harbor"]));
    expect(out.updatedAt).toEqual(new Date(5));
    expect(refunds).toEqual({ unlocks: { mine: 100 }, training: { max_hp: 150 }, total: 250 });
  });

  it("D2: the guest's higher level wins and the ACCOUNT's spend is refunded; a boost only one side has is kept with no refund", () => {
    const { row: out, refunds } = mergeProgress(row({ accountId: "a", training: { damage: 1, reload: 4 } }), row({ accountId: "g", training: { damage: 4, start_money: 2 } }));
    expect(out.training).toEqual({ damage: 4, reload: 4, start_money: 2 });
    expect(refunds.training).toEqual({ damage: trainingSpent(1) });
    expect(out.supplies).toBe(50);
  });

  it("beat the rule 2: merged Supplies never exceed both sides' Supplies plus everything they spent (no Supplies from nothing)", () => {
    const prices = PROGRESSION.unlocks.map((u) => u.id);
    for (let i = 0; i < 200; i++) {
      const pick = (seed: number) => prices.filter((_, k) => (seed >> k) & 1);
      const lvl = (seed: number) => ({ max_hp: seed % 6, damage: (seed >> 3) % 6, reload: (seed >> 5) % 7 /* 6 = out of range */ });
      const a = row({ accountId: "a", supplies: i * 7, unlocks: pick(i * 2654435761), training: lvl(i * 31) });
      const g = row({ accountId: "g", supplies: i * 3, unlocks: pick(i * 40503), training: lvl(i * 17 + 5) });
      const spent = (r: MergeRow) => r.unlocks.reduce((s, id) => s + (findUnlock(id)?.price ?? 0), 0) + Object.values(r.training).reduce((s, l) => s + trainingSpent(l), 0);
      const { row: out } = mergeProgress(a, g);
      const keptValue = out.unlocks.reduce((s, id) => s + (findUnlock(id)?.price ?? 0), 0) + Object.values(out.training).reduce((s, l) => s + trainingSpent(l), 0);
      // What the account holds after (Supplies + the value of what it owns) equals exactly what both sides had.
      expect(out.supplies + keptValue).toBe(a.supplies + g.supplies + spent(a) + spent(g));
    }
  });

  it("7.9/7.10 look: the account's look is kept unless it is the default (null), then the guest's", () => {
    expect(mergeProgress(row({ accountId: "a", look: "t1h2" }), row({ accountId: "g", look: "t3h4" })).row.look).toBe("t1h2");
    expect(mergeProgress(row({ accountId: "a", look: null }), row({ accountId: "g", look: "t3h4" })).row.look).toBe("t3h4");
    expect(mergeProgress(row({ accountId: "a", look: null }), row({ accountId: "g", look: null })).row.look).toBeNull();
  });

  it("7.11 / 7.12 / 7.7: owned parts and districts joined, lifetime stats added per key (garbage counts 0)", () => {
    const out = mergeProgress(
      row({ accountId: "a", cosmetics: ["head:fire", "pack:cat"], stats: { revives: 20, kills: 900, barricades: 50, runs: 12 }, districts: ["district_2"] }),
      row({ accountId: "g", cosmetics: ["pack:cat", "head:riot"], stats: { revives: 6, kills: 150, barricades: -3, runs: "x" }, districts: ["district_2"] }),
    ).row;
    expect(new Set(out.cosmetics as string[])).toEqual(new Set(["head:fire", "pack:cat", "head:riot"]));
    expect(out.cosmetics).toHaveLength(3);
    expect(out.stats).toEqual({ revives: 26, kills: 1050, barricades: 50, runs: 12 });
    expect(out.districts).toEqual(["district_2"]);
  });

  it("garbage in a stored row (non-strings, negative or fractional levels) is dropped, never refunded", () => {
    const { row: out, refunds } = mergeProgress(
      row({ accountId: "a", unlocks: ["mine", 7 as unknown as string], training: { max_hp: -2, damage: 1.5 } }),
      row({ accountId: "g", unlocks: ["mine", "mine"], training: { max_hp: 9 } }),
    );
    expect(out.unlocks).toEqual(["mine"]);
    expect(out.training).toEqual({ max_hp: 9 });
    expect(refunds.total).toBe(100); // mine only; max_hp 9 > maxLevel and the account's -2 refund nothing
  });
});
