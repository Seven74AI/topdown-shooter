import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, VIEW_TICK_SCALE, createExplosionSpec, explode, loadBalance, type PlayerInput } from "@topdown/shared";
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
    expect(c.restoreSeat(seat?.player as never, seat?.kills ?? 0, seat?.buildIdx ?? 0)).toBe(true);
    expect(c.world.players.has("p1")).toBe(true);
    expect(c.activeCount()).toBe(2);
  });
});

describe("Story 8.1 decision B16: a dropped body stays 3 s before it vanishes", () => {
  const MIN = balance.player.returnMinHoldTicks;
  it("mid-wave: in the World (hittable, a target) for 60 ticks, then held with onDropHold once", () => {
    const vanished: string[] = [];
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true, onDropHold: (id) => vanished.push(id) });
    wave(c);
    expect(c.dropPlayer("p1")).toBe("dropping");
    const p1 = c.world.players.get("p1");
    if (!p1) throw new Error("no p1");
    for (let t = 1; t < MIN; t++) {
      c.queueInput("p0", input(t));
      c.tick();
      expect(c.world.players.has("p1")).toBe(true);
    }
    expect(c.activeCount()).toBe(2); // still present: no freeze yet
    c.tick();
    expect(vanished).toEqual(["p1"]);
    expect(c.isHeld("p1")).toBe(true);
    expect(c.world.players.has("p1")).toBe(false);
  });

  it("a reload at a blast takes the blast: the dropping body is hurt like a present one", () => {
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true });
    wave(c);
    c.dropPlayer("p1");
    const p1 = c.world.players.get("p1") as NonNullable<ReturnType<typeof c.world.players.get>>;
    const hp = p1.hp;
    const spec = createExplosionSpec();
    spec.x = p1.x;
    spec.y = p1.y;
    spec.radiusM = 3;
    spec.playerDamage = 30;
    spec.kind = "bloater";
    explode(c.world, spec);
    expect(p1.hp).toBeLessThan(hp);
  });

  it("back within the 3 s: plays on in place, no teleport, no protection; its next input is applied", () => {
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true });
    wave(c);
    const p1 = c.world.players.get("p1") as NonNullable<ReturnType<typeof c.world.players.get>>;
    const x = p1.x;
    c.dropPlayer("p1");
    for (let t = 0; t < 20; t++) c.tick();
    expect(c.returnPlayer("p1")).toBe(false); // never held
    expect(c.cancelDrop("p1")).toBe(true);
    expect(c.world.players.get("p1")).toBe(p1);
    expect([p1.x, p1.protectTicks]).toEqual([x, 0]);
    c.queueInput("p1", input(700));
    c.tick();
    expect(c.ackSeq("p1")).toBe(700);
    for (let t = 0; t < 2 * MIN; t++) c.tick();
    expect(c.isHeld("p1")).toBe(false); // the countdown really stopped
  });

  it("a drop in a build phase is held at once (nothing hurts there)", () => {
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true });
    expect(c.dropPlayer("p1")).toBe("held");
    expect(c.world.players.has("p1")).toBe(false);
  });
});

describe("Story 8.1 re-review RR2-M2: B15's 3 s count from the DROP, not from the vanish", () => {
  const MIN = balance.player.returnMinHoldTicks;
  function farDropped() {
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true });
    wave(c);
    const p1 = c.world.players.get("p1") as NonNullable<ReturnType<typeof c.world.players.get>>;
    p1.x = 40;
    p1.y = 30;
    p1.prevX = 40;
    p1.prevY = 30;
    c.dropPlayer("p1");
    return { c, p1 };
  }
  it("back 4 s after the drop (1 s after the vanish): the wave's one teleport + protection", () => {
    const { c, p1 } = farDropped();
    for (let t = 0; t < MIN + 20; t++) c.tick(); // 3 s standing, then 1 s held
    expect(c.isHeld("p1")).toBe(true);
    expect(c.returnPlayer("p1")).toBe(true);
    expect(p1.protectTicks).toBe(balance.player.returnProtectTicks);
    expect(Math.hypot(p1.x - 40, p1.y - 30)).toBeGreaterThan(5); // next to Ana
  });
  it("back 2.5 s after the drop: the body never left — in place, unprotected", () => {
    const { c, p1 } = farDropped();
    for (let t = 0; t < 50; t++) c.tick();
    expect(c.cancelDrop("p1")).toBe(true);
    expect([p1.x, p1.y, p1.protectTicks]).toEqual([40, 30, 0]);
  });
});

describe("Story 8.1 re-review RR3-M1: a quiet hold counts B15's 3 s from the last input, not from the vanish", () => {
  it("quiet 3 s (held), back 1 s later: the wave's one teleport + protection", () => {
    const c = new RunController({ balance, seed: 5, players: TWO, pauseWaves: true, onQuietHold: () => undefined });
    wave(c);
    const p1 = c.world.players.get("p1") as NonNullable<ReturnType<typeof c.world.players.get>>;
    p1.x = 40;
    p1.y = 30;
    p1.prevX = 40;
    p1.prevY = 30;
    let t = 0;
    while (!c.isHeld("p1")) {
      c.queueInput("p0", input(++t));
      c.tick();
    }
    for (let i = 0; i < 20; i++) {
      c.queueInput("p0", input(++t));
      c.tick();
    }
    expect(c.returnPlayer("p1")).toBe(true);
    expect(p1.protectTicks).toBe(balance.player.returnProtectTicks);
    expect(Math.hypot(p1.x - 40, p1.y - 30)).toBeGreaterThan(5); // next to Ana
  });
});
