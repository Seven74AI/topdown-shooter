/**
 * Story 5.7 (AC 6, 7; brief line 14): a real Brute hitting the bot player on the real server
 * `RunController`, the real client `Predictor`, under `?lag=150&jitter=20` (75 ± 10 ms each way) in
 * virtual time (the Story 2.6 harness pattern, `predictionCircle.test.ts`). The client stands next to
 * the Brute (fresh input every step), on Downtown with a barricade behind it, so some knocks stop at
 * it. Every snapshot carries the knock fields; the client never snaps, the only correction a knock
 * brings is its reveal (smoothed), and once the knock is over drawn = server.
 */
import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, PLACEHOLDER_MAP, TICK_DT_S, addBuildingAt, createRng, loadBalance, spawnZombie, type PlayerInput } from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";
import { PREDICTION_IGNORE_M } from "../../apps/client/src/net/netConfig";

const balance = loadBalance();
const TICK_MS = TICK_DT_S * 1000;
const FRAME_MS = 1000 / 60;
const ID = "p0";

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
  ackSeq: number;
  k: number;
  dx: number;
  dy: number;
  mm: number;
}

function simulate(seconds: number, oneWayMs: number, jitterHalfMs: number, seed: number, ignoreKnock = false) {
  const rng = createRng(seed);
  const ctrl = new RunController({ balance, seed: 1, map: PLACEHOLDER_MAP, players: [{ playerId: ID, slot: 0 }], pauseWaves: true, systems: { waves: () => {} } });
  const w = ctrl.world;
  const p = w.players.get(ID);
  if (!p) throw new Error("no player");
  p.hp = 1e9;
  p.x = p.prevX = 20;
  p.y = p.prevY = 16;
  // A barricade behind the player (x 21.5–22, y 15–17): the first knock (toward +x) stops at it.
  addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: ID, gx: 43, gy: 30, rot: 1, hp: 1e6 });
  const brute = spawnZombie(w, "brute", 19, 16);
  w.zombies.hp[brute] = 1e9;
  const up = new Link<PlayerInput>(oneWayMs, jitterHalfMs, rng);
  const down = new Link<Snap>(oneWayMs, jitterHalfMs, rng);
  const predictor = new Predictor(balance, PLACEHOLDER_MAP, ID);
  predictor.syncBuildings(new Map([["1", { type: "wood_barricade", owner: ID, gx: 43, gy: 30, rot: 1, hp: 200 }]])); // the mirror's copy (schema)
  const inputs: PlayerInput[] = [];
  const snaps: Snap[] = [];
  let hits = 0;
  w.events.subscribe((e) => {
    if (e.type === "player.damaged" && e.sourceZombieId === brute) hits++;
  });
  const errors: { t: number; e: number; knock: boolean }[] = [];
  let nextServer = Math.floor(rng.range(0, TICK_MS));
  let nextFrame = 0;
  let lastFrame = 0;
  let acc = 0;
  let seq = 0;
  let maxKnockSnapM = 0;
  for (let t = 0; t <= seconds * 1000; t++) {
    if (t >= nextServer) {
      nextServer += TICK_MS;
      up.take(t, inputs);
      for (const i of inputs) ctrl.queueInput(ID, i);
      ctrl.tick();
      down.send(t, { x: Math.fround(p.x), y: Math.fround(p.y), ackSeq: ctrl.ackSeq(ID), k: p.knockTicks, dx: p.knockDx, dy: p.knockDy, mm: p.knockStepMm });
    }
    if (t >= nextFrame) {
      nextFrame += FRAME_MS;
      const dt = t - lastFrame;
      lastFrame = t;
      down.take(t, snaps);
      for (const s of snaps) {
        const snapsBefore = predictor.stats.snaps;
        if (ignoreKnock) predictor.reconcile(s.ackSeq, s.x, s.y, "alive");
        else predictor.reconcile(s.ackSeq, s.x, s.y, "alive", 0, 0, s.k, s.dx, s.dy, s.mm);
        if (predictor.stats.snaps > snapsBefore) maxKnockSnapM = Math.max(maxKnockSnapM, predictor.stats.lastErrorM);
        errors.push({ t, e: predictor.stats.lastErrorM, knock: s.k > 0 });
        if (process.env.NETSIM_DEBUG && predictor.stats.lastErrorM >= PREDICTION_IGNORE_M) console.info(`t ${t} ack ${s.ackSeq} k ${s.k} e ${predictor.stats.lastErrorM.toFixed(4)} unacked ${predictor.stats.unackedInputs} x ${s.x.toFixed(3)}`);
      }
      acc += dt;
      while (acc >= TICK_MS) {
        const input: PlayerInput = { ...NEUTRAL_INPUT, seq: ++seq, aimX: -1, aimY: 0 };
        up.send(t, input);
        predictor.applyLocal(input);
        acc -= TICK_MS;
      }
      predictor.frame(dt / 1000);
    }
  }
  return { hits, stats: { ...predictor.stats }, visible: errors.filter((e) => e.e >= PREDICTION_IGNORE_M).length, maxKnockSnapM, final: Math.hypot(predictor.x - p.x, predictor.y - p.y), knocked: p.x - 20 };
}

describe("netsim: a Brute's knockback under ?lag=150&jitter=20 (Story 5.7)", () => {
  it("≥ 5 hits: no snap, one smoothed correction per knock (its reveal), drawn = server once it is over", () => {
    for (const seed of [31, 32, 33]) {
      const r = simulate(20, 75, 10, seed);
      console.info(`[netsim] Brute knocks 75±10 ms seed ${seed}: hits=${r.hits} snaps=${r.stats.snaps} corrections=${r.stats.corrections} knockSlides=${r.stats.knockSlides} visible=${r.visible} final=${r.final.toExponential(2)}`);
      expect(r.hits).toBeGreaterThanOrEqual(5);
      expect(r.stats.snaps).toBe(0); // no snap ≥ 1 m from a knockback
      expect(r.stats.knockSlides).toBe(r.hits); // each knock's reveal, smoothed
      expect(r.visible).toBeLessThanOrEqual(r.hits); // and nothing else corrects
      expect(r.final).toBeLessThan(PREDICTION_IGNORE_M); // client position = server
    }
  });

  it("control: a client that ignores the streamed knock snaps on every hit", () => {
    const r = simulate(20, 75, 10, 31, true);
    console.info(`[netsim] Brute knocks, knock ignored: hits=${r.hits} snaps=${r.stats.snaps} corrections=${r.stats.corrections}`);
    expect(r.stats.snaps + r.stats.corrections).toBeGreaterThan(r.hits * 3);
  });
});
