import { BH_FRAME_HALF_M, drawBehemoth, type BehemothPose } from "./behemothArt";
import { relightCharSteps, rowBoxBlurSteps, sheenSide, sheenStrip, SHEEN_STEPS } from "./charRelight";
import { freeCanvas } from "./canvasRecycle";
import type { MakeCanvas } from "./relight";

/**
 * Story 9.15 (AC 2, 4, 5): the Behemoth's frame list and its relit bake, pure and worker-safe (no Phaser, no DOM: the
 * bake worker `bossBakeWorker.ts` and the main-thread fallback in `bossRelit.ts` run the same steps).
 *
 * - `BOSS_POSES`: the 16 body frames of a look, in the plain atlas (`bossAtlas.ts`) and the relit sheets. Story 9.15
 *   fixes the walk (phases 0.25 / 0.75: the arm swing is `sin(phase)`, zero at 0 and 0.5, so the two old frames were the
 *   same picture) and adds `charge_b` / `throw_b` (G2 A: the warning shows the pose by progress).
 * - The relit bake of ONE look (B1: only the look in play): every body frame calm, every pose but death enraged with its
 *   vein + split glow (G3 E2: the magenta marker cores, turned dark red in the body before the relight, and into an
 *   additive glow picture), the death glow (dead_a's marker, for the last weak beat), and the sheen strips of the walk.
 */

/** Frame size (px) of one boss pose: 252 px over 7 m = 36 px per metre. */
export const BOSS_FRAME_PX = 252;
export const BOSS_PX_PER_M = BOSS_FRAME_PX / (2 * BH_FRAME_HALF_M);
/** The relit source is drawn at ×2 and the relight's volume scale is 0.7 × its px per metre (the page's `RF`). */
export const BOSS_SS = 2;
export const BOSS_RELIGHT_RF = 0.7;
/** The relight's seed per look (the page's `901 + v × 7`). */
export const bossRelightSeed = (look: number): number => 901 + look * 7;

export interface BossPoseSpec {
  readonly pose: BehemothPose;
  readonly k: number;
  /** Walk phase 0–1. */
  readonly ph: number;
  /** Frame variant (`boss_<look>_<variant>`). */
  readonly name: string;
}
/** The body frames of one look, in order (indices: `BOSS_FRAME`). */
export const BOSS_POSES: readonly BossPoseSpec[] = [
  { pose: "walk", k: 0, ph: 0.25, name: "walk_a" },
  { pose: "walk", k: 0, ph: 0.75, name: "walk_b" },
  { pose: "slam", k: 0.15, ph: 0, name: "slam_a" },
  { pose: "slam", k: 0.5, ph: 0, name: "slam_b" },
  { pose: "slam", k: 1, ph: 0, name: "slam_c" },
  { pose: "slamHit", k: 0, ph: 0, name: "slamhit_a" },
  // Story 9.15 (G2 A): the first half of the warning, halfway into the pose. k is the pose's own progress: the charge
  // reaches its full crouch at k 0.5 (`e = min(1, 2k)`), the throw its lift at k 0.56 (`e = min(1, 1.8k)`), so a
  // literal k 0.5 would be (nearly) the same picture as the k 1 frame; these are the half-way pictures (e = 0.5)
  { pose: "charge", k: 0.25, ph: 0, name: "charge_b" },
  { pose: "charge", k: 1, ph: 0, name: "charge_a" },
  { pose: "rush", k: 1, ph: 0, name: "rush_a" },
  { pose: "throw", k: 0.5 / 1.8, ph: 0, name: "throw_b" },
  { pose: "throw", k: 1, ph: 0, name: "throw_a" },
  { pose: "stun", k: 0, ph: 0, name: "stun_a" },
  { pose: "roar", k: 0, ph: 0, name: "roar_a" },
  { pose: "dead", k: 0.35, ph: 0, name: "dead_a" }, // Story 6.7: the collapse (3 frames by progress)
  { pose: "dead", k: 0.7, ph: 0, name: "dead_b" },
  { pose: "dead", k: 1, ph: 0, name: "dead_c" },
];
/** Index of each pose frame in `BOSS_POSES`. */
export const BOSS_FRAME = { walkA: 0, walkB: 1, slamA: 2, slamB: 3, slamC: 4, slamHit: 5, chargeB: 6, charge: 7, rush: 8, throwB: 9, throw: 10, stun: 11, roar: 12, deadA: 13, deadB: 14, deadC: 15 } as const;
export const BOSS_BODY_FRAMES = BOSS_POSES.length;
/** A body frame has an enraged version (every pose but death). */
export const bossHasEnraged = (i: number): boolean => BOSS_POSES[i]?.pose !== "dead";
/** A body frame has a sheen strip (B6: the walk, the idle state). */
export const bossHasSheen = (i: number): boolean => BOSS_POSES[i]?.pose === "walk";

/** Relit frame names (one look in the sheets at a time: no look in the name). */
export const relitBodyName = (i: number, enraged: boolean): string => `bossr_${(BOSS_POSES[i] as BossPoseSpec).name}${enraged ? "_e" : ""}`;
export const relitVeinName = (i: number): string => `bossr_${(BOSS_POSES[i] as BossPoseSpec).name}_vein`;
export const relitSheenStrip = (i: number, enraged: boolean): string => `bossr_${(BOSS_POSES[i] as BossPoseSpec).name}${enraged ? "_e" : ""}_sheen`;
export const relitSheenName = (i: number, enraged: boolean, step: number): string => `${relitSheenStrip(i, enraged)}${step}`;

/** One bake job: body frame `i`, calm or enraged; `veinOnly` = the glow picture without a relit body (the death glow). */
export interface BossJob {
  readonly i: number;
  readonly enraged: boolean;
  readonly veinOnly: boolean;
}
/** Stable id of a job (queues, answers). */
export const bossJobId = (j: BossJob): string => `${j.i}:${j.enraged ? 1 : 0}:${j.veinOnly ? 1 : 0}`;

/** Every job of a look's bake, most-seen first: the calm walk, the calm poses, the enraged ones, the death glow. */
export function bossJobs(): BossJob[] {
  const out: BossJob[] = [];
  for (let i = 0; i < BOSS_BODY_FRAMES; i++) out.push({ i, enraged: false, veinOnly: false });
  for (let i = 0; i < BOSS_BODY_FRAMES; i++) if (bossHasEnraged(i)) out.push({ i, enraged: true, veinOnly: false });
  out.push({ i: BOSS_FRAME.deadA, enraged: true, veinOnly: true });
  return out;
}

/** The frames a job writes (body, vein, sheen strip). */
export function jobFrames(j: BossJob): { readonly body: string | null; readonly vein: string | null; readonly sheen: string | null } {
  return {
    body: j.veinOnly ? null : relitBodyName(j.i, j.enraged),
    vein: j.enraged ? relitVeinName(j.i) : null,
    sheen: !j.veinOnly && bossHasSheen(j.i) ? relitSheenStrip(j.i, j.enraged) : null,
  };
}

/** The relit sheets (B2: small sheets, one re-upload per landing): 4 frames per 512² sheet, the sheen strips apart. */
export const BOSS_SHEET_PX = 512;
export const BOSS_SHEEN_SHEET = "bossr_sheen";
export interface BossSheetSpec {
  readonly key: string;
  readonly w: number;
  readonly h: number;
  /** Frame name → its rectangle in the sheet. */
  readonly frames: ReadonlyMap<string, { readonly x: number; readonly y: number; readonly w: number; readonly h: number }>;
}
let sheetSpecs: BossSheetSpec[] | null = null;
/** The relit sheets' layout (built once). */
export function bossSheetSpecs(): readonly BossSheetSpec[] {
  if (sheetSpecs) return sheetSpecs;
  const n = BOSS_FRAME_PX;
  const names: string[] = [];
  for (const j of bossJobs()) {
    const f = jobFrames(j);
    if (f.body) names.push(f.body);
    if (f.vein) names.push(f.vein);
  }
  const specs: BossSheetSpec[] = [];
  for (let s = 0; s * 4 < names.length; s++) {
    const frames = new Map<string, { x: number; y: number; w: number; h: number }>();
    names.slice(s * 4, s * 4 + 4).forEach((name, k) => frames.set(name, { x: (k % 2) * n, y: Math.floor(k / 2) * n, w: n, h: n }));
    specs.push({ key: `bossr_s${s}`, w: BOSS_SHEET_PX, h: BOSS_SHEET_PX, frames });
  }
  const h = sheenSide(n);
  const strips = new Map<string, { x: number; y: number; w: number; h: number }>();
  let row = 0;
  for (const j of bossJobs()) {
    const st = jobFrames(j).sheen;
    if (st) strips.set(st, { x: 0, y: row++ * h, w: h * SHEEN_STEPS, h });
  }
  specs.push({ key: BOSS_SHEEN_SHEET, w: h * SHEEN_STEPS, h: row * h, frames: strips });
  sheetSpecs = specs;
  return specs;
}
/** The sheet holding frame (or strip) `name`. */
export function bossSheetOf(name: string): BossSheetSpec | undefined {
  return bossSheetSpecs().find((s) => s.frames.has(name));
}

/** The vein glow's colour (the page's `markerPulse`: 255, 120, 80). */
export const BOSS_VEIN_RGB = [255, 120, 80] as const;
/** The page's beat peak (0.95) and its gain on thin marker lines (× 1.6); the halo is 0.8 × a blur of σ ≈ 1.9 px. */
const VEIN_PEAK = 0.95;
const VEIN_GAIN = 1.6;
const VEIN_HALO = 0.8;
const VEIN_HALO_SIGMA_PX = 2.5 * (BOSS_PX_PER_M / 48); // the page's blur(2.5px) at 48 px per metre

/**
 * The page's `markerPulse`, baked once at the beat's peak (B4: the view pulses the whole layer's alpha): finds the
 * marker cores (blue and red both above green, with a dead zone: cloth stains tint faintly that way), paints them dark
 * red in `src` (the relight then lights them like skin) and returns the glow picture (`n × n`, straight alpha, for ADD):
 * the core plus a soft halo. Yields per row.
 */
export function* markerGlowSteps(src: HTMLCanvasElement, n: number, make: MakeCanvas): Generator<number, HTMLCanvasElement | null, void> {
  const W = src.width;
  const ss = W / n;
  const sg = src.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const img = sg.getImageData(0, 0, W, W);
  const d = img.data;
  const mask = new Float32Array(n * n);
  let any = false;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const r = d[i * 4] as number;
      const g = d[i * 4 + 1] as number;
      const b = d[i * 4 + 2] as number;
      const m = Math.max(0, Math.min(1, ((Math.min(r, b) - g) / 255 - 0.2) * 5));
      if (m <= 0) continue;
      any = true;
      d[i * 4] = r + (90 - r) * m;
      d[i * 4 + 1] = g + (18 - g) * m;
      d[i * 4 + 2] = b + (10 - b) * m;
      const j = Math.floor(y / ss) * n + Math.floor(x / ss);
      mask[j] = (mask[j] as number) + m / (ss * ss);
    }
    yield W;
  }
  sg.putImageData(img, 0, 0);
  if (!any) return null;
  const core = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const m = mask[i] as number;
    core[i] = m > 0.02 ? VEIN_PEAK * Math.min(1, m * VEIN_GAIN) : 0;
  }
  const r = Math.max(1, Math.round((Math.sqrt(6 * VEIN_HALO_SIGMA_PX * VEIN_HALO_SIGMA_PX + 1) - 1) / 2));
  const halo = yield* rowBoxBlurSteps(core, n, n, r);
  const out = make(n, n);
  const og = out.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const o = og.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const a = Math.min(1, (core[i] as number) + VEIN_HALO * (halo[i] as number));
    if (a < 1 / 255) continue;
    o.data[i * 4] = BOSS_VEIN_RGB[0];
    o.data[i * 4 + 1] = BOSS_VEIN_RGB[1];
    o.data[i * 4 + 2] = BOSS_VEIN_RGB[2];
    o.data[i * 4 + 3] = Math.round(a * 255);
  }
  og.putImageData(o, 0, 0);
  yield n * n;
  return out;
}

/** A job's pictures (null: none for this job). */
export interface BossBaked {
  readonly body: HTMLCanvasElement | null;
  readonly vein: HTMLCanvasElement | null;
  readonly sheen: HTMLCanvasElement | null;
}

/** Draws body frame `i` of `look` plain (no eyes, B3) centred in an `n × n` canvas at `pxPerM`. */
export function drawBossBody(g: CanvasRenderingContext2D, n: number, pxPerM: number, look: number, i: number, enraged: boolean): void {
  const p = BOSS_POSES[i] as BossPoseSpec;
  g.save();
  g.translate(n / 2, n / 2);
  drawBehemoth(g, pxPerM, look, p.pose, p.k, enraged, p.ph, false);
  g.restore();
}

/**
 * One job's bake: the drawing at ×`BOSS_SS`, the marker glow (enraged), the 9.13 relight and the sheen strip (walk).
 * Yields the work done (source px) after every step.
 */
export function* bossBakeSteps(look: number, j: BossJob, make: MakeCanvas): Generator<number, BossBaked, void> {
  const n = BOSS_FRAME_PX;
  const S = n * BOSS_SS;
  const src = make(S, S);
  try {
    drawBossBody(src.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D, S, BOSS_PX_PER_M * BOSS_SS, look, j.i, j.enraged);
    yield S * S;
    const vein = j.enraged ? yield* markerGlowSteps(src, n, make) : null;
    if (j.veinOnly) return { body: null, vein, sheen: null };
    const L = yield* relightCharSteps(src, n, BOSS_SS, BOSS_PX_PER_M * BOSS_SS * BOSS_RELIGHT_RF, bossRelightSeed(look), make);
    const sheen = bossHasSheen(j.i) ? sheenStrip(L.gloss, n, make) : null;
    freeCanvas(L.gloss);
    freeCanvas(L.glow); // no emissive layer: the eyes are their own layer (B3), the glow is the marker's
    return { body: L.base, vein, sheen };
  } finally {
    freeCanvas(src);
  }
}
