import { describe, expect, it } from "vitest";
import { C2S, NEUTRAL_INPUT, loadBalance, type PlayerInput } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";

const balance = loadBalance();
const FRAME = 1 / 60;

/** Story 8.1 (AC 4, F7): NetSimHost sends nothing while the link is down, and nothing late after it. */
describe("Story 8.1 NetSimHost send gate", () => {
  it("no input is sent or predicted while the link is down; after it is up again the seqs simply go on (no burst)", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10 })]));
    let up = true;
    const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => 0, linkUp: () => up });
    host.setLocalInput({ ...NEUTRAL_INPUT, moveX: 1, fire: true });
    for (let i = 0; i < 30; i++) host.update(FRAME);
    const before = (room.sentOf(C2S.INPUT_SEND) as PlayerInput[]).length;
    expect(before).toBeGreaterThan(5); // liveness: inputs were flowing
    const unacked = host.predictor.stats.unackedInputs;
    up = false;
    host.setLocalInput({ ...NEUTRAL_INPUT, moveX: 1, fire: true, swap: true }); // a swap pressed offline
    host.update(FRAME);
    host.setLocalInput({ ...NEUTRAL_INPUT, moveX: 1, fire: true });
    for (let i = 0; i < 300; i++) host.update(FRAME); // 5 s offline
    expect((room.sentOf(C2S.INPUT_SEND) as PlayerInput[]).length).toBe(before);
    expect(host.predictor.stats.unackedInputs).toBe(unacked); // nothing predicted offline either
    up = true;
    host.update(FRAME);
    host.update(FRAME);
    host.update(FRAME);
    const sent = room.sentOf(C2S.INPUT_SEND) as PlayerInput[];
    expect(sent.length - before).toBeLessThanOrEqual(2); // one step per 50 ms again, never 5 s of catch-up
    expect(sent[sent.length - 1]?.seq).toBe(sent.length);
    expect(sent.slice(before).every((s) => !s.swap)).toBe(true); // a swap pressed offline is not sent late
  });
});

describe("Story 8.1 × 8.9: a same-room reconnect keeps the render clock monotonic (8.9 F2)", () => {
  it("5 s with no patches while the link is down, then patches resume ahead: the render tick never goes backwards", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10 })]));
    let now = 0;
    let up = true;
    const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => now, linkUp: () => up });
    let tick = 0;
    let offset = 0; // server ticks ahead of the client's time (the server went on while we were gone)
    let last = Number.NEGATIVE_INFINITY;
    let patchesAfter = 0;
    let samples = 0;
    const frame = (patch: boolean): void => {
      now += 1000 / 60;
      if (patch && now >= (tick + 1 - offset) * 50) {
        tick++;
        room.state.tick = tick;
        room.patch();
        if (offset > 0) patchesAfter++;
      }
      host.update(FRAME);
      const r = host.renderTick;
      if (Number.isFinite(r)) {
        expect(r).toBeGreaterThanOrEqual(last - 1e-9);
        last = r;
        samples++;
      }
    };
    for (let i = 0; i < 180; i++) frame(true); // 3 s live
    up = false;
    const at = now;
    while (now - at < 5000) frame(false); // dropped: nothing arrives
    up = true;
    tick += 100; // back: the server is 100 ticks further on (5 s of the gap … minus nothing: it kept running)
    offset = 100;
    for (let i = 0; i < 300; i++) frame(true);
    expect(samples).toBeGreaterThan(400); // liveness: the clock really ran on both sides of the gap
    expect(patchesAfter).toBeGreaterThan(50); // patches really resumed ahead
    expect(last).toBeGreaterThan(tick - 20); // and the render clock caught up forward
  });
});
