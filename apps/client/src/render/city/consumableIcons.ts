import type * as Phaser from "phaser";
import { addGeneratedTexture } from "./canvasTexture";
import { bakeItemIcon, type BakeOptions } from "./itemIcons";

/**
 * Story 5.12: the consumable icons (the HUD's consumable button; the shop's Consumables rows). One
 * small atlas, `hud_consumable`, one frame per item (`icon_consumable_<name>_a`, category_name_variant),
 * drawn in game code through `addGeneratedTexture` (Story 4.13: repainted after a lost graphics context).
 *
 * The look is the designer's pick **CI4** (round D, 2026-11-23): realistic painted objects (the GR4
 * painter of `itemIcons.ts`, no tag), legible at 40 CSS px on the 64 px button.
 */
export const CONSUMABLE_ICON_TEXTURE = "hud_consumable";
/** 120 texture px = 40 CSS px at dpr 3. */
export const CONSUMABLE_ICON_FRAME_PX = 120;
const FRAME_GAP_PX = 4;
/** Shown on the button (CSS px). */
export const CONSUMABLE_ICON_CSS_PX = 40;
const CI4: BakeOptions = { tag: false, designPx: 40 };

/** Atlas frame per consumable id (`consumables.json` keys). */
export const CONSUMABLE_ICON_FRAMES: Readonly<Record<string, string>> = Object.freeze({
  medkit: "icon_consumable_medkit_a",
  grenades: "icon_consumable_grenade_a",
  molotovs: "icon_consumable_molotov_a",
});

const IDS = Object.keys(CONSUMABLE_ICON_FRAMES);

/** Registers the atlas once per game: one row of 3 × 124 px (372 × 120, far under 2048²). */
export function ensureConsumableIcons(scene: Phaser.Scene): void {
  if (scene.textures.exists(CONSUMABLE_ICON_TEXTURE) || typeof document === "undefined") return;
  const f = CONSUMABLE_ICON_FRAME_PX;
  const step = f + FRAME_GAP_PX;
  const canvas = document.createElement("canvas");
  canvas.width = step * IDS.length;
  canvas.height = f;
  addGeneratedTexture(
    scene,
    CONSUMABLE_ICON_TEXTURE,
    canvas,
    (g) => IDS.forEach((id, i) => bakeItemIcon(g, id, i * step, 0, f, CI4)),
    (tex) => IDS.forEach((id, i) => tex.add(CONSUMABLE_ICON_FRAMES[id] as string, 0, i * step, 0, f, f)),
  );
}

const urls = new Map<string, string>();

/** The icon of consumable `id` as a PNG data URL for the DOM shop (drawn once, cached), or null. Browser only. */
export function consumableIconUrl(id: string): string | null {
  if (!(id in CONSUMABLE_ICON_FRAMES) || typeof document === "undefined") return null;
  const cached = urls.get(id);
  if (cached) return cached;
  const px = CONSUMABLE_ICON_FRAME_PX;
  const cv = document.createElement("canvas");
  cv.width = px;
  cv.height = px;
  const g = cv.getContext("2d");
  if (!g) return null;
  bakeItemIcon(g, id, 0, 0, px, CI4);
  const url = cv.toDataURL("image/png");
  urls.set(id, url);
  return url;
}
