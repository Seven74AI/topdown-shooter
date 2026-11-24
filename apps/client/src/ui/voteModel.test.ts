import { describe, expect, it } from "vitest";
import { VOTE_PENDING_MS, VOTE_SEND_BURST, VOTE_SEND_PER_S, VOTE_URGENT_GAP_MS, VoteRequest, VoteSender, voteFrameKey, voteResultLine, voteView, type VotePlayerIn } from "./voteModel";

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

describe("VoteSender (review M1 + re-review RM1: pace the flood, never hold back a change of mind)", () => {
  it("20 taps at 60 fps ending on Stay (not urgent): a burst of 3, then the newest on the next token; ≤ 4 sends; last = Stay", () => {
    const s = new VoteSender();
    s.poll(10, 0, 0);
    const sent: [number, string][] = [];
    let server = 0; // the server confirms what it received
    for (let f = 0; f < 180; f++) {
      const now = f * (1000 / 60);
      if (f < 20) s.want(f % 2 === 0 ? "extract" : "stay");
      const c = s.poll(10, server, now);
      if (c) {
        sent.push([now, c]);
        server = c === "stay" ? 2 : 1;
      }
    }
    expect(sent.at(-1)?.[1]).toBe("stay");
    expect(sent.length).toBeLessThanOrEqual(4);
    // never more than VOTE_SEND_BURST + VOTE_SEND_PER_S in any second
    for (const [t] of sent) expect(sent.filter(([u]) => u > t - 1000 && u <= t).length).toBeLessThanOrEqual(VOTE_SEND_BURST + VOTE_SEND_PER_S);
  });

  it("RM1: Stay at T−300 ms then Extract at T−100 ms → both sent on their tap (the Extract before the end)", () => {
    const s = new VoteSender();
    s.poll(10, 0, 0);
    const T = 15_000;
    s.want("stay");
    expect(s.poll(10, 0, T - 300)).toBe("stay");
    s.want("extract");
    expect(s.poll(10, 0, T - 100, true)).toBe("extract");
    // and without the urgent flag too (the bucket has tokens: a single change is never delayed)
    const u = new VoteSender();
    u.poll(10, 0, 0);
    u.want("stay");
    expect(u.poll(10, 0, T - 300)).toBe("stay");
    u.want("extract");
    expect(u.poll(10, 0, T - 100)).toBe("extract");
  });

  it("RM1: inside the all-voted hold (urgent) a change goes out even with the bucket empty, ≥ 150 ms apart", () => {
    const s = new VoteSender();
    s.poll(10, 0, 0);
    let t = 1000;
    for (const c of ["stay", "extract", "stay"] as const) {
      s.want(c);
      expect(s.poll(10, 0, t)).toBe(c); // drains the 3 tokens
      t += 10;
    }
    s.want("extract");
    expect(s.poll(10, 0, t)).toBe(null); // not urgent: waits for a token
    expect(s.poll(10, 0, t + 5, true)).toBe(null); // urgent, but < 150 ms after the last send
    expect(s.poll(10, 0, 1000 + 20 + VOTE_URGENT_GAP_MS, true)).toBe("extract");
  });

  it("the same choice twice sends once; resends if the server never confirmed; a new vote starts clean", () => {
    const s = new VoteSender();
    s.poll(10, 0, 0);
    s.want("stay");
    expect(s.poll(10, 0, 1)).toBe("stay");
    s.want("stay");
    expect(s.poll(10, 0, 500)).toBe(null);
    expect(s.poll(10, 0, 1 + VOTE_PENDING_MS + 1)).toBe("stay"); // dropped: resent
    expect(s.poll(10, 2, 5000)).toBe(null); // confirmed
    expect(s.poll(15, 0, 6000)).toBe(null); // the next vote: nothing wanted yet
  });
});

describe("voteFrameKey (review L8: rebuild the panel only on a visible change)", () => {
  it("same frame → same key; seconds, ring step, a chip, my vote or pending each change it", () => {
    const ps = [P(0, 0, true, true), P(1, 1), P(2, 0, false)];
    const k = voteFrameKey(150, 300, 20, ps, 3, 0, false);
    expect(voteFrameKey(150, 300, 20, ps, 3, 0, false)).toBe(k);
    expect(voteFrameKey(149, 300, 20, ps, 3, 0, false)).toBe(k); // same second, same ring step (0.497 → 30)
    expect(voteFrameKey(120, 300, 20, ps, 3, 0, false)).not.toBe(k);
    expect(voteFrameKey(150, 300, 20, ps, 3, 2, false)).not.toBe(k);
    expect(voteFrameKey(150, 300, 20, ps, 3, 0, true)).not.toBe(k);
    expect(voteFrameKey(150, 300, 20, [P(0, 0, true, true), P(1, 2), P(2, 0, false)], 3, 0, false)).not.toBe(k);
    expect(voteFrameKey(150, 300, 20, [P(0, 0, true, true), P(1, 1), P(2, 0, true)], 3, 0, false)).not.toBe(k);
    expect(voteFrameKey(150, 300, 20, ps, 2, 0, false)).not.toBe(k);
  });
});
