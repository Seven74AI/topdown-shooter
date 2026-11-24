import { describe, expect, it, vi } from "vitest";
import { DOWNTOWN_MAP, addBuildingAt, addPlayer, BUILD_GRID_M, createWorld, loadBalance, setForcedBlackout, spawnZombie, startBuild, type World } from "@topdown/shared";

vi.mock("phaser", () => ({ BlendModes: { ADD: 1, NORMAL: 0 }, TintModes: { MULTIPLY: 0 } }));
vi.mock("../city/spriteAtlas", async (orig) => ({ ...(await orig<typeof import("../city/spriteAtlas")>()), ensureAtlases: () => ({}) }));

import { textureRegistry } from "../gfx/textureRegistry";
import { DARKNESS_DEPTH, ABOVE_DARK } from "./aboveDark";
import { DARKNESS_KEY, DARKNESS_RES, DarknessView } from "./DarknessView";
import { DarknessPlan, FlashLights, planDarkness, type DarknessInputs } from "./darknessPlan";
import { EyesView } from "./EyesView";
import { BeamSparkleView } from "./BeamSparkleView";
import { LIGHT_STAMP_KEYS, resetLightStamps } from "./lightStamps";
import { fakeScene, type FakeObject } from "./fakeScene.testkit";
import { PlayerView, BODY_DEPTH } from "../PlayerView";
import { FloodlightView } from "../FloodlightView";
import { FX_EYES, FX_EYES_BRUTE } from "../city/spriteAtlas";

/** Story 6.3 (T3, T4): the darkness layer and what draws above it, on a fake scene (no Phaser, no DOM). */
const balance = loadBalance();
const B = balance.decay.blackout;
const NO_WAVES = { waves: () => {} };

function world(pct: number | null = 5): World {
  const w = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: NO_WAVES });
  addPlayer(w, "me", 20, 16);
  startBuild(w);
  if (pct !== null) setForcedBlackout(w, pct);
  return w;
}
const inputs = (): DarknessInputs => ({ localId: "me", drawnOf: () => undefined, flamingOf: () => "", molotovs: [], flashes: new FlashLights(4), nowS: 0, viewX: 4, viewY: 2, viewW: 32, viewH: 18 });

function darkness(lowFx = false) {
  resetLightStamps();
  const fs = fakeScene();
  const view = new DarknessView(fs.scene, fs.makeCanvas);
  void lowFx; // the darkness takes no quality flag at all (F6): only the sparkles do
  return { fs, view };
}
function frame(view: DarknessView, w: World, plan = new DarknessPlan(B.maxStamps)) {
  planDarkness(plan, w, inputs());
  view.update(w, plan, 4, 2, 32, 18, 40, 1280, 720);
  return plan;
}

describe("Story 6.3 DarknessView", () => {
  it("F9: no blackout → hidden, never painted nor re-uploaded, no texture made", () => {
    const { fs, view } = darkness();
    const w = world(null);
    for (let i = 0; i < 5; i++) frame(view, w);
    expect(view.paints).toBe(0);
    expect(view.uploads).toBe(0);
    expect(fs.refreshes).toBe(0);
    expect(fs.keys.has(DARKNESS_KEY)).toBe(false);
    expect(view.shown).toBe(false);
    view.destroy();
  });

  it("in a blackout: one half-resolution canvas through addGeneratedTexture, at 11.7, covering the camera view; one fill + stamps + one upload per frame", () => {
    const { fs, view } = darkness();
    const w = world(5);
    const plan = frame(view, w);
    expect(fs.keys.has(DARKNESS_KEY)).toBe(true);
    expect(textureRegistry.has(DARKNESS_KEY)).toBe(true);
    const c = fs.canvases.find((x) => x.width === 1280 * DARKNESS_RES && x.height === 720 * DARKNESS_RES);
    expect(c).toBeDefined();
    const img = fs.objects.find((o) => o.texture === DARKNESS_KEY) as FakeObject;
    expect([img.depth, img.visible, img.x, img.y, img.displayWidth, img.displayHeight]).toEqual([DARKNESS_DEPTH, true, 4, 2, 32, 18]);
    const ctx = c?.ctx;
    if (!ctx) throw new Error("ctx");
    const fills = ctx.ops.filter((o) => o.op === "fillRect");
    expect(fills.at(-1)?.alpha).toBeCloseTo(0.95, 6);
    expect(fills.at(-1)?.fill).toBe("rgb(2,2,4)"); // BL3 pitch
    const cuts = ctx.ops.filter((o) => o.op === "drawImage" && o.comp === "destination-out");
    expect(cuts.length).toBe(plan.count); // my glow + my cone
    expect(plan.count).toBe(2);
    const ups = view.uploads;
    ctx.clear();
    frame(view, w);
    expect(view.uploads).toBe(ups + 1);
    expect(ctx.count("fillRect")).toBe(1);
    expect(ctx.ops.some((o) => o.op === "drawImage" && o.alpha > 0.11 && o.comp === "source-over")).toBe(false); // tints ≤ 0.1
    view.destroy();
    expect(textureRegistry.has(DARKNESS_KEY)).toBe(false);
  });

  it("F6: the darkness alpha is the same with ?fx=low on and off; 20 % → 0.8 (BL2 moonlit), half dark → 0.4", () => {
    const a = darkness(false);
    const b = darkness(true);
    const w = world(20);
    frame(a.view, w);
    frame(b.view, w);
    expect(a.view.paintedAlpha).toBeCloseTo(0.8, 9);
    expect(b.view.paintedAlpha).toBe(a.view.paintedAlpha);
    const fill = a.fs.canvases.flatMap((c) => c.ctx.ops).filter((o) => o.op === "fillRect").at(-1);
    expect(fill?.fill).toBe("rgb(6,12,30)");
    w.lights.forcedPct = -1;
    w.lights.blackoutPct = 20;
    w.lights.halfDark = true;
    frame(a.view, w);
    expect(a.view.paintedAlpha).toBeCloseTo(0.4, 9);
    a.view.destroy();
    b.view.destroy();
  });

  it("F6 / AC 12: the darkness code reads no quality or settings flag, and no setting or URL option turns it off", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = (f: string) => readFileSync(join(__dirname, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const f of ["DarknessView.ts", "darknessPlan.ts", "lightStamps.ts"]) expect(src(f), f).not.toMatch(/lowFx|urlOptions|getSettings|settings/);
    const opts = src("../../debug/urlOptions.ts");
    const settings = src("../../settings/settings.ts");
    for (const s of [opts, settings]) expect(s).not.toMatch(/noDark|darkOff|darkness\s*:\s*false|brightness/i);
  });

  it("a blackout that ends hides the darkness at once and stops repainting (F1: no fade)", () => {
    const { view } = darkness();
    const w = world(5);
    frame(view, w);
    expect(view.shown).toBe(true);
    setForcedBlackout(w, -1);
    const p = view.paints;
    frame(view, w);
    frame(view, w);
    expect(view.shown).toBe(false);
    expect(view.paints).toBe(p);
    view.destroy();
  });

  it("brief 20: a simulated context loss repaints the darkness and every light stamp (registry rebuild)", () => {
    const { fs, view } = darkness();
    const w = world(5);
    frame(view, w);
    for (const k of LIGHT_STAMP_KEYS) expect(textureRegistry.has(k), k).toBe(true);
    const paints = view.paints;
    const refreshes = fs.refreshes;
    const stampFills = fs.canvases.reduce((n, c) => n + c.ctx.count("fillRect") + c.ctx.count("fill"), 0);
    textureRegistry.rebuildAll();
    expect(view.paints).toBe(paints + 1); // the darkness drawn again (still dark: no cheat by app-switching)
    expect(fs.refreshes).toBe(refreshes + 1);
    expect(fs.canvases.reduce((n, c) => n + c.ctx.count("fillRect") + c.ctx.count("fill"), 0)).toBeGreaterThan(stampFills);
    view.destroy();
    resetLightStamps();
  });

  it("a resized game canvas remakes the canvas at the new half size", () => {
    const { fs, view } = darkness();
    const w = world(10);
    frame(view, w);
    const plan = new DarknessPlan(B.maxStamps);
    planDarkness(plan, w, inputs());
    view.update(w, plan, 4, 2, 32, 18, 40, 800, 360);
    expect(fs.canvases.some((c) => c.width === 400 && c.height === 180)).toBe(true);
    expect(fs.objects.filter((o) => o.texture === DARKNESS_KEY && !o.destroyed)).toHaveLength(1);
    view.destroy();
  });
});

describe("Story 6.3 EyesView (F4, D5)", () => {
  function eyes() {
    const fs = fakeScene();
    const v = new EyesView(fs.scene, balance);
    return { fs, v };
  }
  const imgs = new Map<number, { x: number; y: number; rotation: number }>();
  const zv = { drawnImage: (id: number) => imgs.get(id) };

  it("eyes within 14 m only, above the darkness; a Brute's are the big frame; hidden when the blackout is off", () => {
    const { fs, v } = eyes();
    const w = world(5);
    const near = spawnZombie(w, "walker", 25, 16);
    const far = spawnZombie(w, "walker", 20 + 14.5, 16);
    const brute = spawnZombie(w, "brute", 20, 26);
    imgs.clear();
    imgs.set(near, { x: 25, y: 16, rotation: Math.PI });
    imgs.set(far, { x: 34.5, y: 16, rotation: 0 });
    imgs.set(brute, { x: 20, y: 26, rotation: 0 });
    v.update(w, zv, 20, 16, B.eyesM);
    expect(v.drawn).toBe(2);
    const shown = fs.objects.filter((o) => o.visible);
    expect(shown.every((o) => o.depth === ABOVE_DARK.eyes)).toBe(true);
    expect(shown.map((o) => o.frame).sort()).toEqual([FX_EYES, FX_EYES_BRUTE].sort());
    const e = shown.find((o) => o.frame === FX_EYES) as FakeObject;
    expect(e.x).toBeLessThan(25); // ahead of the body, along its facing (west)
    expect(e.alpha).toBeCloseTo(0.9, 6);
    setForcedBlackout(w, -1);
    v.update(w, zv, 20, 16, B.eyesM);
    expect(v.drawn).toBe(0);
    expect(fs.objects.some((o) => o.visible)).toBe(false);
  });
});

describe("Story 6.3 BeamSparkleView (D7)", () => {
  it("sparkles only inside beams and floodlight pools, ≤ cap; ?fx=low halves the cap; none without a blackout", () => {
    const w = world(5);
    addBuildingAt(w, { id: 901, type: "floodlight", ownerId: "me", gx: 22 / BUILD_GRID_M, gy: 12 / BUILD_GRID_M, rot: 0, hp: 150 });
    const plan = new DarknessPlan(B.maxStamps);
    planDarkness(plan, w, inputs());
    const full = fakeScene();
    const low = fakeScene();
    const a = new BeamSparkleView(full.scene, balance, false);
    const b = new BeamSparkleView(low.scene, balance, true);
    expect(a.cap).toBe(B.maxSparkles);
    expect(b.cap).toBe(B.maxSparkles / 2);
    a.update(w, plan, 1.3);
    b.update(w, plan, 1.3);
    expect(a.drawn).toBeGreaterThan(0);
    expect(a.drawn).toBeLessThanOrEqual(a.cap);
    expect(b.drawn).toBeLessThanOrEqual(b.cap);
    expect(full.objects.filter((o) => o.visible).every((o) => o.depth === ABOVE_DARK.sparkle && o.blend === 1)).toBe(true);
    // every sparkle sits inside a floodlight pool (6 m) or my cone (8 m from me)
    for (const o of full.objects.filter((x) => x.visible)) {
      const inPool = Math.hypot(o.x - 22.5, o.y - 12.5) <= 6 + 1e-6;
      const inCone = Math.hypot(o.x - 20, o.y - 16) <= 8 + 1e-6;
      expect(inPool || inCone).toBe(true);
    }
    setForcedBlackout(w, -1);
    planDarkness(plan, w, inputs());
    a.update(w, plan, 1.4);
    expect(a.drawn).toBe(0);
  });
});

describe("Story 6.3 PlayerView depth (F5, D6)", () => {
  it("in a blackout the body and ring are above the darkness; back to their normal depths after", () => {
    const fs = fakeScene();
    const v = new PlayerView(fs.scene, 0.4);
    const before = v.depths;
    expect(before.body).toBe(BODY_DEPTH);
    v.setAboveDark(true);
    expect(v.depths.body).toBeGreaterThan(DARKNESS_DEPTH);
    expect(v.depths.ring).toBeGreaterThan(DARKNESS_DEPTH);
    expect(v.depths.body).toBe(ABOVE_DARK.teammate);
    v.setAboveDark(false);
    expect(v.depths).toEqual(before);
  });
});

describe("Story 6.3 FloodlightView (AC 10)", () => {
  it("the pool is 12 m across in a blackout, 8 m otherwise", () => {
    const fs = fakeScene();
    const v = new FloodlightView(fs.scene, balance);
    const w = world(null);
    addBuildingAt(w, { id: 902, type: "floodlight", ownerId: "me", gx: 22 / BUILD_GRID_M, gy: 12 / BUILD_GRID_M, rot: 0, hp: 150 });
    v.update(w, 0, 0, 48, 32);
    const pool = () => fs.objects.find((o) => o.visible) as FakeObject;
    expect(pool().displayWidth).toBe(8);
    setForcedBlackout(w, 5);
    v.update(w, 0, 0, 48, 32);
    expect(pool().displayWidth).toBe(12);
  });
});
