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
