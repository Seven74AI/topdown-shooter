import { describe, expect, it } from "vitest";
import { createRng, seqSpreadRoll } from "@topdown/shared";
import { SPREAD_CANCEL_WINDOW, SpreadCancelWatch } from "./spreadCancel";

const SMG_SPREAD = 8;
const PISTOL_SPREAD = 2;
const DEG = Math.PI / 180;

/** Feeds `n` consecutive firing inputs whose aim angle is `angleAt(seq)`; returns the reports. */
function feed(n: number, spreadDeg: number, angleAt: (seq: number) => number, wave = () => 1): { reports: number; lastK: number; lastRatio: number } {
  const w = new SpreadCancelWatch("p0");
  let reports = 0;
  let lastK = 0;
  let lastRatio = 0;
  for (let seq = 1; seq <= n; seq++) {
    const a = angleAt(seq);
    const r = w.observe(seq, Math.cos(a), Math.sin(a), true, spreadDeg, wave());
    if (r) {
      reports++;
      lastK = r.k;
      lastRatio = r.matchRatio;
    }
  }
  return { reports, lastK, lastRatio };
}

const cancel = (seq: number, spreadDeg: number) => -seqSpreadRoll("p0", seq) * (spreadDeg / 2) * DEG;

describe("spread-cancel telemetry (Story 2.12 review M1)", () => {
  it("an honest aim never trips it: steady, jittery (±3°), tracking, for the SMG and the Pistol (seeded, 20 000 inputs each)", () => {
    for (const spread of [SMG_SPREAD, PISTOL_SPREAD]) {
      for (const seed of [1, 2, 3]) {
        const rng = createRng(seed);
        expect(feed(20_000, spread, () => 0.3).reports).toBe(0);
        expect(feed(20_000, spread, () => 0.3 + rng.range(-3, 3) * DEG).reports).toBe(0);
        expect(feed(20_000, spread, (s) => Math.sin(s / 15) * 1.2 + rng.range(-1.5, 1.5) * DEG).reports).toBe(0);
      }
    }
  });

  it("a steady-aim client pre-rotating by −roll × half is flagged (exact matches)", () => {
    const r = feed(SPREAD_CANCEL_WINDOW * 3, SMG_SPREAD, (s) => 0.3 + cancel(s, SMG_SPREAD));
    expect(r.reports).toBe(1); // once per wave
    expect(r.lastRatio).toBeGreaterThan(0.9);
  });

  it("a client tracking a target (≈ 0.6°/tick) that pre-rotates is flagged by the fit (k ≈ 1), for the Pistol too", () => {
    for (const spread of [SMG_SPREAD, PISTOL_SPREAD]) {
      const rng = createRng(7);
      const r = feed(SPREAD_CANCEL_WINDOW * 6, spread, (s) => Math.sin(s / 60) * 0.6 + rng.range(-0.1, 0.1) * DEG + cancel(s, spread));
      expect(r.reports, `spread ${spread}`).toBe(1);
      expect(r.lastK).toBeGreaterThan(0.7);
      expect(r.lastK).toBeLessThan(1.3);
    }
  });

  it("reports at most once per wave", () => {
    let seqs = 0;
    const r = feed(SPREAD_CANCEL_WINDOW * 10, SMG_SPREAD, (s) => 0.3 + cancel(s, SMG_SPREAD), () => (seqs++ < SPREAD_CANCEL_WINDOW * 5 ? 1 : 2));
    expect(r.reports).toBe(2);
  });

  it("ignores inputs without fire, without spread, or with a seq gap", () => {
    const w = new SpreadCancelWatch("p0");
    let reports = 0;
    for (let seq = 1; seq <= 400; seq++) {
      const a = 0.3 + cancel(seq, SMG_SPREAD);
      if (w.observe(seq, Math.cos(a), Math.sin(a), false, SMG_SPREAD, 1)) reports++;
      if (w.observe(seq, Math.cos(a), Math.sin(a), true, 0, 1)) reports++;
    }
    for (let seq = 1; seq <= 800; seq += 2) {
      const a = 0.3 + cancel(seq, SMG_SPREAD);
      if (w.observe(seq, Math.cos(a), Math.sin(a), true, SMG_SPREAD, 1)) reports++;
    }
    expect(reports).toBe(0);
  });
});
