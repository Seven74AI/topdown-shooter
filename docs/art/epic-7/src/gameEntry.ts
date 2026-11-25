/**
 * Epic 7 looks page: the game's own art, bundled for the static proposal page by build.mjs (read-only use of game
 * code). Survivor = the real `drawSurvivor` + `resolveLook` (Story 7.8 parts); shop/hub icons = the real
 * weapon / gear / consumable / build-bar icon painters; the street = the real Downtown bake (as docs/art/epic-6).
 */
import { DOWNTOWN_MAP, shopfrontsOf, COSMETICS, DEFAULT_LOOK } from "@topdown/shared";
import { downtownScene } from "../../../../apps/client/src/render/city/testScene";
import { drawBase, drawOverlay, drawLightmap, drawGlow, type CityScene } from "../../../../apps/client/src/render/city/drawCity";
import { ensureAtlases } from "../../../../apps/client/src/render/city/spriteAtlas";
import { DOWNTOWN_DRESSING, MAP_PX_PER_M, type Dressing } from "../../../../apps/client/src/render/city/dressing";
import { drawSurvivor, drawZombie } from "../../../../apps/client/src/render/city/spriteArt";
import { resolveLook, nightMute } from "../../../../apps/client/src/render/city/survivorLook";
import { weaponIconUrl } from "../../../../apps/client/src/render/city/weaponArt";
import { gearIconUrl } from "../../../../apps/client/src/render/city/gearIcons";
import { consumableIconUrl } from "../../../../apps/client/src/render/city/consumableIcons";
import { BUILD_ICONS, buildIconFrame, paintBuildIcon, BUILD_ICON_FRAME_W, BUILD_ICON_FRAME_H, BUILD_ICON_BAKE_SCALE } from "../../../../apps/client/src/render/city/buildIcons";
import { SLOT_COLOR_CSS } from "../../../../apps/client/src/render/playerColors";

type G = CanvasRenderingContext2D;
const fakeScene = { textures: { exists: () => true } } as never;

interface RenderOpts { stage: number; ppm: number; x0: number; y0: number; w: number; h: number; variants?: number; power?: "on" | "ruins" | "off"; noLight?: boolean }

function dressingFor(power: RenderOpts["power"]): Dressing {
  const d = DOWNTOWN_DRESSING;
  if (!power || power === "on") return d;
  const shop: Record<string, readonly [string, number]> = {};
  for (const f of shopfrontsOf(DOWNTOWN_MAP)) {
    const [col, a] = d.shopLight[f.name] ?? ["255,190,120", 0.5];
    shop[f.name] = [col, power === "off" ? 0 : a * 0.5];
  }
  if (power === "ruins") return { ...d, shopLight: shop } as Dressing;
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
    const sx = o.x0 * L, sy = o.y0 * L, sw = o.w * L, sh = o.h * L;
    g.globalCompositeOperation = "multiply";
    g.drawImage(light, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    g.globalCompositeOperation = "lighter";
    g.drawImage(glow, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    g.globalCompositeOperation = "source-over";
  }
  return cv;
}

const buildUrls = new Map<string, string>();
/** The build-bar icon of a building type as a data URL (the real painter), or null. */
function buildIconUrl(type: string): string | null {
  const frame = buildIconFrame(type);
  const icon = frame ? BUILD_ICONS.find((b) => b.frame === frame) : undefined;
  if (!icon) return null;
  const hit = buildUrls.get(type);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = BUILD_ICON_FRAME_W * BUILD_ICON_BAKE_SCALE;
  cv.height = BUILD_ICON_FRAME_H * BUILD_ICON_BAKE_SCALE;
  paintBuildIcon(cv.getContext("2d") as never, icon.draw, { frame: icon.frame, x: 0, y: 0, w: cv.width, h: cv.height });
  const url = cv.toDataURL("image/png");
  buildUrls.set(type, url);
  return url;
}

(window as unknown as { G7: unknown }).G7 = {
  render, map: DOWNTOWN_MAP, PX: MAP_PX_PER_M,
  drawSurvivor: (c: G, r: number, look: unknown, stage = 1) => drawSurvivor(c, r, undefined, undefined, resolveLook({ ...DEFAULT_LOOK, ...(look as object) } as never, stage)),
  drawZombie, nightMute, COSMETICS, DEFAULT_LOOK, SLOT: SLOT_COLOR_CSS,
  weaponIconUrl, gearIconUrl, consumableIconUrl, buildIconUrl,
};
