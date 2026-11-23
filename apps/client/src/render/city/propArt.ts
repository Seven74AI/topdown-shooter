/**
 * Story 5.10: the floodlight and the med station drawn in game code (Canvas 2D; designer's Epic 5
 * art method), ported from the round D code drawings `docs/art/epic-5/round-d/looks.html`:
 *
 * - `drawFloodlightFL1` — FL1, the designer's base look: a yellow steel tripod work light with
 *   rubber feet, one halogen head with a grille, its glass along the front edge (+y), a cable.
 * - `drawFloodlightFL5` — FL5, the upgrade/skin look (kept for later): a rusty stadium lamp tipped
 *   forward in a ring of sandbags.
 * - `drawMedStation` — MS10, the designer's pick (iteration 2): a stack of hard med cases on a
 *   crate with a glowing green-cross LED panel on top (the game adds a small pooled glow there).
 *
 * Every function draws in METRES around the frame centre (the caller scales by px/m), footprint
 * ±0.5 m, the front toward +y (`barricadeTransform` turns it with the placement). Light from the
 * upper left. The tripod keeps the reference's soft leg shadow (a tripod's shadow is not a box, so
 * the game casts none for a light: `buildingShadowHeightM`). Deterministic (seeded): every client
 * draws the same picture. Pure Canvas 2D: no Phaser.
 */

type Ctx = CanvasRenderingContext2D;
type PathFn = (c: Ctx) => void;
type Tex = (c: Ctx, x0: number, y0: number, x1: number, y1: number) => void;
const TAU = Math.PI * 2;

/** One frame pixel in metres while drawing (set by the frame helper from px/m). */
let P = 0.01;

/** Draws `fn` at `pxPerM` with the origin at the centre of the w × h px frame at (x, y), clipped to it. */
export function drawPropInFrame(g: Ctx, x: number, y: number, w: number, h: number, pxPerM: number, fn: (g: Ctx) => void): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.translate(x + w / 2, y + h / 2);
  g.scale(pxPerM, pxPerM);
  P = 1 / pxPerM;
  fn(g);
  g.restore();
}

// ---------------------------------------------------------------- helpers (as in the reference page)

function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
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

function R(c: Ctx, x: number, y: number, w: number, h: number, r = 0): void {
  if (!r) {
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.closePath();
    return;
  }
  const q = Math.min(r, w / 2, h / 2);
  c.moveTo(x + q, y);
  c.arcTo(x + w, y, x + w, y + h, q);
  c.arcTo(x + w, y + h, x, y + h, q);
  c.arcTo(x, y + h, x, y, q);
  c.arcTo(x, y, x + w, y, q);
  c.closePath();
}

function E(c: Ctx, x: number, y: number, rx: number, ry: number, a = 0): void {
  c.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a));
  c.ellipse(x, y, Math.max(1e-5, rx), Math.max(1e-5, ry), a, 0, TAU);
  c.closePath();
}

function blobPath(c: Ctx, cx: number, cy: number, rx: number, ry: number, seed: number, amp = 0.15, n = 56): void {
  const r = mulberry(seed);
  const ph = [r() * TAU, r() * TAU, r() * TAU] as const;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + amp * (0.5 * Math.sin(a * 2 + ph[0]) + 0.3 * Math.sin(a * 3 + ph[1]) + 0.2 * Math.sin(a * 5 + ph[2]));
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}

function fillP(c: Ctx, fn: PathFn, style: string | CanvasGradient): void {
  c.beginPath();
  fn(c);
  c.fillStyle = style;
  c.fill();
}

function strokeP(c: Ctx, fn: PathFn, style: string, w: number, cap: CanvasLineCap = "round"): void {
  c.beginPath();
  fn(c);
  c.strokeStyle = style;
  c.lineWidth = w;
  c.lineCap = cap;
  c.lineJoin = "round";
  c.stroke();
}

function devToLocal(c: Ctx, dx: number, dy: number): [number, number] {
  const m = c.getTransform();
  const det = m.a * m.d - m.b * m.c;
  return [(m.d * dx - m.c * dy) / det, (-m.b * dx + m.a * dy) / det];
}

function lightDir(c: Ctx): [number, number] {
  const v = devToLocal(c, -1, -1);
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
}

/** An additive radial glow (the lamp's glass); `rgb` = "r,g,b". */
function glow(c: Ctx, x: number, y: number, r: number, rgb: string, a: number): void {
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

/** A soft shade of the path offset by (dx, dy) m (the reference's `castShadow`, thrown from far away). */
function shadowOf(c: Ctx, path: PathFn, dx: number, dy: number, blur: number, a: number): void {
  const m = c.getTransform();
  const s = Math.hypot(m.a, m.b);
  c.save();
  c.translate(-4000 / s, 0);
  c.shadowColor = `rgba(0,0,0,${a})`;
  c.shadowOffsetX = (4000 * m.a) / s + dx * s;
  c.shadowOffsetY = dy * s;
  c.shadowBlur = blur * s;
  c.fillStyle = "#000";
  c.beginPath();
  path(c);
  c.fill();
  c.restore();
}

function rivet(c: Ctx, x: number, y: number, r: number, base: string, hex = false): void {
  c.beginPath();
  if (hex) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  } else E(c, x, y, r, r);
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
  readonly base: string;
  readonly lit?: "top" | "radial";
  readonly box: readonly [number, number, number, number];
  readonly tex?: Tex;
  readonly hi?: number;
  readonly lo?: number;
  readonly rim?: number;
  readonly inner?: number;
  readonly line?: number;
}

/** One shaded part: fill, texture, light gradient, rim light upper-left, inner shade lower-right, outline. */
function part(c: Ctx, path: PathFn, o: PartOpts): void {
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
  if (o.lit === "top") {
    const L = lightDir(c);
    const s = Math.hypot(w, h) / 2;
    g = c.createLinearGradient(cx + L[0] * s, cy + L[1] * s, cx - L[0] * s, cy - L[1] * s);
    g.addColorStop(0, `rgba(200,215,240,${hi})`);
    g.addColorStop(0.5, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${lo})`);
  } else if (o.lit === "radial") {
    const L = lightDir(c);
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
    const d = devToLocal(c, 1.1, 1.25);
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
    const d = devToLocal(c, -1, -1.1);
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

function steelTex(seed: number, wear = 0.5): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const area = (w * h) / (P * P);
    for (let i = 0; i < Math.min(140, area * 0.012); i++) {
      c.fillStyle = r() < 0.5 ? `rgba(200,210,225,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.08})`;
      c.fillRect(x0 + r() * w, y0 + r() * h, w * (0.05 + r() * 0.3), 0.6 * P);
    }
    const n = Math.min(500, area * 0.03 * wear);
    for (let i = 0; i < n; i++) {
      const ed = r() < 0.6;
      const x = x0 + r() * w;
      const y = ed ? (r() < 0.5 ? y0 + r() * h * 0.15 : y1 - r() * h * 0.12) : y0 + r() * h;
      const v = (150 + r() * 45) | 0;
      c.fillStyle = `rgba(${v},${v},${v + 12},${0.07 + r() * 0.2})`;
      const s = P * (0.6 + r() * 1.4);
      c.fillRect(x, y, s * (1 + r() * 2), s);
    }
    if (wear > 0.7) {
      for (let i = 0; i < Math.min(50, area * 0.003); i++) {
        c.fillStyle = `rgba(115,62,30,${0.15 + r() * 0.25})`;
        c.beginPath();
        c.arc(x0 + r() * w, y0 + r() * h, P * (0.8 + r() * 2.5), 0, TAU);
        c.fill();
      }
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
    const n = Math.min(900, area * 0.05 * amt);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.6 ? `rgba(160,84,36,${0.18 + r() * 0.3})` : `rgba(28,20,15,${0.2 + r() * 0.3})`;
      const s = P * (0.6 + r() * 1.6);
      c.fillRect(x0 + r() * w, y0 + r() * h, s, s);
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

/** A cable / hose. */
function hoseS(c: Ctx, path: PathFn, w: number, col: string): void {
  strokeP(c, path, "#050506", w + 2.2 * P);
  strokeP(c, path, col, w);
}

/** A steel rod with an outline and a thin highlight. */
function rod(c: Ctx, path: PathFn, w: number, col: string): void {
  strokeP(c, path, "rgba(4,4,6,0.95)", w + 2 * P);
  strokeP(c, path, col, w);
  c.save();
  c.translate(-w * 0.15, -w * 0.2);
  strokeP(c, path, "rgba(220,228,240,0.28)", w * 0.3);
  c.restore();
}

const LAMP = "255,238,205";
function lensGlow(c: Ctx, x: number, y: number, r: number, a: number): void {
  glow(c, x, y, r, LAMP, a);
  glow(c, x, y, r * 0.35, "255,250,235", Math.min(1, a * 1.3));
}

// ---------------------------------------------------------------- the props

/** FL1 (designer's base look): the tripod work light. */
export function drawFloodlightFL1(c: Ctx): void {
  const Y = "#c9a227";
  const legs = [-2.25, -0.15, 2.0] as const;
  shadowOf(
    c,
    (q) => {
      for (const a of legs) {
        q.moveTo(0, 0);
        q.lineTo(Math.cos(a) * 0.46, Math.sin(a) * 0.46);
        q.lineTo(Math.cos(a + 0.08) * 0.46, Math.sin(a + 0.08) * 0.46);
        q.closePath();
      }
      R(q, -0.2, -0.17, 0.4, 0.3, 0.04);
    },
    0.07,
    0.09,
    0.05,
    0.55,
  );
  hoseS(
    c,
    (q) => {
      q.moveTo(-0.04, 0.08);
      q.bezierCurveTo(-0.12, 0.32, -0.36, 0.22, -0.47, 0.46);
    },
    0.022,
    "#18191b",
  );
  for (const a of legs) {
    const ex = Math.cos(a) * 0.45;
    const ey = Math.sin(a) * 0.45;
    rod(
      c,
      (q) => {
        q.moveTo(Math.cos(a) * 0.06, Math.sin(a) * 0.06);
        q.lineTo(ex, ey);
      },
      0.034,
      Y,
    );
    part(c, (q) => E(q, ex, ey, 0.042, 0.042), { base: "#1b1c1e", lit: "radial", box: [ex - 0.042, ey - 0.042, ex + 0.042, ey + 0.042], hi: 0.3, line: 1 });
  }
  rivet(c, 0, 0, 0.06, "#8f8a7a", true);
  rod(
    c,
    (q) => {
      q.moveTo(-0.23, -0.03);
      q.lineTo(0.23, -0.03);
    },
    0.032,
    "#2a2c30",
  );
  const hp: PathFn = (q) => R(q, -0.19, -0.17, 0.38, 0.25, 0.035);
  part(c, hp, { base: Y, lit: "top", box: [-0.19, -0.17, 0.19, 0.08], tex: steelTex(41, 0.9), hi: 0.45, lo: 0.5 });
  c.save();
  c.beginPath();
  hp(c);
  c.clip();
  for (let x = -0.15; x <= 0.151; x += 0.038) {
    strokeP(
      c,
      (q) => {
        q.moveTo(x, -0.16);
        q.lineTo(x, 0.02);
      },
      "rgba(24,18,4,0.7)",
      1.7 * P,
      "butt",
    );
  }
  c.restore();
  // The head tilts down to the front (+y): its glass shows as a bright strip along that edge.
  part(c, (q) => R(q, -0.18, 0.05, 0.36, 0.075, 0.02), { base: "#fff3d6", box: [-0.18, 0.05, 0.18, 0.125], hi: 0.4, lo: 0.1, rim: 0, inner: 0.12, line: 1.2 });
  strokeP(
    c,
    (q) => {
      for (let x = -0.12; x <= 0.121; x += 0.06) {
        q.moveTo(x, 0.05);
        q.lineTo(x, 0.125);
      }
    },
    "rgba(60,45,15,0.55)",
    1.3 * P,
    "butt",
  );
  lensGlow(c, 0, 0.1, 0.34, 0.55);
  rivet(c, -0.215, -0.03, 0.024, "#3a3c40");
  rivet(c, 0.215, -0.03, 0.024, "#3a3c40");
}

/** FL5 (upgrade/skin look, unused for now): the salvaged stadium lamp on a sandbag ring. */
export function drawFloodlightFL5(c: Ctx): void {
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + 0.2;
    const x = Math.cos(a) * 0.37;
    const y = Math.sin(a) * 0.37;
    c.save();
    c.translate(x, y);
    c.rotate(a + Math.PI / 2);
    const bp: PathFn = (q) => blobPath(q, 0, 0, 0.165, 0.085, 90 + i, 0.08, 40);
    shadowOf(c, bp, 0.03, 0.04, 0.03, 0.5);
    part(c, bp, { base: "#867350", lit: "radial", box: [-0.165, -0.085, 0.165, 0.085], tex: clothTex(91 + i, "50,40,20"), hi: 0.35, lo: 0.5, rim: 0.3 });
    strokeP(
      c,
      (q) => {
        q.moveTo(0.12, -0.07);
        q.lineTo(0.135, 0.07);
      },
      "rgba(30,22,10,0.6)",
      1.4 * P,
    );
    c.restore();
  }
  const lp: PathFn = (q) => E(q, 0, 0, 0.3, 0.3);
  shadowOf(c, lp, 0.05, 0.06, 0.05, 0.6);
  rod(
    c,
    (q) => {
      q.moveTo(-0.36, 0.02);
      q.lineTo(0.36, 0.02);
    },
    0.04,
    "#3c3f44",
  );
  part(c, lp, { base: "#5d5248", lit: "radial", box: [-0.3, -0.3, 0.3, 0.3], tex: rustTex(52, 1.1), hi: 0.4, lo: 0.55 });
  // The lamp is tipped toward +y: the lens shows as an ellipse to that side, the dark back to the other.
  const ln: PathFn = (q) => E(q, 0, 0.06, 0.25, 0.22);
  part(c, ln, { base: "#fff1d0", lit: "radial", box: [-0.25, -0.16, 0.25, 0.28], hi: 0.2, lo: 0.25, rim: 0, inner: 0.2, line: 1.3 });
  c.save();
  c.beginPath();
  ln(c);
  c.clip();
  const g = c.createRadialGradient(0, 0.06, 0, 0, 0.06, 0.25);
  g.addColorStop(0, "rgba(255,255,248,0.9)");
  g.addColorStop(0.6, "rgba(255,220,160,0.25)");
  g.addColorStop(1, "rgba(150,110,60,0.35)");
  c.fillStyle = g;
  c.fillRect(-0.3, -0.3, 0.6, 0.6);
  c.restore();
  lensGlow(c, 0, 0.08, 0.5, 0.55);
  strokeP(
    c,
    (q) => {
      for (const x of [-0.12, 0, 0.12]) {
        q.moveTo(x, -0.15);
        q.lineTo(x, 0.27);
      }
      q.moveTo(-0.24, 0.06);
      q.lineTo(0.24, 0.06);
    },
    "rgba(28,26,24,0.85)",
    1.8 * P,
    "butt",
  );
  strokeP(c, ln, "rgba(28,26,24,0.9)", 2.4 * P);
  rivet(c, -0.33, 0.02, 0.035, "#6b6e72", true);
  rivet(c, 0.33, 0.02, 0.035, "#6b6e72", true);
}

// ---------------------------------------------------------------- med station (MS10)

function polyTex(seed: number): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const n = Math.min(1600, ((w * h) / (P * P)) * 0.12);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.025 + r() * 0.05})` : `rgba(0,0,0,${0.08 + r() * 0.12})`;
      c.fillRect(x0 + r() * w, y0 + r() * h, P * (0.8 + r()), P * (0.8 + r()));
    }
    for (let i = 0; i < 10; i++) {
      const x = x0 + r() * w;
      const y = y0 + r() * h;
      const l = w * (0.02 + r() * 0.08);
      c.strokeStyle = `rgba(180,185,195,${0.07 + r() * 0.1})`;
      c.lineWidth = 0.6 * P;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + l, y + (r() - 0.5) * l * 0.4);
      c.stroke();
    }
  };
}

/** A plus-shaped polygon (centre, size, bar thickness). */
function crossP(cx: number, cy: number, s: number, t: number): PathFn {
  return (q) => {
    const p = [cx - t / 2, cy - s / 2, cx + t / 2, cy - s / 2, cx + t / 2, cy - t / 2, cx + s / 2, cy - t / 2, cx + s / 2, cy + t / 2, cx + t / 2, cy + t / 2, cx + t / 2, cy + s / 2, cx - t / 2, cy + s / 2, cx - t / 2, cy + t / 2, cx - s / 2, cy + t / 2, cx - s / 2, cy - t / 2, cx - t / 2, cy - t / 2];
    q.moveTo(p[0] as number, p[1] as number);
    for (let i = 2; i < p.length; i += 2) q.lineTo(p[i] as number, p[i + 1] as number);
    q.closePath();
  };
}

/** Story 5.10 (MS10): the green LED panel's cross centre in frame metres (the game's pooled glow sits here). */
export const MED_PANEL_X_M = 0.23;
export const MED_PANEL_Y_M = 0.11;

/**
 * Story 5.10 med station — the designer's pick **MS10** (round D iteration 2, looks.html › drawMS10):
 * hard med cases stacked on a blue-grey crate (an orange case with a white cross, a grey steel case,
 * a white bag) with a glowing green-cross LED panel on top.
 */
export function drawMedStation(c: Ctx): void {
  const b0: PathFn = (q) => R(q, -0.48, -0.4, 0.96, 0.8, 0.05);
  shadowOf(c, b0, 0.05, 0.06, 0.04, 0.6);
  part(c, b0, { base: "#3b4652", lit: "top", box: [-0.48, -0.4, 0.48, 0.4], tex: polyTex(341), hi: 0.3, lo: 0.45 });
  for (const x of [-0.3, 0.3]) part(c, (q) => R(q, x - 0.05, 0.35, 0.1, 0.06, 0.01), { base: "#1d2126", box: [x - 0.05, 0.35, x + 0.05, 0.41], hi: 0.3, line: 1 });
  const b1: PathFn = (q) => R(q, -0.44, -0.36, 0.44, 0.32, 0.04);
  shadowOf(c, b1, 0.05, 0.06, 0.04, 0.6);
  part(c, b1, { base: "#c8641e", lit: "top", box: [-0.44, -0.36, 0, -0.04], tex: polyTex(342), hi: 0.35, lo: 0.45 });
  strokeP(
    c,
    (q) => {
      q.moveTo(-0.44, -0.2);
      q.lineTo(0, -0.2);
    },
    "rgba(0,0,0,0.4)",
    1.6 * P,
  );
  fillP(c, crossP(-0.22, -0.28, 0.08, 0.026), "#f2eee4");
  const b2: PathFn = (q) => R(q, 0.02, -0.1, 0.42, 0.44, 0.04);
  shadowOf(c, b2, 0.06, 0.08, 0.05, 0.6);
  part(c, b2, { base: "#59616b", lit: "top", box: [0.02, -0.1, 0.44, 0.34], tex: steelTex(343, 0.7), hi: 0.35, lo: 0.45 });
  part(c, (q) => R(q, 0.07, -0.05, 0.32, 0.32, 0.03), { base: "#121417", box: [0.07, -0.05, 0.39, 0.27], hi: 0.2, line: 1.1 });
  fillP(c, crossP(MED_PANEL_X_M, MED_PANEL_Y_M, 0.24, 0.085), "#5dff8a");
  glow(c, MED_PANEL_X_M, MED_PANEL_Y_M, 0.5, "90,255,140", 0.5);
  glow(c, MED_PANEL_X_M, MED_PANEL_Y_M, 0.14, "210,255,220", 0.6);
  part(c, (q) => R(q, -0.4, 0.06, 0.34, 0.24, 0.03), { base: "#e0ddd4", lit: "top", box: [-0.4, 0.06, -0.06, 0.3], tex: clothTex(344, "80,80,70"), hi: 0.3, lo: 0.4 });
  strokeP(
    c,
    (q) => {
      q.moveTo(-0.4, 0.18);
      q.lineTo(-0.06, 0.18);
    },
    "rgba(0,0,0,0.3)",
    2 * P,
  );
}
