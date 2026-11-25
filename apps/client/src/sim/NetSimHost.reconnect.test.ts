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

describe("Story 8.1 review M3: the phone's clock after a freeze", () => {
  it("6 s frozen (server tick stands still): within 1 s of the resume the estimate leads the data by < 200 ms; monotonic after it", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10 })]));
    let now = 0;
    const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => now });
    let tick = 0;
    let base = 0; // client ms at server tick 0 (moves on by the freeze)
    const step = (live: boolean): void => {
      now += 1000 / 60;
      if (live && now - base >= (tick + 1) * 50) {
        tick++;
        room.state.tick = tick;
        room.patch();
      }
      host.update(FRAME);
    };
    for (let i = 0; i < 180; i++) step(true); // 3 s live
    room.state.frozen = true;
    room.patch();
    const frozenAt = now;
    let last = host.renderTick;
    step(false);
    const heldRender = host.renderTick;
    while (now - frozenAt < 6000) {
      step(false);
      expect(host.renderTick).toBe(heldRender); // RR1-N4: the render clock holds still while frozen
    }
    expect((host.serverTick - tick) * 50).toBeLessThan(200); // and the estimate doesn't run ahead
    base += now - frozenAt; // the server resumes from the same tick
    room.state.frozen = false;
    room.patch();
    const resumedAt = now;
    last = Math.min(last, heldRender);
    while (now - resumedAt < 1000) {
      step(true);
      expect(host.renderTick).toBeGreaterThanOrEqual(last - 1e-9); // monotonic ACROSS the lift (no step back on screen)
      last = host.renderTick;
    }
    expect((host.serverTick - tick) * 50).toBeLessThan(200);
    expect(host.renderTick).toBeGreaterThan(heldRender); // liveness: it moves again
  });
});

describe("Story 8.1 RR1-M1: NetSimHost.heldSeatSlots", () => {
  it("lists teammates with heldUntilTick > 0 from the room state (never me)", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10 }), fakePlayer(2, { x: 30, y: 10 })]));
    const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => 0 });
    room.state.tick = 1;
    room.state.phase = "vote";
    (room.state.players.get("p2") as { heldUntilTick: number }).heldUntilTick = 500;
    (room.state.players.get("p1") as { heldUntilTick: number }).heldUntilTick = 500;
    room.patch();
    host.update(FRAME);
    expect([...host.heldSeatSlots()]).toEqual([2]);
  });
});

describe("Story 8.1 RR1-N3/N4: a phone that missed a whole freeze (its link was down) re-bases on the link-up edge", () => {
  it("link down 6 s while the server froze (it never saw frozen): back with frozen=false → lead < 200 ms within 1 s", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10 })]));
    let now = 0;
    let up = true;
    const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => now, linkUp: () => up });
    let tick = 0;
    let base = 0;
    const step = (live: boolean): void => {
      now += 1000 / 60;
      if (live && now - base >= (tick + 1) * 50) {
        tick++;
        room.state.tick = tick;
        room.patch();
      }
      host.update(FRAME);
    };
    for (let i = 0; i < 180; i++) step(true);
    up = false;
    const downAt = now;
    while (now - downAt < 6000) step(false); // the server froze meanwhile: tick stood still
    expect((host.serverTick - tick) * 50).toBeGreaterThan(4000); // liveness: the phone ran ahead
    base += now - downAt;
    up = true;
    const upAt = now;
    while (now - upAt < 1000) step(true);
    expect((host.serverTick - tick) * 50).toBeLessThan(200);
    expect(host.renderTick).toBeLessThanOrEqual(tick); // the render clock restarted too (delay.rebase on the link edge): never ahead of the data
  });
});

describe("Story 8.1 RR2-M1: the mirror keeps a teammate's body until heldUntilTick is written (the vanish)", () => {
  it("heldUntilTick 0 (a B16 dropping body): drawn; > 0 (vanished into the hold): gone", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 20, y: 10 })]));
    const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => 0 });
    room.state.phase = "wave";
    room.state.tick = 1;
    room.patch();
    host.update(FRAME);
    expect(host.world.players.has("p0")).toBe(true);
    (room.state.players.get("p0") as { heldUntilTick: number }).heldUntilTick = 2400;
    room.state.tick = 2;
    room.patch();
    host.update(FRAME);
    expect(host.world.players.has("p0")).toBe(false);
  });
});
