import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, VIEW_TICK_SCALE, loadBalance, type PlayerInput } from "@topdown/shared";
import { RunController } from "./RunController";
import { QUIET_HOLD_TICKS, STALE_INPUT_TICKS } from "../net/limits";

const balance = loadBalance();
const TWO = [
  { playerId: "p0", slot: 0 },
  { playerId: "p1", slot: 1 },
];
const input = (seq: number, over: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq, ...over });

function wave(c: RunController): void {
  c.world.run.phase = "wave"; // one mechanic: no wave director needed (waves paused)
}

describe("Story 8.1 RunController hold, return and the quiet rule", () => {
  it("D1: a connected player with no input for 60 wave ticks is held (callback once); one who keeps sending is not", () => {
    const held: string[] = [];
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true, onQuietHold: (id) => held.push(id) });
    wave(c);
    for (let t = 1; t <= QUIET_HOLD_TICKS + 2; t++) {
      c.queueInput("p0", input(t));
      c.tick();
    }
    expect(held).toEqual(["p1"]);
    expect(c.isHeld("p1")).toBe(true);
    expect(c.isHeld("p0")).toBe(false);
    expect(c.activeCount()).toBe(1);
  });

  it("D1: build-phase quiet doesn't count (they just stand); a tab hidden across the build start is held 3 s into the wave", () => {
    const held: string[] = [];
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true, onQuietHold: (id) => held.push(id) });
    for (let t = 0; t < 200; t++) c.tick(); // build phase
    expect(held).toEqual([]);
    wave(c);
    for (let t = 0; t < QUIET_HOLD_TICKS; t++) c.tick();
    expect(held).toEqual([]);
    c.tick();
    expect(held.sort()).toEqual(["p0", "p1"]);
  });

  it("F7: inputs sent while held are ignored; the return accepts the client's next seq whatever it is (no seq gap)", () => {
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true });
    c.queueInput("p1", input(1));
    c.tick();
    expect(c.holdPlayer("p1")).toBe(true);
    c.queueInput("p1", input(2, { moveX: 1 }));
    expect(c.queued("p1")).toBe(0);
    expect(c.returnPlayer("p1")).toBe(true);
    c.queueInput("p1", input(500));
    expect(c.queued("p1")).toBe(1);
    c.tick();
    expect(c.ackSeq("p1")).toBe(500);
    expect(c.drops("p1").jumped).toBe(0);
  });

  it("F7: an input whose view is > 2 s behind the server (made while the line was down) counts its seq but applies nothing", () => {
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true });
    for (let t = 1; t <= 100; t++) {
      c.queueInput("p0", input(t, { viewTick: c.world.tick * VIEW_TICK_SCALE }));
      c.tick();
    }
    const old = (c.world.tick - STALE_INPUT_TICKS - 1) * VIEW_TICK_SCALE;
    c.queueInput("p0", input(101, { viewTick: old, moveX: 1 }));
    expect(c.queued("p0")).toBe(0);
    expect(c.drops("p0").offline).toBe(1);
    c.queueInput("p0", input(102, { viewTick: c.world.tick * VIEW_TICK_SCALE }));
    expect(c.queued("p0")).toBe(1); // the next seq is not a gap
    const live = (c.world.tick - STALE_INPUT_TICKS) * VIEW_TICK_SCALE;
    expect(c.isStaleInput(input(103, { viewTick: live }))).toBe(false);
    expect(c.isStaleInput(input(103, { viewTick: -1 }))).toBe(false); // unknown view: never stale
  });

  it("releaseHeld (hold ran out) and restoreSeat (remembered seat back) keep the kills", () => {
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true });
    c.holdPlayer("p1");
    const seat = c.releaseHeld("p1");
    expect(seat).not.toBeNull();
    expect(c.world.heldPlayers.has("p1")).toBe(false);
    expect(c.restoreSeat(seat?.player as never, seat?.kills ?? 0)).toBe(true);
    expect(c.world.players.has("p1")).toBe(true);
    expect(c.activeCount()).toBe(2);
  });
});
