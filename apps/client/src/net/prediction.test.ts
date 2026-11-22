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

  it("an out player is not moved", () => {
    const p = predictor();
    p.reconcile(0, 10, 10, "out");
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
});
