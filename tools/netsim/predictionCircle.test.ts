/**
 * Network harness for client prediction (Story 2.6, AC 2 and AC 4): the real server
 * `RunController` and the real client `Predictor`, joined by a simulated network in virtual time.
 *
 * - The server ticks every 50 ms at a random phase; its per-tick snapshot is `{ tick, x, y, ackSeq }`
 *   rounded to float32 like the schema.
 * - The client renders every 16.67 ms (integer ms frames), steps every 50 ms like NetSimHost, and
 *   sends a circle input (one lap per 4 s).
 * - One-way delay `oneWayMs ± jitterHalfMs` in both directions, ordered (TCP never reorders).
 */
import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, TICK_DT_S, createRng, loadBalance, PLACEHOLDER_MAP, type PlayerInput } from "@topdown/shared";
import {
  INPUT_DRAIN_AFTER_TICKS,
  INPUT_DRAIN_EVERY_TICKS,
  INPUT_QUEUE_MAX,
  RunController,
} from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";
import { PREDICTION_IGNORE_M } from "../../apps/client/src/net/netConfig";

const balance = loadBalance();
const SPEED = balance.player.speedMps;
const TICK_MS = TICK_DT_S * 1000;
const FRAME_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const LAP_S = 4;
const ID = "p0";

interface NetOptions {
  seconds: number;
  oneWayMs: number;
  jitterHalfMs: number;
  seed: number;
  /** Feed the controller only the newest arrival per tick (what the input queue exists to avoid). */
  newestOnly?: boolean;
  /** Client → server inputs are held during [fromMs, toMs) and then arrive in one burst. */
  stall?: { fromMs: number; toMs: number };
  /** The client stops moving from this time on (ms). */
  stopAtMs?: number;
}

interface Result {
  snaps: number;
  corrections: number;
  /** Largest reconcile error over the whole run (m). */
  maxErrorM: number;
  /** Largest reconcile error from `settleFromMs` on (m). */
  maxErrorAfterMs: (fromMs: number) => number;
  /** Largest move of the drawn position between two frames, as a multiple of speed × frameDt. */
  maxFrameMoveRatio: number;
  finalDrawn: { x: number; y: number };
  finalServer: { x: number; y: number };
  drops: { overflow: number; stale: number; drained: number };
}

/** A FIFO of `[dueMs, payload]` with ordered delivery. */
class Link<T> {
  private readonly items: { due: number; v: T }[] = [];
  private lastDue = -Infinity;
  constructor(
    private readonly oneWayMs: number,
    private readonly jitterHalfMs: number,
    private readonly rng: { range(a: number, b: number): number },
  ) {}
  send(now: number, v: T, notBefore = -Infinity): void {
    const due = Math.max(this.lastDue, notBefore, now + this.oneWayMs + this.rng.range(-this.jitterHalfMs, this.jitterHalfMs));
    this.lastDue = due;
    this.items.push({ due, v });
  }
  /** Items due by `now`, in order. */
  take(now: number, out: T[]): void {
    out.length = 0;
    while (this.items.length > 0 && (this.items[0] as { due: number }).due <= now) out.push((this.items.shift() as { v: T }).v);
  }
}

interface Snap {
  x: number;
  y: number;
  ackSeq: number;
}

function simulate(o: NetOptions): Result {
  const rng = createRng(o.seed);
  const ctrl = new RunController({ balance, seed: 1, players: [{ playerId: ID, slot: 0 }], pauseWaves: true, systems: { waves: () => {} } });
  const up = new Link<PlayerInput>(o.oneWayMs, o.jitterHalfMs, rng);
  const down = new Link<Snap>(o.oneWayMs, o.jitterHalfMs, rng);
  const predictor = new Predictor(balance, PLACEHOLDER_MAP, ID);
  const phaseMs = Math.floor(rng.range(0, TICK_MS));
  const endMs = o.seconds * 1000;
  const arrivedInputs: PlayerInput[] = [];
  const arrivedSnaps: Snap[] = [];
  const errors: { t: number; e: number }[] = [];
  let nextServerMs = phaseMs;
  let nextFrameMs = 0;
  let lastFrameMs = 0;
  let accMs = 0;
  let seq = 0;
  let lastDrawn: { x: number; y: number } | null = null;
  let maxRatio = 0;
  const drawn = { x: 0, y: 0 };

  for (let t = 0; t <= endMs; t++) {
    if (t >= nextServerMs) {
      nextServerMs += TICK_MS;
      up.take(t, arrivedInputs);
      if (o.newestOnly && arrivedInputs.length > 0) ctrl.queueInput(ID, arrivedInputs[arrivedInputs.length - 1] as PlayerInput);
      else for (const input of arrivedInputs) ctrl.queueInput(ID, input);
      ctrl.tick();
      const p = ctrl.world.players.get(ID);
      if (p) down.send(t, { x: Math.fround(p.x), y: Math.fround(p.y), ackSeq: ctrl.ackSeq(ID) });
    }
    if (t >= nextFrameMs) {
      nextFrameMs += FRAME_MS;
      const dtMs = t - lastFrameMs;
      lastFrameMs = t;
      // Snapshots arrived between frames (socket callbacks): reconcile first.
      down.take(t, arrivedSnaps);
      for (const s of arrivedSnaps) {
        predictor.reconcile(s.ackSeq, s.x, s.y, "alive");
        errors.push({ t, e: predictor.stats.lastErrorM });
      }
      // Then the frame: steps, like NetSimHost.update.
      accMs += dtMs;
      let steps = 0;
      while (accMs >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
        const a = (2 * Math.PI * t) / (LAP_S * 1000);
        const moving = o.stopAtMs === undefined || t < o.stopAtMs;
        const input: PlayerInput = {
          ...NEUTRAL_INPUT,
          seq: ++seq,
          moveX: moving ? Math.cos(a) : 0,
          moveY: moving ? Math.sin(a) : 0,
          aimX: Math.cos(a),
          aimY: Math.sin(a),
        };
        const stalled = o.stall && t >= o.stall.fromMs && t < o.stall.toMs;
        up.send(t, input, o.stall && stalled ? o.stall.toMs + o.oneWayMs : -Infinity);
        predictor.applyLocal(input);
        accMs -= TICK_MS;
        steps++;
      }
      predictor.frame(dtMs / 1000);
      if (!predictor.ready) continue;
      drawn.x = predictor.renderX(accMs / TICK_MS);
      drawn.y = predictor.renderY(accMs / TICK_MS);
      if (lastDrawn && dtMs > 0) {
        const moved = Math.hypot(drawn.x - lastDrawn.x, drawn.y - lastDrawn.y);
        maxRatio = Math.max(maxRatio, moved / ((SPEED * dtMs) / 1000));
      }
      lastDrawn = { x: drawn.x, y: drawn.y };
    }
  }
  const sp = ctrl.world.players.get(ID);
  return {
    snaps: predictor.stats.snaps,
    corrections: predictor.stats.corrections,
    maxErrorM: errors.reduce((m, e) => Math.max(m, e.e), 0),
    maxErrorAfterMs: (from) => errors.filter((e) => e.t >= from).reduce((m, e) => Math.max(m, e.e), 0),
    maxFrameMoveRatio: maxRatio,
    finalDrawn: { x: drawn.x, y: drawn.y },
    finalServer: { x: sp?.x ?? 0, y: sp?.y ?? 0 },
    drops: ctrl.drops(ID),
  };
}

/** Printed into the test log; the story's Completion Notes record them. */
const report = (name: string, r: Result): void => {
  console.info(
    `[netsim] ${name}: snaps=${r.snaps} corrections=${r.corrections} maxErrorM=${r.maxErrorM.toExponential(2)} ` +
      `maxFrameMove=${r.maxFrameMoveRatio.toFixed(3)}×speed·dt drops=${JSON.stringify(r.drops)}`,
  );
};

describe("netsim: predicted circle walk (Story 2.6 AC 4)", () => {
  it("150 ms RTT, 20 ms jitter, 30 s: no snaps, no error, no visible jump", () => {
    for (const seed of [1, 2, 3]) {
      const r = simulate({ seconds: 30, oneWayMs: 75, jitterHalfMs: 10, seed });
      report(`75±10 ms seed ${seed}`, r);
      expect(r.snaps).toBe(0);
      expect(r.maxErrorM).toBeLessThan(0.01);
      expect(r.maxFrameMoveRatio).toBeLessThanOrEqual(1.5);
    }
  });

  it("300 ms RTT, 40 ms jitter: no snaps, corrections below 5 cm", () => {
    for (const seed of [4, 5, 6]) {
      const r = simulate({ seconds: 30, oneWayMs: 150, jitterHalfMs: 20, seed });
      report(`150±20 ms seed ${seed}`, r);
      expect(r.snaps).toBe(0);
      expect(r.maxErrorM).toBeLessThan(0.05);
      expect(r.maxFrameMoveRatio).toBeLessThanOrEqual(1.5);
    }
  });

  it("why the input queue exists: applying only the newest arrival shows errors", () => {
    const r = simulate({ seconds: 30, oneWayMs: 75, jitterHalfMs: 20, seed: 7, newestOnly: true });
    report("newest-only 75±20 ms", r);
    expect(r.maxErrorM).toBeGreaterThan(0.1);
    expect(r.corrections).toBeGreaterThan(0);
  });

  it("stall → burst → drain: the server skips inputs, the prediction converges with no lasting error", () => {
    const stall = { fromMs: 5000, toMs: 5400 }; // 8 inputs held, then one burst
    // The queue overflows at once, then sits above target until the drain starts skipping.
    const drainDoneMs = stall.toMs + (INPUT_DRAIN_AFTER_TICKS + INPUT_QUEUE_MAX * INPUT_DRAIN_EVERY_TICKS + 10) * TICK_MS;
    const stopAtMs = drainDoneMs + 3000;
    const r = simulate({ seconds: stopAtMs / 1000 + 2, oneWayMs: 75, jitterHalfMs: 10, seed: 8, stall, stopAtMs });
    report("stall-burst-drain", r);
    expect(r.drops.overflow + r.drops.drained).toBeGreaterThan(0); // movement really was skipped
    expect(r.drops.drained).toBeGreaterThan(0);
    expect(r.maxErrorAfterMs(drainDoneMs)).toBeLessThan(PREDICTION_IGNORE_M); // exact again
    expect(Math.hypot(r.finalDrawn.x - r.finalServer.x, r.finalDrawn.y - r.finalServer.y)).toBeLessThan(PREDICTION_IGNORE_M);
  });
});
