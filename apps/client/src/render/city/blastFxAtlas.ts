import type * as Phaser from "phaser";
import { frameName, packAtlas, variantLetter, type FrameSpec, type PlacedFrame } from "./atlasLayout";
import { addGeneratedTexture } from "./canvasTexture";
import { EMBER_STOPS, FLAME_SPRITE_PX, FLAME_VARIANTS, SMOKE_SPRITE_PX, SMOKE_VARIANTS, fbm, flameMasks, smokeMask, type RadialStops } from "./fireSprites";

/**
 * Story 5.5: the explosion and grenade sprites as one canvas atlas (`atlas_blastfx`), made ONCE per
 * page and registered through `addGeneratedTexture` (Story 4.13: redrawn after a lost context).
 * Ported from `docs/art/epic-5/round-c/looks.html` (EX1 fireball, EX2 shockwave + debris, the 40 mm
 * round with its shadow): flame and smoke masks are the 4.12 fire's (white, tinted per particle);
 * the flash, ground glow and spark carry their own colours; the scorch is a ragged dark disc drawn
 * 2R wide (its edge is the blast edge). Frames follow the atlas rules (`category_name_variant`, ≤ 2048²).
 */
export const ATLAS_BLASTFX = "atlas_blastfx";
export const BLAST_FLAME_FRAMES: readonly string[] = Array.from({ length: FLAME_VARIANTS }, (_, i) => frameName("fx", "blastflame", variantLetter(i)));
export const BLAST_SMOKE_FRAMES: readonly string[] = Array.from({ length: SMOKE_VARIANTS }, (_, i) => frameName("fx", "blastsmoke", variantLetter(i)));
export const FX_BLAST_EMBER = frameName("fx", "blastember", "a");
export const FX_BLAST_FLASH = frameName("fx", "blastflash", "a");
export const FX_BLAST_GLOW = frameName("fx", "blastglow", "a");
export const FX_SCORCH = frameName("fx", "scorch", "a");
export const FX_DEBRIS = frameName("fx", "debris", "a");
export const FX_GRENADE_ROUND = frameName("fx", "grenaderound", "a");
export const FX_GRENADE_SHADOW = frameName("fx", "grenadeshadow", "a");
const EMBER_PX = 32;
const FLASH_PX = 128;
const GLOW_PX = 128;
export const SCORCH_PX = 192;
const DEBRIS_PX = 12;
/** The round: 0.124 × 0.052 m drawn at 256 px/m (its display size is set in metres by the view). */
export const ROUND_W_M = 0.124;
export const ROUND_H_M = 0.052;
const ROUND_PX_PER_M = 256;

/** looks.html `flashSpr`: hot white centre, orange falloff. */
export const FLASH_STOPS: RadialStops = [
  [0, 255, 255, 245, 1],
  [0.18, 255, 240, 190, 0.95],
  [0.45, 255, 170, 80, 0.5],
  [0.8, 255, 110, 40, 0.14],
  [1, 255, 90, 30, 0],
];
/** looks.html `groundGlow`: drawn 2R wide it ends on the blast edge. */
export const GLOW_STOPS: RadialStops = [
  [0, 255, 160, 70, 1],
  [0.5, 255, 118, 40, 0.62],
  [0.9, 235, 80, 25, 0.36],
  [0.985, 220, 70, 20, 0.18],
  [1, 220, 70, 20, 0],
];

/**
 * looks.html scorch: a dark noisy disc, soft inside, a ragged edge ending at the sprite edge,
 * radial streaks. RGBA pixels (row-major), pure (unit-tested: nothing past the edge).
 */
export function scorchPixels(size = SCORCH_PX): Uint8ClampedArray {
  const d = new Uint8ClampedArray(size * size * 4);
  const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const r = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (r >= 1) continue;
      const an = Math.atan2(dy, dx);
      const n = fbm(dx * 5, dy * 5, 7);
      const streak = 0.5 + 0.5 * Math.sin(an * 23 + fbm(dx * 2, dy * 2, 3) * 6);
      const edge = 0.86 + 0.12 * fbm(Math.cos(an) * 3, Math.sin(an) * 3, 9);
      let a = r < edge ? 0.55 + 0.35 * (1 - r) + 0.2 * (n - 0.5) : clamp((1 - r) / (1 - edge), 0, 1) * 0.55;
      a *= 0.8 + 0.25 * streak * clamp(r * 1.4, 0, 1);
      d[i] = (12 + n * 14) | 0;
      d[i + 1] = (10 + n * 11) | 0;
      d[i + 2] = (9 + n * 9) | 0;
      d[i + 3] = (clamp(a, 0, 1) * 255) | 0;
    }
  }
  return d;
}

/** The atlas's frames (pure: a test checks names and the ≤ 2048 rule). */
export function blastFxSpecs(): FrameSpec[] {
  return [
    ...BLAST_FLAME_FRAMES.map((name) => ({ name, w: FLAME_SPRITE_PX, h: FLAME_SPRITE_PX })),
    ...BLAST_SMOKE_FRAMES.map((name) => ({ name, w: SMOKE_SPRITE_PX, h: SMOKE_SPRITE_PX })),
    { name: FX_BLAST_EMBER, w: EMBER_PX, h: EMBER_PX },
    { name: FX_BLAST_FLASH, w: FLASH_PX, h: FLASH_PX },
    { name: FX_BLAST_GLOW, w: GLOW_PX, h: GLOW_PX },
    { name: FX_SCORCH, w: SCORCH_PX, h: SCORCH_PX },
    { name: FX_DEBRIS, w: DEBRIS_PX, h: DEBRIS_PX },
    { name: FX_GRENADE_ROUND, w: Math.ceil(ROUND_W_M * ROUND_PX_PER_M), h: Math.ceil(ROUND_H_M * ROUND_PX_PER_M) },
    { name: FX_GRENADE_SHADOW, w: 32, h: 16 },
  ];
}

/** Registers the atlas (idempotent). */
export function ensureBlastFxAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_BLASTFX)) return;
  const layout = packAtlas(blastFxSpecs());
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  addGeneratedTexture(
    scene,
    ATLAS_BLASTFX,
    canvas,
    (g) => {
      for (const f of layout.frames) drawFrame(g, f);
    },
    (tex) => {
      for (const f of layout.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
}

function putMask(g: CanvasRenderingContext2D, f: PlacedFrame, mask: Float32Array): void {
  const im = g.createImageData(f.w, f.h);
  const d = im.data;
  for (let i = 0; i < f.w * f.h; i++) {
    d[i * 4] = 255;
    d[i * 4 + 1] = 255;
    d[i * 4 + 2] = 255;
    d[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, mask[i] as number)) * 255);
  }
  g.putImageData(im, f.x, f.y);
}

function radial(g: CanvasRenderingContext2D, f: PlacedFrame, stops: RadialStops): void {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, f.w / 2);
  for (const [o, r, gg, b, a] of stops) gr.addColorStop(o, `rgba(${r},${gg},${b},${a})`);
  g.fillStyle = gr;
  g.fillRect(f.x, f.y, f.w, f.h);
}

/** looks.html `drawRound`: the 40 mm round from above, nose along +x (brass case, olive warhead, yellow band). */
function drawRound(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  g.save();
  g.translate(f.x + f.w / 2, f.y + f.h / 2);
  g.scale(ROUND_PX_PER_M, ROUND_PX_PER_M);
  g.fillStyle = "#050505";
  g.beginPath();
  g.ellipse(0, 0, 0.062, 0.026, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#b08a3c";
  g.fillRect(-0.055, -0.02, 0.05, 0.04);
  g.fillStyle = "#e0c070";
  g.fillRect(-0.05, -0.016, 0.04, 0.008);
  g.fillStyle = "#4d5a36";
  g.beginPath();
  g.moveTo(-0.006, -0.02);
  g.lineTo(0.025, -0.019);
  g.quadraticCurveTo(0.058, -0.01, 0.058, 0);
  g.quadraticCurveTo(0.058, 0.01, 0.025, 0.019);
  g.lineTo(-0.006, 0.02);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(220,230,180,0.5)";
  g.fillRect(0.0, -0.014, 0.03, 0.006);
  g.fillStyle = "#c9a740";
  g.fillRect(-0.008, -0.02, 0.006, 0.04);
  g.restore();
}

function drawFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const fi = BLAST_FLAME_FRAMES.indexOf(f.name);
  if (fi >= 0) return putMask(g, f, flameMasks()[fi] as Float32Array);
  const si = BLAST_SMOKE_FRAMES.indexOf(f.name);
  if (si >= 0) return putMask(g, f, smokeMask(si));
  if (f.name === FX_BLAST_EMBER) return radial(g, f, EMBER_STOPS);
  if (f.name === FX_BLAST_FLASH) return radial(g, f, FLASH_STOPS);
  if (f.name === FX_BLAST_GLOW) return radial(g, f, GLOW_STOPS);
  if (f.name === FX_SCORCH) {
    const im = g.createImageData(f.w, f.h);
    im.data.set(scorchPixels(f.w));
    g.putImageData(im, f.x, f.y);
    return;
  }
  if (f.name === FX_DEBRIS) {
    // an asphalt chunk: white (tinted per particle), a lit edge
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(f.x + 1, f.y + 3);
    g.lineTo(f.x + f.w - 2, f.y + 1);
    g.lineTo(f.x + f.w - 1, f.y + f.h - 3);
    g.lineTo(f.x + 3, f.y + f.h - 1);
    g.closePath();
    g.fill();
    return;
  }
  if (f.name === FX_GRENADE_ROUND) return drawRound(g, f);
  if (f.name === FX_GRENADE_SHADOW) {
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.beginPath();
    g.ellipse(f.x + f.w / 2, f.y + f.h / 2, f.w / 2 - 1, f.h / 2 - 1, 0, 0, Math.PI * 2);
    g.fill();
  }
}
