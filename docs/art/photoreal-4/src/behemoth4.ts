import { artKit, setArtPixel } from "../../../../apps/client/src/render/city/bruteArt";

/**
 * Story 6.5 (T0): the Behemoth, drawn in game code from the designer's picks (`docs/epic-6-decisions.md`
 * › Epic 6 looks, section 4: all four looks BH1 prototype, BH2 site worker, BH3 overgrowth, BH4 riot
 * cop, one at random per Behemoth). Ported from `drawBehemothG` in `docs/art/epic-6/looks.html`
 * (section 4) onto the Brute's shared helpers: the reference draws in metres around its 2 m body,
 * facing +x. Poses: walk (2 frames), slam (arms rising, 3 frames by progress), slamHit, charge, rush,
 * throw, stun, roar; plus an "outline + eyes" frame per look, normal and enraged (red eyes), drawn
 * above the darkness (6.3).
 */

type G = CanvasRenderingContext2D;
type Path = (c: G) => void;
const { lerp, mulberry, shade, R, E, blobPath, fillP, strokeP, rivet, part, polyTex, skinTex, clothTex, drawLimb, wound, fist } = artKit;
const TAU = Math.PI * 2;

export const BEHEMOTH_LOOK_IDS = ["BH1", "BH2", "BH3", "BH4"] as const;
type LookKind = "proto" | "worker" | "growth" | "riot";
const LOOKS: readonly { look: LookKind; skin: string }[] = [
  { look: "proto", skin: "#6a7360" },
  { look: "worker", skin: "#6f705f" },
  { look: "growth", skin: "#5f6a58" },
  { look: "riot", skin: "#66705e" },
];

export type BehemothPose = "walk" | "slam" | "slamHit" | "charge" | "rush" | "throw" | "stun" | "roar" | "dead"; // Story 6.7: + "dead" (the collapse, k 0–1)

/** Reference body radius (m). */
export const BH_R_M = 2;
/** Half the frame (m): the roar's arms and fists reach ~3.4 m from the centre. */
export const BH_FRAME_HALF_M = 3.5;

const hash = (n: number): number => {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
};
function Pg(c: G, p: readonly number[]): void {
  c.moveTo(p[0] as number, p[1] as number);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] as number, p[i + 1] as number);
  c.closePath();
}
function glow(c: G, x: number, y: number, r: number, rgb: string, a: number): void {
  if (a <= 0) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.3, `rgba(${rgb},${a * 0.5})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.restore();
}
function castShadow(c: G, fn: Path, dx: number, dy: number, blur: number, a: number): void {
  const m = c.getTransform();
  const s = Math.hypot(m.a, m.b);
  c.save();
  c.translate(-4000 / s, 0);
  c.shadowColor = `rgba(0,0,0,${a})`;
  c.shadowOffsetX = (4000 * m.a) / s + dx * s;
  c.shadowOffsetY = dy * s;
  c.shadowBlur = blur * s;
  c.fillStyle = "#000";
  fn(c);
  c.restore();
}
function lump(c: G, x: number, y: number, rx: number, ry: number, col: string, seed: number, hi = 0.32): void {
  part(c, (q) => blobPath(q, x, y, rx, ry, seed, 0.06, 40), { base: col, lit: "radial", box: [x - rx, y - ry, x + rx, y + ry], tex: skinTex(seed, 0.8), hi, lo: 0.6, rim: 0.3, inner: 0.35, line: 1.6 });
}
function rebar(c: G, x1: number, y1: number, x2: number, y2: number): void {
  const seg: Path = (q) => {
    q.moveTo(x1, y1);
    q.lineTo(x2, y2);
  };
  strokeP(c, seg, "#140d09", 0.11);
  strokeP(c, seg, "#86492a", 0.06);
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const x = lerp(x1, x2, t);
    const y = lerp(y1, y2, t);
    strokeP(
      c,
      (q) => {
        q.moveTo(x - 0.03, y - 0.03);
        q.lineTo(x + 0.03, y + 0.03);
      },
      "rgba(20,12,8,0.7)",
      0.012,
    );
  }
}
function throwChunk(c: G): void {
  part(c, (q) => Pg(q, [-0.7, -0.5, 0.6, -0.65, 0.8, 0.3, 0.1, 0.7, -0.75, 0.35]), { base: "#6a675f", lit: "top", box: [-0.75, -0.65, 0.8, 0.7], tex: polyTex(121), hi: 0.35, lo: 0.5, rim: 0.35, line: 1.4 });
}


/* ---------------- Take B: the rebuilt detail (photoreal group 4) ---------------- */
/** Take B on/off (the page draws both takes from this one module). */
let DETAIL = false;
export function setDetail(on: boolean): void {
  DETAIL = on;
}
/**
 * Take B's zigzag veins: "static" (take B: a steady red core when enraged), "marker" (V2: the enraged core is drawn in
 * pure magenta so `boss4.ts › markerPulse` can find the visible vein pixels and make them pulse), "off" (V3 and the
 * mix: organic veins are grown on the relit picture instead, `boss4.ts › growVeins`).
 */
export type VeinMode = "static" | "marker" | "off";
let VEIN_MODE: VeinMode = "static";
export function setVeinMode(m: VeinMode): void {
  VEIN_MODE = m;
}
const veinCore = (): string => (VEIN_MODE === "marker" ? "#ff00ff" : "#ff5a32");
/** A soft-edged lump that reads as a muscle under the skin (a colour step the relight turns into a volume). */
function muscle(c: G, x: number, y: number, rx: number, ry: number, rot: number, col: string, seed: number): void {
  void seed;
  c.save();
  c.globalCompositeOperation = "source-atop";
  c.translate(x, y);
  c.rotate(rot);
  // the groove that separates the muscle (a crease for the relight), on its shadow side
  strokeP(
    c,
    (q) => {
      q.ellipse(0, 0, rx, ry, 0, Math.PI * 0.05, Math.PI * 1.05);
    },
    shade(col, -0.42),
    0.045,
  );
  c.scale(1, ry / rx);
  // a soft swell: lit on the key-light side, a crescent of shadow on the far side, no outline
  const hi = c.createRadialGradient(-rx * 0.25, -rx * 0.3, 0, 0, 0, rx);
  hi.addColorStop(0, "rgba(215,228,205,0.30)");
  hi.addColorStop(0.55, "rgba(215,228,205,0.08)");
  hi.addColorStop(1, "rgba(215,228,205,0)");
  c.fillStyle = hi;
  c.beginPath();
  c.arc(0, 0, rx, 0, TAU);
  c.fill();
  const lo = c.createRadialGradient(-rx * 0.2, -rx * 0.25, rx * 0.55, 0, 0, rx * 1.08);
  lo.addColorStop(0, "rgba(10,14,8,0)");
  lo.addColorStop(0.7, "rgba(10,14,8,0.32)");
  lo.addColorStop(1, "rgba(10,14,8,0)");
  c.fillStyle = lo;
  c.beginPath();
  c.arc(0, 0, rx * 1.08, 0, TAU);
  c.fill();
  c.restore();
}
/** Striations: fine curved creases across a muscle, following its round. */
function striations(c: G, x: number, y: number, rx: number, ry: number, rot: number, n: number, col: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    strokeP(
      c,
      (q) => {
        q.moveTo(-rx * 0.8, t * ry * 1.6);
        q.quadraticCurveTo(0, t * ry * 1.6 + ry * 0.25, rx * 0.8, t * ry * 1.6);
      },
      col,
      0.035,
    );
  }
  c.restore();
}
/** A branching vein (dark, raised; red and glowing when enraged). */
function vein(c: G, x0: number, y0: number, ang: number, len: number, seed: number, enr: boolean, w = 0.05): void {
  if (VEIN_MODE === "off") return;
  const rnd = mulberry(seed);
  const pts: number[] = [x0, y0];
  let x = x0;
  let y = y0;
  let a = ang;
  for (let i = 0; i < 6; i++) {
    a += (rnd() - 0.5) * 0.7;
    x += Math.cos(a) * (len / 6);
    y += Math.sin(a) * (len / 6);
    pts.push(x, y);
  }
  const path: Path = (q) => {
    q.moveTo(pts[0] as number, pts[1] as number);
    for (let i = 2; i < pts.length; i += 2) q.lineTo(pts[i] as number, pts[i + 1] as number);
  };
  c.save();
  c.globalCompositeOperation = "source-atop";
  c.translate(-w * 0.35, -w * 0.35);
  strokeP(c, path, enr ? "rgba(255,120,80,0.5)" : "rgba(170,182,150,0.55)", w * 0.7);
  c.translate(w * 0.35, w * 0.35);
  strokeP(c, path, enr ? "#5a120a" : "rgba(28,34,24,0.75)", w);
  if (enr) strokeP(c, path, veinCore(), w * 0.55);
  // one side branch
  const bi = 2 + Math.floor(rnd() * 3) * 2;
  const bx = pts[bi] as number;
  const by = pts[bi + 1] as number;
  const ba = a + (rnd() < 0.5 ? 0.9 : -0.9);
  const br: Path = (q) => {
    q.moveTo(bx, by);
    q.lineTo(bx + Math.cos(ba) * len * 0.3, by + Math.sin(ba) * len * 0.3);
  };
  strokeP(c, br, enr ? "#5a120a" : "rgba(28,34,24,0.7)", w * 0.7);
  if (enr) strokeP(c, br, veinCore(), w * 0.4);
  c.restore();
}
/** A long scar closed with staples. */
function stapledScar(c: G, x1: number, y1: number, x2: number, y2: number, seed: number): void {
  const rnd = mulberry(seed);
  const mx = (x1 + x2) / 2 + (rnd() - 0.5) * 0.15;
  const my = (y1 + y2) / 2 + (rnd() - 0.5) * 0.15;
  const path: Path = (q) => {
    q.moveTo(x1, y1);
    q.quadraticCurveTo(mx, my, x2, y2);
  };
  strokeP(c, path, "#2a1612", 0.12);
  strokeP(c, path, "#6e2a22", 0.07);
  strokeP(c, path, "#a1574a", 0.018);
  const nx = -(y2 - y1);
  const ny = x2 - x1;
  const nl = Math.hypot(nx, ny) || 1;
  for (let i = 1; i < 7; i++) {
    const t = i / 7;
    const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
    const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
    const ux = (nx / nl) * 0.07;
    const uy = (ny / nl) * 0.07;
    const st: Path = (q) => {
      q.moveTo(x - ux, y - uy);
      q.lineTo(x + ux, y + uy);
    };
    strokeP(c, st, "#15171a", 0.035, "butt");
    strokeP(c, st, "#b9bec4", 0.016, "butt");
  }
}
/** A chunk of concrete grown into the hide, with a ring of torn, bloody skin. */
function fusedRubble(c: G, x: number, y: number, s: number, seed: number): void {
  const rnd = mulberry(seed);
  const pts: number[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rnd() * 0.4;
    const d = s * (0.7 + rnd() * 0.45);
    pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85);
  }
  fillP(c, (q) => blobPath(q, x, y, s * 1.08, s * 0.98, seed + 1, 0.12, 28), "rgba(20,14,10,0.85)");
  part(c, (q) => Pg(q, pts), { base: "#77746b", lit: "top", box: [x - s, y - s, x + s, y + s], tex: polyTex(seed), hi: 0.4, lo: 0.5, rim: 0.35, line: 1.1 });
  for (let i = 0; i < 4; i++) {
    const a = rnd() * TAU;
    const d = rnd() * s * 0.5;
    fillP(c, (q) => E(q, x + Math.cos(a) * d, y + Math.sin(a) * d, s * 0.08, s * 0.06), "#3d3b36");
  }
}
/** Muscle, veins and scars on the torso (after the body lumps, under the shirt / vest). */
function torsoDetail(c: G, r: number, look: LookKind, skin: string, enr: boolean): void {
  if (!DETAIL) return;
  const dk = shade(skin, -0.2);
  const lt = shade(skin, 0.12);
  for (const s of [-1, 1]) {
    // deltoid and trapezius masses on each shoulder lump
    muscle(c, 0.2 * r, s * 0.66 * r, 0.34 * r, 0.27 * r, s * 0.35, lt, 201 + s);
    striations(c, 0.2 * r, s * 0.66 * r, 0.3 * r, 0.24 * r, s * 0.35 + Math.PI / 2, 4, "rgba(24,30,20,0.28)");
    muscle(c, -0.12 * r, s * 0.42 * r, 0.34 * r, 0.16 * r, s * 0.15, dk, 205 + s);
    // the lats: two long swells down the flanks
    muscle(c, -0.55 * r, s * 0.6 * r, 0.34 * r, 0.17 * r, s * -0.25, shade(skin, -0.12), 209 + s);
    vein(c, 0.32 * r, s * 0.5 * r, s * 1.9, 0.55 * r, 213 + s * 3, enr);
    vein(c, -0.3 * r, s * 0.72 * r, Math.PI + s * 0.3, 0.45 * r, 219 + s * 5, enr, 0.035);
  }
  if (look === "growth") {
    stapledScar(c, -0.6 * r, -0.2 * r, -0.05 * r, -0.38 * r, 231);
  }
}
/** Detail on the back (after the shirt / vest and the rebar): scars, fused rubble, blood at the rebar. */
function backDetail(c: G, r: number, look: LookKind): void {
  if (!DETAIL) return;
  if (look === "proto") {
    fusedRubble(c, -0.62 * r, -0.28 * r, 0.22 * r, 241);
    fusedRubble(c, -0.78 * r, 0.42 * r, 0.15 * r, 243);
    stapledScar(c, -0.15 * r, 0.25 * r, -0.55 * r, 0.6 * r, 245);
  } else if (look === "worker") {
    fusedRubble(c, -0.5 * r, 0.3 * r, 0.17 * r, 247);
    stapledScar(c, -0.1 * r, -0.3 * r, -0.5 * r, -0.62 * r, 249);
  } else if (look === "riot") {
    // the vest is split: raw skin and a fused chunk show through the tear
    fillP(c, (q) => blobPath(q, -0.35 * r, 0.32 * r, 0.2 * r, 0.12 * r, 251, 0.35, 24), "#521b15");
    fusedRubble(c, -0.35 * r, 0.32 * r, 0.12 * r, 253);
    stapledScar(c, -0.2 * r, -0.62 * r, 0.1 * r, -0.9 * r, 255);
  } else {
    fusedRubble(c, -0.35 * r, 0.62 * r, 0.15 * r, 257);
  }
  // blood where the rebar goes in
  if (look !== "growth") {
    for (const [x, y] of [
      [-0.45, -0.42],
      [-0.2, 0.45],
    ] as const) {
      fillP(c, (q) => blobPath(q, x * r, y * r, 0.09 * r, 0.08 * r, 259, 0.4, 20), "#3e0e0a");
      fillP(c, (q) => blobPath(q, x * r, y * r, 0.055 * r, 0.05 * r, 261, 0.3, 20), "#8a1e16");
    }
  }
}
/** Arm detail: biceps and forearm swells, veins along the limb. */
function limbDetail(c: G, p: readonly number[], s: number, skin: string, enr: boolean, seed: number): void {
  if (!DETAIL) return;
  const [ax, ay, ex, ey, fx, fy] = p as [number, number, number, number, number, number];
  const ua = Math.atan2(ey - ay, ex - ax);
  const fa = Math.atan2(fy - ey, fx - ex);
  const ul = Math.hypot(ex - ax, ey - ay);
  const fl = Math.hypot(fx - ex, fy - ey);
  muscle(c, lerp(ax, ex, 0.55), lerp(ay, ey, 0.55), ul * 0.36, 0.2, ua, shade(skin, 0.12), seed);
  muscle(c, lerp(ex, fx, 0.4), lerp(ey, fy, 0.4), fl * 0.33, 0.16, fa, shade(skin, 0.08), seed + 1);
  striations(c, lerp(ax, ex, 0.55), lerp(ay, ey, 0.55), ul * 0.32, 0.17, ua + Math.PI / 2, 3, "rgba(24,30,20,0.25)");
  vein(c, lerp(ax, ex, 0.2), lerp(ay, ey, 0.2) + s * 0.08, ua, ul * 0.9, seed + 2, enr, 0.04);
  vein(c, lerp(ex, fx, 0.05), lerp(ey, fy, 0.05) - s * 0.05, fa, fl * 0.8, seed + 3, enr, 0.035);
}
/** Head detail: a heavy brow, a scarred scalp, and teeth bared at the front. */
function headDetail(c: G, r: number, skin: string, roar: boolean): void {
  if (!DETAIL) return;
  part(c, (q) => blobPath(q, 0.1 * r, 0, 0.09 * r, 0.22 * r, 271, 0.08, 24), { base: shade(skin, -0.1), lit: "top", box: [0.01 * r, -0.22 * r, 0.19 * r, 0.22 * r], tex: skinTex(271, 0.6), hi: 0.35, lo: 0.5, rim: 0.3, line: 1 });
  stapledScar(c, -0.2 * r, -0.12 * r, 0.02 * r, -0.2 * r, 273);
  const tx = roar ? 0.26 * r : 0.235 * r;
  for (let i = -3; i <= 3; i++) {
    const y = i * 0.035 * r;
    fillP(c, (q) => Pg(q, [tx - 0.03 * r, y - 0.018 * r, tx + 0.045 * r, y, tx - 0.03 * r, y + 0.018 * r]), "#e2d8bb");
  }
}

/** The pose drawing (reference units, metres, facing +x). `k` = pose progress 0–1, `ph` = walk phase 0–1. */
function behemoth(c: G, r: number, pose: BehemothPose, k: number, look: LookKind, skin: string, enr: boolean, ph: number): void {
  // Story 6.7: the collapse darkens the body as it sags (the corpse reads as no longer a threat).
  const skinC = pose === "dead" ? shade(skin, -0.3 * k) : enr ? "#7d6a5e" : skin;
  const sh = 0.12 * r;
  const sy = 0.82 * r;
  let A: number[];
  let B: number[];
  let headX = 0.62 * r;
  let headY = 0;
  let swell = 1;
  let torsoX = 0;
  const sw = Math.sin(ph * TAU) * 0.16 * r;
  const wL = [0.95 * r + sw, -0.98 * r, 0.33 * r];
  const wR = [0.95 * r - sw, 0.98 * r, 0.33 * r];
  if (pose === "slam") {
    const e = Math.min(1, k * 1.6);
    swell = 1 + 0.07 * e;
    A = [lerp(wL[0] as number, 0.2 * r, e), lerp(wL[1] as number, -0.34 * r, e), lerp(0.33, 0.44, e) * r];
    B = [lerp(wR[0] as number, 0.2 * r, e), lerp(wR[1] as number, 0.34 * r, e), lerp(0.33, 0.44, e) * r];
  } else if (pose === "slamHit") {
    A = [1.12 * r, -0.5 * r, 0.36 * r];
    B = [1.12 * r, 0.5 * r, 0.36 * r];
    headX = 0.7 * r;
  } else if (pose === "charge" || pose === "rush") {
    const e = pose === "rush" ? 1 : Math.min(1, k * 2);
    headX = lerp(0.62, 0.9, e) * r;
    torsoX = 0.1 * r * e;
    A = [lerp(wL[0] as number, -0.3 * r, e), lerp(wL[1] as number, -1.08 * r, e), 0.33 * r];
    B = [lerp(wR[0] as number, -0.3 * r, e), lerp(wR[1] as number, 1.08 * r, e), 0.33 * r];
  } else if (pose === "throw") {
    const e = Math.min(1, k * 1.8);
    A = [0.9 * r, -0.95 * r, 0.33 * r];
    B = [lerp(wR[0] as number, -0.15 * r, e), lerp(wR[1] as number, 0.15 * r, e), lerp(0.33, 0.42, e) * r];
  } else if (pose === "stun") {
    A = [0.3 * r, -1.28 * r, 0.32 * r];
    B = [0.42 * r, 1.25 * r, 0.32 * r];
    headX = 0.55 * r;
    headY = 0.22 * r;
  } else if (pose === "dead") {
    // Story 6.7 (D6): from the stun's slump to sprawled flat, arms thrown wide, head lolled aside.
    A = [lerp(0.3, -0.15, k) * r, lerp(-1.28, -1.5, k) * r, 0.32 * r];
    B = [lerp(0.42, 0.05, k) * r, lerp(1.25, 1.45, k) * r, 0.32 * r];
    headX = lerp(0.55, 0.78, k) * r;
    headY = lerp(0.22, 0.5, k) * r;
    swell = lerp(1, 0.92, k);
  } else if (pose === "roar") {
    A = [0.45 * r, -1.32 * r, 0.35 * r];
    B = [0.45 * r, 1.32 * r, 0.35 * r];
    headX = 0.5 * r;
    swell = 1.08;
  } else {
    A = wL;
    B = wR;
  }
  const raised = pose === "slam" || pose === "throw";
  castShadow(
    c,
    (q) => {
      q.beginPath();
      E(q, -0.08 * r, 0, r * 0.8, r * 0.92);
      q.fill();
    },
    0.18,
    0.26,
    0.18,
    0.42,
  );
  const arms = (): void => {
    for (const [F, s] of [
      [A, -1],
      [B, 1],
    ] as const) {
      const fx = F[0] as number;
      const fy = F[1] as number;
      const ex = (sh + fx) / 2 - 0.12 * r;
      const ey = (s * sy + fy) / 2 + s * 0.1 * r;
      drawLimb(c, [sh, s * sy, ex, ey, fx, fy], [0.5 * r, 0.44 * r, 0.38 * r], skinC, 51 + s * 7, { knobs: false });
      limbDetail(c, [sh, s * sy, ex, ey, fx, fy], s, skinC, enr, 281 + s * 11);
      if (look === "riot" && s < 0) {
        fillP(c, (q) => E(q, lerp(ex, fx, 0.7), lerp(ey, fy, 0.7), 0.2 * r, 0.24 * r), "#1d1f22");
        strokeP(c, (q) => E(q, lerp(ex, fx, 0.7), lerp(ey, fy, 0.7), 0.2 * r, 0.24 * r), "#8a8d92", 0.04);
      }
      fist(c, fx, fy, Math.atan2(fy - ey, fx - ex), F[2] as number, skinC, 61 + s * 5, raised ? 1 : 0);
    }
  };
  if (!raised) arms();
  c.save();
  c.translate(torsoX, 0);
  c.scale(swell, swell);
  lump(c, -0.2 * r, 0, 0.68 * r, 0.82 * r, skinC, 71, 0.28);
  for (const s of [-1, 1]) lump(c, 0.14 * r, s * 0.6 * r, 0.44 * r, 0.4 * r, skinC, 73 + s, 0.34);
  torsoDetail(c, r, look, skinC, enr);
  if (look === "proto" || look === "worker") {
    const torn: Path = (q) => {
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * TAU;
        const j = 1 + 0.16 * Math.sin(a * 7 + 1.3) * (Math.cos(a) < 0.2 ? 1 : 0.3) + 0.05 * Math.sin(a * 19);
        const x = -0.28 * r + Math.cos(a) * 0.56 * r * j;
        const y = Math.sin(a) * 0.67 * r * j;
        if (i) q.lineTo(x, y);
        else q.moveTo(x, y);
      }
      q.closePath();
    };
    const col = look === "worker" ? "#d2861c" : "#2a2f37";
    part(c, torn, { base: col, lit: "radial", box: [-0.9 * r, -0.7 * r, 0.3 * r, 0.7 * r], tex: clothTex(81, look === "worker" ? "60,40,10" : "60,30,20"), hi: 0.3, lo: 0.55, rim: 0.25, inner: 0.3, line: 1.4 });
    if (look === "worker") {
      c.save();
      c.beginPath();
      torn(c);
      c.clip();
      for (const yy of [-0.42, 0.42]) {
        fillP(c, (q) => R(q, -0.95 * r, yy * r - 0.05 * r, 1.2 * r, 0.1 * r), "#c8ccd0");
        fillP(c, (q) => R(q, -0.95 * r, yy * r - 0.05 * r, 1.2 * r, 0.03 * r), "rgba(255,255,255,0.5)");
      }
      fillP(c, (q) => R(q, -0.62 * r, -0.7 * r, 0.1 * r, 1.4 * r), "#c8ccd0");
      c.restore();
    }
    part(c, (q) => blobPath(q, -0.36 * r, 0, 0.44 * r, 0.12 * r, 83, 0.25, 30), { base: shade(skinC, -0.08), lit: "top", box: [-0.8 * r, -0.12 * r, 0.1 * r, 0.12 * r], tex: skinTex(83, 1), hi: 0.2, lo: 0.5, rim: 0.2, line: 1.3 });
    for (let i = 0; i < 6; i++) {
      const x = -0.72 * r + i * 0.135 * r;
      part(c, (q) => E(q, x, 0, 0.05 * r, 0.065 * r), { base: "#a39b85", lit: "radial", box: [x - 0.05 * r, -0.065 * r, x + 0.05 * r, 0.065 * r], hi: 0.4, lo: 0.4, rim: 0.2, line: 1 });
    }
  }
  if (look === "growth") {
    const rr = mulberry(91);
    for (let i = 0; i < 9; i++) {
      const x = (-0.75 + rr() * 0.9) * r;
      const y = (rr() - 0.5) * 1.3 * r;
      const s = (0.14 + rr() * 0.16) * r;
      lump(c, x, y, s, s * 0.85, shade(skinC, (rr() - 0.5) * 0.25), 95 + i, 0.4);
    }
    for (let i = 0; i < 7; i++) {
      const x = (-0.85 + i * 0.16) * r;
      part(c, (q) => Pg(q, [x - 0.06 * r, -0.05 * r, x + 0.1 * r, 0, x - 0.06 * r, 0.05 * r]), { base: "#d8d0b8", lit: "top", box: [x - 0.06 * r, -0.05 * r, x + 0.1 * r, 0.05 * r], hi: 0.4, lo: 0.4, rim: 0.3, line: 1 });
    }
    for (let i = 0; i < 8; i++) {
      const x = (-0.6 + rr() * 0.8) * r;
      const y = (rr() - 0.5) * 1.4 * r;
      glow(c, x, y, 0.16 * r, "190,220,90", 0.35);
      part(c, (q) => E(q, x, y, 0.045 * r, 0.04 * r), { base: "#b8c95a", lit: "radial", box: [x - 0.05 * r, y - 0.05 * r, x + 0.05 * r, y + 0.05 * r], hi: 0.6, lo: 0.3, rim: 0.3, line: 0.9 });
    }
  }
  if (look === "riot") {
    part(c, (q) => R(q, -0.86 * r, -0.52 * r, 0.86 * r, 1.04 * r, 0.18 * r), { base: "#1f2226", lit: "top", box: [-0.86 * r, -0.52 * r, 0, 0.52 * r], tex: polyTex(97), hi: 0.35, lo: 0.5, rim: 0.35, line: 1.6 });
    c.save();
    c.translate(-0.43 * r, 0);
    c.rotate(-Math.PI / 2);
    c.fillStyle = "rgba(220,222,226,0.55)";
    c.font = `700 ${0.2 * r}px Oswald, Impact, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("POLICE", 0, 0);
    c.restore();
    for (const s of [-1, 1]) part(c, (q) => blobPath(q, 0.14 * r, s * 0.62 * r, 0.32 * r, 0.28 * r, 99 + s, 0.05, 30), { base: "#2a2d32", lit: "radial", box: [-0.2 * r, s * 0.62 * r - 0.3 * r, 0.46 * r, s * 0.62 * r + 0.3 * r], tex: polyTex(98), hi: 0.45, lo: 0.5, rim: 0.4, line: 1.4 });
    for (let i = 0; i < 6; i++) rivet(c, -0.78 * r + i * 0.14 * r, (i % 2 ? 1 : -1) * 0.46 * r, 0.03 * r, "#7d8086");
  }
  if (look !== "growth") {
    rebar(c, -0.45 * r, -0.42 * r, -0.95 * r, -0.72 * r);
    rebar(c, -0.2 * r, 0.45 * r, -0.66 * r, 0.92 * r);
    if (look !== "riot") rebar(c, -0.62 * r, 0.16 * r, -1.15 * r, 0.28 * r);
  }
  if (look === "worker" || look === "riot") {
    for (let i = 0; i < 9; i++) {
      const x = -0.7 * r - i * 0.13 * r;
      const y = 0.6 * r + Math.sin(i * 1.3) * 0.08 * r;
      strokeP(c, (q) => E(q, x, y, 0.07 * r, 0.04 * r), "#0d0d0e", 0.05);
      strokeP(c, (q) => E(q, x, y, 0.07 * r, 0.04 * r), "#7c7f84", 0.025);
    }
  }
  backDetail(c, r, look);
  wound(c, 0.2 * r, -0.62 * r, 0.12 * r, 101);
  if (look !== "riot") wound(c, 0.05 * r, 0.75 * r, 0.09 * r, 103);
  if (enr) {
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 9; i++) {
      let x = (hash(i + 9) * 0.7 - 0.3) * r;
      let y = (hash(i * 5 + 2) - 0.5) * 1.5 * r;
      const pts = [x, y];
      for (let j = 0; j < 5; j++) {
        x += (hash(i * 13 + j) - 0.5) * 0.32 * r;
        y += (hash(i * 17 + j * 3) - 0.5) * 0.32 * r;
        pts.push(x, y);
      }
      strokeP(
        c,
        (q) => {
          q.moveTo(pts[0] as number, pts[1] as number);
          for (let j = 2; j < pts.length; j += 2) q.lineTo(pts[j] as number, pts[j + 1] as number);
        },
        "rgba(255,70,40,0.55)",
        0.05,
      );
    }
    c.restore();
  }
  c.restore();
  if (raised) arms();
  if (pose === "throw") {
    const e = Math.min(1, k * 1.8);
    c.save();
    c.translate(lerp(0.9 * r, -0.05 * r, e), lerp(0.9 * r, 0.05 * r, e));
    c.rotate(0.4);
    const s = lerp(0.6, 1.0, e);
    c.scale(s, s);
    throwChunk(c);
    c.restore();
  }
  c.save();
  c.translate(headX, headY);
  part(c, (q) => E(q, 0, 0, 0.27 * r, 0.25 * r), { base: shade(skinC, -0.04), lit: "radial", box: [-0.27 * r, -0.25 * r, 0.27 * r, 0.25 * r], tex: skinTex(111, 1.3), hi: 0.4, lo: 0.55, rim: 0.3, line: 1.5 });
  if (look === "worker") {
    part(
      c,
      (q) => {
        q.ellipse(-0.04 * r, 0, 0.25 * r, 0.26 * r, 0, Math.PI * 0.62, Math.PI * 1.38);
        q.closePath();
      },
      { base: "#d9b21f", lit: "radial", box: [-0.29 * r, -0.26 * r, 0.05 * r, 0.26 * r], hi: 0.5, lo: 0.45, rim: 0.35, line: 1.3 },
    );
  }
  fillP(c, (q) => E(q, 0.08 * r, 0, 0.08 * r, 0.2 * r), shade(skinC, -0.38));
  headDetail(c, r, skinC, pose === "roar");
  if (pose === "roar") fillP(c, (q) => E(q, 0.19 * r, 0, 0.1 * r, 0.12 * r), "#1a0606");
  if (pose !== "dead") drawEyes(c, r, enr); // Story 6.7: a dead body has no glowing eyes (no false danger in the dark)
  c.restore();
}

function drawEyes(c: G, r: number, enr: boolean): void {
  const eye = enr ? "255,74,46" : "240,214,106";
  for (const s of [-1, 1]) {
    glow(c, 0.16 * r, s * 0.08 * r, 0.12 * r, eye, enr ? 0.7 : 0.4);
    fillP(c, (q) => E(q, 0.16 * r, s * 0.08 * r, 0.035 * r, 0.035 * r), `rgb(${eye})`);
  }
}

/**
 * The outline + eyes overlay (drawn above the darkness in a blackout, 6.3; DD10): a light rim of
 * the body's silhouette and the two eyes (red when enraged). Its own frame so the pose reads in the dark.
 */
function outlineEyes(c: G, r: number, enr: boolean): void {
  c.save();
  c.strokeStyle = enr ? "rgba(255,110,80,0.75)" : "rgba(220,226,235,0.6)";
  c.lineWidth = 0.09;
  c.beginPath();
  E(c, -0.2 * r, 0, 0.7 * r, 0.84 * r);
  c.stroke();
  for (const s of [-1, 1]) {
    c.beginPath();
    E(c, 0.14 * r, s * 0.62 * r, 0.44 * r, 0.4 * r);
    c.stroke();
  }
  c.translate(0.62 * r, 0);
  drawEyes(c, r, enr);
  c.restore();
}

/**
 * Draws Behemoth look `variant` (0–3) in `pose` into a frame centred at the context origin, facing
 * +x, at `pxPerM` px per metre. `outline` draws the overlay frame instead.
 */
export function drawBehemoth(c: G, pxPerM: number, variant: number, pose: BehemothPose | "outline", k: number, enraged: boolean, ph = 0): void {
  const L = LOOKS[((variant % LOOKS.length) + LOOKS.length) % LOOKS.length] as (typeof LOOKS)[number];
  c.save();
  c.scale(pxPerM, pxPerM);
  setArtPixel(1 / pxPerM);
  if (pose === "outline") outlineEyes(c, BH_R_M, enraged);
  else behemoth(c, BH_R_M, pose, k, L.look, L.skin, enraged, ph);
  c.restore();
}
