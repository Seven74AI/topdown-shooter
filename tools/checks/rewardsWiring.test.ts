import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 7.2 (R2): every hookup of the rewards models fails a check when its line is deleted. */
const SRC = join(__dirname, "..", "..", "apps", "client", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("Story 7.2 wiring", () => {
  it("the RunInbox hands run.rewards to the rewards store", () => {
    expect(read("net/session.ts")).toMatch(/onMessage\(S2C\.RUN_REWARDS,[^\n]*receiveRewards/);
    expect(read("net/session.ts")).toMatch(/rewardsStore\.receive\(m\)/);
  });

  it("a Leave goes through leaveAfterRewards (run.leave first, then the consented leave)", () => {
    const lobby = read("net/lobbyStore.ts");
    expect(lobby).toMatch(/else if \(room\) leaveAfterRewards\(room\);/);
    expect(lobby).toMatch(/room\.send\(C2S\.RUN_LEAVE, \{\}\)/);
    expect(lobby).toMatch(/rewardsStore\.receive\(m, true\)/);
  });

  it("Results reads the store and draws the panel from rewardsView", () => {
    const r = read("ui/ResultsScreen.tsx");
    expect(r).toMatch(/rewardsStore\.subscribe\(setRewards\)/);
    expect(r).toMatch(/rewardsView\(rewards, screen\.online, screen\.seed\)/);
    expect(r).toMatch(/<RunRewardsCard view=\{view\}[ /]/); // 7.6 adds the nudge prop
  });

  it("the start screen shows the Leave line (takeLeaveLine) and the vote shows the stakes", () => {
    expect(read("ui/StartScreen.tsx")).toMatch(/rewardsStore\.takeLeaveLine\(\)/);
    expect(read("ui/StartScreen.tsx")).toMatch(/\{banked\}/);
    expect(read("ui/EvacVote.tsx")).toMatch(/\{voteStakesLine\(\)\}/);
  });

  it("re-review RR-L1 / N1: run.started sets the store's run; the Results get this phone's slot", () => {
    expect(read("net/session.ts")).toMatch(/onMessage\(S2C\.RUN_STARTED,[^\n]*receiveRunStarted/);
    expect(read("net/session.ts")).toMatch(/rewardsStore\.setRun\(m\)/);
    expect(read("net/onlineFlow.ts")).toMatch(/const mySlot = deps\.mySlot\?\.\(\);/);
    expect(read("main.ts")).toMatch(/mySlot: \(\) => lobbyStore\.joinedInfo\(\)\?\.slot/);
  });

  it("practice solo Results stay offline (online: false → \"Practice runs don't earn rewards\")", () => {
    expect(read("scenes/GameScene.ts")).toMatch(/kind: "results"[^\n]*online: false/);
  });
});
