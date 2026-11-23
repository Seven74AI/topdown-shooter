/**
 * Story 3.4 netsim (Epic 3 brief line 4): walking into barricades with client prediction. The real
 * server `RunController` (barricades placed through `placeBuilding`) and the real client `Predictor`,
 * joined by a simulated network in virtual time, as in `predictionCircle.test.ts`. Each snapshot
 * carries the server's buildings as the schema would (`BuildingStateView` by id) and the client copies
 * them into the predictor before reconciling, as `NetSimHost.takeSnapshot` does.
 */
import { describe, expect, it } from "vitest";
import {
  DOWNTOWN_MAP,
  NEUTRAL_INPUT,
  TICK_DT_S,
  createRng,
  damageBuilding,
  loadBalance,
  PLACEHOLDER_MAP,
  type BuildingStateView,
  type DistrictMap,
  type PlayerInput,
} from "@topdown/shared";
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
  /** Story 5.9: the type (default the wood barricade). */
  type?: string;
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
  /** Story 4.1: the predictor's map (default the server's, `DOWNTOWN_MAP`; the control run passes the open street). */
  predictorMap?: DistrictMap;
  /** Story 4.2: where the survivor starts (default: the team start). */
  start?: { x: number; y: number };
  /** Story 5.9: at these times the owner upgrades the building at (gx, gy) (between ticks, as the message handler does). */
  upgrades?: { atMs: number; gx: number; gy: number }[];
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
  if (me && o.start) {
    me.x = me.prevX = o.start.x;
    me.y = me.prevY = o.start.y;
  }
  const up = new Link<PlayerInput>(o.oneWayMs, o.jitterHalfMs, rng);
  const down = new Link<Snap>(o.oneWayMs, o.jitterHalfMs, rng);
  const predictor = new Predictor(balance, o.predictorMap ?? DOWNTOWN_MAP, ID);
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
  const upgrades = [...(o.upgrades ?? [])];
  let upgraded = 0;
  let upgradedAtMs = -1;
  /** Story 5.9: when the predictor's World first showed a non-wood tier (frame time), and frames the survivor stood on floor. */
  let predictorTierAtMs = -1;
  let onFloorTicks = 0;
  const predWorld = (predictor as unknown as { world: { buildings: { list: { type: string; solid: boolean; minX: number; minY: number; maxX: number; maxY: number }[] } } }).world;
  let minWallGapM = Infinity;
  for (let t = 0; t <= o.seconds * 1000; t++) {
    while (pending.length > 0 && (pending[0] as Place).atMs <= t) {
      const p = pending.shift() as Place;
      if (ctrl.placeBuilding(ID, { type: p.type ?? WOOD, gx: p.gx, gy: p.gy, rot: p.rot }).ok) placed++;
    }
    while (upgrades.length > 0 && (upgrades[0] as { atMs: number }).atMs <= t) {
      const u = upgrades.shift() as { atMs: number; gx: number; gy: number };
      const b = ctrl.world.buildings.list.find((x) => x.gx === u.gx && x.gy === u.gy);
      if (b && ctrl.upgradeBuilding(ID, b.id).ok) {
        upgraded++;
        upgradedAtMs = t;
      }
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
          if (!b.solid && Math.hypot(p.x - cx, p.y - cy) < p.radiusM) onFloorTicks++; // Story 5.9: standing on a trap or mine
        }
        for (const b of [...ctrl.world.buildings.list.filter((x) => x.solid), ...ctrl.world.obstacles.solids]) { // Story 4.2: + active cover; Story 5.9: walls only
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
      if (predictorTierAtMs < 0 && predWorld.buildings.list.some((b) => b.type !== WOOD && b.solid)) predictorTierAtMs = t;
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
    upgraded,
    upgradedAtMs,
    predictorTierAtMs,
    onFloorTicks,
  };
}

const norm = (x: number, y: number) => {
  const l = Math.hypot(x, y);
  return { x: x / l, y: y / l };
};
/** Up into the wall, slide right round its end, back left across its top, press down on it, stop. */
const zigzag = (t: number) =>
  t < 2000 ? { x: 0, y: -1 } : t < 4000 ? norm(0.6, -1) : t < 6000 ? norm(-1, 0.4) : t < 8000 ? { x: 0, y: 1 } : { x: 0, y: 0 };
/** Spawn (22.5, 14.5): a wall of three touching barricades, x ∈ [19, 25], y ∈ [10.5, 11] (corners in 0.5 m lattice units). */
const WALL: Place[] = [
  { atMs: 0, gx: 38, gy: 21, rot: 0 },
  { atMs: 0, gx: 42, gy: 21, rot: 0 },
  { atMs: 0, gx: 46, gy: 21, rot: 0 },
];
/** Review H2: an L corner right above-right of the spawn ([21, 23] × [12.5, 13] + [23, 23.5] × [12.5, 14.5]). */
const CORNER: Place[] = [
  { atMs: 0, gx: 42, gy: 25, rot: 0 },
  { atMs: 0, gx: 46, gy: 25, rot: 1 },
];
/** Into the corner, along the top wall, back into the corner, down the side wall and out past its end. */
const cornerPath = (t: number) =>
  t < 1500 ? norm(1, -1) : t < 2500 ? norm(-1, -0.3) : t < 4000 ? norm(1, -0.6) : t < 6000 ? norm(1, 0.5) : { x: 0, y: 0 };
/** Review H1: a 0.5 m slot ([22.5, 23] between two rot-1 barricades, y ∈ [10, 12]) right above the spawn. */
const SLOT: Place[] = [
  { atMs: 0, gx: 44, gy: 20, rot: 1 },
  { atMs: 0, gx: 46, gy: 20, rot: 1 },
];
const slotPath = (t: number) => (t < 4000 ? norm(Math.sin(t / 150) * 0.3, -1) : { x: 0, y: 0 });

/**
 * Story 4.1: from the spawn (22.5, 14.5) east into the crashed bus (x ∈ [30, 40], y ∈ [14.5, 17]),
 * down its west face and round its corner, then up-left across the intersection and into the
 * bottom-right corner of the NW apartments ([11, 18] × [0, 10]).
 */
const downtownPath = (t: number) =>
  t < 2000 ? { x: 1, y: 0 } : t < 3000 ? norm(1, 0.6) : t < 5000 ? norm(-1, -1) : t < 7000 ? norm(-1, -0.3) : { x: 0, y: 0 };

/**
 * Story 4.2: from (6, 11.5) down onto the roof of street_car_west ([4, 8.5] × [13, 15]), slide east
 * round its corner, down its east face, then west under it along its south face.
 */
const carPath = (t: number) =>
  t < 1500 ? { x: 0, y: 1 } : t < 3000 ? norm(1, 0.25) : t < 4500 ? norm(-1, 0.6) : t < 6500 ? norm(-1, -0.4) : { x: 0, y: 0 };

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

  it("H2/H1: pressing into an L corner and into a slot narrower than the body: 0 snaps, no visible error", () => {
    for (const [name, places, path] of [
      ["L corner", CORNER, cornerPath],
      ["slot", SLOT, slotPath],
    ] as const) {
      for (const seed of [36, 37]) {
        const r = simulate({ seed, oneWayMs: 75, jitterHalfMs: 10, places, path, seconds: 8 });
        report(`${name} 75±10 ms seed ${seed}`, r);
        expect(r.placed).toBe(places.length);
        expect(r.minWallGapM).toBeGreaterThan(-1e-6);
        expect(r.minWallGapM).toBeLessThan(0.05);
        expect(r.snaps).toBe(0);
        expect(r.visibleErrors).toBe(0);
        expect(r.finalErrorM).toBeLessThan(PREDICTION_IGNORE_M);
      }
    }
  });

  it("Story 4.1: into the bus and a Downtown building: 0 snaps (the predictor has the server's map); control: the open street snaps", () => {
    for (const seed of [41, 42]) {
      const r = simulate({ seed, oneWayMs: 75, jitterHalfMs: 10, places: [], path: downtownPath, seconds: 8 });
      report(`downtown 75±10 ms seed ${seed}`, r);
      expect(r.minWallGapM).toBeGreaterThan(-1e-6); // never inside the bus or a building
      expect(r.minWallGapM).toBeLessThan(1e-6); // ... and it really pressed on them
      expect(r.snaps).toBe(0);
      expect(r.visibleErrors).toBe(0);
      expect(r.finalErrorM).toBeLessThan(PREDICTION_IGNORE_M);
    }
    const control = simulate({ seed: 41, oneWayMs: 75, jitterHalfMs: 10, places: [], path: downtownPath, seconds: 8, predictorMap: PLACEHOLDER_MAP });
    report("downtown control (predictor on the open street)", control);
    expect(control.visibleErrors).toBeGreaterThan(0);
  });

  it("Story 4.2: pressing on and sliding round a street car: 0 snaps (the predictor has the server's cover); control: a predictor without cover snaps", () => {
    for (const seed of [43, 44]) {
      const r = simulate({ seed, oneWayMs: 75, jitterHalfMs: 10, places: [], path: carPath, seconds: 8, start: { x: 6, y: 11.5 } });
      report(`street car 75±10 ms seed ${seed}`, r);
      expect(r.minWallGapM).toBeGreaterThan(-1e-6); // never inside the car
      expect(r.minWallGapM).toBeLessThan(1e-6); // ... and it really pressed on it
      expect(r.snaps).toBe(0);
      expect(r.visibleErrors).toBe(0);
      expect(r.finalErrorM).toBeLessThan(PREDICTION_IGNORE_M);
    }
    const control = simulate({ seed: 43, oneWayMs: 75, jitterHalfMs: 10, places: [], path: carPath, seconds: 8, start: { x: 6, y: 11.5 }, predictorMap: { ...DOWNTOWN_MAP, cover: [] } });
    report("street car control (predictor without cover)", control);
    expect(control.visibleErrors).toBeGreaterThan(0);
  });

  it("300 ms RTT, 40 ms jitter: still 0 snaps", () => {
    const r = simulate({ seed: 34, oneWayMs: 150, jitterHalfMs: 20, places: WALL, path: zigzag, seconds: 10 });
    report("wall 150±20 ms", r);
    expect(r.snaps).toBe(0);
    expect(r.maxErrorM).toBeLessThan(PREDICTION_IGNORE_M);
  });

  it("a barricade placed ahead of a walking survivor: the client learns it before reaching it, 0 snaps", () => {
    const r = simulate({ seed: 35, oneWayMs: 75, jitterHalfMs: 10, places: [{ atMs: 1000, gx: 42, gy: 13, rot: 0 }], path: (t) => (t < 3000 ? norm(0.1, -1) : { x: 0, y: 0 }), seconds: 4 });
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
        breaks: [{ atMs: 2500, gx: 42, gy: 21 }],
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

  it("Story 5.9: walking straight across a spike trap and a mine: 0 snaps, 0 corrections (floor never blocks the predicted survivor)", () => {
    // From the spawn (22.5, 14.5) straight up: a 2 × 2 trap at [21.5, 23.5] × [11, 13] and a mine at [22, 22.5] × [9, 9.5].
    const FLOOR: Place[] = [
      { atMs: 0, gx: 43, gy: 22, rot: 0, type: "spike_trap" },
      { atMs: 0, gx: 44, gy: 18, rot: 0, type: "mine" },
    ];
    for (const seed of [51, 52]) {
      const r = simulate({ seed, oneWayMs: 75, jitterHalfMs: 10, places: FLOOR, path: (t) => (t < 2500 ? { x: 0, y: -1 } : { x: 0, y: 0 }), seconds: 3 });
      report(`across a trap and a mine 75±10 ms seed ${seed}`, r);
      expect(r.placed).toBe(2);
      expect(r.predictorBuildings).toBe(2);
      expect(r.onFloorTicks).toBeGreaterThan(10); // liveness: it really walked over them
      expect(r.snaps).toBe(0);
      expect(r.corrections).toBe(0);
      expect(r.visibleErrors).toBe(0);
    }
  });

  it("Story 5.9: an upgrade of the wall I press on under 150 ms RTT: the predictor shows the new tier only when a snapshot carries it, 0 snaps", () => {
    for (const seed of [53, 54]) {
      const r = simulate({ seed, oneWayMs: 75, jitterHalfMs: 10, places: WALL, upgrades: [{ atMs: 1500, gx: 42, gy: 21 }, { atMs: 2500, gx: 42, gy: 21 }], path: (t) => (t < 4000 ? { x: 0, y: -1 } : { x: 0, y: 0 }), seconds: 5 });
      report(`upgrade under me 75±10 ms seed ${seed}`, r);
      expect(r.upgraded).toBe(2);
      expect(r.predictorTierAtMs).toBeGreaterThanOrEqual(1500 + 75 - 10); // pending until the state agrees (never predicted)
      expect(r.predictorTierAtMs).toBeLessThan(1500 + 75 + 10 + TICK_MS + FRAME_MS + 1);
      expect(r.minWallGapM).toBeLessThan(1e-6);
      expect(r.snaps).toBe(0);
      expect(r.visibleErrors).toBe(0);
    }
  });
});
