/**
 * Story 9.13 (AC 1, 3; T5): take 4's relit look in game code (`charRelight.ts`, `charactersFrames.ts`), on a real
 * Canvas 2D in node (`@napi-rs/canvas`, tests only): the outline passes through unlit (KEEP_OUTLINE), no step does a
 * whole picture, one relit Walker frame is pinned, the emissive layer and the Bloater's veins / sacs are found, and
 * the frame list's `glows` agrees with what the bake detects.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { READ_BAND_ROWS } from "./relight";
import { SHEEN_STEPS, relightCharSteps, rowBoxBlurSteps, sheenSide, sheenStep } from "./charRelight";
import { boxBlur } from "./relight";
import { CHAR_PX_PER_R, CHAR_SS, charArt, charArts, charFrameSteps, frameSide, walkFrame, type CharBaked } from "./charactersFrames";
import { VEIN_STEPS } from "./charBloaterFx";
import { CHAR_R_PX } from "./spriteAtlas";

const make = (w: number, h: number): HTMLCanvasElement => createCanvas(Math.max(1, w), Math.max(1, h)) as unknown as HTMLCanvasElement;
const ctx = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext("2d") as CanvasRenderingContext2D;
const run = <T>(g: Generator<number, T, void>, units?: number[]): T => {
  let s = g.next();
  while (!s.done) {
    units?.push(s.value);
    s = g.next();
  }
  return s.value;
};
const bake = (frame: string, units?: number[]): CharBaked => {
  const a = charArt(frame);
  if (!a) throw new Error(frame);
  return run(charFrameSteps(a, make), units);
};
function fnv1a32(bytes: Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] as number;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/** fnv1a32 of the relit `zombie_walker_a_w0` base picture (@napi-rs/canvas 1.1.0). Freezes the approved look's port. */
const WALKER_DIGEST = 378516902;

describe("Story 9.13: the characters' relit look (take 4)", () => {
  it("frames are the game's: 34 px per radius (spriteAtlas CHAR_R_PX), source at ss 2", () => {
    expect(CHAR_PX_PER_R).toBe(CHAR_R_PX);
    expect(CHAR_SS).toBe(2);
    expect(frameSide(1.55)).toBe(106);
  });

  it("KEEP_OUTLINE: the drawing's outline pixels (lum < 0.09) come out exactly as drawn, unlit", () => {
    const W = 80;
    const src = make(W, W);
    const g = ctx(src);
    g.fillStyle = "#7d8877"; // walker skin
    g.beginPath();
    g.arc(40, 40, 26, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(6,6,7,0.85)"; // today's outline colour
    g.lineWidth = 4;
    g.stroke();
    const before = ctx(src).getImageData(0, 0, W, W).data;
    const lit = run(relightCharSteps(src, W, 1, 68, 7, make)); // ss 1: the output is the source size (no shrink)
    const after = ctx(lit.base).getImageData(0, 0, W, W).data;
    let outline = 0;
    let lit2 = 0;
    for (let i = 0; i < W * W; i++) {
      const r = before[i * 4] as number;
      const gg = before[i * 4 + 1] as number;
      const b = before[i * 4 + 2] as number;
      const a = before[i * 4 + 3] as number;
      if (a < 2) continue;
      const lum = (r * 0.3 + gg * 0.55 + b * 0.15) / 255;
      if (lum < 0.09) {
        outline++;
        for (let c = 0; c < 4; c++) expect(after[i * 4 + c]).toBe(before[i * 4 + c]);
      } else if (after[i * 4] !== r || after[i * 4 + 1] !== gg) lit2++;
    }
    expect(outline, "the ring has outline pixels").toBeGreaterThan(300);
    expect(lit2, "the skin inside is relit").toBeGreaterThan(1000);
  });

  it("no single step relights a whole picture: each yields at most a readback band (or a strip of the output)", () => {
    const a = charArt(walkFrame("walker", 0, 0));
    if (!a) throw new Error("walker");
    const n = frameSide(a.extent);
    const W = n * CHAR_SS;
    const units: number[] = [];
    bake(a.frame, units);
    expect(units.length).toBeGreaterThan(500);
    expect(Math.max(...units)).toBeLessThanOrEqual(Math.max(W * READ_BAND_ROWS, n * n * 4));
    expect(Math.max(...units)).toBeLessThan(W * W);
  });

  it("the row-wise blur gives the same sums as relight.ts's box blur (B16)", () => {
    for (const [w, h, r] of [[37, 53, 3], [120, 90, 8], [5, 9, 1.2]] as const) {
      const a = new Float32Array(w * h).map((_, i) => ((i * 7919) % 101) / 100);
      expect(Array.from(run(rowBoxBlurSteps(a, w, h, r)))).toEqual(Array.from(boxBlur(a, w, h, r)));
    }
  });

  it("pins one relit Walker frame (the approved look's port; update only with a designer-approved look change)", () => {
    const r = bake(walkFrame("walker", 0, 0));
    const n = frameSide(1.55);
    expect([r.base.width, r.base.height]).toEqual([n, n]);
    const d = fnv1a32(ctx(r.base).getImageData(0, 0, n, n).data);
    expect(d).toBe(WALKER_DIGEST);
    expect(r.sheen?.width).toBe(sheenSide(n) * SHEEN_STEPS);
    expect(r.glow, "a Walker has no glowing detail").toBeNull();
  });

  it("emissive: the Spitter's acid becomes a glow layer; a Bloater has none (as on the page) but veins and sacs", () => {
    const sp = bake("zombie_spitter_a");
    expect(sp.glow).not.toBeNull();
    const n = frameSide(2.35);
    const gd = ctx(sp.glow as HTMLCanvasElement).getImageData(0, 0, n, n).data;
    let lit = 0;
    for (let i = 3; i < gd.length; i += 4) if ((gd[i] as number) > 40) lit++;
    expect(lit).toBeGreaterThan(50);
    const bl = bake("zombie_bloater_swell3_e"); // BL5 gas sacs, fully swollen
    expect(bl.glow).toBeNull();
    expect(bl.veins?.width).toBe(frameSide(1.8) * VEIN_STEPS);
    expect(bl.bloater?.sacs.length).toBeGreaterThanOrEqual(4);
    expect(bl.bloater?.periodS).toBeCloseTo((70 - 25) / (40 + 90), 6);
    let veinPx = 0;
    const vd = ctx(bl.veins as HTMLCanvasElement).getImageData(0, 0, (bl.veins as HTMLCanvasElement).width, frameSide(1.8)).data;
    for (let i = 3; i < vd.length; i += 4) if ((vd[i] as number) > 20) veinPx++;
    expect(veinPx, "glowing veins were drawn").toBeGreaterThan(200);
  });

  it("the frame list's `glows` matches what the bake finds on every primary frame (no glow frame missing or wasted)", () => {
    for (const a of charArts()) {
      if (!a.primary || a.bloater) continue;
      const r = run(charFrameSteps(a, make));
      expect(r.glow !== null, a.frame).toBe(a.glows === true);
    }
  }, 60_000);

  it("sheen steps follow sin(0.4 t) across the baked positions", () => {
    expect(sheenStep(0)).toBe(Math.round((SHEEN_STEPS - 1) / 2));
    expect(sheenStep(Math.PI / 0.8)).toBe(SHEEN_STEPS - 1);
    expect(sheenStep((3 * Math.PI) / 0.8)).toBe(0);
  });
});
