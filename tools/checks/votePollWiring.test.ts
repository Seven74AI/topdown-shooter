import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 6.14 (6.11 re-review 3, N6): the Game scene must send its votes through `pollVote` (urgent
 * from the server's ticks left and the voters — the step the netsim vote test runs). A call to
 * `voteSend.poll(…)` that bypasses it (urgent never on) passed every scene test.
 */
describe("GameScene paces its votes through pollVote", () => {
  it("the only sender call is pollVote(this.voteSend, …) with the server's ticks left and the voters", () => {
    const src = readFileSync(join(__dirname, "..", "..", "apps", "client", "src", "scenes", "GameScene.ts"), "utf8");
    expect(src).toMatch(/pollVote\(this\.voteSend, [^;]*run\.voteTicksLeft, TICK_RATE_HZ, this\.votePlayers, this\.voteCount\)/);
    expect(src, "no direct VoteSender.poll call").not.toMatch(/voteSend\s*\.\s*poll\s*\(/);
  });
});
