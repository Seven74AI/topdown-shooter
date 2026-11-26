import { describe, expect, it } from "vitest";
import type { PlayerStateView, RunStateView } from "@topdown/shared";
import { VOTE_EXTRACT, VOTE_NONE, VOTE_STAY } from "@topdown/shared";
import { addHeldVoters, voteResultLine, voteUrgent, voteView, type VotePlayerIn } from "./voteModel";
import { CONNECTION_TEXT, clock, connectionView, returnedIds } from "./connectionModel";

const player = (slot: number, name: string, heldUntilTick = 0) => ({ slot, name, heldUntilTick }) as unknown as PlayerStateView;
const state = (over: Partial<RunStateView>, players: [string, PlayerStateView][]) =>
  ({ phase: "wave", tick: 1000, frozen: false, resumeIn: 0, players: new Map(players), ...over }) as unknown as RunStateView;
const OK = { status: "ok" as const, sinceMs: 0 };

describe("Story 8.1 connection overlay model (AC 1, 4, 9, 10; brief 24)", () => {
  it("a held teammate is a grey chip 'Bo · reconnecting 1:43' counting down from the server's heldUntilTick", () => {
    const s = state({}, [["p0", player(0, "Ana")], ["p1", player(1, "Bo", 1000 + 103 * 20)]]);
    expect(connectionView(OK, s, "p0", 0).chips).toEqual([{ slot: 1, name: "Bo", text: "Bo · reconnecting 1:43" }]);
    expect(connectionView(OK, s, "p1", 0).chips).toEqual([]); // never my own chip
  });

  it("reconnecting: the panel with a 2-minute countdown from the drop; 'Paused: nobody connected' with the 3-2-1", () => {
    const v = connectionView({ status: "reconnecting", sinceMs: 1000 }, null, "p0", 1000 + 17_000);
    expect(v.screen).toBe("reconnecting");
    expect(v.line).toBe(`${CONNECTION_TEXT.reconnecting} 1:43`);
    const paused = connectionView(OK, state({ frozen: true, resumeIn: 2 }, []), "p0", 0);
    expect(paused).toMatchObject({ screen: "paused", line: "Paused: nobody connected", resumeIn: 2 });
    expect(connectionView({ status: "seat_kept", sinceMs: 0 }, null, "p0", 0)).toMatchObject({ screen: "seat_kept", line: "Your seat is kept. You'll rejoin at the next build phase" });
    expect(connectionView(OK, state({ phase: "lobby", frozen: true }, []), "p0", 0).screen).toBe("none");
  });

  it("clock is m:ss and never negative", () => {
    expect(clock(120)).toBe("2:00");
    expect(clock(0.2)).toBe("0:01");
    expect(clock(-5)).toBe("0:00");
  });

  it("returnedIds: who was held and is back ('Bo is back')", () => {
    const s = state({}, [["p1", player(1, "Bo")], ["p2", player(2, "Cy", 5000)]]);
    expect(returnedIds(new Set(["p1", "p2", "p3"]), s)).toEqual(["p1"]);
  });
});


describe("Story 8.12 (AC 6; was 8.1 RR1-M1): the vote panel counts only connected, standing players, as the server", () => {
  const present = (): VotePlayerIn[] => [
    { slot: 0, vote: VOTE_STAY, standing: true, mine: true },
    { slot: 1, vote: VOTE_STAY, standing: true, mine: false },
    { slot: 2, vote: VOTE_EXTRACT, standing: true, mine: false },
    { slot: 0, vote: 0, standing: true, mine: false }, // preallocated spare
  ];
  it("2 Stay + 1 Extract + 1 held: the held seat is a dimmed 'not voting' chip; result 'STAY · 1 – 2' (the server: Stay); urgent (all who count voted)", () => {
    const players = present();
    const n = addHeldVoters(players, 3, [3]);
    expect(n).toBe(4);
    expect(players[3]).toEqual({ slot: 3, vote: VOTE_NONE, standing: false, mine: false });
    const v = voteView(true, 200, 300, 20, players.slice(0, n), VOTE_STAY, false);
    expect(v.result).toBe("STAY · 1 – 2"); // 8.1 RR1-M1 had no line here (the held seat was a silent Extract)
    expect(v.chips.find((c) => c.slot === 3)).toEqual({ slot: 3, vote: VOTE_NONE, dimmed: true, mine: false });
    expect(v.canVote).toBe(true);
    expect(voteResultLine(players.slice(0, n), VOTE_STAY)).toBe("STAY · 1 – 2");
    expect(voteUrgent(200, 20, players, n)).toBe(true); // the server's everyoneVoted is true: the 1 s hold runs
  });

  it("2 Stay + 2 held → STAY · 0 – 2", () => {
    const players = present();
    players[2] = { slot: 2, vote: VOTE_NONE, standing: true, mine: false };
    const n = addHeldVoters(players, 2, [2, 3]);
    expect(voteView(true, 200, 300, 20, players.slice(0, n), VOTE_STAY, false).result).toBe("STAY · 0 – 2");
  });

  it("a silent standing player still holds the line back and isn't urgent; a held one doesn't", () => {
    const players: VotePlayerIn[] = [
      { slot: 0, vote: VOTE_STAY, standing: true, mine: true },
      { slot: 1, vote: VOTE_NONE, standing: true, mine: false },
    ];
    expect(voteView(true, 200, 300, 20, players, VOTE_STAY, false).result).toBe("");
    expect(voteUrgent(200, 20, players, 2)).toBe(false);
  });

  it("downed / out teammates: 'not voting' chips (their stored vote hidden), out of the count; 1 downed (voted Extract) + 2 Stay + 1 Extract → STAY · 1 – 2", () => {
    const players: VotePlayerIn[] = [
      { slot: 0, vote: VOTE_STAY, standing: true, mine: true },
      { slot: 1, vote: VOTE_STAY, standing: true, mine: false },
      { slot: 2, vote: VOTE_EXTRACT, standing: true, mine: false },
      { slot: 3, vote: VOTE_EXTRACT, standing: false, mine: false }, // downed
    ];
    const v = voteView(true, 200, 300, 20, players, VOTE_STAY, false);
    expect(v.chips[3]).toEqual({ slot: 3, vote: VOTE_NONE, dimmed: true, mine: false });
    expect(v.result).toBe("STAY · 1 – 2");
    // 2 downed, 1 Stay + 1 Extract → a tie → Extract
    players[1] = { slot: 1, vote: VOTE_STAY, standing: false, mine: false };
    players[0] = { slot: 0, vote: VOTE_STAY, standing: true, mine: true };
    players[2] = { slot: 2, vote: VOTE_EXTRACT, standing: true, mine: false };
    expect(voteView(true, 200, 300, 20, players, VOTE_STAY, false).result).toBe("EXTRACT · 1 – 1");
  });

  it("I'm downed: my buttons are disabled (canVote false) and my chip is 'not voting', even with a stored vote", () => {
    const players: VotePlayerIn[] = [
      { slot: 0, vote: VOTE_STAY, standing: false, mine: true },
      { slot: 1, vote: VOTE_EXTRACT, standing: true, mine: false },
    ];
    const v = voteView(true, 200, 300, 20, players, VOTE_STAY, false);
    expect(v.canVote).toBe(false);
    expect(v.mine).toBe(VOTE_NONE); // no button shows pressed
    expect(v.chips[0]).toEqual({ slot: 0, vote: VOTE_NONE, dimmed: true, mine: true });
    expect(v.result).toBe("EXTRACT · 1 – 0");
  });

  it("nobody counts (all held / down): no result line, not urgent (the server waits the timer, then Extract)", () => {
    const players: VotePlayerIn[] = [
      { slot: 0, vote: VOTE_STAY, standing: false, mine: true },
      { slot: 0, vote: 0, standing: true, mine: false },
    ];
    const n = addHeldVoters(players, 1, [1]);
    const v = voteView(true, 200, 300, 20, players.slice(0, n), VOTE_STAY, false);
    expect(v.result).toBe("");
    expect(v.canVote).toBe(false);
    expect(voteUrgent(200, 20, players, n)).toBe(false);
    expect(voteUrgent(5, 20, players, n)).toBe(true); // the last 500 ms are still urgent
  });

  it("never writes past the preallocated chips", () => {
    const players = present();
    expect(addHeldVoters(players, 3, [3, 4, 5])).toBe(4);
  });
});
