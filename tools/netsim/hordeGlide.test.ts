/**
 * Story 8.10 (AC 3; brief 16, 27): far zombies refreshed at 10 Hz GLIDE on the phone. The real path:
 * server `HordeEncoder` → phone `HordeStreamDecoder` → `HordeDecoder` → `HordeBuffer.sample`, swept
 * at 1 ms of render time with the buffer's state kept between samples; plus a zombie oscillating
 * across the 8 m boundary (every near/far switch) and a keyframe every second.
 */
import { describe, expect, it } from "vitest";
import { HORDE_NEAR_M, addPlayer, createWorld, loadBalance, spawnZombie, type World } from "@topdown/shared";
import { HordeEncoder, newHordeStats } from "../../apps/server/src/net/hordeEncoder";
import { HordeBuffer, HordeSample } from "../../apps/client/src/net/hordeBuffer";
import { HordeDecoder } from "../../apps/client/src/net/hordeDecoder";

const balance = loadBalance();
const TICK_MS = 50;
const DELAY_TICKS = 2; // 100 ms, the clean line's render delay

interface Sweep {
  /** Largest move between two 1 ms samples (m), and the largest relative speed error over 10 ms windows. */
  maxStepM: number;
  speedErr: number;
  missing: number;
  samples: number;
  backSteps: number;
  /** The drawn position at every sample (x, y interleaved). */
  xy: number[];
  /** Delta frames that carried the zombie (liveness: ≈ half of them for a far one). */
  deltasWithIt: number;
  deltas: number;
}

/** Runs `ticks` server ticks, moving zombie `id` along `path(t)` (m), and sweeps the render tick 1 ms at a time. */
function sweep(path: (tick: number) => { x: number; y: number }, ticks: number, nearM?: number): Sweep {
  const world: World = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(world, "p0", 24, 16);
  world.debug.godMode = true;
  const z = world.zombies;
  const p0 = path(0);
  const id = spawnZombie(world, "walker", p0.x, p0.y);
  const enc = new HordeEncoder(undefined, nearM);
  const buffer = new HordeBuffer();
  const decoder = new HordeDecoder(buffer);
  const out = new HordeSample();
  const frames: Uint8Array[] = [];
  const client = { state: 1, ref: { bufferedAmount: 0 }, sendBytes: (_t: number, b: Uint8Array) => void frames.push(b.slice()) };
  const stats = newHordeStats();
  const res: Sweep = { maxStepM: 0, speedErr: 0, missing: 0, samples: 0, backSteps: 0, xy: [], deltasWithIt: 0, deltas: 0 };
  let px = Number.NaN;
  let py = Number.NaN;
  const hist: { x: number; y: number; ms: number }[] = [];
  let next = 0;
  for (let ms = 0; ms < ticks * TICK_MS; ms++) {
    // a server tick every 50 ms; its frame arrives at once (a clean line: the delay covers it)
    while (next * TICK_MS <= ms && next < ticks) {
      const p = path(next);
      z.prevX[id] = z.x[id] as number;
      z.prevY[id] = z.y[id] as number;
      z.x[id] = p.x;
      z.y[id] = p.y;
      world.tick = next + 1;
      enc.prepare(world);
      enc.send(world, client, stats, 24, 16);
      const f = frames.at(-1) as Uint8Array;
      expect(decoder.receive(f)).toBe(true);
      if (f[4] === 2) {
        res.deltas++;
        if ((f[7] as number) > 0) res.deltasWithIt++;
      }
      next++;
    }
    const rt = ms / TICK_MS - DELAY_TICKS;
    if (rt < 2) continue;
    buffer.sample(rt, out);
    res.samples++;
    if (out.count !== 1) {
      res.missing++;
      continue;
    }
    const x = out.x[0] as number;
    const y = out.y[0] as number;
    if (!Number.isNaN(px)) res.maxStepM = Math.max(res.maxStepM, Math.hypot(x - px, y - py));
    px = x;
    py = y;
    res.xy.push(x, y);
    hist.push({ x, y, ms });
    if (hist.length > 11) hist.shift();
    if (hist.length === 11) {
      // the drawn speed over 10 ms vs the path's own speed at that render time
      const a = hist[0] as { x: number; y: number; ms: number };
      const b = hist[10] as { x: number; y: number; ms: number };
      const drawn = Math.hypot(b.x - a.x, b.y - a.y);
      const ra = a.ms / TICK_MS - DELAY_TICKS;
      const rb = b.ms / TICK_MS - DELAY_TICKS;
      const lerp = (r: number) => {
        const t0 = Math.floor(r) - 1; // world.tick = n + 1 carries path(n)
        const f = r - Math.floor(r);
        const p = path(t0);
        const q = path(t0 + 1);
        return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
      };
      const ta = lerp(ra);
      const tb = lerp(rb);
      const want = Math.hypot(tb.x - ta.x, tb.y - ta.y);
      // windows of real motion only (≥ 1 cm per 10 ms: at a turnaround the cm rounding dominates)
      if (want >= 0.01) res.speedErr = Math.max(res.speedErr, Math.abs(drawn - want) / want);
    }
  }
  expect(decoder.decodeErrors).toBe(0);
  expect(stats.keyframes).toBeGreaterThanOrEqual(Math.floor(ticks / 20)); // ≈ 1/s
  return res;
}

const SPEED = 1.2; // m/s, a Walker
const STEP = (SPEED * TICK_MS) / 1000;

describe("Story 8.10: far zombies glide (10 Hz on the wire, smooth on screen)", () => {
  it("a far Walker (11 m away, refreshed every 2nd tick) moves at its own speed every 10 ms: no stand-still-then-jump; same as at 20 Hz", () => {
    const path = (t: number) => ({ x: 24 - 11 + 0, y: 16 - 5 + t * STEP }); // straight up the screen, 11–12 m from the viewer
    const far = sweep(path, 200);
    const all20 = sweep(path, 200, Infinity);
    console.log(`[8.10 glide] far: ${JSON.stringify({ ...far, xy: undefined })} · all 20 Hz: ${JSON.stringify({ ...all20, xy: undefined })}`);
    expect(far.missing).toBe(0);
    expect(far.deltasWithIt / far.deltas).toBeLessThan(0.6); // really refreshed at 10 Hz…
    expect(all20.deltasWithIt / all20.deltas).toBeGreaterThan(0.95); // …and the control at 20 Hz
    expect(far.samples).toBeGreaterThan(9000);
    // drawn speed within 1 % of the path's over every 10 ms window (a stand-still tick would be −100 %)
    expect(far.speedErr).toBeLessThan(0.01);
    expect(far.maxStepM).toBeLessThanOrEqual((SPEED / 1000) * 1.05 + 1e-4); // ≤ one 1 ms of travel (+ cm rounding)
  });

  it("brief 27 oscillation: a zombie walking back and forth across the 8 m boundary (every near↔far switch, keyframes) never blinks and never jumps", () => {
    // radial: 6 m → 10 m → 6 m, period 4 s, at ≤ 2π·2/4 ≈ 3.1 m/s
    const path = (t: number) => {
      const r = HORDE_NEAR_M + 2 * Math.sin((t * 2 * Math.PI) / 80);
      return { x: 24 + r * 0.8, y: 16 + r * 0.6 };
    };
    const res = sweep(path, 400);
    const all20 = sweep(path, 400, Infinity);
    const vmax = (2 * 2 * Math.PI) / 4; // m/s
    let worstVs20 = 0;
    for (let i = 0; i < res.xy.length; i += 2) worstVs20 = Math.max(worstVs20, Math.hypot((res.xy[i] as number) - (all20.xy[i] as number), (res.xy[i + 1] as number) - (all20.xy[i + 1] as number)));
    console.log(`[8.10 boundary] ${JSON.stringify({ ...res, xy: undefined })} · vs all 20 Hz: worst ${(worstVs20 * 100).toFixed(2)} cm`);
    expect(res.missing).toBe(0);
    expect(res.samples).toBeGreaterThan(19_000);
    expect(res.maxStepM).toBeLessThanOrEqual((vmax / 1000) * 1.1 + 2e-4);
    expect(res.speedErr).toBeLessThan(0.25); // cm rounding over 10 ms; a skipped refresh would read −100 %
    expect(worstVs20).toBeLessThanOrEqual(0.02); // within 2 cm of the all-20 Hz picture at every ms
  });
});
