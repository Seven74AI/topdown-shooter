import { describe, expect, it } from "vitest";
import { botInRun } from "./botClient";

/** Story 12.2 review L3: a bot reconnects, watches its line and pings during the extraction too. */
describe("botInRun", () => {
  it("build, wave, vote and extract are in the fight; lobby and results aren't", () => {
    expect(["build", "wave", "vote", "extract"].map(botInRun)).toEqual([true, true, true, true]);
    expect(["lobby", "results", undefined].map(botInRun)).toEqual([false, false, false]);
  });
});
