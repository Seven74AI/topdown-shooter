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
  ["dead", 0.35, 0, "dead_a", false], // Story 6.7: the collapse (3 frames by progress)
  ["dead", 0.7, 0, "dead_b", false],
  ["dead", 1, 0, "dead_c", false],
  ["outline", 0, 0, "outline_a", false], // the overlay above the darkness: normal eyes
  ["outline", 0, 0, "outline_b", true], // enraged (red eyes, 6.7 sets the flag)
];

const lookKey = (look: number): string => (BEHEMOTH_LOOK_IDS[look] ?? "BH1").toLowerCase();

/** Frame names per look (built once: the view never builds strings per frame). */
export const BOSS_FRAMES: readonly (readonly string[])[] = BEHEMOTH_LOOK_IDS.map((_, l) => POSE_FRAMES.map((f) => `boss_${lookKey(l)}_${f[3]}`));
/** Index of each pose frame in `BOSS_FRAMES[look]`. */
export const BOSS_FRAME = { walkA: 0, walkB: 1, slamA: 2, slamB: 3, slamC: 4, slamHit: 5, charge: 6, rush: 7, throw: 8, stun: 9, roar: 10, deadA: 11, deadB: 12, deadC: 13, outline: 14, outlineEnraged: 15 } as const;

export function bossSpecs(): FrameSpec[] {
  return BOSS_FRAMES.flat().map((name) => ({ name, w: BOSS_FRAME_PX, h: BOSS_FRAME_PX }));
}

/** FX frames (one texture). Asset fixes round 5: the skull, edge disc and icons became the P1 warning display (`hudWarnArt.ts`). */
export const BOSS_FX_FRAMES = {
  crack: "boss_decal_crack_a",
  // Story 6.6: the thrown chunks (D7: rubble / burnt-car panel / torn asphalt), the crater, the CRASH mark.
  chunkRoad: "boss_chunk_road_a",
  chunkRubble: "boss_chunk_rubble_a",
  chunkCar: "boss_chunk_car_a",
  crater: "boss_decal_crater_a",
  crash: "boss_mark_crash_a",
} as const;
const FX_PX: Record<string, number> = {
  boss_decal_crack_a: 256,
  boss_chunk_road_a: 64,
  boss_chunk_rubble_a: 64,
  boss_chunk_car_a: 64,
  boss_decal_crater_a: 128,
  boss_mark_crash_a: 256,
};
/** Story 6.6: chunk sprite size (m) and the crater decal's diameter (m). */
export const BOSS_CHUNK_M = 1.3;
export const BOSS_CRATER_M = 3.2;
/** Story 6.6: the CRASH mark frame is square (256 px); the bar + word use its middle band. Width in metres = the lane width. */
export const BOSS_CRASH_BAND = 0.36;
/** The crack decal's px per metre (it covers the 4.5 m ring: 256 px = 9 m). */
export const BOSS_CRACK_PX_PER_M = 256 / 9;

export function bossFxSpecs(): FrameSpec[] {
  return Object.values(BOSS_FX_FRAMES).map((name) => ({ name, w: FX_PX[name] as number, h: FX_PX[name] as number }));
}

/** Story 6.6: a thrown chunk (D7), centred, about 0.8 × the frame. `kind`: 0 road, 1 rubble, 2 burnt car. */
function drawChunk(g: CanvasRenderingContext2D, s: number, kind: number): void {
  const fills = ["#3b3a3d", "#8c877c", "#3a2a22"];
  const rims = ["#1c1b1d", "#4e4a43", "#120c09"];
  g.fillStyle = fills[kind] as string;
  g.strokeStyle = rims[kind] as string;
  g.lineWidth = s * 0.08;
  g.beginPath();
  const pts = kind === 2 ? [-0.8, -0.35, 0.7, -0.55, 0.85, 0.3, -0.6, 0.6] : [-0.7, -0.5, 0.6, -0.65, 0.8, 0.3, 0.1, 0.7, -0.75, 0.35];
  for (let i = 0; i < pts.length; i += 2) {
    const x = (pts[i] as number) * s * 0.85;
    const y = (pts[i + 1] as number) * s * 0.85;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.stroke();
  if (kind === 0) {
    g.strokeStyle = "#c9a227"; // a scrap of the road's centre line
    g.lineWidth = s * 0.12;
    g.beginPath();
    g.moveTo(-s * 0.35, s * 0.05);
    g.lineTo(s * 0.3, -s * 0.1);
    g.stroke();
  } else if (kind === 1) {
    g.strokeStyle = "#6b3d22"; // rebar ends
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.moveTo(-s * 0.2, -s * 0.3);
    g.lineTo(-s * 0.55, -s * 0.85);
    g.moveTo(s * 0.25, -s * 0.2);
    g.lineTo(s * 0.5, -s * 0.8);
    g.stroke();
  } else {
    g.fillStyle = "rgba(120,52,28,0.8)"; // rust and a scorched window hole
    g.fillRect(-s * 0.45, -s * 0.2, s * 0.5, s * 0.3);
    g.fillStyle = "#0b0807";
    g.fillRect(s * 0.15, -s * 0.25, s * 0.35, s * 0.25);
  }
}

/** Story 6.6: the crater (a dark pit, a dusty rim, a few radial cracks); stays until the build phase (D8). */
function drawCrater(g: CanvasRenderingContext2D, s: number): void {
  g.fillStyle = "rgba(60,54,48,0.45)";
  g.beginPath();
  g.arc(0, 0, s * 0.95, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(12,10,9,0.8)";
  g.beginPath();
  g.arc(0, 0, s * 0.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(14,12,10,0.85)";
  g.lineWidth = 2.2;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
    g.beginPath();
    g.moveTo(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45);
    g.lineTo(Math.cos(a + 0.12) * s * 0.92, Math.sin(a + 0.12) * s * 0.92);
    g.stroke();
  }
}

/**
 * Story 6.6: the CRASH mark (the tells section): an amber bar across the lane end with the word
 * "CRASH" (amber = an event you can use: the stun is your window; colour rule brief 24). The frame is
 * the lane's width square; the bar is its middle band, drawn across x (the lane runs along +x).
 */
function drawCrashMark(g: CanvasRenderingContext2D, s: number): void {
  const band = s * BOSS_CRASH_BAND;
  g.fillStyle = "#f2a31b";
  g.fillRect(-band * 0.22, -s * 0.96, band * 0.44, s * 1.92); // the bar across the lane
  g.strokeStyle = "#1a1208";
  g.lineWidth = 3;
  g.strokeRect(-band * 0.22, -s * 0.96, band * 0.44, s * 1.92);
  g.save();
  g.rotate(-Math.PI / 2);
  g.font = `bold ${Math.round(band * 0.62)}px Oswald, Impact, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 5;
  g.strokeStyle = "#1a1208";
  g.fillStyle = "#ffc24a";
  g.strokeText("CRASH", 0, -band * 0.62);
  g.fillText("CRASH", 0, -band * 0.62);
  g.restore();
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
  const s = f.w / 2;
  g.lineCap = "round";
  g.lineJoin = "round";
  switch (f.name) {
    case BOSS_FX_FRAMES.crack:
      // Asset fixes (designer): the realistic ground damage, R1 + R2 + R3 combined (`groundDamageArt.ts`)
      drawGroundDamage(g, -f.w / 2, -f.h / 2, f.w);
      break;
    case BOSS_FX_FRAMES.chunkRoad:
      drawChunk(g, s, 0);
      break;
    case BOSS_FX_FRAMES.chunkRubble:
      drawChunk(g, s, 1);
      break;
    case BOSS_FX_FRAMES.chunkCar:
      drawChunk(g, s, 2);
      break;
    case BOSS_FX_FRAMES.crater:
      drawCrater(g, s);
      break;
    case BOSS_FX_FRAMES.crash:
      drawCrashMark(g, s);
      break;
  }
}

/** The hatch's stripe spacing (px in the 512 px disc): the prototype's 0.55 m at 4.5 m. */
const HATCH_STEP_PX = 31;

/**
 * Story 6.6's throw ring (and the original 6.5 slam look): a faint red fill with white diagonal hatching, the
 * solid red edge and the dashed white inner edge, and a transparent hole of `holeFrac` × the radius. The slam
 * now has its own glowing countdown disc (`drawTeleDisc`); the throw ring keeps this look.
 */
function drawHatchDisc(g: CanvasRenderingContext2D, holeFrac: number): void {
  const n = BOSS_TELE_PX;
  const R = n / 2 - 4;
  g.clearRect(0, 0, n, n);
  g.save();
  g.translate(n / 2, n / 2);
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = "rgba(255,40,48,0.16)";
  g.fillRect(-R, -R, 2 * R, 2 * R);
  g.strokeStyle = "rgba(255,255,255,0.22)";
  g.lineWidth = 5;
  g.beginPath();
  for (let i = -2 * R; i <= 2 * R; i += HATCH_STEP_PX) {
    g.moveTo(i - R, R);
    g.lineTo(i + R, -R);
  }
  g.stroke();
  g.restore();
  g.save();
  g.translate(n / 2, n / 2);
  g.lineWidth = 7;
  g.strokeStyle = "#ff3b3b";
  g.beginPath();
  g.arc(0, 0, R - 3.5, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([22, 17]);
  g.lineWidth = 3;
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(0, 0, R - 10, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  if (holeFrac > 0) {
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.arc(0, 0, R * holeFrac, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
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
  // Story 6.6: the throw's landing ring (the same hatched disc, no body hole) and the charge lane strip.
  if (!scene.textures.exists(BOSS_RING)) {
    const canvas = document.createElement("canvas");
    canvas.width = BOSS_TELE_PX;
    canvas.height = BOSS_TELE_PX;
    addGeneratedTexture(scene, BOSS_RING, canvas, (g) => drawHatchDisc(g, 0));
  }
  if (!scene.textures.exists(BOSS_LANE)) {
    const canvas = document.createElement("canvas");
    canvas.width = BOSS_LANE_W_PX;
    canvas.height = BOSS_LANE_H_PX;
    addGeneratedTexture(scene, BOSS_LANE, canvas, drawLane);
  }
}

/** Story 6.6: the throw ring (no hole: the landing spot is not the boss). */
export const BOSS_RING = "boss_tele_ring";
/** Story 6.6: the lane strip — the longest lane (body back to front: distM + 2 × radius = 14 m) × 4.8 m at 24 px/m; cropped to each lane's length. */
export const BOSS_LANE = "boss_tele_lane";
export const BOSS_LANE_PX_PER_M = 24;
export const BOSS_LANE_MAX_M = 14;
export const BOSS_LANE_WIDTH_M = 4.8;
const BOSS_LANE_W_PX = BOSS_LANE_MAX_M * BOSS_LANE_PX_PER_M;
const BOSS_LANE_H_PX = Math.round(BOSS_LANE_WIDTH_M * BOSS_LANE_PX_PER_M);

/** The lane (prototype `drawTele` for a charge): faint red, white hatching, red long edges, dashed white inner edges, white arrows every 2 m (pointing +x). */
function drawLane(g: CanvasRenderingContext2D): void {
  const w = BOSS_LANE_W_PX;
  const h = BOSS_LANE_H_PX;
  const m = BOSS_LANE_PX_PER_M;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "rgba(255,40,48,0.16)";
  g.fillRect(0, 0, w, h);
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.strokeStyle = "rgba(255,255,255,0.22)";
  g.lineWidth = 3;
  const step = 0.55 * m;
  g.beginPath();
  for (let i = -h; i <= w + h; i += step) {
    g.moveTo(i, h);
    g.lineTo(i + h, 0);
  }
  g.stroke();
  g.restore();
  g.fillStyle = "#ff3b3b";
  g.fillRect(0, 0, w, 4);
  g.fillRect(0, h - 4, w, 4);
  g.setLineDash([14, 10]);
  g.lineWidth = 2;
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.moveTo(0, 9);
  g.lineTo(w, 9);
  g.moveTo(0, h - 9);
  g.lineTo(w, h - 9);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = "rgba(255,255,255,0.85)";
  for (let x = 3 * m; x < w - m; x += 2 * m) {
    g.beginPath();
    g.moveTo(x + 0.45 * m, h / 2);
    g.lineTo(x - 0.35 * m, h / 2 - 0.6 * m);
    g.lineTo(x - 0.35 * m, h / 2 - 0.3 * m);
    g.lineTo(x - 0.05 * m, h / 2);
    g.lineTo(x - 0.35 * m, h / 2 + 0.3 * m);
    g.lineTo(x - 0.35 * m, h / 2 + 0.6 * m);
    g.closePath();
    g.fill();
  }
}
