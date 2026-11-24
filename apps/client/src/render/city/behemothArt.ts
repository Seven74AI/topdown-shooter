import { artKit, setArtPixel } from "./bruteArt";

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

export type BehemothPose = "walk" | "slam" | "slamHit" | "charge" | "rush" | "throw" | "stun" | "roar";

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

/** The pose drawing (reference units, metres, facing +x). `k` = pose progress 0–1, `ph` = walk phase 0–1. */
function behemoth(c: G, r: number, pose: BehemothPose, k: number, look: LookKind, skin: string, enr: boolean, ph: number): void {
  const skinC = enr ? "#7d6a5e" : skin;
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
  if (pose === "roar") fillP(c, (q) => E(q, 0.19 * r, 0, 0.1 * r, 0.12 * r), "#1a0606");
  drawEyes(c, r, enr);
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
