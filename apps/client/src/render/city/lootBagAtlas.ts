import type * as Phaser from "phaser";
import { addGeneratedTexture } from "./canvasTexture";
import { LOOT_FRAME_M, bakeLootObjects, lootObjectPose } from "./lootObjects";

/**
 * Story 7.12 (AC 6, 7-UI-6): the loot bag's atlas, drawn in game code through `addGeneratedTexture`
 * (the paint redraws everything after an Android canvas wipe or a lost context): one 1024 × 256 canvas.
 *
 * - `fx_lootbag_a` … `fx_lootbag_e`: the five looks (LB4 hiker's backpack, LB5 go-bag, LB6 field case,
 *   LB7 trauma bag, LB8 evidence bag), each turned to its angle on the street, with the shared
 *   pick-up signal baked in: a soft dark contact shadow and a WHITE RIM LIGHT round the silhouette
 *   (white = pick-ups, Epic 6 brief 24).
 * - `fx_lootbag_ring`: the soft white ground ring (pulsed by the view).
 * - `fx_lootbag_glint`: the one glint (a four-point white star, flashed by the view).
 * - `fx_lootbag_badge`: the off-screen badge (OA2: a charcoal disc with a white bag) — also the
 *   "Bag found!" line's icon (BF2).
 */
export const LOOT_ATLAS = "atlas_lootbag";
export const LOOT_PX_PER_M = 128;
export const LOOT_FRAMES = ["fx_lootbag_a", "fx_lootbag_b", "fx_lootbag_c", "fx_lootbag_d", "fx_lootbag_e"] as const;
export const LOOT_RING_FRAME = "fx_lootbag_ring";
export const LOOT_GLINT_FRAME = "fx_lootbag_glint";
export const LOOT_BADGE_FRAME = "fx_lootbag_badge";
/** One look's cell (px): the 0.92 m object turned by its angle, plus its rim and shadow. */
export const LOOT_CELL_PX = 168;
/** The cell's size in metres (the view's display size for a look). */
export const LOOT_CELL_M = LOOT_CELL_PX / LOOT_PX_PER_M;
export const LOOT_RING_PX = 168;
export const LOOT_GLINT_PX = 48;
export const LOOT_BADGE_PX = 64;
export const LOOT_ATLAS_W = 1024;
export const LOOT_ATLAS_H = 256;

export interface LootFrame {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The atlas layout (row 1: five looks + the ring; row 2: glint, badge). Pure. */
export function lootAtlasFrames(): LootFrame[] {
  const out: LootFrame[] = LOOT_FRAMES.map((name, i) => ({ name, x: i * LOOT_CELL_PX, y: 0, w: LOOT_CELL_PX, h: LOOT_CELL_PX }));
  out.push({ name: LOOT_RING_FRAME, x: 5 * LOOT_CELL_PX, y: 0, w: LOOT_RING_PX, h: LOOT_RING_PX });
  out.push({ name: LOOT_GLINT_FRAME, x: 0, y: LOOT_CELL_PX, w: LOOT_GLINT_PX, h: LOOT_GLINT_PX });
  out.push({ name: LOOT_BADGE_FRAME, x: LOOT_GLINT_PX, y: LOOT_CELL_PX, w: LOOT_BADGE_PX, h: LOOT_BADGE_PX });
  return out;
}

/** A look's glint spot in its cell, in metres from the cell centre (after the turn). */
export function lootGlintOffsetM(variant: number): { x: number; y: number } {
  const { rot, glint } = lootObjectPose(variant);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: glint[0] * c - glint[1] * s, y: glint[0] * s + glint[1] * c };
}

type Make = (w: number, h: number) => HTMLCanvasElement;
const domCanvas: Make = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** `src` as one flat colour (alpha kept), grown by `growPx` (8 stamped copies) and blurred by `blurPx`. */
function silhouette(src: HTMLCanvasElement, colour: string, blurPx: number, make: Make, growPx = 0): HTMLCanvasElement {
  const flat = make(src.width, src.height);
  const fg = flat.getContext("2d") as CanvasRenderingContext2D;
  fg.drawImage(src, 0, 0);
  fg.globalCompositeOperation = "source-in";
  fg.fillStyle = colour;
  fg.fillRect(0, 0, src.width, src.height);
  const pad = Math.ceil(blurPx * 3 + growPx);
  const out = make(src.width + pad * 2, src.height + pad * 2);
  const og = out.getContext("2d") as CanvasRenderingContext2D;
  if (blurPx > 0) og.filter = `blur(${blurPx}px)`;
  if (growPx > 0) for (let k = 0; k < 8; k++) og.drawImage(flat, pad + Math.cos((k * Math.PI) / 4) * growPx, pad + Math.sin((k * Math.PI) / 4) * growPx);
  else og.drawImage(flat, pad, pad);
  return out;
}

/** One look into its cell: contact shadow, white rim light, the object (turned). */
function drawLook(g: CanvasRenderingContext2D, obj: HTMLCanvasElement, rot: number, f: LootFrame, make: Make, rimAlpha: number): void {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const rim = silhouette(obj, "#ffffff", 4, make, 3);
  const rimTight = silhouette(obj, "#ffffff", 0.8, make, 2);
  const shadow = silhouette(obj, "#000000", 6, make);
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.globalAlpha = 0.55;
  g.drawImage(shadow, -shadow.width / 2 + 4, -shadow.height / 2 + 6);
  g.globalAlpha = rimAlpha * 0.6;
  g.drawImage(rim, -rim.width / 2, -rim.height / 2);
  g.globalAlpha = rimAlpha;
  g.drawImage(rimTight, -rimTight.width / 2, -rimTight.height / 2);
  g.globalAlpha = 1;
  g.drawImage(obj, -obj.width / 2, -obj.height / 2);
  g.restore();
}

function drawRing(g: CanvasRenderingContext2D, f: LootFrame): void {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const r = f.w / 2 - 6;
  const grad = g.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.10)");
  grad.addColorStop(0.82, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.9, "rgba(255,255,255,0.95)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
}

function drawGlint(g: CanvasRenderingContext2D, f: LootFrame): void {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const R = f.w / 2 - 1;
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
  halo.addColorStop(0, "rgba(255,255,255,0.95)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = halo;
  g.fillRect(f.x, f.y, f.w, f.h);
  g.fillStyle = "#ffffff";
  for (const [l, w] of [
    [R, R * 0.09],
    [R * 0.55, R * 0.06],
  ] as const) {
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + (l === R ? 0 : Math.PI / 4);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      g.lineTo(cx + Math.cos(a + Math.PI / 2) * w, cy + Math.sin(a + Math.PI / 2) * w);
      g.lineTo(cx - Math.cos(a + Math.PI / 2) * w, cy - Math.sin(a + Math.PI / 2) * w);
      g.closePath();
      g.fill();
    }
  }
}

/** OA2 / BF2: a charcoal disc with a white rim and a white bag (handle, body, flap). */
function drawBadge(g: CanvasRenderingContext2D, f: LootFrame): void {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const r = f.w / 2 - 3;
  g.fillStyle = "rgba(24,26,29,0.92)";
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#ffffff";
  g.lineWidth = 2.5;
  g.stroke();
  const s = r / 24;
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#ffffff";
  g.lineWidth = 3 * s;
  g.beginPath();
  g.moveTo(cx - 6 * s, cy - 6 * s);
  g.quadraticCurveTo(cx, cy - 16 * s, cx + 6 * s, cy - 6 * s);
  g.stroke();
  g.beginPath();
  g.roundRect(cx - 13 * s, cy - 7 * s, 26 * s, 20 * s, 5 * s);
  g.fill();
  g.fillStyle = "rgba(24,26,29,0.92)";
  g.fillRect(cx - 13 * s, cy - 1 * s, 26 * s, 2.2 * s);
  g.fillRect(cx - 2 * s, cy - 3 * s, 4 * s, 6 * s);
}

/** Draws the whole atlas into `g` (canvas `LOOT_ATLAS_W` × `LOOT_ATLAS_H`). Pure canvas work. */
export function paintLootAtlas(g: CanvasRenderingContext2D, rimAlpha: number, make: Make = domCanvas): void {
  const frames = lootAtlasFrames();
  const objs = bakeLootObjects(LOOT_PX_PER_M, make);
  for (const f of frames) {
    g.save();
    g.beginPath();
    g.rect(f.x, f.y, f.w, f.h);
    g.clip();
    const v = (LOOT_FRAMES as readonly string[]).indexOf(f.name);
    if (v >= 0) drawLook(g, objs[v] as HTMLCanvasElement, lootObjectPose(v).rot, f, make, rimAlpha);
    else if (f.name === LOOT_RING_FRAME) drawRing(g, f);
    else if (f.name === LOOT_GLINT_FRAME) drawGlint(g, f);
    else if (f.name === LOOT_BADGE_FRAME) drawBadge(g, f);
    g.restore();
  }
}

/** Adds the atlas once per game (texture key `LOOT_ATLAS`); the registry redraws it (Story 4.13). */
export function ensureLootBagTextures(scene: Phaser.Scene, rimAlpha: number, makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): void {
  if (scene.textures.exists(LOOT_ATLAS)) return;
  const canvas = makeCanvas();
  canvas.width = LOOT_ATLAS_W;
  canvas.height = LOOT_ATLAS_H;
  addGeneratedTexture(
    scene,
    LOOT_ATLAS,
    canvas,
    (g) => paintLootAtlas(g, rimAlpha),
    (tex) => {
      for (const f of lootAtlasFrames()) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
}

/** The object's size inside a cell (m): the 0.92 m frame. */
export const LOOT_OBJECT_M = LOOT_FRAME_M;
