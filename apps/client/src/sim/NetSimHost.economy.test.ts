import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, loadBalance } from "@topdown/shared";
import { NetSession } from "../net/session";
import { DevThrottle } from "../net/devThrottle";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";

/** Story 3.2: the mirror's wallets come from schema only (the client never predicts money). */
const balance = loadBalance();

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10, wallet: 137, earned: 37 }), fakePlayer(1, { x: 12, y: 10, wallet: 100 })]));
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host };
}

describe("NetSimHost wallets (Story 3.2)", () => {
  it("copies wallet and earned from the state, for me and for others", () => {
    const { host, room } = setup();
    host.update(1 / 60);
    expect(host.world.players.get("p0")).toMatchObject({ wallet: 137, earned: 37 });
    expect(host.world.players.get("p1")).toMatchObject({ wallet: 100, earned: 0 });
    const s1 = room.state.players.get("p1");
    if (s1) {
      s1.wallet = 102;
      s1.earned = 2;
    }
    host.update(1 / 60);
    expect(host.world.players.get("p1")).toMatchObject({ wallet: 102, earned: 2 });
  });

  it("my inputs (firing, moving) never change my wallet: only the next state does", () => {
    const { host, room } = setup();
    for (let i = 0; i < 40; i++) {
      host.setLocalInput({ ...NEUTRAL_INPUT, moveX: 1, aimX: 1, fire: true });
      host.update(0.05);
    }
    expect(room.inputsSent().length).toBeGreaterThan(0);
    expect(host.world.players.get("p1")?.wallet).toBe(100);
  });

  it("the dev throttle copies wallet and earned", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { wallet: 250, earned: 150 })]));
    let now = 0;
    const throttle = new DevThrottle(room, { lagMs: 100, jitterMs: 0, random: () => 0.5, now: () => now });
    room.patch();
    now = 50;
    throttle.pump(50);
    expect(throttle.state.players.get("p0")).toMatchObject({ wallet: 250, earned: 150 });
  });
});
