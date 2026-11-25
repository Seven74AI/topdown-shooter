import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";

/**
 * Story 6.11 (T3; brief 2, 14): the mirror copies the vote (phase, ticks left, each player's vote),
 * the ending and endless from the room state as is — a state that jumps across the whole vote (a
 * hidden tab) lands on the server's truth, and `castVote` sends `evac.vote`.
 */
const balance = loadBalance();

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 11, y: 10, status: "downed", hp: 0 })]));
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host };
}

describe("NetSimHost vote mirror (Story 6.11)", () => {
  it("copies phase vote, the ticks left and every player's vote; castVote sends evac.vote", () => {
    const { host, room } = setup();
    room.state.phase = "vote";
    room.state.wave = 10;
    room.state.voteTicksLeft = 233;
    const p0 = room.state.players.get("p0");
    if (p0) p0.vote = 2;
    host.update(1 / 60);
    expect(host.world.run).toMatchObject({ phase: "vote", voteTicksLeft: 233, ending: "none", endless: false });
    expect(host.world.players.get("p0")?.vote).toBe(2);
    expect(host.world.players.get("p1")?.vote).toBe(0);
    host.castVote("stay");
    host.castVote("extract");
    expect(room.sentOf("evac.vote")).toEqual([{ choice: "stay" }, { choice: "extract" }]);
  });

  it("a state that jumped across the whole vote (hidden tab): the build of wave 11 with endless, no vote left", () => {
    const { host, room } = setup();
    room.state.phase = "build";
    room.state.wave = 10;
    room.state.voteTicksLeft = 0;
    room.state.endless = true;
    host.update(1 / 60);
    expect(host.world.run).toMatchObject({ phase: "build", voteTicksLeft: 0, endless: true, ending: "none" });
  });

  it("Results: the ending comes from resultEnding (\"lost\" after Stay); an unknown value reads as a wipe", () => {
    const { host, room } = setup();
    room.state.phase = "results";
    room.state.resultEnding = "lost";
    room.state.endless = true;
    host.update(1 / 60);
    expect(host.world.run.ending).toBe("lost");
    room.state.resultEnding = "???";
    host.update(1 / 60);
    expect(host.world.run.ending).toBe("wiped");
  });
});
