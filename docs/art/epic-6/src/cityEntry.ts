/**
 * Epic 6 looks page: the game's own Downtown art (apps/client/src/render/city/*), bundled for the
 * static proposal page by build.mjs. `render` bakes a rectangle of the real map exactly like
 * CityView/bakeTiles (base + overlay, then the lightmap MULTIPLIED and the glow ADDED), with an
 * optional `extra` painter (map px) between the overlay and the light so proposal art (rubble,
 * broken facades) is lit like the rest of the street. Read-only use of game code.
 */
import { DOWNTOWN_MAP, shopfrontsOf } from "@topdown/shared";
import { downtownScene } from "../../../../apps/client/src/render/city/testScene";
import { drawBase, drawOverlay, drawLightmap, drawGlow, type CityScene } from "../../../../apps/client/src/render/city/drawCity";
import { ensureAtlases } from "../../../../apps/client/src/render/city/spriteAtlas";
import { DOWNTOWN_DRESSING, MAP_PX_PER_M, type Dressing } from "../../../../apps/client/src/render/city/dressing";
import { drawSurvivor, drawZombie, drawCharredCar, drawCar } from "../../../../apps/client/src/render/city/spriteArt";
import { drawFloodlightFL1 } from "../../../../apps/client/src/render/city/propArt";
import { drawBrute } from "../../../../apps/client/src/render/city/bruteArt";

type G = CanvasRenderingContext2D;
const fakeScene = { textures: { exists: () => true } } as never;

export interface RenderOpts {
  stage: number;
  /** device px per metre */
  ppm: number;
  x0: number; y0: number; w: number; h: number;
  variants?: number;
  /** "on" (default), "ruins" (shop glow 30 %), "off" (power out: no lamps, shops, neon, canopy, headlights) */
  power?: "on" | "ruins" | "off";
  /** painter in map px (32 / m), before the light */
  extra?: (g: G, s: number) => void;
  /** skip the light pass (for a lightless reference) */
  noLight?: boolean;
}

function dressingFor(power: RenderOpts["power"]): Dressing {
  const d = DOWNTOWN_DRESSING;
  if (!power || power === "on") return d;
  const shop: Record<string, readonly [string, number]> = {};
  for (const f of shopfrontsOf(DOWNTOWN_MAP)) {
    const [col, a] = d.shopLight[f.name] ?? ["255,190,120", 0.5];
    shop[f.name] = [col, power === "off" ? 0 : a * 0.5];
  }
  if (power === "ruins") return { ...d, shopLight: shop, spill: d.spill.map((s) => [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7] * 0.5] as const) } as Dressing;
  return { ...d, shopLight: shop, spill: [], neon: [], lamps: [], flickerLamp: -1, canopy: "", runningCar: "" } as Dressing;
}

function render(o: RenderOpts): HTMLCanvasElement {
  const atlas = ensureAtlases(fakeScene);
  const base = downtownScene(Math.min(o.stage, 3), o.variants ?? 359);
  const cs: CityScene = { ...base, stage: o.stage, atlas, dressing: dressingFor(o.power) };
  const cv = document.createElement("canvas");
  cv.width = Math.round(o.w * o.ppm);
  cv.height = Math.round(o.h * o.ppm);
  const g = cv.getContext("2d")!;
  const s = o.ppm / MAP_PX_PER_M;
  const P = MAP_PX_PER_M;
  const bd = { x0: o.x0 * P - 96, y0: o.y0 * P - 96, x1: (o.x0 + o.w) * P + 96, y1: (o.y0 + o.h) * P + 96 };
  g.setTransform(s, 0, 0, s, -o.x0 * o.ppm, -o.y0 * o.ppm);
  drawBase(g, s, cs, bd);
  drawOverlay(g, s, cs, bd);
  if (o.extra) { g.save(); o.extra(g, s); g.restore(); }
  if (!o.noLight) {
    const L = 8, W = DOWNTOWN_MAP.widthM, H = DOWNTOWN_MAP.heightM;
    const light = document.createElement("canvas"), glow = document.createElement("canvas");
    for (const c of [light, glow]) { c.width = W * L; c.height = H * L; }
    const lg = light.getContext("2d")!, gg = glow.getContext("2d")!;
    lg.setTransform(L / P, 0, 0, L / P, 0, 0);
    gg.setTransform(L / P, 0, 0, L / P, 0, 0);
    drawLightmap(lg, cs);
    drawGlow(gg, cs);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    const sx = o.x0 * L, sy = o.y0 * L, sw = o.w * L, sh = o.h * L;
    g.globalCompositeOperation = "multiply";
    g.drawImage(light, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    g.globalCompositeOperation = "lighter";
    g.drawImage(glow, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    g.globalCompositeOperation = "source-over";
  }
  return cv;
}

(window as unknown as { CITY: unknown }).CITY = {
  render,
  map: DOWNTOWN_MAP,
  dressing: DOWNTOWN_DRESSING,
  PX: MAP_PX_PER_M,
  scene: (stage: number, v = 359) => downtownScene(Math.min(stage, 3), v),
  drawSurvivor, drawZombie, drawCharredCar, drawCar, drawFloodlightFL1, drawBrute,
};
