/**
 * Review M1 / M3 (asset art review 2026-11-25): the relit pictures bake in small resumable slices (never one whole
 * picture per call), and a lost cache re-queues the bake. A real Canvas 2D in node (`@napi-rs/canvas`, tests only).
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { BAKE_UNITS_PER_FRAME, FRAME_MINE, buildingFx, newBake, pumpBake, rebakeAfterCacheLoss, relitSpecs } from "./buildingsAtlas";

const make = (w: number, h: number): HTMLCanvasElement => createCanvas(Math.max(1, w), Math.max(1, h)) as unknown as HTMLCanvasElement;

function mineBake() {
  const spec = relitSpecs().find((a) => a.frame === FRAME_MINE);
  if (!spec) throw new Error("no mine");
  const frame = { name: FRAME_MINE, x: 0, y: 0, w: 48, h: 48 };
  const atlas = make(48, 48);
  const glow = make(48, 48);
  return { b: newBake(atlas, [frame], glow, [frame], make, [spec]), atlas };
}

describe("the buildings atlas bake (review M1, M3)", () => {
  it("one pump call stays within its work budget: a picture takes many calls, none over budget + one step", () => {
    rebakeAfterCacheLoss(null);
    const { b, atlas } = mineBake();
    const budget = 3000; // a small budget, so the 192 × 192 source (0.5 m at 384 px/m) needs many slices
    // the largest single step: the source drawing / readback / a shrink (192² / 8 = 4608 units); a row is 192
    const maxStep = (192 * 192) >> 3;
    let calls = 0;
    // a frozen clock: only the work units can end a call
    while (pumpBake(b, budget, Infinity, () => 0)) {
      calls++;
      expect(b.lastUnits).toBeLessThanOrEqual(budget + maxStep);
      expect(calls).toBeLessThan(500);
    }
    expect(calls).toBeGreaterThan(20);
    const px = (atlas.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, 48, 48).data;
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4) if ((px[i] as number) > 200) opaque++;
    expect(opaque, "the relit mine was written into its atlas frame").toBeGreaterThan(400);
    expect(buildingFx(FRAME_MINE)?.glow).toBe("blink");
  });

  it("the time guard ends a call too, and the default budget is a phone frame's worth", () => {
    rebakeAfterCacheLoss(null);
    const { b } = mineBake();
    let t = 0;
    // each clock read moves 10 ms on: the guard (6 ms) stops the call after its first step
    expect(pumpBake(b, Infinity, 6, () => (t += 10))).toBe(true);
    expect(b.lastUnits).toBeLessThanOrEqual((192 * 192) >> 3);
    expect(BAKE_UNITS_PER_FRAME).toBeLessThanOrEqual(25000);
  });

  it("a lost cache (Android emptied the canvases) drops the pictures and queues every relit frame again", () => {
    const { b } = mineBake();
    while (pumpBake(b, Infinity, Infinity)) {
      /* finish it */
    }
    expect(buildingFx(FRAME_MINE)).toBeDefined();
    const n = rebakeAfterCacheLoss(b);
    expect(n).toBe(relitSpecs().length);
    expect(b.queue.length).toBe(n);
    expect(b.job).toBeNull();
    expect(buildingFx(FRAME_MINE), "the animation data waits for the new bake").toBeUndefined();
  });
});
