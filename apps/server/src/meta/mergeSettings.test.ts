import { describe, expect, it } from "vitest";
import { MERGE_RULES, mergeProgress, type MergeRow } from "./merge";

/** Story 10.1 (AC 6): a guest merged into an account at login: the account's synced settings win unless it has none. */
const row = (settings: unknown): MergeRow => ({ accountId: "a", supplies: 0, lifetimeSupplies: 0, unlocks: [], training: {}, districts: [], updatedAt: new Date(0), settings });

describe("merge rule: progress.settings", () => {
  it("the account's settings are kept; null on the account takes the guest's; both null → null", () => {
    expect(MERGE_RULES.settings({ rain: "off" }, { rain: "light" })).toEqual({ rain: "off" });
    expect(MERGE_RULES.settings(null, { glow: "low" })).toEqual({ glow: "low" });
    expect(MERGE_RULES.settings(null, null)).toBeNull();
    expect(mergeProgress(row(null), row({ sfxVolume: 20 })).row.settings).toEqual({ sfxVolume: 20 });
  });
});
