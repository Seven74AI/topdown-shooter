/**
 * Story 3.4 netsim (Epic 3 brief line 4): walking into barricades with client prediction. The real
 * server `RunController` (barricades placed through `placeBuilding`) and the real client `Predictor`,
 * joined by a simulated network in virtual time, as in `predictionCircle.test.ts`. Each snapshot
 * carries the server's buildings as the schema would (`BuildingStateView` by id) and the client copies
 * them into the predictor before reconciling, as `NetSimHost.takeSnapshot` does.
 */
import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, TICK_DT_S, createRng, damageBuilding, loadBalance, PLACEHOLDER_MAP, type BuildingStateView, type PlayerInput } from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";
import { PREDICTION_IGNORE_M } from "../../apps/client/src/net/netConfig";

const balance = loadBalance();
const TICK_MS = TICK_DT_S * 1000;
const FRAME_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const ID = "p0";
const WOOD = "wood_barricade";

interface Snap {
  x: number;
  y: number;
  ackSeq: number;
  buildings: Map<string, BuildingStateView>;
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

interface Place {
  atMs: number;
  gx: number;
  gy: number;
  rot: number;
}

interface Options {
  seed: number;
  oneWayMs: number;
  jitterHalfMs: number;
  /** Barricades the server places (between ticks) at these times. */
  places: Place[];
  /** Move direction at time t (ms). */
  path: (t: number) => { x: number; y: number };
  seconds: number;
  /** Control run: the client never copies the buildings into the predictor. */
  ignoreBuildings?: boolean;
  /** Story 3.5: at these times the server breaks the building at (gx, gy) (as a zombie's last hit would). */
  breaks?: { atMs: number; gx: number; gy: number }[];
}

function buildingsView(ctrl: RunController): Map<string, BuildingStateView> {
  const m = new Map<string, BuildingStateView>();
  for (const b of ctrl.world.buildings.list) m.set(String(b.id), { type: b.type, owner: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot, hp: Math.ceil(b.hp) });
  return m;
}

function simulate(o: Options) {
  const rng = createRng(o.seed);
  const ctrl = new RunController({ balance, seed: 1, players: [{ playerId: ID, slot: 0 }], pauseWaves: true, systems: { waves: () => {} } });
  const me = ctrl.world.players.get(ID);
  if (me) me.wallet = 1000;
  const up = new Link<PlayerInput>(o.oneWayMs, o.jitterHalfMs, rng);
  const down = new Link<Snap>(o.oneWayMs, o.jitterHalfMs, rng);
  const predictor = new Predictor(balance, PLACEHOLDER_MAP, ID);
  const inputs: PlayerInput[] = [];
  const snaps: Snap[] = [];
  const errors: number[] = [];
  const pending = [...o.places];
  let nextServerMs = Math.floor(rng.range(0, TICK_MS));
  let nextFrameMs = 0;
  let lastFrameMs = 0;
  let accMs = 0;
  let seq = 0;
  let placed = 0;
  let broken = 0;
  const breaks = [...(o.breaks ?? [])];
  let minWallGapM = Infinity;
  for (let t = 0; t <= o.seconds * 1000; t++) {
    while (pending.length > 0 && (pending[0] as Place).atMs <= t) {
      const p = pending.shift() as Place;
      if (ctrl.placeBuilding(ID, { type: WOOD, gx: p.gx, gy: p.gy, rot: p.rot }).ok) placed++;
    }
    while (breaks.length > 0 && (breaks[0] as { atMs: number }).atMs <= t) {
      const k = breaks.shift() as { gx: number; gy: number };
      const b = ctrl.world.buildings.list.find((x) => x.gx === k.gx && x.gy === k.gy);
      if (b && damageBuilding(ctrl.world, b, b.hp)) broken++;
    }
    if (t >= nextServerMs) {
      nextServerMs += TICK_MS;
      up.take(t, inputs);
      for (const input of inputs) ctrl.queueInput(ID, input);
      ctrl.tick();
      const p = ctrl.world.players.get(ID);
      if (p) {
        down.send(t, { x: Math.fround(p.x), y: Math.fround(p.y), ackSeq: ctrl.ackSeq(ID), buildings: buildingsView(ctrl) });
        for (const b of ctrl.world.buildings.list) {
          const cx = Math.min(b.maxX, Math.max(b.minX, p.x));
          const cy = Math.min(b.maxY, Math.max(b.minY, p.y));
          minWallGapM = Math.min(minWallGapM, Math.hypot(p.x - cx, p.y - cy) - p.radiusM);
        }
      }
    }
    if (t >= nextFrameMs) {
      nextFrameMs += FRAME_MS;
      const dtMs = t - lastFrameMs;
      lastFrameMs = t;
      down.take(t, snaps);
      for (const s of snaps) {
        if (!o.ignoreBuildings) predictor.syncBuildings(s.buildings);
        predictor.reconcile(s.ackSeq, s.x, s.y, "alive");
        errors.push(predictor.stats.lastErrorM);
      }
      accMs += dtMs;
      let steps = 0;
      while (accMs >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
        const d = o.path(t);
        const input: PlayerInput = { ...NEUTRAL_INPUT, seq: ++seq, moveX: d.x, moveY: d.y, aimX: d.x, aimY: d.y };
        up.send(t, input);
        predictor.applyLocal(input);
        accMs -= TICK_MS;
        steps++;
      }
      predictor.frame(dtMs / 1000);
    }
  }
  const sp = ctrl.world.players.get(ID);
  return {
    snaps: predictor.stats.snaps,
    corrections: predictor.stats.corrections,
    maxErrorM: errors.reduce((m, e) => Math.max(m, e), 0),
    visibleErrors: errors.filter((e) => e >= PREDICTION_IGNORE_M).length,
    placed,
    broken,
    minWallGapM,
    finalErrorM: Math.hypot(predictor.x - (sp?.x ?? 0), predictor.y - (sp?.y ?? 0)),
    predictorBuildings: predictor.buildingCount,
  };
}

const norm = (x: number, y: number) => {
  const l = Math.hypot(x, y);
  return { x: x / l, y: y / l };
};
/** Up into the wall, slide right round its end, back left across its top, press down on it, stop. */
const zigzag = (t: number) =>
  t < 2000 ? { x: 0, y: -1 } : t < 4000 ? norm(0.6, -1) : t < 6000 ? norm(-1, 0.4) : t < 8000 ? { x: 0, y: 1 } : { x: 0, y: 0 };
/** Spawn (22.5, 14.5): a wall of three touching barricades, x ∈ [19, 25], y ∈ [10.75, 11.25]. */
const WALL: Place[] = [
  { atMs: 0, gx: 20, gy: 11, rot: 0 },
  { atMs: 0, gx: 22, gy: 11, rot: 0 },
  { atMs: 0, gx: 24, gy: 11, rot: 0 },
];

const report = (name: string, r: ReturnType<typeof simulate>): void => {
  console.info(
    `[netsim] ${name}: snaps=${r.snaps} corrections=${r.corrections} visible=${r.visibleErrors} maxErrorM=${r.maxErrorM.toExponential(2)} minWallGapM=${r.minWallGapM.toFixed(4)}`,
  );
};

describe("netsim: walking into barricades (Story 3.4, brief line 4)", () => {
  it("150 ms RTT, 20 ms jitter: pressing on, sliding along and round a wall gives 0 snaps and no visible error", () => {
    for (const seed of [31, 32, 33]) {
      const r = simulate({ seed, oneWayMs: 75, jitterHalfMs: 10, places: WALL, path: zigzag, seconds: 10 });
      report(`wall 75±10 ms seed ${seed}`, r);
      expect(r.placed).toBe(3);
      expect(r.predictorBuildings).toBe(3);
      expect(r.minWallGapM).toBeGreaterThan(-1e-6); // the server never let the survivor into the wall
      expect(r.minWallGapM).toBeLessThan(1e-6); // ... and it really pressed on it
      expect(r.snaps).toBe(0);
      expect(r.visibleErrors).toBe(0);
      expect(r.maxErrorM).toBeLessThan(PREDICTION_IGNORE_M);
      expect(r.finalErrorM).toBeLessThan(PREDICTION_IGNORE_M);
    }
  });

  it("300 ms RTT, 40 ms jitter: still 0 snaps", () => {
    const r = simulate({ seed: 34, oneWayMs: 150, jitterHalfMs: 20, places: WALL, path: zigzag, seconds: 10 });
    report("wall 150±20 ms", r);
    expect(r.snaps).toBe(0);
    expect(r.maxErrorM).toBeLessThan(PREDICTION_IGNORE_M);
  });

  it("a barricade placed ahead of a walking survivor: the client learns it before reaching it, 0 snaps", () => {
    const r = simulate({ seed: 35, oneWayMs: 75, jitterHalfMs: 10, places: [{ atMs: 1000, gx: 22, gy: 7, rot: 0 }], path: (t) => (t < 3000 ? norm(0.1, -1) : { x: 0, y: 0 }), seconds: 4 });
    report("placed ahead 75±10 ms", r);
    expect(r.placed).toBe(1);
    expect(r.minWallGapM).toBeLessThan(1e-6);
    expect(r.snaps).toBe(0);
    expect(r.maxErrorM).toBeLessThan(PREDICTION_IGNORE_M);
  });

  it("Story 3.5: the barricade I press on breaks: it leaves my prediction with the same patch, I walk on through: 0 snaps, one smoothed correction", () => {
    for (const seed of [36, 37]) {
      const r = simulate({
        seed,
        oneWayMs: 75,
        jitterHalfMs: 10,
        places: WALL,
        breaks: [{ atMs: 2500, gx: 22, gy: 11 }],
        path: (t) => (t < 5000 ? { x: 0, y: -1 } : { x: 0, y: 0 }),
        seconds: 6,
      });
      report(`broken under me 75±10 ms seed ${seed}`, r);
      expect(r.broken).toBe(1);
      expect(r.predictorBuildings).toBe(2);
      expect(r.snaps).toBe(0);
      // The break can't be predicted: the inputs I sent during the RTT moved me on at the server while
      // my prediction still stood at the wall. One smoothed correction of at most speed × (RTT + jitter + a tick).
      expect(r.corrections).toBeLessThanOrEqual(1);
      expect(r.maxErrorM).toBeLessThan(balance.player.speedMps * (0.15 + 0.02 + TICK_DT_S));
      expect(r.finalErrorM).toBeLessThan(PREDICTION_IGNORE_M);
    }
  });

  it("control: a predictor without the buildings walks into the wall and corrects on almost every snapshot", () => {
    const r = simulate({ seed: 31, oneWayMs: 75, jitterHalfMs: 10, places: WALL, path: zigzag, seconds: 10, ignoreBuildings: true });
    report("wall, buildings ignored", r);
    expect(r.snaps + r.visibleErrors).toBeGreaterThan(5);
  });
});
