/**
 * Story 5.7: the Brute, drawn in game code (designer's art method, `docs/epic-5-decisions.md`).
 * Designer's round-B decision (2026-11-23): **all five looks are kept as random variants**, one per
 * Brute (`bruteLookIndex`, the named stream `look:brute:<netId>`): BR1 riot cop, BR2 construction
 * worker (hi-vis), BR3 bloated butcher, BR4 bodybuilder, BR5 prisoner. Ported from the round-B code
 * drawings (`docs/art/epic-5/round-b/looks.html`), with one FIX the designer asked for: in the
 * 0.5 s windup pose the arms are drawn UNDER the clothes/torso layer (the drawings put them over).
 *
 * The reference draws in metres, facing +y, around a 0.6 m body; the atlas wants px, facing +x,
 * centred on the body (`r` px = the 0.6 m collision radius). Two poses per look: the walk/idle pose
 * and the windup (arms raised, chest swelling, shoulders 8 % wider: the F1 telegraph). The whole
 * look lives in `drawBrute`.
 */

type G = CanvasRenderingContext2D;
type Path = (c: G) => void;
type Tex = (c: G, x0: number, y0: number, x1: number, y1: number) => void;
type Pt = [number, number];

const TAU = Math.PI * 2;
/** Body radius (m) the reference is drawn around. */
const REF_BODY_R_M = 0.6;
/**
 * The reference's body centre (m along +y): the frame centre. The shoulder line (y ≈ 0.04) carries
 * the 1.2 m width; the back runs to −0.47 behind it and the reaching fists to +0.71 ahead.
 */
const REF_CENTRE_Y_M = 0;
/** The looks (frame variant index = BR number − 1). */
export const BRUTE_LOOK_IDS = ["BR1", "BR2", "BR3", "BR4", "BR5"] as const;
/** One device px in reference units (set per drawing). */
let P = 1;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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
function rgbOf(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function shade(h: string, t: number): string {
  const f = t < 0 ? 0 : 255;
  const a = Math.abs(t);
  const c = rgbOf(h).map((v) => Math.round(v + (f - v) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function R(c: G, x: number, y: number, w: number, h: number, r = 0): void {
  if (!r) {
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.closePath();
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function E(c: G, x: number, y: number, rx: number, ry: number, a = 0): void {
  c.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a));
  c.ellipse(x, y, Math.max(1e-5, rx), Math.max(1e-5, ry), a, 0, TAU);
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
function devToLocal(c: G, dx: number, dy: number): Pt {
  const m = c.getTransform();
  const det = m.a * m.d - m.b * m.c || 1;
  return [(m.d * dx - m.c * dy) / det, (-m.b * dx + m.a * dy) / det];
}
function lightDir(c: G): Pt {
  const v = devToLocal(c, -1, -1);
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}
function rivet(c: G, x: number, y: number, r: number, base: string): void {
  c.beginPath();
  E(c, x, y, r, r);
  const L = lightDir(c);
  const g = c.createRadialGradient(x + L[0] * r * 0.45, y + L[1] * r * 0.45, 0, x, y, r * 1.05);
  g.addColorStop(0, shade(base, 0.55));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.55));
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 0.7 * P;
  c.strokeStyle = "rgba(0,0,0,0.65)";
  c.stroke();
}

interface PartOpts {
  base: string;
  box: readonly [number, number, number, number];
  lit?: "top" | "radial";
  hi?: number;
  lo?: number;
  tex?: Tex | null | undefined;
  rim?: number;
  inner?: number;
  line?: number;
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
  const L = lightDir(c);
  let g: CanvasGradient;
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
    c.strokeStyle = "rgba(4,4,6,0.95)";
    c.lineWidth = (o.line ?? 1.3) * P;
    c.stroke();
  }
}

// ---- textures (drawn inside a clip, reference units) ----
function woodTex(seed: number, ang = 0, light = 1): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const L = Math.hypot(x1 - x0, y1 - y0);
    c.save();
    c.translate(cx, cy);
    c.rotate(ang);
    for (let i = 0; i < 40; i++) {
      const y = (r() - 0.5) * L;
      const amp = L * (0.0015 + r() * 0.005);
      const f = (2 + r() * 5) / L;
      const ph = r() * TAU;
      c.beginPath();
      for (let k = 0; k <= 24; k++) {
        const x = -L / 2 + (L * k) / 24;
        const yy = y + Math.sin(x * f * 4 + ph) * amp;
        if (k) c.lineTo(x, yy);
        else c.moveTo(x, yy);
      }
      c.strokeStyle = r() < 0.72 ? `rgba(28,14,6,${0.14 + r() * 0.32})` : `rgba(205,160,110,${(0.05 + r() * 0.1) * light})`;
      c.lineWidth = (0.5 + r() * 1.5) * P;
      c.stroke();
    }
    c.restore();
  };
}
function steelTex(seed: number, wear = 0.5): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const area = (w * h) / (P * P);
    for (let i = 0; i < Math.min(80, area * 0.012); i++) {
      c.fillStyle = r() < 0.5 ? `rgba(200,210,225,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.08})`;
      c.fillRect(x0 + r() * w, y0 + r() * h, w * (0.05 + r() * 0.3), 0.6 * P);
    }
    if (wear > 0.7) {
      for (let i = 0; i < Math.min(30, area * 0.003); i++) {
        c.fillStyle = `rgba(115,62,30,${0.15 + r() * 0.25})`;
        c.beginPath();
        c.arc(x0 + r() * w, y0 + r() * h, P * (0.8 + r() * 2.5), 0, TAU);
        c.fill();
      }
    }
  };
}
function polyTex(seed: number): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const n = Math.min(600, ((w * h) / (P * P)) * 0.12);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.025 + r() * 0.05})` : `rgba(0,0,0,${0.08 + r() * 0.12})`;
      c.fillRect(x0 + r() * w, y0 + r() * h, P * (0.8 + r()), P * (0.8 + r()));
    }
  };
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
  const Q: Pt[] = [];
  const N: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = (pts[2 * b] as number) - (pts[2 * a] as number);
    const dy = (pts[2 * b + 1] as number) - (pts[2 * a + 1] as number);
    const l = Math.hypot(dx, dy) || 1;
    Q.push([pts[2 * i] as number, pts[2 * i + 1] as number]);
    N.push([-dy / l, dx / l]);
  }
  const q = (i: number) => Q[i] as Pt;
  const nn = (i: number) => N[i] as Pt;
  return (c) => {
    const w = (i: number) => (ws[i] as number) / 2;
    c.moveTo(q(0)[0] + nn(0)[0] * w(0), q(0)[1] + nn(0)[1] * w(0));
    for (let i = 1; i < n; i++) c.lineTo(q(i)[0] + nn(i)[0] * w(i), q(i)[1] + nn(i)[1] * w(i));
    const e = n - 1;
    const tx = nn(e)[1];
    const ty = -nn(e)[0];
    for (let k = 1; k <= 8; k++) {
      const th = (k / 8) * Math.PI;
      c.lineTo(q(e)[0] + (nn(e)[0] * Math.cos(th) + tx * Math.sin(th)) * w(e), q(e)[1] + (nn(e)[1] * Math.cos(th) + ty * Math.sin(th)) * w(e));
    }
    for (let i = n - 2; i >= 0; i--) c.lineTo(q(i)[0] - nn(i)[0] * w(i), q(i)[1] - nn(i)[1] * w(i));
    const sx = nn(0)[1];
    const sy = -nn(0)[0];
    for (let k = 1; k <= 8; k++) {
      const th = (k / 8) * Math.PI;
      c.lineTo(q(0)[0] + (-nn(0)[0] * Math.cos(th) - sx * Math.sin(th)) * w(0), q(0)[1] + (-nn(0)[1] * Math.cos(th) - sy * Math.sin(th)) * w(0));
    }
    c.closePath();
  };
}
function drawLimb(c: G, pts: readonly number[], ws: readonly number[], col: string, seed: number, o: { tex?: Tex | null; hi?: number; knobs?: boolean } = {}): void {
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
  part(c, path, { base: col, lit: "top", box: [x0, y0, x1, y1], hi: o.hi ?? 0.3, lo: 0.45, tex: o.tex === undefined ? skinTex(seed, 0.5) : o.tex, rim: 0.45, inner: 0.35, line: 1.2 });
  if (o.knobs !== false) {
    const L = lightDir(c);
    for (let i = 2; i < pts.length - 2; i += 2) {
      const w = ws[i / 2] as number;
      fillP(c, (q) => E(q, (pts[i] as number) + L[0] * w * 0.18, (pts[i + 1] as number) + L[1] * w * 0.18, w * 0.3, w * 0.24), "rgba(225,232,245,0.2)");
    }
  }
}

// ---- body parts ----
interface Arm {
  E: Pt;
  M: Pt;
  F: Pt;
}
interface Pose {
  R: Arm;
  L: Arm;
  /** Fist scale, shoulder width, "raised" (0–1: brighter, bigger fists), head turn, lean. */
  fs: number;
  sw: number;
  over: number;
  head: number;
  lean: number;
}
/** Right-side arm points (x mirrored for the left). Idle: right arm reaching, left hanging low. Windup: both raised high. */
const POSE: Readonly<Record<"idle" | "wind", Pose>> = {
  idle: { R: { E: [0.5, 0.24], M: [0.47, 0.42], F: [0.38, 0.56] }, L: { E: [0.54, 0.12], M: [0.56, 0.29], F: [0.51, 0.43] }, fs: 1, sw: 1, over: 0, head: 0.03, lean: 0 },
  wind: { R: { E: [0.62, -0.02], M: [0.66, 0.07], F: [0.62, 0.15] }, L: { E: [0.62, -0.02], M: [0.66, 0.07], F: [0.62, 0.15] }, fs: 1.45, sw: 1.08, over: 1, head: 0, lean: -0.07 },
};

/** Closed Catmull-Rom curve through points. */
function smoothClosed(pts: readonly Pt[]): Path {
  return (q) => {
    const n = pts.length;
    const p = (i: number) => pts[((i % n) + n) % n] as Pt;
    q.moveTo(p(0)[0], p(0)[1]);
    for (let i = 0; i < n; i++) {
      const p0 = p(i - 1);
      const p1 = p(i);
      const p2 = p(i + 1);
      const p3 = p(i + 2);
      q.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    q.closePath();
  };
}
interface Torso {
  w: number;
  f: number;
  b: number;
  wb: number;
  drop?: number;
}
/** The hunched back seen from above: traps rising to a sunken head, round shoulders, tapering to the hips. */
function torsoPts(T: Torso): Pt[] {
  const { w, f, b, wb } = T;
  const drop = T.drop ?? 0.03;
  const r: Pt[] = [
    [0.13, f + 0.03],
    [0.28, f + 0.01],
    [w - 0.07, f - 0.03],
    [w, f - 0.13],
    [w - 0.03, f - 0.27],
    [wb + 0.04, b + 0.15],
    [wb * 0.62, b],
  ];
  return [[0, f + 0.07], ...r, [0, b - 0.03], ...r.slice().reverse().map(([x, y]) => [-x, y - drop] as Pt)];
}
function blood(c: G, x: number, y: number, rx: number, ry: number, seed: number, a = 0.62): void {
  fillP(c, (q) => blobPath(q, x, y, rx, ry, seed, 0.45, 40), `rgba(84,12,9,${a})`);
  fillP(c, (q) => blobPath(q, x + rx * 0.1, y, rx * 0.5, ry * 0.5, seed + 1, 0.4, 30), `rgba(40,5,4,${a * 0.8})`);
}
function wound(c: G, x: number, y: number, s: number, seed: number): void {
  fillP(c, (q) => blobPath(q, x, y, s, s * 0.7, seed, 0.35, 30), "#3a0907");
  fillP(c, (q) => blobPath(q, x, y, s * 0.55, s * 0.38, seed + 3, 0.3, 24), "#6b1712");
  strokeP(c, (q) => blobPath(q, x, y, s * 1.15, s * 0.85, seed, 0.35, 30), "rgba(120,40,35,0.45)", 1.2 * P);
}
function fist(c: G, x: number, y: number, ang: number, s: number, col: string, seed: number, up = 0): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  part(c, (q) => blobPath(q, 0, 0, s, s * 0.86, seed, 0.07, 40), { base: col, lit: "radial", box: [-s, -s, s, s], hi: 0.34 + up * 0.22, lo: 0.5, rim: 0.32, tex: skinTex(seed, 0.2), line: 1.3 });
  for (let k = 0; k < 4; k++) {
    const yy = (-1.5 + k) * s * 0.4;
    fillP(c, (q) => E(q, s * 0.6, yy, s * 0.2, s * 0.16), "rgba(225,232,240,0.17)");
    if (k)
      strokeP(c, (q) => {
        q.moveTo(s * 0.32, yy - s * 0.2);
        q.lineTo(s * 0.86, yy - s * 0.2);
      }, "rgba(0,0,0,0.38)", 1.1 * P);
  }
  c.restore();
}
function bareHead(c: G, hx: number, hy: number, rx: number, ry: number, col: string, seed: number, o: { stubble?: boolean; stitch?: boolean; wound?: boolean } = {}): void {
  for (const s of [-1, 1]) part(c, (q) => E(q, hx + s * rx * 0.98, hy - 0.005, 0.022, 0.035), { base: col, lit: "radial", box: [hx + s * rx - 0.022, hy - 0.04, hx + s * rx + 0.022, hy + 0.03], hi: 0.25, lo: 0.4, rim: 0.2, line: 1 });
  part(c, (q) => E(q, hx, hy, rx, ry), { base: col, lit: "radial", box: [hx - rx, hy - ry, hx + rx, hy + ry], hi: 0.45, lo: 0.55, tex: skinTex(seed, 1.2), rim: 0.4 });
  strokeP(c, (q) => q.arc(hx, hy + ry * 0.05, ry * 0.85, 0.55, Math.PI - 0.55), "rgba(0,0,0,0.3)", 2.2 * P); // brow ridge
  if (o.stubble) {
    c.save();
    c.beginPath();
    E(c, hx, hy - 0.01, rx * 0.96, ry * 0.9);
    c.clip();
    const r = mulberry(seed + 7);
    for (let i = 0; i < 60; i++) fillP(c, (q) => E(q, hx + (r() - 0.5) * rx * 2, hy - 0.02 + (r() - 0.5) * ry * 1.9, 0.0045, 0.0045), `rgba(20,17,14,${0.25 + r() * 0.35})`);
    c.restore();
  }
  if (o.stitch) {
    strokeP(c, (q) => {
      q.moveTo(hx - rx * 0.5, hy + ry * 0.35);
      q.quadraticCurveTo(hx, hy + ry * 0.05, hx + rx * 0.55, hy - ry * 0.45);
    }, "#3a0d0a", 2.2 * P);
  }
  if (o.wound) wound(c, hx + rx * 0.35, hy - ry * 0.25, 0.028, seed + 9);
  fillP(c, (q) => E(q, hx - rx * 0.32, hy - ry * 0.3, rx * 0.32, ry * 0.22), "rgba(235,240,245,0.12)");
}
/** Text stencilled on the back: letter tops point forward (+y), so it reads upright when the Brute faces up. */
function backText(c: G, txt: string, x: number, y: number, size: number, weight: number, col: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(Math.PI);
  c.fillStyle = col;
  c.font = `${weight} ${size}px Oswald, "Arial Narrow", sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(txt, 0, 0);
  c.restore();
}
function chainLinks(c: G, pts: readonly Pt[], s: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i] as Pt;
    const [x1, y1] = pts[i + 1] as Pt;
    const l = Math.hypot(x1 - x0, y1 - y0);
    c.save();
    c.translate((x0 + x1) / 2, (y0 + y1) / 2);
    c.rotate(Math.atan2(y1 - y0, x1 - x0));
    c.beginPath();
    E(c, 0, 0, l * 0.62, i % 2 ? s * 0.22 : s * 0.5);
    c.strokeStyle = "rgba(5,5,6,0.9)";
    c.lineWidth = s * 0.42 + 1.6 * P;
    c.stroke();
    c.strokeStyle = i % 2 ? "#6b6e72" : "#8b8f94";
    c.lineWidth = s * 0.3;
    c.stroke();
    c.restore();
  }
}

// ---- the five looks ----
interface Look {
  T: Torso;
  skin: string;
  back: string;
  backTex: Tex;
  sleeve: "full" | "elbow" | "none";
  sleeveCol?: string;
  shoulderCol: string;
  shoulderTex: Tex;
  delt?: number;
  armK?: number;
  fistK?: number;
  handCol?: string;
  under?(c: G, pose: Pose): void;
  backDetail?(c: G): void;
  shoulderDetail?(c: G, dx: number, dy: number, sc: number, s: number): void;
  armDetail?(c: G, S: Pt, Eb: Pt, M: Pt, F: Pt, s: number): void;
  wrist?(c: G, x: number, y: number, a: number): void;
  trap?(c: G, T: Torso): void;
  /** Drawn over the arms (BR5's wrist chain): with the arms, so under the torso in the windup. */
  hands?(c: G, pose: Pose): void;
  head(c: G, hx: number, hy: number): void;
}

const NAVY = "#272d39";
const BR1: Look = {
  // riot cop: helmet, shoulder armour, a cracked riot shield slung across his back
  T: { w: 0.56, f: 0.17, b: -0.43, wb: 0.29 },
  skin: "#77806f",
  back: "#20242c",
  backTex: polyTex(101),
  sleeve: "full",
  sleeveCol: NAVY,
  shoulderCol: "#14161a",
  shoulderTex: polyTex(102),
  delt: 0.165,
  handCol: "#1a1b1e",
  backDetail(c) {
    for (let y = -0.3; y < 0.1; y += 0.05)
      strokeP(c, (q) => {
        q.moveTo(-0.45, y);
        q.lineTo(0.45, y);
      }, "rgba(0,0,0,0.4)", 2 * P, "butt");
    const sh: Path = (q) => {
      q.moveTo(-0.3, 0.08);
      q.lineTo(-0.12, 0.1);
      q.lineTo(-0.15, 0.05);
      q.lineTo(-0.05, 0.07);
      q.lineTo(-0.02, 0.12);
      q.lineTo(0.3, 0.12);
      q.lineTo(0.3, -0.34);
      q.lineTo(-0.3, -0.34);
      q.closePath();
    };
    c.save();
    c.translate(0.02, 0);
    c.rotate(-0.08);
    part(c, sh, { base: "#5c6a75", lit: "top", box: [-0.3, -0.34, 0.3, 0.12], hi: 0.45, lo: 0.25, rim: 0.55, inner: 0.3, line: 1.6 });
    backText(c, "POLICE", 0, -0.21, 0.1, 700, "rgba(235,238,240,0.82)");
    c.save();
    c.beginPath();
    sh(c);
    c.clip();
    const cx = 0.12;
    const cy = -0.04;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3;
      const l = 0.1 + ((i * 37) % 5) * 0.04;
      strokeP(c, (q) => {
        q.moveTo(cx, cy);
        q.lineTo(cx + Math.cos(a) * l * 0.5, cy + Math.sin(a) * l * 0.5 + 0.01);
        q.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      }, "rgba(235,242,250,0.55)", 1.1 * P);
    }
    c.restore();
    blood(c, -0.18, -0.28, 0.07, 0.04, 105, 0.55);
    c.restore();
    for (const s of [-1, 1])
      strokeP(c, (q) => {
        q.moveTo(s * 0.22, 0.2);
        q.lineTo(s * 0.26, -0.36);
      }, "#111317", 0.03, "butt");
    wound(c, 0.36, -0.12, 0.03, 107);
  },
  shoulderDetail(c, dx, dy, sc) {
    for (const k of [0.55, 0.8]) strokeP(c, (q) => q.arc(dx, dy, sc * k, -2.6, -0.5), "rgba(190,200,215,0.28)", 1.6 * P);
  },
  armDetail(c, _S, Eb, _M, F) {
    const mx = lerp(Eb[0], F[0], 0.45);
    const my = lerp(Eb[1], F[1], 0.45);
    part(c, (q) => E(q, mx, my, 0.085, 0.07, Math.atan2(F[1] - Eb[1], F[0] - Eb[0])), { base: "#15171b", lit: "radial", box: [mx - 0.09, my - 0.09, mx + 0.09, my + 0.09], hi: 0.35, lo: 0.4, rim: 0.3, line: 1 });
  },
  head(c, hx, hy) {
    part(c, (q) => E(q, hx, hy + 0.005, 0.14, 0.15), { base: "#121316", lit: "radial", box: [hx - 0.14, hy - 0.145, hx + 0.14, hy + 0.155], hi: 0.6, lo: 0.5, rim: 0.45, tex: polyTex(108) });
    fillP(c, (q) => E(q, hx - 0.05, hy - 0.05, 0.05, 0.035, -0.5), "rgba(215,225,240,0.28)");
    const vis: Path = (q) => {
      q.moveTo(hx - 0.13, hy + 0.06);
      q.quadraticCurveTo(hx, hy + 0.22, hx + 0.13, hy + 0.06);
      q.quadraticCurveTo(hx, hy + 0.15, hx - 0.13, hy + 0.06);
      q.closePath();
    };
    part(c, vis, { base: "#3d4a55", lit: "top", box: [hx - 0.13, hy + 0.06, hx + 0.13, hy + 0.2], hi: 0.5, lo: 0.3, rim: 0.5, line: 1.1 });
    strokeP(c, (q) => {
      q.moveTo(hx, hy - 0.14);
      q.lineTo(hx, hy + 0.07);
    }, "rgba(0,0,0,0.5)", 2 * P);
  },
};

const HIVIS = "#aab634";
const BR2: Look = {
  // construction worker: hard hat, torn hi-vis vest with reflective stripes, concrete dust
  T: { w: 0.56, f: 0.17, b: -0.43, wb: 0.31 },
  skin: "#79826f",
  back: HIVIS,
  backTex: clothTex(201, "90,20,12"),
  sleeve: "elbow",
  sleeveCol: "#4a4f57",
  shoulderCol: HIVIS,
  shoulderTex: clothTex(202),
  backDetail(c) {
    for (const y of [-0.08, -0.22]) part(c, (q) => R(q, -0.7, y - 0.027, 1.4, 0.054), { base: "#b9bdb6", lit: "top", box: [-0.7, y - 0.027, 0.7, y + 0.027], hi: 0.55, lo: 0.3, rim: 0.45, line: 1.1 });
    for (const s of [-1, 1]) part(c, (q) => R(q, s * 0.2 - 0.027, -0.45, 0.054, 0.7), { base: "#b9bdb6", lit: "top", box: [s * 0.2 - 0.027, -0.45, s * 0.2 + 0.027, 0.25], hi: 0.55, lo: 0.3, rim: 0.45, line: 1.1 });
    for (const [x, y, rx, ry, sd] of [
      [0.1, -0.15, 0.09, 0.06, 211],
      [-0.3, -0.28, 0.06, 0.07, 212],
      [-0.06, 0.04, 0.05, 0.04, 213],
    ] as const) {
      part(c, (q) => blobPath(q, x, y, rx, ry, sd, 0.4, 40), { base: "#6c735f", lit: "radial", box: [x - rx, y - ry, x + rx, y + ry], hi: 0.15, lo: 0.5, rim: 0, inner: 0.6, tex: skinTex(sd), line: 1.2 });
      wound(c, x, y, rx * 0.45, sd + 5);
    }
    const r = mulberry(214);
    for (let i = 0; i < 40; i++) fillP(c, (q) => E(q, (r() - 0.5) * 0.9, -0.4 + r() * 0.6, 0.004 + r() * 0.008, 0.004 + r() * 0.006), `rgba(170,165,150,${0.15 + r() * 0.25})`);
    blood(c, -0.12, -0.34, 0.09, 0.05, 215);
  },
  head(c, hx, hy) {
    // hard hat from above: oval brim with a peak at the front, ribbed dome
    const brim: Path = (q) => {
      q.moveTo(hx, hy - 0.16);
      q.bezierCurveTo(hx + 0.14, hy - 0.16, hx + 0.17, hy - 0.02, hx + 0.15, hy + 0.08);
      q.quadraticCurveTo(hx + 0.12, hy + 0.2, hx, hy + 0.22);
      q.quadraticCurveTo(hx - 0.12, hy + 0.2, hx - 0.15, hy + 0.08);
      q.bezierCurveTo(hx - 0.17, hy - 0.02, hx - 0.14, hy - 0.16, hx, hy - 0.16);
      q.closePath();
    };
    part(c, brim, { base: "#b3801c", lit: "radial", box: [hx - 0.17, hy - 0.16, hx + 0.17, hy + 0.22], hi: 0.4, lo: 0.55, rim: 0.35, tex: polyTex(221) });
    part(c, (q) => E(q, hx, hy + 0.01, 0.115, 0.135), { base: "#d29a22", lit: "radial", box: [hx - 0.115, hy - 0.125, hx + 0.115, hy + 0.145], hi: 0.62, lo: 0.5, rim: 0.45, tex: polyTex(222) });
    for (const dx of [-0.04, 0.04])
      strokeP(c, (q) => {
        q.moveTo(hx + dx * 0.7, hy - 0.11);
        q.quadraticCurveTo(hx + dx * 1.15, hy + 0.01, hx + dx * 0.7, hy + 0.13);
      }, "rgba(0,0,0,0.28)", 1.6 * P);
    strokeP(c, (q) => {
      q.moveTo(hx, hy - 0.125);
      q.lineTo(hx, hy + 0.145);
    }, "rgba(255,232,170,0.4)", 2.4 * P);
  },
};

const BSKIN = "#86756f";
const BR3: Look = {
  // bloated butcher: shirtless, pear-shaped, apron strings cutting into the fat, a cleaver in his back
  T: { w: 0.52, f: 0.16, b: -0.45, wb: 0.56, drop: 0.02 },
  skin: BSKIN,
  back: BSKIN,
  backTex: skinTex(301, 2.2),
  sleeve: "none",
  shoulderCol: BSKIN,
  shoulderTex: skinTex(302, 1.5),
  delt: 0.14,
  armK: 1.05,
  fistK: 1.05,
  under(c) {
    // the apron: a bloody white rim around the belly bulging past the sides and front
    const bp: Path = (q) => blobPath(q, 0, 0.1, 0.44, 0.3, 305, 0.04, 56);
    part(c, bp, { base: "#cdc8ba", lit: "radial", box: [-0.44, -0.2, 0.44, 0.4], hi: 0.3, lo: 0.55, rim: 0.3, tex: clothTex(306, "110,15,10") });
    c.save();
    c.beginPath();
    bp(c);
    c.clip();
    blood(c, 0.36, 0.1, 0.18, 0.12, 307, 0.8);
    blood(c, -0.42, -0.05, 0.1, 0.16, 308, 0.7);
    blood(c, 0.1, 0.28, 0.12, 0.06, 309, 0.7);
    c.restore();
  },
  backDetail(c) {
    for (let i = 0; i < 9; i++) {
      const r = mulberry(310 + i);
      fillP(c, (q) => blobPath(q, (r() - 0.5) * 0.8, -0.38 + r() * 0.5, 0.03 + r() * 0.06, 0.02 + r() * 0.05, 320 + i, 0.4, 30), `rgba(${r() < 0.5 ? "95,70,95" : "70,95,70"},0.28)`);
    }
    for (const s of [-1, 1]) {
      const st: Path = (q) => {
        q.moveTo(s * 0.13, 0.25);
        q.quadraticCurveTo(s * 0.2, 0.0, s * 0.55, -0.22);
      };
      strokeP(c, st, "rgba(40,30,25,0.5)", 0.03);
      strokeP(c, st, "#9c968a", 0.022);
    }
    const ws: Path = (q) => {
      q.moveTo(-0.6, -0.22);
      q.quadraticCurveTo(0, -0.17, 0.6, -0.22);
    };
    strokeP(c, ws, "rgba(40,30,25,0.5)", 0.034);
    strokeP(c, ws, "#9c968a", 0.026);
    wound(c, 0.3, -0.05, 0.035, 333);
    wound(c, -0.32, -0.12, 0.028, 334);
    c.save();
    c.translate(-0.17, -0.03);
    c.rotate(-0.7);
    wound(c, 0, 0, 0.045, 335);
    blood(c, -0.02, -0.04, 0.05, 0.07, 338, 0.7);
    part(c, (q) => R(q, -0.085, -0.01, 0.17, 0.02, 0.003), { base: "#a9aeb4", lit: "top", box: [-0.085, -0.01, 0.085, 0.01], hi: 0.6, lo: 0.3, rim: 0.5, line: 1.2, tex: steelTex(336, 1) });
    part(c, (q) => R(q, 0.0, -0.024, 0.17, 0.048, 0.018), { base: "#3a2416", lit: "top", box: [0, -0.024, 0.17, 0.024], hi: 0.35, lo: 0.45, rim: 0.4, tex: woodTex(337, 0), line: 1.2 });
    for (const x of [0.045, 0.11]) rivet(c, x, 0, 0.007, "#b9b2a0");
    c.restore();
  },
  head(c, hx, hy) {
    bareHead(c, hx, hy + 0.01, 0.115, 0.125, "#938680", 341, { stitch: true });
  },
};

const MSKIN = "#7b7f6b";
const BR4: Look = {
  // bodybuilder: huge bare traps and shoulders, shredded black tank top, lifting belt, gold chain
  T: { w: 0.59, f: 0.17, b: -0.43, wb: 0.23 },
  skin: MSKIN,
  back: MSKIN,
  backTex: skinTex(401, 1.8),
  sleeve: "none",
  shoulderCol: MSKIN,
  shoulderTex: skinTex(402, 1.8),
  delt: 0.18,
  armK: 1.15,
  backDetail(c) {
    strokeP(c, (q) => {
      q.moveTo(0, 0.2);
      q.quadraticCurveTo(0.012, -0.1, 0, -0.38);
    }, "rgba(0,0,0,0.42)", 3 * P);
    for (const s of [-1, 1]) {
      strokeP(c, (q) => {
        q.moveTo(s * 0.05, 0.07);
        q.quadraticCurveTo(s * 0.26, 0.09, s * 0.32, -0.08);
      }, "rgba(0,0,0,0.4)", 2.6 * P);
      strokeP(c, (q) => {
        q.moveTo(s * 0.44, 0.0);
        q.quadraticCurveTo(s * 0.33, -0.2, s * 0.17, -0.31);
      }, "rgba(0,0,0,0.35)", 2.4 * P);
    }
    const rag: Path = (q) => {
      const r = mulberry(405);
      q.moveTo(-0.08, 0.24);
      q.lineTo(0.08, 0.24);
      q.lineTo(0.1, 0.02);
      for (let i = 0; i <= 8; i++) q.lineTo(0.12 + i * 0.03 + (r() - 0.5) * 0.02, -0.02 - i * 0.008 + (i % 2 ? 0.03 : -0.01));
      q.lineTo(0.36, -0.3);
      q.lineTo(-0.36, -0.3);
      for (let i = 8; i >= 0; i--) q.lineTo(-0.12 - i * 0.03 - (r() - 0.5) * 0.02, -0.02 - i * 0.008 + (i % 2 ? 0.035 : -0.01));
      q.lineTo(-0.1, 0.02);
      q.closePath();
    };
    part(c, rag, { base: "#1c1d21", lit: "radial", box: [-0.36, -0.3, 0.36, 0.24], hi: 0.18, lo: 0.4, rim: 0.25, tex: clothTex(404, "90,20,15"), line: 1.2 });
    wound(c, 0.14, -0.16, 0.035, 413);
    part(c, (q) => R(q, -0.4, -0.36, 0.8, 0.08, 0.01), { base: "#4b3322", lit: "top", box: [-0.4, -0.36, 0.4, -0.28], hi: 0.3, lo: 0.4, rim: 0.35, tex: woodTex(414, 0, 0.5), line: 1.2 });
    part(c, (q) => R(q, -0.05, -0.355, 0.1, 0.07, 0.008), { base: "#8b8573", lit: "top", box: [-0.05, -0.355, 0.05, -0.285], hi: 0.5, lo: 0.3, rim: 0.4, line: 1 });
    blood(c, 0.3, 0.08, 0.06, 0.04, 415, 0.5);
  },
  trap(c, T) {
    part(c, (q) => {
      q.moveTo(-0.36, T.f - 0.07);
      q.quadraticCurveTo(-0.18, T.f + 0.13, 0, T.f + 0.12);
      q.quadraticCurveTo(0.18, T.f + 0.13, 0.36, T.f - 0.07);
      q.quadraticCurveTo(0, T.f - 0.03, -0.36, T.f - 0.07);
      q.closePath();
    }, { base: "#80846f", lit: "radial", box: [-0.36, T.f - 0.09, 0.36, T.f + 0.13], hi: 0.45, lo: 0.35, rim: 0.35, tex: skinTex(421, 1.5), line: 1.2 });
    const ch: Path = (q) => {
      q.moveTo(-0.11, T.f + 0.05);
      q.quadraticCurveTo(0, T.f + 0.0, 0.11, T.f + 0.05);
    };
    strokeP(c, ch, "#4a3a12", 0.016 + 1.5 * P);
    strokeP(c, ch, "#c9a640", 0.016);
  },
  head(c, hx, hy) {
    bareHead(c, hx, hy + 0.03, 0.1, 0.11, "#7f826f", 431, { stubble: true, wound: true });
  },
};

const ORANGE = "#a8552a";
const BR5: Look = {
  // prisoner: orange jumpsuit with a stencilled number, wrist shackles joined by a chain, a broken chain dragging behind
  T: { w: 0.55, f: 0.17, b: -0.43, wb: 0.31 },
  skin: "#7a816e",
  back: ORANGE,
  backTex: clothTex(501, "70,15,10"),
  sleeve: "full",
  sleeveCol: ORANGE,
  shoulderCol: ORANGE,
  shoulderTex: clothTex(502),
  under(c) {
    const pts: Pt[] = [];
    for (let i = 0; i < 10; i++) pts.push([0.2 + Math.sin(i * 0.7) * 0.05 + i * 0.01, -0.36 - i * 0.045]);
    chainLinks(c, pts, 0.03);
  },
  backDetail(c) {
    backText(c, "0417", 0, -0.14, 0.15, 700, "rgba(20,14,10,0.75)");
    backText(c, "COUNTY JAIL", 0, -0.03, 0.05, 600, "rgba(20,14,10,0.7)");
    strokeP(c, (q) => {
      q.moveTo(0, 0.2);
      q.lineTo(0.005, -0.38);
    }, "rgba(0,0,0,0.3)", 2 * P);
    for (const [x, y, rx, ry, sd] of [
      [-0.24, -0.27, 0.07, 0.05, 511],
      [0.26, -0.05, 0.05, 0.06, 512],
    ] as const) {
      part(c, (q) => blobPath(q, x, y, rx, ry, sd, 0.4, 40), { base: "#6c735f", lit: "radial", box: [x - rx, y - ry, x + rx, y + ry], hi: 0.15, lo: 0.5, rim: 0, inner: 0.6, tex: skinTex(sd), line: 1.2 });
      wound(c, x, y, rx * 0.5, sd + 4);
    }
    blood(c, 0.12, -0.3, 0.1, 0.06, 515);
  },
  wrist(c, x, y, a) {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    part(c, (q) => R(q, -0.03, -0.095, 0.06, 0.19, 0.02), { base: "#5e6165", lit: "top", box: [-0.03, -0.095, 0.03, 0.095], hi: 0.55, lo: 0.35, rim: 0.45, line: 1.2, tex: steelTex(520, 1.3) });
    c.restore();
  },
  hands(c, pose) {
    const d = this.T.drop ?? 0.03;
    const L: Pt = [-pose.L.F[0], pose.L.F[1] - d];
    const Rr: Pt = [pose.R.F[0], pose.R.F[1]];
    const span = Math.hypot(Rr[0] - L[0], Rr[1] - L[1]);
    const sag = Math.max(0.03, 0.42 - span * 0.38);
    const pts: Pt[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push([lerp(L[0], Rr[0], t), lerp(L[1], Rr[1], t) + Math.sin(t * Math.PI) * sag * (pose.over > 0.5 ? -0.6 : 1)]);
    }
    chainLinks(c, pts, 0.026);
  },
  head(c, hx, hy) {
    bareHead(c, hx, hy + 0.015, 0.11, 0.12, "#7d836f", 531, { stubble: true, wound: true });
  },
};

const LOOKS: readonly Look[] = [BR1, BR2, BR3, BR4, BR5];

/** One Brute in reference units, facing +y. */
function brute(c: G, V: Look, pose: Pose): void {
  const T = V.T;
  c.save();
  c.scale(pose.sw, 1);
  c.translate(0, pose.lean);
  V.under?.(c, pose);
  const drop = T.drop ?? 0.03;
  // Designer FIX (round B): the arms are always drawn UNDER the clothes/torso, the raised windup
  // arms too (the reference drew them over the clothes in the windup).
  for (const s of [1, -1]) {
    const A = s > 0 ? pose.R : pose.L;
    const d = s < 0 ? drop : 0;
    const S: Pt = [s * (T.w - 0.13), T.f - 0.1 - d];
    const Eb: Pt = [s * A.E[0], A.E[1] - d];
    const M: Pt = [s * A.M[0], A.M[1] - d];
    const F: Pt = [s * A.F[0], A.F[1] - d];
    const k = (1 + pose.over * 0.1) * (V.armK ?? 1);
    const ws = [0.2, 0.165, 0.19, 0.14].map((v) => v * k);
    const pts = [...S, ...Eb, ...M, ...F];
    if (V.sleeve === "full") drawLimb(c, pts, ws, V.sleeveCol ?? V.back, 300 + s, { tex: clothTex(301 + s, "70,20,15"), hi: 0.24 });
    else {
      drawLimb(c, pts, ws, V.skin, 310 + s, { tex: skinTex(310 + s, 1.4) });
      if (V.sleeve === "elbow") drawLimb(c, [...S, lerp(S[0], Eb[0], 0.95), lerp(S[1], Eb[1], 0.95)], [(ws[0] as number) + 0.035, (ws[1] as number) + 0.035], V.sleeveCol ?? V.back, 320 + s, { tex: clothTex(321 + s), hi: 0.25, knobs: false });
    }
    V.armDetail?.(c, S, Eb, M, F, s);
    const a = Math.atan2(F[1] - M[1], F[0] - M[0]);
    V.wrist?.(c, F[0], F[1], a);
    fist(c, F[0] + Math.cos(a) * 0.05, F[1] + Math.sin(a) * 0.05, a, 0.1 * pose.fs * (V.fistK ?? 1), V.handCol ?? V.skin, 340 + s, pose.over);
  }
  V.hands?.(c, pose);
  const tp = smoothClosed(torsoPts(T));
  part(c, tp, { base: V.back, lit: "radial", box: [-T.w, T.b - 0.07, T.w, T.f + 0.07], hi: 0.36, lo: 0.62, tex: V.backTex, rim: 0.3 });
  c.save();
  c.beginPath();
  tp(c);
  c.clip();
  V.backDetail?.(c);
  const g = c.createRadialGradient(-0.06, T.f - 0.12, 0, 0, T.f - 0.12, 0.42); // the hump: upper back closest to the camera
  g.addColorStop(0, "rgba(230,235,240,0.13)");
  g.addColorStop(1, "rgba(230,235,240,0)");
  c.fillStyle = g;
  c.fillRect(-1, -1, 2, 2);
  c.restore();
  c.beginPath();
  tp(c);
  c.strokeStyle = "rgba(6,6,7,0.9)";
  c.lineWidth = 1.5 * P;
  c.stroke();
  for (const s of [-1, 1]) {
    const d = s < 0 ? drop : 0;
    const dx = s * (T.w - 0.13);
    const dy = T.f - 0.13 - d;
    const sc = V.delt ?? 0.15;
    c.save();
    c.beginPath();
    tp(c);
    c.clip();
    part(c, (q) => blobPath(q, dx, dy, sc, sc * 0.95, 350 + s, 0.07, 40), { base: V.shoulderCol, lit: "radial", box: [dx - sc, dy - sc, dx + sc, dy + sc], hi: 0.4, lo: 0.3, rim: 0.22, inner: 0.18, tex: V.shoulderTex, line: 0 });
    c.restore();
    V.shoulderDetail?.(c, dx, dy, sc, s);
  }
  V.trap?.(c, T);
  c.save();
  c.translate(pose.head, T.f + 0.035);
  c.rotate(-pose.head * 2);
  V.head(c, 0, 0);
  c.restore();
  c.restore();
}

/**
 * The Brute look `variant` (0–4: BR1–BR5), top-down, facing +x, centred on its 0.6 m body of `r` px.
 * `windup`: the F1 telegraph pose (both arms raised under the clothes, fists swollen, shoulders 8 %
 * wider, leaning back).
 */
export function drawBrute(c: G, r: number, variant: number, windup: boolean): void {
  const look = LOOKS[((variant % LOOKS.length) + LOOKS.length) % LOOKS.length] as Look;
  const ppm = r / REF_BODY_R_M;
  c.save();
  c.rotate(-Math.PI / 2); // reference faces +y → frame faces +x
  c.scale(ppm, ppm);
  c.translate(0, -REF_CENTRE_Y_M);
  P = 1 / ppm;
  brute(c, look, windup ? POSE.wind : POSE.idle);
  c.restore();
}

/**
 * Story 6.5: the shared drawing helpers, reused by the Behemoth (`behemothArt.ts`, the same looks
 * page style). `setArtPixel` sets the one-device-pixel size (reference units) their outlines use.
 */
export const artKit = { lerp, mulberry, shade, R, E, blobPath, fillP, strokeP, rivet, part, polyTex, skinTex, clothTex, drawLimb, wound, fist };
export function setArtPixel(p: number): void {
  P = p;
}
