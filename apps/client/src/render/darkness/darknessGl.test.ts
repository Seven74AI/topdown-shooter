import { describe, expect, it, vi } from "vitest";
import { DOWNTOWN_MAP, addPlayer, createWorld, loadBalance, setForcedBlackout, startBuild, changeDecayStage, type World } from "@topdown/shared";

vi.mock("phaser", () => ({ BlendModes: { ADD: 1, NORMAL: 0 }, TintModes: { MULTIPLY: 0 } }));
vi.mock("../city/spriteAtlas", async (orig) => ({ ...(await orig<typeof import("../city/spriteAtlas")>()), ensureAtlases: () => ({}) }));

import { DARKNESS_DEPTH } from "./aboveDark";
import { FOG_GL_RES, DARKNESS_GL_FOG_KEY, DARKNESS_GL_KEY, DARKNESS_KEY, DARKNESS_PAD, DARKNESS_RES, DarknessView } from "./DarknessView";
import { DarknessPlan, FlashLights, planDarkness, type DarknessInputs } from "./darknessPlan";
import { resetLightStamps } from "./lightStamps";
import { fakeScene, type CtxOp, type DtCmd, type FakeObject } from "./fakeScene.testkit";
import { FogView } from "../fog/FogView";
import { ScreenFog } from "../fog/screenFog";
import { pinStressCollapseStyle } from "../../debug/stressScenario";
import { textureRegistry } from "../gfx/textureRegistry";

/**
 * Story 10.2 (B8): the GPU darkness draws what the 2D canvas drew — one frame of wave 9 (stage 5, 10 %, CO2 fog bank)
 * through both paths on fake scenes; every 2D call has its GPU command with the same place, scale, turn and alpha.
 */
const balance = loadBalance();
const B = balance.decay.blackout;
const ERASE = 17;

function wave9(): World {
  const w = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
  addPlayer(w, "me", 20, 16);
  startBuild(w); // (a build start applies wave 1's stage: before the stage 5 change)
  pinStressCollapseStyle(w, "fog_bank");
  changeDecayStage(w, 5);
  setForcedBlackout(w, 10);
  return w;
}

function run(webgl: boolean, frames = 1) {
  resetLightStamps();
  const fs = fakeScene([], webgl);
  const w = wave9();
  const fog = new ScreenFog();
  const dark = new DarknessView(fs.scene, fs.makeCanvas);
  const fogView = new FogView(fs.scene, fog, false, fs.makeCanvas);
  dark.fog = fogView;
  const plan = new DarknessPlan(B.maxStamps);
  const inp: DarknessInputs = { localId: "me", drawnOf: () => ({ x: 20, y: 16, facingX: 0.6, facingY: 0.8 }), flamingOf: () => "", molotovs: [], flashes: new FlashLights(4), nowS: 0, viewX: 8, viewY: 9, viewW: 24, viewH: 13.5 };
  for (let i = 0; i < frames; i++) {
    fog.update(w, 20, 16, () => ({ x: 20, y: 16, facingX: 0.6, facingY: 0.8 }));
    planDarkness(plan, w, inp);
    fogView.update(w, plan, 1 / 60);
    dark.update(w, plan, 8, 9, 24, 13.5, 40, 960, 540);
  }
  return { fs, w, dark, fogView, plan };
}

/** The 2D transform before a drawImage → place, scale, turn. */
function placeOf(t: CtxOp): { x: number; y: number; s: number; rot: number } {
  const [a, b, , , e, f] = t.args as number[];
  return { x: e as number, y: f as number, s: Math.hypot(a as number, b as number), rot: Math.atan2(b as number, a as number) };
}

describe("Story 10.2 B8: the GPU darkness (DynamicTexture) draws the 2D canvas's frame", () => {
  it("wave 9: same fill, the same cut-outs (place, scale, turn, strength), the fog drawn in at its alpha, the same warm tints; no canvas, no upload", () => {
    const cpu = run(false);
    const gpu = run(true);
    const k2 = 1 + 2 * DARKNESS_PAD;
    const W = Math.ceil(960 * k2 * DARKNESS_RES);
    const H = Math.ceil(540 * k2 * DARKNESS_RES);
    const ctx = cpu.fs.canvases.find((c) => c.width === W && c.height === H && c.ctx.ops.some((o) => o.op === "fillRect" && o.comp === "copy"))?.ctx;
    if (!ctx) throw new Error("2D darkness canvas");
    // the GPU scene made no darkness canvas texture and uploads nothing per frame
    expect(gpu.fs.keys.has(DARKNESS_KEY)).toBe(false);
    expect(gpu.dark.uploads).toBe(0);
    const main = gpu.fs.dts.get(DARKNESS_GL_KEY);
    const fogDt = gpu.fs.dts.get(DARKNESS_GL_FOG_KEY);
    if (!main || !fogDt) throw new Error("dynamic textures");
    expect([main.width, main.height]).toEqual([W, H]);
    const img = gpu.fs.objects.find((o) => o.texture === DARKNESS_GL_KEY) as FakeObject;
    expect([img.depth, img.visible, gpu.dark.shown]).toEqual([DARKNESS_DEPTH, true, true]);
    expect(img.displayWidth).toBeCloseTo(24 * k2, 9);
    expect(textureRegistry.has(DARKNESS_GL_KEY)).toBe(true);

    // fill
    const fill2d = ctx.ops.find((o) => o.op === "fillRect" && o.comp === "copy") as CtxOp;
    const c = main.cmds;
    expect(c[0]?.op).toBe("clear");
    expect(c[1]).toMatchObject({ op: "fill", rgb: 0x04060c });
    expect(c[1]?.alpha).toBeCloseTo(fill2d.alpha, 9);
    expect(fill2d.fill).toBe("rgb(4,6,12)");
    // cut-outs: every 2D destination-out drawImage ↔ one GPU erase stamp, in order
    const cuts2d: { t: CtxOp; d: CtxOp }[] = [];
    ctx.ops.forEach((o, i) => {
      if (o.op === "drawImage" && o.comp === "destination-out") cuts2d.push({ t: ctx.ops[i - 1] as CtxOp, d: o });
    });
    const cutsGl = c.filter((x) => x.op === "stamp" && x.cfg?.blendMode === ERASE);
    expect(cuts2d.length).toBe(gpu.plan.count);
    expect(cutsGl.length).toBe(cuts2d.length);
    cuts2d.forEach(({ t, d }, i) => {
      const p = placeOf(t);
      const g = cutsGl[i] as DtCmd;
      expect(g.x).toBeCloseTo(p.x, 6);
      expect(g.y).toBeCloseTo(p.y, 6);
      expect(g.cfg?.scaleX).toBeCloseTo(p.s, 6);
      expect(Math.atan2(Math.sin((g.cfg?.rotation ?? 0) - p.rot), Math.cos((g.cfg?.rotation ?? 0) - p.rot))).toBeCloseTo(0, 6);
      expect(g.cfg?.alpha).toBeCloseTo(d.alpha, 9);
    });
    // the fog: drawn in once at CO2's alpha 0.86 after the cut-outs, before the tints
    const fogIdx = c.findIndex((x) => x.op === "stamp" && x.key === DARKNESS_GL_FOG_KEY);
    expect(fogIdx).toBeGreaterThan(c.indexOf(cutsGl.at(-1) as DtCmd));
    expect(c[fogIdx]?.cfg?.alpha).toBeCloseTo(0.86, 9);
    const fog2d = ctx.ops.find((o) => o.op === "drawImage" && o.comp === "source-over" && o.alpha > 0.5) as CtxOp;
    expect(fog2d.alpha).toBeCloseTo(0.86, 9);
    // warm tints: the same count and alphas (≤ 0.1), normal blend
    const tints2d = ctx.ops.filter((o) => o.op === "drawImage" && o.comp === "source-over" && o.alpha <= 0.11);
    const tintsGl = c.slice(fogIdx + 1).filter((x) => x.op === "stamp");
    expect(tintsGl.map((x) => x.cfg?.alpha)).toEqual(tints2d.map((o) => o.alpha));
    expect(tintsGl.every((x) => x.cfg?.blendMode === 0)).toBe(true);
    expect(c.at(-1)?.op).toBe("render");

    // the fog layer: ring in the colour, opaque outside it, two drifting noise layers cut, the beam cut
    const f = fogDt.cmds;
    expect(f[0]?.op).toBe("clear");
    expect(f[1]).toMatchObject({ op: "stamp" });
    expect(f[1]?.cfg?.blendMode).toBe(0);
    const rects = f.filter((x) => x.op === "fill");
    // (the 2D path fills the four rects round the ring's square even at zero size; the GPU path only the non-empty)
    const fogCtx = cpu.fs.canvases.find((cv) => cv !== undefined && cv.ctx.ops.some((o) => o.op === "drawImage" && o.comp === "copy"))?.ctx;
    const rects2d = (fogCtx?.ops ?? []).filter((o) => o.op === "fillRect" && o.comp === "source-over" && (o.args[2] as number) > 0 && (o.args[3] as number) > 0);
    expect(rects.length).toBe(rects2d.length);
    expect(rects.every((x) => x.rgb === 0x2c323c && x.alpha === 1)).toBe(true); // CO2 "44,50,60"
    const noise = f.filter((x) => x.op === "repeat");
    expect(noise.map((x) => [x.cfg?.alpha, x.cfg?.blendMode])).toEqual([
      [0.45, ERASE],
      [0.3, ERASE],
    ]);
    expect(f.filter((x) => x.op === "stamp" && x.cfg?.blendMode === ERASE).length).toBe(1); // my beam
    expect(f.at(-1)?.op).toBe("render");
    // B9: the fog layer is half the darkness layer, stretched back when drawn in
    expect([fogDt.width, fogDt.height]).toEqual([Math.ceil(W * FOG_GL_RES), Math.ceil(H * FOG_GL_RES)]);
    expect(c[fogIdx]?.cfg?.scaleX).toBeCloseTo(W / fogDt.width, 9);
  });

  it("frame after frame: the same two textures (no re-make), one render each, 0 uploads; resized → re-made at the new size", () => {
    const gpu = run(true, 4);
    const main = gpu.fs.dts.get(DARKNESS_GL_KEY);
    expect(main?.cmds.filter((x) => x.op === "render").length).toBe(4);
    expect(gpu.fs.dts.size).toBe(2);
    expect(gpu.dark.paints).toBe(4);
    expect(gpu.dark.uploads).toBe(0);
    gpu.dark.update(gpu.w, gpu.plan, 8, 9, 24, 13.5, 40, 1280, 720);
    const k2 = 1 + 2 * DARKNESS_PAD;
    expect(gpu.fs.dts.get(DARKNESS_GL_KEY)?.width).toBe(Math.ceil(1280 * k2 * DARKNESS_RES));
    gpu.dark.destroy();
    expect(textureRegistry.has(DARKNESS_GL_KEY)).toBe(false);
    expect(gpu.fs.keys.has(DARKNESS_GL_KEY)).toBe(false);
  });

  it("a blackout that ends hides the GPU darkness at once (F1)", () => {
    const gpu = run(true, 2);
    gpu.w.lights.forcedPct = -1;
    gpu.w.lights.blackoutPct = 0;
    gpu.dark.update(gpu.w, gpu.plan, 8, 9, 24, 13.5, 40, 960, 540);
    expect(gpu.dark.shown).toBe(false);
  });
});
