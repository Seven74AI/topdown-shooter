import { describe, expect, it } from "vitest";
import { darknessAlpha, isBlackout, loadBalance } from "@topdown/shared";
import { NetSession } from "../net/session";
import { DevThrottle } from "../net/devThrottle";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";

/**
 * Story 6.3 (F1, brief 14, 26): the mirror World carries the server's light state as is: on a
 * normal patch, a late join, a tab that slept across a wave start, and under the `?lag` throttle.
 */
const balance = loadBalance();

function setup(pct = 0, half = false) {
  const room = new FakeRoom(fakeState([fakePlayer(1, { x: 24, y: 16 })]));
  room.state.phase = "build";
  room.state.blackoutPct = pct;
  room.state.halfDark = half;
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  let now = 0;
  const host = new NetSimHost({ balance, session, now: () => now });
  return { room, host, setNow: (t: number) => (now = t) };
}

describe("NetSimHost blackout mirror (Story 6.3)", () => {
  it("the mirror follows the state on every patch (on, half, off)", () => {
    const { room, host } = setup();
    room.state.tick = 1;
    room.patch();
    host.update(1 / 60);
    expect(isBlackout(host.world)).toBe(false);
    room.state.tick = 2;
    room.state.phase = "wave";
    room.state.blackoutPct = 5;
    room.patch();
    host.update(1 / 60);
    expect(host.world.lights.blackoutPct).toBe(5);
    expect(darknessAlpha(host.world)).toBeCloseTo(0.95, 9);
    room.state.tick = 3;
    room.state.phase = "build";
    room.state.halfDark = true;
    room.patch();
    host.update(1 / 60);
    expect(darknessAlpha(host.world)).toBeCloseTo(0.475, 9);
    room.state.tick = 4;
    room.state.blackoutPct = 0;
    room.state.halfDark = false;
    room.patch();
    host.update(1 / 60);
    expect(isBlackout(host.world)).toBe(false);
    expect(darknessAlpha(host.world)).toBe(0);
  });

  it("late join: a host built mid-blackout draws the current level on its first frame", () => {
    const { room, host } = setup(10);
    room.state.phase = "wave";
    room.patch();
    host.update(1 / 60);
    expect(host.world.lights.blackoutPct).toBe(10);
  });

  it("a state that jumped across a wave start (hidden tab) gives the new level at once, and the end of it too", () => {
    const { room, host, setNow } = setup(0);
    room.state.tick = 10;
    room.patch();
    host.update(1 / 60);
    for (let t = 11; t <= 300; t++) {
      room.state.tick = t;
      if (t === 100) {
        room.state.phase = "wave";
        room.state.blackoutPct = 5;
      }
      room.patch();
    }
    setNow(15_000);
    host.update(10);
    expect(host.world.lights.blackoutPct).toBe(5);
    for (let t = 301; t <= 600; t++) {
      room.state.tick = t;
      if (t === 400) {
        room.state.phase = "build";
        room.state.blackoutPct = 0;
      }
      room.patch();
    }
    setNow(30_000);
    host.update(10);
    expect(isBlackout(host.world)).toBe(false);
  });

  it("the ?lag dev throttle copies blackoutPct and halfDark (RUN_STATE_FIELDS)", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0)]));
    room.state.blackoutPct = 20;
    room.state.halfDark = true;
    let now = 0;
    const throttle = new DevThrottle(room, { lagMs: 100, jitterMs: 0, random: () => 0.5, now: () => now });
    room.patch();
    now = 150;
    throttle.pump(150);
    expect([throttle.state.blackoutPct, throttle.state.halfDark]).toEqual([20, true]);
  });
});
