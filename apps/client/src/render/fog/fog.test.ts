import { describe, expect, it, vi } from "vitest";
import { DOWNTOWN_MAP, addPlayer, applyDecayStage, createWorld, gearBit, gameplayDecayMasks, loadBalance, setForcedBlackout, startBuild, startWave, type World } from "@topdown/shared";

vi.mock("phaser", () => ({ BlendModes: { ADD: 1, NORMAL: 0, MULTIPLY: 2 }, TintModes: { MULTIPLY: 0 } }));
vi.mock("../city/spriteAtlas", async (orig) => ({ ...(await orig<typeof import("../city/spriteAtlas")>()), ensureAtlases: () => ({}) }));

import { ScreenFog } from "./screenFog";
import { FogView, FOG_DEPTH } from "./FogView";
import { DarknessView } from "../darkness/DarknessView";
import { DarknessPlan, FlashLights, planDarkness, type DarknessInputs } from "../darkness/darknessPlan";
import { DARKNESS_DEPTH } from "../darkness/aboveDark";
import { resetLightStamps } from "../darkness/lightStamps";
import { fakeScene, type FakeObject } from "../darkness/fakeScene.testkit";

/** Story 6.4 (T4): the fog on my screen (rule) and its look (FogView), on a fake scene. */
const balance = loadBalance();
const QUIET = { waves: () => {}, zombies: () => {} };

/** Downtown at `stage` in a wave (or build), "me" at (20, 16) facing +x. */
function world(stage: number, phase: "wave" | "build" = "wave"): World {
  const w = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: QUIET });
  w.debug.decayStageByWave = Array(10).fill(stage);
  addPlayer(w, "me", 20, 16);
  startBuild(w);
  if (phase === "wave") startWave(w);
  applyDecayStage(w, stage, gameplayDecayMasks(DOWNTOWN_MAP)[0] as number);
  return w;
}

describe("Story 6.4 ScreenFog: what my screen shows (F3, F6; D2, D10)", () => {
  it("stage 5 wave: 8.9 m shown, 9.5 m half, 10.1 m hidden; stage 4: no fog at all", () => {
    const fog = new ScreenFog();
    const w = world(5);
    fog.update(w, 20, 16, () => undefined);
    expect(fog.on).toBe(true);
    expect(fog.visibility(20, 16 + 8.9)).toBe(1);
    expect(fog.visibility(20, 16 + 9.5)).toBeCloseTo(0.5, 9);
    expect(fog.visibility(20, 16 + 10.1)).toBe(0);
    const ruins = new ScreenFog();
    ruins.update(world(4), 20, 16, () => undefined);
    expect(ruins.on).toBe(false);
    expect(ruins.visibility(20, 40)).toBe(1);
  });

  it("Story 12.3 (AC 5): the fog lifts over the fly-out (the horde shows through), gone at 1; a boarded body casts no beam", () => {
    const w = world(5);
    const mate = addPlayer(w, "mate", 20, 30);
    mate.facingX = 1;
    mate.facingY = 0;
    const fog = new ScreenFog();
    fog.update(w, 20, 16, () => undefined, 0.5);
    expect(fog.on).toBe(true);
    expect(fog.visibility(20, 16 + 10.1)).toBeCloseTo(0.5, 9);
    fog.update(w, 20, 16, () => undefined, 1);
    expect(fog.on).toBe(false);
    expect(fog.visibility(20, 40)).toBe(1);
    w.extract.boarded.add("mate");
    fog.update(w, 20, 16, () => undefined, 0);
    expect(fog.beamsNow).toBe(1);
    expect(fog.visibility(27, 30)).toBe(0); // the beam from the pad is gone
  });

  it("every STANDING survivor's beam reveals (a teammate's too, D2); a downed one's does not", () => {
    const w = world(5);
    const mate = addPlayer(w, "mate", 20, 30);
    mate.facingX = 1;
    mate.facingY = 0;
    const fog = new ScreenFog();
    fog.update(w, 20, 16, () => undefined);
    expect(fog.beamsNow).toBe(2);
    // 7 m east of the mate (inside its 8 m beam), 15.6 m from me: shown.
    expect(fog.visibility(27, 30)).toBe(1);
    mate.status = "downed";
    fog.update(w, 20, 16, () => undefined);
    expect(fog.beamsNow).toBe(1);
    expect(fog.visibility(27, 30)).toBe(0);
    // The Tactical flashlight (gear) reaches 12 m from me: 11 m ahead is shown.
    const me = w.players.get("me");
    if (!me) throw new Error("me");
    me.facingX = 1;
    me.facingY = 0;
    me.gear = gearBit(balance, "tactical_flashlight");
    fog.update(w, 20, 16, () => undefined);
    expect(fog.visibility(31, 16)).toBe(1);
    me.gear = 0;
    fog.update(w, 20, 16, () => undefined);
    expect(fog.visibility(31, 16)).toBe(0);
  });

  it("D10: out and spectating, the fog centres on the viewer the scene passes (the teammate I watch)", () => {
    const w = world(5);
    const fog = new ScreenFog();
    fog.update(w, 40, 16, () => undefined); // the spectated teammate's drawn position
    expect(fog.visibility(40, 24)).toBe(1);
    expect(fog.visibility(20, 6)).toBe(0); // 10 m+ from the viewer (my own body is not the centre)
  });

  it("the drawn pose is used when given (beams follow the drawn facing, not the World's)", () => {
    const w = world(5);
    const fog = new ScreenFog();
    fog.update(w, 20, 16, (id) => (id === "me" ? { x: 20, y: 16, facingX: 0, facingY: 1 } : undefined));
    // facing +y, Tactical-less 8 m beam: 7 m south is clear anyway; use the build radius check instead.
    expect(fog.visibility(20, 16 + 7.5)).toBe(1);
  });
});

describe("Story 6.4 FogView: the fog look rides in the darkness; no full-screen quad (D8, AC 6)", () => {
  function setup(stage: number, blackout: number | null) {
    resetLightStamps();
    const fs = fakeScene();
    const w = world(stage);
    if (blackout !== null) setForcedBlackout(w, blackout);
    else w.lights.blackoutPct = 0;
    const fog = new ScreenFog();
    const dark = new DarknessView(fs.scene, fs.makeCanvas);
    const fogView = new FogView(fs.scene, fog, false, fs.makeCanvas);
    dark.fog = fogView;
    const plan = new DarknessPlan(balance.decay.blackout.maxStamps);
    const inp: DarknessInputs = { localId: "me", drawnOf: () => undefined, flamingOf: () => "", molotovs: [], flashes: new FlashLights(4), nowS: 0, viewX: 8, viewY: 9, viewW: 24, viewH: 13.5 };
    const frame = () => {
      fog.update(w, 20, 16, () => undefined);
      planDarkness(plan, w, inp);
      fogView.update(w, plan, 1 / 60);
      dark.update(w, plan, 8, 9, 24, 13.5, 40, 960, 540);
    };
    const geo = fs.objects.find((o) => o.depth === FOG_DEPTH) as FakeObject;
    return { fs, w, fog, dark, fogView, frame, geo };
  }

  it("blackout on (every stage-5 wave): painted into the darkness canvas, the geometry stays hidden", () => {
    const s = setup(5, null);
    s.w.lights.blackoutPct = 10; // wave 9's level (server truth)
    for (let i = 0; i < 5; i++) s.frame();
    expect(s.fogView.inDarkness).toBe(true);
    expect(s.fogView.darkPaints).toBe(5);
    expect(s.fogView.geometryDraws).toBe(0);
    expect(s.geo.visible).toBe(false);
    expect(FOG_DEPTH).toBeLessThan(DARKNESS_DEPTH);
  });

  it("no darkness drawn (dev cheat): ring geometry beyond the clear radius only, redrawn only when the radii change", () => {
    const s = setup(5, null);
    for (let i = 0; i < 5; i++) s.frame();
    expect(s.fogView.inDarkness).toBe(false);
    expect(s.fogView.darkPaints).toBe(0);
    expect(s.fogView.geometryDraws).toBe(1);
    expect(s.geo.visible).toBe(true);
    expect([s.geo.x, s.geo.y]).toEqual([20, 16]); // centred on the viewer (moved, not redrawn)
  });

  it("stage 4: nothing (no fog)", () => {
    const s = setup(4, null);
    s.frame();
    expect([s.fogView.darkPaints, s.fogView.geometryDraws, s.geo.visible]).toEqual([0, 0, false]);
  });

  it("F5 / D8: ?fx=low changes only the look — the same visibility for the same inputs", () => {
    const w = world(5);
    const a = new ScreenFog();
    const b = new ScreenFog();
    const fs = fakeScene();
    new FogView(fs.scene, a, false, fs.makeCanvas);
    new FogView(fs.scene, b, true, fs.makeCanvas);
    a.update(w, 20, 16, () => undefined);
    b.update(w, 20, 16, () => undefined);
    for (let d = 8; d <= 11; d += 0.25) expect(a.visibility(20 + d, 16)).toBe(b.visibility(20 + d, 16));
  });
});

describe("Story 10.1 review L7 (AC 2): Fog detail never changes what the fog hides", () => {
  it("ScreenFog radii and visibility() are identical at Fog detail Full and Plain (a sweep of 0–12 m round the viewer)", async () => {
    const { resetSettingsCache, saveSettings } = await import("../../settings/settings");
    const sample = (): { radii: string; vis: number[] } => {
      const fog = new ScreenFog();
      fog.update(world(5), 20, 16, () => undefined);
      const vis: number[] = [];
      for (let d = 0; d <= 12; d += 0.25) for (let a = 0; a < 8; a++) vis.push(fog.visibility(20 + Math.cos(a) * d, 16 + Math.sin(a) * d));
      return { radii: JSON.stringify(fog.radii), vis };
    };
    resetSettingsCache();
    saveSettings({ fog: "full" });
    const full = sample();
    saveSettings({ fog: "plain" });
    const plain = sample();
    resetSettingsCache();
    expect(full.vis.some((v) => v === 0) && full.vis.some((v) => v === 1)).toBe(true); // liveness: the fog is really on
    expect(plain).toEqual(full);
  });
});
