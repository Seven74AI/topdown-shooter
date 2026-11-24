import { describe, expect, it } from "vitest";
import { C2S, S2C, loadBalance } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { LocalSimHost } from "./LocalSimHost";

/** Story 5.24: online my ghost goes out as `building.ghost`; teammates' ghosts arrive in the inbox's store (never in the World). */
const balance = loadBalance();

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 10, y: 12 })]));
  room.state.phase = "build";
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host, session };
}

describe("NetSimHost ghosts (Story 5.24)", () => {
  it("sendGhost sends building.ghost { type, gx, gy, rot } (a clear too) and changes nothing locally", () => {
    const { room, host } = setup();
    host.sendGhost("mine", 20, 22, 1);
    host.sendGhost("", 0, 0, 0);
    expect(room.sentOf(C2S.BUILDING_GHOST)).toEqual([
      { type: "mine", gx: 20, gy: 22, rot: 1 },
      { type: "", gx: 0, gy: 0, rot: 0 },
    ]);
    host.update(1 / 60);
    expect(host.world.buildings.list).toHaveLength(0);
  });

  it("a teammate's ghost lands in the store, never in the World (F7); player.left and the lobby reset clear it", () => {
    const { room, host, session } = setup();
    room.deliver(S2C.BUILDING_GHOSTED, [0, 2, 20, 22, 1]);
    host.update(1 / 60);
    expect(host.teammateGhosts.live(0)).toMatchObject({ typeIdx: 2, gx: 20, gy: 22, rot: 1 });
    expect(host.world.buildings.list).toHaveLength(0);
    room.deliver(S2C.PLAYER_LEFT, { playerId: "p0", name: "Ana", reason: "disconnected" });
    expect(host.teammateGhosts.live(0)).toBeNull(); // B7 (nobody listens to player.left in this test)
    room.deliver(S2C.BUILDING_GHOSTED, [0, 2, 20, 22, 1]);
    session.inbox.reset();
    expect(host.teammateGhosts.live(0)).toBeNull();
  });

  it("solo: sendGhost does nothing and there is no store (D10)", () => {
    const solo = new LocalSimHost({ balance, seed: 1 });
    solo.sendGhost();
    expect(solo.teammateGhosts).toBeNull();
    solo.dispose();
  });
});
