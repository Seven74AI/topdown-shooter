/**
 * Story 9.15 (AC 1–5; T5): the take C Behemoth in game code on a real Canvas 2D in node (`@napi-rs/canvas`, tests only):
 * the two walk frames differ (the old ones were the same picture) and only round the arms, the death frames have no
 * black head or spine, the charge / throw warning frames are their own pictures, the enraged frames carry the marker
 * and the bake turns it into a glow (and none of it into the body), every sheet fits, and the bake lands every frame.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { artKit } from "./bruteArt";
import { BH_R_M, behemothHeadM, drawBehemoth } from "./behemothArt";
import {
  BOSS_FRAME,
  BOSS_FRAME_PX,
  BOSS_POSES,
  BOSS_PX_PER_M,
  bossBakeSteps,
  bossHasEnraged,
  bossJobs,
  bossSheetOf,
  bossSheetSpecs,
  drawBossBody,
  jobFrames,
  markerGlowSteps,
} from "./bossFrames";
import { newBossBake, pumpBossBakeIn, receiveBossWorkerResult, requestBossLookIn, sheetWiped, workerFailed } from "./bossRelit";

const make = (w: number, h: number): HTMLCanvasElement => createCanvas(Math.max(1, w), Math.max(1, h)) as unknown as HTMLCanvasElement;
const ctx = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext("2d") as CanvasRenderingContext2D;
const N = BOSS_FRAME_PX;
function frame(look: number, i: number, enraged = false): Uint8ClampedArray {
  const c = make(N, N);
  drawBossBody(ctx(c), N, BOSS_PX_PER_M, look, i, enraged);
  return ctx(c).getImageData(0, 0, N, N).data;
}
/** Pixels (index list) that differ by more than `tol` (sum of channel differences). */
function diff(a: Uint8ClampedArray, b: Uint8ClampedArray, tol = 40): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs((a[i] as number) - (b[i] as number)) + Math.abs((a[i + 1] as number) - (b[i + 1] as number)) + Math.abs((a[i + 2] as number) - (b[i + 2] as number)) + Math.abs((a[i + 3] as number) - (b[i + 3] as number));
    if (d > tol) out.push(i / 4);
  }
  return out;
}
const lum = (d: Uint8ClampedArray, x: number, y: number): number => {
  const i = (Math.round(y) * N + Math.round(x)) * 4;
  return ((d[i] as number) * 0.3 + (d[i + 1] as number) * 0.55 + (d[i + 2] as number) * 0.15) * ((d[i + 3] as number) / 255);
};
const run = <T>(g: Generator<number, T, void>, units?: number[]): T => {
  let s = g.next();
  while (!s.done) {
    units?.push(s.value);
    s = g.next();
  }
  return s.value;
};

describe("Story 9.15: the take C Behemoth", () => {
  it("bug fix (a): walk_a and walk_b are different pictures, and only round the arms and fists", () => {
    for (let look = 0; look < 4; look++) {
      const a = frame(look, BOSS_FRAME.walkA);
      const b = frame(look, BOSS_FRAME.walkB);
      const d = diff(a, b);
      expect(d.length, `look ${look}`).toBeGreaterThan(400); // the old phases 0 / 0.5 gave 0 here
      // the torso's middle (behind the shoulders, the spine) does not move
      const m = BOSS_PX_PER_M;
      for (const i of d) {
        const x = (i % N) - N / 2;
        const y = Math.floor(i / N) - N / 2;
        const inTorsoCore = x > -1.2 * m && x < 0.2 * m && Math.abs(y) < 0.9 * m;
        expect(inTorsoCore, `look ${look}: pixel (${x}, ${y}) moved`).toBe(false);
      }
    }
  });

  it("bug fix (b): the death frames have no black head or spine (the dead skin is kept as #rrggbb)", () => {
    expect(artKit.shade("#6a7360", -0.3)).toMatch(/^rgb\(/); // what the kit returns (and can't read back)
    const head = { x: 0, y: 0 };
    for (let look = 0; look < 4; look++) {
      for (const i of [BOSS_FRAME.deadA, BOSS_FRAME.deadB, BOSS_FRAME.deadC]) {
        const p = BOSS_POSES[i] as (typeof BOSS_POSES)[number];
        const d = frame(look, i);
        behemothHeadM(p.pose, p.k, head);
        // the head's skin (behind the brow), and the spine strip's skin between its bumps
        const hx = N / 2 + (head.x - 0.15) * BOSS_PX_PER_M;
        const hy = N / 2 + head.y * BOSS_PX_PER_M;
        expect(lum(d, hx, hy), `look ${look} ${p.name} head`).toBeGreaterThan(25);
        if (look < 2) expect(lum(d, N / 2 - 0.36 * BH_R_M * BOSS_PX_PER_M + 0.06 * BOSS_PX_PER_M, N / 2 + 0.07 * BH_R_M * BOSS_PX_PER_M), `look ${look} ${p.name} spine`).toBeGreaterThan(25);
      }
    }
  });

  it("G2 A: the warning frames are the page's k 0.5 pictures (charge_b = charge_a: the drawing is at its full crouch by then; throw_b is the lift at 90 %)", () => {
    expect(diff(frame(0, BOSS_FRAME.chargeB), frame(0, BOSS_FRAME.charge))).toHaveLength(0);
    expect(diff(frame(0, BOSS_FRAME.throwB), frame(0, BOSS_FRAME.throw)).length).toBeGreaterThan(50);
    for (const i of [BOSS_FRAME.chargeB, BOSS_FRAME.throwB]) expect(diff(frame(0, i), frame(0, BOSS_FRAME.walkA)).length).toBeGreaterThan(400);
  });

  it("B3: body frames have no eyes, the outline frames keep theirs", () => {
    const withEyes = make(N, N);
    const g = ctx(withEyes);
    g.translate(N / 2, N / 2);
    drawBehemoth(g, BOSS_PX_PER_M, 0, "walk", 0, false, 0.25, true);
    const a = g.getImageData(0, 0, N, N).data;
    const b = frame(0, BOSS_FRAME.walkA);
    const d = diff(a, b, 30);
    expect(d.length).toBeGreaterThan(10);
    const head = behemothHeadM("walk", 0, { x: 0, y: 0 });
    for (const i of d) {
      const x = (i % N) - N / 2;
      const y = Math.floor(i / N) - N / 2;
      expect(Math.hypot(x - (head.x + 0.32) * BOSS_PX_PER_M, y - head.y * BOSS_PX_PER_M)).toBeLessThan(0.45 * BOSS_PX_PER_M); // only round the eyes
    }
  });

  it("G3 E2: an enraged frame has the marker cores; the bake turns them dark red in the body and into the glow picture", () => {
    for (let i = 0; i < BOSS_POSES.length; i++) {
      const enr = frame(0, i, bossHasEnraged(i));
      let marker = 0;
      for (let j = 0; j < enr.length; j += 4) if ((enr[j] as number) > 200 && (enr[j + 2] as number) > 200 && (enr[j + 1] as number) < 60) marker++;
      if (bossHasEnraged(i)) expect(marker, BOSS_POSES[i]?.name).toBeGreaterThan(0); // few in the slam poses: the raised arms cover the torso
      else expect(marker).toBe(0);
    }
    const S = N * 2;
    const src = make(S, S);
    drawBossBody(ctx(src), S, BOSS_PX_PER_M * 2, 0, BOSS_FRAME.walkA, true);
    const glow = run(markerGlowSteps(src, N, make));
    expect(glow).not.toBeNull();
    const gd = ctx(glow as HTMLCanvasElement).getImageData(0, 0, N, N).data;
    let lit = 0;
    for (let j = 3; j < gd.length; j += 4) if ((gd[j] as number) > 60) lit++;
    expect(lit).toBeGreaterThan(50);
    const sd = ctx(src).getImageData(0, 0, S, S).data;
    for (let j = 0; j < sd.length; j += 4) expect(Math.min(sd[j] as number, sd[j + 2] as number) - (sd[j + 1] as number) < 0.4 * 255 || (sd[j + 3] as number) < 128).toBe(true);
    // a calm frame has no marker: no glow picture
    const calm = make(S, S);
    drawBossBody(ctx(calm), S, BOSS_PX_PER_M * 2, 0, BOSS_FRAME.walkA, false);
    expect(run(markerGlowSteps(calm, N, make))).toBeNull();
  });

  it("B2: every relit frame has one sheet ≤ 2048² (4 per 512² sheet, the sheen strips apart); the plain atlas keeps 16 × 4", () => {
    const specs = bossSheetSpecs();
    const seen = new Set<string>();
    for (const s of specs) {
      expect(s.w).toBeLessThanOrEqual(2048);
      expect(s.h).toBeLessThanOrEqual(2048);
      for (const [name, f] of s.frames) {
        expect(seen.has(name)).toBe(false);
        seen.add(name);
        expect(f.x + f.w).toBeLessThanOrEqual(s.w);
        expect(f.y + f.h).toBeLessThanOrEqual(s.h);
      }
    }
    for (const j of bossJobs()) {
      const f = jobFrames(j);
      for (const n of [f.body, f.vein, f.sheen]) if (n) expect(bossSheetOf(n), n).toBeDefined();
    }
    expect(bossJobs()).toHaveLength(16 + 13 + 1);
  });
});

describe("Story 9.15: the relit bake (main thread, worker answers, wipes)", () => {
  const sheetOf = (spec: Parameters<typeof newBossBake>[1] extends ((s: infer S) => unknown) | undefined ? S : never) => ({ spec, canvas: make(spec.w, spec.h), tex: null, dirty: false, pending: [] as string[] });

  it("one job's steps are small (no whole-picture step beyond the drawing) and give body, glow, sheen", () => {
    const units: number[] = [];
    const r = run(bossBakeSteps(0, { i: BOSS_FRAME.walkA, enraged: true, veinOnly: false }, make), units);
    expect(r.body?.width).toBe(N);
    expect(r.vein?.width).toBe(N);
    expect(r.sheen).not.toBeNull();
    expect(units.length).toBeGreaterThan(100);
  });

  it("lands every picture of a look on the main thread, one sheet upload a frame, never a picture before its upload", () => {
    const b = newBossBake(make, sheetOf);
    requestBossLookIn(b, 2);
    let frames = 0;
    let readyBefore = 0;
    for (; frames < 4000 && pumpBossBakeIn(b, 1000); frames++) {
      expect(b.ready.size).toBeGreaterThanOrEqual(readyBefore); // ready only grows
      readyBefore = b.ready.size;
    }
    let total = 0;
    for (const j of bossJobs()) {
      const f = jobFrames(j);
      for (const n of [f.body, f.vein, f.sheen]) if (n) {
        total++;
        expect(b.ready.has(n), n).toBe(true);
      }
    }
    expect(b.ready.size).toBe(total);
    expect(b.stats.onMain).toBe(bossJobs().length);
    // another look starts over: nothing ready, every job queued again
    requestBossLookIn(b, 3);
    expect(b.ready.size).toBe(0);
    expect(b.queue).toHaveLength(bossJobs().length);
  });

  it("a wiped sheet's pictures are not ready any more and are baked again", () => {
    const b = newBossBake(make, sheetOf);
    requestBossLookIn(b, 0);
    for (let i = 0; i < 4000 && pumpBossBakeIn(b, 1000); i++);
    const key = bossSheetSpecs()[0]?.key as string;
    const names = [...(bossSheetSpecs()[0]?.frames.keys() ?? [])];
    expect(sheetWiped(b, key)).toBeGreaterThan(0);
    for (const n of names) expect(b.ready.has(n)).toBe(false);
    for (let i = 0; i < 4000 && pumpBossBakeIn(b, 1000); i++);
    for (const n of names) expect(b.ready.has(n)).toBe(true);
  });

  it("worker answers of an older generation are dropped; a failed worker's jobs go back to the main thread", () => {
    const b = newBossBake(make, sheetOf);
    requestBossLookIn(b, 1);
    // pretend the jobs went to a worker
    b.inFlight = b.queue;
    b.queue = [];
    const j = b.inFlight[0] as (typeof b.inFlight)[number];
    receiveBossWorkerResult(b, { gen: b.gen - 1, look: 1, id: `${j.i}:0:0`, body: null, vein: null, sheen: null });
    expect(b.arrived).toHaveLength(0);
    receiveBossWorkerResult(b, { gen: b.gen, look: 1, id: `${j.i}:0:0`, body: null, vein: null, sheen: null });
    expect(b.arrived).toHaveLength(1);
    const left = b.inFlight.length;
    workerFailed(b);
    expect(b.queue).toHaveLength(left);
    expect(b.inFlight).toHaveLength(0);
  });
});
