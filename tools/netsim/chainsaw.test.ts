/**
 * Story 5.2 (F6, AC 5, brief lines 2 and 14): the Chainsaw's wielder slow (20 % while attacking) is
 * predicted. The real server `RunController`, the real client `Predictor` and `LocalFireClock`
 * (fed per seq, as NetSimHost does: `applyLocal(input, clock.moveWeapon, clock.moveSwapping)` before
 * the clock's own step), a simulated network in virtual time (the predictionCircle harness).
 *
 * The client walks a circle and attacks in bursts (1.2 s on, 0.6 s off, aim on and off) and taps
 * swap every 3.5 s (Chainsaw ↔ Pistol), with `?lag=150&jitter=20` (75 ± 10 ms one way). Compared
 * with the same inputs and the Pistol + Machete (no slow anywhere: the baseline) and with a control
 * client that ignores the wield state (what F6 forbids). Known and accepted: until a snapshot names
 * the Chainsaw in my hand (run start, one RTT after buying it) the fire clock can't know it, so an
 * attack in that window costs one correction (the attacks here start at 0.6 s).
 */
import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, TICK_DT_S, createRng, loadBalance, setLoadout, PLACEHOLDER_MAP, type PlayerInput } from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";
import { LocalFireClock, type FireGateView } from "../../apps/client/src/net/localFire";
import { PREDICTION_IGNORE_M } from "../../apps/client/src/net/netConfig";

const balance = loadBalance();
const TICK_MS = TICK_DT_S * 1000;
const FRAME_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const LAP_S = 5;
const ID = "p0";

interface Options {
  seconds: number;
  oneWayMs: number;
  jitterHalfMs: number;
  seed: number;
  weapons: [string, string];
  /** Control: the predictor gets no wield state (what Story 5.2 must not do). */
  ignoreWield?: boolean;
  /** No swap taps. */
  noSwaps?: boolean;
  stopAtMs: number;
}

interface Result {
  corrections: number;
  snaps: number;
  visibleErrors: number;
  maxErrorM: number;
  finalGapM: number;
  /** Server ticks on which the wielder slow was in effect (liveness). */
  slowedTicks: number;
  swaps: number;
}

class Link<T> {
  private readonly items: { due: number; v: T }[] = [];
  private lastDue = -Infinity;
  constructor(
    private readonly oneWayMs: number,
    private readonly jitterHalfMs: number,
    private readonly rng: { range(a: number, b: number): number },
  ) {}
  send(now: number, v: T): void {
    const due = Math.max(this.lastDue, now + this.oneWayMs + this.rng.range(-this.jitterHalfMs, this.jitterHalfMs));
    this.lastDue = due;
    this.items.push({ due, v });
  }
  take(now: number, out: T[]): void {
    out.length = 0;
    while (this.items.length > 0 && (this.items[0] as { due: number }).due <= now) out.push((this.items.shift() as { v: T }).v);
  }
}

interface Snap {
  x: number;
  y: number;
  gate: FireGateView;
}

function simulate(o: Options): Result {
  const rng = createRng(o.seed);
  const ctrl = new RunController({ balance, seed: 1, players: [{ playerId: ID, slot: 0 }], pauseWaves: true, systems: { waves: () => {} }, map: PLACEHOLDER_MAP });
  const sp = ctrl.world.players.get(ID);
  if (!sp) throw new Error("no player");
  setLoadout(balance, sp.loadout, o.weapons);
  const up = new Link<PlayerInput>(o.oneWayMs, o.jitterHalfMs, rng);
  const down = new Link<Snap>(o.oneWayMs, o.jitterHalfMs, rng);
  const predictor = new Predictor(balance, PLACEHOLDER_MAP, ID);
  const clock = new LocalFireClock(balance);
  let me: FireGateView | undefined;
  const arrivedInputs: PlayerInput[] = [];
  const arrivedSnaps: Snap[] = [];
  let nextServerMs = Math.floor(rng.range(0, TICK_MS));
  let nextFrameMs = 0;
  let lastFrameMs = 0;
  let accMs = 0;
  let seq = 0;
  let visibleErrors = 0;
  let maxErrorM = 0;
  let slowedTicks = 0;
  let swaps = 0;
  let nextSwapMs = 1700;
  const endMs = o.seconds * 1000;
  for (let t = 0; t <= endMs; t++) {
    if (t >= nextServerMs) {
      nextServerMs += TICK_MS;
      up.take(t, arrivedInputs);
      for (const input of arrivedInputs) ctrl.queueInput(ID, input);
      const x0 = sp.x;
      const y0 = sp.y;
      ctrl.tick();
      const moved = Math.hypot(sp.x - x0, sp.y - y0);
      if (moved > 0 && moved < balance.player.speedMps * TICK_DT_S * 0.9) slowedTicks++;
      const lo = sp.loadout;
      down.send(t, {
        x: Math.fround(sp.x),
        y: Math.fround(sp.y),
        gate: {
          status: sp.status,
          active: lo.active,
          swapTicks: lo.swapTicks,
          ackSeq: ctrl.ackSeq(ID),
          weapon0: lo.slots[0].weapon,
          weapon1: lo.slots[1]?.weapon ?? "",
          ammo0: lo.slots[0].ammo,
          ammo1: lo.slots[1]?.ammo ?? 0,
          reloadTicks0: lo.slots[0].reloadTicks,
          reloadTicks1: lo.slots[1]?.reloadTicks ?? 0,
        },
      });
    }
    if (t >= nextFrameMs) {
      nextFrameMs += FRAME_MS;
      const dtMs = t - lastFrameMs;
      lastFrameMs = t;
      down.take(t, arrivedSnaps);
      for (const s of arrivedSnaps) {
        me = s.gate;
        predictor.reconcile(s.gate.ackSeq, s.x, s.y, "alive");
        clock.ack(s.gate.ackSeq);
        maxErrorM = Math.max(maxErrorM, predictor.stats.lastErrorM);
        if (predictor.stats.lastErrorM >= PREDICTION_IGNORE_M) visibleErrors++;
      }
      accMs += dtMs;
      let steps = 0;
      while (accMs >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
        const a = (2 * Math.PI * t) / (LAP_S * 1000);
        const moving = t < o.stopAtMs;
        // From 0.6 s on: the fire clock knows my weapons from the first snapshots (it can't before;
        // the same holds for one RTT after a shop purchase: one correction then, accepted).
        const attacking = moving && t >= 600 && t % 1800 < 1200;
        const swap = !o.noSwaps && moving && t >= nextSwapMs;
        if (swap) {
          nextSwapMs += 3500;
          swaps++;
        }
        const input: PlayerInput = {
          ...NEUTRAL_INPUT,
          seq: ++seq,
          moveX: moving ? Math.cos(a) : 0,
          moveY: moving ? Math.sin(a) : 0,
          // inside the dead zone the stick sends no aim: fire held, aim zero (no swing, no slow)
          aimX: attacking ? -Math.sin(a) : 0,
          aimY: attacking ? Math.cos(a) : 0,
          fire: attacking || t % 3600 < 1800,
          swap,
        };
        up.send(t, input);
        if (o.ignoreWield) predictor.applyLocal(input);
        else predictor.applyLocal(input, clock.moveWeapon, clock.moveSwapping);
        clock.step(input, me);
        accMs -= TICK_MS;
        steps++;
      }
      predictor.frame(dtMs / 1000);
    }
  }
  return {
    corrections: predictor.stats.corrections,
    snaps: predictor.stats.snaps,
    visibleErrors,
    maxErrorM,
    finalGapM: Math.hypot(predictor.renderX(0) - sp.x, predictor.renderY(0) - sp.y),
    slowedTicks,
    swaps,
  };
}

const report = (name: string, r: Result): void => {
  console.info(
    `[netsim chainsaw] ${name}: corrections=${r.corrections} visible=${r.visibleErrors} snaps=${r.snaps} maxErrorM=${r.maxErrorM.toExponential(2)} slowedTicks=${r.slowedTicks} swaps=${r.swaps} finalGap=${r.finalGapM.toExponential(2)}`,
  );
};

describe("netsim: the Chainsaw's wielder slow is predicted (Story 5.2 F6)", () => {
  it("LAN, no swaps: 0 corrections over 200+ attacking ticks", () => {
    const r = simulate({ seconds: 20, oneWayMs: 0, jitterHalfMs: 0, seed: 31, weapons: ["chainsaw", "pistol"], noSwaps: true, stopAtMs: 19_000 });
    report("LAN no swaps", r);
    expect(r.slowedTicks).toBeGreaterThan(200); // liveness: the slow really ran
    expect(r.visibleErrors).toBe(0);
    expect(r.corrections).toBe(0);
  });

  it("?lag=150&jitter=20 with swaps: corrections from the chainsaw ≤ the baseline's; client = server once stopped", () => {
    for (const seed of [32, 33, 34]) {
      const base = { seconds: 30, oneWayMs: 75, jitterHalfMs: 10, seed, stopAtMs: 28_000 } as const;
      const saw = simulate({ ...base, weapons: ["chainsaw", "pistol"] });
      const baseline = simulate({ ...base, weapons: ["machete", "pistol"] });
      report(`75±10 ms seed ${seed} chainsaw`, saw);
      report(`75±10 ms seed ${seed} baseline (machete)`, baseline);
      expect(saw.slowedTicks).toBeGreaterThan(150);
      expect(saw.swaps).toBeGreaterThan(5);
      expect(saw.snaps).toBe(0);
      expect(saw.visibleErrors).toBeLessThanOrEqual(baseline.visibleErrors);
      expect(saw.finalGapM).toBeLessThan(PREDICTION_IGNORE_M);
    }
  });

  it("control: a predictor that ignores the wield state corrects on almost every attacking snapshot", () => {
    const r = simulate({ seconds: 30, oneWayMs: 75, jitterHalfMs: 10, seed: 32, weapons: ["chainsaw", "pistol"], ignoreWield: true, stopAtMs: 28_000 });
    report("75±10 ms wield ignored", r);
    expect(r.visibleErrors).toBeGreaterThan(100);
  });
});
