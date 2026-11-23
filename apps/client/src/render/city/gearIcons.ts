import type * as Phaser from "phaser";
import { addGeneratedTexture } from "./canvasTexture";
import { bakeItemIcon, type BakeOptions } from "./itemIcons";

/**
 * Story 5.11: the gear icons (HUD beside the HP text; the shop's Gear rows). One small atlas,
 * `hud_gear`, with one frame per item (`icon_gear_<name>_a`, category_name_variant), drawn in game
 * code through `addGeneratedTexture` (Story 4.13: repainted after a lost graphics context).
 *
 * The look is the designer's pick **GR6** (round D, 2026-11-23): the GR4 painted objects on the GR2
 * embossed steel tag, drawn by the shared painters in `itemIcons.ts` (Story 5.12's CI4 consumable
 * icons use the same painters).
 */

/** The atlas texture key. */
export const GEAR_ICON_TEXTURE = "hud_gear";
/**
 * One frame's side in texture pixels: 96 = 32 CSS px at dpr 3, so the icon stays crisp at 24 and 32
 * CSS px on dpr 2–3 (the HUD scales it down to `GEAR_ICON_CSS_PX` × dpr).
 */
export const GEAR_ICON_FRAME_PX = 96;
/** Empty texture pixels between frames (no filtering bleed when scaled down). */
const FRAME_GAP_PX = 4;
/** GR6 bake: on the steel tag, line widths designed for the 24 CSS px they are shown at (review L3: ≥ 1 CSS px). */
const GR6: BakeOptions = { tag: true, designPx: 24 };
/** Shown size on the HUD and in the shop (D7: 24 CSS px). */
export const GEAR_ICON_CSS_PX = 24;

/** Atlas frame per gear id (`gear.json` keys). Unknown ids have no icon. */
export const GEAR_ICON_FRAMES: Readonly<Record<string, string>> = Object.freeze({
  body_armor_1: "icon_gear_armor1_a",
  body_armor_2: "icon_gear_armor2_a",
  running_shoes: "icon_gear_shoes_a",
  revive_kit: "icon_gear_revivekit_a",
  tactical_flashlight: "icon_gear_flashlight_a",
});

const FRAME_IDS = Object.keys(GEAR_ICON_FRAMES);

/**
 * Registers the gear icon atlas once per game (textures outlive scene restarts): one row of
 * `GEAR_ICON_FRAME_PX` frames (5 × 100 = 500 × 96 px, far under the 2048² cap).
 */
export function ensureGearIcons(scene: Phaser.Scene): void {
  if (scene.textures.exists(GEAR_ICON_TEXTURE) || typeof document === "undefined") return;
  const f = GEAR_ICON_FRAME_PX;
  const step = f + FRAME_GAP_PX;
  const canvas = document.createElement("canvas");
  canvas.width = step * FRAME_IDS.length;
  canvas.height = f;
  addGeneratedTexture(
    scene,
    GEAR_ICON_TEXTURE,
    canvas,
    (g) => {
      FRAME_IDS.forEach((id, i) => bakeItemIcon(g, id, i * step, 0, f, GR6));
    },
    (tex) => {
      FRAME_IDS.forEach((id, i) => tex.add(GEAR_ICON_FRAMES[id] as string, 0, i * step, 0, f, f));
    },
  );
}

const urls = new Map<string, string>();

/** The icon of gear `id` as a PNG data URL for the DOM shop (drawn once, cached), or null. Browser only. */
export function gearIconUrl(id: string): string | null {
  if (!(id in GEAR_ICON_FRAMES) || typeof document === "undefined") return null;
  const cached = urls.get(id);
  if (cached) return cached;
  const px = GEAR_ICON_FRAME_PX;
  const cv = document.createElement("canvas");
  cv.width = px;
  cv.height = px;
  const g = cv.getContext("2d");
  if (!g) return null;
  bakeItemIcon(g, id, 0, 0, px, GR6);
  const url = cv.toDataURL("image/png");
  urls.set(id, url);
  return url;
}

/**
 * The HUD's icon frames for an owned-gear mask, in the fixed `gear.json` bit order (pure; `ids` =
 * `gearIds(balance)`). Writes into `out` (reused: no allocation per call) and returns it.
 */
export function gearIconFramesFor(ids: readonly string[], mask: number, out: string[]): string[] {
  out.length = 0;
  for (let i = 0; i < ids.length; i++) {
    if ((mask & (1 << i)) === 0) continue;
    const frame = GEAR_ICON_FRAMES[ids[i] as string];
    if (frame) out.push(frame);
  }
  return out;
}
