/**
 * Photoreal group 5, the Behemoth's warnings (designer 2026-11-26: "In. I'm curious to see how they would look like.
 * So add them too."). Six cards: SD slam countdown disc, TH throw, CL charge lane, CR the CRASH mark, P1 the warning
 * display, GD the ground damage.
 *
 * "Now" = today's game: the textures painted by `bossAtlas.ts` / `hudWarnArt.ts` (captured through textureShim) and
 * the composition in `BossView.ts` / `BossHud.ts` (sizes, alphas, progress, fade), copied line for line.
 * Take A = the same design as emitted light on the real asphalt (light rings, light pools, real spark streaks).
 * Take B = the ground carries part of the tell (cracks spreading, light seeping out of them, dust lifting), always
 * inside an unmistakable red boundary. Both keep each warning's size, timing and colour meaning.
 *
 * Timings: boss.json (slam telegraph 1.2 s, recover 0.8 s; charge telegraph 1.0 s at 12 m/s, lane 4.8 m, stun 2 s;
 * throw lift 1.0 s + flight 0.8 s, ring 3 m; slam ring 4.5 m; body 2 m) and bossTelegraph.ts (fade 0.3 s after the
 * hit / stop). Poses as Story 9.15 shows them (charge / throw pose during their warnings), from today's plain atlas.
 */
import { make, idle, rng, clamp01, ramp, easeOut, sprite, countSprite, type FxCard, type Look, type Stage } from "./kit";
import { captured, fakeScene, frameCanvas } from "./textureShim";
import { ensureBossTextures, BOSS_TELE_RADIUS_PX, BOSS_LANE_PX_PER_M, TELE_TICKS, TELE_TICK_MAJOR, TELE_TICK_IN_PX, BOSS_CRACK_PX_PER_M } from "../../../../apps/client/src/render/city/bossAtlas";
import { ensureHudWarnTextures, hudFlicker, HUD_FRAMES, HUD_ART_SCALE } from "../../../../apps/client/src/render/city/hudWarnArt";
import { ensureAtlases } from "../../../../apps/client/src/render/city/spriteAtlas";
import { drawGroundDamage } from "../../../../apps/client/src/render/city/groundDamageArt";
import { gLooks } from "./telegraphs-g";
import { relief, ringSegment, drawRing, glowTex, streakTex, dustTex, fissure, blitSeg, blitSegCrop, screenLook, fbm, type Seg } from "./telegraphs-art";

/* ---------------- Game numbers (boss.json, BossView.ts, bossTelegraph.ts) ---------------- */
const BODY_R = 2.0;
const SLAM_R = 4.5;
const SLAM_T = 1.2;
const FADE = 0.3; // TELEGRAPH_FADE_S
const SLAM_HIT_S = 0.5;
const CHARGE_T = 1.0;
const RUSH_V = 12;
const LANE_W = 4.8;
const STUN_S = 2;
const LIFT_S = 1.0;
const FLIGHT_S = 0.8;
const THROW_R = 3;
const CHUNK_M = 1.3; // BOSS_CHUNK_M
const CRATER_M = 3.2; // BOSS_CRATER_M
const CHUNK_ARC_M = 3;
const CRACK_SIDE_M = (2 * 256) / (2 * BOSS_CRACK_PX_PER_M); // 9 m
const PUFF = "184,173,160"; // PUFF_COLOR 0xb8ada0
const BOSS_SIDE_M = 7;
const LOCK_R = 0.8;
const LOCK_CSS = 47;
const LOCK_LINE = 2 / LOCK_CSS;

/* ---------------- Shared: the game's captured textures, the boss under the effect ---------------- */
let booted = false;
export function boot(): void {
  if (booted) return;
  booted = true;
  ensureBossTextures(fakeScene, BODY_R / SLAM_R);
  ensureHudWarnTextures(fakeScene);
  ensureAtlases(fakeScene);
}
const frames = new Map<string, HTMLCanvasElement>();
export function fc(key: string, name: string): HTMLCanvasElement {
  const k = `${key}/${name}`;
  let c = frames.get(k);
  if (!c) {
    c = frameCanvas(key, name);
    frames.set(k, c);
  }
  return c;
}
export const whole = (key: string): HTMLCanvasElement => (captured.get(key) as { canvas: HTMLCanvasElement }).canvas;
export const X = (st: Stage, m: number): number => st.cx + m * st.pxm;
export const Y = (st: Stage, m: number): number => st.cy + m * st.pxm;
/** The boss (today's plain atlas frame, BH1) at (xm, ym), 7 m frame, facing +x. Context only: not counted. */
export function boss(g: CanvasRenderingContext2D, st: Stage, pose: string, xm: number, ym = 0): void {
  const tex = fc("boss_atlas", `boss_bh1_${pose}`);
  const s = BOSS_SIDE_M * st.pxm;
  g.drawImage(tex, X(st, xm) - s / 2, Y(st, ym) - s / 2, s, s);
}
export const show = (st: Stage, part: string): boolean => st.only === null || st.only === part;
/** Stable 0–1 per index and channel (BossView `sparkHash`). */
export function sh(i: number, ch: number): number {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(ch, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const hex = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;
/** A Phaser Graphics stroked circle in metres (one game object per call site; the caller counts it). */
function circle(g: CanvasRenderingContext2D, st: Stage, xm: number, ym: number, rm: number, wm: number, col: string, a: number): void {
  if (a <= 0.003 || rm <= 0) return;
  g.save();
  g.globalAlpha = Math.min(1, a);
  g.strokeStyle = col;
  g.lineWidth = Math.max(0.5, wm * st.pxm);
  g.beginPath();
  g.arc(X(st, xm), Y(st, ym), rm * st.pxm, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/* ---------------- Shared baked art for the takes ---------------- */
export let shared: {
  dust: HTMLCanvasElement[];
  dustDark: HTMLCanvasElement[];
  streak: HTMLCanvasElement;
  headHot: HTMLCanvasElement;
  poolRed: HTMLCanvasElement;
  poolAmber: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  shadowSoft: HTMLCanvasElement;
  bits: HTMLCanvasElement[];
} | null = null;
export async function sharedArt(): Promise<NonNullable<typeof shared>> {
  if (shared) return shared;
  const sdw = (px: number, soft: number): HTMLCanvasElement => {
    const c = make(px, px);
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
    gr.addColorStop(0, "rgba(6,6,8,0.85)");
    gr.addColorStop(soft, "rgba(6,6,8,0.6)");
    gr.addColorStop(1, "rgba(6,6,8,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, px, px);
    return c;
  };
  const bits: HTMLCanvasElement[] = [];
  for (let i = 0; i < 3; i++) {
    const c = make(28, 28);
    const g = c.getContext("2d", { willReadFrequently: true })!;
    const R = rng(90 + i);
    g.fillStyle = ["#4a4746", "#6e6a63", "#3b3836"][i] as string;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const r = 8 + R() * 5;
      if (k === 0) g.moveTo(14 + Math.cos(a) * r, 14 + Math.sin(a) * r);
      else g.lineTo(14 + Math.cos(a) * r, 14 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    bits.push(relief(c, { fromAlpha: 1, fromLum: 0.4, blur: 2, depth: 8 }));
  }
  shared = {
    dust: [0, 1, 2].map((i) => dustTex(96, 41 + i * 7)),
    dustDark: [0, 1].map((i) => dustTex(96, 77 + i * 5, "96,90,84")),
    streak: streakTex(),
    headHot: glowTex(64, "255,246,232", "255,64,34", 0.1),
    poolRed: glowTex(128, "255,110,80", "255,36,24", 0.03),
    poolAmber: glowTex(128, "255,214,140", "255,150,30", 0.04),
    shadow: sdw(64, 0.55),
    shadowSoft: sdw(64, 0.1),
    bits,
  };
  await idle();
  return shared;
}

/** A thrown chunk (road slab / rubble / burnt-car panel), drawn as the real thing and relit from the upper left. */
export function chunkTex(kind: number, px: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const s = px / 2;
  g.translate(s, s);
  const pts = kind === 2 ? [-0.8, -0.35, 0.7, -0.55, 0.85, 0.3, -0.6, 0.6] : [-0.7, -0.5, 0.6, -0.65, 0.8, 0.3, 0.1, 0.7, -0.75, 0.35];
  const R = rng(300 + kind);
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    // broken edges: each straight side becomes a few jagged steps
    const ax = (pts[i] as number) * s * 0.8;
    const ay = (pts[i + 1] as number) * s * 0.8;
    const bx = (pts[(i + 2) % pts.length] as number) * s * 0.8;
    const by = (pts[(i + 3) % pts.length] as number) * s * 0.8;
    if (i === 0) g.moveTo(ax, ay);
    for (let k = 1; k <= 4; k++) {
      const f = k / 4;
      const j = k < 4 ? (R() - 0.5) * s * 0.12 : 0;
      g.lineTo(ax + (bx - ax) * f + j, ay + (by - ay) * f + j);
    }
  }
  g.closePath();
  g.fillStyle = ["#3d3c3e", "#8a857b", "#3a2c25"][kind] as string;
  g.fill();
  g.save();
  g.clip();
  // aggregate / grit: soft mottling (no hard specks)
  const img = g.getImageData(0, 0, px, px);
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      const j = (y * px + x) * 4;
      if ((img.data[j + 3] as number) === 0) continue;
      const n = fbm(x / 6, y / 6, 11 + kind, 4) - 0.5;
      const f = 1 + n * (kind === 1 ? 0.5 : 0.35);
      img.data[j] = Math.min(255, (img.data[j] as number) * f);
      img.data[j + 1] = Math.min(255, (img.data[j + 1] as number) * f);
      img.data[j + 2] = Math.min(255, (img.data[j + 2] as number) * f);
    }
  g.putImageData(img, 0, 0);
  if (kind === 0) {
    g.strokeStyle = "rgba(196,160,48,0.9)"; // the road's centre line, worn
    g.lineWidth = s * 0.16;
    g.beginPath();
    g.moveTo(-s * 0.45, s * 0.1);
    g.lineTo(s * 0.4, -s * 0.12);
    g.stroke();
  } else if (kind === 1) {
    g.strokeStyle = "#5e3a24"; // rebar stubs
    g.lineWidth = s * 0.07;
    g.beginPath();
    g.moveTo(-s * 0.2, -s * 0.3);
    g.lineTo(-s * 0.4, -s * 0.62);
    g.moveTo(s * 0.25, -s * 0.2);
    g.lineTo(s * 0.42, -s * 0.58);
    g.stroke();
  } else {
    g.fillStyle = "rgba(118,58,30,0.55)";
    g.fillRect(-s * 0.5, -s * 0.25, s * 0.55, s * 0.35);
    g.fillStyle = "#0c0908";
    g.fillRect(s * 0.12, -s * 0.28, s * 0.36, s * 0.26);
  }
  g.restore();
  return relief(c, { fromAlpha: 1.4, fromLum: 0.5, blur: 3, depth: 9 });
}

/** The throw crater, photoreal: a pit, a heaved rim of broken asphalt, radial cracks, ejecta dust; relit. */
export function craterTex(px: number, heave: number, seed: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const img = g.createImageData(px, px);
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      const u = (x + 0.5) / px - 0.5;
      const v = (y + 0.5) / px - 0.5;
      const a = Math.atan2(v, u);
      const r = Math.hypot(u, v) * 2 + (fbm(Math.cos(a) * 2 + 3, Math.sin(a) * 2, seed) - 0.5) * 0.18;
      if (r > 1) continue;
      const n = fbm(u * 9, v * 9, seed + 1, 4);
      let lum: number;
      let al: number;
      if (r < 0.42) {
        lum = 0.1 + r * 0.25 + n * 0.08; // the pit
        al = 1;
      } else if (r < 0.6) {
        lum = 0.3 + (0.6 - Math.abs(r - 0.52) * 3) * 0.35 * heave + n * 0.15; // the heaved rim
        al = 1;
      } else {
        lum = 0.33 + n * 0.12; // ejecta dust thinning out
        al = clamp01((1 - r) / 0.4) * (0.35 + n * 0.5);
      }
      const j = (y * px + x) * 4;
      img.data[j] = 150 * lum + 20;
      img.data[j + 1] = 142 * lum + 18;
      img.data[j + 2] = 134 * lum + 18;
      img.data[j + 3] = Math.round(255 * al);
    }
  g.putImageData(img, 0, 0);
  const R = rng(seed);
  g.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.4;
    let x = Math.cos(a) * px * 0.2;
    let y = Math.sin(a) * px * 0.2;
    g.strokeStyle = "rgba(14,12,11,0.85)";
    g.lineWidth = px * 0.012;
    g.beginPath();
    g.moveTo(px / 2 + x, px / 2 + y);
    const len = px * (0.2 + R() * 0.22);
    for (let k = 0; k < 5; k++) {
      const aa = a + (R() - 0.5) * 0.5;
      x += (Math.cos(aa) * len) / 5;
      y += (Math.sin(aa) * len) / 5;
      g.lineTo(px / 2 + x, px / 2 + y);
    }
    g.stroke();
  }
  return relief(c, { fromLum: 1.2, blur: 2, depth: 6 + heave * 4 });
}

/** The slam ground damage, relit (the approved R1 + R2 + R3 drawing, given depth from the upper-left light). */
let gdRelitC: HTMLCanvasElement | null = null;
export function gdRelit(): HTMLCanvasElement {
  if (gdRelitC) return gdRelitC;
  const n = 384;
  const c = make(n, n);
  drawGroundDamage(c.getContext("2d", { willReadFrequently: true })!, 0, 0, n);
  gdRelitC = relief(c, { fromLum: 1.1, blur: 1, depth: 5 });
  return gdRelitC;
}

/** Debris bits hopping out from (xm, ym): matter with shadows. tS = seconds since the impact. */
export function debris(g: CanvasRenderingContext2D, st: Stage, art: NonNullable<typeof shared>, xm: number, ym: number, tS: number, n: number, reach: number, seed: number): void {
  if (tS < 0 || tS > 0.55) return;
  const k = easeOut(tS / 0.45);
  for (let i = 0; i < (st.low ? n >> 1 : n); i++) {
    const a = sh(i + seed, 1) * Math.PI * 2;
    const d = reach * (0.5 + sh(i + seed, 2) * 0.6) * k;
    const hop = Math.sin(clamp01(tS / 0.45) * Math.PI) * (0.25 + sh(i + seed, 3) * 0.4);
    const x = xm + Math.cos(a) * d;
    const y = ym + Math.sin(a) * d;
    const sz = 0.16 + sh(i + seed, 4) * 0.16;
    const fade = 1 - ramp(tS, 0.4, 0.55);
    sprite(g, art.shadow, X(st, x + hop * 0.25), Y(st, y + hop * 0.3), sz * 1.2, st.pxm, 0, 0.45 * fade);
    sprite(g, art.bits[i % 3] as HTMLCanvasElement, X(st, x), Y(st, y - hop * 0.35), sz * (1 + hop * 0.3), st.pxm, a + tS * 9, fade);
  }
}
/** A burst of dust puffs from a ring (r0 → r1 m) round (xm, ym); secondary: starts after `delay`, settles slowly. */
export function dustRing(g: CanvasRenderingContext2D, st: Stage, art: NonNullable<typeof shared>, xm: number, ym: number, tS: number, n: number, r0: number, r1: number, life: number, alpha: number, seed: number, dark = false): void {
  if (tS < 0 || tS > life) return;
  const k = easeOut(tS / life);
  const fade = (1 - ramp(tS, life * 0.35, life)) * ramp(tS, 0, 0.06);
  for (let i = 0; i < (st.low ? Math.ceil(n / 2) : n); i++) {
    const a = (i / n) * Math.PI * 2 + sh(i + seed, 7) * 0.5;
    const d = r0 + (r1 - r0) * k * (0.8 + sh(i + seed, 8) * 0.35);
    const sz = (0.9 + sh(i + seed, 9) * 0.8) * (0.7 + k * 0.9);
    const tex = (dark ? art.dustDark : art.dust)[i % (dark ? 2 : 3)] as HTMLCanvasElement;
    sprite(g, tex, X(st, xm + Math.cos(a) * d), Y(st, ym + Math.sin(a) * d), sz, st.pxm, a, alpha * fade);
  }
}

/* ======================================================================================
 * SD: the slam countdown disc
 * ====================================================================================== */
const slamP = (t: number): number => clamp01(t / SLAM_T);
const slamA = (t: number): number => (t <= SLAM_T ? 1 : Math.max(0, 1 - (t - SLAM_T) / FADE));
function slamPose(t: number): string {
  if (t < SLAM_T) return ["slam_a", "slam_b", "slam_c"][slamP(t) < 1 / 3 ? 0 : slamP(t) < 2 / 3 ? 1 : 2] as string;
  if (t < SLAM_T + SLAM_HIT_S) return "slamhit_a";
  return "walk_a";
}

const sdNow: Look = {
  code: "now",
  title: "Glow, countdown and sparks (S1 + S1a + S1c)",
  note: "Today: a 9 m additive disc that gathers over the windup, 72 countdown ticks lit one by one, a hot head riding the rim, 30 → 100 spark dots drifting in. Fades 0.3 s after the hit; the crack decal lands.",
  async bake() {
    boot();
  },
  draw(g, t, st) {
    const p = slamP(t);
    const al = slamA(t);
    if (t >= SLAM_T && show(st, "mark")) sprite(g, fc("boss_fx", "boss_decal_crack_a"), st.cx, st.cy, CRACK_SIDE_M, st.pxm, 0.6, 0.85);
    if (t >= SLAM_T && st.only === null) boss(g, st, slamPose(t), 0); // the decal lies on the ground, under the body
    if (al <= 0) return;
    const side = (2 * SLAM_R * (BOSS_TELE_RADIUS_PX + 4)) / BOSS_TELE_RADIUS_PX;
    if (show(st, "disc")) sprite(g, whole("boss_tele_disc"), st.cx, st.cy, side, st.pxm, 0, al * (0.45 + 0.55 * p), true);
    const k = SLAM_R / BOSS_TELE_RADIUS_PX; // m per texture px
    const R = SLAM_R;
    const pm = st.pxm;
    g.save();
    g.globalCompositeOperation = "lighter";
    if (show(st, "ticks")) {
      countSprite(true);
      const lit = Math.floor(p * TELE_TICKS);
      for (let pass = 0; pass < 2; pass++) {
        g.lineWidth = (pass === 0 ? 7 : 2.6) * k * pm;
        g.strokeStyle = hex(pass === 0 ? 0xff3c28 : 0xffebdc);
        g.globalAlpha = (pass === 0 ? 0.35 : 0.95) * al;
        g.beginPath();
        for (let i = 0; i < lit; i++) {
          const a = -Math.PI / 2 + (i / TELE_TICKS) * Math.PI * 2;
          const l = (i % TELE_TICK_MAJOR === 0 ? 20 : 11) * k;
          const r0 = R - (TELE_TICK_IN_PX - 2) * k;
          g.moveTo(st.cx + Math.cos(a) * r0 * pm, st.cy + Math.sin(a) * r0 * pm);
          g.lineTo(st.cx + Math.cos(a) * (r0 - l) * pm, st.cy + Math.sin(a) * (r0 - l) * pm);
        }
        g.stroke();
      }
    }
    if (show(st, "head") && p < 1) {
      const a = -Math.PI / 2 + p * Math.PI * 2;
      const hx = st.cx + Math.cos(a) * (R - 4 * k) * pm;
      const hy = st.cy + Math.sin(a) * (R - 4 * k) * pm;
      for (let i = 4; i >= 1; i--) {
        g.fillStyle = hex(i === 1 ? 0xffebdc : 0xff3c28);
        g.globalAlpha = (i === 1 ? 0.9 : 0.16) * al;
        g.beginPath();
        g.arc(hx, hy, i * 5 * k * pm, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    if (show(st, "sparks")) {
      countSprite(true);
      g.save();
      g.globalCompositeOperation = "lighter"; // the fill Graphics is ADD
      const n = Math.round(30 + p * 70);
      const span = (R - BODY_R) * 0.55;
      const clock = t + 4;
      for (let i = 0; i < n; i++) {
        const life = (clock / (1 * (1 + sh(i, 3) * 1.5)) + sh(i, 4)) % 1;
        const a = sh(i, 1) * Math.PI * 2 + clock * 0.15 * (sh(i, 2) - 0.5);
        const d = R - life * span;
        g.globalAlpha = Math.sin(life * Math.PI) * (0.5 + p * 0.5) * al;
        g.fillStyle = sh(i, 5) < 0.5 ? "#ffb45a" : "#ffe08c";
        g.beginPath();
        g.arc(st.cx + Math.cos(a) * d * pm, st.cy + Math.sin(a) * d * pm, (1 + sh(i, 6) * 1.6) * k * pm, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  },
  textures: () => [
    { name: "boss_tele_disc", canvas: whole("boss_tele_disc"), note: "ADD, shown 9.1 m" },
    { name: "boss_decal_crack_a", canvas: fc("boss_fx", "boss_decal_crack_a"), note: "9 m, α 0.85" },
  ],
  parts: [
    { id: "disc", label: "Glow disc" },
    { id: "ticks", label: "Lit ticks" },
    { id: "head", label: "Sweep head" },
    { id: "sparks", label: "Sparks" },
    { id: "mark", label: "Crack decal" },
  ],
  frames: [
    { label: "start", t: 0.05, when: "slam_a, 34 sparks" },
    { label: "⅓", t: 0.45, when: "slam_b" },
    { label: "⅔", t: 0.9, when: "slam_c, 82 sparks" },
    { label: "hit", t: 1.2, when: "slamhit, crack lands" },
    { label: "fade", t: 1.4, when: "fading 0.3 s" },
  ],
};

let sdA: { rim: Seg; tick: HTMLCanvasElement } | null = null;
const sdTakeA: Look = {
  code: "SD-A",
  title: "Light on the asphalt",
  note: "The same ring, countdown, head and sparks, made of light that falls on the real street: a hot rim with red light spilling inward over the grain, ticks that glow like burning marks, a head that lights the ground round it, sparks as streaks. On the hit everything flares in the same 0.15 s, the dust kicks out and the relit cracks land.",
  async bake() {
    boot();
    await sharedArt();
    const tick = make(40, 10);
    const tg = tick.getContext("2d")!;
    const gr = tg.createRadialGradient(20, 5, 0, 20, 5, 20);
    gr.addColorStop(0, "rgba(255,240,226,1)");
    gr.addColorStop(0.35, "rgba(255,110,80,0.7)");
    gr.addColorStop(1, "rgba(255,40,28,0)");
    tg.fillStyle = gr;
    tg.beginPath();
    tg.ellipse(20, 5, 20, 5, 0, 0, Math.PI * 2);
    tg.fill();
    sdA = { rim: ringSegment(SLAM_R, { inM: 1.2, outM: 0.35, core: 0.07, pxm: 40, seed: 11 }), tick };
    gdRelit();
    await idle();
  },
  draw(g, t, st) {
    const art = shared!;
    const a0 = sdA!;
    const p = slamP(t);
    const al = slamA(t);
    const rel = t >= SLAM_T ? 1 - ramp(t, SLAM_T, SLAM_T + 0.15) : 0; // the release flare (0.15 s)
    if (t >= SLAM_T && show(st, "mark")) sprite(g, gdRelit(), st.cx, st.cy, CRACK_SIDE_M, st.pxm, 0.6, ramp(t, SLAM_T, SLAM_T + 0.05) * 0.95);
    if (show(st, "dust")) dustRing(g, st, art, 0, 0, t - SLAM_T - 0.03, 14, BODY_R + 0.4, SLAM_R + 0.6, 1.1, 0.55, 3);
    if (show(st, "debris")) debris(g, st, art, 0, 0, t - SLAM_T, 10, 3.2, 20);
    if (t >= SLAM_T && st.only === null) boss(g, st, slamPose(t), 0); // the mark and dust lie under the body
    if (al <= 0) return;
    if (show(st, "rim")) drawRing(g, a0.rim, st.cx, st.cy, st.pxm, al * (0.4 + 0.6 * p) + rel * 0.6);
    if (show(st, "flash") && rel > 0) sprite(g, art.poolRed, st.cx, st.cy, SLAM_R * 2.1, st.pxm, 0, 0.55 * rel, true);
    if (show(st, "ticks")) {
      countSprite(true); // one Graphics / particle layer
      const lit = Math.floor(p * TELE_TICKS);
      const k = SLAM_R / BOSS_TELE_RADIUS_PX;
      g.save();
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < lit; i++) {
        const a = -Math.PI / 2 + (i / TELE_TICKS) * Math.PI * 2;
        const major = i % TELE_TICK_MAJOR === 0;
        const r = SLAM_R - (TELE_TICK_IN_PX + (major ? 10 : 5)) * k;
        // fresher ticks glow brighter, older ones cool to an ember (the time already spent)
        const age = clamp01((p * TELE_TICKS - i) / 18);
        g.globalAlpha = al * (0.95 - 0.45 * age);
        g.translate(st.cx + Math.cos(a) * r * st.pxm, st.cy + Math.sin(a) * r * st.pxm);
        g.rotate(a);
        const L = (major ? 0.5 : 0.28) * st.pxm;
        g.drawImage(a0.tick, -L / 2, -L * 0.14, L, L * 0.28);
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
      g.restore();
    }
    if (show(st, "head") && p < 1) {
      const a = -Math.PI / 2 + p * Math.PI * 2;
      const hx = st.cx + Math.cos(a) * (SLAM_R - 0.07) * st.pxm;
      const hy = st.cy + Math.sin(a) * (SLAM_R - 0.07) * st.pxm;
      sprite(g, art.poolRed, hx, hy, 2.0, st.pxm, 0, 0.5 * al, true);
      sprite(g, art.headHot, hx, hy, 0.55, st.pxm, 0, al, true);
    }
    if (show(st, "sparks")) {
      countSprite(true); // one particle layer
      const n = Math.round((30 + p * 70) * (st.low ? 0.5 : 1));
      const span = (SLAM_R - BODY_R) * 0.55;
      const clock = t + 4;
      g.save();
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) {
        const life = (clock / (1 + sh(i, 3) * 1.5) + sh(i, 4)) % 1;
        const a = sh(i, 1) * Math.PI * 2 + clock * 0.15 * (sh(i, 2) - 0.5);
        const d = SLAM_R - life * span;
        g.globalAlpha = Math.sin(life * Math.PI) * (0.45 + p * 0.55) * al;
        const L = (0.18 + sh(i, 6) * 0.22) * st.pxm;
        g.translate(st.cx + Math.cos(a) * d * st.pxm, st.cy + Math.sin(a) * d * st.pxm);
        g.rotate(a + Math.PI); // pointing inward, the way it drifts
        g.drawImage(art.streak, -L, -L * 0.1, L, L * 0.2);
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
      g.restore();
    }
  },
  textures: () => [
    { name: "rim segment ×8", canvas: sdA!.rim.tex, note: "ADD, 45° piece" },
    { name: "lit tick", canvas: sdA!.tick, note: "ADD" },
    { name: "head", canvas: shared!.headHot, note: "ADD 0.55 m" },
    { name: "light pool", canvas: shared!.poolRed, note: "ADD 2 m / 9.5 m flash" },
    { name: "spark streak", canvas: shared!.streak, note: "ADD" },
    ...shared!.dust.map((c, i) => ({ name: `dust ${i + 1}`, canvas: c })),
    ...shared!.bits.map((c, i) => ({ name: `bit ${i + 1}`, canvas: c })),
    { name: "ground damage, relit", canvas: gdRelit(), note: "9 m (GD-A)" },
  ],
  parts: [
    { id: "rim", label: "Rim light" },
    { id: "ticks", label: "Lit ticks" },
    { id: "head", label: "Head + pool" },
    { id: "sparks", label: "Spark streaks" },
    { id: "flash", label: "Release flare" },
    { id: "dust", label: "Dust" },
    { id: "debris", label: "Debris" },
    { id: "mark", label: "Cracks (mark)" },
  ],
  frames: sdNow.frames,
};

let sdB: { rim: Seg; cracks: { crack: Seg; glow: Seg }[]; ang: number[] } | null = null;
const sdTakeB: Look = {
  code: "SD-B",
  title: "The ground splits toward you",
  note: "A jagged red boundary of light at 4.5 m from the first frame. Instead of ticks, 11 cracks run out from the body and reach the rim exactly on the hit, red light seeping out of them, dust lifting off the rim faster and faster. The hot head still runs round the rim as the clock.",
  async bake() {
    boot();
    await sharedArt();
    const cracks: { crack: Seg; glow: Seg }[] = [];
    const ang: number[] = [];
    for (let i = 0; i < 11; i++) {
      cracks.push(fissure(SLAM_R - BODY_R - 0.05, 0.9, 40, 500 + i * 13));
      ang.push((i / 11) * Math.PI * 2 + (sh(i, 11) - 0.5) * 0.45);
    }
    sdB = { rim: ringSegment(SLAM_R, { inM: 0.55, outM: 0.3, core: 0.06, jag: 0.12, pxm: 40, seed: 23, bloom: "255,38,24" }), cracks, ang };
    gdRelit();
    await idle();
  },
  draw(g, t, st) {
    const art = shared!;
    const b = sdB!;
    const p = slamP(t);
    const al = slamA(t);
    const rel = t >= SLAM_T ? 1 - ramp(t, SLAM_T, SLAM_T + 0.15) : 0;
    if (t >= SLAM_T && show(st, "mark")) sprite(g, gdRelit(), st.cx, st.cy, CRACK_SIDE_M, st.pxm, 0.6, ramp(t, SLAM_T, SLAM_T + 0.05) * 0.95);
    if (show(st, "dust")) dustRing(g, st, art, 0, 0, t - SLAM_T - 0.03, 18, BODY_R + 0.3, SLAM_R + 1.0, 1.4, 0.65, 5, true);
    if (show(st, "debris")) debris(g, st, art, 0, 0, t - SLAM_T, 12, 3.4, 30);
    if (t >= SLAM_T && st.only === null) boss(g, st, slamPose(t), 0); // the mark and dust lie under the body
    if (al <= 0) return;
    // cracks: from the body's edge out to the rim, all arriving on the hit
    for (let i = 0; i < b.cracks.length; i++) {
      const c = b.cracks[i] as { crack: Seg; glow: Seg };
      const a = b.ang[i] as number;
      const frac = Math.min(1, p * (1 + 0.3 * sh(i, 12)));
      const cx = st.cx + Math.cos(a) * (BODY_R + 0.05) * st.pxm;
      const cy = st.cy + Math.sin(a) * (BODY_R + 0.05) * st.pxm;
      if (show(st, "cracks")) blitSegCrop(g, c.crack, cx, cy, a, st.pxm, al, false, frac);
      if (show(st, "seep")) blitSegCrop(g, c.glow, cx, cy, a, st.pxm, al * (0.35 + 0.65 * p) + rel * 0.5, true, frac);
    }
    if (show(st, "rim")) drawRing(g, b.rim, st.cx, st.cy, st.pxm, al * (0.6 + 0.4 * p) + rel * 0.5);
    if (show(st, "lift")) {
      // dust lifting off the rim, more and faster toward the hit (matter, normal blend)
      const n = Math.round((4 + 14 * p) * (st.low ? 0.5 : 1));
      for (let i = 0; i < n; i++) {
        const per = 0.9 - 0.4 * p;
        const life = (t / per + sh(i, 21)) % 1;
        const a = sh(i, 22) * Math.PI * 2;
        const d = SLAM_R - 0.1 + life * 0.5;
        sprite(g, art.dust[i % 3] as HTMLCanvasElement, X(st, Math.cos(a) * d), Y(st, Math.sin(a) * d), 0.5 + life * 0.6, st.pxm, a, Math.sin(life * Math.PI) * 0.4 * al);
      }
    }
    if (show(st, "head") && p < 1) {
      const a = -Math.PI / 2 + p * Math.PI * 2;
      const hx = st.cx + Math.cos(a) * SLAM_R * st.pxm;
      const hy = st.cy + Math.sin(a) * SLAM_R * st.pxm;
      sprite(g, art.poolRed, hx, hy, 1.6, st.pxm, 0, 0.45 * al, true);
      sprite(g, art.headHot, hx, hy, 0.5, st.pxm, 0, al, true);
    }
  },
  textures: () => [
    { name: "jagged rim ×8", canvas: sdB!.rim.tex, note: "ADD" },
    ...sdB!.cracks.slice(0, 3).flatMap((c, i) => [
      { name: `crack ${i + 1} (of 11)`, canvas: c.crack.tex, note: "normal, cropped by progress" },
      { name: `seep ${i + 1} (of 11)`, canvas: c.glow.tex, note: "ADD, cropped by progress" },
    ]),
    { name: "head", canvas: shared!.headHot, note: "ADD" },
    ...shared!.dustDark.map((c, i) => ({ name: `dust ${i + 1}`, canvas: c })),
    { name: "ground damage, relit", canvas: gdRelit(), note: "9 m (GD-A)" },
  ],
  parts: [
    { id: "rim", label: "Red boundary" },
    { id: "cracks", label: "Cracks" },
    { id: "seep", label: "Light seeping" },
    { id: "lift", label: "Dust lifting" },
    { id: "head", label: "Head" },
    { id: "dust", label: "Hit dust" },
    { id: "debris", label: "Debris" },
    { id: "mark", label: "Cracks (mark)" },
  ],
  frames: sdNow.frames,
};

/* ======================================================================================
 * TH: the throw (target ring, chunk in flight, crater)
 * ====================================================================================== */
const TB = -5; // boss x
const TT = 4; // target x (9 m: throw.minM 8)
const THROW_LEN = LIFT_S + FLIGHT_S;
const thP = (t: number): number => clamp01(t / THROW_LEN);
const thA = (t: number): number => (t <= THROW_LEN ? 1 : Math.max(0, 1 - (t - THROW_LEN) / FADE));
function chunkAt(t: number): { on: boolean; x: number; h: number; f: number } {
  if (t < LIFT_S || t > THROW_LEN) return { on: false, x: 0, h: 0, f: 0 };
  const f = (t - LIFT_S) / FLIGHT_S;
  return { on: true, f, x: TB + (TT - TB) * f, h: 4 * CHUNK_ARC_M * f * (1 - f) };
}
const thNow: Look = {
  code: "now",
  title: "Hatched ring, white closing ring, chunk, crater",
  note: "Today: a 6 m hatched red disc at the landing spot, a white ring shrinking to the impact, the chunk flying on a 3 m arc (lifted and scaled), then the crater decal and a grey dust ring.",
  async bake() {
    boot();
  },
  draw(g, t, st) {
    const p = thP(t);
    const al = thA(t);
    if (t >= THROW_LEN && show(st, "mark")) sprite(g, fc("boss_fx", "boss_decal_crater_a"), X(st, TT), st.cy, CRATER_M, st.pxm, 0.4, 1);
    if (al > 0) {
      const side = (2 * THROW_R * (BOSS_TELE_RADIUS_PX + 4)) / BOSS_TELE_RADIUS_PX;
      if (show(st, "ring")) sprite(g, whole("boss_tele_ring"), X(st, TT), st.cy, side, st.pxm, 0, al);
      const ir = THROW_R * (1 - p);
      if (show(st, "inner") && ir > 0.02) {
        countSprite();
        circle(g, st, TT, 0, ir, 0.12, "#ffffff", 0.9 * al);
      }
    }
    const ch = chunkAt(t);
    if (ch.on && show(st, "chunk")) sprite(g, fc("boss_fx", "boss_chunk_road_a"), X(st, ch.x), Y(st, -ch.h * 0.35), CHUNK_M * (1 + ch.h / 6), st.pxm, ch.f * 5);
    const d = t - THROW_LEN;
    if (d >= 0 && d < 0.4 && show(st, "dust")) {
      countSprite();
      const k = d / 0.4;
      circle(g, st, TT, 0, 0.5 + (THROW_R - 0.5) * k, 0.18, `rgb(${PUFF})`, 0.8 * (1 - k));
    }
  },
  textures: () => [
    { name: "boss_tele_ring", canvas: whole("boss_tele_ring"), note: "normal, 6.1 m" },
    { name: "boss_chunk_road_a", canvas: fc("boss_fx", "boss_chunk_road_a"), note: "1.3 m" },
    { name: "boss_chunk_rubble_a", canvas: fc("boss_fx", "boss_chunk_rubble_a") },
    { name: "boss_chunk_car_a", canvas: fc("boss_fx", "boss_chunk_car_a") },
    { name: "boss_decal_crater_a", canvas: fc("boss_fx", "boss_decal_crater_a"), note: "3.2 m" },
  ],
  parts: [
    { id: "ring", label: "Hatched ring" },
    { id: "inner", label: "White ring" },
    { id: "chunk", label: "Chunk" },
    { id: "dust", label: "Dust ring" },
    { id: "mark", label: "Crater" },
  ],
  frames: [
    { label: "lift", t: 0.5, when: "throw pose, ring ¼ closed" },
    { label: "release", t: 1.0, when: "chunk leaves the hands" },
    { label: "top", t: 1.4, when: "chunk at 3 m" },
    { label: "impact", t: 1.8, when: "crater, dust ring" },
    { label: "settle", t: 2.1, when: "ring gone" },
  ],
};

let thArt: { rim: Seg; inner: Seg; chunk: HTMLCanvasElement[]; crater: HTMLCanvasElement; craterB: HTMLCanvasElement; rimB: Seg } | null = null;
async function thBake(): Promise<void> {
  boot();
  await sharedArt();
  if (thArt) return;
  thArt = {
    rim: ringSegment(THROW_R, { inM: 0.9, outM: 0.3, core: 0.06, pxm: 44, seed: 31 }),
    rimB: ringSegment(THROW_R, { inM: 0.45, outM: 0.25, core: 0.05, jag: 0.1, pxm: 44, seed: 37, bloom: "255,38,24" }),
    inner: ringSegment(1, { inM: 0.06, outM: 0.06, core: 0.035, pxm: 160, seed: 33, hot: "255,255,255", bloom: "255,236,226" }),
    chunk: [0, 1, 2].map((k) => chunkTex(k, 112)),
    crater: craterTex(160, 0.6, 61),
    craterB: craterTex(176, 1.4, 67),
  };
  await idle();
}
function thChunk(g: CanvasRenderingContext2D, st: Stage, t: number, shadowClock: boolean): void {
  const art = shared!;
  const ch = chunkAt(t);
  if (!ch.on) return;
  // its shadow on the road: down-right of it (the light is upper left), softer and bigger the higher it is
  if (show(st, "shadow")) {
    if (shadowClock) {
      const ir = THROW_R * (1 - thP(t));
      const r = 0.65 + 0.51 * ir;
      const sharp = ch.f;
      sprite(g, art.shadowSoft, X(st, TT), st.cy, r * 2.4, st.pxm, 0, (0.25 + 0.45 * sharp) * (1 - sharp));
      sprite(g, art.shadow, X(st, TT), st.cy, r * 2, st.pxm, 0, 0.2 + 0.5 * sharp);
    } else sprite(g, art.shadow, X(st, ch.x + ch.h * 0.22), Y(st, ch.h * 0.28), CHUNK_M * (1 + ch.h * 0.12), st.pxm, 0, 0.55 - ch.h * 0.06);
  }
  if (show(st, "chunk")) sprite(g, thArt!.chunk[0] as HTMLCanvasElement, X(st, ch.x), Y(st, -ch.h * 0.35), CHUNK_M * (1 + ch.h / 6), st.pxm, ch.f * 5);
}
const thTakeA: Look = {
  code: "TH-A",
  title: "A ring of light, a real chunk",
  note: "The landing zone as red light on the asphalt (the hatching kept faint for the zone), the closing ring as a white line of light, the chunk drawn as a real slab of road, relit, with its shadow on the ground. On the impact the ring flares, debris hops out, the dust follows and the relit crater stays.",
  bake: thBake,
  draw(g, t, st) {
    const art = shared!;
    const p = thP(t);
    const al = thA(t);
    const rel = t >= THROW_LEN ? 1 - ramp(t, THROW_LEN, THROW_LEN + 0.15) : 0;
    if (t >= THROW_LEN && show(st, "mark")) sprite(g, thArt!.crater, X(st, TT), st.cy, CRATER_M, st.pxm, 0.4, ramp(t, THROW_LEN, THROW_LEN + 0.04));
    if (show(st, "dust")) dustRing(g, st, art, TT, 0, t - THROW_LEN - 0.03, 12, 0.6, THROW_R + 0.4, 1.0, 0.6, 9);
    if (show(st, "debris")) debris(g, st, art, TT, 0, t - THROW_LEN, 9, 2.4, 40);
    if (al > 0) {
      const side = (2 * THROW_R * (BOSS_TELE_RADIUS_PX + 4)) / BOSS_TELE_RADIUS_PX;
      if (show(st, "hatch")) sprite(g, whole("boss_tele_ring"), X(st, TT), st.cy, side, st.pxm, 0, al * 0.45);
      if (show(st, "rim")) drawRing(g, thArt!.rim, X(st, TT), st.cy, st.pxm, al * (0.5 + 0.5 * p) + rel * 0.6);
      const ir = THROW_R * (1 - p);
      if (show(st, "inner") && ir > 0.05) drawRing(g, thArt!.inner, X(st, TT), st.cy, st.pxm, 0.9 * al, true, ir);
    }
    thChunk(g, st, t, false);
  },
  textures: () => [
    { name: "rim segment ×8", canvas: thArt!.rim.tex, note: "ADD" },
    { name: "white ring segment ×8", canvas: thArt!.inner.tex, note: "ADD, scaled to the radius" },
    { name: "hatched ring (today's)", canvas: whole("boss_tele_ring"), note: "normal, α 0.45" },
    ...thArt!.chunk.map((c, i) => ({ name: ["road chunk", "rubble chunk", "car panel"][i] as string, canvas: c, note: "relit" })),
    { name: "shadow", canvas: shared!.shadow },
    { name: "crater, relit", canvas: thArt!.crater, note: "3.2 m" },
    ...shared!.dust.map((c, i) => ({ name: `dust ${i + 1}`, canvas: c })),
  ],
  parts: [
    { id: "hatch", label: "Hatching" },
    { id: "rim", label: "Rim light" },
    { id: "inner", label: "Closing ring" },
    { id: "chunk", label: "Chunk" },
    { id: "shadow", label: "Chunk shadow" },
    { id: "debris", label: "Debris" },
    { id: "dust", label: "Dust" },
    { id: "mark", label: "Crater" },
  ],
  frames: thNow.frames,
};
const thTakeB: Look = {
  code: "TH-B",
  title: "Its shadow closes in",
  note: "A jagged red boundary from the start. The white ring closes during the lift; once the chunk is thrown, its shadow takes over the clock: a wide soft shadow on the landing spot that shrinks and darkens until the chunk lands in it. The crater heaves up slabs; thicker dust settles after.",
  bake: thBake,
  draw(g, t, st) {
    const art = shared!;
    const p = thP(t);
    const al = thA(t);
    const rel = t >= THROW_LEN ? 1 - ramp(t, THROW_LEN, THROW_LEN + 0.15) : 0;
    if (t >= THROW_LEN && show(st, "mark")) sprite(g, thArt!.craterB, X(st, TT), st.cy, CRATER_M * 1.1, st.pxm, 0.4, ramp(t, THROW_LEN, THROW_LEN + 0.04));
    if (show(st, "dust")) dustRing(g, st, art, TT, 0, t - THROW_LEN - 0.03, 16, 0.6, THROW_R + 0.9, 1.4, 0.7, 13, true);
    if (show(st, "debris")) debris(g, st, art, TT, 0, t - THROW_LEN, 12, 2.8, 50);
    if (al > 0) {
      if (show(st, "rim")) drawRing(g, thArt!.rimB, X(st, TT), st.cy, st.pxm, al * (0.65 + 0.35 * p) + rel * 0.5);
      const ir = THROW_R * (1 - p);
      const ringFade = 1 - ramp(t, LIFT_S, LIFT_S + 0.2);
      if (show(st, "inner") && ir > 0.05) drawRing(g, thArt!.inner, X(st, TT), st.cy, st.pxm, 0.9 * al * ringFade, true, ir);
    }
    thChunk(g, st, t, true);
  },
  textures: () => [
    { name: "jagged rim ×8", canvas: thArt!.rimB.tex, note: "ADD" },
    { name: "white ring segment ×8", canvas: thArt!.inner.tex, note: "ADD (lift only)" },
    { name: "road chunk", canvas: thArt!.chunk[0] as HTMLCanvasElement, note: "relit" },
    { name: "shadow, sharp", canvas: shared!.shadow },
    { name: "shadow, soft", canvas: shared!.shadowSoft },
    { name: "crater, heaved", canvas: thArt!.craterB, note: "3.5 m" },
    ...shared!.dustDark.map((c, i) => ({ name: `dust ${i + 1}`, canvas: c })),
  ],
  parts: [
    { id: "rim", label: "Red boundary" },
    { id: "inner", label: "Closing ring" },
    { id: "shadow", label: "Shadow clock" },
    { id: "chunk", label: "Chunk" },
    { id: "debris", label: "Debris" },
    { id: "dust", label: "Dust" },
    { id: "mark", label: "Crater" },
  ],
  frames: thNow.frames,
};

/* ======================================================================================
 * CL: the charge lane, CR: the CRASH mark
 * ====================================================================================== */
interface Charge {
  bx: number; // boss start x
  len: number; // sweep length (m)
  stop: number; // seconds at the stop
  crash: boolean;
}
const CL_C: Charge = { bx: -7, len: 10, stop: CHARGE_T + 10 / RUSH_V, crash: false };
const CR_C: Charge = { bx: -6, len: 6, stop: CHARGE_T + 6 / RUSH_V, crash: true };
const laneX0 = (c: Charge): number => c.bx - BODY_R;
const laneLen = (c: Charge): number => c.len + 2 * BODY_R;
const lnP = (t: number): number => clamp01(t / CHARGE_T);
const lnA = (c: Charge, t: number): number => (t <= c.stop ? 1 : Math.max(0, 1 - (t - c.stop) / FADE));
const bossX = (c: Charge, t: number): number => (t < CHARGE_T ? c.bx : c.bx + Math.min(c.len, (t - CHARGE_T) * RUSH_V));
function chargePose(c: Charge, t: number): string {
  if (t < CHARGE_T) return "charge_a";
  if (t < c.stop) return "rush_a";
  if (c.crash && t < c.stop + STUN_S) return "stun_a";
  return "walk_a";
}

function laneNow(g: CanvasRenderingContext2D, st: Stage, c: Charge, t: number): void {
  const al = lnA(c, t);
  const p = lnP(t);
  if (al <= 0) return;
  const L = laneLen(c);
  if (show(st, "strip")) {
    countSprite();
    const strip = whole("boss_tele_lane");
    const cropW = Math.min(strip.width, Math.round(L * BOSS_LANE_PX_PER_M));
    g.save();
    g.globalAlpha = al;
    g.drawImage(strip, 0, 0, cropW, strip.height, X(st, laneX0(c)), st.cy - (strip.height / BOSS_LANE_PX_PER_M / 2) * st.pxm, (cropW / BOSS_LANE_PX_PER_M) * st.pxm, (strip.height / BOSS_LANE_PX_PER_M) * st.pxm);
    g.restore();
  }
  if (show(st, "fill") && p > 0) {
    countSprite();
    g.save();
    g.globalAlpha = 0.38 * al;
    g.fillStyle = "#ff2828";
    g.fillRect(X(st, laneX0(c)), Y(st, -LANE_W / 2), L * p * st.pxm, LANE_W * st.pxm);
    g.restore();
  }
}

export let clArt: { edge: Seg; edgeB: Seg; front: HTMLCanvasElement; chev: HTMLCanvasElement; long: { crack: Seg; glow: Seg }[]; crashBar: HTMLCanvasElement; crashWord: HTMLCanvasElement; crashWordB: HTMLCanvasElement; wall: HTMLCanvasElement; wallCrack: HTMLCanvasElement } | null = null;
/** A straight light strip along +x (`lenM` × `wM`): a hot core line at its centre, red bloom both sides. */
function edgeStrip(lenM: number, wM: number, pxm: number, seed: number, jag = 0): Seg {
  const W = Math.ceil(lenM * pxm);
  const H = Math.ceil(wM * pxm);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const xm = x / pxm;
      const off = jag ? (fbm(xm * 1.4, 2, seed) - 0.5) * 2 * jag : 0;
      const d = (y + 0.5) / pxm - wM / 2 - off;
      const core = Math.exp(-Math.pow(d / 0.035, 2));
      const ag = 0.72 + 0.28 * fbm(xm * 6, y / pxm * 6, seed + 4);
      const bloom = Math.exp(-Math.pow(d / (wM * 0.22), 2)) * ag;
      const a = clamp01(bloom * 0.7 + core);
      const k = core / (core + bloom * 0.7 + 1e-6);
      const j = (y * W + x) * 4;
      img.data[j] = 255;
      img.data[j + 1] = Math.round(48 + 190 * k);
      img.data[j + 2] = Math.round(32 + 190 * k);
      img.data[j + 3] = Math.round(255 * a);
    }
  g.putImageData(img, 0, 0);
  return { tex: c, x0: 0, y0: -wM / 2, w: W / pxm, h: H / pxm };
}
function wordTex(word: string, hM: number, pxm: number, col: string, glow: string, rough: boolean): HTMLCanvasElement {
  const fpx = Math.round(hM * pxm);
  const c = make(fpx * 4.2, fpx * 1.6);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.font = `bold ${fpx}px Oswald, Impact, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.filter = `blur(${fpx * 0.18}px)`;
  g.fillStyle = glow;
  g.fillText(word, c.width / 2, c.height / 2);
  g.filter = "none";
  g.fillStyle = col;
  g.fillText(word, c.width / 2, c.height / 2);
  if (rough) {
    // stamped on the road: the grain eats into the light
    const img = g.getImageData(0, 0, c.width, c.height);
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const j = (y * c.width + x) * 4;
        const n = fbm(x / 5, y / 5, 71, 4);
        img.data[j + 3] = Math.round((img.data[j + 3] as number) * clamp01(0.35 + n * 0.9));
      }
    g.putImageData(img, 0, 0);
  }
  return c;
}
export async function clBake(): Promise<void> {
  boot();
  await sharedArt();
  if (clArt) return;
  const front = make(32, 160);
  const fg = front.getContext("2d")!;
  const gr = fg.createLinearGradient(0, 0, 32, 0);
  gr.addColorStop(0, "rgba(255,40,30,0)");
  gr.addColorStop(0.7, "rgba(255,70,50,0.55)");
  gr.addColorStop(0.9, "rgba(255,210,190,0.9)");
  gr.addColorStop(1, "rgba(255,60,40,0)");
  fg.fillStyle = gr;
  fg.fillRect(0, 0, 32, 160);
  const chev = make(48, 64);
  const cg = chev.getContext("2d")!;
  cg.filter = "blur(4px)";
  for (const [w, s] of [
    [10, "rgba(255,60,40,0.8)"],
    [4, "rgba(255,236,226,1)"],
  ] as const) {
    cg.strokeStyle = s;
    cg.lineWidth = w;
    cg.lineCap = "round";
    cg.lineJoin = "round";
    cg.beginPath();
    cg.moveTo(12, 10);
    cg.lineTo(34, 32);
    cg.lineTo(12, 54);
    cg.stroke();
    cg.filter = "none";
  }
  const bar = make(40, 240);
  const bg = bar.getContext("2d")!;
  const bgr = bg.createLinearGradient(0, 0, 40, 0);
  bgr.addColorStop(0, "rgba(255,150,30,0)");
  bgr.addColorStop(0.5, "rgba(255,226,160,1)");
  bgr.addColorStop(1, "rgba(255,150,30,0)");
  bg.fillStyle = bgr;
  bg.fillRect(0, 6, 40, 228);
  const wall = make(48, 260);
  const wg = wall.getContext("2d", { willReadFrequently: true })!;
  wg.fillStyle = "#7d7a73";
  wg.fillRect(2, 2, 44, 256);
  const wi = wg.getImageData(0, 0, 48, 260);
  for (let y = 0; y < 260; y++)
    for (let x = 0; x < 48; x++) {
      const j = (y * 48 + x) * 4;
      if (!(wi.data[j + 3] as number)) continue;
      const n = 1 + (fbm(x / 4, y / 4, 81, 4) - 0.5) * 0.35 - (y % 64 < 2 ? 0.3 : 0);
      wi.data[j] = (wi.data[j] as number) * n;
      wi.data[j + 1] = (wi.data[j + 1] as number) * n;
      wi.data[j + 2] = (wi.data[j + 2] as number) * n;
    }
  wg.putImageData(wi, 0, 0);
  const wallCrack = make(48, 260);
  const kg = wallCrack.getContext("2d")!;
  const R = rng(9);
  kg.strokeStyle = "rgba(16,14,12,0.9)";
  kg.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    kg.lineWidth = 2.4 - i * 0.2;
    kg.beginPath();
    let x = 4;
    let y = 130 + (R() - 0.5) * 10;
    kg.moveTo(x, y);
    const dy = (R() - 0.5) * 9;
    for (let k = 0; k < 8; k++) {
      x += 5;
      y += dy + (R() - 0.5) * 6;
      kg.lineTo(x, y);
    }
    kg.stroke();
  }
  clArt = {
    edge: edgeStrip(14, 0.9, 24, 51),
    edgeB: edgeStrip(14, 0.8, 24, 53, 0.08),
    front,
    chev,
    long: [0, 1, 2].map((i) => fissure(14, 0.8, 24, 700 + i * 31)),
    crashBar: bar,
    crashWord: wordTex("CRASH", 1.07, 48, "rgba(255,214,120,1)", "rgba(255,150,30,0.95)", false),
    crashWordB: wordTex("CRASH", 1.07, 48, "rgba(255,200,90,1)", "rgba(255,140,20,0.9)", true),
    wall: relief(wall, { fromAlpha: 1.2, fromLum: 0.4, blur: 2, depth: 8 }),
    wallCrack,
  };
  await idle();
}
/** Take A lane: light edges, a faint hatching, the fill as a red sweep with a bright front, light chevrons. */
function laneA(g: CanvasRenderingContext2D, st: Stage, c: Charge, t: number): void {
  const a = clArt!;
  const al = lnA(c, t);
  const p = lnP(t);
  if (al <= 0) return;
  const L = laneLen(c);
  const x0 = X(st, laneX0(c));
  const rel = t >= CHARGE_T ? 1 - ramp(t, CHARGE_T, CHARGE_T + 0.15) : 0;
  if (show(st, "strip")) {
    countSprite();
    const strip = whole("boss_tele_lane");
    const cropW = Math.min(strip.width, Math.round(L * BOSS_LANE_PX_PER_M));
    g.save();
    g.globalAlpha = al * 0.4;
    g.drawImage(strip, 0, 0, cropW, strip.height, x0, st.cy - (strip.height / BOSS_LANE_PX_PER_M / 2) * st.pxm, (cropW / BOSS_LANE_PX_PER_M) * st.pxm, (strip.height / BOSS_LANE_PX_PER_M) * st.pxm);
    g.restore();
  }
  if (show(st, "fill") && p > 0) {
    countSprite();
    g.save();
    g.globalAlpha = 0.24 * al;
    g.fillStyle = "#ff2a20";
    g.fillRect(x0, Y(st, -LANE_W / 2), L * p * st.pxm, LANE_W * st.pxm);
    g.restore();
    if (t < CHARGE_T + 0.05) sprite(g, a.front, x0 + L * p * st.pxm - 0.25 * st.pxm, st.cy, 0.5, st.pxm, 0, al * 0.9, true, LANE_W);
  }
  if (show(st, "edges")) {
    for (const s of [-1, 1]) blitSegCrop(g, a.edge, x0, Y(st, (s * LANE_W) / 2), 0, st.pxm, al * (0.55 + 0.45 * p) + rel * 0.5, true, L / 14);
  }
  if (show(st, "chevrons")) {
    // white light chevrons every 2 m; a brightness wave runs forward along them (6 m/s), faster on the rush
    for (let x = 3; x < L - 1; x += 2) {
      const wave = Math.pow(0.5 + 0.5 * Math.cos(((x - t * 6) / 4) * Math.PI * 2), 3);
      sprite(g, a.chev, x0 + x * st.pxm, st.cy, 0.9, st.pxm, 0, al * (0.35 + 0.65 * wave) * (0.5 + 0.5 * p), true);
    }
  }
}
/** Take B lane: a jagged red boundary, cracks running down the lane with the fill, light seeping, dust lifting. */
function laneB(g: CanvasRenderingContext2D, st: Stage, c: Charge, t: number): void {
  const a = clArt!;
  const art = shared!;
  const al = lnA(c, t);
  const p = lnP(t);
  if (al <= 0) return;
  const L = laneLen(c);
  const x0 = X(st, laneX0(c));
  const rel = t >= CHARGE_T ? 1 - ramp(t, CHARGE_T, CHARGE_T + 0.15) : 0;
  if (show(st, "fill")) {
    countSprite();
    g.save();
    g.globalAlpha = 0.14 * al;
    g.fillStyle = "#ff2a20";
    g.fillRect(x0, Y(st, -LANE_W / 2), L * Math.max(0.15, p) * st.pxm, LANE_W * st.pxm);
    g.restore();
  }
  const ys = [-1.1, 0.15, 1.2];
  for (let i = 0; i < 3; i++) {
    const f = Math.min(1, p * (1 + 0.15 * i)) * (L / 14);
    const cr = a.long[i] as { crack: Seg; glow: Seg };
    if (show(st, "cracks")) blitSegCrop(g, cr.crack, x0, Y(st, ys[i] as number), 0, st.pxm, al, false, f);
    if (show(st, "seep")) blitSegCrop(g, cr.glow, x0, Y(st, ys[i] as number), 0, st.pxm, al * (0.35 + 0.65 * p) + rel * 0.6, true, f);
  }
  if (show(st, "edges")) for (const s of [-1, 1]) blitSegCrop(g, a.edgeB, x0, Y(st, (s * LANE_W) / 2), 0, st.pxm, al * (0.7 + 0.3 * p) + rel * 0.4, true, L / 14);
  if (show(st, "lift") && t < CHARGE_T) {
    const n = Math.round((3 + 9 * p) * (st.low ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const life = (t / 0.7 + sh(i, 31)) % 1;
      const along = sh(i, 32) * L * p;
      const y = (ys[i % 3] as number) + (sh(i, 33) - 0.5) * 0.4;
      sprite(g, art.dustDark[i % 2] as HTMLCanvasElement, x0 + along * st.pxm, Y(st, y), 0.5 + life * 0.6, st.pxm, i, Math.sin(life * Math.PI) * 0.4 * al);
    }
  }
}
/** The dust the rush kicks up behind the body (matter; each puff starts when the body passes). */
function rushTrail(g: CanvasRenderingContext2D, st: Stage, c: Charge, t: number, dark: boolean): void {
  if (!show(st, "trail")) return;
  const art = shared!;
  const n = Math.ceil(c.len / 1.1);
  for (let i = 0; i < (st.low ? Math.ceil(n / 2) : n); i++) {
    const x = c.bx - 1.2 + i * 1.1 * (st.low ? 2 : 1);
    const born = CHARGE_T + (x + 1.2 - c.bx) / RUSH_V;
    const age = t - born;
    if (age < 0 || age > 1.2) continue;
    for (const s of [-1, 1]) {
      const k = age / 1.2;
      sprite(g, (dark ? art.dustDark : art.dust)[i % 2] as HTMLCanvasElement, X(st, x - 0.4 - k * 0.6), Y(st, s * (1.1 + k * 0.7)), 0.8 + k * 1.2, st.pxm, i + s, 0.45 * (1 - k));
    }
  }
}

const clNow: Look = {
  code: "now",
  title: "Hatched lane, red fill, arrows",
  note: "Today: the 14 m × 4.8 m hatched strip with red edges, dashed white inner edges and white arrows, a red fill growing from the body's back over the 1 s warning, full during the rush, fading 0.3 s after the stop.",
  async bake() {
    boot();
  },
  draw(g, t, st) {
    laneNow(g, st, CL_C, t);
    if (st.only === null) boss(g, st, chargePose(CL_C, t), bossX(CL_C, t)); // bodyTop: above its own lane in the light
  },
  textures: () => [{ name: "boss_tele_lane", canvas: whole("boss_tele_lane"), note: "normal, 14 × 4.8 m, cropped" }],
  parts: [
    { id: "strip", label: "Strip" },
    { id: "fill", label: "Fill" },
  ],
  frames: [
    { label: "warning ½", t: 0.5, when: "charge pose, fill ½" },
    { label: "full", t: 1.0, when: "fill reaches the end: the rush starts" },
    { label: "rush", t: 1.4, when: "rush pose, lane full" },
    { label: "stop", t: 1.84, when: "at the stop" },
    { label: "fade", t: 2.0, when: "fading" },
  ],
};
const clTakeA: Look = {
  code: "CL-A",
  title: "Lane of light",
  note: "The lane's edges as two lines of red light on the asphalt, the hatching kept faint, the fill as a red light sweeping forward with a bright front that reaches the end on the rush, the arrows as white light chevrons with a wave running forward. On the rush start the edges flare; the rush kicks dust behind the body.",
  bake: clBake,
  draw(g, t, st) {
    laneA(g, st, CL_C, t);
    rushTrail(g, st, CL_C, t, false);
    if (st.only === null) boss(g, st, chargePose(CL_C, t), bossX(CL_C, t));
  },
  textures: () => [
    { name: "edge light ×2", canvas: clArt!.edge.tex, note: "ADD 14 × 0.9 m, cropped to the lane" },
    { name: "sweep front", canvas: clArt!.front, note: "ADD 0.5 × 4.8 m" },
    { name: "chevron", canvas: clArt!.chev, note: "ADD 0.9 m, ≤ 6" },
    { name: "hatched strip (today's)", canvas: whole("boss_tele_lane"), note: "normal, α 0.4" },
    ...shared!.dust.slice(0, 2).map((c, i) => ({ name: `dust ${i + 1}`, canvas: c })),
  ],
  parts: [
    { id: "strip", label: "Hatching" },
    { id: "fill", label: "Sweep" },
    { id: "edges", label: "Edge light" },
    { id: "chevrons", label: "Chevrons" },
    { id: "trail", label: "Rush dust" },
  ],
  frames: clNow.frames,
};
const clTakeB: Look = {
  code: "CL-B",
  title: "The road cracks down the lane",
  note: "Jagged red light edges from the first frame; three cracks race down the lane with the fill, red light seeping out of them, dust lifting off them. On the rush start the cracks flare, the rush tears dust up behind the body.",
  bake: clBake,
  draw(g, t, st) {
    laneB(g, st, CL_C, t);
    rushTrail(g, st, CL_C, t, true);
    if (st.only === null) boss(g, st, chargePose(CL_C, t), bossX(CL_C, t));
  },
  textures: () => [
    { name: "jagged edge ×2", canvas: clArt!.edgeB.tex, note: "ADD 14 × 0.8 m" },
    ...clArt!.long.flatMap((c, i) => [
      { name: `crack ${i + 1}`, canvas: c.crack.tex, note: "normal, cropped" },
      { name: `seep ${i + 1}`, canvas: c.glow.tex, note: "ADD 14 × 0.8 m, cropped" },
    ]),
    ...shared!.dustDark.map((c, i) => ({ name: `dust ${i + 1}`, canvas: c })),
  ],
  parts: [
    { id: "fill", label: "Faint fill" },
    { id: "edges", label: "Red boundary" },
    { id: "cracks", label: "Cracks" },
    { id: "seep", label: "Light seeping" },
    { id: "lift", label: "Dust lifting" },
    { id: "trail", label: "Rush dust" },
  ],
  frames: clNow.frames,
};

/* CR: the end of a charge into a wall */
const WALL_X = CR_C.bx + CR_C.len + BODY_R; // the body's front at the stop
export function crUnder(g: CanvasRenderingContext2D, t: number, st: Stage): void {
  if (!clArt) return;
  // a concrete wall across the lane end (1 m thick, 6.5 m long); the body is drawn by the looks (above the lane)
  g.drawImage(clArt.wall, X(st, WALL_X + 0.05), Y(st, -3.25), 1 * st.pxm, 6.5 * st.pxm);
}
const crNow: Look = {
  code: "now",
  title: "Amber CRASH bar",
  note: "Today: an amber bar across the lane end with the word CRASH (4.8 m mark), fading with the lane 0.3 s after the stop; a grey dust ring round the body; the stun pose for 2 s (the HUD bar flashes amber).",
  async bake() {
    await clBake();
  },
  draw(g, t, st) {
    laneNow(g, st, CR_C, t);
    const al = lnA(CR_C, t);
    if (show(st, "crash") && al > 0) sprite(g, fc("boss_fx", "boss_mark_crash_a"), X(st, WALL_X), st.cy, LANE_W, st.pxm, 0, al);
    if (st.only === null) boss(g, st, chargePose(CR_C, t), bossX(CR_C, t)); // bodyTop: covers the word, as in the game
    const d = t - CR_C.stop;
    if (d >= 0 && d < 0.5 && show(st, "dust")) {
      countSprite();
      const k = d / 0.5;
      circle(g, st, bossX(CR_C, t), 0, BODY_R + 1.5 * k, 0.18, `rgb(${PUFF})`, 0.8 * (1 - k));
    }
  },
  textures: () => [
    { name: "boss_mark_crash_a", canvas: fc("boss_fx", "boss_mark_crash_a"), note: "normal, 4.8 m" },
    { name: "boss_tele_lane", canvas: whole("boss_tele_lane") },
  ],
  parts: [
    { id: "strip", label: "Lane" },
    { id: "fill", label: "Fill" },
    { id: "crash", label: "CRASH mark" },
    { id: "dust", label: "Dust ring" },
  ],
  frames: [
    { label: "rush", t: 1.25, when: "rush pose" },
    { label: "crash", t: CR_C.stop, when: "stop: CRASH, dust ring, stun" },
    { label: "+0.15", t: CR_C.stop + 0.15, when: "release" },
    { label: "+0.3", t: CR_C.stop + 0.3, when: "the mark is gone" },
    { label: "stun", t: CR_C.stop + 1.5, when: "still stunned" },
  ],
};
const crTakeA: Look = {
  code: "CR-A",
  title: "Amber light on the wall",
  note: "The bar and the word as amber light at the wall (amber = your window), drawn above the body so the word is never hidden (today the body covers it), a flash of amber light on the hit, concrete bits and dust bursting off the wall, all in the same 0.15 s. The lane as CL-A. Same timing as today.",
  async bake() {
    await clBake();
  },
  draw(g, t, st) {
    const art = shared!;
    laneA(g, st, CR_C, t);
    rushTrail(g, st, CR_C, t, false);
    if (st.only === null) boss(g, st, chargePose(CR_C, t), bossX(CR_C, t));
    const al = lnA(CR_C, t);
    const d = t - CR_C.stop;
    const rel = d >= 0 ? 1 - ramp(d, 0, 0.15) : 0;
    if (show(st, "dust")) dustRing(g, st, art, WALL_X - 0.3, 0, d - 0.03, 12, 0.5, 2.6, 1.4, 0.65, 70);
    if (show(st, "debris")) debris(g, st, art, WALL_X - 0.2, 0, d, 10, 2.2, 80);
    if (show(st, "flash") && rel > 0) sprite(g, art.poolAmber, X(st, WALL_X - 0.4), st.cy, 5, st.pxm, 0, 0.7 * rel, true);
    if (show(st, "crash") && al > 0) {
      sprite(g, clArt!.crashBar, X(st, WALL_X - 0.1), st.cy, 0.55, st.pxm, 0, al, true, LANE_W * 0.96);
      sprite(g, clArt!.crashWord, X(st, WALL_X - 1.07), st.cy, 4.5, st.pxm, -Math.PI / 2, al, true);
    }
  },
  textures: () => [
    { name: "amber bar", canvas: clArt!.crashBar, note: "ADD 0.55 × 4.6 m" },
    { name: "CRASH word", canvas: clArt!.crashWord, note: "ADD 4.5 × 1.7 m" },
    { name: "amber flash", canvas: shared!.poolAmber, note: "ADD 5 m, 0.15 s" },
    { name: "wall (context)", canvas: clArt!.wall },
  ],
  parts: [
    { id: "strip", label: "Hatching" },
    { id: "fill", label: "Sweep" },
    { id: "edges", label: "Edge light" },
    { id: "chevrons", label: "Chevrons" },
    { id: "crash", label: "CRASH light" },
    { id: "flash", label: "Amber flash" },
    { id: "debris", label: "Concrete bits" },
    { id: "dust", label: "Dust" },
    { id: "trail", label: "Rush dust" },
  ],
  frames: crNow.frames,
};
const crTakeB: Look = {
  code: "CR-B",
  title: "The wall cracks, CRASH stamped on the road",
  note: "The wall splits where the shoulder hit (a crack decal on the wall, a mark that stays), a heavy dust cloud rolls off it and hangs through the stun, CRASH stamped in amber light into the road grain, above the body like CR-A. The lane as CL-B. Same timing as today.",
  async bake() {
    await clBake();
  },
  draw(g, t, st) {
    const art = shared!;
    laneB(g, st, CR_C, t);
    rushTrail(g, st, CR_C, t, true);
    if (st.only === null) boss(g, st, chargePose(CR_C, t), bossX(CR_C, t));
    const al = lnA(CR_C, t);
    const d = t - CR_C.stop;
    const rel = d >= 0 ? 1 - ramp(d, 0, 0.15) : 0;
    if (d >= 0 && show(st, "mark")) sprite(g, clArt!.wallCrack, X(st, WALL_X + 0.55), st.cy, 1, st.pxm, 0, 1, false, 6.5);
    if (show(st, "dust")) dustRing(g, st, art, WALL_X - 0.4, 0, d - 0.03, 16, 0.4, 3.0, 2.2, 0.7, 90, true);
    if (show(st, "debris")) debris(g, st, art, WALL_X - 0.2, 0, d, 12, 2.4, 95);
    if (show(st, "flash") && rel > 0) sprite(g, art.poolAmber, X(st, WALL_X - 0.4), st.cy, 4, st.pxm, 0, 0.5 * rel, true);
    if (show(st, "crash") && al > 0) {
      sprite(g, clArt!.crashBar, X(st, WALL_X - 0.1), st.cy, 0.45, st.pxm, 0, al * 0.85, true, LANE_W * 0.96);
      sprite(g, clArt!.crashWordB, X(st, WALL_X - 1.07), st.cy, 4.5, st.pxm, -Math.PI / 2, al, true);
    }
  },
  textures: () => [
    { name: "amber bar", canvas: clArt!.crashBar, note: "ADD" },
    { name: "CRASH stamped", canvas: clArt!.crashWordB, note: "ADD 4.5 × 1.7 m" },
    { name: "wall crack", canvas: clArt!.wallCrack, note: "normal, stays" },
    { name: "amber flash", canvas: shared!.poolAmber, note: "ADD 4 m, 0.15 s" },
  ],
  parts: [
    { id: "fill", label: "Faint fill" },
    { id: "edges", label: "Red boundary" },
    { id: "cracks", label: "Lane cracks" },
    { id: "seep", label: "Light seeping" },
    { id: "crash", label: "CRASH" },
    { id: "flash", label: "Amber flash" },
    { id: "mark", label: "Wall crack" },
    { id: "debris", label: "Concrete bits" },
    { id: "dust", label: "Dust" },
    { id: "trail", label: "Rush dust" },
  ],
  frames: crNow.frames,
};

/* ======================================================================================
 * P1: the warning display (target lock on the survivor + the DANGER panel and attack plate)
 * ====================================================================================== */
const P1_LEN = 2.4;
const SURV: [number, number] = [-3.6, 0.3];
export const lockP = (t: number): number => (t >= 0.6 && t <= 1.8 ? (t - 0.6) / 1.2 : 0);
export function lockGeom(t: number): { gap: number; len: number } {
  const lp = lockP(t);
  const lock = lp > 0 ? lp : 0.4 + 0.2 * Math.sin(t * 2);
  return { gap: LOCK_R * (1.25 - 0.35 * lock), len: LOCK_R * 0.55 };
}
export function p1Survivor(g: CanvasRenderingContext2D, t: number, st: Stage): void {
  const s = fc("atlas_characters", "survivor_assault_rifle_a");
  const w = 1.5 * st.pxm;
  const h = (w * s.height) / s.width;
  g.drawImage(s, X(st, SURV[0]) - w / 2, Y(st, SURV[1]) - h / 2, w, h);
}
/** Today's lock (BossView.drawLock), in metres: two passes of brackets, the turning tick ring, the hazard bar. */
function lockNow(g: CanvasRenderingContext2D, st: Stage, t: number, glow: boolean): void {
  const fl = hudFlicker(t);
  const x = X(st, SURV[0]);
  const y = Y(st, SURV[1]);
  const pm = st.pxm;
  const { gap, len } = lockGeom(t);
  countSprite();
  g.save();
  g.lineCap = "butt";
  if (glow) {
    g.shadowColor = "rgba(255,40,30,0.9)";
    g.shadowBlur = 0.12 * pm;
  }
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = (pass === 0 ? LOCK_LINE * 4 : LOCK_LINE) * pm;
    g.strokeStyle = "#ff3b30";
    g.globalAlpha = (pass === 0 ? 0.25 : 1) * fl;
    g.beginPath();
    for (let c = 0; c < 4; c++) {
      const sx = c & 1 ? 1 : -1;
      const sy = c & 2 ? 1 : -1;
      const cx = x + sx * gap * pm;
      const cy = y + sy * gap * pm;
      g.moveTo(cx, cy);
      g.lineTo(cx - sx * len * pm, cy);
      g.moveTo(cx, cy);
      g.lineTo(cx, cy - sy * len * pm);
    }
    g.stroke();
  }
  g.lineWidth = LOCK_LINE * pm;
  g.globalAlpha = 0.7 * fl;
  g.beginPath();
  for (let i = 0; i < 24; i++) {
    if (i % 6 === 0) continue;
    const a = (i / 24) * Math.PI * 2 + t * 0.8;
    g.moveTo(x + Math.cos(a) * LOCK_R * 0.95 * pm, y + Math.sin(a) * LOCK_R * 0.95 * pm);
    g.lineTo(x + Math.cos(a) * LOCK_R * 1.08 * pm, y + Math.sin(a) * LOCK_R * 1.08 * pm);
  }
  g.stroke();
  // the hazard bar
  const by = y + (gap + 0.08) * pm;
  const bh = 0.08;
  const step = 0.08;
  const off = (t * 0.4) % (step * 2);
  g.fillStyle = "#ff3b30";
  g.globalAlpha = fl;
  g.beginPath();
  const xm = SURV[0];
  for (let sx = xm - LOCK_R - step * 2 + off; sx < xm + LOCK_R; sx += step * 2) {
    const x0 = Math.max(xm - LOCK_R, sx);
    const x1 = Math.min(xm + LOCK_R, sx + step);
    if (x1 <= x0) continue;
    const tx0 = Math.min(xm + LOCK_R, x0 + bh);
    const tx1 = Math.min(xm + LOCK_R, x1 + bh);
    g.moveTo(X(st, x0), by + bh * pm);
    g.lineTo(X(st, x1), by + bh * pm);
    g.lineTo(X(st, tx1), by);
    g.lineTo(X(st, tx0), by);
    g.closePath();
  }
  g.fill();
  g.restore();
}
/** The screen part (BossHud): the DANGER panel at the right edge with chevrons, the attack plate inward of it. */
export function hudScreen(g: CanvasRenderingContext2D, st: Stage, t: number, plates: { danger: HTMLCanvasElement; slam: HTMLCanvasElement; tag: HTMLCanvasElement }): void {
  const s = st.pxm / LOCK_CSS; // card px per CSS px (47 CSS px per metre at the default zoom)
  const fl = hudFlicker(t);
  const pw = 144 * 0.75 * s;
  const ph = 64 * 0.75 * s;
  const x = st.w - 38 * s - pw / 2;
  const y = st.h * 0.4;
  if (show(st, "panel")) {
    countSprite();
    g.save();
    g.globalAlpha = fl;
    g.drawImage(plates.danger, x - pw / 2, y - ph / 2, pw, ph);
    g.restore();
    countSprite();
    g.save();
    g.strokeStyle = "#ff3b30";
    g.lineWidth = 3 * s;
    const edge = pw / 2 - 10 * s;
    for (let i = 0; i < 3; i++) {
      const ph2 = (t * 2 + i / 3) % 1;
      const d = edge + (4 + 6 + i * 9) * s;
      const cx = x + d;
      const a = 9 * s;
      g.globalAlpha = (0.3 + 0.7 * (1 - Math.abs(ph2 - 0.5) * 2)) * fl;
      g.beginPath();
      g.moveTo(cx - 4 * s, y + a);
      g.lineTo(cx + 4 * s, y);
      g.lineTo(cx - 4 * s, y - a);
      g.stroke();
    }
    g.restore();
  }
  if (show(st, "plate") && lockP(t) > 0) {
    const lw = 174 * 0.75 * s;
    const lh = 60 * 0.75 * s;
    countSprite();
    g.save();
    g.globalAlpha = hudFlicker(t + 0.3);
    g.drawImage(plates.slam, x - (pw + lw) / 2 - 4 * s - lw / 2, y - lh / 2, lw, lh);
    g.restore();
  }
  if (show(st, "tag")) {
    const { gap } = lockGeom(t);
    sprite(g, plates.tag, X(st, SURV[0]), Y(st, SURV[1] - gap - LOCK_R * 0.65), 88 / LOCK_CSS, st.pxm, 0, fl, false, 44 / LOCK_CSS);
  }
}
const nowPlates = (): { danger: HTMLCanvasElement; slam: HTMLCanvasElement; tag: HTMLCanvasElement } => ({ danger: fc("boss_hud", HUD_FRAMES.danger), slam: fc("boss_hud", HUD_FRAMES.slam), tag: fc("boss_hud", HUD_FRAMES.tag) });
export let p1Art: { plates: { danger: HTMLCanvasElement; slam: HTMLCanvasElement; tag: HTMLCanvasElement }; ring: HTMLCanvasElement; bracket: HTMLCanvasElement; bar: HTMLCanvasElement } | null = null;
export async function p1Bake(): Promise<void> {
  boot();
  await sharedArt();
  if (p1Art) return;
  const n = nowPlates();
  // the tick ring and brackets as light projected on the road (B)
  const ring = make(128, 128);
  const rg = ring.getContext("2d")!;
  rg.translate(64, 64);
  for (const [w, s, blur] of [
    [5, "rgba(255,40,30,0.55)", 3],
    [1.6, "rgba(255,200,190,0.95)", 0],
  ] as const) {
    rg.filter = blur ? `blur(${blur}px)` : "none";
    rg.strokeStyle = s;
    rg.lineWidth = w;
    rg.beginPath();
    for (let i = 0; i < 24; i++) {
      if (i % 6 === 0) continue;
      const a = (i / 24) * Math.PI * 2;
      rg.moveTo(Math.cos(a) * 50, Math.sin(a) * 50);
      rg.lineTo(Math.cos(a) * 57, Math.sin(a) * 57);
    }
    rg.stroke();
  }
  rg.filter = "none";
  const bracket = make(48, 48);
  const bg = bracket.getContext("2d")!;
  for (const [w, s, blur] of [
    [8, "rgba(255,40,30,0.6)", 4],
    [2.4, "rgba(255,210,200,1)", 0],
  ] as const) {
    bg.filter = blur ? `blur(${blur}px)` : "none";
    bg.strokeStyle = s;
    bg.lineWidth = w;
    bg.beginPath();
    bg.moveTo(40, 40);
    bg.lineTo(14, 40);
    bg.moveTo(40, 40);
    bg.lineTo(40, 14);
    bg.stroke();
  }
  const bar = make(96, 16);
  const hg = bar.getContext("2d")!;
  hg.filter = "blur(1.5px)";
  hg.fillStyle = "rgba(255,60,40,0.9)";
  for (let x = -16; x < 96; x += 12) {
    hg.beginPath();
    hg.moveTo(x, 13);
    hg.lineTo(x + 6, 13);
    hg.lineTo(x + 12, 3);
    hg.lineTo(x + 6, 3);
    hg.closePath();
    hg.fill();
  }
  p1Art = { plates: { danger: screenLook(n.danger, HUD_ART_SCALE), slam: screenLook(n.slam, HUD_ART_SCALE), tag: screenLook(n.tag, HUD_ART_SCALE) }, ring, bracket, bar };
  await idle();
}
const p1Now: Look = {
  code: "now",
  title: "P1 warning display",
  note: "Today (P1, \"just perfect\"): red neon brackets round the target, a turning tick ring, a scrolling hazard bar and the TARGET tag, all flickering like a failing display; off screen, the DANGER panel at the edge with chevrons toward the boss and the attack plate (SLAM) during a warning.",
  async bake() {
    boot();
  },
  draw(g, t, st) {
    if (show(st, "lock")) lockNow(g, st, t, false);
    hudScreen(g, st, t, nowPlates());
  },
  textures: () => [
    { name: "hud_danger", canvas: fc("boss_hud", HUD_FRAMES.danger) },
    { name: "hud_plate_slam", canvas: fc("boss_hud", HUD_FRAMES.slam) },
    { name: "hud_target_tag", canvas: fc("boss_hud", HUD_FRAMES.tag) },
  ],
  parts: [
    { id: "lock", label: "Lock" },
    { id: "tag", label: "TARGET tag" },
    { id: "panel", label: "DANGER + chevrons" },
    { id: "plate", label: "SLAM plate" },
  ],
  frames: [
    { label: "walking", t: 0.3, when: "lock breathing" },
    { label: "warning", t: 0.9, when: "SLAM plate, brackets closing" },
    { label: "closing", t: 1.5, when: "brackets tight" },
    { label: "after", t: 2.1, when: "plate off" },
  ],
};
const p1TakeA: Look = {
  code: "P1-A",
  title: "A real display",
  note: "P1 kept as it is, rendered as a real emissive screen: phosphor bloom round every line, fine scanlines, a hair of colour fringe, a glass sheen from the upper left on the panel, plate and tag; the lock's lines glow the same way. Layout, sizes, flicker and timing unchanged.",
  bake: p1Bake,
  draw(g, t, st) {
    if (show(st, "lock")) lockNow(g, st, t, true);
    hudScreen(g, st, t, p1Art!.plates);
  },
  textures: () => [
    { name: "danger, screen", canvas: p1Art!.plates.danger },
    { name: "SLAM plate, screen", canvas: p1Art!.plates.slam },
    { name: "TARGET tag, screen", canvas: p1Art!.plates.tag },
  ],
  parts: p1Now.parts,
  frames: p1Now.frames,
};
const p1TakeB: Look = {
  code: "P1-B",
  title: "The lock is projected on the road",
  note: "The panel, plate and tag as P1-A, but the lock round the target becomes red light on the ground under the survivor: a pool of light, the tick ring and the brackets as light on the asphalt, the hazard stripes as a light bar. It reads as the boss marking where it will hit.",
  bake: p1Bake,
  draw(g, t, st) {
    const a = p1Art!;
    const fl = hudFlicker(t);
    const { gap } = lockGeom(t);
    const x = X(st, SURV[0]);
    const y = Y(st, SURV[1]);
    if (show(st, "lock")) {
      sprite(g, shared!.poolRed, x, y, 2.8, st.pxm, 0, (0.4 + 0.35 * lockP(t)) * fl, true);
      sprite(g, a.ring, x, y, LOCK_R * 2.3, st.pxm, t * 0.8, 0.9 * fl, true);
      for (let c = 0; c < 4; c++) {
        const sx = c & 1 ? 1 : -1;
        const sy = c & 2 ? 1 : -1;
        const rot = c === 0 ? Math.PI : c === 1 ? -Math.PI / 2 : c === 2 ? Math.PI / 2 : 0;
        sprite(g, a.bracket, x + sx * (gap - LOCK_R * 0.27) * st.pxm, y + sy * (gap - LOCK_R * 0.27) * st.pxm, LOCK_R * 0.75, st.pxm, rot, fl, true);
      }
      const off = ((t * 0.4) % 0.16) / 0.16;
      g.save();
      g.beginPath();
      g.rect(x - LOCK_R * st.pxm, y + (gap + 0.04) * st.pxm, LOCK_R * 2 * st.pxm, 0.16 * st.pxm);
      g.clip();
      sprite(g, a.bar, x + (off * 0.16 - 0.08) * st.pxm, y + (gap + 0.12) * st.pxm, LOCK_R * 2.3, st.pxm, 0, fl, true, 0.16);
      g.restore();
    }
    hudScreen(g, st, t, a.plates);
  },
  textures: () => [
    { name: "light pool", canvas: shared!.poolRed, note: "ADD 2.6 m" },
    { name: "tick ring light", canvas: p1Art!.ring, note: "ADD 1.8 m" },
    { name: "bracket light ×4", canvas: p1Art!.bracket, note: "ADD 0.6 m" },
    { name: "hazard light bar", canvas: p1Art!.bar, note: "ADD 1.8 × 0.16 m" },
    { name: "danger, screen", canvas: p1Art!.plates.danger },
  ],
  parts: p1Now.parts,
  frames: p1Now.frames,
};

/* ======================================================================================
 * GD: the ground damage (slam cracks + throw crater)
 * ====================================================================================== */
const GD_SLAM: [number, number] = [-2.6, 0];
const GD_CRATER: [number, number] = [4.6, 1.6];
const GD_CRATER_T = 0.5;
let gdArt: { reveal: HTMLCanvasElement[]; heave: Seg } | null = null;
const gdNow: Look = {
  code: "now",
  title: "Approved ground damage (R1 + R2 + R3), crater",
  note: "Today: the slam's 9 m crack decal appears whole on the hit (α 0.85) and stays until the build phase (8 decals at most); the throw's 3.2 m crater appears on its impact. No animation.",
  async bake() {
    boot();
  },
  draw(g, t, st) {
    if (show(st, "cracks")) sprite(g, fc("boss_fx", "boss_decal_crack_a"), X(st, GD_SLAM[0]), Y(st, GD_SLAM[1]), CRACK_SIDE_M, st.pxm, 0.6, 0.85);
    if (t >= GD_CRATER_T && show(st, "crater")) sprite(g, fc("boss_fx", "boss_decal_crater_a"), X(st, GD_CRATER[0]), Y(st, GD_CRATER[1]), CRATER_M, st.pxm, 0.4, 1);
  },
  textures: () => [
    { name: "boss_decal_crack_a", canvas: fc("boss_fx", "boss_decal_crack_a"), note: "256 px, 9 m" },
    { name: "boss_decal_crater_a", canvas: fc("boss_fx", "boss_decal_crater_a"), note: "128 px, 3.2 m" },
  ],
  parts: [
    { id: "cracks", label: "Slam cracks" },
    { id: "crater", label: "Crater" },
  ],
  frames: [
    { label: "slam", t: 0.0, when: "the hit" },
    { label: "+0.05", t: 0.05, when: "" },
    { label: "+0.1", t: 0.1, when: "" },
    { label: "crater", t: GD_CRATER_T, when: "throw impact" },
    { label: "later", t: 1.4, when: "stays" },
  ],
};
const gdTakeA: Look = {
  code: "GD-A",
  title: "Relit, with debris and settling dust",
  note: "The approved drawing kept, given real depth by the street's light from the upper left (the dish sinks, the rims and slabs stand up, cracks are shadowed on one side). On the hit, bits hop out with shadows; fine dust rises after and settles (secondary). Same for the crater, redrawn as a real pit with a heaved rim.",
  async bake() {
    await thBake();
    gdRelit();
  },
  draw(g, t, st) {
    const art = shared!;
    if (show(st, "cracks")) sprite(g, gdRelit(), X(st, GD_SLAM[0]), Y(st, GD_SLAM[1]), CRACK_SIDE_M, st.pxm, 0.6, 0.95);
    if (show(st, "debris")) debris(g, st, art, GD_SLAM[0], GD_SLAM[1], t, 10, 3.4, 110);
    if (show(st, "dust")) dustRing(g, st, art, GD_SLAM[0], GD_SLAM[1], t - 0.04, 14, 0.8, 4.4, 1.5, 0.55, 113);
    if (t >= GD_CRATER_T) {
      if (show(st, "crater")) sprite(g, thArt!.crater, X(st, GD_CRATER[0]), Y(st, GD_CRATER[1]), CRATER_M, st.pxm, 0.4, 1);
      if (show(st, "debris")) debris(g, st, art, GD_CRATER[0], GD_CRATER[1], t - GD_CRATER_T, 8, 2.2, 120);
      if (show(st, "dust")) dustRing(g, st, art, GD_CRATER[0], GD_CRATER[1], t - GD_CRATER_T - 0.03, 10, 0.5, 2.6, 1.1, 0.55, 123);
    }
  },
  textures: () => [
    { name: "ground damage, relit", canvas: gdRelit(), note: "384 px, 9 m" },
    { name: "crater, relit", canvas: thArt!.crater, note: "160 px, 3.2 m" },
    ...shared!.bits.map((c, i) => ({ name: `bit ${i + 1}`, canvas: c })),
    ...shared!.dust.map((c, i) => ({ name: `dust ${i + 1}`, canvas: c })),
  ],
  parts: [
    { id: "cracks", label: "Slam cracks" },
    { id: "crater", label: "Crater" },
    { id: "debris", label: "Debris" },
    { id: "dust", label: "Dust" },
  ],
  frames: gdNow.frames,
};
const gdTakeB: Look = {
  code: "GD-B",
  title: "The cracks run out from the fists",
  note: "As GD-A, but the slam's damage spreads from the impact in 0.15 s (three pictures: 40 %, 70 %, all), a dark heave ring runs out under the asphalt ahead of it, and dust lifts off the cracks as they open. The crater heaves slabs up.",
  async bake() {
    await thBake();
    if (gdArt) return;
    const full = gdRelit();
    const n = full.width;
    const reveal = [0.4, 0.7].map((r) => {
      const c = make(n, n);
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(full, 0, 0);
      const img = g.getImageData(0, 0, n, n);
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const u = x / n - 0.5;
          const v = y / n - 0.5;
          const d = Math.hypot(u, v) * 2 + (fbm(u * 5, v * 5, 131) - 0.5) * 0.45;
          const j = (y * n + x) * 4;
          img.data[j + 3] = Math.round((img.data[j + 3] as number) * clamp01((r - d) / 0.08));
        }
      g.putImageData(img, 0, 0);
      return c;
    });
    reveal.push(full);
    gdArt = { reveal, heave: ringSegment(1, { inM: 0.25, outM: 0.12, core: 0.04, pxm: 120, seed: 141, hot: "8,8,10", bloom: "4,4,6" }) };
    await idle();
  },
  draw(g, t, st) {
    const art = shared!;
    const a = gdArt!;
    const idx = t < 0.05 ? 0 : t < 0.1 ? 1 : 2;
    if (show(st, "cracks")) sprite(g, a.reveal[idx] as HTMLCanvasElement, X(st, GD_SLAM[0]), Y(st, GD_SLAM[1]), CRACK_SIDE_M, st.pxm, 0.6, 0.95);
    if (show(st, "heave") && t < 0.2) {
      const r = 0.6 + (4.6 - 0.6) * easeOut(t / 0.2);
      drawRing(g, a.heave, X(st, GD_SLAM[0]), Y(st, GD_SLAM[1]), st.pxm, 0.5 * (1 - t / 0.2), false, r);
    }
    if (show(st, "debris")) debris(g, st, art, GD_SLAM[0], GD_SLAM[1], t, 12, 3.6, 150);
    if (show(st, "dust")) {
      // dust lifting off the opening cracks: puffs along 8 crack directions, each starting when the crack reaches it
      const n = st.low ? 8 : 16;
      for (let i = 0; i < n; i++) {
        const ang = sh(i, 41) * Math.PI * 2;
        const d = 1.2 + sh(i, 42) * 3;
        const born = (d / 4.5) * 0.15 + 0.02;
        const age = t - born;
        if (age < 0 || age > 1.5) continue;
        const k = age / 1.5;
        sprite(g, art.dustDark[i % 2] as HTMLCanvasElement, X(st, GD_SLAM[0] + Math.cos(ang) * (d + k * 0.5)), Y(st, GD_SLAM[1] + Math.sin(ang) * (d + k * 0.5)), 0.7 + k * 1.3, st.pxm, i, 0.55 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.62 + 0.1) * (1 - k));
      }
    }
    if (t >= GD_CRATER_T) {
      if (show(st, "crater")) sprite(g, thArt!.craterB, X(st, GD_CRATER[0]), Y(st, GD_CRATER[1]), CRATER_M * 1.1, st.pxm, 0.4, 1);
      if (show(st, "debris")) debris(g, st, art, GD_CRATER[0], GD_CRATER[1], t - GD_CRATER_T, 10, 2.6, 160);
      if (show(st, "dust")) dustRing(g, st, art, GD_CRATER[0], GD_CRATER[1], t - GD_CRATER_T - 0.03, 14, 0.5, 3.2, 1.4, 0.6, 163, true);
    }
  },
  textures: () => [
    ...gdArt!.reveal.map((c, i) => ({ name: `cracks ${["40 %", "70 %", "all"][i]}`, canvas: c, note: "384 px, 9 m" })),
    { name: "heave ring segment ×8", canvas: gdArt!.heave.tex, note: "normal, dark" },
    { name: "crater, heaved", canvas: thArt!.craterB },
  ],
  parts: [
    { id: "cracks", label: "Slam cracks" },
    { id: "heave", label: "Heave ring" },
    { id: "crater", label: "Crater" },
    { id: "debris", label: "Debris" },
    { id: "dust", label: "Dust" },
  ],
  frames: gdNow.frames,
};

/* ======================================================================================
 * The cards
 * ====================================================================================== */
const GL = gLooks();
const COLOUR = "Red = get out (danger), kept; amber = your window, kept.";
export const cards: FxCard[] = [
  {
    id: "tele-slam",
    code: "SD",
    name: "Slam countdown disc",
    family: "telegraphs",
    brief: `<p><b>Light</b>, the group's first kind: the warning is emitted, so it lights the ground it falls on and dies first. The ring is where the slam reaches (4.5 m); the countdown is how long you have (1.2 s). Built up toward the hit (the skill's "tells first": the pose carries the read, the light only builds), then <b>everything releases together</b> in 0.15 s: the rim flares, the dust kicks out, the cracks land (the <b>mark</b>, GD). ${COLOUR}</p>`,
    game: `<p><code>BossView.ts › drawTelegraphs / drawCountdown</code>: the baked disc <code>boss_tele_disc</code> (512 px, ADD, shown 9.1 m, α = 0.45 + 0.55 × progress), 72 ticks lit to progress (Graphics, ADD), a hot head on the rim, 30 → 100 spark dots (hashed, no allocation). Progress from the server ticks (<code>bossTelegraph.ts › telegraphProgress</code>), fade 0.3 s after the hit. Pose: slam_a/b/c by progress (<code>slamFrameIndex</code>), slamHit 0.5 s. Crack decal on <code>boss.slammed</code>. 2 slots (pooled).</p>`,
    perf: `<p>Today: <b>one 9.1 m full-disc additive quad</b> per slam (≈ 83 m² of ADD, the most expensive kind by Story 9.15's measure: ~1 FPS per full-frame ADD sprite) + one ADD Graphics. <b>SD-A</b>: the ring as 8 rim segments (1.8 × 3.9 m each, ≈ 57 m² of ADD, nearly all of it lit; the 4 m hole and the inner disc are no longer drawn), a tick layer and a spark layer (each one Graphics/emitter), head + pool (0.55 m, 2 m); at the hit one 9.5 m flash pool for 0.15 s. <b>SD-B</b>: 8 jagged rim segments + 11 crack-glow strips (2.4 × 0.9 m, cropped by progress) + head = 20 small ADD sprites, ≤ 63 m² at the hit (≈ 45 m² mid-warning), no full-disc quad. Dust ≤ 14–18 normal sprites for ~1.2 s (halved with <code>?fx=low</code>). Bake: one 165 × 82 px segment, one 384² relit decal, shared dust / bits. <b>SD-G</b>: 24 ADD edge pieces (32 × 58 px, ≈ 1.4 × 0.8 m each; the dial = alpha per piece) + 8 ADD wash pieces (2 → 4.5 m, ≈ 51 m² of faint ADD; the 4 m hole not drawn) + head and its pool (0.42 m, 1.3 m) = 34 small ADD sprites, no full-disc quad; hit: 3 crack pictures (GD-G) over 0.15 s, ≤ 16 dust puffs (normal, 1.2 s, halved with <code>?fx=low</code>). No spark or tick layer. Bake: 2 small segments, 3 × 384² reveal pictures (shared with GD-G).</p>`,
    findings: [
      `<b>-G finding: today's sparks are amber/yellow</b> (<code>#ffb45a</code>, <code>#ffe08c</code>) inside a red danger zone, drifting across the edge: amber means "your window". SD-G cuts them.`,
      `-G: the ring and its countdown were three elements (rim, 72 ticks, head) doing two jobs; SD-G makes the edge itself the dial, so where and when are read from one line.`,
      `-G: the slam's dust at the fists is already Story 9.15's (<code>bossDust.ts › slamFists</code>, 2 × 9 puffs, 0.5 s); A and B add their own burst on top. SD-G adds only the dust that stops at the 4.5 m reach (a different job).`,

      "<b>Additive cost</b>: today's disc is a full 9.1 m ADD quad, mostly transparent in its middle (the hole and the faint inner glow). Both takes crop it to the rim.",
      "Checked and fine: the countdown reaches the top of the dial exactly on the hit tick; the fill keys on the server tick, so a late join never shows a finished ring.",
      "The sparks use their own clock (<code>clockS</code>, view time): same look on every client, never tied to play.",
      "The slam pose's raised arms cover the inner glow near the body; the ring itself is never hidden.",
    ],
    lengthS: 2.2,
    gapS: 0.6,
    keyT: [0.1, 0.6, 1.1, 1.22, 1.6],
    viewM: 11,
    under: (g, t, st) => boss(g, st, slamPose(t), 0),
    looks: [sdNow, sdTakeA, sdTakeB, GL.SD],
    plan: {
      goal: "Get out of the ring NOW: how far (the ring) and how long (the countdown) at a glance, building to one release on the hit.",
      timing: "boss.json › slam: telegraphS 1.2, radiusM 4.5, recoverS 0.8; bossTelegraph.ts › TELEGRAPH_FADE_S 0.3; BossView SLAM_HIT_S 0.5.",
      lengthS: 2.2,
      lanes: {
        light: [
          { t0: 0, t1: 1.2, label: "rim builds 40 → 100 %, head runs round" },
          { t0: 1.2, t1: 1.35, label: "flare", key: true, nw: true },
          { t0: 1.35, t1: 1.5, label: "fade 0.3 s" },
        ],
        core: [
          { t0: 0, t1: 1.2, label: "A: lit ticks (fresh hot, old ember) · B: 11 cracks reach the rim on the hit", nw: true },
          { t0: 1.2, t1: 1.5, label: "fade" },
        ],
        matter: [
          { t0: 0, t1: 1.2, label: "sparks (A streaks) · B: dust lifting off the rim, faster" },
          { t0: 1.2, t1: 1.65, label: "debris hops out", nw: true },
        ],
        smoke: [{ t0: 1.23, t1: 2.2, label: "dust ring rolls out and settles (secondary)", nw: true }],
        mark: [{ t0: 1.2, t1: 2.2, label: "cracks land (GD), stay to the build phase", key: true }],
        game: [
          { t0: 0, t1: 1.2, label: "slam_a → b → c (by progress)" },
          { t0: 1.2, t1: 1.7, label: "slamHit: damage, push", key: true },
          { t0: 1.7, t1: 2.2, label: "recover" },
        ],
      },
    },
  },
  {
    id: "tele-throw",
    code: "TH",
    name: "Throw: target ring, chunk, crater",
    family: "telegraphs",
    brief: `<p>The ring is <b>light</b> (where it lands, 3 m); the white ring closing in is the clock (to the impact). The chunk is <b>matter</b>: a real piece of the street the boss tore up (road slab / rubble / burnt-car panel by where it stood), lit from the upper left, with a shadow on the road that tells its height. The impact releases everything at once; the crater is the <b>mark</b>. ${COLOUR}</p>`,
    game: `<p><code>BossView.ts › drawRing</code>: <code>boss_tele_ring</code> (512 px hatched disc, normal blend, 6.1 m, α = fade), a white Graphics ring (0.12 m) shrinking to 0 at the impact (<code>throwInnerRadius</code>), the chunk (<code>boss_chunk_*</code>, 64 px, 1.3 m) on a 3 m cosmetic arc (<code>throwChunkAt</code>: lift 0.35 × h, scale 1 + h/6, spin 5 rad), the crater (128 px, 3.2 m, shared decal pool of 8) and a grey dust ring (r 0.5 → 3 m, 0.4 s) on <code>boss.thrown_impact</code>. Pose: throw during the lift (Story 9.15).</p>`,
    perf: `<p>Today: one 6.1 m normal quad, 2 Graphics, 1 chunk. <b>TH-A</b>: + 8 ADD rim segments (1.4 × 2.7 m, ≈ 29 m²) + 8 ADD white-ring segments scaled to the radius (shrinking), faint hatching kept (normal), chunk + shadow; impact: ≤ 9 bits with shadows (0.5 s), ≤ 12 dust puffs (1 s). <b>TH-B</b>: 8 ADD rim + ring during the lift only, 2 shadow sprites, ≤ 12 bits, ≤ 16 dust (1.4 s). Halved with <code>?fx=low</code>. Bake: chunks 112², craters 160–176², segments small. <b>TH-G</b>: 24 ADD edge pieces + 8 ADD wash pieces (pie, ≈ 28 m²) + head (2) = 34 small ADD, no closing ring; flight: slab + 2 shadow sprites; impact: ≤ 8 bits with shadows, ≤ 12 dust puffs (halved with <code>?fx=low</code>), 1 crater. Bake: 2 small segments, 1 slab 112², 1 crater 160².</p>`,
    findings: [
      `<b>-G finding: the closing ring is white</b>, which means people and pick-ups; it was also a second clock next to the hatched ring. TH-G uses the red edge as the dial (same as SD-G).`,
      `<b>-G finding (page context)</b>: in the game the chunk flies while the boss RECOVERS (<code>throw.ts</code>), so the body shows the walk frame in flight; this card's context body holds <code>throw_a</code> (chunk overhead) to the impact, so Now / A / B show two chunks in flight. TH-G draws the walk frame over it (a sliver of the context chunk still shows at the release).`,
      `-G: the shadow as the clock, resolved by the goal: a real shadow (down-right of the slab by its height) that meets the slab on the impact, not TH-B's shadow parked on the target before anything is above it.`,

      "Today's chunks (64 px, flat fill, hard rim) read as stickers next to the relit boss; both takes redraw them as real pieces, relit.",
      "Today's chunk has no shadow: at the top of its 3 m arc it only grows (×1.5), so its height is hard to read. Both takes add the shadow on the road.",
      "Checked and fine: the white ring reaches 0 exactly on the impact tick; a chunk in flight when the boss dies never lands (6.7 F5).",
      "The release time (impact − 0.8 s) is computed in BossView from <code>flightS × 20</code> ticks: fine at 20 Hz, would drift if the tick rate changed.",
    ],
    lengthS: 2.9,
    gapS: 0.5,
    keyT: [0.5, 1.0, 1.4, 1.82, 2.3],
    viewM: 17,
    aspect: 0.56,
    under: (g, t, st) => boss(g, st, t < THROW_LEN ? "throw_a" : "walk_a", TB),
    looks: [thNow, thTakeA, thTakeB, GL.TH],
    plan: {
      goal: "Something heavy is coming down HERE: where (the ring) and when (the closing ring, then the falling chunk).",
      timing: "boss.json › throw: liftS 1.0, flightS 0.8, radiusM 3; bossTelegraph.ts › CHUNK_ARC_M 3, fade 0.3 s; crater 3.2 m.",
      lengthS: 2.9,
      lanes: {
        light: [
          { t0: 0, t1: 1.8, label: "ring builds; white ring closes" },
          { t0: 1.8, t1: 1.95, label: "flare", key: true, nw: true },
          { t0: 1.95, t1: 2.1, label: "fade" },
        ],
        core: [
          { t0: 0, t1: 1.0, label: "lift: chunk in the hands (pose)" },
          { t0: 1.0, t1: 1.8, label: "flight on a 3 m arc · B: its shadow takes over the clock", nw: true },
        ],
        matter: [
          { t0: 1.0, t1: 1.8, label: "chunk + shadow on the road", nw: true },
          { t0: 1.8, t1: 2.3, label: "debris hops out", nw: true },
        ],
        smoke: [{ t0: 1.83, t1: 2.9, label: "dust rolls out, settles (secondary)", nw: true }],
        mark: [{ t0: 1.8, t1: 2.9, label: "crater stays", key: true }],
        game: [
          { t0: 0, t1: 1.8, label: "throw pose (9.15)" },
          { t0: 1.8, t1: 1.85, label: "impact: damage", key: true },
          { t0: 1.85, t1: 2.4, label: "recover 0.6" },
        ],
      },
    },
  },
  {
    id: "tele-lane",
    code: "CL",
    name: "Charge lane",
    family: "telegraphs",
    brief: `<p>The lane is <b>light</b>: where the body will pass (4.8 m wide, body back to body front). The fill is the clock: it reaches the end as the rush starts. During the rush it stays full; the body kicks up <b>dust</b> behind it (secondary). ${COLOUR}</p>`,
    game: `<p><code>BossView.ts › drawLane</code>: <code>boss_tele_lane</code> (336 × 115 px at 24 px/m, normal blend, cropped to the lane's length: no stretching), a red Graphics fill (0xff2828, α 0.38) growing from the body's back over the 1 s warning (<code>chargeLaneProgress</code>), full during the rush, fade 0.3 s after the stop (<code>chargeStopTick</code>). Pose: charge during the warning (9.15), rush on the move.</p>`,
    perf: `<p>Today: 1 normal strip (≤ 67 m²) + 1 Graphics. <b>CL-A</b>: the faint strip, a normal fill, 2 ADD edge strips (cropped, ≤ 14 × 0.9 m), 1 ADD sweep front (0.5 × 4.8 m, warning only), ≤ 6 ADD chevrons (0.9 m) ≈ 34 m² of ADD at most; rush dust ≤ 18 puffs (1.2 s). <b>CL-B</b>: 2 ADD edges + 3 ADD seep strips (14 × 0.8 m, cropped) ≤ 56 m² when the lane is full, 3 crack strips (normal), ≤ 12 lifting puffs. Halved with <code>?fx=low</code>. <b>CL-G</b>: 1 ADD wash (cropped to the lit range) + 4 ADD edge blits (lit / not yet, each side) + 1 end line + the front (1 line + 2 pools, warning only) = ≤ 9 ADD sprites from one 336 × 14 px strip and one 168 × 58 px wash; ≈ 30 m² of faint ADD when full, shrinking behind the body in the rush. No own dust (9.15's trail).</p>`,
    findings: [
      `-G: after the rush starts, today's lane stays fully lit until 0.3 s after the stop, including behind the body where it can no longer hit; CL-G puts the light out behind its back (view only, no sim change).`,
      `-G: the chevrons repeated the fill's direction; 9.15 already kicks a rush trail (26 puffs over the rush), so CL-G adds no dust.`,

      "Checked and fine: the strip is cropped, never stretched, so the hatching keeps its 0.55 m spacing on every lane length.",
      "The fill (α 0.38) over the strip (α 0.16 red) gives a strong red block on the lit street but loses its edges in the dark (it isn't above the darkness as light; the strip is): both takes make the edges light.",
    ],
    lengthS: 2.4,
    gapS: 0.5,
    keyT: [0.4, 0.95, 1.4, 1.84, 2.05],
    viewM: 20,
    aspect: 0.45,
    under: (g, t, st) => boss(g, st, chargePose(CL_C, t), bossX(CL_C, t)), // and again above the lane (bodyTop)
    looks: [clNow, clTakeA, clTakeB, GL.CL],
    plan: {
      goal: "Get off the line: where it will pass and when it goes (the fill reaches the end).",
      timing: "boss.json › charge: telegraphS 1.0, speedMps 12, laneWidthM 4.8, distM 10 (lane 14 m with the body); fade 0.3 s after the stop.",
      lengthS: 2.4,
      lanes: {
        light: [
          { t0: 0, t1: 1.0, label: "edges build, sweep front runs to the end" },
          { t0: 1.0, t1: 1.15, label: "flare: the rush", key: true, nw: true },
          { t0: 1.15, t1: 1.83, label: "full" },
          { t0: 1.83, t1: 2.13, label: "fade" },
        ],
        core: [{ t0: 0, t1: 1.83, label: "A: chevron wave forward · B: cracks race down the lane", nw: true }],
        smoke: [
          { t0: 0, t1: 1.0, label: "B: dust lifting off the cracks", nw: true },
          { t0: 1.0, t1: 2.4, label: "rush dust behind the body", nw: true },
        ],
        game: [
          { t0: 0, t1: 1.0, label: "charge pose (9.15)" },
          { t0: 1.0, t1: 1.83, label: "rush 12 m/s: damage, shove", key: true },
          { t0: 1.83, t1: 2.4, label: "recover 1.0" },
        ],
      },
    },
  },
  {
    id: "tele-crash",
    code: "CR",
    name: "CRASH mark",
    family: "telegraphs",
    brief: `<p>The one warning that is <b>good news</b>: it crashed into something and is stunned for 2 s. Amber = an event you can use. The crash is a release: light, bits and dust in the same 0.15 s; the dust hangs while it is stunned. ${COLOUR}</p>`,
    game: `<p><code>BossView.ts › drawLane</code>: <code>boss_mark_crash_a</code> (256 px, 4.8 m, normal) at the body's front at the stop when the lane ends on a building (<code>crash</code>), same α as the lane: <b>it fades 0.3 s after the stop</b>. <code>onCrashed</code>: a grey dust ring (r 2 → 3.5 m, 0.5 s). Stun pose 2 s; the HUD bar flashes amber (4 Hz) for the stun (<code>BossHud</code>).</p>`,
    perf: `<p>Today: 1 normal 4.8 m mark + 1 Graphics ring. <b>CR-A / CR-B</b>: amber bar (0.55 × 4.6 m) + word (4.5 × 1.7 m) ADD ≈ 10 m², flash pool (4–5 m, 0.15 s only), ≤ 10–12 bits (0.5 s), ≤ 12–16 dust puffs (1.4–2.2 s); B adds one normal wall-crack decal that stays. Plus the lane (as CL-A / CL-B). <b>CR-G</b>: the lane as CL-G; crash: amber flash (4.5 m, 0.15 s), ≤ 8 bits, 1 wall-crack decal; window: 24 small ADD amber pieces (drain to 0 over 2 s) + CRASH (one ADD light 4.2 × 1.8 m + one normal shade) for the 2 s. No own dust (9.15's crash burst).</p>`,
    findings: [
      `<b>-G finding: the CRASH mark rotates with the lane</b> (<code>l.crash.setRotation(l.lane.angle)</code>): on a westward charge the word is upside down, on a north/south one sideways. CR-G draws it horizontal, above the body.`,
      `-G: amber now lasts the whole 2 s stun (a ring that drains on <code>stunS</code>), drawn above the body; the red lane fades in its usual 0.3 s as the amber comes in, so the two never compete.`,
      `-G: 9.15's crash burst (16 puffs at 1.3 r ahead) is the crash dust; CR-G adds none.`,

      "<b>The amber window disappears early</b>: the CRASH mark fades with the lane, 0.3 s after the stop, while the stun (the window it announces) lasts 2 s; only the HUD bar keeps flashing. Both takes keep today's timing (see the question).",
      "<b>The word is hidden</b>: at the stop the body (2 m radius) sits over the word (1.07 m before the bar), and in the light the body is redrawn above its lane (<code>bodyTop</code>), so only the bar and the edge of the word show. Both takes draw the CRASH light above the body.",
      "The dust ring is centred on the body, not on the impact point at the wall; both takes put the dust and bits at the wall.",
    ],
    lengthS: 3.9,
    gapS: 0.4,
    keyT: [1.25, 1.5, 1.65, 1.8, 3.0],
    viewM: 14,
    aspect: 0.6,
    under: crUnder,
    looks: [crNow, crTakeA, crTakeB, GL.CR],
    plan: {
      goal: "It's stunned: hit it now. The crash must read as a release, then as a window.",
      timing: "boss.json › charge: stunS 2, laneWidthM 4.8; the mark fades with the lane 0.3 s after the stop; dust ring 0.5 s.",
      lengthS: 3.9,
      lanes: {
        light: [
          { t0: 1.5, t1: 1.65, label: "amber flash", key: true, nw: true },
          { t0: 1.5, t1: 1.8, label: "CRASH light (fades with the lane)" },
        ],
        matter: [{ t0: 1.5, t1: 2.0, label: "concrete bits off the wall", nw: true }],
        smoke: [{ t0: 1.53, t1: 3.7, label: "dust off the wall, hangs through the stun (B heavier)", nw: true }],
        mark: [{ t0: 1.5, t1: 3.9, label: "B: crack in the wall stays", nw: true }],
        game: [
          { t0: 0, t1: 1.0, label: "warning" },
          { t0: 1.0, t1: 1.5, label: "rush" },
          { t0: 1.5, t1: 3.5, label: "STUN 2 s: your window (HUD bar amber)", key: true },
        ],
      },
    },
  },
  {
    id: "tele-p1",
    code: "P1",
    name: "Boss warning display (P1)",
    family: "telegraphs",
    brief: `<p>The display is the game talking to you, not part of the street, so it stays a <b>display</b> ("P1 is just perfect"). Photoreal here means a real emissive screen (A), or (B) its target lock turned into <b>light</b> on the road under the survivor it hunts. Layout, sizes and flicker unchanged. Red = danger.</p>`,
    game: `<p><code>BossView.ts › drawLock</code>: on the target survivor, brackets (0.8 m, closing over a slam's windup, breathing while it walks), a turning ring of 24 ticks, a scrolling hazard bar, the TARGET tag (<code>hud_target_tag</code>, 88 × 44 CSS px at 47 px/m), all × <code>hudFlicker</code>. <code>BossHud.ts</code>: off screen, the DANGER panel (<code>hud_danger</code> × 0.75) at the edge with 3 chevrons marching toward the boss, the attack plate (SLAM / CHARGE / THROW) inward during a warning; the THE BEHEMOTH banner only during the arrival (not shown here).</p>`,
    perf: `<p>Today: 2 Graphics + 3 images (HUD scene). <b>P1-A</b>: the same objects; the bloom, scanlines and sheen are baked into the plates (no filter at run time); the lock's glow is a second wide pass (as today's first pass). <b>P1-B</b>: + 7 small ADD sprites under the survivor (pool 2.6 m, ring 1.8 m, 4 brackets 0.6 m, bar), ≈ 9 m². <b>P1-G</b>: as P1-A minus the hazard bar (−1 Graphics), plus a 2-rect time-left bar under the plate (1 Graphics, ADD) during a warning.</p>`,
    findings: [
      `-G: <code>hudFlicker</code> dips (to 45 %) also happen during a warning, against the closing brackets (the skill's "tells first: never pulse against the countdown"). P1-G keeps the flicker only while it walks.`,
      `-G: the TARGET tag's last letter is clipped by its plate in the page's capture ("TARGE"), in Now, A, B and G alike: worth a look in <code>hudWarnArt</code> (not checked in the game).`,

      "Checked and fine: the tag, brackets and bar share one flicker; the plate flickers on its own phase (+0.3 s) so they never all dip at once.",
      "The lock is drawn above the darkness (marker layer): any glow added to it (A, B) shows in a blackout too, which is right for a warning.",
    ],
    lengthS: P1_LEN,
    gapS: 0,
    keyT: [0.3, 0.9, 1.5, 2.1],
    viewM: 12,
    aspect: 0.5,
    under: p1Survivor,
    looks: [p1Now, p1TakeA, p1TakeB, GL.P1],
    plan: {
      goal: "It's after YOU (the lock) and it's over there (the panel): what it will do next (the plate).",
      timing: "BossView LOCK_R_M 0.8, 47 CSS px/m; hudFlicker; chevrons 2 Hz; BossHud PANEL_SCALE 0.75; a slam warning 1.2 s shown from 0.6 s.",
      lengthS: P1_LEN,
      lanes: {
        light: [
          { t0: 0, t1: 2.4, label: "flicker (failing display)" },
          { t0: 0.6, t1: 1.8, label: "B: ground pool brightens with the windup", nw: true },
        ],
        core: [
          { t0: 0, t1: 0.6, label: "brackets breathe" },
          { t0: 0.6, t1: 1.8, label: "brackets close in (slam windup)", key: true },
          { t0: 1.8, t1: 2.4, label: "breathe" },
        ],
        game: [{ t0: 0.6, t1: 1.8, label: "SLAM plate shows", key: true }],
      },
    },
  },
  {
    id: "tele-ground",
    code: "GD",
    name: "Ground damage: slam cracks and crater",
    family: "telegraphs",
    brief: `<p>The <b>mark</b>: what the street keeps. Matte, darker than the road, lit by the one light from the upper left. The approved ground damage (R1 + R2 + R3) is the style reference of the whole photoreal rework, so its drawing stays; the takes give it depth and the moment it is made (debris, then dust: <b>secondary follows</b>).</p>`,
    game: `<p><code>BossView.ts › onSlam / onThrownImpact</code>: one decal pool of <code>boss.json › caps.maxDecals</code> = 8 (oldest reused, cleared at the build start): the crack decal (<code>groundDamageArt.ts › drawGroundDamage</code>, 256 px for 9 m, α 0.85, random rotation) and the crater (128 px, 3.2 m). They appear whole, in one frame.</p>`,
    perf: `<p>Today: ≤ 8 normal decals (9 m and 3.2 m). <b>GD-A</b>: the same decals, relit at 384 px (9 m: 43 px/m, 1.2 × the game's 36); + ≤ 10 bits and ≤ 14 dust puffs for ~1.5 s per hit. <b>GD-B</b>: 3 reveal pictures (3 × 576 KB) swapped over 0.15 s, 8 dark heave segments (normal, 0.2 s), ≤ 16 dust puffs. No ADD at all. Memory: 384² RGBA = 576 KB per decal picture (today 256 KB). <b>GD-G</b>: the 3 reveal pictures (shared with SD-G) + 1 dust film (192², normal, 3 s) per slam; crater + a 96² film per throw. No ADD, no debris or dust of its own (they belong to SD-G / TH-G and 9.15).</p>`,
    findings: [
      `-G: GD-A / GD-B throw their own debris and dust at the hit, on top of the attack's and 9.15's: three bursts for one hit. GD-G keeps only the mark.`,
      `-G: the crack decal is 9 m wide = 2 × the slam's 4.5 m reach, so the mark already ends where the danger ended; GD-G keeps that and says so.`,

      "Today's crack decal is drawn at 256 px for 9 m (28 px/m), under the game's 36 px/m: it is upscaled on screen and its fine cracks soften. The takes bake it at 384 px.",
      "Today's crater (flat fills, a hard dark disc, 9 straight cracks) doesn't match the approved slam damage next to it; the takes redraw it in the same style.",
      "Checked and fine: decals clear at the build start; 8 at most.",
    ],
    lengthS: 1.6,
    gapS: 0.6,
    keyT: [0.0, 0.05, 0.12, 0.55, 1.4],
    viewM: 15,
    aspect: 0.7,
    looks: [gdNow, gdTakeA, gdTakeB, GL.GD],
    plan: {
      goal: "That hit was real: the street is broken where it landed, and it stays broken.",
      timing: "On boss.slammed / boss.thrown_impact; stays until the build phase (caps.maxDecals 8). Debris 0.5 s, dust 1.1–1.5 s (new).",
      lengthS: 1.6,
      lanes: {
        mark: [
          { t0: 0, t1: 0.15, label: "B: cracks run out (3 pictures)", key: true, nw: true },
          { t0: 0.15, t1: 1.6, label: "stays" },
        ],
        matter: [
          { t0: 0, t1: 0.5, label: "debris hops out with shadows", nw: true },
          { t0: 0.5, t1: 1.0, label: "crater debris", nw: true },
        ],
        smoke: [{ t0: 0.04, t1: 1.6, label: "dust rises off the cracks, settles", nw: true }],
        core: [{ t0: 0, t1: 0.2, label: "B: heave ring under the asphalt", nw: true }],
        game: [
          { t0: 0, t1: 0.05, label: "slam hit", key: true },
          { t0: 0.5, t1: 0.55, label: "throw impact", key: true },
        ],
      },
    },
  },
];
