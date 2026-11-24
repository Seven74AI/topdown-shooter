import { describe, expect, it } from "vitest";
import { VOTE_PENDING_MS, VoteRequest, voteResultLine, voteView, type VotePlayerIn } from "./voteModel";

/** Story 6.11 (EX1, F1–F4, brief 30): the vote panel, pure. */
const P = (slot: number, vote: number, standing = true, mine = false): VotePlayerIn => ({ slot, vote, standing, mine });

describe("voteView", () => {
  it("closed outside the vote", () => {
    expect(voteView(false, 100, 300, 20, [P(0, 1)], 0, false).open).toBe(false);
  });

  it("chips by slot, downed dimmed but voting; the ring from the server's ticks (F4)", () => {
    const v = voteView(true, 150, 300, 20, [P(2, 0, false), P(0, 2, true, true), P(1, 1)], 2, false);
    expect(v.chips.map((c) => [c.slot, c.vote, c.dimmed, c.mine])).toEqual([
      [0, 2, false, true],
      [1, 1, false, false],
      [2, 0, true, false],
    ]);
    expect(v.ringFrac).toBe(0.5);
    expect(v.secondsLeft).toBe(8); // ceil(150 / 20)
    expect(v.result).toBe(""); // not everyone voted
  });

  it("everyone in: the result line (silent counts as Extract; Stay needs more than half)", () => {
    expect(voteView(true, 20, 300, 20, [P(0, 2, true, true), P(1, 2), P(2, 1)], 2, false).result).toBe("STAY · 1 – 2");
    expect(voteResultLine([P(0, 2), P(1, 2), P(2, 1), P(3, 1)], 0)).toBe("EXTRACT · 2 – 2"); // a tie → Extract (F3)
  });

  it("my pending tap shows at once but holds the result line until the server agrees", () => {
    const v = voteView(true, 200, 300, 20, [P(0, 0, true, true), P(1, 1)], 1, true);
    expect(v.chips[0]?.vote).toBe(1);
    expect(v.result).toBe("");
  });
});

describe("VoteRequest (the readyRequest pattern)", () => {
  it("pending until the server agrees or the timeout; a new vote clears it; a changed vote latches the new choice", () => {
    const r = new VoteRequest();
    expect(r.update(10, 0, 0)).toBe(0);
    expect(r.tap("stay", 100)).toBe("stay");
    expect(r.update(10, 0, 150)).toBe(2); // shown at once
    expect(r.isPending()).toBe(true);
    expect(r.update(10, 2, 200)).toBe(2); // the server agrees
    expect(r.isPending()).toBe(false);
    r.tap("extract", 300);
    expect(r.update(10, 2, 350)).toBe(1); // changed (D2), pending
    expect(r.update(10, 2, 300 + VOTE_PENDING_MS + 1)).toBe(2); // dropped: the server's value wins
    r.tap("stay", 5000);
    expect(r.update(15, 0, 5001)).toBe(0); // the next vote (wave 15): cleared
  });
});
