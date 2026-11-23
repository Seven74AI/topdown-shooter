import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  PLACEHOLDER_MAP,
  TICK_DT_S,
  addPlayer,
  createWorld,
  loadBalance,
  setInput,
  step,
  type PlayerInput,
  DOWNTOWN_MAP,
  addBuildingAt,
  applyDecayStage,
  circleInFire,
  knockPlayer,
  type BuildingStateView,
  type DistrictMap,
  type World,
} from "@topdown/shared";
import { Predictor } from "./prediction";
import { PREDICTION_HISTORY_SIZE, PREDICTION_IGNORE_M, PREDICTION_SNAP_M } from "./netConfig";

const balance = loadBalance();
const STEP_M = balance.player.speedMps * TICK_DT_S;

const move = (seq: number, moveX: number, moveY = 0, extra: Partial<PlayerInput> = {}): PlayerInput => ({
  ...NEUTRAL_INPUT,
  seq,
  moveX,
  moveY,
  ...extra,
});

function predictor(x = 10, y = 10): Predictor {
  const p = new Predictor(balance, PLACEHOLDER_MAP, "p0");
  p.reconcile(0, x, y, "alive");
  return p;
}

describe("Predictor", () => {
  it("applies a local input at once", () => {
    const p = predictor();
    p.applyLocal(move(1, 1));
    expect(p.x).toBeCloseTo(10 + STEP_M, 12);
    expect(p.renderX(0)).toBeCloseTo(10, 12);
    expect(p.renderX(1)).toBeCloseTo(10 + STEP_M, 12);
    expect(p.renderX(0.5)).toBeCloseTo(10 + STEP_M / 2, 12);
  });

  it("facing follows the latest aim at once", () => {
    const p = predictor();
    p.applyLocal(move(1, 0, 0, { aimX: 0, aimY: -1 }));
    expect(p.facingX).toBeCloseTo(0, 12);
    expect(p.facingY).toBe(-1);
  });

  it("records inputs before the first snapshot and replays them on it", () => {
    const p = new Predictor(balance, PLACEHOLDER_MAP, "p0");
    expect(p.ready).toBe(false);
    for (let s = 1; s <= 4; s++) p.applyLocal(move(s, 1));
    p.reconcile(1, 10 + STEP_M, 10, "alive"); // the server applied seq 1
    expect(p.ready).toBe(true);
    expect(p.stats.unackedInputs).toBe(3);
    expect(p.x).toBeCloseTo(10 + 4 * STEP_M, 12);
    expect(p.stats.snaps + p.stats.corrections).toBe(0);
  });

  it("an exact server state changes nothing (float32 rounding is ignored)", () => {
    const server = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(server, "p0", 10, 10);
    const p = predictor();
    const sent: PlayerInput[] = [];
    for (let s = 1; s <= 60; s++) {
      const input = move(s, Math.cos(s / 5), Math.sin(s / 5));
      sent.push(input);
      p.applyLocal(input);
      const drawn = p.renderX(0.4);
      if (s > 2) {
        // The server is two inputs behind: it applies seq s − 2 now.
        setInput(server, "p0", sent[s - 3] as PlayerInput);
        step(server, TICK_DT_S);
        const sp = server.players.get("p0");
        p.reconcile(s - 2, Math.fround(sp?.x ?? 0), Math.fround(sp?.y ?? 0), "alive");
        expect(p.stats.unackedInputs).toBe(2);
      }
      expect(Math.abs(p.renderX(0.4) - drawn)).toBeLessThan(PREDICTION_IGNORE_M);
    }
    expect(p.stats.corrections).toBe(0);
    expect(p.stats.snaps).toBe(0);
    expect(p.stats.maxErrorM).toBeLessThan(PREDICTION_IGNORE_M);
  });

  it("a small error is smoothed: the drawn point stays, then decays to the truth", () => {
    const p = predictor();
    p.applyLocal(move(1, 1));
    p.applyLocal(move(2, 1));
    const before = p.renderX(1);
    // The server skipped seq 1 (backlog drain): it is still at 10 after acking 1.
    p.reconcile(1, 10, 10, "alive");
    expect(p.stats.corrections).toBe(1);
    expect(p.stats.lastErrorM).toBeCloseTo(STEP_M, 9);
    expect(p.renderX(1)).toBeCloseTo(before, 9); // no visible jump
    expect(p.x).toBeCloseTo(10 + STEP_M, 9); // the truth: only seq 2 replayed
    for (let i = 0; i < 60; i++) p.frame(1 / 60);
    expect(p.renderX(1)).toBeCloseTo(10 + STEP_M, 4);
  });

  it("a large error snaps", () => {
    const p = predictor();
    p.applyLocal(move(1, 1));
    p.reconcile(1, 10 + PREDICTION_SNAP_M * 2, 10, "alive");
    expect(p.stats.snaps).toBe(1);
    expect(p.offsetM).toBe(0);
    expect(p.renderX(1)).toBe(10 + PREDICTION_SNAP_M * 2);
  });

  it("ignores acks older than the last one", () => {
    const p = predictor();
    p.applyLocal(move(1, 1));
    p.applyLocal(move(2, 1));
    p.reconcile(2, 10 + 2 * STEP_M, 10, "alive");
    p.reconcile(1, 0, 0, "alive");
    expect(p.x).toBeCloseTo(10 + 2 * STEP_M, 9);
    expect(p.stats.snaps).toBe(0);
  });

  it("an ack older than the history snaps to the server and clears it", () => {
    const p = predictor();
    for (let s = 1; s <= PREDICTION_HISTORY_SIZE + 10; s++) p.applyLocal(move(s, 0, 1));
    p.reconcile(3, 12, 10, "alive");
    expect(p.stats.snaps).toBe(1);
    expect(p.stats.unackedInputs).toBe(0);
    expect(p.renderX(1)).toBe(12);
    // Prediction carries on from there.
    p.applyLocal(move(PREDICTION_HISTORY_SIZE + 11, 1));
    expect(p.x).toBeCloseTo(12 + STEP_M, 12);
  });

  it("the prediction World never runs the downed rules: downed stays downed, no out, no wipe", () => {
    const p = predictor();
    p.reconcile(0, 10, 10, "downed");
    for (let seq = 1; seq <= 500; seq++) p.applyLocal(move(seq, 1)); // longer than the 400-tick countdown
    const w = (p as unknown as { world: { players: Map<string, { status: string }>; teamWiped: boolean } }).world;
    expect(w.players.get("p0")?.status).toBe("downed");
    expect(w.teamWiped).toBe(false);
    expect(p.x).toBe(10);
  });

  it("a downed player is not moved", () => {
    const p = predictor();
    p.reconcile(0, 10, 10, "downed");
    p.applyLocal(move(1, 1));
    expect(p.x).toBe(10);
  });

  it("never acts on edge flags (they fire once on the server)", () => {
    const p = predictor();
    const input = move(1, 1, 0, { swap: true, consumable: true });
    p.applyLocal(input);
    p.reconcile(0, 10, 10, "alive"); // replays seq 1 again
    p.reconcile(0, 10, 10, "alive");
    expect(p.x).toBeCloseTo(10 + STEP_M, 12);
    expect(input.swap).toBe(true); // the caller's object is never touched
    // What the prediction World was actually fed has the flags cleared.
    const fed = (p as unknown as { world: { inputs: Map<string, PlayerInput> } }).world.inputs.get("p0");
    expect(fed).toMatchObject({ seq: 1, swap: false, consumable: false });
  });

  it("an ack of the newest input (low RTT) keeps the drawn point: no correction", () => {
    const p = predictor();
    for (let seq = 1; seq <= 20; seq++) {
      p.applyLocal(move(seq, 1));
      const before = p.renderX(0.3);
      p.reconcile(seq, p.x, p.y, "alive"); // the server is exactly there, nothing left to replay
      expect(p.renderX(0.3)).toBeCloseTo(before, 9);
    }
    expect(p.stats.corrections).toBe(0);
    expect(p.stats.maxErrorM).toBeLessThan(PREDICTION_IGNORE_M);
  });

  it("corrections that add up to ≥ 1 m of offset snap", () => {
    const p = predictor();
    p.applyLocal(move(1, 0));
    p.reconcile(1, 10.9, 10, "alive"); // 0.9 m: smoothed
    expect(p.stats.snaps).toBe(0);
    p.applyLocal(move(2, 0));
    p.reconcile(2, 11.8, 10, "alive"); // another 0.9 m: 1.8 m in total
    expect(p.stats.snaps).toBe(1);
    expect(p.offsetM).toBe(0);
  });

  it("maxErrorM forgets errors after 10 s of steps", () => {
    const p = predictor();
    p.applyLocal(move(1, 1));
    p.applyLocal(move(2, 1));
    p.reconcile(1, 10, 10, "alive");
    expect(p.stats.maxErrorM).toBeGreaterThan(0.1);
    for (let s = 3; s < 3 + 11 * 20; s++) {
      p.applyLocal(move(s, 0));
      p.reconcile(s - 1, p.x, p.y, "alive");
    }
    expect(p.stats.maxErrorM).toBeLessThan(PREDICTION_IGNORE_M);
  });

  it("Story 3.9: while slowed the predicted speed equals the server's, step for step", () => {
    // Server side: the same shared movement, the player slowed by a bite at the ack's tick.
    const server = createWorld({ balance, seed: 1, systems: { waves: () => {}, zombies: () => {} } });
    const sp = addPlayer(server, "p0", 10, 10);
    sp.slowTicksLeft = 20;
    sp.slowPct = 30;
    const p = new Predictor(balance, PLACEHOLDER_MAP, "p0");
    p.reconcile(0, 10, 10, "alive", 20, 30);
    expect(p.slowTicksLeft).toBe(20);
    for (let s = 1; s <= 25; s++) {
      const input = move(s, 0.8, 0.6);
      setInput(server, "p0", input);
      step(server, TICK_DT_S);
      p.applyLocal(input);
      expect(p.x).toBe(sp.x); // bit-identical, slowed (1–20) and full speed again (21–25)
      expect(p.y).toBe(sp.y);
      expect(p.slowTicksLeft).toBe(sp.slowTicksLeft);
    }
    expect(p.x).toBeCloseTo(10 + 0.8 * TICK_DT_S * balance.player.speedMps * (20 * 0.7 + 5), 9);
  });

  it("Story 3.9: a snapshot with the slow replays the unacked inputs slowed: no correction from the server's view", () => {
    const server = createWorld({ balance, seed: 1, systems: { waves: () => {}, zombies: () => {} } });
    const sp = addPlayer(server, "p0", 10, 10);
    const p = predictor();
    const hist: number[] = []; // server x and slow ticks after each seq
    const slowHist: number[] = [];
    // Seq 1 applied by the server; then the bite (slow 20 ticks at the end of that tick).
    setInput(server, "p0", move(1, 1));
    step(server, TICK_DT_S);
    sp.slowTicksLeft = 20;
    sp.slowPct = 30;
    const ackX = sp.x;
    const slowAtAck = sp.slowTicksLeft;
    for (let s = 1; s <= 4; s++) p.applyLocal(move(s, 1)); // the client is 3 inputs ahead
    for (let s = 2; s <= 4; s++) {
      setInput(server, "p0", move(s, 1));
      step(server, TICK_DT_S);
    }
    p.reconcile(1, ackX, 10, "alive", slowAtAck, 30); // onset: one correction
    expect(p.x).toBe(sp.x);
    expect(p.slowTicksLeft).toBe(sp.slowTicksLeft);
    const corrections = p.stats.corrections;
    // From now on the server's later snapshots agree with the prediction: no correction.
    for (let s = 5; s <= 40; s++) {
      p.applyLocal(move(s, 1));
      setInput(server, "p0", move(s, 1));
      step(server, TICK_DT_S);
      if (s >= 8) p.reconcile(s - 3, Math.fround(hist[s - 3] ?? 0), 10, "alive", slowHist[s - 3] ?? 0, 30);
      hist[s] = sp.x;
      slowHist[s] = sp.slowTicksLeft;
    }
    expect(p.stats.corrections).toBe(corrections);
    expect(p.stats.lastErrorM).toBeLessThan(PREDICTION_IGNORE_M);
  });

  describe("Story 5.7: a Brute's knockback, predicted after the ack", () => {
    const brute = balance.zombies.types.brute as NonNullable<(typeof balance.zombies.types)["brute"]>;
    /**
     * Server World (the shared `movePlayers`, one step per input) and a Predictor 3 inputs ahead.
     * The knock lands at the end of the server's tick for seq 1; the client learns it with the ack
     * of seq 1. Returns the predictor's stats after 40 more inputs, each acked 3 later.
     */
    function knockCase(map: DistrictMap, x: number, y: number, ux: number, uy: number, prepare: (w: World) => void, sync: (p: Predictor) => void) {
      const server = createWorld({ balance, seed: 1, map, systems: { waves: () => {}, zombies: () => {}, buildings: () => {} } });
      prepare(server);
      const sp = addPlayer(server, "p0", x, y);
      const p = new Predictor(balance, map, "p0");
      sync(p);
      p.reconcile(0, x, y, "alive");
      const hist: { x: number; y: number; k: number; dx: number; dy: number; mm: number }[] = [];
      const snap = () => ({ x: Math.fround(sp.x), y: Math.fround(sp.y), k: sp.knockTicks, dx: sp.knockDx, dy: sp.knockDy, mm: sp.knockStepMm });
      const mv = (s: number) => move(s, -ux * 0.5, -uy * 0.5); // walking back into the Brute: the knock overrides it
      setInput(server, "p0", mv(1));
      step(server, TICK_DT_S);
      knockPlayer(sp, sp.x - ux, sp.y - uy, brute); // the zombie system of that tick
      hist[1] = snap();
      for (let s = 1; s <= 4; s++) p.applyLocal(mv(s));
      for (let s = 2; s <= 4; s++) {
        setInput(server, "p0", mv(s));
        step(server, TICK_DT_S);
        hist[s] = snap();
      }
      const h1 = hist[1] as (typeof hist)[number];
      p.reconcile(1, h1.x, h1.y, "alive", 0, 0, h1.k, h1.dx, h1.dy, h1.mm); // the reveal: one smoothed slide
      const reveal = { corrections: p.stats.corrections, snaps: p.stats.snaps, slides: p.stats.knockSlides };
      let inFire = false;
      let along = 0; // the farthest the server pushed the body along the knock
      for (const h of hist) if (h) along = Math.max(along, (h.x - x) * ux + (h.y - y) * uy);
      for (let s = 5; s <= 44; s++) {
        p.applyLocal(mv(s));
        setInput(server, "p0", mv(s));
        step(server, TICK_DT_S);
        hist[s] = snap();
        const h = hist[s - 3] as (typeof hist)[number];
        p.reconcile(s - 3, h.x, h.y, "alive", 0, 0, h.k, h.dx, h.dy, h.mm);
        if (server.decay.fires.length > 0 && circleInFire(server.decay.fires, sp.x, sp.y, sp.radiusM)) inFire = true;
        along = Math.max(along, (sp.x - x) * ux + (sp.y - y) * uy);
      }
      return { reveal, after: { corrections: p.stats.corrections - reveal.corrections, snaps: p.stats.snaps - reveal.snaps }, lastErrorM: p.stats.lastErrorM, moved: along, inFire };
    }

    it("in the open: the reveal slides (no snap), then 0 corrections", () => {
      const r = knockCase(PLACEHOLDER_MAP, 20, 16, 1, 0, () => {}, () => {});
      expect(r.moved).toBeCloseTo(1.5 - 0.5 * STEP_M, 3); // seq 1 walked half a step back first
      expect(r.reveal).toEqual({ corrections: 1, snaps: 0, slides: 1 });
      expect(r.after).toEqual({ corrections: 0, snaps: 0 });
      expect(r.lastErrorM).toBeLessThan(PREDICTION_IGNORE_M);
    });

    it("against a barricade: the replay stops at it like the server, 0 corrections after the reveal", () => {
      const view: BuildingStateView = { type: "wood_barricade", owner: "p0", gx: 42, gy: 30, rot: 1, hp: 200 }; // x [21, 21.5], y [15, 17]
      const r = knockCase(
        PLACEHOLDER_MAP,
        20,
        16,
        1,
        0,
        (w) => addBuildingAt(w, { id: 1, type: view.type, ownerId: view.owner, gx: view.gx, gy: view.gy, rot: 0 === view.rot ? 0 : 1, hp: 200 }),
        (p) => p.syncBuildings(new Map([["1", view]])),
      );
      expect(r.moved).toBeLessThan(1.5 - 0.5); // stopped by the barricade (0.6 m to its face)
      expect(r.after).toEqual({ corrections: 0, snaps: 0 });
      expect(r.lastErrorM).toBeLessThan(PREDICTION_IGNORE_M);
    });

    it("at a fire edge: never into the fire, and the replay agrees (0 corrections after the reveal)", () => {
      const probe = createWorld({ balance, seed: 4, map: DOWNTOWN_MAP, systems: { waves: () => {}, zombies: () => {}, buildings: () => {} } });
      applyDecayStage(probe, 3, probe.decay.variants);
      const f = probe.decay.fires.find((c) => c.name.includes("street_car_west")) ?? probe.decay.fires[0];
      if (!f) throw new Error("no fire");
      // East of the fire, knocked west toward it.
      const x = f.x + f.radiusM + balance.player.radiusM + 0.5;
      const r = knockCase(
        DOWNTOWN_MAP,
        x,
        f.y,
        -1,
        0,
        (w) => applyDecayStage(w, 3, probe.decay.variants),
        (p) => p.syncDecay(3, probe.decay.variants, 0),
      );
      expect(r.inFire).toBe(false);
      expect(r.moved).toBeLessThan(1.5);
      expect(r.after).toEqual({ corrections: 0, snaps: 0 });
    });
  });
});
