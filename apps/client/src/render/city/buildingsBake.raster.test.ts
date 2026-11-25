/**
 * Asset art review 2026-11-25 (M1, M3, R1–R4, R8): the relit pictures' main-thread bake (the fallback where there is no
 * worker; the worker runs the same `bakeSteps`). A real Canvas 2D in node (`@napi-rs/canvas`, tests only).
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { BAKE_MS_PER_FRAME, BAKE_UNITS_PER_FRAME, FRAME_MINE, bakeSteps, buildingFx, clearRelitCacheForTests, newBake, pumpBake, rebakeAfterCacheLoss, relitSpecs } from "./buildingsAtlas";
import { READ_BAND_ROWS } from "./relight";

const made: HTMLCanvasElement[] = [];
const make = (w: number, h: number): HTMLCanvasElement => {
  const c = createCanvas(Math.max(1, w), Math.max(1, h)) as unknown as HTMLCanvasElement;
  made.push(c);
  return c;
};
const mineSpec = () => {
  const spec = relitSpecs().find((a) => a.frame === FRAME_MINE);
  if (!spec) throw new Error("no mine");
  return spec;
};
function mineBake() {
  const frame = { name: FRAME_MINE, x: 0, y: 0, w: 48, h: 48 };
  const atlas = make(48, 48);
  return { b: newBake(atlas, [frame], make(48, 48), [frame], make, [mineSpec()]), atlas };
}
/** The mine's source is 0.5 m at 384 px/m = 192 px square. */
const SRC = 192;

describe("the buildings atlas bake, main-thread fallback (review M1, R1–R4, R8)", () => {
  it("R1: no single step is bigger than a readback band (the drawing, each band, a row, a shrink): a call never overruns its budget by more", () => {
    clearRelitCacheForTests();
    const { b, atlas } = mineBake();
    const maxStep = Math.max(SRC * READ_BAND_ROWS, (SRC * SRC) >> 3);
    const budget = 3000;
    let calls = 0;
    while (pumpBake(b, budget, Infinity, () => 0)) {
      calls++;
      expect(b.lastUnits).toBeLessThanOrEqual(budget + maxStep);
      expect(calls).toBeLessThan(1000);
    }
    expect(calls).toBeGreaterThan(20);
    const px = (atlas.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, 48, 48).data;
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4) if ((px[i] as number) > 200) opaque++;
    expect(opaque, "the relit mine was written into its atlas frame").toBeGreaterThan(400);
    expect(buildingFx(FRAME_MINE)?.glow).toBe("blink");
  });

  it("R2: the time guard decides (no tiny work cap): with a clock moving 0.1 ms per read the mine is done in ≤ 60 frames", () => {
    clearRelitCacheForTests();
    const { b } = mineBake();
    let t = 0;
    let frames = 0;
    while (pumpBake(b, BAKE_UNITS_PER_FRAME, BAKE_MS_PER_FRAME, () => (t += 0.1))) frames++;
    expect(frames).toBeLessThanOrEqual(60);
    expect(BAKE_UNITS_PER_FRAME).toBeGreaterThanOrEqual(400_000);
    // and the guard does end a call: a clock moving 10 ms per read stops after one step
    clearRelitCacheForTests();
    const { b: b2 } = mineBake();
    let t2 = 0;
    expect(pumpBake(b2, Infinity, BAKE_MS_PER_FRAME, () => (t2 += 10))).toBe(true);
    expect(b2.lastUnits).toBeLessThanOrEqual(Math.max(SRC * READ_BAND_ROWS, (SRC * SRC) >> 3));
  });

  it("R3: a restore keeps an intact cache; only a wiped one is baked again", () => {
    clearRelitCacheForTests();
    const { b } = mineBake();
    while (pumpBake(b, Infinity, Infinity)) {
      /* finish it */
    }
    expect(rebakeAfterCacheLoss(b), "intact: nothing re-queued").toBe(0);
    expect(buildingFx(FRAME_MINE)).toBeDefined();
    // Android empties the kept canvases
    for (const c of made) (c.getContext("2d") as CanvasRenderingContext2D).clearRect(0, 0, c.width, c.height);
    const n = rebakeAfterCacheLoss(b);
    expect(n).toBe(relitSpecs().length);
    expect(b.queue.length).toBe(n);
    expect(buildingFx(FRAME_MINE), "the animation data waits for the new bake").toBeUndefined();
  });

  it("R4: a bake abandoned midway (a restore during it) empties its source and scratch canvases", () => {
    clearRelitCacheForTests();
    made.length = 0;
    const steps = bakeSteps(mineSpec(), make);
    for (let i = 0; i < 400; i++) steps.next(); // well into the passes
    const src = made.find((c) => c.width === SRC) as HTMLCanvasElement;
    expect(src).toBeDefined();
    steps.return(undefined as never);
    expect(src.width, "the source drawing is released").toBe(0);
  });

  it("R8: the relit mine is pixel-for-pixel the approved look (same noise as the proposal page)", () => {
    const steps = bakeSteps(mineSpec(), make);
    let s = steps.next();
    while (!s.done) s = steps.next();
    const data = (s.value.base.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, 48, 48).data;
    let h = 0x811c9dc5; // FNV-1a over the RGBA bytes
    for (let i = 0; i < data.length; i++) h = Math.imul(h ^ (data[i] as number), 0x01000193) >>> 0;
    const digest = h.toString(16).padStart(8, "0");
    expect(digest).toBe(MINE_DIGEST);
  });
});

/** The relit mine as approved (direct fbm: the proposal page's noise), at the game's 48 px frame. */
const MINE_DIGEST = "2def4a61"; // = the step-1 output (583388c: sha1 1bed08a38f93de3b), before the noise table came and went
