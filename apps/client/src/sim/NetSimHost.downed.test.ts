import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";

/** Story 2.8: the mirror exposes the downed fields (kept apart from NetSimHost.test.ts, which 2.6 edits). */
const balance = loadBalance();

function setup() {
  const room = new FakeRoom(
    fakeState([
      fakePlayer(0, { x: 10, y: 10, status: "downed", hp: 0, downedTicksLeft: 340, reviveProgress: 128 }),
      fakePlayer(1, { x: 11, y: 10 }),
      fakePlayer(2, { x: 30, y: 10, status: "out", hp: 0 }),
    ]),
  );
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host };
}

describe("NetSimHost downed mirror (Story 2.8)", () => {
  it("copies status, countdown and revive progress (0–255 → ticks), and finds the reviver", () => {
    const { host } = setup();
    host.update(1 / 60);
    const p0 = host.world.players.get("p0");
    expect(p0).toMatchObject({ status: "downed", downedTicksLeft: 340, reviveTicks: 30, reviverId: "p1" });
    expect(host.world.players.get("p2")?.status).toBe("out");
    expect(host.world.teamWiped).toBe(false);
  });

  it("no reviver while the progress is 0; teamWiped follows phase results", () => {
    const { host, room } = setup();
    const s0 = room.state.players.get("p0");
    if (s0) s0.reviveProgress = 0;
    room.state.phase = "results";
    host.update(1 / 60);
    expect(host.world.players.get("p0")?.reviverId).toBeNull();
    expect(host.world.teamWiped).toBe(true);
  });
});
