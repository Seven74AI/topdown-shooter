/**
 * Story 5.8: the Bloater burst's FX frames, drawn in code (ported from the round-C page's sprites,
 * `docs/art/epic-5/round-c/looks.html`): the gas disc (a low yellow-green fog whose visible edge is
 * the frame's edge, drawn 2 × `gasRadiusM` wide = the slow's edge, with a faint rim), the green
 * burst flash, four gore-free bile splats and a cloth scrap (tinted per look). Atlas `atlas_fx`.
 */

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a: number, b: number): number => hash(a * 127.1 + b * 311.7 + s * 74.7);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
function fbm(x: number, y: number, s: number): number {
  let a = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    a += amp * vnoise(x * f, y * f, s + o * 13);
    f *= 2.03;
    amp *= 0.5;
  }
  return a / 0.9375;
}
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
function blob(c: G, cx: number, cy: number, rx: number, ry: number, seed: number, amp: number, n: number): void {
  const r = mulberry(seed);
  const ph = [r() * TAU, r() * TAU, r() * TAU] as const;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + amp * (0.5 * Math.sin(a * 2 + ph[0]) + 0.3 * Math.sin(a * 3 + ph[1]) + 0.2 * Math.sin(a * 5 + ph[2]));
    const X = cx + Math.cos(a) * rx * k;
    const Y = cy + Math.sin(a) * ry * k;
    if (i) c.lineTo(X, Y);
    else c.moveTo(X, Y);
  }
  c.closePath();
}

/** The gas disc into the frame at (x, y), `w` px square; `seed` varies the fog (two variants). Pixel data: device space. */
export function drawGasDisc(c: G, x: number, y: number, w: number, seed: number): void {
  const S = Math.max(1, Math.floor(w));
  const im = c.createImageData(S, S);
  const d = im.data;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const dx = ((px + 0.5) / S) * 2 - 1;
      const dy = ((py + 0.5) / S) * 2 - 1;
      const r = Math.hypot(dx, dy);
      const i = (py * S + px) * 4;
      if (r >= 1) {
        d[i + 3] = 0;
        continue;
      }
      const n = fbm(dx * 3.2 + 4 + seed, dy * 3.2, 21 + seed);
      const m = fbm(dx * 7, dy * 7 + seed, 33);
      let a = (0.32 + 0.5 * n * n + 0.12 * m) * (0.75 + 0.25 * r);
      const edge = clamp((1 - r) / 0.035, 0, 1);
      a = a * edge + 0.28 * clamp(1 - Math.abs(r - 0.975) / 0.025, 0, 1);
      d[i] = (150 + 60 * n) | 0;
      d[i + 1] = (168 + 50 * n) | 0;
      d[i + 2] = (62 + 30 * m) | 0;
      d[i + 3] = (clamp(a, 0, 1) * 255) | 0;
    }
  }
  c.putImageData(im, x, y);
}

/** The green burst flash (a radial sprite), centred in a `w` px frame (drawn with ADD). */
export function drawBurstFlash(c: G, w: number): void {
  const g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, "rgba(250,255,220,1)");
  g.addColorStop(0.2, "rgba(220,240,140,0.85)");
  g.addColorStop(0.5, "rgba(170,205,80,0.4)");
  g.addColorStop(1, "rgba(120,160,50,0)");
  c.fillStyle = g;
  c.fillRect(-w / 2, -w / 2, w, w);
}

/** Bile splat `v` (0–3): dark olive with a wet rim, centred in a `w` px frame. */
export function drawBileSplat(c: G, w: number, v: number): void {
  c.save();
  c.scale(w / 2, w / 2);
  blob(c, 0, 0, 0.62, 0.5, 700 + v, 0.38, 40);
  c.fillStyle = "rgba(52,58,26,0.92)";
  c.fill();
  blob(c, -0.08, -0.06, 0.34, 0.26, 710 + v, 0.3, 30);
  c.fillStyle = "rgba(98,110,44,0.75)";
  c.fill();
  const r = mulberry(720 + v);
  for (let i = 0; i < 6; i++) {
    const a = r() * TAU;
    const dd = 0.6 + r() * 0.3;
    c.beginPath();
    c.ellipse(Math.cos(a) * dd, Math.sin(a) * dd, 0.05 + r() * 0.08, 0.04 + r() * 0.06, 0, 0, TAU);
    c.fillStyle = "rgba(60,68,30,0.9)";
    c.fill();
  }
  c.beginPath();
  c.ellipse(-0.2, -0.2, 0.12, 0.07, 0, 0, TAU);
  c.fillStyle = "rgba(220,235,170,0.35)";
  c.fill();
  c.restore();
}

/** A torn cloth scrap (white, tinted per look), centred in a `w` × `h` px frame. */
export function drawClothScrap(c: G, w: number, h: number): void {
  c.beginPath();
  c.moveTo(-w * 0.45, -h * 0.35);
  c.lineTo(w * 0.2, -h * 0.45);
  c.lineTo(w * 0.45, -h * 0.1);
  c.lineTo(w * 0.35, h * 0.4);
  c.lineTo(-w * 0.3, h * 0.45);
  c.lineTo(-w * 0.45, h * 0.05);
  c.closePath();
  c.fillStyle = "#ffffff";
  c.fill();
  c.strokeStyle = "rgba(0,0,0,0.6)";
  c.lineWidth = 1;
  c.stroke();
}
