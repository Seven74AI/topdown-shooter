import { describe, expect, it } from "vitest";
import { JOINING_TEXT, WAITING_TEXT, waitingView } from "./waitingView";

describe("waitingView (Story 8.2 J4, AC 4)", () => {
  it("a waiting late joiner in a wave or the vote watches, with the line", () => {
    for (const phase of ["wave", "vote"] as const) {
      expect(waitingView({ waiting: true }, phase)).toEqual({ waiting: true, line: WAITING_TEXT });
    }
    // A build-phase joiner waits only while the server reads its progress (≤ 2 s): "Joining…".
    expect(waitingView({ waiting: true }, "build")).toEqual({ waiting: true, line: JOINING_TEXT });
    expect(WAITING_TEXT).toBe("Wave in progress, you'll join at the next build phase");
  });

  it("not waiting, no entry yet, the lobby or Results: nothing", () => {
    expect(waitingView({ waiting: false }, "wave").waiting).toBe(false);
    expect(waitingView(undefined, "wave").waiting).toBe(false);
    expect(waitingView({ waiting: true }, "lobby").waiting).toBe(false);
    expect(waitingView({ waiting: true }, "results").line).toBe("");
  });
});
