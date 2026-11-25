import { describe, expect, it } from "vitest";
import { C2S, S2C, loadBalance } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { LocalSimHost } from "./LocalSimHost";

/** Story 8.7 (AC 4, 6, P1, P5): online my ping goes out as `ping.send { kind }` only; everyone's pings land in the inbox's model, never in the World. */
const balance = loadBalance();

function setup(link = { up: true }) {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 10, y: 12 })]));
  room.state.phase = "wave";
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0, linkUp: () => link.up });
  return { room, host, session, link };
}

describe("NetSimHost pings (Story 8.7)", () => {
  it("sendPing sends ping.send { kind } — the kind only, never a position (P1); nothing while the link is down or for a bad index", () => {
    const { room, host, link } = setup();
    host.sendPing(0);
    host.sendPing(3);
    host.sendPing(4);
    host.sendPing(-1);
    link.up = false;
    host.sendPing(1);
    expect(room.sentOf(C2S.PING_SEND)).toEqual([{ kind: "help" }, { kind: "ready" }]);
  });

  it("ping.shown lands in the inbox's model (also before a scene listens), never in the World (P5); player.left and the lobby reset clear it", () => {
    const { room, host, session } = setup();
    host.update(1 / 60);
    const before = JSON.stringify([...host.world.players.keys()]);
    room.deliver(S2C.PING_SHOWN, [0, 2, 125, 91, 50]);
    host.update(1 / 60);
    expect(host.pings.update(performance.now(), 50)).toBe(1);
    expect(host.pings.live(0)).toMatchObject({ kind: 2, x: 12.5, y: 9.1 });
    expect(JSON.stringify([...host.world.players.keys()])).toBe(before);
    room.deliver(S2C.PLAYER_LEFT, { playerId: "p0", name: "Ana", reason: "disconnected" });
    expect(host.pings.live(0)).toBeNull();
    room.deliver(S2C.PING_SHOWN, [1, 0, 1, 1, 50]);
    session.inbox.reset();
    expect(host.pings.update(performance.now(), 50)).toBe(0);
  });

  it("solo (B8): no pings — sendPing does nothing and there is no model", () => {
    const solo = new LocalSimHost({ balance, seed: 1 });
    solo.sendPing();
    expect(solo.pings).toBeNull();
    solo.dispose();
  });
});
