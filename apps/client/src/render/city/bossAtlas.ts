import type * as Phaser from "phaser";
import { addGeneratedTexture } from "./canvasTexture";
import { packAtlas, type FrameSpec, type PlacedFrame } from "./atlasLayout";
import { BEHEMOTH_LOOK_IDS, BH_FRAME_HALF_M, drawBehemoth, type BehemothPose } from "./behemothArt";
import { drawGroundDamage } from "./groundDamageArt";

/**
 * Story 6.5 (T0, brief 12 / 20): the Behemoth's atlas (`boss_<look>_<pose>_<variant>`: 4 looks × 13
 * frames ≤ 2048²) and its FX textures (the baked glowing slam telegraph `boss_tele_disc`, the slam's ground
 * damage decal). Every one
 * is drawn in code through `addGeneratedTexture` with its redraw callback (Android Chrome wipes
 * canvases in the background; `noUnregisteredTextures.test.ts`).
 */
export const BOSS_ATLAS = "boss_atlas";
export const BOSS_FX = "boss_fx";
/** The slam ring's baked glow (asset fixes: S1 + countdown ticks), drawn additively; a hole for the body. */
export const BOSS_TELE = "boss_tele_disc";
export const BOSS_TELE_PX = 512;

/** Frame size (px) of one boss pose: 252 px over 7 m = 36 px per metre. Frames pack 8 × 8 in 2048². */
export const BOSS_FRAME_PX = 252;
export const BOSS_PX_PER_M = BOSS_FRAME_PX / (2 * BH_FRAME_HALF_M);

/** The frames of one look, in order: [pose, progress k, walk phase, frame variant]. */
const POSE_FRAMES: readonly (readonly [BehemothPose | "outline", number, number, string, boolean])[] = [
  ["walk", 0, 0, "walk_a", false],
  ["walk", 0, 0.5, "walk_b", false],
  ["slam", 0.15, 0, "slam_a", false],
  ["slam", 0.5, 0, "slam_b", false],
  ["slam", 1, 0, "slam_c", false],
  ["slamHit", 0, 0, "slamhit_a", false],
  ["charge", 1, 0, "charge_a", false],
  ["rush", 1, 0, "rush_a", false],
  ["throw", 1, 0, "throw_a", false],
  ["stun", 0, 0, "stun_a", false],
  ["roar", 0, 0, "roar_a", false],
  ["outline", 0, 0, "outline_a", false], // the overlay above the darkness: normal eyes
  ["outline", 0, 0, "outline_b", true], // enraged (red eyes, 6.7 sets the flag)
];

const lookKey = (look: number): string => (BEHEMOTH_LOOK_IDS[look] ?? "BH1").toLowerCase();

/** Frame names per look (built once: the view never builds strings per frame). */
export const BOSS_FRAMES: readonly (readonly string[])[] = BEHEMOTH_LOOK_IDS.map((_, l) => POSE_FRAMES.map((f) => `boss_${lookKey(l)}_${f[3]}`));
/** Index of each pose frame in `BOSS_FRAMES[look]`. */
export const BOSS_FRAME = { walkA: 0, walkB: 1, slamA: 2, slamB: 3, slamC: 4, slamHit: 5, charge: 6, rush: 7, throw: 8, stun: 9, roar: 10, outline: 11, outlineEnraged: 12 } as const;

export function bossSpecs(): FrameSpec[] {
  return BOSS_FRAMES.flat().map((name) => ({ name, w: BOSS_FRAME_PX, h: BOSS_FRAME_PX }));
}

/** FX frames (one texture). */
/** FX frames (one texture). Asset fixes round 5: the skull, edge disc and icons became the P1 warning display (`hudWarnArt.ts`). */
export const BOSS_FX_FRAMES = { crack: "boss_decal_crack_a" } as const;
const FX_PX: Record<string, number> = { boss_decal_crack_a: 256 };
/** The crack decal's px per metre (it covers the 4.5 m ring: 256 px = 9 m). */
export const BOSS_CRACK_PX_PER_M = 256 / 9;

export function bossFxSpecs(): FrameSpec[] {
  return Object.values(BOSS_FX_FRAMES).map((name) => ({ name, w: FX_PX[name] as number, h: FX_PX[name] as number }));
}

function drawBossFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  for (let l = 0; l < BOSS_FRAMES.length; l++) {
    const i = (BOSS_FRAMES[l] as readonly string[]).indexOf(f.name);
    if (i < 0) continue;
    const [pose, k, ph, , enraged] = POSE_FRAMES[i] as (typeof POSE_FRAMES)[number];
    g.translate(f.x + f.w / 2, f.y + f.h / 2);
    drawBehemoth(g, BOSS_PX_PER_M, l, pose, k, enraged, ph);
    return;
  }
}

function drawFxFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  g.translate(cx, cy);
  switch (f.name) {
    case BOSS_FX_FRAMES.crack:
      // Asset fixes (designer): the realistic ground damage, R1 + R2 + R3 combined (`groundDamageArt.ts`)
      drawGroundDamage(g, -f.w / 2, -f.h / 2, f.w);
      break;
  }
}

/** Countdown ticks around the slam ring (asset fixes, S1c): the view lights them one by one over the windup. */
export const TELE_TICKS = 72;
/** Every `TELE_TICK_MAJOR`th tick is long. */
export const TELE_TICK_MAJOR = 6;
/** Ticks start this far inside the rim and are this long (texture px; the view scales them to metres). */
export const TELE_TICK_IN_PX = 12;
export const TELE_TICK_LONG_PX = 16;
export const TELE_TICK_SHORT_PX = 7;

/**
 * The slam telegraph (asset fixes, designer 2026-11-24: "the glow version with some sparks and the
 * countdown" = S1 + S1a + S1c of `docs/art/asset-fixes-1`): a red glow gathering toward a white-hot rim,
 * an inward bloom, dim countdown ticks round the dial, a soft dashed edge at the body and a transparent
 * hole for the body. Drawn with additive blending (it glows over the darkness); the view lights the ticks
 * and adds the sparks.
 */
function drawTeleDisc(g: CanvasRenderingContext2D, holeFrac: number): void {
  const n = BOSS_TELE_PX;
  const R = n / 2 - 4;
  const hole = R * holeFrac;
  g.clearRect(0, 0, n, n);
  g.save();
  g.translate(n / 2, n / 2);
  const gr = g.createRadialGradient(0, 0, hole, 0, 0, R);
  gr.addColorStop(0, "rgba(255,40,30,0.02)");
  gr.addColorStop(0.6, "rgba(255,50,30,0.10)");
  gr.addColorStop(0.92, "rgba(255,70,40,0.32)");
  gr.addColorStop(1, "rgba(255,120,80,0.55)");
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.arc(0, 0, hole, 0, Math.PI * 2, true);
  g.fill();
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = `rgba(255,60,40,${0.1 - i * 0.014})`;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, R - 6 - i * 6, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = "rgba(255,90,60,0.9)";
  g.lineWidth = 7;
  g.beginPath();
  g.arc(0, 0, R - 4, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "rgba(255,236,220,1)";
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(0, 0, R - 4, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "rgba(255,220,200,0.55)";
  g.lineWidth = 2;
  for (let i = 0; i < TELE_TICKS; i++) {
    const a = -Math.PI / 2 + (i / TELE_TICKS) * Math.PI * 2;
    const l = i % TELE_TICK_MAJOR === 0 ? TELE_TICK_LONG_PX : TELE_TICK_SHORT_PX;
    g.beginPath();
    g.moveTo(Math.cos(a) * (R - TELE_TICK_IN_PX), Math.sin(a) * (R - TELE_TICK_IN_PX));
    g.lineTo(Math.cos(a) * (R - TELE_TICK_IN_PX - l), Math.sin(a) * (R - TELE_TICK_IN_PX - l));
    g.stroke();
  }
  if (holeFrac > 0) {
    g.strokeStyle = "rgba(255,80,60,0.35)";
    g.lineWidth = 2;
    g.setLineDash([10, 10]);
    g.beginPath();
    g.arc(0, 0, hole + 4, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  g.restore();
}

/** Radius of the disc in its texture (px): the frame is drawn so this maps to the zone's radius. */
export const BOSS_TELE_RADIUS_PX = BOSS_TELE_PX / 2 - 4;

function paint(g: CanvasRenderingContext2D, frames: readonly PlacedFrame[], draw: (g: CanvasRenderingContext2D, f: PlacedFrame) => void): void {
  for (const f of frames) {
    g.save();
    g.beginPath();
    g.rect(f.x, f.y, f.w, f.h);
    g.clip();
    draw(g, f);
    g.restore();
  }
}

function register(scene: Phaser.Scene, key: string, specs: FrameSpec[], draw: (g: CanvasRenderingContext2D, f: PlacedFrame) => void): void {
  if (scene.textures.exists(key)) return;
  const layout = packAtlas(specs);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  addGeneratedTexture(
    scene,
    key,
    canvas,
    (g) => paint(g, layout.frames, draw),
    (tex) => {
      for (const f of layout.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
}

/** Creates the boss textures once per game (idempotent; textures outlive scene restarts). `holeFrac` = body radius / slam radius. */
export function ensureBossTextures(scene: Phaser.Scene, holeFrac = 2 / 4.5): void {
  register(scene, BOSS_ATLAS, bossSpecs(), drawBossFrame);
  register(scene, BOSS_FX, bossFxSpecs(), drawFxFrame);
  if (!scene.textures.exists(BOSS_TELE)) {
    const canvas = document.createElement("canvas");
    canvas.width = BOSS_TELE_PX;
    canvas.height = BOSS_TELE_PX;
    addGeneratedTexture(scene, BOSS_TELE, canvas, (g) => drawTeleDisc(g, holeFrac));
  }
}
