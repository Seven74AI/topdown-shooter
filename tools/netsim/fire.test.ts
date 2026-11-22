/**
 * Story 4.8 netsim (brief lines 2, 11, 12): car fires under lag (75 ± 10 ms one way =
 * `?lag=150&jitter=20`), in virtual time. The real server `RunController` (its first build start
 * enters stage 3 through `decayStageByWave`, the `DEV_DECAY_STAGES` option: two cars burn), the real
 * client `Predictor` + a mirror World, joined by a simulated network. Each snapshot carries the
 * survivor's position and HP and the state's `decayStage` / `decayVariants` / `decayFiresOut`; the
 * events of each tick travel with it (fire damage = `player.damaged`, source −1).
 *
 * The survivor walks back and forth along the north side of the burning west car, inside its zone,
 * then the run crosses two build starts (waves 1 and 2 skipped) and the fires go out. The client
 * must: show the server's HP (never its own), see every fire hit the server dealt, never be corrected
 * because of fire (fire never moves a body), and drop the fires exactly when the server does
 * (mirror and Predictor), also with the tab asleep across that build start.
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
const CAR = DOWNTOWN_MAP.cover.find((c) => c.name === "street_car_west");
if (!CAR) throw new Error("street_car_west");
const WEST_CAR = CAR;
/** Just north of the car, inside its zone (centre 6.25, 14; r 2 + body 0.4). */
const Y = WEST_CAR.minY - 0.6;

interface Snap {
  x: number;
  y: number;
  hp: number;
  ackSeq: number;
  decayStage: number;
  decayVariants: number;
  decayFiresOut: number;
  fireHits: number;
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

/** East and west along the car's north side (1.0 s legs), still for the last 1.5 s. */
const walk = (t: number, endMs: number) => (t >= endMs - 1500 ? 0 : Math.floor(t / 1000) % 2 === 0 ? 1 : -1);

function simulate(seed: number, outAtMs: number, seconds: number, sleep?: { from: number; to: number }) {
  const rng = createRng(seed);
  const ctrl = new RunController({ balance, seed, players: [{ playerId: ID, slot: 0 }], pauseWaves: true, systems: { waves: () => {} }, decayStageByWave: [3, 3, 3, 3, 3] });
  const world = ctrl.world;
  const me = world.players.get(ID);
  if (!me) throw new Error("no player");
  // Make sure the west car burns this run (the fire group picks 2 of 3; the state carries the mask anyway).
  const westFire = world.decay.fires.find((f) => f.target === "street_car_west");
  me.x = me.prevX = WEST_CAR.minX + 0.5;
  me.y = me.prevY = Y;
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
  let out = false;
  let serverHits = 0;
  let clientHits = 0;
  let clientHp = -1;
  let maxHpGap = 0;
  let visible = 0;
  let mirrorFiresWhileServerOut = 0;
  const serverHp: number[] = [];
  for (let t = 0; t <= seconds * 1000; t++) {
    if (!out && t >= outAtMs) {
      // Waves 1 and 2 cleared: the build start before wave 3 puts the fires out (lit before wave 1).
      for (let w = 0; w < 2; w++) {
        startWave(world);
        skipWave(world);
      }
      out = true;
    }
    if (t >= nextServerMs) {
      nextServerMs += TICK_MS;
      up.take(t, inputs);
      for (const input of inputs) ctrl.queueInput(ID, input);
      const evs = ctrl.tick();
      let hits = 0;
      for (const e of evs) if (e.type === "player.damaged" && e.playerId === ID && e.sourceZombieId < 0) hits++;
      serverHits += hits;
      const p = world.players.get(ID);
      if (p) {
        serverHp.push(p.hp);
        down.send(t, { x: Math.fround(p.x), y: Math.fround(p.y), hp: p.hp, ackSeq: ctrl.ackSeq(ID), decayStage: world.decay.stage, decayVariants: world.decay.variants, decayFiresOut: world.decay.firesOut, fireHits: hits });
      }
    }
    const asleep = sleep !== undefined && t >= sleep.from && t < sleep.to;
    if (t >= nextFrameMs && !asleep) {
      nextFrameMs += FRAME_MS;
      const dtMs = Math.min(t - lastFrameMs, 1000);
      lastFrameMs = t;
      down.take(t, snaps);
      for (const s of snaps) {
        predictor.syncDecay(s.decayStage, s.decayVariants, s.decayFiresOut);
        mirrorDecay(mirror, s.decayStage, s.decayVariants, s.decayFiresOut);
        predictor.reconcile(s.ackSeq, s.x, s.y, "alive");
        if (predictor.stats.lastErrorM >= PREDICTION_IGNORE_M) visible++;
        clientHp = s.hp; // the client shows the server's HP
        clientHits += s.fireHits;
      }
      const sp = world.players.get(ID);
      if (sp && clientHp >= 0) maxHpGap = Math.max(maxHpGap, clientHp - sp.hp);
      if (world.decay.fires.length === 0 && mirror.decay.fires.length > 0 && t > outAtMs + 500 && !asleep) mirrorFiresWhileServerOut++;
      accMs += dtMs;
      let steps = 0;
      while (accMs >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
        const d = walk(t, seconds * 1000);
        const input: PlayerInput = { ...NEUTRAL_INPUT, seq: ++seq, moveX: d, moveY: 0, aimX: 1, aimY: 0 };
        up.send(t, input);
        predictor.applyLocal(input);
        accMs -= TICK_MS;
        steps++;
      }
      if (accMs >= TICK_MS) accMs %= TICK_MS;
      predictor.frame(dtMs / 1000);
    } else if (asleep) {
      nextFrameMs = t + FRAME_MS;
    }
  }
  return {
    westFire: westFire !== undefined,
    serverHits,
    clientHits,
    serverHp: me.hp,
    clientHp,
    maxHpGap,
    corrections: predictor.stats.corrections,
    snaps: predictor.stats.snaps,
    visible,
    serverFires: world.decay.fires.length,
    mirrorFires: mirror.decay.fires.map((f) => f.name),
    predictorFires: predictor.fireNames,
    firesOut: world.decay.firesOut,
    mirrorFiresWhileServerOut,
    status: me.status,
  };
}

describe("Story 4.8 netsim: car fires under lag (?lag=150&jitter=20)", () => {
  it("the client shows the server's HP and every fire hit; fire never causes a correction; the fires go out on the client when they go out on the server", () => {
    let runs = 0;
    for (let seed = 1; seed <= 12 && runs < 4; seed++) {
      const r = simulate(seed, 5000, 8);
      if (!r.westFire) continue; // this seed's fires are the two lot cars
      runs++;
      // Liveness: the fire really hurt (≥ 6 pulses before it went out), and then stopped.
      expect(r.serverHits, `seed ${seed}`).toBeGreaterThanOrEqual(6);
      expect(r.status).toBe("alive");
      expect(r.clientHits).toBe(r.serverHits);
      expect(r.clientHp).toBe(r.serverHp);
      expect(r.maxHpGap).toBeLessThanOrEqual(15); // the client lags by ≤ ~150 ms of pulses, never shows its own numbers
      expect(r.snaps + r.visible).toBe(0); // fire moves nobody: no correction
      expect(r.serverFires).toBe(0);
      expect(r.firesOut).not.toBe(0);
      expect(r.mirrorFires).toEqual([]);
      expect(r.predictorFires).toEqual([]);
      expect(r.mirrorFiresWhileServerOut).toBe(0);
    }
    expect(runs).toBe(4);
  });

  it("a tab asleep across the build start that puts the fires out wakes with them out, and with the server's HP", () => {
    let done = false;
    for (let seed = 1; seed <= 12 && !done; seed++) {
      const r = simulate(seed, 4000, 9, { from: 3000, to: 7000 });
      if (!r.westFire) continue;
      done = true;
      expect(r.serverHits).toBeGreaterThan(0);
      expect(r.mirrorFires).toEqual([]);
      expect(r.predictorFires).toEqual([]);
      expect(r.clientHp).toBe(r.serverHp);
      expect(r.clientHits).toBe(r.serverHits);
    }
    expect(done).toBe(true);
  });
});
