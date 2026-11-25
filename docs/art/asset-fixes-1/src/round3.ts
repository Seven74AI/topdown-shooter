/**
 * Round 3 (designer, 2026-11-24): boss effects "still not good"; the ground damage "great, there is detail,
 * it's not cartoonesque: take inspiration from that". So these are built the same way: a height field
 * (shape bevel + noise detail + engraved cracks), lit from the map's top-left light, with textured albedo,
 * grime in the cavities, stains and wear. Sets H (weathered bone), I (blood), J (rusted sign). Also the
 * combined ground damage (R1 + R2 + R3 in one decal) for the designer to confirm.
 */
import { GROUND } from "../../../../apps/client/src/render/city/palette";
import { R_ALL, TAU, asphalt, canvas, ctx, fbm, groundDamage, hash2, night, put, rng, roundRect, type G } from "./lib";

type Rgb = [number, number, number];

interface ReliefOpts {
  /** Bevel blur (px): how rounded the shape's edges read. */
  readonly bevel: number;
  /** Surface roughness (height noise). */
  readonly detail: number;
  /** Noise scale (px per noise cell). */
  readonly grain: number;
  /** Specular strength (0 dry … 1 wet / glossy). */
  readonly spec: number;
  /** Surface colour at (x, y); `cav` 0–1 how deep in a crevice, `h` height. */
  albedo(x: number, y: number, h: number, cav: number): Rgb;
  /** Draws cuts (cracks, sockets, seams) in white: they become deep, dark crevices. */
  engrave?(g: G): void;
  readonly seed: number;
}

/** Alpha channel of a canvas as 0–1 floats, after an optional blur. */
function alphaOf(src: HTMLCanvasElement, blur: number): Float32Array {
  const N = src.width;
  const c = canvas(N, N);
  const g = ctx(c);
  if (blur > 0) g.filter = `blur(${blur}px)`;
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, N, N).data;
  const out = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) out[i] = (d[i * 4 + 3] as number) / 255;
  return out;
}

/** Renders a shape (`draw` fills it, any colour, centred at N/2) as a lit, textured object. */
function relief(N: number, draw: (g: G) => void, o: ReliefOpts): HTMLCanvasElement {
  const mask = canvas(N, N);
  const mg = ctx(mask);
  mg.translate(N / 2, N / 2);
  mg.fillStyle = "#fff";
  mg.strokeStyle = "#fff";
  draw(mg);
  const eng = canvas(N, N);
  if (o.engrave) {
    const eg = ctx(eng);
    eg.translate(N / 2, N / 2);
    eg.fillStyle = "#fff";
    eg.strokeStyle = "#fff";
    o.engrave(eg);
  }
  const m = alphaOf(mask, 0);
  const a = alphaOf(mask, o.bevel);
  const b = alphaOf(mask, o.bevel * 0.35);
  const e = alphaOf(eng, 0.7);
  const eWide = alphaOf(eng, 2.5);
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const n = fbm(x / o.grain, y / o.grain, o.seed, 5) - 0.5;
      H[i] = ((a[i] as number) * 0.6 + (b[i] as number) * 0.4 + n * o.detail - (e[i] as number) * 0.7) * (m[i] as number);
    }
  }
  const out = canvas(N, N);
  const og = ctx(out);
  const img = og.createImageData(N, N);
  const d = img.data;
  const L = [-0.5, -0.72, 0.48];
  const ll = Math.hypot(L[0] as number, L[1] as number, L[2] as number);
  const lx = (L[0] as number) / ll;
  const ly = (L[1] as number) / ll;
  const lz = (L[2] as number) / ll;
  const K = 9; // height to slope
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      const mi = m[i] as number;
      if (mi <= 0.01) continue;
      const dx = ((H[i + 1] as number) - (H[i - 1] as number)) * K;
      const dy = ((H[i + N] as number) - (H[i - N] as number)) * K;
      const nl = Math.hypot(dx, dy, 1);
      const nx = -dx / nl;
      const ny = -dy / nl;
      const nz = 1 / nl;
      const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
      const rz = 2 * (nx * lx + ny * ly + nz * lz) * nz - lz;
      const spec = Math.pow(Math.max(0, rz), 24) * o.spec;
      const cav = Math.min(1, (eWide[i] as number) * 1.2 + Math.max(0, (b[i] as number) - (H[i] as number) - 0.15) * 0.8);
      const [r, gg, bb] = o.albedo(x, y, H[i] as number, cav);
      const lit = 0.3 + 0.95 * diff;
      const k = i * 4;
      d[k] = Math.min(255, r * lit + spec * 255);
      d[k + 1] = Math.min(255, gg * lit + spec * 245);
      d[k + 2] = Math.min(255, bb * lit + spec * 235);
      d[k + 3] = Math.round(mi * 255);
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** A danger light behind an object: a soft red glow from its silhouette (reads at night, like S1). */
function withGlow(obj: HTMLCanvasElement, col: string, blur: number, pad = 0): HTMLCanvasElement {
  const N = obj.width + pad * 2;
  const c = canvas(N, N);
  const g = ctx(c);
  g.save();
  g.shadowColor = col;
  g.shadowBlur = blur;
  g.drawImage(obj, pad, pad);
  g.restore();
  g.drawImage(obj, pad, pad);
  return c;
}

// ─────────────────────────────── shapes (unit: s = half size) ───────────────────────────────

function skullShape(g: G, s: number): void {
  g.beginPath();
  g.moveTo(-0.46 * s, -0.08 * s);
  g.bezierCurveTo(-0.52 * s, -0.64 * s, 0.52 * s, -0.64 * s, 0.46 * s, -0.08 * s);
  g.bezierCurveTo(0.46 * s, 0.1 * s, 0.36 * s, 0.18 * s, 0.32 * s, 0.26 * s);
  g.lineTo(-0.32 * s, 0.26 * s);
  g.bezierCurveTo(-0.36 * s, 0.18 * s, -0.46 * s, 0.1 * s, -0.46 * s, -0.08 * s);
  g.fill();
  roundRect(g, -0.25 * s, 0.22 * s, 0.5 * s, 0.26 * s, 0.07 * s); // jaw
  g.fill();
}

function skullCuts(g: G, s: number, seed: number): void {
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(sx * 0.17 * s, -0.06 * s, 0.13 * s, 0.115 * s, sx * 0.25, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.moveTo(0, 0.06 * s);
  g.lineTo(-0.055 * s, 0.18 * s);
  g.lineTo(0.055 * s, 0.18 * s);
  g.fill();
  g.lineWidth = Math.max(1, s * 0.022);
  for (let i = 1; i < 5; i++) {
    // gaps between the teeth
    g.beginPath();
    g.moveTo((-0.25 + i * 0.1) * s, 0.25 * s);
    g.lineTo((-0.25 + i * 0.1) * s, 0.42 * s);
    g.stroke();
  }
  g.beginPath(); // the jaw line
  g.moveTo(-0.24 * s, 0.33 * s);
  g.lineTo(0.24 * s, 0.33 * s);
  g.stroke();
  // hairline cracks across the cranium
  const r = rng(seed);
  g.lineWidth = Math.max(0.8, s * 0.014);
  for (let k = 0; k < 3; k++) {
    let x = (r() - 0.5) * 0.5 * s;
    let y = -0.5 * s + r() * 0.12 * s;
    let a = Math.PI / 2 + (r() - 0.5) * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * s * 0.05;
      y += Math.sin(a) * s * 0.05;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

function fistShape(g: G, s: number): void {
  roundRect(g, -0.2 * s, -0.85 * s, 0.4 * s, 0.5 * s, 0.1 * s); // forearm
  g.fill();
  roundRect(g, -0.42 * s, -0.42 * s, 0.84 * s, 0.6 * s, 0.16 * s);
  g.fill();
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc((-0.31 + i * 0.207) * s, 0.16 * s, 0.115 * s, 0, TAU);
    g.fill();
  }
}

function fistCuts(g: G, s: number): void {
  g.lineWidth = Math.max(1, s * 0.035);
  g.lineCap = "round";
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo((-0.42 + i * 0.207) * s, -0.04 * s);
    g.lineTo((-0.42 + i * 0.207) * s, 0.24 * s);
    g.stroke();
  }
  g.beginPath(); // thumb
  g.moveTo(-0.36 * s, -0.16 * s);
  g.quadraticCurveTo(-0.08 * s, 0, 0.16 * s, -0.18 * s);
  g.stroke();
  g.beginPath(); // wrist crease
  g.moveTo(-0.18 * s, -0.42 * s);
  g.lineTo(0.18 * s, -0.42 * s);
  g.stroke();
}

function chunkShape(g: G, s: number): void {
  g.beginPath();
  g.moveTo(-0.55 * s, -0.25 * s);
  g.lineTo(-0.1 * s, -0.58 * s);
  g.lineTo(0.42 * s, -0.5 * s);
  g.lineTo(0.68 * s, -0.02 * s);
  g.lineTo(0.48 * s, 0.5 * s);
  g.lineTo(-0.15 * s, 0.6 * s);
  g.lineTo(-0.62 * s, 0.2 * s);
  g.closePath();
  g.fill();
}

function arrowShape(g: G, s: number): void {
  g.beginPath();
  g.moveTo(0.8 * s, 0);
  g.lineTo(0.05 * s, -0.55 * s);
  g.lineTo(0.05 * s, -0.22 * s);
  g.lineTo(-0.75 * s, -0.22 * s);
  g.lineTo(-0.75 * s, 0.22 * s);
  g.lineTo(0.05 * s, 0.22 * s);
  g.lineTo(0.05 * s, 0.55 * s);
  g.closePath();
  g.fill();
}

const disc = (r: number) => (g: G): void => {
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
};

// ─────────────────────────────── surfaces ───────────────────────────────

/** Old bone: yellowed, pitted, dirt in every crevice, a few dried blood stains. */
function boneAlbedo(seed: number, blood = 0.6) {
  return (x: number, y: number, _h: number, cav: number): Rgb => {
    const n = fbm(x / 7, y / 7, seed + 1, 4);
    let c: Rgb = mix([150, 136, 110], [232, 222, 196], clamp01(n * 1.4 - 0.1));
    if (hash2(x, y, seed) < 0.05) c = mix(c, [90, 78, 60], 0.5); // pores
    c = mix(c, [52, 40, 30], clamp01(cav * 1.3));
    const st = fbm(x / 11, y / 11, seed + 7, 4);
    if (st > 0.62) c = mix(c, [96, 18, 14], clamp01((st - 0.62) * 5) * blood);
    return c;
  };
}

/** Rusted steel: brown-orange rust over grey metal, darker in the seams. */
function rustAlbedo(seed: number) {
  return (x: number, y: number, _h: number, cav: number): Rgb => {
    const n = fbm(x / 9, y / 9, seed, 5);
    let c: Rgb = mix([92, 94, 96], [126, 70, 38], clamp01(n * 1.8 - 0.45));
    c = mix(c, [60, 30, 16], clamp01(fbm(x / 3, y / 3, seed + 3, 2) - 0.45) * 0.8);
    return mix(c, [24, 16, 12], clamp01(cav));
  };
}

/** Grey-green Behemoth skin (BH1's colour), mottled, with dark creases. */
function skinAlbedo(seed: number, bright = 1) {
  return (x: number, y: number, _h: number, cav: number): Rgb => {
    const n = fbm(x / 6, y / 6, seed, 4);
    let c: Rgb = mix([74 * bright, 82 * bright, 66 * bright], [124 * bright, 132 * bright, 108 * bright], clamp01(n * 1.5 - 0.2));
    if (fbm(x / 13, y / 13, seed + 5, 3) > 0.64) c = mix(c, [86, 26, 20], 0.55); // wounds
    return mix(c, [22, 22, 18], clamp01(cav * 1.2));
  };
}

/** Broken concrete: pale grey with dark aggregate stones. */
function concreteAlbedo(seed: number) {
  return (x: number, y: number, _h: number, cav: number): Rgb => {
    let c: Rgb = mix([118, 114, 106], [176, 170, 160], fbm(x / 8, y / 8, seed, 4));
    const ag = vnoiseCell(x, y, seed);
    if (ag > 0.8) c = mix(c, [70, 66, 60], 0.7);
    return mix(c, [30, 28, 26], clamp01(cav));
  };
}

/** Coarse stones (aggregate): a cellular-ish noise. */
function vnoiseCell(x: number, y: number, seed: number): number {
  return fbm(x / 2.6, y / 2.6, seed + 11, 2) + (hash2(Math.floor(x / 3), Math.floor(y / 3), seed) - 0.5) * 0.4;
}

/** Wet blood: deep red, glossy, darker where it pools. */
function bloodAlbedo(seed: number) {
  return (x: number, y: number, h: number, cav: number): Rgb => {
    const n = fbm(x / 8, y / 8, seed, 4);
    const c: Rgb = mix([70, 6, 8], [150, 18, 16], clamp01(n * 1.2 + (1 - h) * 0.2 - 0.1));
    return mix(c, [30, 2, 4], clamp01(cav));
  };
}

/** Enamel sign paint `col` over rusty steel, chipped where the noise says so. */
function enamelAlbedo(seed: number, paint: (x: number, y: number) => Rgb) {
  const rust = rustAlbedo(seed + 40);
  return (x: number, y: number, h: number, cav: number): Rgb => {
    const chip = fbm(x / 6, y / 6, seed + 2, 4);
    const base = paint(x, y);
    let c = chip > 0.66 ? rust(x, y, h, 0) : base;
    // rust bleeding down from chips and the edge
    const streak = fbm(x / 2.5, y / 22, seed + 9, 3);
    if (chip < 0.66 && streak > 0.62) c = mix(c, [120, 58, 28], (streak - 0.62) * 2.4);
    return mix(c, [20, 14, 10], clamp01(cav));
  };
}

// ─────────────────────────────── sets ───────────────────────────────

interface Set3 {
  readonly id: string;
  /** Pictures at twice the game's frame size (skull 128, marker 144, icons 96). */
  skull(): HTMLCanvasElement;
  marker(): HTMLCanvasElement;
  slam(): HTMLCanvasElement;
  charge(): HTMLCanvasElement;
  throw(): HTMLCanvasElement;
}

function stack(N: number, layers: (HTMLCanvasElement | ((g: G) => void))[]): HTMLCanvasElement {
  const c = canvas(N, N);
  const g = ctx(c);
  for (const l of layers) {
    if (typeof l === "function") {
      g.save();
      l(g);
      g.restore();
    } else g.drawImage(l, (N - l.width) / 2, (N - l.height) / 2);
  }
  return c;
}

/** A round chip of the street (for icons that show something hitting the ground). */
function streetChip(N: number, seed: number, withDamage: boolean): HTMLCanvasElement {
  const c = canvas(N, N);
  const g = ctx(c);
  g.save();
  g.beginPath();
  g.arc(N / 2, N / 2, N * 0.47, 0, TAU);
  g.clip();
  asphalt(g, N, N, seed);
  if (withDamage) g.drawImage(groundDamage({ bowl: 1, cracks: 9, soot: 0.4, rays: 0.5, debris: 140, seed: seed + 3, fine: 4 }), -N * 0.6, -N * 0.6, N * 2.2, N * 2.2);
  g.restore();
  const v = g.createRadialGradient(N / 2, N / 2, N * 0.3, N / 2, N / 2, N * 0.48);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.7)");
  g.fillStyle = v;
  g.beginPath();
  g.arc(N / 2, N / 2, N * 0.47, 0, TAU);
  g.fill();
  return c;
}

const RED_GLOW = "rgba(255,40,30,0.95)";

/** H "Weathered bone": a real old skull; the boss's fist, a real chunk of concrete, gouges in the street. */
const SET_H: Set3 = {
  id: "H",
  skull: () => withGlow(relief(116, (g) => skullShape(g, 58), { bevel: 9, detail: 0.22, grain: 5, spec: 0.12, albedo: boneAlbedo(3), engrave: (g) => skullCuts(g, 58, 4), seed: 3 }), RED_GLOW, 16, 6),
  marker: () =>
    stack(144, [
      withGlow(
        relief(136, disc(64), {
          bevel: 6,
          detail: 0.3,
          grain: 6,
          spec: 0.25,
          albedo: rustAlbedo(5),
          engrave: (g) => {
            g.lineWidth = 3;
            g.beginPath();
            g.arc(0, 0, 54, 0, TAU);
            g.stroke();
            for (let i = 0; i < 4; i++) {
              const a = i * (TAU / 4) + 0.4;
              g.beginPath();
              g.arc(Math.cos(a) * 59, Math.sin(a) * 59, 2.6, 0, TAU);
              g.fill();
            }
          },
          seed: 5,
        }),
        RED_GLOW,
        14,
        4,
      ),
      relief(100, (g) => skullShape(g, 50), { bevel: 8, detail: 0.22, grain: 5, spec: 0.12, albedo: boneAlbedo(6), engrave: (g) => skullCuts(g, 50, 7), seed: 6 }),
    ]),
  slam: () =>
    stack(96, [
      streetChip(96, 31, true),
      withGlow(relief(84, (g) => fistShape(g, 40), { bevel: 7, detail: 0.25, grain: 4, spec: 0.15, albedo: skinAlbedo(8, 1.35), engrave: (g) => fistCuts(g, 40), seed: 8 }), RED_GLOW, 10, 6),
    ]),
  charge: () =>
    stack(96, [
      streetChip(96, 33, false),
      // gouges ploughed through the street, deepest at the front
      (g) => {
        g.translate(48, 48);
        const r = rng(9);
        for (const dy of [-16, 0, 16]) {
          g.strokeStyle = "rgba(200,195,185,0.18)";
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(-36, dy - 1);
          g.lineTo(26, dy * 0.5 - 1);
          g.stroke();
          g.strokeStyle = "rgba(5,4,4,0.92)";
          g.lineWidth = 4.5;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(-36, dy);
          for (let x = -30; x <= 26; x += 6) g.lineTo(x, dy * (1 - (x + 36) / 124) + (r() - 0.5) * 1.6);
          g.stroke();
        }
        g.fillStyle = "rgba(150,140,128,0.9)"; // asphalt shoved up ahead of the gouges
        for (let i = 0; i < 26; i++) g.fillRect(26 + r() * 12, -18 + r() * 36, 1 + r() * 3, 1 + r() * 2);
      },
      withGlow(relief(84, (g) => arrowShape(g, 34), { bevel: 5, detail: 0.25, grain: 4, spec: 0.3, albedo: rustAlbedo(10), seed: 10 }), RED_GLOW, 10, 6),
    ]),
  throw: () =>
    stack(96, [
      (g) => {
        // dust trail behind the flying chunk
        g.translate(48, 48);
        for (let i = 0; i < 5; i++) {
          const gr = g.createRadialGradient(-20 - i * 6, 18 + i * 5, 0, -20 - i * 6, 18 + i * 5, 12 - i);
          gr.addColorStop(0, `rgba(150,140,128,${0.35 - i * 0.06})`);
          gr.addColorStop(1, "rgba(150,140,128,0)");
          g.fillStyle = gr;
          g.fillRect(-60, -10, 80, 70);
        }
      },
      withGlow(
        relief(80, (g) => chunkShape(g, 34), {
          bevel: 6,
          detail: 0.45,
          grain: 3,
          spec: 0.05,
          albedo: concreteAlbedo(11),
          engrave: (g) => {
            g.lineWidth = 2.4; // bent rebar stubs and a crack
            g.beginPath();
            g.moveTo(10, -18);
            g.lineTo(4, 4);
            g.lineTo(12, 22);
            g.stroke();
          },
          seed: 11,
        }),
        "rgba(0,0,0,0.9)",
        8,
        8,
      ),
      (g) => {
        g.translate(48, 48);
        g.strokeStyle = "#6a3a20";
        g.lineWidth = 2.6;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(8, -14);
        g.lineTo(18, -34);
        g.lineTo(30, -38);
        g.moveTo(18, 6);
        g.lineTo(38, 12);
        g.stroke();
      },
    ]),
};

/** Blood splatter dots around a shape (drawn in the shape mask). */
function splatter(g: G, s: number, seed: number, n: number): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const d = s * (0.55 + r() * 0.5);
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, s * (0.015 + r() * 0.05), 0, TAU);
    g.fill();
  }
  for (let i = 0; i < 4; i++) {
    // drips running down
    const x = (r() - 0.5) * s * 0.7;
    const y0 = s * (0.2 + r() * 0.15);
    const l = s * (0.2 + r() * 0.35);
    roundRect(g, x - s * 0.02, y0, s * 0.04, l, s * 0.02);
    g.fill();
    g.beginPath();
    g.arc(x, y0 + l, s * 0.035, 0, TAU);
    g.fill();
  }
}

/** I "Blood": wet blood painted by hand on the street, thick and glossy, splattered and dripping. */
const SET_I: Set3 = {
  id: "I",
  skull: () =>
    stack(128, [
      streetChip(128, 51, false),
      relief(
        128,
        (g) => {
          // a skull smeared in blood: the shape with ragged edges, sockets left bare
          g.save();
          skullShape(g, 54);
          g.restore();
          splatter(g, 54, 3, 30);
        },
        {
          bevel: 3,
          detail: 0.35,
          grain: 4,
          spec: 0.9,
          albedo: bloodAlbedo(3),
          engrave: (g) => skullCuts(g, 54, 2),
          seed: 3,
        },
      ),
    ]),
  marker: () =>
    stack(144, [
      streetChip(144, 52, false),
      relief(
        144,
        (g) => {
          g.lineWidth = 10;
          g.beginPath();
          g.arc(0, 0, 56, 0.2, TAU - 0.15); // a hand-painted ring, not quite closed
          g.stroke();
          skullShape(g, 44);
          splatter(g, 50, 6, 16);
        },
        { bevel: 3, detail: 0.35, grain: 4, spec: 0.9, albedo: bloodAlbedo(6), engrave: (g) => skullCuts(g, 44, 5), seed: 6 },
      ),
    ]),
  slam: () =>
    stack(96, [
      streetChip(96, 53, true),
      relief(96, (g) => {
        // a blood burst where the fist hit
        const r = rng(8);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU + r() * 0.3;
          const l = 16 + r() * 22;
          g.lineWidth = 3 + r() * 4;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(Math.cos(a) * l, Math.sin(a) * l);
          g.stroke();
        }
        disc(14)(g);
        splatter(g, 36, 9, 20);
      }, { bevel: 2.5, detail: 0.3, grain: 4, spec: 0.9, albedo: bloodAlbedo(8), seed: 8 }),
    ]),
  charge: () =>
    stack(96, [
      streetChip(96, 54, false),
      relief(96, (g) => {
        // drag smears, tapering forward, a pool at the end
        for (const dy of [-14, 0, 14]) {
          g.beginPath();
          g.moveTo(-38, dy - 5);
          g.quadraticCurveTo(0, dy - 3, 26, dy * 0.4);
          g.quadraticCurveTo(0, dy + 3, -38, dy + 5);
          g.fill();
        }
        g.beginPath();
        g.moveTo(38, 0);
        g.lineTo(18, -18);
        g.lineTo(18, 18);
        g.fill();
      }, { bevel: 2.5, detail: 0.35, grain: 3, spec: 0.9, albedo: bloodAlbedo(9), seed: 9 }),
    ]),
  throw: () =>
    stack(96, [
      withGlow(relief(80, (g) => chunkShape(g, 32), { bevel: 6, detail: 0.45, grain: 3, spec: 0.05, albedo: concreteAlbedo(12), seed: 12 }), "rgba(0,0,0,0.9)", 8, 8),
      relief(96, (g) => {
        g.translate(4, -2);
        splatter(g, 26, 12, 18);
        g.beginPath();
        g.ellipse(4, -4, 14, 10, 0.4, 0, TAU);
        g.fill();
      }, { bevel: 2, detail: 0.3, grain: 3, spec: 0.9, albedo: bloodAlbedo(12), seed: 13 }),
    ]),
};

const SIGN_RED: Rgb = [178, 26, 30];
const SIGN_WHITE: Rgb = [226, 220, 204];
const SIGN_BLACK: Rgb = [24, 22, 22];

/** J "Rusted sign": a real old enamel sign: embossed rim, dents, chipped paint, rust bleeding down, bolts. */
function sign(N: number, shape: (g: G) => void, paint: (x: number, y: number) => Rgb, seed: number, bolts: [number, number][]): HTMLCanvasElement {
  return withGlow(
    relief(N, shape, {
      bevel: 5,
      detail: 0.28,
      grain: 9,
      spec: 0.35,
      albedo: enamelAlbedo(seed, paint),
      engrave: (g) => {
        for (const [x, y] of bolts) {
          g.beginPath();
          g.arc(x, y, 2.6, 0, TAU);
          g.fill();
        }
      },
      seed,
    }),
    RED_GLOW,
    12,
    4,
  );
}

/** Paint function for a round sign: red border, white field, black pictogram from a mask. */
function roundPaint(N: number, R: number, picto: (g: G) => void): (x: number, y: number) => Rgb {
  const p = canvas(N, N);
  const pg = ctx(p);
  pg.translate(N / 2, N / 2);
  pg.fillStyle = "#000";
  picto(pg);
  const a = pg.getImageData(0, 0, N, N).data;
  return (x, y) => {
    const d = Math.hypot(x - N / 2, y - N / 2);
    if ((a[(y * N + x) * 4 + 3] as number) > 128) return SIGN_BLACK;
    return d > R * 0.72 ? SIGN_RED : SIGN_WHITE;
  };
}

const SET_J: Set3 = {
  id: "J",
  skull: () => {
    const N = 120;
    const tri = (g: G, k: number): void => {
      g.beginPath();
      g.moveTo(0, -52 * k);
      g.lineTo(54 * k, 40 * k);
      g.lineTo(-54 * k, 40 * k);
      g.closePath();
      g.fill();
    };
    const inner = canvas(N, N);
    const ig = ctx(inner);
    ig.translate(N / 2, N / 2);
    tri(ig, 0.7);
    const innerA = ig.getImageData(0, 0, N, N).data;
    const pic = canvas(N, N);
    const pg = ctx(pic);
    pg.translate(N / 2, N / 2 + 8);
    pg.fillStyle = "#000";
    skullShape(pg, 34);
    pg.globalCompositeOperation = "destination-out";
    skullCuts(pg, 34, 1);
    const picA = pg.getImageData(0, 0, N, N).data;
    return sign(N, (g) => tri(g, 1), (x, y) => ((picA[(y * N + x) * 4 + 3] as number) > 128 ? SIGN_BLACK : (innerA[(y * N + x) * 4 + 3] as number) > 128 ? SIGN_WHITE : SIGN_RED), 21, [[0, -40]]);
  },
  marker: () =>
    sign(
      136,
      disc(64),
      roundPaint(136, 64, (g) => {
        skullShape(g, 46);
        g.globalCompositeOperation = "destination-out";
        skullCuts(g, 46, 1);
      }),
      22,
      [
        [0, -58],
        [0, 58],
      ],
    ),
  slam: () =>
    sign(
      88,
      disc(42),
      roundPaint(88, 42, (g) => {
        fistShape(g, 20);
        g.fillRect(-26, 22, 52, 4);
      }),
      23,
      [[0, -38]],
    ),
  charge: () => sign(88, disc(42), roundPaint(88, 42, (g) => arrowShape(g, 22)), 24, [[0, -38]]),
  throw: () =>
    sign(
      88,
      disc(42),
      roundPaint(88, 42, (g) => {
        g.translate(6, -2);
        chunkShape(g, 22);
        g.lineWidth = 4;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.arc(-10, 26, 26, -2.95, -1.95);
        g.stroke();
      }),
      25,
      [[0, -38]],
    ),
};

// ─────────────────────────────── page wiring ───────────────────────────────

function onDark(c: HTMLCanvasElement, bg = "#14171b"): HTMLCanvasElement {
  const o = canvas(c.width, c.height);
  const g = ctx(o);
  g.fillStyle = bg;
  g.fillRect(0, 0, o.width, o.height);
  g.drawImage(c, 0, 0);
  return o;
}

/** The skull over a survivor on the night street, as players see it (game size, above the darkness). */
function inStreet(set: Set3): HTMLCanvasElement {
  const W = 300;
  const c = canvas(W, 200);
  const g = ctx(c);
  asphalt(g, W, 200, 61);
  g.fillStyle = GROUND.lane;
  for (let x = 0; x < W; x += 70) g.fillRect(x, 150, 40, 3);
  night(g, W, 200, 0.55, [[60, 40, 140]]);
  const sk = set.skull();
  g.drawImage(sk, 60, 40, sk.width * 0.55, sk.height * 0.55);
  const mk = set.marker();
  g.drawImage(mk, W - mk.width * 0.5 - 8, 200 - mk.height * 0.5 - 8, mk.width * 0.5, mk.height * 0.5);
  return c;
}

function main(): void {
  for (const set of [SET_H, SET_I, SET_J]) {
    for (const make of [set.skull, set.marker, set.slam, set.charge, set.throw]) put(`fx-${set.id}`, onDark(make()));
    put(`street-${set.id}`, inStreet(set));
  }
  const d = R_ALL();
  for (const lit of [true, false]) {
    const W = 300;
    const c = canvas(W, W);
    const g = ctx(c);
    asphalt(g, W, W, 41);
    g.fillStyle = GROUND.lane;
    for (let y = 0; y < W; y += 60) g.fillRect(36, y, 3, 34);
    g.globalAlpha = 0.85;
    g.drawImage(d, 22, 22, 256, 256);
    g.globalAlpha = 1;
    if (!lit) night(g, W, W, 0.35, [[60, 50, 160]]);
    put("dmg-all", c);
  }
}

main();
