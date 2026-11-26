import { describe, expect, it } from "vitest";
import { createRng } from "@topdown/shared";
import { VOTE_PENDING_MS, VOTE_SEND_BURST, VOTE_SEND_PER_S, VOTE_URGENT_DEBT, VOTE_URGENT_GAP_MS, VoteRequest, VoteSender, voteFrameKey, voteResultLine, voteUrgent, voteView, type VotePlayerIn } from "./voteModel";

/** Story 6.11 (EX1, F1–F4, brief 30): the vote panel, pure. */
const P = (slot: number, vote: number, standing = true, mine = false): VotePlayerIn => ({ slot, vote, standing, mine });

describe("voteView", () => {
  it("closed outside the vote", () => {
    expect(voteView(false, 100, 300, 20, [P(0, 1)], 0, false).open).toBe(false);
  });

  it("chips by slot, downed dimmed (Story 8.12: not voting); the ring from the server's ticks (F4)", () => {
    const v = voteView(true, 150, 300, 20, [P(2, 0, false), P(0, 2, true, true), P(1, 1)], 2, false);
    expect(v.chips.map((c) => [c.slot, c.vote, c.dimmed, c.mine])).toEqual([
      [0, 2, false, true],
      [1, 1, false, false],
      [2, 0, true, false],
    ]);
    expect(v.ringFrac).toBe(0.5);
    expect(v.secondsLeft).toBe(8); // ceil(150 / 20)
    expect(v.result).toBe("EXTRACT · 1 – 1"); // Story 8.12: the downed slot 2 doesn't count, everyone else voted
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
    expect(s.poll(10, 0, t + 5, true)).toBe(null); // urgent, but < the urgent gap after the last send
    expect(s.poll(10, 0, 1000 + 20 + VOTE_URGENT_GAP_MS, true)).toBe("extract"); // a borrowed token
    s.want("stay");
    expect(s.poll(10, 0, 1000 + 20 + 2 * VOTE_URGENT_GAP_MS - 1, true)).toBe(null); // RR2-L2: only one token may be borrowed
  });

  it("re-review 2 (RR2-L2): taps every frame for 3 s, urgent all along → ≤ 7 sends in any second (3 burst + 3 refill + 1 borrowed), 3/s after", () => {
    const s = new VoteSender();
    s.poll(10, 0, 0);
    const at: number[] = [];
    for (let f = 0; f < 180; f++) {
      const now = f * (1000 / 60);
      s.want(f % 2 === 0 ? "extract" : "stay");
      if (s.poll(10, 0, now, true)) at.push(now);
    }
    for (const t of at) expect(at.filter((u) => u > t - 1000 && u <= t).length).toBeLessThanOrEqual(VOTE_SEND_BURST + VOTE_SEND_PER_S + VOTE_URGENT_DEBT);
    expect(at.filter((u) => u >= 2000).length).toBeLessThanOrEqual(VOTE_SEND_PER_S + 1);
  });

  it("story 6.14 (6.11 N5): VOTE_URGENT_DEBT bounds the borrowing — a second borrow past the urgent gap is still refused until a token refills", () => {
    const s = new VoteSender();
    s.poll(10, 0, 0);
    let t = 1000;
    for (const c of ["stay", "extract", "stay"] as const) {
      s.want(c);
      expect(s.poll(10, 0, t)).toBe(c); // drains the 3 tokens
      t += 1;
    }
    s.want("extract");
    expect(s.poll(10, 0, t + VOTE_URGENT_GAP_MS, true)).toBe("extract"); // borrows the one token (bucket ≈ −1)
    const borrowedAt = t + VOTE_URGENT_GAP_MS;
    s.want("stay");
    // Past the gap again, but the bucket is still below 0 (refill 3/s): a second borrow would take it under −DEBT.
    const second = borrowedAt + VOTE_URGENT_GAP_MS + 1;
    expect((second - borrowedAt) * VOTE_SEND_PER_S).toBeLessThan(1000); // still before one token refills
    expect(s.poll(10, 0, second, true)).toBe(null);
    // Once the debt is paid back and a token is in, it goes out (no stall).
    expect(s.poll(10, 0, borrowedAt + 2 * (1000 / VOTE_SEND_PER_S) + 1, true)).toBe("stay");
  });

  it("story 6.14 (6.11 RR3-L2): frantic taps over the last 1.5 s (1 s all-voted hold), 2000 runs → ≤ ~2 % (≤ 3 %) lost final choices, 0 server drops (pongs included)", () => {
    const rng = createRng(614);
    const FRAME = 1000 / 60;
    const T = 20_000; // the vote ends (the hold started at T − 1000: everyone has voted)
    let lost = 0;
    let drops = 0;
    let sends = 0;
    const RUNS = 2000;
    for (let run = 0; run < RUNS; run++) {
      const s = new VoteSender();
      // The server's shared non-input bucket (apps/server messageGuard: TokenBucket(10, 10)) and ~1 pong/s.
      let bucket = 10;
      let bucketAt = 0;
      const take = (now: number): boolean => {
        bucket = Math.min(10, bucket + ((now - bucketAt) * 10) / 1000);
        bucketAt = now;
        if (bucket < 1) return false;
        bucket -= 1;
        return true;
      };
      let nextPong = rng.range(0, 1000);
      let server = 0;
      let last: "extract" | "stay" = "extract";
      s.poll(10, 0, 0);
      s.want(last);
      // The first vote, at a random moment; then frantic changes every 50–450 ms from T − 1500.
      let nextTap = T - 1500;
      for (let now = 0; now < T; now += FRAME) {
        while (nextPong <= now) {
          if (!take(nextPong)) drops++;
          nextPong += 1000;
        }
        if (now >= nextTap) {
          last = last === "extract" ? "stay" : "extract";
          s.want(last);
          nextTap = now + rng.range(50, 450);
        }
        const urgent = now >= T - 1000;
        const c = s.poll(10, server, now, urgent);
        if (c) {
          sends++;
          if (take(now)) server = c === "stay" ? 2 : 1;
          else drops++;
        }
      }
      if (server !== (last === "stay" ? 2 : 1)) lost++;
    }
    expect(sends, "liveness: votes were sent").toBeGreaterThan(RUNS * 3);
    expect(drops, "the server dropped a message").toBe(0);
    // Measured in this model: gap 100 → 2.5 %, gap 0 → 2.35 % (the debt's floor), gap 150 → 3.3 %, old gap 250 → 5.8 %.
    expect(lost / RUNS, `lost final choices ${lost}/${RUNS}`).toBeLessThanOrEqual(0.03);
  });

  it("re-review 2 (N3): voteUrgent — the last 500 ms, or everyone has voted", () => {
    expect(voteUrgent(10, 20, [P(0, 0), P(1, 0)], 2)).toBe(true); // 500 ms left
    expect(voteUrgent(11, 20, [P(0, 0), P(1, 1)], 2)).toBe(false);
    expect(voteUrgent(200, 20, [P(0, 2), P(1, 1)], 2)).toBe(true); // everyone in: the hold
    expect(voteUrgent(200, 20, [], 0)).toBe(false);
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
