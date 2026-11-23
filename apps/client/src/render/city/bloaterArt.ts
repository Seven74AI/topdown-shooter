/**
 * Story 5.8: the Bloater, drawn in game code (designer's art method, `docs/epic-5-decisions.md`).
 * Designer's round-C decision (2026-11-23): **all five looks BL1–BL5 are random per-Bloater
 * variants** (`bloaterLookIndex`, the named stream `look:bloater:<netId>`, like the Brute): BL1
 * swollen office worker, BL2 hazmat suit, BL3 sewer worker, BL4 obese tourist, BL5 rotting gas
 * sacs. Ported from the round-C code drawings (`docs/art/epic-5/round-c/looks.html`, `bl.js` and the
 * page's `lib.js` helpers), with the round-B rule kept: the arms are drawn UNDER the torso and its
 * clothes in every pose (the swell too).
 *
 * The reference draws in metres, facing +y, around a 0.5 m body; the atlas wants px, facing +x,
 * centred on the body (`r` px = the 0.5 m collision radius). `s` is the swell (0 = walking, 1 =
 * about to burst: 1.35 × wider, glowing veins, sickly skin): the view shows the swell frames in
 * turn over the 1 s fuse, so the growth is in the art (the frame keeps one size: `BL_EXTENT_R`).
 * The helpers below are the round-C page's library (it differs from round B's in `bruteArt.ts`:
 * rim offsets, the polymer check, skin speckles), kept here so both looks stay faithful.
 */

type G = CanvasRenderingContext2D;
type Path = (c: G) => void;
type Tex = (c: G, x0: number, y0: number, x1: number, y1: number) => void;
type Pt = [number, number];

const TAU = Math.PI * 2;
/** Body radius (m) the reference is drawn around. */
const REF_BODY_R_M = 0.5;
/** Half the frame (m) in the reference (`BL_EXT`): the swollen 1.35 × body with its hands fits. */
export const BL_EXTENT_M = 0.9;
/** The frame's half-size in collision radii (`CHAR_EXTENT_R.bloater`). */
export const BL_EXTENT_R = BL_EXTENT_M / REF_BODY_R_M;
/** The looks (frame variant index = BL number − 1). */
export const BLOATER_LOOK_IDS = ["BL1", "BL2", "BL3", "BL4", "BL5"] as const;
/** The swell frames baked per look (s = 1/3, 2/3, 1; s = 0 is the walking frame). */
export const BLOATER_SWELL_STAGES = 3;
/** One atlas px in reference units (set per drawing). */
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
function hex2(v: number): string {
  return Math.round(v).toString(16).padStart(2, "0");
}
/** `#rrggbb` between a and b. */
function mixHex(a: string, b: string, t: number): string {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return `#${hex2(lerp(A[0], B[0], t))}${hex2(lerp(A[1], B[1], t))}${hex2(lerp(A[2], B[2], t))}`;
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
  } else if (o.lit === "radial") {
    const m = Math.max(w, h);
    g = c.createRadialGradient(cx + L[0] * w * 0.28, cy + L[1] * h * 0.32, 0, cx, cy, m * 0.62);
    g.addColorStop(0, `rgba(225,235,255,${hi})`);
    g.addColorStop(0.45, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${lo})`);
  } else {
    g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(215,225,242,${hi})`);
    g.addColorStop(0.2, `rgba(215,225,242,${hi * 0.3})`);
    g.addColorStop(0.5, "rgba(0,0,0,0.04)");
    g.addColorStop(0.85, `rgba(0,0,0,${lo})`);
    g.addColorStop(1, `rgba(60,72,90,${lo * 0.35})`);
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
function polyTex(seed: number, check = false): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const n = Math.min(800, ((w * h) / (P * P)) * 0.12);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.025 + r() * 0.05})` : `rgba(0,0,0,${0.08 + r() * 0.12})`;
      c.fillRect(x0 + r() * w, y0 + r() * h, P * (0.8 + r()), P * (0.8 + r()));
    }
    if (check) {
      c.strokeStyle = "rgba(0,0,0,0.4)";
      c.lineWidth = 0.7 * P;
      c.beginPath();
      const s = 3 * P;
      for (let k = -h; k < w + h; k += s) {
        c.moveTo(x0 + k, y0);
        c.lineTo(x0 + k + h, y1);
        c.moveTo(x0 + k + h, y0);
        c.lineTo(x0 + k, y1);
      }
      c.stroke();
    }
  };
}
function rustTex(seed: number, amt = 1): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const area = (w * h) / (P * P);
    const nb = Math.min(26, 4 + area * 0.0015) * amt;
    for (let i = 0; i < nb; i++) {
      const x = x0 + r() * w;
      const y = y0 + r() * h;
      const rr = Math.max(w, h) * (0.04 + r() * 0.14);
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      const col = r() < 0.5 ? "150,72,28" : "92,46,20";
      g.addColorStop(0, `rgba(${col},${0.28 + r() * 0.32})`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    const n = Math.min(600, area * 0.05 * amt);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.6 ? `rgba(160,84,36,${0.18 + r() * 0.3})` : `rgba(28,20,15,${0.2 + r() * 0.3})`;
      const s = P * (0.6 + r() * 1.6);
      c.fillRect(x0 + r() * w, y0 + r() * h, s, s);
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
    const n = Math.min(400, ((w * h) / (P * P)) * 0.06);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
      c.fillRect(x0 + r() * w, y0 + r() * h, P, P);
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
    c.strokeStyle = "rgba(255,255,255,0.035)";
    c.beginPath();
    for (let y = y0; y < y1; y += 2.2 * P) {
      c.moveTo(x0, y);
      c.lineTo(x1, y + w * 0.05);
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
function veinTex(seed: number, col: string): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const m = Math.min(w, h);
    for (let i = 0; i < 9; i++) {
      let x = x0 + w * 0.5 + (r() - 0.5) * w * 0.8;
      let y = y0 + h * 0.5 + (r() - 0.5) * h * 0.8;
      let a = r() * TAU;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        a += (r() - 0.5) * 1.1;
        x += Math.cos(a) * m * 0.07;
        y += Math.sin(a) * m * 0.07;
        c.lineTo(x, y);
      }
      c.strokeStyle = `rgba(${col},${0.35 + r() * 0.3})`;
      c.lineWidth = (0.7 + r() * 0.9) * P;
      c.stroke();
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
function bareHead(c: G, hx: number, hy: number, rx: number, ry: number, col: string, seed: number): void {
  for (const s of [-1, 1]) part(c, (q) => E(q, hx + s * rx * 0.98, hy - 0.005, 0.022, 0.035), { base: col, lit: "radial", box: [hx + s * rx - 0.022, hy - 0.04, hx + s * rx + 0.022, hy + 0.03], hi: 0.25, lo: 0.4, rim: 0.2, line: 1 });
  part(c, (q) => E(q, hx, hy, rx, ry), { base: col, lit: "radial", box: [hx - rx, hy - ry, hx + rx, hy + ry], hi: 0.45, lo: 0.55, tex: skinTex(seed, 1.2), rim: 0.4 });
  strokeP(c, (q) => q.arc(hx, hy + ry * 0.05, ry * 0.85, 0.55, Math.PI - 0.55), "rgba(0,0,0,0.3)", 2.2 * P); // brow ridge
  fillP(c, (q) => E(q, hx - rx * 0.32, hy - ry * 0.3, rx * 0.32, ry * 0.22), "rgba(235,240,245,0.12)");
}

// ================= the Bloater (bl.js) =================
const SWELL_SKIN = "#b3b878";

/** The torso outline seen from above: rounded back, widest just behind the shoulders, the belly bulging out in front. */
function bloatPts(g: number): Pt[] {
  const R_: Pt[] = [
    [0.2, 0.47],
    [0.37, 0.39],
    [0.475, 0.235],
    [0.505, 0.06],
    [0.48, -0.12],
    [0.4, -0.27],
    [0.24, -0.375],
  ];
  const pts: Pt[] = [[0, 0.5], ...R_, [0, -0.41], ...R_.slice().reverse().map(([x, y]) => [-x, y] as Pt)];
  return pts.map(([x, y]) => [x * g, y * g] as Pt);
}
/** Puffy swollen hand: palm blob, four short fat fingers forward, thumb in. */
function puffyHand(c: G, x: number, y: number, ang: number, s: number, col: string, seed: number, side: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  for (let k = 0; k < 4; k++) {
    const yy = (-1.4 + k * 0.95) * s * 0.42;
    part(c, (q) => E(q, s * 0.95, yy, s * 0.38, s * 0.2), { base: col, lit: "radial", box: [s * 0.57, yy - s * 0.2, s * 1.33, yy + s * 0.2], hi: 0.3, lo: 0.45, rim: 0.25, line: 1 });
  }
  part(c, (q) => blobPath(q, 0, 0, s, s * 0.9, seed, 0.06, 40), { base: col, lit: "radial", box: [-s, -s, s, s], hi: 0.4, lo: 0.5, rim: 0.32, tex: skinTex(seed, 0.4), line: 1.2 });
  part(c, (q) => E(q, s * 0.3, side * s * 0.8, s * 0.34, s * 0.22), { base: col, lit: "radial", box: [0, side * s * 0.8 - s * 0.22, s * 0.64, side * s * 0.8 + s * 0.22], hi: 0.3, lo: 0.4, rim: 0.2, line: 1 });
  c.restore();
}
function glowVeins(c: G, seed: number, x0: number, y0: number, x1: number, y1: number, s: number, n: number): void {
  if (s <= 0) return;
  const r = mulberry(seed);
  const w = x1 - x0;
  const h = y1 - y0;
  const m = Math.min(w, h);
  c.save();
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    let x = x0 + r() * w;
    let y = y0 + r() * h;
    let a = r() * TAU;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      a += (r() - 0.5) * 1.3;
      x += Math.cos(a) * m * 0.05;
      y += Math.sin(a) * m * 0.05;
      c.lineTo(x, y);
    }
    c.strokeStyle = `rgba(190,235,80,${0.18 + 0.5 * s * r()})`;
    c.lineWidth = (1 + r() * 1.2) * P;
    c.stroke();
  }
  c.restore();
}
function stretchMarks(c: G, seed: number, cx: number, cy: number, rx: number, ry: number, a: number): void {
  const r = mulberry(seed);
  for (let i = 0; i < 10; i++) {
    const ang = r() * TAU;
    const d = 0.55 + r() * 0.35;
    const x = cx + Math.cos(ang) * rx * d;
    const y = cy + Math.sin(ang) * ry * d;
    strokeP(c, (q) => {
      q.moveTo(x, y);
      q.lineTo(x + Math.cos(ang) * rx * 0.15, y + Math.sin(ang) * ry * 0.15);
    }, `rgba(225,215,190,${a * (0.4 + r() * 0.6)})`, (1 + r()) * P);
  }
}

interface Look {
  seed: number;
  skin: string;
  cloth: string;
  clothTex: Tex;
  sleeve: "short" | "full" | "none";
  sleeveCol?: string;
  sleeveTex?: Tex;
  hand?: string;
  hood?: boolean;
  collar?: string;
  noVeinGlow?: boolean;
  /** The burst's cloth scraps (the look's colours). */
  cut: readonly string[];
  detail?: (c: G, g: number, s: number, skin: string) => void;
  over?: (c: G, g: number, s: number) => void;
  head: (c: G, skin: string, s: number) => void;
}

/** One Bloater in reference units, facing +y, swell `s` (0–1). */
function bloater(c: G, V: Look, s: number): void {
  const g = 1 + 0.35 * s;
  const hg = 1 + 0.1 * s;
  const skin = s > 0 ? mixHex(V.skin, SWELL_SKIN, s * 0.55) : V.skin;
  const tp = smoothClosed(bloatPts(g));
  // contact shadow (towards the lower right of the screen, whatever the facing)
  {
    const d = devToLocal(c, 3, 4);
    c.save();
    c.translate(d[0], d[1]);
    c.filter = "blur(2px)";
    fillP(c, tp, "rgba(0,0,0,0.5)");
    c.filter = "none";
    c.restore();
  }
  // arms first: they stay UNDER the torso and its clothes in every pose (the round-B rule)
  for (const sd of [1, -1]) {
    const S: Pt = [sd * 0.33 * g, 0.04 * g];
    const Eb: Pt = [sd * (0.52 * g + 0.02), 0.2 * g];
    const F: Pt = [sd * (0.5 * g + 0.03 * s), 0.37 * g + 0.02];
    const pts = [...S, ...Eb, ...F];
    const ws = [0.18, 0.165, 0.14];
    if (V.sleeve === "full") drawLimb(c, pts, ws.map((w) => w + 0.01), V.sleeveCol ?? V.cloth, 400 + sd, { tex: V.sleeveTex ?? clothTex(401 + sd), hi: 0.3 });
    else {
      drawLimb(c, pts, ws, skin, 410 + sd, { tex: skinTex(410 + sd, 1.2) });
      if (V.sleeve === "short") drawLimb(c, [...S, lerp(S[0], Eb[0], 0.7), lerp(S[1], Eb[1], 0.7)], [(ws[0] as number) + 0.04, (ws[1] as number) + 0.045], V.sleeveCol ?? V.cloth, 420 + sd, { tex: V.sleeveTex ?? clothTex(421 + sd), hi: 0.28, knobs: false });
    }
    const a = Math.atan2(F[1] - Eb[1], F[0] - Eb[0]);
    puffyHand(c, F[0] + Math.cos(a) * 0.06, F[1] + Math.sin(a) * 0.06, a, 0.06, V.hand ?? skin, 430 + sd, -sd);
  }
  // torso
  part(c, tp, { base: V.cloth, lit: "radial", box: [-0.5 * g, -0.41 * g, 0.5 * g, 0.5 * g], hi: 0.42 + 0.12 * s, lo: 0.62, tex: V.clothTex, rim: 0.32, inner: 0.25 });
  c.save();
  c.beginPath();
  tp(c);
  c.clip();
  for (const sd of [-1, 1]) {
    const sg = c.createRadialGradient(sd * 0.3 * g - 0.03, 0.02 * g - 0.03, 0, sd * 0.3 * g, 0.02 * g, 0.17 * g);
    sg.addColorStop(0, "rgba(235,240,245,0.16)");
    sg.addColorStop(1, "rgba(235,240,245,0)");
    c.fillStyle = sg;
    c.fillRect(-1, -1, 2, 2);
    strokeP(c, (q) => {
      q.moveTo(sd * 0.4 * g, 0.12 * g);
      q.quadraticCurveTo(sd * 0.33 * g, 0.2 * g, sd * 0.37 * g, 0.3 * g);
    }, "rgba(0,0,0,0.28)", 2 * P);
  }
  for (const yy of [-0.25, -0.32]) {
    strokeP(c, (q) => {
      q.moveTo(-0.3 * g, yy * g + 0.03);
      q.quadraticCurveTo(0, yy * g - 0.025, 0.3 * g, yy * g + 0.03);
    }, "rgba(0,0,0,0.26)", 2.2 * P);
  }
  V.detail?.(c, g, s, skin);
  strokeP(c, (q) => q.arc(0, 0.08 * g, 0.24 * g, 0.45, Math.PI - 0.45), "rgba(0,0,0,0.3)", 2.4 * P);
  {
    const bg = c.createRadialGradient(-0.1 * g, 0.28 * g, 0, 0, 0.3 * g, 0.28 * g);
    bg.addColorStop(0, `rgba(240,245,230,${0.12 + 0.1 * s})`);
    bg.addColorStop(1, "rgba(240,245,230,0)");
    c.fillStyle = bg;
    c.fillRect(-1, -1, 2, 2);
  }
  // the highest points catch the light: the upper back and the top of the belly; the drum-tight swell gets a sheen
  const gr = c.createRadialGradient(-0.12 * g, 0, 0, -0.05 * g, 0.05 * g, 0.5 * g);
  gr.addColorStop(0, `rgba(230,235,240,${0.1 + 0.12 * s})`);
  gr.addColorStop(1, "rgba(230,235,240,0)");
  c.fillStyle = gr;
  c.fillRect(-1, -1, 2, 2);
  if (s > 0) {
    fillP(c, (q) => E(q, -0.2 * g, -0.12 * g, 0.12 * g, 0.05 * g, -0.6), `rgba(255,255,240,${0.18 * s})`);
    fillP(c, (q) => E(q, -0.25 * g, 0.25 * g, 0.08 * g, 0.035 * g, 0.7), `rgba(255,255,240,${0.14 * s})`);
    c.fillStyle = `rgba(175,200,85,${0.1 * s})`;
    c.fillRect(-1, -1, 2, 2);
    if (!V.noVeinGlow) glowVeins(c, 450 + V.seed, -0.45 * g, -0.38 * g, 0.45 * g, 0.48 * g, s, 8 + Math.round(14 * s));
  }
  c.restore();
  c.beginPath();
  tp(c);
  c.strokeStyle = "rgba(6,6,7,0.9)";
  c.lineWidth = 1.5 * P;
  c.stroke();
  V.over?.(c, g, s);
  // neck fat behind the head, jowls in front of it, then the head
  const hy = 0.1 * g;
  if (!V.hood) {
    part(c, (q) => E(q, 0, hy - 0.065 * hg, 0.13 * hg, 0.075 * hg), { base: skin, lit: "radial", box: [-0.13, hy - 0.14, 0.13, hy + 0.01], hi: 0.35, lo: 0.5, rim: 0.3, tex: skinTex(461, 0.5), line: 1.1 });
    strokeP(c, (q) => {
      q.moveTo(-0.09 * hg, hy - 0.1 * hg);
      q.quadraticCurveTo(0, hy - 0.125 * hg, 0.09 * hg, hy - 0.1 * hg);
    }, "rgba(0,0,0,0.35)", 1.4 * P);
    part(c, (q) => E(q, 0, hy + 0.07 * hg, 0.105 * hg, 0.075 * hg), { base: skin, lit: "radial", box: [-0.105, hy, 0.105, hy + 0.145], hi: 0.35, lo: 0.5, rim: 0.3, tex: skinTex(460, 0.5), line: 1.1 });
    if (V.collar) {
      const collar = V.collar;
      const cp: Path = (q) => q.arc(0, hy + 0.005, 0.116 * hg, -0.35, Math.PI + 0.35);
      strokeP(c, cp, "rgba(10,10,8,0.8)", 0.022 + 2 * P);
      strokeP(c, cp, collar, 0.022);
    }
  }
  c.save();
  c.translate(0, hy);
  c.scale(hg, hg);
  V.head(c, skin, s);
  c.restore();
}

// ---- the five looks ----
const BL1: Look = {
  seed: 1,
  skin: "#86907e",
  cloth: "#c3c5b9",
  clothTex: clothTex(501, "120,118,60"),
  sleeve: "short",
  sleeveCol: "#b9bbaf",
  cut: ["#c9cbbd", "#9fa293"],
  collar: "#d2d3c8",
  noVeinGlow: true,
  detail(c, g, s, skin) {
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const y = -0.25 * g + k * 0.08 * g;
        strokeP(c, (q) => {
          q.moveTo(sd * 0.12 * g, y);
          q.quadraticCurveTo(sd * 0.3 * g, y + 0.04, sd * 0.46 * g, y + 0.1);
        }, "rgba(40,40,30,0.18)", 1.6 * P);
      }
    }
    const w = 0.12 * g + 0.1 * s;
    const gap: Path = (q) => {
      q.moveTo(0, 0.16 * g);
      q.bezierCurveTo(w * 0.9, 0.24 * g, w * 1.15, 0.4 * g, 0.01, 0.54 * g);
      q.bezierCurveTo(-w * 1.15, 0.4 * g, -w * 0.9, 0.24 * g, 0, 0.16 * g);
      q.closePath();
    };
    part(c, gap, { base: shade(skin, -0.18), lit: "radial", box: [-w, 0.14 * g, w, 0.53 * g], hi: 0.3, lo: 0.5, tex: skinTex(502, 1.6), rim: 0, inner: 0.55, line: 1.6 });
    c.save();
    c.beginPath();
    gap(c);
    c.clip();
    stretchMarks(c, 503, 0, 0.36 * g, w, 0.15 * g, 0.6);
    fillP(c, (q) => E(q, 0.005, 0.37 * g, 0.012, 0.009), "rgba(30,25,20,0.8)");
    glowVeins(c, 509, -w, 0.14 * g, w, 0.53 * g, s, 10);
    c.restore();
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const y = (0.24 + k * 0.075) * g;
        strokeP(c, (q) => {
          q.moveTo(sd * (w * 0.95 + 0.015), y);
          q.quadraticCurveTo(sd * (w + 0.1), y - 0.02, sd * (w + 0.22), y - 0.07);
        }, "rgba(40,40,30,0.42)", 1.8 * P);
      }
    }
    for (const sd of [-1, 1]) {
      for (const y of [0.25, 0.34, 0.44]) {
        const k = Math.sin(((y - 0.16) / 0.38) * Math.PI) * 0.95;
        rivet(c, sd * (w * k + 0.014), y * g, 0.012, "#e2e0d2");
      }
    }
    for (const sd of [-1, 1]) fillP(c, (q) => blobPath(q, sd * 0.36 * g, 0.1 * g, 0.1, 0.13, 504 + sd, 0.4, 30), "rgba(150,140,60,0.28)");
    fillP(c, (q) => blobPath(q, 0.1 * g, -0.2 * g, 0.12, 0.08, 505, 0.4, 30), "rgba(110,112,70,0.2)");
    if (s > 0.3) {
      for (const [x, y, a] of [
        [0.33, 0.08, 0.4],
        [-0.36, -0.06, -0.5],
      ] as const) {
        const L = 0.05 + 0.12 * s;
        strokeP(c, (q) => {
          q.moveTo(x * g, y * g);
          q.lineTo(x * g + Math.cos(a) * L, y * g + Math.sin(a) * L);
        }, `rgba(170,195,90,${0.7 * s})`, (2 + 3 * s) * P);
      }
    }
  },
  over(c, g) {
    // the tie, slid off the belly to the right
    const tie: Path = (q) => {
      q.moveTo(0, 0.21 * g);
      q.lineTo(0.035, 0.2 * g);
      q.quadraticCurveTo(0.17 * g, 0.27 * g, 0.25 * g, 0.36 * g);
      q.lineTo(0.245 * g, 0.41 * g);
      q.lineTo(0.2 * g, 0.39 * g);
      q.quadraticCurveTo(0.12 * g, 0.3 * g, 0, 0.21 * g);
      q.closePath();
    };
    part(c, tie, { base: "#5c2226", box: [-0.03, 0.2 * g, 0.14 * g, 0.5 * g], hi: 0.35, lo: 0.45, rim: 0.3, line: 1.1 });
    c.save();
    c.beginPath();
    tie(c);
    c.clip();
    for (let k = 0; k < 7; k++) {
      strokeP(c, (q) => {
        q.moveTo(-0.05, 0.22 * g + k * 0.045);
        q.lineTo(0.2, 0.17 * g + k * 0.045);
      }, "rgba(160,140,90,0.35)", 1.6 * P, "butt");
    }
    c.restore();
    for (const sd of [-1, 1]) part(c, (q) => Pg(q, [sd * 0.015, 0.2 * g, sd * 0.075, 0.16 * g, sd * 0.06, 0.23 * g]), { base: "#c9cbbd", box: [-0.08, 0.15 * g, 0.08, 0.24 * g], hi: 0.3, rim: 0.2, line: 1 });
  },
  head(c, skin) {
    bareHead(c, 0, 0, 0.1, 0.11, skin, 506);
    for (let k = 0; k < 3; k++) {
      strokeP(c, (q) => {
        q.moveTo(-0.08, -0.02 + k * 0.025);
        q.quadraticCurveTo(0, -0.04 + k * 0.025, 0.08, -0.01 + k * 0.025);
      }, "rgba(25,22,18,0.5)", 1 * P);
    }
  },
};

const BL2: Look = {
  seed: 2,
  skin: "#86907e",
  cloth: "#a8912f",
  clothTex: polyTex(511),
  sleeve: "full",
  sleeveCol: "#a08a2c",
  sleeveTex: polyTex(512),
  hand: "#1e1f1c",
  hood: true,
  cut: ["#b39b33", "#1e1f1c", "#7a7b76"],
  noVeinGlow: true,
  detail(c, g, s) {
    for (const [x, y, rx, ry, a] of [
      [-0.22, -0.1, 0.16, 0.05, -0.7],
      [-0.28, 0.22, 0.1, 0.035, 0.8],
      [0.05, -0.3, 0.12, 0.03, 0.1],
    ] as const) fillP(c, (q) => E(q, x * g, y * g, rx * g, ry * g, a), "rgba(255,250,215,0.22)");
    const tape: Path = (q) => {
      q.moveTo(-0.6, 0.3 * g);
      q.quadraticCurveTo(0, 0.22 * g, 0.6, 0.3 * g);
    };
    strokeP(c, tape, "rgba(20,20,15,0.6)", 0.056);
    strokeP(c, tape, "#76776f", 0.046);
    c.save();
    c.translate(0, -0.012);
    strokeP(c, tape, "rgba(230,230,220,0.25)", 0.008);
    c.restore();
    c.save();
    c.translate(0, -0.24 * g);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU - Math.PI / 2;
      fillP(c, (q) => E(q, Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0.03, 0.03), "rgba(15,15,12,0.85)");
    }
    fillP(c, (q) => E(q, 0, 0, 0.018, 0.018), "#a8912f");
    strokeP(c, (q) => q.arc(0, 0, 0.05, 0, TAU), "rgba(15,15,12,0.85)", 0.008);
    c.restore();
    const tx = 0.31 * g;
    const ty = 0.12 * g;
    const tw = 0.05 + 0.06 * s;
    const tear: Path = (q) => blobPath(q, tx, ty, tw, tw * 0.7, 513, 0.45, 30, 0.6);
    fillP(c, tear, "#2c3318");
    c.save();
    c.beginPath();
    tear(c);
    c.clip();
    fillP(c, (q) => E(q, tx, ty, tw * 0.8, tw * 0.55), "#8e9a52");
    glow(c, tx, ty, tw * 1.4, "190,235,80", 0.5 + 0.4 * s);
    c.restore();
    strokeP(c, tear, "rgba(10,10,6,0.9)", 1.3 * P);
    for (let i = 0; i < 3; i++) fillP(c, (q) => blobPath(q, tx + 0.06 + i * 0.04, ty + 0.02 + i * 0.03, 0.03 + i * 0.012, 0.025 + i * 0.01, 514 + i, 0.4, 24), `rgba(180,205,90,${0.25 - i * 0.06})`);
  },
  head(c) {
    part(c, (q) => E(q, 0, 0, 0.135, 0.145), { base: "#a8912f", lit: "radial", box: [-0.135, -0.145, 0.135, 0.145], hi: 0.5, lo: 0.5, tex: polyTex(515), rim: 0.35 });
    fillP(c, (q) => E(q, -0.05, -0.05, 0.05, 0.025, -0.5), "rgba(255,250,215,0.3)");
    part(c, (q) => R(q, -0.085, 0.055, 0.17, 0.075, 0.03), { base: "#20262a", lit: "top", box: [-0.085, 0.055, 0.085, 0.13], hi: 0.5, lo: 0.3, rim: 0.3, line: 1.2 });
    strokeP(c, (q) => {
      q.moveTo(-0.07, 0.07);
      q.lineTo(-0.03, 0.09);
      q.lineTo(-0.01, 0.08);
      q.lineTo(0.02, 0.115);
    }, "rgba(220,235,240,0.6)", 1 * P);
    for (const sd of [-1, 1]) part(c, (q) => E(q, sd * 0.075, 0.12, 0.03, 0.03), { base: "#2a2b28", lit: "radial", box: [sd * 0.075 - 0.03, 0.09, sd * 0.075 + 0.03, 0.15], hi: 0.35, lo: 0.4, rim: 0.25, line: 1 });
  },
};

const BL3: Look = {
  seed: 3,
  skin: "#7e8a76",
  cloth: "#5b616c",
  clothTex: clothTex(521, "70,60,30"),
  sleeve: "full",
  sleeveCol: "#5b616c",
  collar: "#4f555f",
  noVeinGlow: true,
  hand: "#9a5a22",
  cut: ["#4a4a2c", "#4a4f58", "#9a5a22"],
  detail(c, g, s) {
    const W = "#5e5c36";
    const bib: Path = (q) => {
      q.moveTo(-0.6, 0.6);
      q.lineTo(-0.6, 0.2 * g);
      q.quadraticCurveTo(-0.2 * g, 0.13 * g, -0.15 * g, 0.18 * g);
      q.lineTo(0.15 * g, 0.18 * g);
      q.quadraticCurveTo(0.2 * g, 0.13 * g, 0.6, 0.2 * g);
      q.lineTo(0.6, 0.6);
      q.closePath();
    };
    const back: Path = (q) => {
      q.moveTo(-0.6, -0.6);
      q.lineTo(-0.6, -0.24 * g);
      q.quadraticCurveTo(0, -0.2 * g, 0.6, -0.24 * g);
      q.lineTo(0.6, -0.6);
      q.closePath();
    };
    for (const p of [bib, back]) part(c, p, { base: W, lit: "radial", box: [-0.5 * g, -0.41 * g, 0.5 * g, 0.5 * g], hi: 0.4, lo: 0.45, tex: rustTex(522, 0.25), rim: 0.2, inner: 0.2, line: 1.2 });
    for (const sd of [-1, 1]) {
      const st: Path = (q) => {
        q.moveTo(sd * 0.14 * g, 0.18 * g);
        q.quadraticCurveTo(sd * 0.2 * g, 0, sd * 0.12 * g, -0.08 * g);
        q.lineTo(-sd * 0.14 * g, -0.24 * g);
      };
      strokeP(c, st, "rgba(10,10,6,0.85)", 0.042);
      strokeP(c, st, "#3d3c25", 0.032);
      part(c, (q) => R(q, sd * 0.14 * g - 0.02, 0.15 * g, 0.04, 0.035, 0.006), { base: "#9a9da2", box: [sd * 0.14 * g - 0.02, 0.15 * g, sd * 0.14 * g + 0.02, 0.185 * g], hi: 0.5, line: 0.9 });
    }
    const r = mulberry(523);
    for (let i = 0; i < 7; i++) {
      const x = (r() - 0.5) * 0.8 * g;
      const y = (r() - 0.5) * 0.8 * g;
      const rx = 0.04 + r() * 0.07;
      const ry = 0.03 + r() * 0.05;
      const col = r() < 0.5 ? "60,58,28" : "82,74,36";
      fillP(c, (q) => blobPath(q, x, y, rx, ry, 524 + i, 0.5, 30), `rgba(${col},0.6)`);
      fillP(c, (q) => E(q, x - 0.01, y - 0.01, 0.015, 0.008), "rgba(220,225,170,0.25)");
    }
    if (s > 0.2) {
      for (const sd of [-1, 1]) {
        strokeP(c, (q) => {
          q.moveTo(sd * 0.2 * g, 0.21 * g);
          q.lineTo(sd * (0.2 * g + 0.06 * s), 0.21 * g + 0.04 * s);
        }, `rgba(175,205,85,${s})`, (2 + 2 * s) * P);
      }
    }
  },
  head(c, skin) {
    bareHead(c, 0, 0, 0.1, 0.11, skin, 525);
    part(c, (q) => {
      q.ellipse(0, -0.012, 0.106, 0.1, 0, Math.PI * 0.95, Math.PI * 2.05);
      q.closePath();
    }, { base: "#26303d", lit: "radial", box: [-0.106, -0.11, 0.106, 0.04], hi: 0.35, lo: 0.4, tex: clothTex(526), rim: 0.3, line: 1.1 });
    for (let x = -0.08; x <= 0.08; x += 0.02) {
      strokeP(c, (q) => {
        q.moveTo(x, -0.1);
        q.lineTo(x * 1.1, 0.02);
      }, "rgba(0,0,0,0.25)", 1 * P);
    }
    strokeP(c, (q) => q.ellipse(0, 0, 0.104, 0.1, 0, 0.15, Math.PI - 0.15), "#141414", 0.016);
    part(c, (q) => R(q, -0.03, 0.085, 0.06, 0.035, 0.01), { base: "#2a2b2d", box: [-0.03, 0.085, 0.03, 0.12], hi: 0.4, line: 1 });
    fillP(c, (q) => E(q, 0, 0.115, 0.022, 0.01), "#fff6d0");
    glow(c, 0, 0.13, 0.07, "255,240,190", 0.5);
  },
};

/** BL4's Hawaiian shirt print over a cloth weave. */
const hawaiiTex: Tex = (c, x0, y0, x1, y1) => {
  const r = mulberry(531);
  for (let i = 0; i < 46; i++) {
    const x = x0 + r() * (x1 - x0);
    const y = y0 + r() * (y1 - y0);
    const sz = 0.025 + r() * 0.03;
    const col = r() < 0.6 ? "196,160,138" : "205,200,170";
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + r();
      fillP(c, (q) => E(q, x + Math.cos(a) * sz * 0.6, y + Math.sin(a) * sz * 0.6, sz * 0.45, sz * 0.3, a), `rgba(${col},0.55)`);
    }
    fillP(c, (q) => E(q, x, y, sz * 0.2, sz * 0.2), "rgba(200,170,60,0.6)");
  }
  clothTex(532)(c, x0, y0, x1, y1);
};

const BL4: Look = {
  seed: 4,
  skin: "#968478",
  cloth: "#3c5d5e",
  sleeve: "short",
  sleeveCol: "#3c5d5e",
  noVeinGlow: true,
  cut: ["#3c5d5e", "#c4a08a", "#a59a7c"],
  clothTex: hawaiiTex,
  detail(c, g, s, skin) {
    const bw = 0.33 * g + 0.04 * s;
    const belly: Path = (q) => {
      q.moveTo(0, 0.06 * g);
      q.bezierCurveTo(bw * 0.9, 0.06 * g, bw * 1.05, 0.28 * g, bw * 0.75, 0.56 * g);
      q.lineTo(-bw * 0.75, 0.56 * g);
      q.bezierCurveTo(-bw * 1.05, 0.28 * g, -bw * 0.9, 0.06 * g, 0, 0.06 * g);
      q.closePath();
    };
    part(c, belly, { base: skin, lit: "radial", box: [-bw, 0.06 * g, bw, 0.56 * g], hi: 0.45, lo: 0.4, tex: skinTex(533, 1.6), rim: 0, inner: 0.45, line: 1.3 });
    c.save();
    c.beginPath();
    belly(c);
    c.clip();
    stretchMarks(c, 534, 0, 0.32 * g, bw, 0.22 * g, 0.5);
    fillP(c, (q) => E(q, 0, 0.36 * g, 0.014, 0.01), "rgba(40,25,20,0.8)");
    fillP(c, (q) => E(q, 0, 0.12 * g, 0.14 * g, 0.05 * g), "rgba(150,60,50,0.18)");
    glowVeins(c, 539, -bw, 0.06 * g, bw, 0.56 * g, s, 14);
    c.restore();
    for (const sd of [-1, 1]) {
      strokeP(c, (q) => {
        q.moveTo(sd * 0.03, 0.07 * g);
        q.bezierCurveTo(sd * bw * 0.95, 0.07 * g, sd * bw * 1.08, 0.28 * g, sd * bw * 0.78, 0.56 * g);
      }, "rgba(20,35,35,0.6)", 2.4 * P);
    }
  },
  over(c, g) {
    const st: Path = (q) => {
      q.moveTo(0.22 * g, -0.18 * g);
      q.quadraticCurveTo(0.02, 0.05, -0.25 * g, 0.3 * g);
    };
    strokeP(c, st, "rgba(5,5,5,0.9)", 0.026);
    strokeP(c, st, "#25221e", 0.018);
    c.save();
    c.translate(-0.27 * g, 0.32 * g);
    c.rotate(0.5);
    part(c, (q) => R(q, -0.06, -0.035, 0.12, 0.07, 0.01), { base: "#1d1e20", box: [-0.06, -0.035, 0.06, 0.035], tex: polyTex(535, true), hi: 0.4, line: 1.1 });
    part(c, (q) => E(q, 0, 0.04, 0.03, 0.03), { base: "#2c2d30", lit: "radial", box: [-0.03, 0.01, 0.03, 0.07], hi: 0.5, line: 1 });
    fillP(c, (q) => E(q, 0, 0.04, 0.016, 0.016), "#3c5a78");
    fillP(c, (q) => E(q, -0.006, 0.034, 0.006, 0.004), "rgba(255,255,255,0.6)");
    c.restore();
  },
  head(c, skin) {
    bareHead(c, 0, 0, 0.1, 0.11, skin, 536);
    part(c, (q) => E(q, 0, 0.005, 0.17, 0.175), { base: "#a59a7c", lit: "radial", box: [-0.17, -0.17, 0.17, 0.18], hi: 0.35, lo: 0.45, tex: clothTex(537, "90,80,60"), rim: 0.3, line: 1.2 });
    for (let rr = 0.13; rr < 0.17; rr += 0.013) strokeP(c, (q) => q.arc(0, 0.005, rr, 0, TAU), "rgba(60,50,35,0.25)", 0.8 * P);
    part(c, (q) => E(q, 0, 0, 0.105, 0.11), { base: "#9b9073", lit: "radial", box: [-0.105, -0.11, 0.105, 0.11], hi: 0.4, lo: 0.45, tex: clothTex(538), rim: 0.25, line: 1.1 });
    strokeP(c, (q) => q.arc(0, 0, 0.1, 0, TAU), "#4a4232", 0.012);
  },
};

const BL5_SACS: readonly (readonly [number, number, number])[] = [
  [-0.22, -0.18, 0.1],
  [0.18, -0.22, 0.085],
  [0.3, 0.05, 0.075],
  [-0.33, 0.08, 0.07],
  [0.02, -0.3, 0.06],
  [-0.12, 0.33, 0.09],
  [0.16, 0.3, 0.07],
  [0.36, -0.12, 0.05],
  [-0.05, 0.06, 0.05],
  [-0.4, -0.1, 0.045],
];

const BL5: Look = {
  seed: 5,
  skin: "#7a8668",
  cloth: "#7a8668",
  clothTex: skinTex(541, 3),
  sleeve: "none",
  cut: ["#a9b455", "#5b6648", "#30384a"],
  detail(c, g, s) {
    const rim: Path = (q) => {
      q.moveTo(-0.6, -0.6);
      q.lineTo(-0.6, -0.31 * g);
      q.quadraticCurveTo(0, -0.27 * g, 0.6, -0.31 * g);
      q.lineTo(0.6, -0.6);
      q.closePath();
    };
    part(c, rim, { base: "#30384a", lit: "top", box: [-0.5, -0.42 * g, 0.5, -0.27 * g], hi: 0.3, lo: 0.4, tex: clothTex(542), rim: 0.2, line: 1.2 });
    veinTex(543, "60,40,75")(c, -0.5 * g, -0.4 * g, 0.5 * g, 0.5 * g);
    const r = mulberry(544);
    for (let i = 0; i < 6; i++) {
      const x = (r() - 0.5) * 0.8 * g;
      const y = (r() - 0.5) * 0.8 * g;
      const rx = 0.05 + r() * 0.05;
      const ry = 0.04 + r() * 0.04;
      fillP(c, (q) => blobPath(q, x, y, rx, ry, 545 + i, 0.5, 30), "rgba(70,60,80,0.3)");
    }
    for (const [x, y, a] of [
      [0.1, 0.12, 0.5],
      [-0.25, -0.02, -0.8],
    ] as const) {
      const cut: Path = (q) => {
        q.moveTo(x * g, y * g);
        q.quadraticCurveTo(x * g + 0.03, y * g + 0.05, x * g + Math.cos(a) * 0.09, y * g + Math.sin(a) * 0.09);
      };
      strokeP(c, cut, "#2c3318", 3 * P);
      strokeP(c, cut, "rgba(170,190,80,0.5)", 1 * P);
    }
    for (const [x, y, rs] of BL5_SACS) {
      const sr = rs * (1 + 0.55 * s);
      const X = x * g;
      const Y = y * g;
      part(c, (q) => blobPath(q, X, Y, sr, sr * 0.9, (546 + x * 100) | 0, 0.12, 30), { base: "#9fab50", lit: "radial", box: [X - sr, Y - sr, X + sr, Y + sr], hi: 0.55, lo: 0.35, rim: 0.35, inner: 0.2, line: 1.1 });
      glow(c, X, Y, sr * 0.9, "200,240,90", 0.25 + 0.45 * s);
      fillP(c, (q) => E(q, X - sr * 0.35, Y - sr * 0.35, sr * 0.3, sr * 0.18, -0.7), "rgba(255,255,230,0.45)");
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + x * 10;
        strokeP(c, (q) => {
          q.moveTo(X + Math.cos(a) * sr * 0.95, Y + Math.sin(a) * sr * 0.95);
          q.lineTo(X + Math.cos(a) * sr * 1.5, Y + Math.sin(a) * sr * 1.5);
        }, "rgba(60,40,70,0.5)", 1.2 * P);
      }
    }
  },
  head(c, skin, s) {
    bareHead(c, 0, 0, 0.098, 0.108, skin, 547);
    const sr = 0.035 * (1 + 0.4 * s);
    part(c, (q) => E(q, 0.04, -0.03, sr, sr * 0.9), { base: "#9fab50", lit: "radial", box: [0.04 - sr, -0.03 - sr, 0.04 + sr, -0.03 + sr], hi: 0.5, lo: 0.35, rim: 0.3, line: 1 });
    glow(c, 0.04, -0.03, sr, "200,240,90", 0.3 + 0.4 * s);
  },
};

const LOOKS: readonly Look[] = [BL1, BL2, BL3, BL4, BL5];

/** The burst's cloth scrap colours of look `variant` (`0xRRGGBB` tints; the gore is the shared bile). */
export function bloaterCutColors(variant: number): readonly number[] {
  const look = LOOKS[((variant % LOOKS.length) + LOOKS.length) % LOOKS.length] as Look;
  return look.cut.map((h) => parseInt(h.slice(1), 16));
}

/**
 * The Bloater look `variant` (0–4: BL1–BL5), top-down, facing +x, centred on its 0.5 m body of `r`
 * px, swollen `s` (0 = walking; the swell frames are 1/3, 2/3 and 1: 1.35 × wider at 1).
 */
export function drawBloater(c: G, r: number, variant: number, s = 0): void {
  const look = LOOKS[((variant % LOOKS.length) + LOOKS.length) % LOOKS.length] as Look;
  const ppm = r / REF_BODY_R_M;
  c.save();
  c.rotate(-Math.PI / 2); // reference faces +y → frame faces +x
  c.scale(ppm, ppm);
  P = 1 / ppm;
  bloater(c, look, Math.max(0, Math.min(1, s)));
  c.restore();
}
