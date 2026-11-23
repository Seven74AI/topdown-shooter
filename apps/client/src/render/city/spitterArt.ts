/**
 * Story 5.6: the Spitter, drawn in game code (designer's art method, `docs/epic-5-decisions.md`).
 * Ported from the round-2 code drawing P2 "Spitter, thin woman" (`docs/art/epic-5/round-a/
 * code-drawings.html`): hunched in a hospital gown, an enormous distended jaw glowing acid green,
 * glowing chest slits, long stringy hair falling back, drool. The designer's final pick (P2 / P4) is
 * still open: the whole look lives in `drawSpitter`, so another drawing drops in here alone.
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
 * The reference is drawn small for its 0.35 m body (back 0.37 m wide); in game it stood half the
 * width of a Walker's shoulders and read as a dot. Drawn this much larger so it matches a Walker's
 * bulk (back ~0.6 m, jaw reaching ~0.45 m ahead): a distinct, readable silhouette (AC 17).
 */
export const SPITTER_ART_SCALE = 1.6;
/** The reference's body centre (m): the frame centre. */
const REF_CENTRE_Y_M = 0.09;
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

/** Gown colours per variant (a crowd of Spitters is not all one gown). */
export const SPITTER_GOWNS = ["#4f5d5b", "#5a524a"] as const; // darker than the reference: the bright jaw carries the silhouette at night

/**
 * The Spitter, top-down, facing +x, centred on its body, `r` = collision radius in px. `windup`:
 * the rearing-back pose (jaw wider, mouth and chest blazing) shown while it winds up (the telegraph).
 */
export function drawSpitter(c: G, r: number, variant: number, windup: boolean): void {
  const ppm = (r / REF_BODY_R_M) * SPITTER_ART_SCALE;
  c.save();
  c.rotate(-Math.PI / 2); // reference faces +y → frame faces +x
  c.scale(ppm, ppm);
  c.translate(0, -REF_CENTRE_Y_M);
  P = 1 / ppm;
  const pu = windup ? 1.6 : 0.85;
  const SK = "#8e938a";
  const GOWN = SPITTER_GOWNS[variant % SPITTER_GOWNS.length] as string;
  const back: Path = (c) => {
    c.moveTo(-0.185, 0.055);
    c.bezierCurveTo(-0.2, 0.12, -0.13, 0.15, -0.07, 0.145);
    c.quadraticCurveTo(0, 0.158, 0.07, 0.145);
    c.bezierCurveTo(0.13, 0.15, 0.2, 0.12, 0.185, 0.055);
    c.bezierCurveTo(0.18, -0.01, 0.16, -0.08, 0.12, -0.12);
    for (const [x, y] of [
      [0.09, -0.138],
      [0.06, -0.13],
      [0.03, -0.146],
      [0.0, -0.136],
      [-0.03, -0.148],
      [-0.06, -0.132],
      [-0.09, -0.14],
      [-0.12, -0.12],
    ] as const)
      c.lineTo(x, y);
    c.bezierCurveTo(-0.16, -0.08, -0.18, -0.01, -0.185, 0.055);
    c.closePath();
  };
  // Windup: the arms pull back and the jaw drops further (rearing back).
  const pull = windup ? -0.03 : 0;
  const armL = [-0.16, 0.08, -0.215, 0.17 + pull, -0.195, 0.268 + pull * 2];
  const armR = [0.16, 0.085, 0.218, 0.175 + pull, 0.2, 0.272 + pull * 2];
  const jy = windup ? 1.12 : 1; // jaw length factor
  const jaw: Path = (c) => {
    c.moveTo(-0.05, 0.19);
    c.bezierCurveTo(-0.07 * jy, 0.19 + 0.11 * jy, -0.042, 0.19 + 0.185 * jy, 0, 0.19 + 0.192 * jy);
    c.bezierCurveTo(0.042, 0.19 + 0.185 * jy, 0.07 * jy, 0.19 + 0.11 * jy, 0.05, 0.19);
    c.closePath();
  };
  const hd: Path = (c) => E(c, 0, 0.165, 0.082, 0.09);
  const rnd = mulberry(77);
  for (let i = 0; i < 6; i++) acidDrop(c, (rnd() - 0.5) * 0.14, 0.4 + rnd() * 0.08, 0.008 + rnd() * 0.01, pu, 0.6);
  drawLimb(c, armL, [0.064, 0.05, 0.04], SK, 221);
  hand(c, armL[4] as number, armL[5] as number, 1.7, 0.03, SK, 230);
  drawLimb(c, armR, [0.064, 0.05, 0.04], SK, 222);
  hand(c, armR[4] as number, armR[5] as number, 1.45, 0.03, SK, 240);
  for (const s of [-1, 1]) part(c, (c) => blobPath(c, s * 0.172, 0.085, 0.056, 0.05, 210 + s, 0.18), { base: GOWN, lit: "radial", box: [s * 0.172 - 0.056, 0.035, s * 0.172 + 0.056, 0.135], hi: 0.28, lo: 0.45, tex: clothTex(211) });
  part(c, back, { base: GOWN, lit: "radial", box: [-0.2, -0.21, 0.2, 0.16], hi: 0.32, lo: 0.58, tex: clothTex(212, "70,90,30") });
  c.save();
  c.beginPath();
  back(c);
  c.clip();
  const gap: Path = (c) => {
    c.moveTo(-0.022, 0.14);
    c.quadraticCurveTo(-0.042, 0.02, -0.018, -0.135);
    c.lineTo(0.02, -0.135);
    c.quadraticCurveTo(0.044, 0.02, 0.026, 0.14);
    c.closePath();
  };
  part(c, gap, { base: SK, lit: "radial", box: [-0.044, -0.11, 0.044, 0.14], hi: 0.25, lo: 0.45, tex: skinTex(213), inner: 0.6, rim: 0 });
  for (let y = -0.09; y < 0.13; y += 0.022) fillP(c, (c) => E(c, 0.003, y, 0.009, 0.0065), "#979c92");
  for (const y of [0.085, -0.025])
    strokeP(
      c,
      (c) => {
        c.moveTo(-0.04, y);
        c.quadraticCurveTo(0, y + 0.012, 0.042, y - 0.004);
      },
      "#b4beba",
      1.8 * P,
    );
  fillP(c, (c) => blobPath(c, -0.09, -0.12, 0.05, 0.034, 214, 0.4), "rgba(70,40,25,0.42)");
  // glowing chest slits (acid inside)
  for (const s of [-1, 1]) {
    glow(c, s * 0.13, 0.14, 0.08, "140,255,60", 0.38 * pu);
    for (let i = 0; i < 3; i++)
      strokeP(
        c,
        (c) => {
          c.moveTo(s * (0.11 + i * 0.022), 0.14);
          c.lineTo(s * (0.11 + i * 0.022), 0.085 - i * 0.018);
        },
        "rgba(160,240,60,0.75)",
        2.2 * P,
      );
  }
  c.restore();
  c.beginPath();
  back(c);
  c.strokeStyle = "rgba(6,6,7,0.9)";
  c.lineWidth = 1.4 * P;
  c.stroke();
  // the distended jaw hanging forward, mouth glowing acid green
  part(c, jaw, { base: "#858a81", lit: "radial", box: [-0.07, 0.19, 0.07, 0.19 + 0.192 * jy], hi: 0.32, lo: 0.5, tex: skinTex(215) });
  const mo: Path = (c) => {
    c.moveTo(-0.037, 0.205);
    c.bezierCurveTo(-0.05 * jy, 0.205 + 0.095 * jy, -0.032, 0.205 + 0.152 * jy, 0, 0.205 + 0.155 * jy);
    c.bezierCurveTo(0.032, 0.205 + 0.152 * jy, 0.05 * jy, 0.205 + 0.095 * jy, 0.037, 0.205);
    c.closePath();
  };
  c.beginPath();
  mo(c);
  const g = c.createRadialGradient(0, 0.255, 0, 0, 0.28, 0.085 * jy);
  g.addColorStop(0, `rgba(200,255,90,${Math.min(1, 0.95 * pu)})`);
  g.addColorStop(windup ? 0.5 : 0.3, "rgba(80,150,25,0.95)");
  g.addColorStop(windup ? 0.8 : 0.62, "#2e0c08");
  g.addColorStop(1, "#150403");
  c.fillStyle = g;
  c.fill();
  c.save();
  c.beginPath();
  mo(c);
  c.clip();
  const tr = mulberry(216);
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * (0.1 + i * 0.08);
    const x = Math.cos(a) * 0.036;
    const y = 0.3 + Math.sin(a) * 0.056 * jy;
    fillP(c, (c) => Pg(c, [x - 0.0042, y + 0.002, x + 0.0042, y + 0.002, x * 0.9, y - 0.011 - tr() * 0.007]), "#d6ccac");
  }
  for (let i = 0; i < 6; i++) {
    const x = -0.028 + i * 0.0112;
    fillP(c, (c) => Pg(c, [x - 0.004, 0.206, x + 0.004, 0.206, x, 0.22 + tr() * 0.006]), "#cbbf9e");
  }
  c.restore();
  c.beginPath();
  mo(c);
  c.strokeStyle = "rgba(20,5,4,0.9)";
  c.lineWidth = 1.2 * P;
  c.stroke();
  // Readability (AC 17): the glowing mouth is the Spitter's mark at a glance (kept inside the frame: no clipped square).
  glow(c, 0, 0.28, windup ? 0.2 : 0.14, "150,255,60", 0.7 * pu);
  // head with long stringy hair falling back over the shoulders
  part(c, hd, { base: "#30271f", lit: "radial", box: [-0.082, 0.075, 0.082, 0.255], hi: 0.32, lo: 0.6, rim: 0.35 });
  const hr = mulberry(220);
  for (let i = 0; i < 60; i++) {
    const side = hr() < 0.5 ? -1 : 1;
    const a = side * (0.15 + hr() * 1.25);
    const x0 = Math.sin(a) * 0.014;
    const y0 = 0.21;
    const len = 0.07 + hr() * 0.11;
    const x1 = Math.sin(a) * (0.08 + hr() * 0.06);
    const y1 = 0.18 - len;
    const end = x1 + (hr() - 0.5) * 0.02;
    strokeP(
      c,
      (c) => {
        c.moveTo(x0, y0);
        c.bezierCurveTo(Math.sin(a) * 0.075, 0.19, x1 * 1.1, y1 + 0.09, end, y1);
      },
      i % 3 ? "rgba(30,23,18,0.9)" : "rgba(105,86,66,0.55)",
      (0.8 + hr() * 1.5) * P,
    );
  }
  const dr: Path = (c) => {
    c.moveTo(0, 0.19 + 0.188 * jy);
    c.quadraticCurveTo(0.004, 0.4 * jy, 0.002, 0.425 * jy);
  };
  strokeP(c, dr, "rgba(30,70,8,0.8)", 0.008 + 1.4 * P);
  strokeP(c, dr, "rgba(180,250,80,0.95)", 0.008);
  acidDrop(c, 0.003, 0.43 * jy, 0.008, pu);
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
