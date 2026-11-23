import { describe, expect, it } from "vitest";
import { C2S, NEUTRAL_INPUT, loadBalance, type PlayerInput } from "@topdown/shared";
import { holdBuildingInput, neutralizeInput } from "./menuInput";
import { InputRouter } from "./InputRouter";
import { TouchSticks } from "./TouchSticks";
import type { MutablePlayerInput } from "./InputRouter";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSession } from "../net/session";
import { NetSimHost } from "../sim/NetSimHost";

describe("neutralizeInput (Story 2.11: the menu is open)", () => {
  it("stops moving, firing and pressing, keeps the aim", () => {
    const input: MutablePlayerInput = { ...NEUTRAL_INPUT, seq: 9, moveX: 1, moveY: -1, aimX: 0, aimY: 1, fire: true, swap: true, consumable: true, isMouse: true };
    expect(neutralizeInput(input)).toEqual({ ...NEUTRAL_INPUT, seq: 9, aimX: 0, aimY: 1, isMouse: true });
  });

  it("online, the neutral input still goes out once per step with a fresh seq", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0), fakePlayer(1)]));
    const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance: loadBalance(), session, now: () => 0 });
    const input: MutablePlayerInput = { ...NEUTRAL_INPUT, moveX: 1, fire: true };
    host.setLocalInput(input);
    host.update(0.05);
    for (let i = 0; i < 4; i++) {
      host.setLocalInput(neutralizeInput(input)); // the menu opened
      host.update(0.05);
    }
    const sent = room.sentOf(C2S.INPUT_SEND) as PlayerInput[];
    expect(sent.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(sent[0]).toMatchObject({ moveX: 1, fire: true });
    for (const s of sent.slice(1)) expect(s).toMatchObject({ moveX: 0, moveY: 0, fire: false, swap: false });
    host.dispose();
  });
});

describe("holdBuildingInput (Story 5.15: I hold a building and keep walking)", () => {
  it("keeps the move, clears aim and fire, leaves swap/consumable and the seq alone", () => {
    const input: MutablePlayerInput = { ...NEUTRAL_INPUT, seq: 9, moveX: 0.6, moveY: -0.8, aimX: 1, aimY: 0, fire: true, swap: true, consumable: true, isMouse: false };
    expect(holdBuildingInput(input)).toEqual({ ...NEUTRAL_INPUT, seq: 9, moveX: 0.6, moveY: -0.8, aimX: 0, aimY: 0, fire: false, swap: true, consumable: true, isMouse: false });
  });

  it("starting to hold lets go of the aim stick and the mouse button, never the move stick", () => {
    const W = 800;
    const router = new InputRouter(new TouchSticks(60, 0.1, 0.3));
    router.pointerDown(1, 100, 300, true, 0, false, W); // move thumb (left half)
    router.pointerMove(1, 160, 300, true, false);
    router.pointerDown(2, 600, 300, true, 0, false, W); // aim thumb, firing
    router.pointerMove(2, 660, 300, true, false);
    const out: MutablePlayerInput = { ...NEUTRAL_INPUT };
    router.build(out, false, 0, 0, Number.NaN, Number.NaN);
    expect([out.moveX > 0.9, out.fire]).toEqual([true, true]);
    router.releaseAim();
    router.build(out, false, 0, 0, Number.NaN, Number.NaN);
    expect([out.moveX > 0.9, out.aimX, out.fire]).toEqual([true, 0, false]);
    router.pointerMove(2, 700, 300, true, false); // the old aim thumb moving starts nothing
    router.build(out, false, 0, 0, Number.NaN, Number.NaN);
    expect(out.fire).toBe(false);
    router.kbm.leftButton = true;
    router.releaseAim();
    expect(router.kbm.leftButton).toBe(false);
  });

  it("online, holding sends normal movement with a fresh seq every step (not the neutral input)", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0), fakePlayer(1)]));
    const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance: loadBalance(), session, now: () => 0 });
    const input: MutablePlayerInput = { ...NEUTRAL_INPUT, moveX: 1, aimX: 1, fire: true };
    for (let i = 0; i < 4; i++) {
      host.setLocalInput(holdBuildingInput(input));
      host.update(0.05);
    }
    const sent = room.sentOf(C2S.INPUT_SEND) as PlayerInput[];
    expect(sent.map((s) => s.seq)).toEqual([1, 2, 3, 4]);
    for (const s of sent) expect(s).toMatchObject({ moveX: 1, aimX: 0, aimY: 0, fire: false });
    host.dispose();
  });
});
