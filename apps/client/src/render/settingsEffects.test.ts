import screenFog from "./fog/screenFog.ts?raw";
import darkness from "./darkness/darknessPlan.ts?raw";
import city from "./city/CityView.ts?raw";
import fog from "./fog/FogView.ts?raw";
import { afterEach, describe, expect, it } from "vitest";
import { RAIN_LEVEL_K } from "@topdown/shared";
import { weatherDropCount } from "./city/rainLook";
import { bakeTiles, type BakeTile } from "./city/bakeTiles";
import { downtownScene } from "./city/testScene";
import { fogNoiseOn } from "./fog/FogView";
import { sfxMasterGain } from "../audio/placeholderSfx";
import { resetSettingsCache } from "../settings/settings";

/** Story 10.1 (AC 1, 2, 4; B3–B5, B8): the effect settings, as the renderer and the audio apply them. */
describe("Story 10.1 effect settings", () => {
  afterEach(() => resetSettingsCache());

  it("B3: Rain Full / Light / Off scales the rain drops and the ash flakes (× 1 / 0.5 / 0); the pool cap still holds", () => {
    const drops = (rain: keyof typeof RAIN_LEVEL_K, ash = false) => weatherDropCount(ash, 1, RAIN_LEVEL_K[rain], 16, 9, 0.4, 128, 40, false);
    expect(drops("full")).toBe(58);
    expect(drops("light")).toBe(29);
    expect(drops("off")).toBe(0);
    expect(drops("full", true)).toBe(29);
    expect(drops("light", true)).toBe(14);
    expect(drops("off", true)).toBe(0);
    expect(weatherDropCount(false, 3, 1, 40, 30, 0.4, 128, 40, false)).toBe(128);
  });

  it("B5: Light glow scales the baked glow layer (Low = alpha 0.5) and Off skips it; the light layer is untouched", () => {
    const run = (glowK: number): string[] => {
      const log: string[] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_t, k) => (...a: unknown[]) => void log.push(`${String(k)}(${a.length})`),
        set: (_t, k, v) => (log.push(`${String(k)}=${String(v)}`), true),
      });
      const c = { width: 64, height: 64, getContext: () => ctx };
      const tile: BakeTile = { canvas: c, base: c, x: 0, y: 0 };
      bakeTiles([tile], downtownScene(1), 42, "same", {} as CanvasImageSource, {} as CanvasImageSource, { base: () => {}, overlay: () => {} }, glowK);
      return log;
    };
    const full = run(1);
    expect(full.join(" ")).toMatch(/globalCompositeOperation=multiply drawImage\(5\) globalCompositeOperation=lighter globalAlpha=1 drawImage\(5\) globalAlpha=1/);
    expect(run(0.5).join(" ")).toMatch(/globalCompositeOperation=lighter globalAlpha=0\.5 drawImage\(5\) globalAlpha=1/);
    const off = run(0);
    expect(off).not.toContain("globalCompositeOperation=lighter");
    expect(off.join(" ")).toMatch(/globalCompositeOperation=multiply drawImage\(5\)/);
  });

  it("B4 / AC 2: Fog detail only switches the drifting texture; ScreenFog (what the fog hides) never reads the settings", () => {
    expect(fogNoiseOn(false, "full")).toBe(true);
    expect(fogNoiseOn(false, "plain")).toBe(false);
    expect(fogNoiseOn(true, "full")).toBe(false); // ?fx=low still forces the plain haze
    expect(screenFog).not.toMatch(/from ["'][^"']*settings|getSettings/);
    expect(darkness).not.toMatch(/from ["'][^"']*settings|getSettings/);
  });

  it("AC 4: CityView and FogView read the live setting every frame (never copied at create)", () => {
    const update = city.slice(city.indexOf("  update(world: Readonly<World>"), city.indexOf("  private updateLampFlicker"));
    expect(update).toMatch(/const fx = getSettings\(\);/);
    expect(update).toMatch(/RAIN_LEVEL_K\[fx\.rain\]/);
    expect(update).toMatch(/GLOW_LEVEL_K\[fx\.glow\]/);
    expect(update).toMatch(/GLOW_KEY\[fx\.glow\]/); // a glow change re-bakes once
    expect(fog).toMatch(/fogNoiseOn\(this\.lowFx, getSettings\(\)\.fog\)/);
  });

  it("B8: the Effects volume scales the SFX master (0.25 at 100, 0 at 0, clamped)", () => {
    expect(sfxMasterGain(100)).toBeCloseTo(0.25);
    expect(sfxMasterGain(40)).toBeCloseTo(0.1);
    expect(sfxMasterGain(0)).toBe(0);
    expect(sfxMasterGain(300)).toBeCloseTo(0.25);
  });
});
