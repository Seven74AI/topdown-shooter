/**
 * Story 4.5 netsim (brief lines 2 and 11): a decay stage change at a build start under lag. The real
 * server `RunController` (the build start through the run state machine: `startWave` + `skipWave` →
 * `endWave` → `startBuild` → DecaySystem) and the real client `Predictor` + a mirror World, joined by
 * a simulated network (75 ± 10 ms one way = `?lag=150&jitter=20`) in virtual time. Each snapshot
 * carries the state's `decayStage` / `decayVariants`; the client applies them with `mirrorDecay`
 * (the shared `applyDecayStage`) before reconciling, as `NetSimHost.takeSnapshot` does.
 *
 * The survivor walks up and down alley 3 through the cells the stage-2 dumpster blocks. After the
 * change the client must collide like the server: at most one correction (the server's push-out
 * when the dumpster lands on the survivor), then none while pressing on it, the prediction never inside the
 * dumpster, both Worlds with the same solids. Control: a client that ignores the decay fields keeps
 * walking through the dumpster and is corrected again and again. A second run hides the tab across
 * the build start (no frames for 4 s; then everything queued arrives at once).
 */
import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, NEUTRAL_INPUT, NO_SYSTEMS, TICK_DT_S, createRng, createWorld, loadBalance, skipWave, startWave, type PlayerInput } from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";
import { mirrorDecay } from "../../apps/client/src/net/mirrorDecay";
import { PREDICTION_IGNORE_M } from "../../apps/client/src/net/netConfig";

const balance = loadBalance();
const TICK_MS = TICK_DT_S * 1000;
const FRAME_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const ID = "p0";
const FOUND = DOWNTOWN_MAP.decay.find((m) => m.name === "dumpster_alley_3");
if (!FOUND) throw new Error("dumpster_alley_3");
const DUMP = FOUND;
const X = (DUMP.minX + DUMP.maxX) / 2;

interface Snap {
  x: number;
  y: number;
  ackSeq: number;
  decayStage: number;
  decayVariants: number;
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

interface Options {
  seed: number;
  /** The build start into stage 2 happens at this time. */
  changeAtMs: number;
  seconds: number;
  /** The tab sleeps (no frames) over [from, to). */
  sleep?: { from: number; to: number };
  /** Control: the client never applies the decay fields. */
  ignoreDecay?: boolean;
}

/** Up and down alley 3 through the dumpster's cells (x = its centre; y 24 ↔ 29.5, 1.2 s each way). */
const walk = (t: number, endMs: number) => (t >= endMs - 1500 ? { x: 0, y: 0 } : { x: 0, y: Math.floor(t / 1200) % 2 === 0 ? 1 : -1 });

function simulate(o: Options) {
  const rng = createRng(o.seed);
  const ctrl = new RunController({ balance, seed: o.seed, players: [{ playerId: ID, slot: 0 }], pauseWaves: true, systems: { waves: () => {} }, decayStageByWave: [1, 2] });
  const world = ctrl.world;
  const me = world.players.get(ID);
  if (!me) throw new Error("no player");
  me.x = me.prevX = X;
  me.y = me.prevY = 24;
  const up = new Link<PlayerInput>(75, 10, rng);
  const down = new Link<Snap>(75, 10, rng);
  const predictor = new Predictor(balance, DOWNTOWN_MAP, ID);
  const mirror = createWorld({ balance, seed: 0, map: DOWNTOWN_MAP, systems: NO_SYSTEMS });
  const inputs: PlayerInput[] = [];
  const snaps: Snap[] = [];
  let nextServerMs = Math.floor(rng.range(0, TICK_MS));
  let nextFrameMs = 0;
  let lastFrameMs = 0;
  let accMs = 0;
  let seq = 0;
  let changed = false;
  let insidePredicted = 0;
  let insideServer = 0;
  let visibleAfter = 0;
  let snapsBefore = 0;
  let relocatedAtChange = false;
  const inBox = (x: number, y: number) => x > DUMP.minX - 0.4 + 1e-6 && x < DUMP.maxX + 0.4 - 1e-6 && y > DUMP.minY - 0.4 + 1e-6 && y < DUMP.maxY + 0.4 - 1e-6 && Math.hypot(Math.max(DUMP.minX - x, 0, x - DUMP.maxX), Math.max(DUMP.minY - y, 0, y - DUMP.maxY)) < 0.4 - 1e-6;
  for (let t = 0; t <= o.seconds * 1000; t++) {
    if (!changed && t >= o.changeAtMs && world.run.phase === "build") {
      startWave(world);
      const before = world.players.get(ID);
      const bx = before?.x ?? 0;
      const by = before?.y ?? 0;
      skipWave(world); // the run state machine's build start (wave 2: stage 2 by the table) → DecaySystem
      changed = true;
      relocatedAtChange = Math.hypot((world.players.get(ID)?.x ?? 0) - bx, (world.players.get(ID)?.y ?? 0) - by) > 1e-9;
    }
    if (t >= nextServerMs) {
      nextServerMs += TICK_MS;
      up.take(t, inputs);
      for (const input of inputs) ctrl.queueInput(ID, input);
      ctrl.tick();
      const p = world.players.get(ID);
      if (p) {
        if (world.decay.stage === 2 && inBox(p.x, p.y)) insideServer++;
        down.send(t, { x: Math.fround(p.x), y: Math.fround(p.y), ackSeq: ctrl.ackSeq(ID), decayStage: world.decay.stage, decayVariants: world.decay.variants });
      }
    }
    const asleep = o.sleep !== undefined && t >= o.sleep.from && t < o.sleep.to;
    if (t >= nextFrameMs && !asleep) {
      nextFrameMs += FRAME_MS;
      const dtMs = Math.min(t - lastFrameMs, 1000); // a woken tab: one long frame, capped catch-up
      lastFrameMs = t;
      down.take(t, snaps);
      for (const s of snaps) {
        if (!o.ignoreDecay) {
          predictor.syncDecay(s.decayStage, s.decayVariants);
          mirrorDecay(mirror, s.decayStage, s.decayVariants);
        }
        predictor.reconcile(s.ackSeq, s.x, s.y, "alive");
        if (changed && predictor.stats.lastErrorM >= PREDICTION_IGNORE_M) visibleAfter++;
      }
      if (mirror.decay.stage === 2 && !o.ignoreDecay && inBox(predictor.x, predictor.y)) insidePredicted++;
      accMs += dtMs;
      let steps = 0;
      while (accMs >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
        const d = walk(t, o.seconds * 1000);
        const input: PlayerInput = { ...NEUTRAL_INPUT, seq: ++seq, moveX: d.x, moveY: d.y, aimX: d.x, aimY: d.y };
        up.send(t, input);
        predictor.applyLocal(input);
        accMs -= TICK_MS;
        steps++;
      }
      if (accMs >= TICK_MS) accMs %= TICK_MS;
      predictor.frame(dtMs / 1000);
      if (!changed) snapsBefore = predictor.stats.snaps;
    } else if (asleep) {
      nextFrameMs = t + FRAME_MS;
    }
  }
  return {
    relocatedAtChange,
    serverStage: world.decay.stage,
    mirrorStage: mirror.decay.stage,
    sameSolids: JSON.stringify(mirror.obstacles.solids.map((b) => b.name)) === JSON.stringify(world.obstacles.solids.map((b) => b.name)),
    predictorSolids: predictor.solidNames.join(",") === world.obstacles.solids.map((b) => b.name).join(","),
    snapsAfter: predictor.stats.snaps - snapsBefore,
    corrections: predictor.stats.corrections,
    visibleAfter,
    insidePredicted,
    insideServer,
    finalErrorM: Math.hypot(predictor.x - me.x, predictor.y - me.y),
  };
}

describe("Story 4.5 netsim: a decay stage change under lag (?lag=150&jitter=20)", () => {
  it("client and server agree on the new map; the prediction collides with the dumpster like the server (no corrections after the forced move)", () => {
    let relocatedRuns = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = simulateWithTable(seed, {});
      expect(r.serverStage, `seed ${seed}`).toBe(2);
      expect(r.mirrorStage).toBe(2);
      expect(r.sameSolids).toBe(true);
      expect(r.predictorSolids).toBe(true);
      expect(r.insideServer).toBe(0);
      expect(r.insidePredicted).toBe(0);
      // At most the one forced move at the change (the server pushed me out of the dumpster), then none.
      expect(r.snapsAfter + r.visibleAfter).toBeLessThanOrEqual(2);
      expect(r.finalErrorM).toBeLessThan(1e-3);
      if (r.relocatedAtChange) relocatedRuns++;
      else expect(r.snapsAfter, `seed ${seed}: not moved by the change, so no correction at all`).toBe(0);
    }
    expect(relocatedRuns).toBeGreaterThan(0); // liveness: some changes landed the dumpster on the survivor
    expect(relocatedRuns).toBeLessThan(5); // and some didn't
    // Control: a client that ignores the decay fields walks through the dumpster and keeps being corrected.
    const ctl = simulateWithTable(1, { ignoreDecay: true });
    expect(ctl.serverStage).toBe(2);
    expect(ctl.predictorSolids).toBe(false);
    expect(ctl.visibleAfter + ctl.snapsAfter).toBeGreaterThan(5);
  });

  it("a hidden tab across the build start wakes on the server's map (mirror and Predictor), and never predicts inside the new box", () => {
    const r = simulateWithTable(4, { sleep: { from: 2500, to: 6500 } });
    expect(r.serverStage).toBe(2);
    expect(r.mirrorStage).toBe(2);
    expect(r.sameSolids).toBe(true);
    expect(r.predictorSolids).toBe(true);
    expect(r.insidePredicted).toBe(0);
    expect(r.finalErrorM).toBeLessThan(1e-3);
  });
});

/** The build start after wave 1 enters stage 2 (`decayStageByWave = [1, 2]`, the `DEV_DECAY_STAGES` option). */
function simulateWithTable(seed: number, extra: Partial<Options>) {
  return simulate({ seed, changeAtMs: 2600 + seed * 230, seconds: 9, ...extra });
}
