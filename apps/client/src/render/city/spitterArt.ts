/**
 * Story 5.6: the Spitter, drawn in game code (designer's art method, `docs/epic-5-decisions.md`).
 * Designer's pick (2026-11-23): **P4 "gaunt"**, ported from the round-2 code drawing
 * (`docs/art/epic-5/round-a/code-drawings.html`): pustules on back and shoulders, an open mouth
 * dripping acid, a trail of acid drops. The whole look lives in `drawSpitter`.
 *
 * The reference draws in metres, facing +y, ~0.8 m tall; the atlas wants px, facing +x, centred on
 * the body (`r` px = the 0.35 m collision radius). The cast shadows of the reference are left out
 * (the sprite rotates in game; no other character bakes a shadow). The acid glob and puddle (FX
 * frames) are drawn here too, so one file holds the Spitter's whole look.
 */

type G = CanvasRenderingContext2D;
type Path = (c: G) => void;
type Tex = (c: G, x0: number, y0: number, x1: number, y1: number) => void;

const TAU = Math.PI * 2;
/** Body radius (m) the reference is drawn around. */
const REF_BODY_R_M = 0.35;
/**
 * The reference is drawn small for its 0.35 m body (back 0.27 m wide); at that size it read as a dot
 * next to a Walker. Drawn this much larger so it matches a Walker's bulk (back ~0.46 m, arms
 * ~0.8 m across, mouth ~0.55 m ahead): a distinct, readable silhouette at ~0.8 m (AC 17).
 */
export const SPITTER_ART_SCALE = 1.7;
/** The reference's body centre (m): the frame centre. */
const REF_CENTRE_Y_M = 0.02;
/** One device px in reference units (set per drawing). */
let P = 1;

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function E(c: G, x: number, y: number, rx: number, ry: number, a = 0): void {
  c.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a));
  c.ellipse(x, y, Math.max(1e-5, rx), Math.max(1e-5, ry), a, 0, TAU);
  c.closePath();
}
function Pg(c: G, p: readonly number[]): void {
  c.moveTo(p[0] as number, p[1] as number);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] as number, p[i + 1] as number);
  c.closePath();
}
function blobPath(c: G, cx: number, cy: number, rx: number, ry: number, seed: number, amp = 0.15, n = 56, rot = 0): void {
  const r = mulberry(seed);
  const ph = [r() * TAU, r() * TAU, r() * TAU] as const;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + amp * (0.5 * Math.sin(a * 2 + ph[0]) + 0.3 * Math.sin(a * 3 + ph[1]) + 0.2 * Math.sin(a * 5 + ph[2]));
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    const X = cx + x * cr - y * sr;
    const Y = cy + x * sr + y * cr;
    if (i) c.lineTo(X, Y);
    else c.moveTo(X, Y);
  }
  c.closePath();
}
function fillP(c: G, fn: Path, style: string | CanvasGradient): void {
  c.beginPath();
  fn(c);
  c.fillStyle = style;
  c.fill();
}
function strokeP(c: G, fn: Path, style: string, w: number, cap: CanvasLineCap = "round"): void {
  c.beginPath();
  fn(c);
  c.strokeStyle = style;
  c.lineWidth = w;
  c.lineCap = cap;
  c.lineJoin = "round";
  c.stroke();
}
function devToLocal(c: G, dx: number, dy: number): [number, number] {
  const m = c.getTransform();
  const det = m.a * m.d - m.b * m.c || 1;
  return [(m.d * dx - m.c * dy) / det, (-m.b * dx + m.a * dy) / det];
}
function lightDir(c: G): [number, number] {
  const v = devToLocal(c, -1, -1);
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}
function glow(c: G, x: number, y: number, r: number, rgb: string, a: number): void {
  if (a <= 0) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${Math.min(1, a)})`);
  g.addColorStop(0.3, `rgba(${rgb},${Math.min(1, a * 0.5)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.restore();
}

interface PartOpts {
  base: string;
  box: readonly [number, number, number, number];
  lit?: "top" | "radial";
  hi?: number;
  lo?: number;
  tex?: Tex | null;
  rim?: number;
  inner?: number;
  line?: number;
  stroke?: string;
}

/** One shaded part: fill, texture, light gradient, rim light upper-left, inner shade lower-right, outline. */
function part(c: G, path: Path, o: PartOpts): void {
  const [x0, y0, x1, y1] = o.box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = x1 - x0;
  const h = y1 - y0;
  c.beginPath();
  path(c);
  c.fillStyle = o.base;
  c.fill();
  c.save();
  c.clip();
  if (o.tex) o.tex(c, x0, y0, x1, y1);
  const hi = o.hi ?? 0.22;
  const lo = o.lo ?? 0.4;
  let g: CanvasGradient;
  const L = lightDir(c);
  if (o.lit === "top") {
    const s = Math.hypot(w, h) / 2;
    g = c.createLinearGradient(cx + L[0] * s, cy + L[1] * s, cx - L[0] * s, cy - L[1] * s);
    g.addColorStop(0, `rgba(200,215,240,${hi})`);
    g.addColorStop(0.5, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${lo})`);
  } else {
    const m = Math.max(w, h);
    g = c.createRadialGradient(cx + L[0] * w * 0.28, cy + L[1] * h * 0.32, 0, cx, cy, m * 0.62);
    g.addColorStop(0, `rgba(225,235,255,${hi})`);
    g.addColorStop(0.45, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${lo})`);
  }
  c.fillStyle = g;
  c.fillRect(x0 - w, y0 - h, w * 3, h * 3);
  const rim = o.rim ?? 0.42;
  if (rim > 0) {
    const d = devToLocal(c, 1.2, 1.4);
    c.beginPath();
    c.rect(x0 - w, y0 - h, w * 3, h * 3);
    c.save();
    c.translate(d[0], d[1]);
    path(c);
    c.restore();
    c.fillStyle = `rgba(195,210,235,${rim})`;
    c.fill("evenodd");
  }
  const dk = o.inner ?? 0.32;
  if (dk > 0) {
    const d = devToLocal(c, -1.1, -1.2);
    c.beginPath();
    c.rect(x0 - w, y0 - h, w * 3, h * 3);
    c.save();
    c.translate(d[0], d[1]);
    path(c);
    c.restore();
    c.fillStyle = `rgba(0,0,0,${dk})`;
    c.fill("evenodd");
  }
  c.restore();
  if (o.line !== 0) {
    c.beginPath();
    path(c);
    c.lineJoin = "round";
    c.strokeStyle = o.stroke ?? "rgba(4,4,6,0.95)";
    c.lineWidth = (o.line ?? 1.3) * P;
    c.stroke();
  }
}

function skinTex(seed: number, veins = 1): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const m = Math.min(w, h);
    const cols = ["85,110,75", "115,80,98", "58,66,52", "150,150,125"];
    for (let i = 0; i < 14; i++) {
      const x = x0 + r() * w;
      const y = y0 + r() * h;
      const rr = m * (0.12 + r() * 0.32);
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      const col = cols[i % 4] as string;
      g.addColorStop(0, `rgba(${col},${0.12 + r() * 0.2})`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      c.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
    }
    for (let i = 0; i < 7 * veins; i++) {
      let x = x0 + r() * w;
      let y = y0 + r() * h;
      let a = r() * TAU;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        a += (r() - 0.5) * 1.3;
        x += Math.cos(a) * m * 0.05;
        y += Math.sin(a) * m * 0.05;
        c.lineTo(x, y);
      }
      c.strokeStyle = `rgba(72,58,96,${0.18 + r() * 0.18})`;
      c.lineWidth = (0.6 + r() * 0.7) * P;
      c.stroke();
    }
  };
}

function clothTex(seed: number, stain = "60,30,20"): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    c.lineWidth = 0.5 * P;
    c.strokeStyle = "rgba(0,0,0,0.12)";
    c.beginPath();
    for (let x = x0; x < x1; x += 2.2 * P) {
      c.moveTo(x, y0);
      c.lineTo(x + h * 0.2, y1);
    }
    c.stroke();
    for (let i = 0; i < 9; i++) {
      const x = x0 + r() * w;
      const y = y0 + r() * h;
      const rr = Math.min(w, h) * (0.08 + r() * 0.25);
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      const col = i % 3 === 0 ? stain : "20,18,14";
      g.addColorStop(0, `rgba(${col},${0.2 + r() * 0.3})`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      c.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
    }
  };
}

function taperPath(pts: readonly number[], ws: readonly number[]): Path {
  const n = pts.length / 2;
  const Q: [number, number][] = [];
  const N: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = (pts[2 * b] as number) - (pts[2 * a] as number);
    const dy = (pts[2 * b + 1] as number) - (pts[2 * a + 1] as number);
    const l = Math.hypot(dx, dy) || 1;
    Q.push([pts[2 * i] as number, pts[2 * i + 1] as number]);
    N.push([-dy / l, dx / l]);
  }
  const q = (i: number) => Q[i] as [number, number];
  const nn = (i: number) => N[i] as [number, number];
  return (c) => {
    const w = (i: number) => (ws[i] as number) / 2;
    c.moveTo(q(0)[0] + nn(0)[0] * w(0), q(0)[1] + nn(0)[1] * w(0));
    for (let i = 1; i < n; i++) c.lineTo(q(i)[0] + nn(i)[0] * w(i), q(i)[1] + nn(i)[1] * w(i));
    const e = n - 1;
    const tx = nn(e)[1];
    const ty = -nn(e)[0];
    for (let k = 1; k <= 8; k++) {
      const th = (k / 8) * Math.PI;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      c.lineTo(q(e)[0] + (nn(e)[0] * cs + tx * sn) * w(e), q(e)[1] + (nn(e)[1] * cs + ty * sn) * w(e));
    }
    for (let i = n - 2; i >= 0; i--) c.lineTo(q(i)[0] - nn(i)[0] * w(i), q(i)[1] - nn(i)[1] * w(i));
    const sx = nn(0)[1];
    const sy = -nn(0)[0];
    for (let k = 1; k <= 8; k++) {
      const th = (k / 8) * Math.PI;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      c.lineTo(q(0)[0] + (-nn(0)[0] * cs - sx * sn) * w(0), q(0)[1] + (-nn(0)[1] * cs - sy * sn) * w(0));
    }
    c.closePath();
  };
}

function drawLimb(c: G, pts: readonly number[], ws: readonly number[], col: string, seed: number, o: { tex?: Tex | null; hi?: number; line?: number } = {}): void {
  const path = taperPath(pts, ws);
  const m = Math.max(...ws) / 2;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, (pts[i] as number) - m);
    x1 = Math.max(x1, (pts[i] as number) + m);
    y0 = Math.min(y0, (pts[i + 1] as number) - m);
    y1 = Math.max(y1, (pts[i + 1] as number) + m);
  }
  part(c, path, { base: col, lit: "top", box: [x0, y0, x1, y1], hi: o.hi ?? 0.3, lo: 0.45, tex: o.tex === undefined ? skinTex(seed, 0.5) : o.tex, rim: 0.45, inner: 0.35, line: o.line ?? 1.2 });
}

function hand(c: G, x: number, y: number, ang: number, s: number, col: string, seed: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const fa = [-0.45, -0.15, 0.15, 0.45];
  for (let k = 0; k < 4; k++) {
    const a = fa[k] as number;
    const l = s * (1.55 - Math.abs(a) * 0.7);
    const r0 = s * 0.42;
    const p = [Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * (r0 + l * 0.55), Math.sin(a) * (r0 + l * 0.55), Math.cos(a * 1.2) * (r0 + l) + s * 0.04, Math.sin(a * 1.2) * (r0 + l)];
    drawLimb(c, p, [s * 0.27, s * 0.22, s * 0.15], col, seed + k, { tex: null, hi: 0.25, line: 1 });
    fillP(c, (c) => E(c, (p[4] as number) + s * 0.07, p[5] as number, s * 0.07, s * 0.05), "#231d19");
  }
  part(c, (c) => E(c, 0, 0, s * 0.55, s * 0.5), { base: col, lit: "radial", box: [-s * 0.55, -s * 0.5, s * 0.55, s * 0.5], hi: 0.3, lo: 0.4, rim: 0.3, line: 1.1 });
  c.restore();
}

/** One acid drop (also the in-flight glob's core). */
function acidDrop(c: G, x: number, y: number, r: number, pu: number, gl = 1, glowR = 4): void {
  glow(c, x, y, r * glowR, "120,255,40", 0.25 * pu * gl);
  c.beginPath();
  E(c, x, y, r, r * 0.9);
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, "#e8ff9a");
  g.addColorStop(0.5, "#8fe03a");
  g.addColorStop(1, "#3d7a14");
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 0.7 * P;
  c.strokeStyle = "rgba(20,50,8,0.8)";
  c.stroke();
  fillP(c, (c) => E(c, x - r * 0.35, y - r * 0.35, r * 0.28, r * 0.2), "rgba(255,255,255,0.7)");
}

/** Skin tones per variant (a crowd of Spitters is not all one colour). */
export const SPITTER_SKINS = ["#7f806c", "#7a7466"] as const;

function foot(c: G, x: number, y: number, a: number, col: string, s: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.scale(s, s);
  part(c, (c) => E(c, 0, 0, 0.038, 0.068), { base: col, lit: "radial", box: [-0.038, -0.068, 0.038, 0.068], hi: 0.3, lo: 0.45, rim: 0.25 });
  for (let i = 0; i < 5; i++) {
    const tx = -0.026 + i * 0.013;
    const ty = 0.066 - Math.abs(i - 1.5) * 0.004;
    fillP(c, (c) => E(c, tx, ty, 0.0075, 0.009), col);
  }
  c.restore();
}

/**
 * The Spitter (designer's pick: P4 "gaunt", round 2), top-down, facing +x, centred on its body, `r` =
 * collision radius in px: a bony bare back and shoulders covered in glowing green pustules, ribs and
 * spine showing, torn trousers, long clawed arms reaching forward, a small head with an open mouth
 * dripping acid, a short trail of acid drops behind. `windup`: the rearing-back pose (mouth gaping
 * and blazing, pustules flaring, arms pulled back) shown while it winds up (the telegraph).
 */
export function drawSpitter(c: G, r: number, variant: number, windup: boolean): void {
  const ppm = (r / REF_BODY_R_M) * SPITTER_ART_SCALE;
  c.save();
  c.rotate(-Math.PI / 2); // reference faces +y → frame faces +x
  c.scale(ppm, ppm);
  c.translate(0, -REF_CENTRE_Y_M);
  P = 1 / ppm;
  const pu = windup ? 1.7 : 0.9;
  const SK = SPITTER_SKINS[variant % SPITTER_SKINS.length] as string;
  const PANTS = "#363b44";
  const tor: Path = (c) => {
    c.moveTo(0, 0.175);
    c.bezierCurveTo(0.1, 0.175, 0.15, 0.11, 0.135, 0.02);
    c.bezierCurveTo(0.125, -0.07, 0.09, -0.15, 0, -0.165);
    c.bezierCurveTo(-0.09, -0.15, -0.125, -0.07, -0.135, 0.02);
    c.bezierCurveTo(-0.15, 0.11, -0.1, 0.175, 0, 0.175);
    c.closePath();
  };
  const thighL = [-0.07, -0.12, -0.185, -0.2];
  const shinL = [-0.185, -0.2, -0.13, -0.3];
  const thighR = [0.07, -0.12, 0.19, -0.195];
  const shinR = [0.19, -0.195, 0.138, -0.298];
  const pull = windup ? -0.035 : 0; // rearing back: hands come in toward the chest
  const armL = [-0.11, 0.12, -0.235, 0.16 + pull, -0.215, 0.29 + pull * 2];
  const armR = [0.11, 0.12, 0.24, 0.165 + pull, 0.205, 0.298 + pull * 2];
  // a short acid trail behind (kept inside the frame)
  const tr = mulberry(402);
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const x = 0.02 - 0.06 * k * k + Math.sin(k * 5) * 0.025 + (tr() - 0.5) * 0.02;
    const y = -0.32 - k * 0.08;
    acidDrop(c, x, y, 0.007 + tr() * 0.009 * (1 - k * 0.5), pu, 0.6, 2.5);
  }
  drawLimb(c, shinL, [0.058, 0.044], SK, 449);
  drawLimb(c, shinR, [0.058, 0.044], SK, 451);
  foot(c, -0.125, -0.32, Math.PI - 0.3, "#5d5e50", 0.72);
  foot(c, 0.135, -0.318, Math.PI + 0.3, "#5d5e50", 0.72);
  for (const [th, s] of [
    [thighL, -1],
    [thighR, 1],
  ] as const) {
    drawLimb(c, th, [0.09, 0.072], PANTS, 460 + s, { tex: clothTex(461), hi: 0.18 });
  }
  drawLimb(c, armL, [0.072, 0.056, 0.044], SK, 480);
  drawLimb(c, armR, [0.072, 0.056, 0.044], SK, 481);
  hand(c, armL[4] as number, armL[5] as number, 1.75, 0.033, SK, 490);
  hand(c, armR[4] as number, armR[5] as number, 1.35, 0.033, SK, 495);
  part(
    c,
    (c) => {
      const rr = mulberry(403);
      c.moveTo(-0.11, -0.11);
      for (let i = 0; i <= 10; i++) c.lineTo(-0.11 + i * 0.022, -0.11 + (rr() - 0.5) * 0.022);
      c.lineTo(0.1, -0.175);
      c.lineTo(-0.1, -0.175);
      c.closePath();
    },
    { base: "#2c3038", lit: "radial", box: [-0.11, -0.175, 0.11, -0.1], hi: 0.2, lo: 0.5, tex: clothTex(404) },
  );
  part(c, tor, { base: SK, lit: "radial", box: [-0.14, -0.17, 0.14, 0.18], hi: 0.36, lo: 0.62, tex: skinTex(405, 1.6) });
  c.save();
  c.beginPath();
  tor(c);
  c.clip();
  // ribs and spine
  for (let i = 0; i < 7; i++) {
    const y = -0.11 + i * 0.029;
    for (const s of [-1, 1]) {
      strokeP(
        c,
        (c) => {
          c.moveTo(s * 0.02, y);
          c.quadraticCurveTo(s * 0.075, y - 0.018, s * 0.14, y + 0.02);
        },
        "rgba(20,18,12,0.5)",
        2.4 * P,
      );
    }
  }
  for (const s of [-1, 1]) part(c, (c) => blobPath(c, s * 0.06, 0.09, 0.052, 0.06, 406 + s, 0.15, 40, s * 0.3), { base: "#878873", lit: "radial", box: [s * 0.06 - 0.052, 0.03, s * 0.06 + 0.052, 0.15], hi: 0.3, lo: 0.35, rim: 0.25, inner: 0.2, line: 0 });
  for (let i = 0; i < 11; i++) {
    const y = -0.15 + i * 0.03;
    part(c, (c) => E(c, 0, y, 0.015, 0.011), { base: "#8e8f7a", lit: "radial", box: [-0.015, y - 0.011, 0.015, y + 0.011], hi: 0.45, lo: 0.5, rim: 0.25, line: 0.8, stroke: "rgba(20,18,12,0.6)" });
  }
  c.restore();
  c.beginPath();
  tor(c);
  c.strokeStyle = "rgba(6,6,7,0.9)";
  c.lineWidth = 1.4 * P;
  c.stroke();
  // pustules on back and shoulders (glowing acid green: the Spitter's mark at a glance)
  const pr = mulberry(410);
  const pus: [number, number, number, boolean][] = [];
  for (let i = 0; i < 24; i++) {
    let x: number;
    let y: number;
    if (i < 13) {
      const s = i % 2 ? 1 : -1;
      x = s * (0.035 + pr() * 0.09);
      y = 0.04 + pr() * 0.11;
    } else {
      x = (pr() - 0.5) * 0.2;
      y = -0.12 + pr() * 0.17;
    }
    pus.push([x, y, 0.01 + pr() * (i < 13 ? 0.02 : 0.014), pr() < 0.2]);
  }
  for (const s of [-1, 1]) pus.push([s * 0.15, 0.13, 0.019, false], [s * 0.19, 0.15, 0.013, false], [s * 0.215, 0.19, 0.01, true]);
  for (const [x, y, rr, burst] of pus) {
    fillP(c, (c) => E(c, x, y, rr * 1.5, rr * 1.38), "rgba(125,55,40,0.5)");
    if (burst) {
      fillP(c, (c) => E(c, x, y, rr, rr * 0.9), "#1c270c");
      glow(c, x, y, rr * 1.8, "120,255,40", 0.32 * pu);
      const d = x > 0 ? 1 : -1;
      strokeP(
        c,
        (c) => {
          c.moveTo(x, y);
          c.quadraticCurveTo(x + d * rr * 1.5, y + rr, x + d * rr * 2.4, y + rr * 2.6);
        },
        "rgba(165,242,60,0.85)",
        rr * 0.35,
      );
      continue;
    }
    glow(c, x, y, rr * 2.3, "130,255,50", 0.24 * pu);
    c.beginPath();
    E(c, x, y, rr, rr * 0.92);
    const g = c.createRadialGradient(x - rr * 0.35, y - rr * 0.4, 0, x, y, rr);
    g.addColorStop(0, "#f4ffb8");
    g.addColorStop(0.35, "#bdf24c");
    g.addColorStop(0.8, "#5b9c1f");
    g.addColorStop(1, "#2a4c0f");
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 0.9 * P;
    c.strokeStyle = "rgba(28,38,10,0.9)";
    c.stroke();
    fillP(c, (c) => E(c, x - rr * 0.4, y - rr * 0.42, rr * 0.26, rr * 0.17, -0.6), "rgba(255,255,255,0.85)");
  }
  // head: ears, skull, thin hair, a wound, two small pustules
  fillP(c, (c) => E(c, -0.074, 0.245, 0.014, 0.023), "#73735f");
  fillP(c, (c) => E(c, 0.074, 0.245, 0.014, 0.023), "#73735f");
  part(c, (c) => E(c, 0, 0.25, 0.075, 0.084), { base: "#8b8c78", lit: "radial", box: [-0.075, 0.166, 0.075, 0.334], hi: 0.48, lo: 0.58, tex: skinTex(420) });
  const hr2 = mulberry(421);
  for (let i = 0; i < 12; i++) {
    const x = (hr2() - 0.5) * 0.08;
    const y = 0.21 + hr2() * 0.07;
    const ex = x + (hr2() - 0.5) * 0.02;
    strokeP(
      c,
      (c) => {
        c.moveTo(x, y);
        c.lineTo(ex, y - 0.026);
      },
      "rgba(25,22,18,0.6)",
      0.9 * P,
    );
  }
  fillP(c, (c) => blobPath(c, 0.016, 0.245, 0.019, 0.012, 422, 0.4), "rgba(85,20,15,0.65)");
  for (const [px, py, pr2] of [
    [-0.03, 0.22, 0.008],
    [0.025, 0.29, 0.006],
  ] as const) {
    glow(c, px, py, pr2 * 2.5, "130,255,50", 0.25 * pu);
    fillP(c, (c) => E(c, px, py, pr2, pr2), "#a6e044");
  }
  // the open mouth, dripping acid (wider and blazing in the windup)
  const mw = windup ? 0.042 : 0.032;
  const mh = windup ? 0.024 : 0.015;
  glow(c, 0, 0.33, windup ? 0.16 : 0.1, "140,255,60", 0.55 * pu);
  c.beginPath();
  E(c, 0, 0.33, mw, mh);
  const mg = c.createRadialGradient(0, 0.33, 0, 0, 0.33, mw);
  mg.addColorStop(0, windup ? "rgba(210,255,110,1)" : "rgba(120,200,40,0.9)");
  mg.addColorStop(0.6, "#1a0806");
  mg.addColorStop(1, "#1a0806");
  c.fillStyle = mg;
  c.fill();
  c.strokeStyle = "rgba(6,6,7,0.9)";
  c.lineWidth = P;
  c.stroke();
  for (let i = 0; i < 5; i++) fillP(c, (c) => Pg(c, [-0.022 + i * 0.011, 0.33 - mh + 0.005, -0.016 + i * 0.011, 0.33 - mh + 0.005, -0.019 + i * 0.011, 0.33 - mh + 0.015]), "#cdc4a4");
  strokeP(
    c,
    (c) => {
      c.moveTo(0.006, 0.33 + mh);
      c.lineTo(0.01, 0.366);
    },
    "rgba(175,250,75,0.95)",
    0.006,
  );
  acidDrop(c, 0.012, 0.378, 0.009, pu, 1, 2.5);
  acidDrop(c, -0.012, 0.395, 0.006, pu, 1, 2.5);
  c.restore();
}

/** The spit glob in flight (FX frame of side `s` px, centred): a glowing green glob with a short trail (+x = forward). */
export function drawSpitGlob(c: G, s: number): void {
  const r = s * 0.16;
  c.save();
  P = 1;
  // trail behind (−x); every glow stays inside the frame (no clipped square)
  for (let i = 1; i <= 3; i++) acidDrop(c, -r * 0.8 * i, Math.sin(i * 1.7) * r * 0.25, r * (0.55 - i * 0.1), 1, 0.5, 2);
  acidDrop(c, r * 0.4, 0, r, 1.4, 1, 2.6);
  c.restore();
}

/**
 * The acid puddle (FX frame of side `s` px, centred). The frame's edge circle IS the damage edge:
 * drawn at `puddleRadiusM`, a crisp bright ring sits at exactly the frame's half side minus half the
 * ring width (the 4.8 D16 rule: your body touches the ring = you are in acid). Inside: bubbling
 * green acid in an irregular pool that never pokes past the ring.
 */
export const ACID_RING_PX = 3;
export function drawAcidPuddle(c: G, s: number, seed: number): void {
  const R = s / 2;
  P = 1;
  const inner = R - ACID_RING_PX;
  c.save();
  const gl = c.createRadialGradient(0, 0, 0, 0, 0, R);
  gl.addColorStop(0, "rgba(110,255,40,0.16)");
  gl.addColorStop(1, "rgba(110,255,40,0.05)");
  c.fillStyle = gl;
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.fill();
  const pp: Path = (c) => blobPath(c, 0, 0, inner * 0.86, inner * 0.8, seed, 0.16, 56, seed * 0.3);
  c.beginPath();
  pp(c);
  const g = c.createRadialGradient(-inner * 0.2, -inner * 0.2, 0, 0, 0, inner);
  g.addColorStop(0, "rgba(232,255,135,0.9)");
  g.addColorStop(0.35, "rgba(155,238,55,0.85)");
  g.addColorStop(0.8, "rgba(72,150,22,0.8)");
  g.addColorStop(1, "rgba(38,88,10,0.7)");
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "rgba(210,255,130,0.55)";
  c.lineWidth = 1.2;
  c.stroke();
  const r = mulberry(seed + 3);
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU;
    const d = r() * inner * 0.6;
    const br = inner * (0.04 + r() * 0.07);
    c.beginPath();
    E(c, Math.cos(a) * d, Math.sin(a) * d, br, br);
    c.strokeStyle = "rgba(235,255,170,0.6)";
    c.lineWidth = 1;
    c.stroke();
  }
  fillP(c, (c) => E(c, -inner * 0.3, -inner * 0.3, inner * 0.22, inner * 0.13, -0.3), "rgba(255,255,255,0.35)");
  // the damage edge: crisp ring, fully inside the frame, outer edge at R
  c.beginPath();
  c.arc(0, 0, R - ACID_RING_PX / 2, 0, TAU);
  c.strokeStyle = "rgba(190,255,90,0.95)";
  c.lineWidth = ACID_RING_PX;
  c.stroke();
  c.restore();
}
