import { describe, expect, it } from "vitest";
import { TICK_DT_S } from "@topdown/shared";
import { loadBalance, sweepChargeLane, createWorld } from "@topdown/shared";
import {
  chargeLaneLook,
  chargeLaneProgress,
  chargeStopTick,
  deathFrameIndex,
  slamFrameIndex,
  telegraphProgress,
  throwChunkAt,
  throwInnerRadius,
  TELEGRAPH_FADE_S,
  type ChunkLook,
  type LaneLook,
  type TelegraphLook,
} from "./bossTelegraph";

const out: TelegraphLook = { progress: 0, visible: false, alpha: 0 };

describe("Story 6.5 F3: the fill tells you when", () => {
  it("draws from the server's start tick: a late message shows a ring already partly filled", () => {
    // The telegraph started at tick 100 (hit 124); the event arrived 150 ms (3 ticks) late.
    expect(telegraphProgress(103, 100, 124, out).progress).toBeCloseTo(3 / 24, 9);
    expect(out.visible).toBe(true);
    expect(telegraphProgress(100, 100, 124, out).progress).toBe(0);
  });

  it("the fill always reaches the edge on the hit tick, not later or earlier", () => {
    expect(telegraphProgress(123.99, 100, 124, out).progress).toBeLessThan(1);
    expect(telegraphProgress(124, 100, 124, out).progress).toBe(1);
    expect(out.alpha).toBe(1);
    for (let t = 100; t <= 124; t += 0.25) expect(telegraphProgress(t, 100, 124, out).progress).toBeCloseTo((t - 100) / 24, 9);
  });

  it("fades 0.3 s after the hit; a woken tab or late scene past it draws nothing", () => {
    const fade = TELEGRAPH_FADE_S / TICK_DT_S;
    telegraphProgress(124 + fade / 2, 100, 124, out);
    expect(out.visible).toBe(true);
    expect(out.alpha).toBeCloseTo(0.5, 9);
    expect(telegraphProgress(124 + fade + 0.01, 100, 124, out).visible).toBe(false);
    expect(telegraphProgress(5000, 100, 124, out).visible).toBe(false);
  });

  it("never from the arrival time: the same server tick gives the same fill whatever the arrival", () => {
    const a = telegraphProgress(110, 100, 124, { progress: 0, visible: false, alpha: 0 }).progress;
    const b = telegraphProgress(110, 100, 124, { progress: 0, visible: false, alpha: 0 }).progress;
    expect(a).toBe(b);
  });

  it("an empty or future telegraph draws nothing", () => {
    expect(telegraphProgress(100, 100, 100, out).visible).toBe(false);
    expect(telegraphProgress(90, 100, 124, out).visible).toBe(false);
  });

  it("the slam pose: arms rise over three frames with the fill", () => {
    expect([0, 0.2, 0.4, 0.7, 1].map(slamFrameIndex)).toEqual([0, 0, 1, 2, 2]);
  });
});

describe("Story 6.5 review L-b: the body's dim fades (no flicker at the rim)", () => {
  it("moves toward 0.55 / 1 over 0.25 s, never jumps", async () => {
    const { BOSS_DIM_ALPHA, bossBodyAlpha } = await import("./BossView");
    let a = 1;
    a = bossBodyAlpha(a, true, 1 / 60);
    expect(a).toBeLessThan(1);
    expect(a).toBeGreaterThan(0.95);
    for (let i = 0; i < 30; i++) a = bossBodyAlpha(a, true, 1 / 60);
    expect(a).toBe(BOSS_DIM_ALPHA);
    a = bossBodyAlpha(a, false, 1 / 60);
    expect(a).toBeGreaterThan(BOSS_DIM_ALPHA);
    expect(a).toBeLessThan(0.6);
  });
});

describe("Story 6.6 the charge lane as drawn (F1, F2, AC 8)", () => {
  const balance = loadBalance();
  const R = balance.boss.radiusM;
  const C = balance.boss.charge;
  const lane: LaneLook = { x0: 0, y0: 0, lengthM: 0, angle: 0, frontX: 0, frontY: 0 };

  it("from the body's back at the start to its front at the stop, along the fixed direction; the sim's swept lane exactly", () => {
    const w = createWorld({ balance, seed: 1 });
    for (const deg of [0, 37, 90, 200, 315]) {
      const a = (deg * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const sweep = sweepChargeLane(w, 24, 16, dx, dy, { lenM: 0, crash: false });
      chargeLaneLook(24, 16, dx, dy, sweep.lenM, R, lane);
      expect(lane.lengthM).toBeCloseTo(sweep.lenM + 2 * R, 9);
      expect(lane.x0).toBeCloseTo(24 - dx * R, 9);
      expect(lane.frontX).toBeCloseTo(24 + dx * (sweep.lenM + R), 9);
      expect(lane.frontY).toBeCloseTo(16 + dy * (sweep.lenM + R), 9);
      expect(lane.angle).toBeCloseTo(Math.atan2(dy, dx), 9);
    }
    expect(C.laneWidthM).toBe(4.8);
  });

  it("the fill grows from the start tick, is full on the hit tick, stays full through the rush, fades 0.3 s after the stop", () => {
    const out: TelegraphLook = { progress: 0, visible: false, alpha: 0 };
    const stop = chargeStopTick(120, 10, C.speedMps);
    expect(stop).toBe(120 + 17 - 1);
    expect(chargeStopTick(120, 6, C.speedMps)).toBe(120 + 10 - 1);
    expect(chargeLaneProgress(110, 100, 120, stop, out).progress).toBeCloseTo(0.5, 9);
    expect(chargeLaneProgress(120, 100, 120, stop, out).progress).toBe(1);
    expect(chargeLaneProgress(130, 100, 120, stop, out)).toMatchObject({ progress: 1, visible: true, alpha: 1 });
    const fade = TELEGRAPH_FADE_S / TICK_DT_S;
    expect(chargeLaneProgress(stop + fade / 2, 100, 120, stop, out).alpha).toBeCloseTo(0.5, 9);
    expect(chargeLaneProgress(stop + fade + 0.01, 100, 120, stop, out).visible).toBe(false); // a woken tab after the stop: nothing
  });
});

describe("Story 6.6 the throw as drawn (F7, AC 8)", () => {
  it("the inner ring shrinks from 3 m to 0 over lift + flight (start → impact)", () => {
    const out: TelegraphLook = { progress: 0, visible: false, alpha: 0 };
    expect(throwInnerRadius(telegraphProgress(100, 100, 136, out).progress, 3)).toBe(3);
    expect(throwInnerRadius(telegraphProgress(118, 100, 136, out).progress, 3)).toBeCloseTo(1.5, 9);
    expect(throwInnerRadius(telegraphProgress(136, 100, 136, out).progress, 3)).toBe(0);
  });

  it("the chunk flies only between the release and the impact, on an arc from the boss to the spot", () => {
    const c: ChunkLook = { visible: false, x: 0, y: 0, heightM: 0, f: 0 };
    expect(throwChunkAt(119, 120, 136, 0, 0, 16, 0, c).visible).toBe(false); // still in its hands (the lift)
    throwChunkAt(128, 120, 136, 0, 0, 16, 0, c);
    expect(c).toMatchObject({ visible: true, x: 8, y: 0, f: 0.5 });
    expect(c.heightM).toBeCloseTo(3, 9);
    expect(throwChunkAt(136, 120, 136, 0, 0, 16, 0, c)).toMatchObject({ x: 16, heightM: 0 });
    expect(throwChunkAt(136.5, 120, 136, 0, 0, 16, 0, c).visible).toBe(false); // landed: the crater
  });
});

describe("Story 6.7 the collapse (D6)", () => {
  it("three frames over collapseS, then the last one", () => {
    expect(deathFrameIndex(0, 1.5)).toBe(0);
    expect(deathFrameIndex(0.6, 1.5)).toBe(1);
    expect(deathFrameIndex(1.2, 1.5)).toBe(2);
    expect(deathFrameIndex(60, 1.5)).toBe(2);
  });
});
