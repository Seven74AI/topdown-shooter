/**
 * Story 4.12: the 4.11 stage objects drawn in game code (designer, 2026-11-23: ALL game art is game
 * code), ported from the accepted "round 4" code drawings of `docs/art/4-12/mockups.html`:
 *
 * - `drawWoodBarricade` — B6: a palisade of sharpened upright planks on diagonal struts, strictly top
 *   down (the plank tops are lit pyramids; the height shows in the game's cast shadow).
 * - `drawSandbags` — S2: olive-drab canvas bags in brick-offset rows, a second layer on top, a little
 *   spilled sand; low, so the game casts only a short shadow.
 *
 * Every function draws in METRES around the frame centre (the caller scales by px/m) in true
 * colours, with NO ground shadow (the game draws shadows by height: 4.11 rule). Frame axes follow
 * 4.11's B6 convention: the long side along +x, the struts toward −y (the back), so
 * `barricadeTransform` turns it like the 5.9 tiers. Deterministic (seeded): every client draws the
 * same picture. Pure Canvas 2D: no Phaser.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** One frame pixel in metres while drawing (set by `drawObjectInFrame`). */
let P = 0.01;

/** Draws `fn` at `pxPerM` with the origin at the centre of the w × h px frame at (x, y). */
export function drawObjectInFrame(g: Ctx, x: number, y: number, w: number, h: number, pxPerM: number, fn: (g: Ctx) => void): void {
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

/** The colour moved toward white (t > 0) or black (t < 0). */
function shade(h: string, t: number): string {
  const f = t < 0 ? 0 : 255;
  const a = Math.abs(t);
  const c = rgbOf(h).map((v) => Math.round(v + (f - v) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r = 0): void {
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

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, a = 0): void {
  c.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a));
  c.ellipse(x, y, Math.max(1e-5, rx), Math.max(1e-5, ry), a, 0, TAU);
  c.closePath();
}

function poly(c: Ctx, p: readonly number[]): void {
  c.moveTo(p[0] as number, p[1] as number);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] as number, p[i + 1] as number);
  c.closePath();
}

function fillP(c: Ctx, fn: (c: Ctx) => void, style: string): void {
  c.beginPath();
  fn(c);
  c.fillStyle = style;
  c.fill();
}

function strokeP(c: Ctx, fn: (c: Ctx) => void, style: string, w: number): void {
  c.beginPath();
  fn(c);
  c.strokeStyle = style;
  c.lineWidth = w;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
}

/** A device-space offset (frame px) in the current local units. */
function devToLocal(c: Ctx, dx: number, dy: number): [number, number] {
  const m = c.getTransform();
  const det = m.a * m.d - m.b * m.c;
  return [(m.d * dx - m.c * dy) / det, (-m.b * dx + m.a * dy) / det];
}

/** The light direction (from the upper left of the frame) in local units. */
function lightDir(c: Ctx): [number, number] {
  const v = devToLocal(c, -1, -1);
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
}

/**
 * A soft shade of `fn`'s shape offset by (dx, dy) m with a blur of `blur` m (the mockups'
 * `castShadow`): the shape is drawn far away and thrown back with the canvas shadow (works in every
 * browser, unlike `ctx.filter`). Only used INSIDE an object (a top layer on the one under it).
 */
function softShade(c: Ctx, fn: (c: Ctx) => void, dx: number, dy: number, blur: number, a: number): void {
  const m = c.getTransform();
  const sc = Math.hypot(m.a, m.b);
  c.save();
  c.translate(-4000 / sc, 0);
  c.shadowColor = `rgba(0,0,0,${a})`;
  c.shadowOffsetX = (4000 * m.a) / sc + dx * sc;
  c.shadowOffsetY = dy * sc;
  c.shadowBlur = blur * sc;
  c.fillStyle = "#000";
  c.beginPath();
  fn(c);
  c.fill();
  c.restore();
}

type Tex = (c: Ctx, x0: number, y0: number, x1: number, y1: number) => void;

interface PartOpts {
  readonly base: string;
  readonly lit: "top" | "radial";
  readonly box: readonly [number, number, number, number];
  readonly tex?: Tex;
  readonly hi?: number;
  readonly lo?: number;
  readonly rim?: number;
  readonly inner?: number;
  readonly line?: number;
}

/** One shaded part (the mockups' `part`): fill, texture, light gradient, rim light upper-left, inner shade lower-right, outline. */
function part(c: Ctx, path: (c: Ctx) => void, o: PartOpts): void {
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
  } else {
    const m = Math.max(w, h);
    g = c.createRadialGradient(cx + L[0] * w * 0.28, cy + L[1] * h * 0.32, 0, cx, cy, m * 0.62);
    g.addColorStop(0, `rgba(225,235,255,${hi})`);
  }
  g.addColorStop(0.5, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${lo})`);
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

/** Wood grain, knots and splinters (drawn inside a clip). */
function woodTex(seed: number, ang: number, light: number): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const L = Math.hypot(x1 - x0, y1 - y0);
    c.save();
    c.translate(cx, cy);
    c.rotate(ang);
    for (let i = 0; i < 90; i++) {
      const y = (r() - 0.5) * L;
      const amp = L * (0.0015 + r() * 0.005);
      const f = (2 + r() * 5) / L;
      const ph = r() * TAU;
      c.beginPath();
      for (let k = 0; k <= 48; k++) {
        const x = -L / 2 + (L * k) / 48;
        const yy = y + Math.sin(x * f * 4 + ph) * amp + Math.sin(x * f * 11 + ph * 2) * amp * 0.2;
        if (k) c.lineTo(x, yy);
        else c.moveTo(x, yy);
      }
      const dark = r() < 0.72;
      c.strokeStyle = dark ? `rgba(28,14,6,${0.14 + r() * 0.32})` : `rgba(205,160,110,${(0.05 + r() * 0.1) * light})`;
      c.lineWidth = (0.5 + r() * 1.5) * P;
      c.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const x = (r() - 0.5) * L;
      const y = (r() - 0.5) * L * 0.5;
      const rr = L * (0.04 + r() * 0.1);
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, `rgba(175,135,92,${0.2 * light})`);
      g.addColorStop(1, "rgba(175,135,92,0)");
      c.fillStyle = g;
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let i = 0; i < 2; i++) {
      const x = (r() - 0.5) * L * 0.7;
      const y = (r() - 0.5) * L * 0.2;
      fillP(c, (c) => ellipse(c, x, y, L * 0.012, L * 0.006), "rgba(30,14,5,0.55)");
      c.beginPath();
      ellipse(c, x, y, L * 0.022, L * 0.011);
      c.strokeStyle = "rgba(30,14,5,0.3)";
      c.lineWidth = P;
      c.stroke();
    }
    for (let i = 0; i < 30; i++) {
      const x = (r() - 0.5) * L;
      const y = (r() - 0.5) * L * 0.5;
      const l = L * (0.004 + r() * 0.03);
      const a = (r() - 0.5) * 1.4;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.strokeStyle = `rgba(225,195,155,${(0.1 + r() * 0.22) * light})`;
      c.lineWidth = (0.4 + r() * 0.6) * P;
      c.stroke();
    }
    c.restore();
  };
}

/** Canvas weave and stains (drawn inside a clip). */
function clothTex(seed: number, stain: string): Tex {
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

/** A weathered bar from (x0, y0) to (x1, y1), `w` wide; `hiEnd` lights the far end (a strut's raised top). */
function woodBar(c: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, base: string, seed: number, hiEnd: boolean): void {
  const l = Math.hypot(x1 - x0, y1 - y0);
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.save();
  c.translate(x0, y0);
  c.rotate(a);
  const path = (c: Ctx): void => rrect(c, 0, -w / 2, l, w, w * 0.15);
  part(c, path, { base, lit: "top", box: [0, -w / 2, l, w / 2], tex: woodTex(seed, 0, 0.9), hi: 0.22, lo: 0.35, rim: 0.55, line: 1.4 });
  c.save();
  c.beginPath();
  path(c);
  c.clip();
  const g = c.createLinearGradient(0, 0, l, 0);
  g.addColorStop(0, hiEnd ? "rgba(0,0,0,0.45)" : "rgba(255,240,220,0.12)");
  g.addColorStop(1, hiEnd ? "rgba(255,240,220,0.12)" : "rgba(0,0,0,0.45)");
  c.fillStyle = g;
  c.fillRect(0, -w, l, 2 * w);
  c.restore();
  c.restore();
}

function nail(c: Ctx, x: number, y: number): void {
  fillP(c, (c) => ellipse(c, x, y, 0.006, 0.006), "#2a2a2a");
  fillP(c, (c) => ellipse(c, x - 0.002, y - 0.002, 0.0025, 0.0025), "rgba(220,225,235,0.6)");
}

/** B6's weathered plank tones. */
const WOODS = ["#7d5d3e", "#86663f", "#735437", "#8c6c48", "#6f5235"] as const;
/** B6 layout (frame metres, struts at −y): the plank row's band and the plank count. */
export const B6_PLANKS = 14;
export const B6_ROW_Y0 = 0.08;
export const B6_ROW_Y1 = 0.21;

/**
 * Designer pick B6 (round 4 code drawing `drawB6`), on a `w × d` m frame (2 × 0.5 m): 14 sharpened
 * planks standing in a row (seen from above: their tops, a four-faced point lit from the upper
 * left), a rail nailed behind them, four diagonal struts down to the ground at the back (−y).
 */
export function drawWoodBarricade(c: Ctx, w: number, d: number): void {
  const sx = w / 2 / 0.98; // the reference spans x ∈ [−0.98, 0.98] for a 2 m wall
  const sy = d / 0.5;
  const n = B6_PLANKS;
  const x0 = -0.98 * sx;
  const x1 = 0.98 * sx;
  const pw = (x1 - x0) / n;
  const r = mulberry(1501);
  const pl: { cx: number; w: number; d: number; cy: number; col: string; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    pl.push({ cx: x0 + pw * (i + 0.5) + (r() - 0.5) * 0.008, w: pw * 0.9, d: (0.12 + (r() - 0.5) * 0.012) * sy, cy: (0.145 + (r() - 0.5) * 0.01) * sy, col: WOODS[i % 5] as string, s: 1510 + i });
    r(); // the reference's per-plank height factor (its shadow): the game casts the shadow
  }
  // struts: from the plank row's back edge (under the rail) down to the ground behind (−y)
  for (const x of [-0.75, -0.25, 0.25, 0.75]) woodBar(c, (x + 0.17) * sx, -0.215 * sy, x * sx, (B6_ROW_Y0 - 0.01) * sy, 0.065, "#7a5c3c", Math.trunc(x * 99) + 1530, true);
  // the rail behind the planks
  woodBar(c, x0 + 0.02, 0.072 * sy, x1 - 0.02, 0.072 * sy, 0.036, "#5e4530", 1540, false);
  const L = lightDir(c);
  for (const p of pl) {
    const X0 = p.cx - p.w / 2;
    const X1 = p.cx + p.w / 2;
    const Y0 = p.cy - p.d / 2;
    const Y1 = p.cy + p.d / 2;
    const tris: readonly (readonly [number, number, number, number])[] = [
      [X0, Y0, X1, Y0],
      [X1, Y0, X1, Y1],
      [X1, Y1, X0, Y1],
      [X0, Y1, X0, Y0],
    ];
    for (const [a, b, e, f] of tris) {
      const mx = (a + e) / 2 - p.cx;
      const my = (b + f) / 2 - p.cy;
      const lit = (mx * L[0] + my * L[1]) / Math.hypot(mx, my);
      fillP(
        c,
        (c) => {
          c.moveTo(a, b);
          c.lineTo(e, f);
          c.lineTo(p.cx, p.cy);
          c.closePath();
        },
        shade(p.col, lit > 0 ? 0.32 * lit : 0.55 * lit),
      );
    }
    c.save();
    c.beginPath();
    rrect(c, X0, Y0, p.w, p.d, 0.006);
    c.clip();
    c.globalAlpha = 0.6;
    woodTex(p.s, Math.PI / 2, 0.6)(c, X0, Y0, X1, Y1);
    c.globalAlpha = 1;
    c.restore();
    strokeP(
      c,
      (c) => {
        c.moveTo(X0, Y0);
        c.lineTo(X1, Y1);
        c.moveTo(X1, Y0);
        c.lineTo(X0, Y1);
      },
      "rgba(255,238,210,0.3)",
      0.9 * P,
    );
    c.beginPath();
    rrect(c, X0, Y0, p.w, p.d, 0.006);
    c.strokeStyle = "#070605";
    c.lineWidth = 1.5 * P;
    c.stroke();
    fillP(c, (c) => ellipse(c, p.cx, p.cy, 0.008, 0.008), "rgba(255,242,220,0.9)");
  }
  for (let i = 0; i < n; i += 2) nail(c, (pl[i] as { cx: number }).cx, 0.072 * sy);
}

/** One canvas bag (the reference's `bag`): a soft rounded rectangle, seam, folds, a tied end. */
function bag(c: Ctx, x: number, y: number, wIn: number, hIn: number, seed: number, base: string, ang: number): void {
  const rr = mulberry(seed);
  const ph = rr() * TAU;
  const sag = rr() < 0.25;
  const ww = sag ? wIn * 1.06 : wIn;
  const hh = sag ? hIn * 1.08 : hIn;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const path = (c: Ctx): void => {
    const n = 32;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const k = 1 + 0.035 * Math.sin(a * 3 + ph);
      const px = Math.sign(cs) * Math.pow(Math.abs(cs), 0.42) * (ww / 2) * k;
      const py = Math.sign(sn) * Math.pow(Math.abs(sn), 0.62) * (hh / 2) * k;
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    }
    c.closePath();
  };
  part(c, path, { base, lit: "radial", box: [-ww / 2, -hh / 2, ww / 2, hh / 2], tex: clothTex(seed, "40,42,28"), hi: sag ? 0.22 : 0.34, lo: 0.55, rim: 0.45, inner: 0.4, line: 1.5 });
  c.save();
  c.beginPath();
  path(c);
  c.clip();
  strokeP(
    c,
    (c) => {
      c.moveTo(-ww / 2 + 0.05, -hh / 2);
      c.quadraticCurveTo(-ww / 2 + 0.04, 0, -ww / 2 + 0.055, hh / 2);
    },
    "rgba(20,20,10,0.5)",
    1.6 * P,
  );
  for (let i = 0; i < 3; i++) {
    const sx = (rr() - 0.5) * ww * 0.6;
    const sy = ((rr() < 0.5 ? -1 : 1) * hh) / 2;
    const ex = (rr() - 0.5) * 0.08;
    strokeP(
      c,
      (c) => {
        c.moveTo(sx, sy);
        c.quadraticCurveTo(sx + 0.03, sy * 0.4, sx + ex, sy * 0.1);
      },
      "rgba(25,25,12,0.4)",
      1.4 * P,
    );
    strokeP(
      c,
      (c) => {
        c.moveTo(sx - 0.006, sy);
        c.quadraticCurveTo(sx + 0.024, sy * 0.4, sx + ex - 0.006, sy * 0.1);
      },
      "rgba(220,220,180,0.12)",
      1 * P,
    );
  }
  c.restore();
  const tie = [ww / 2 - 0.01, -0.03, ww / 2 + 0.035, -0.05, ww / 2 + 0.03, 0.04, ww / 2 - 0.01, 0.03];
  fillP(c, (c) => poly(c, tie), shade(base, -0.15));
  c.beginPath();
  poly(c, tie);
  c.strokeStyle = "rgba(6,6,4,0.85)";
  c.lineWidth = 1.1 * P;
  c.stroke();
  c.restore();
}

/**
 * Designer pick S2 (round 4 code drawing `drawS2`), on a `w × h` m frame (3 × 1 m): three
 * brick-offset rows of olive-drab canvas bags, a second layer of four on top (its contact shade on
 * the bags under it), a little spilled sand along both sides. No ground shadow (the game's is short).
 */
export function drawSandbags(c: Ctx, w: number, h: number): void {
  c.save();
  c.scale(w / 3, h / 1);
  const rows = [-0.3, 0, 0.3];
  const bw = 0.5;
  const bh = 0.3;
  const cols = ["#5d6043", "#64674a", "#595c41", "#616446"];
  let s = 1700;
  for (let ri = 0; ri < 3; ri++) {
    const off = ri % 2 ? bw / 2 : 0;
    for (let x = -1.5 + bw / 2 - off; x < 1.5; x += bw) {
      const xx = Math.max(-1.5 + bw * 0.36, Math.min(1.5 - bw * 0.36, x));
      const ww = x !== xx ? bw * 0.72 : bw;
      s++;
      bag(c, xx, rows[ri] as number, ww - 0.02, bh - 0.02, s - 1, cols[s % 4] as string, (mulberry(s)() - 0.5) * 0.05);
    }
  }
  // the top layer's contact shade on the bags under it (inside the object, not a ground shadow)
  softShade(c, (c) => rrect(c, -1.25, -0.15, 2.5, 0.3, 0.1), 0.05, 0.075, 0.04, 0.55);
  const tops = ["#6a6d4e", "#707353", "#66694b", "#6d7050"];
  for (let x = -1.0; x <= 1.01; x += bw) {
    s++;
    bag(c, x, -0.01, bw - 0.03, bh - 0.02, s - 1, tops[s % 4] as string, (mulberry(s)() - 0.5) * 0.06);
  }
  const sr = mulberry(1790);
  for (let i = 0; i < 90; i++) {
    const a = sr() * TAU;
    const x = (sr() - 0.5) * 2.9; // the reference spreads 3.2 m: kept inside the 3 m box
    const y = (sr() < 0.5 ? -1 : 1) * (0.42 + sr() * 0.07);
    const rx = 0.004 + sr() * 0.006;
    const ry = 0.003 + sr() * 0.004;
    fillP(c, (c) => ellipse(c, x, y, rx, ry, a), `rgba(${(150 + sr() * 40) | 0},${(125 + sr() * 30) | 0},${(80 + sr() * 20) | 0},0.7)`);
  }
  c.restore();
}
