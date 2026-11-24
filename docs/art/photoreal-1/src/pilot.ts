/**
 * Photoreal pilot (designer, 2026-11-24: "rework every asset in a photorealistic way, like the ground
 * damage", pilot group = street props and vehicles). Every object is a lit height field: stacked shape
 * layers blurred into rounded volumes, engraved seams, noise dents, textured albedo with grime, rust,
 * wet highlights and wear, at the atlas's resolution (64 px per metre). Built into ../compare.html, a
 * before/after page, by build.mjs.
 */
import { CAR_COLORS, CAR_WRECK } from "../../../../apps/client/src/render/city/dressing";
import { GROUND } from "../../../../apps/client/src/render/city/palette";
import { asphalt, canvas, ctx, fbm, hash2, night, rng, roundRect, type G } from "../../asset-fixes-1/src/lib";

declare const CURRENT: Record<string, string>; // today's frames (data URLs), injected by build.mjs

type Rgb = [number, number, number];
const TAU = Math.PI * 2;
const PXM = 64; // atlas px per metre

// ─────────────────────────────── the relief renderer (rectangular) ───────────────────────────────

interface Layer {
  /** Fills the layer's shape (white), origin at the frame centre. */
  draw(g: G): void;
  /** Blur (px): how rounded its edges are. */
  blur: number;
  /** Height it adds. */
  amount: number;
}

interface Relief {
  readonly w: number;
  readonly h: number;
  /** The first layer is the footprint (sets the alpha). */
  readonly layers: Layer[];
  /** Cuts (white): seams, gaps, holes. */
  engrave?(g: G): void;
  readonly engraveDepth?: number;
  /** Named masks the albedo can read (white = inside). */
  readonly regions?: Record<string, (g: G) => void>;
  /** Small-scale height noise (dents, texture), and its cell size. */
  readonly detail: number;
  readonly grain: number;
  /** Extra height at a pixel (dents, weave). */
  heightAt?(x: number, y: number): number;
  albedo(x: number, y: number, s: Sample): Rgb;
  /** Glossiness at a pixel (0 dry … 1 glass / wet paint). */
  spec(x: number, y: number, s: Sample): number;
  readonly seed: number;
}

interface Sample {
  readonly h: number;
  readonly cav: number;
  readonly r: Record<string, number>;
}

function maskOf(w: number, h: number, draw: (g: G) => void, blur = 0): Float32Array {
  const c = canvas(w, h);
  const g = ctx(c);
  g.translate(w / 2, h / 2);
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  draw(g);
  let src = c;
  if (blur > 0) {
    const b = canvas(w, h);
    const bg = ctx(b);
    bg.filter = `blur(${blur}px)`;
    bg.drawImage(c, 0, 0);
    src = b;
  }
  const d = ctx(src).getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = (d[i * 4 + 3] as number) / 255;
  return out;
}

function render(o: Relief): HTMLCanvasElement {
  const { w, h } = o;
  const foot = maskOf(w, h, (o.layers[0] as Layer).draw);
  const layers = o.layers.map((l) => ({ m: maskOf(w, h, l.draw, l.blur), a: l.amount }));
  const eng = o.engrave ? maskOf(w, h, o.engrave, 0.6) : null;
  const engW = o.engrave ? maskOf(w, h, o.engrave, 2.5) : null;
  const regions: Record<string, Float32Array> = {};
  for (const [k, f] of Object.entries(o.regions ?? {})) regions[k] = maskOf(w, h, f, 0.6);
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = 0;
      for (const l of layers) v += (l.m[i] as number) * l.a;
      v += (fbm(x / o.grain, y / o.grain, o.seed, 4) - 0.5) * o.detail;
      if (o.heightAt) v += o.heightAt(x, y);
      if (eng) v -= (eng[i] as number) * (o.engraveDepth ?? 0.35);
      H[i] = v * (foot[i] as number);
    }
  }
  const out = canvas(w, h);
  const og = ctx(out);
  const img = og.createImageData(w, h);
  const d = img.data;
  const L = [-0.5, -0.72, 0.48];
  const ll = Math.hypot(L[0] as number, L[1] as number, L[2] as number);
  const [lx, ly, lz] = [(L[0] as number) / ll, (L[1] as number) / ll, (L[2] as number) / ll];
  const K = 7;
  const r: Record<string, number> = {};
  const keys = Object.keys(regions);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = foot[i] as number;
      if (a <= 0.01) continue;
      const dx = ((H[i + 1] as number) - (H[i - 1] as number)) * K;
      const dy = ((H[i + w] as number) - (H[i - w] as number)) * K;
      const nl = Math.hypot(dx, dy, 1);
      const nx = -dx / nl;
      const ny = -dy / nl;
      const nz = 1 / nl;
      const nd = nx * lx + ny * ly + nz * lz;
      const diff = Math.max(0, nd);
      const rz = 2 * nd * nz - lz;
      for (const k of keys) r[k] = (regions[k] as Float32Array)[i] as number;
      const cav = Math.min(1, (engW ? (engW[i] as number) * 1.1 : 0) + Math.max(0, -nz + 0.92) * 0.4);
      const s: Sample = { h: H[i] as number, cav, r };
      const [cr, cg, cb] = o.albedo(x, y, s);
      const sp = Math.pow(Math.max(0, rz), 22) * o.spec(x, y, s);
      // a soft sky reflection on glossy, upward faces (night city glow)
      const sky = o.spec(x, y, s) * 0.18 * nz;
      const lit = 0.32 + 0.9 * diff;
      const k = i * 4;
      d[k] = Math.min(255, cr * lit + sp * 255 + sky * 90);
      d[k + 1] = Math.min(255, cg * lit + sp * 248 + sky * 100);
      d[k + 2] = Math.min(255, cb * lit + sp * 240 + sky * 125);
      d[k + 3] = Math.round(a * 255);
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cl = (v: number): number => Math.max(0, Math.min(1, v));
const hex = (s: string): Rgb => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const rect = (x: number, y: number, w: number, h: number, r = 0) => (g: G): void => {
  roundRect(g, x, y, w, h, r);
  g.fill();
};

// ─────────────────────────────── cars ───────────────────────────────

const CAR_L = 4.5 * PXM; // 288
const CAR_W = 2 * PXM; // 128

/** Car parts in frame coordinates (front at +x), shared by the clean, wrecked and burnt cars. */
function carParts(L: number, W: number) {
  const bx = -L / 2 + 6;
  const by = -W / 2 + 10;
  const bw = L - 12;
  const bh = W - 20;
  const cabin = { x: -L * 0.23, y: -W * 0.33, w: L * 0.48, h: W * 0.66 };
  const roof = { x: -L * 0.13, y: -W * 0.27, w: L * 0.21, h: W * 0.54 };
  return {
    body: rect(bx, by, bw, bh, 22),
    cabin: rect(cabin.x, cabin.y, cabin.w, cabin.h, 18),
    roof: rect(roof.x, roof.y, roof.w, roof.h, 12),
    glass: (g: G): void => {
      // windscreen (front, +x) and rear window as trapezoids between the roof and the cabin's ends
      const fx0 = roof.x + roof.w + 1;
      const fx1 = cabin.x + cabin.w - 3;
      g.beginPath();
      g.moveTo(fx0, roof.y + 4);
      g.lineTo(fx1, cabin.y + 7);
      g.quadraticCurveTo(fx1 + 4, 0, fx1, cabin.y + cabin.h - 7);
      g.lineTo(fx0, roof.y + roof.h - 4);
      g.closePath();
      g.fill();
      const rx0 = roof.x - 1;
      const rx1 = cabin.x + 4;
      g.beginPath();
      g.moveTo(rx0, roof.y + 5);
      g.lineTo(rx1, cabin.y + 9);
      g.quadraticCurveTo(rx1 - 3, 0, rx1, cabin.y + cabin.h - 9);
      g.lineTo(rx0, roof.y + roof.h - 5);
      g.closePath();
      g.fill();
      // side windows: strips along the roof's long edges
      for (const s of [-1, 1]) {
        const y0 = s < 0 ? cabin.y + 2 : roof.y + roof.h + 1;
        const y1 = s < 0 ? roof.y - 1 : cabin.y + cabin.h - 2;
        roundRect(g, roof.x + 2, y0, roof.w - 4, y1 - y0, 2);
        g.fill();
      }
    },
    seams: (g: G): void => {
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(L * 0.3, by + 6); // hood line
      g.lineTo(L * 0.3, by + bh - 6);
      g.moveTo(-L * 0.33, by + 6); // boot line
      g.lineTo(-L * 0.33, by + bh - 6);
      g.moveTo(cabin.x + 6, by + 1); // door cuts on both sides
      g.lineTo(cabin.x + 6, by + 8);
      g.moveTo(cabin.x + cabin.w * 0.52, by + 1);
      g.lineTo(cabin.x + cabin.w * 0.52, by + 8);
      g.moveTo(cabin.x + 6, by + bh - 8);
      g.lineTo(cabin.x + 6, by + bh - 1);
      g.moveTo(cabin.x + cabin.w * 0.52, by + bh - 8);
      g.lineTo(cabin.x + cabin.w * 0.52, by + bh - 1);
      g.stroke();
    },
    lights: { front: (g: G) => [-1, 1].forEach((s) => rect(L / 2 - 14, s > 0 ? W / 2 - 24 : -W / 2 + 12, 9, 12, 3)(g)), rear: (g: G) => [-1, 1].forEach((s) => rect(-L / 2 + 6, s > 0 ? W / 2 - 24 : -W / 2 + 12, 7, 12, 2)(g)) },
    mirrors: (g: G): void => {
      for (const s of [-1, 1]) rect(cabin.x + cabin.w - 6, s > 0 ? by + bh - 2 : by - 6, 9, 8, 3)(g);
    },
    wheels: (g: G): void => {
      for (const wx of [-L * 0.3, L * 0.29]) for (const s of [-1, 1]) rect(wx - 22, s > 0 ? W / 2 - 14 : -W / 2 + 2, 44, 12, 4)(g);
    },
    cabin_: cabin,
  };
}

function carWindowCracks(L: number, W: number, seed: number) {
  return (g: G): void => {
    const r = rng(seed);
    const cx = L * 0.17;
    const cy = (r() - 0.5) * W * 0.3;
    g.lineWidth = 0.9;
    for (let i = 0; i < 9; i++) {
      let a = r() * TAU;
      let x = cx;
      let y = cy;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        a += (r() - 0.5) * 0.5;
        x += Math.cos(a) * 4;
        y += Math.sin(a) * 4;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  };
}

function car(variant: number): HTMLCanvasElement {
  const L = CAR_L;
  const W = CAR_W;
  const P = carParts(L, W);
  const paint = hex(CAR_COLORS[variant % CAR_COLORS.length] as string);
  const wreck = CAR_WRECK[variant % CAR_WRECK.length] as boolean;
  const seed = 100 + variant * 7;
  const tyres = render({
    w: L,
    h: W,
    layers: [{ draw: P.wheels, blur: 3, amount: 0.4 }],
    detail: 0.15,
    grain: 3,
    albedo: () => [22, 22, 24],
    spec: () => 0.1,
    seed,
  });
  const body = render({
    w: L,
    h: W,
    layers: [
      { draw: P.body, blur: 8, amount: 0.5 },
      { draw: P.cabin, blur: 7, amount: 0.3 },
      { draw: P.roof, blur: 3, amount: 0.14 },
    ],
    engrave: (g) => {
      P.seams(g);
      if (wreck) carWindowCracks(L, W, seed)(g);
    },
    engraveDepth: 0.25,
    regions: { glass: P.glass, front: P.lights.front, rear: P.lights.rear, mirror: P.mirrors },
    detail: wreck ? 0.1 : 0.04,
    grain: wreck ? 18 : 30,
    heightAt: wreck ? (x, y) => -Math.max(0, fbm(x / 26, y / 26, seed + 3, 3) - 0.62) * 0.8 : undefined,
    albedo: (x, y, s) => {
      if (s.r.glass! > 0.5) {
        // dark tinted glass with a diagonal reflection band of the night sky
        const band = cl(1 - Math.abs(((x - y * 0.8) % 60) - 30) / 9);
        return mix(mix([10, 13, 18], [26, 32, 40], fbm(x / 20, y / 20, seed + 1, 3)), [92, 104, 120], band * 0.45);
      }
      if (s.r.front! > 0.5) return [228, 224, 206];
      if (s.r.rear! > 0.5) return [150, 20, 22];
      let c = mix(paint, mix(paint, [255, 255, 255], 0.12), fbm(x / 40, y / 40, seed + 2, 3));
      // road grime along the lower edges, dust in the seams
      const edge = cl(Math.abs(y - W / 2) / (W / 2) - 0.55) * 1.6;
      c = mix(c, [64, 58, 50], cl(edge * 0.5 + (fbm(x / 10, y / 10, seed + 4, 3) - 0.62) * 0.8));
      c = mix(c, [24, 22, 20], cl(s.cav));
      if (wreck) {
        const rust = fbm(x / 9, y / 9, seed + 5, 4);
        if (rust > 0.66) c = mix(c, [110, 52, 24], cl((rust - 0.66) * 4));
        if (hash2(x, y, seed) < 0.0015) c = [180, 175, 168]; // scratches
      }
      return c;
    },
    spec: (x, y, s) => (s.r.glass! > 0.5 ? 0.9 : s.r.front! > 0.5 ? 0.6 : wreck ? 0.25 : 0.55) * (0.8 + 0.4 * fbm(x / 8, y / 8, seed + 6, 2)),
    seed,
  });
  const c = canvas(L, W);
  const g = ctx(c);
  g.drawImage(tyres, 0, 0);
  g.drawImage(body, 0, 0);
  // rain beads on the roof and bonnet
  const r = rng(seed + 9);
  for (let i = 0; i < 28; i++) {
    const x = L / 2 + (r() - 0.5) * L * 0.85;
    const y = W / 2 + (r() - 0.5) * W * 0.65;
    const a = ctx(body).getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] as number;
    if (a < 200) continue;
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(x, y, 1, 1);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(x + 1, y + 1, 1, 1);
  }
  return c;
}

function burntCar(variant: number): HTMLCanvasElement {
  const L = CAR_L;
  const W = CAR_W;
  const P = carParts(L, W);
  const seed = 300 + variant * 11;
  const rims = render({
    w: L,
    h: W,
    layers: [{ draw: P.wheels, blur: 2, amount: 0.25 }],
    detail: 0.3,
    grain: 2,
    albedo: (x, y) => mix([40, 34, 30], [96, 70, 50], fbm(x / 4, y / 4, seed, 2)),
    spec: () => 0.05,
    seed,
  });
  const body = render({
    w: L,
    h: W,
    layers: [
      { draw: P.body, blur: 12, amount: 0.5 },
      { draw: P.cabin, blur: 9, amount: 0.3 },
      { draw: P.roof, blur: 4, amount: 0.1 },
    ],
    engrave: (g) => {
      P.seams(g);
      P.glass(g); // the glass is gone: holes into the burnt cabin
    },
    engraveDepth: 0.55,
    regions: { glass: P.glass },
    detail: 0.35,
    grain: 10,
    heightAt: (x, y) => -Math.max(0, fbm(x / 18, y / 18, seed + 3, 3) - 0.55) * 1.1,
    albedo: (x, y, s) => {
      if (s.r.glass! > 0.5) {
        // the burnt-out cabin: ash, seat springs
        let c: Rgb = mix([12, 10, 9], [46, 40, 36], fbm(x / 5, y / 5, seed + 1, 3));
        if (Math.sin(x * 0.9) > 0.92 || Math.sin(y * 0.9) > 0.94) c = [70, 50, 36];
        return c;
      }
      const n = fbm(x / 10, y / 10, seed + 2, 5);
      let c: Rgb = mix([20, 17, 15], [58, 50, 44], n);
      const rust = fbm(x / 7, y / 7, seed + 5, 4);
      if (rust > 0.55) c = mix(c, [118, 56, 26], cl((rust - 0.55) * 3.5));
      const ash = fbm(x / 4, y / 4, seed + 8, 3);
      if (ash > 0.62) c = mix(c, [130, 126, 120], cl((ash - 0.62) * 3));
      return mix(c, [8, 6, 5], cl(s.cav));
    },
    spec: () => 0.06,
    seed,
  });
  const c = canvas(L, W);
  const g = ctx(c);
  g.drawImage(rims, 0, 0);
  g.drawImage(body, 0, 0);
  return c;
}

// ─────────────────────────────── the bus ───────────────────────────────

function bus(): HTMLCanvasElement {
  const L = 5 * PXM * 2; // 640 (10 m)
  const W = 2.5 * PXM; // 160
  const seed = 500;
  const body = rect(-L / 2 + 4, -W / 2 + 6, L - 8, W - 12, 14);
  const roofPanel = rect(-L / 2 + 22, -W / 2 + 16, L - 44, W - 32, 8);
  const ac = rect(-L * 0.12, -W * 0.22, L * 0.22, W * 0.44, 6);
  const number = (g: G): void => {
    g.font = `bold ${W * 0.36}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("4217", L * 0.24, 2);
  };
  const frontCrush = (x: number, y: number): number => {
    const u = (x - 0) / L; // 0 at the crushed front (−x end)
    return u < 0.1 ? -Math.max(0, fbm(x / 8, y / 8, seed + 4, 3) - 0.45) * 1.4 * (1 - u / 0.1) : 0;
  };
  const tex = render({
    w: L,
    h: W,
    layers: [
      { draw: body, blur: 8, amount: 0.6 },
      { draw: roofPanel, blur: 3, amount: 0.06 },
      { draw: ac, blur: 4, amount: 0.25 },
    ],
    engrave: (g) => {
      g.lineWidth = 2;
      for (const x of [-L * 0.34, L * 0.38]) g.strokeRect(x, -W * 0.16, 40, W * 0.32);
      g.lineWidth = 1.2;
      for (let x = -L / 2 + 60; x < L / 2 - 30; x += 58) {
        g.beginPath(); // roof panel joints
        g.moveTo(x, -W / 2 + 16);
        g.lineTo(x, W / 2 - 16);
        g.stroke();
      }
      for (let k = -2; k <= 2; k++) {
        g.beginPath(); // AC grille
        g.moveTo(-L * 0.11, k * 10);
        g.lineTo(L * 0.09, k * 10);
        g.stroke();
      }
    },
    engraveDepth: 0.2,
    regions: { number, sideGlass: (g) => [-1, 1].forEach((s) => rect(-L / 2 + 30, s > 0 ? W / 2 - 14 : -W / 2 + 8, L - 70, 6, 2)(g)), front: rect(-L / 2 + 4, -W / 2 + 10, 14, W - 20, 6) },
    detail: 0.06,
    grain: 24,
    heightAt: frontCrush,
    albedo: (x, y, s) => {
      if (s.r.front! > 0.5) return mix([16, 20, 26], [60, 66, 74], fbm(x / 6, y / 6, seed + 1, 3)); // broken windscreen
      if (s.r.sideGlass! > 0.5) return [26, 32, 40];
      let c: Rgb = mix([176, 178, 172], [214, 214, 206], fbm(x / 50, y / 50, seed + 2, 3));
      if (s.r.number! > 0.5) c = mix(c, [40, 40, 44], 0.85);
      // grime: streaks along the roof, soot near the AC, rust at the crushed front
      c = mix(c, [92, 86, 76], cl(fbm(x / 80, y / 6, seed + 3, 4) - 0.45) * 0.9);
      c = mix(c, [40, 36, 32], cl(s.cav * 1.1));
      if (x < L * 0.1) c = mix(c, [96, 52, 30], cl(fbm(x / 6, y / 6, seed + 5, 3) - 0.5) * 2);
      return c;
    },
    spec: (_x, _y, s) => (s.r.sideGlass! > 0.5 || s.r.front! > 0.5 ? 0.85 : 0.35),
    seed,
  });
  return tex;
}

// ─────────────────────────────── props ───────────────────────────────

function dumpster(): HTMLCanvasElement {
  const N = 96;
  const seed = 600;
  return render({
    w: N,
    h: N,
    layers: [
      { draw: rect(-44, -44, 88, 88, 6), blur: 4, amount: 0.5 },
      { draw: rect(-40, -40, 80, 38, 3), blur: 2, amount: 0.12 }, // lid 1
      { draw: rect(-40, 4, 80, 36, 3), blur: 2, amount: 0.05 }, // lid 2 (slightly open: lower)
    ],
    engrave: (g) => {
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-44, 0);
      g.lineTo(44, 0);
      g.stroke();
      g.lineWidth = 1;
      for (let x = -32; x <= 32; x += 16) {
        g.beginPath(); // lid ribs
        g.moveTo(x, -38);
        g.lineTo(x, -6);
        g.moveTo(x, 6);
        g.lineTo(x, 38);
        g.stroke();
      }
    },
    regions: { caps: (g) => [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => rect(sx * 40 - 5, sy * 40 - 5, 10, 10, 2)(g))) },
    detail: 0.15,
    grain: 8,
    albedo: (x, y, s) => {
      if (s.r.caps! > 0.5) return [70, 72, 74];
      let c: Rgb = mix([34, 62, 44], [54, 88, 62], fbm(x / 12, y / 12, seed, 4));
      const rust = fbm(x / 5, y / 5, seed + 2, 4);
      if (rust > 0.6) c = mix(c, [112, 56, 28], cl((rust - 0.6) * 4));
      return mix(c, [14, 16, 14], cl(s.cav));
    },
    spec: () => 0.3,
    seed,
  });
}

function pump(): HTMLCanvasElement {
  const seed = 700;
  return render({
    w: 128,
    h: 64,
    layers: [
      { draw: rect(-62, -30, 124, 60, 6), blur: 3, amount: 0.15 }, // concrete island
      { draw: rect(-26, -18, 52, 36, 4), blur: 3, amount: 0.55 }, // pump housing
      { draw: (g) => [-1, 1].forEach((s) => rect(s * 46 - 5, -5, 10, 10, 5)(g)), blur: 2, amount: 0.4 }, // bollards
    ],
    engrave: (g) => {
      g.lineWidth = 1.2;
      g.strokeRect(-20, -12, 40, 10); // display
      g.beginPath();
      g.arc(14, 10, 4, 0, TAU); // nozzle holster
      g.stroke();
    },
    regions: { housing: rect(-26, -18, 52, 36, 4), display: rect(-20, -12, 40, 10), bollard: (g) => [-1, 1].forEach((s) => rect(s * 46 - 5, -5, 10, 10, 5)(g)) },
    detail: 0.12,
    grain: 6,
    albedo: (x, y, s) => {
      if (s.r.display! > 0.5) return [60, 110, 70];
      if (s.r.bollard! > 0.5) return mix([200, 160, 40], [60, 50, 30], cl(fbm(x / 3, y / 3, seed, 2) - 0.4));
      if (s.r.housing! > 0.5) return mix(mix([150, 30, 30], [190, 50, 44], fbm(x / 10, y / 10, seed + 1, 3)), [30, 20, 18], cl(s.cav));
      const c = mix([110, 108, 102], [150, 146, 138], fbm(x / 6, y / 6, seed + 2, 4)); // stained concrete
      return mix(mix(c, [40, 34, 28], cl(fbm(x / 14, y / 14, seed + 3, 3) - 0.5) * 1.6), [30, 28, 26], cl(s.cav));
    },
    spec: (_x, _y, s) => (s.r.display! > 0.5 ? 0.9 : s.r.housing! > 0.5 ? 0.45 : 0.08),
    seed,
  });
}

/** A heap of broken concrete, bricks and rebar (the generic blockage). */
function block(): HTMLCanvasElement {
  const N = 96;
  const seed = 800;
  const r = rng(seed);
  const chunks: [number, number, number, number][] = [];
  for (let i = 0; i < 26; i++) chunks.push([(r() - 0.5) * 70, (r() - 0.5) * 70, 8 + r() * 13, r() * TAU]);
  const chunkPath = (g: G, [x, y, s, a]: [number, number, number, number]): void => {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const t = a + (k / 6) * TAU;
      const q = s * (0.7 + hash2(k, Math.round(x), seed) * 0.5);
      if (k) g.lineTo(x + Math.cos(t) * q, y + Math.sin(t) * q);
      else g.moveTo(x + Math.cos(t) * q, y + Math.sin(t) * q);
    }
    g.closePath();
    g.fill();
  };
  return render({
    w: N,
    h: N,
    layers: [
      { draw: (g) => chunks.forEach((c) => chunkPath(g, c)), blur: 3, amount: 0.25 },
      { draw: (g) => chunks.slice(0, 8).forEach((c) => chunkPath(g, c)), blur: 2, amount: 0.3 },
    ],
    engrave: (g) => {
      g.lineWidth = 1;
      for (const [x, y, s] of chunks) {
        g.beginPath();
        g.moveTo(x - s * 0.4, y);
        g.lineTo(x + s * 0.3, y + s * 0.2);
        g.stroke();
      }
    },
    regions: { brick: (g) => chunks.slice(20).forEach((c) => chunkPath(g, c)) },
    detail: 0.4,
    grain: 3,
    albedo: (x, y, s) => {
      let c: Rgb = s.r.brick! > 0.5 ? mix([92, 58, 46], [126, 82, 64], fbm(x / 4, y / 4, seed, 3)) : mix([104, 100, 92], [156, 150, 140], fbm(x / 5, y / 5, seed + 1, 4));
      c = mix(c, [70, 66, 60], cl(fbm(x / 12, y / 12, seed + 6, 3) - 0.4) * 0.6); // dust over everything
      if (fbm(x / 2.5, y / 2.5, seed + 4, 2) > 0.66) c = mix(c, [64, 60, 56], 0.6); // aggregate
      return mix(c, [18, 16, 14], cl(s.cav * 1.2));
    },
    spec: () => 0.05,
    seed,
  });
}

/** Sandbags: two rows of burlap sacks, tied, with a woven texture. */
function sandbags(): HTMLCanvasElement {
  const w = 192;
  const h = 64;
  const seed = 900;
  const sacks: [number, number, number][] = [];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) sacks.push([-w / 2 + 24 + i * (row ? 34 : 36) + (row ? 12 : 0), row ? 12 : -12, row]);
  const sackPath = (g: G, [x, y]: [number, number, number]): void => {
    g.beginPath();
    g.ellipse(x, y, 21, 13, 0, 0, TAU);
    g.fill();
  };
  return render({
    w,
    h,
    layers: [
      { draw: (g) => sacks.forEach((s) => sackPath(g, s)), blur: 7, amount: 0.55 },
      { draw: (g) => sacks.filter((s) => s[2] === 0).forEach((s) => sackPath(g, s)), blur: 6, amount: 0.2 },
    ],
    engrave: (g) => {
      g.lineWidth = 1.6;
      for (const [x, y] of sacks) {
        g.beginPath(); // the tied end
        g.moveTo(x + 15, y - 7);
        g.lineTo(x + 15, y + 7);
        g.stroke();
      }
    },
    detail: 0.12,
    grain: 5,
    heightAt: (x, y) => (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.015, // the weave
    albedo: (x, y, s) => {
      let c: Rgb = mix([118, 100, 70], [160, 140, 104], fbm(x / 9, y / 9, seed, 4));
      if ((Math.floor(x) + Math.floor(y)) % 3 === 0) c = mix(c, [90, 76, 52], 0.25);
      c = mix(c, [70, 60, 46], cl(fbm(x / 16, y / 16, seed + 2, 3) - 0.5) * 1.2); // wet patches
      return mix(c, [26, 22, 16], cl(s.cav));
    },
    spec: () => 0.08,
    seed,
  });
}

// ─────────────────────────────── barriers (6 m reference frames) ───────────────────────────────

function barrierConcrete(): HTMLCanvasElement {
  const w = 384;
  const h = 32;
  const seed = 1000;
  const blocks = [24, 136, 248, 360];
  const tape = (g: G): void => {
    for (const [y0, sag] of [
      [-5, 2.5],
      [5, -2],
    ] as const) {
      for (let b = 0; b < 3; b++) {
        g.lineWidth = 3.4;
        g.beginPath();
        g.moveTo((blocks[b] as number) - w / 2, y0);
        g.quadraticCurveTo(((blocks[b] as number) + (blocks[b + 1] as number)) / 2 - w / 2, y0 + sag, (blocks[b + 1] as number) - w / 2, y0);
        g.stroke();
      }
    }
  };
  const blockShape = (g: G): void => blocks.forEach((cx) => rect(cx - w / 2 - 20, -15, 40, 30, 3)(g));
  const conc = render({
    w,
    h,
    layers: [
      { draw: blockShape, blur: 4, amount: 0.45 },
      { draw: (g) => blocks.forEach((cx) => rect(cx - w / 2 - 17, -4, 34, 8, 2)(g)), blur: 2, amount: 0.15 },
    ],
    detail: 0.3,
    grain: 3,
    albedo: (x, y, s) => {
      let c: Rgb = mix([120, 116, 108], [176, 172, 162], fbm(x / 5, y / 5, seed, 4));
      if (fbm(x / 2, y / 2, seed + 1, 2) > 0.68) c = mix(c, [80, 76, 70], 0.6);
      c = mix(c, [60, 52, 44], cl(fbm(x / 12, y / 3, seed + 2, 3) - 0.55) * 1.5); // run-off stains
      return mix(c, [26, 24, 22], cl(s.cav));
    },
    spec: () => 0.05,
    seed,
  });
  const tp = render({
    w,
    h,
    layers: [{ draw: tape, blur: 1, amount: 0.08 }],
    detail: 0.02,
    grain: 2,
    albedo: (x) => (Math.floor(x / 6) % 2 ? [226, 190, 40] : [20, 20, 20]),
    spec: () => 0.7,
    seed,
  });
  const c = canvas(w, h);
  const g = ctx(c);
  g.drawImage(tp, 0, 0);
  g.drawImage(conc, 0, 0);
  return c;
}

function barrierSawhorse(): HTMLCanvasElement {
  const w = 384;
  const h = 32;
  const seed = 1100;
  const unit = w / 6;
  const boards = (g: G): void => {
    for (let u = 0; u < 6; u++) rect(u * unit - w / 2 + 2, -6, unit - 4, 11, 1.5)(g);
  };
  const legs = (g: G): void => {
    g.lineWidth = 3;
    for (let u = 0; u < 6; u++) {
      for (const lx of [u * unit - w / 2 + 9, (u + 1) * unit - w / 2 - 9]) {
        g.beginPath();
        g.moveTo(lx, 0);
        g.lineTo(lx - 1, -13);
        g.moveTo(lx, 0);
        g.lineTo(lx - 1, 13);
        g.stroke();
        rect(lx - 4, -15, 6, 3)(g);
        rect(lx - 4, 12, 6, 3)(g);
      }
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(u * unit - w / 2 + 9, -10);
      g.lineTo((u + 1) * unit - w / 2 - 9, -10);
      g.moveTo(u * unit - w / 2 + 9, 10);
      g.lineTo((u + 1) * unit - w / 2 - 9, 10);
      g.stroke();
      g.lineWidth = 3;
    }
  };
  const legTex = render({ w, h, layers: [{ draw: legs, blur: 1, amount: 0.2 }], detail: 0.05, grain: 3, albedo: (x, y) => mix([60, 62, 66], [100, 70, 50], cl(fbm(x / 3, y / 3, seed, 2) - 0.45)), spec: () => 0.4, seed });
  const boardTex = render({
    w,
    h,
    layers: [{ draw: boards, blur: 2, amount: 0.3 }],
    detail: 0.05,
    grain: 4,
    albedo: (x, y, s) => {
      // reflective blue and white stripes, scuffed and dirty
      const stripe = Math.floor((x + y) / 7) % 2 === 0;
      let c: Rgb = stripe ? [36, 72, 126] : [228, 224, 214];
      c = mix(c, [70, 62, 52], cl(fbm(x / 4, y / 4, seed + 1, 3) - 0.55) * 1.4);
      return mix(c, [20, 20, 22], cl(s.cav));
    },
    spec: () => 0.65, // reflective sheeting
    seed,
  });
  const c = canvas(w, h);
  const g = ctx(c);
  g.drawImage(legTex, 0, 0);
  g.drawImage(boardTex, 0, 0);
  for (const lx of [10, w - 10]) {
    g.fillStyle = "#e39a2c";
    g.beginPath();
    g.arc(lx, h / 2 - 5, 2.6, 0, TAU);
    g.fill();
  }
  return c;
}

// ─────────────────────────────── page ───────────────────────────────

interface Item {
  readonly id: string; // the asset id in the gallery
  readonly name: string;
  make(): HTMLCanvasElement;
}

const ITEMS: Item[] = [
  ...CAR_COLORS.map((_, i) => ({ id: `atlas_downtown/vehicle_car_${"abcde"[i]}`, name: `Car ${"ABCDE"[i]}${CAR_WRECK[i] ? " (wrecked)" : ""}`, make: () => car(i) })),
  ...CAR_COLORS.map((_, i) => ({ id: `atlas_downtown/vehicle_carburnt_${"abcde"[i]}`, name: `Burnt car ${"ABCDE"[i]}`, make: () => burntCar(i) })),
  { id: "atlas_downtown/vehicle_bus_a", name: "Bus", make: bus },
  { id: "atlas_downtown/prop_dumpster_a", name: "Dumpster", make: dumpster },
  { id: "atlas_downtown/prop_pump_a", name: "Gas pump", make: pump },
  { id: "atlas_downtown/prop_block_a", name: "Rubble (street blocked)", make: block },
  { id: "atlas_downtown/prop_sandbags_a", name: "Sandbags", make: sandbags },
  { id: "atlas_downtown/prop_barrier_a", name: "Police sawhorses", make: barrierSawhorse },
  { id: "atlas_downtown/prop_barrier_b", name: "Concrete blocks and tape", make: barrierConcrete },
];

function img(url: string): Promise<HTMLCanvasElement> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => {
      const c = canvas(i.naturalWidth, i.naturalHeight);
      ctx(c).drawImage(i, 0, 0);
      res(c);
    };
    i.src = url;
  });
}

/** An object on a patch of night street, scaled to fit `maxW`. */
function onStreet(obj: HTMLCanvasElement, maxW: number, dark: boolean): HTMLCanvasElement {
  const pad = 24;
  const s = Math.min(1, (maxW - 2 * pad) / obj.width);
  const W = Math.round(obj.width * s + 2 * pad);
  const H = Math.round(obj.height * s + 2 * pad);
  const c = canvas(W, H);
  const g = ctx(c);
  asphalt(g, W, H, 3);
  // soft contact shadow toward the map's shadow direction
  g.save();
  g.globalAlpha = 0.5;
  g.filter = "blur(4px) brightness(0)";
  g.drawImage(obj, pad + 4, pad + 6, obj.width * s, obj.height * s);
  g.restore();
  g.drawImage(obj, pad, pad, obj.width * s, obj.height * s);
  if (dark) night(g, W, H, 0.4, [[W * 0.3, H * 0.2, Math.max(W, H) * 0.7]]);
  return c;
}

/** A street corner with everything placed, before or after (the night look of stage 2–3). */
function scene(get: (id: string) => HTMLCanvasElement): HTMLCanvasElement {
  const W = 900;
  const H = 520;
  const k = 0.5; // atlas px → scene px (32 px per metre, like the map)
  const c = canvas(W, H);
  const g = ctx(c);
  asphalt(g, W, H, 77);
  g.fillStyle = GROUND.sidewalk;
  g.fillRect(0, 0, W, 70);
  g.fillStyle = GROUND.curb;
  g.fillRect(0, 70, W, 4);
  g.fillStyle = GROUND.lane;
  for (let x = 0; x < W; x += 70) g.fillRect(x, 300, 40, 3);
  const put = (id: string, x: number, y: number, rot = 0): void => {
    const o = get(id);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.save();
    g.globalAlpha = 0.5;
    g.filter = "blur(3px) brightness(0)";
    g.drawImage(o, (-o.width * k) / 2 + 3, (-o.height * k) / 2 + 4, o.width * k, o.height * k);
    g.restore();
    g.drawImage(o, (-o.width * k) / 2, (-o.height * k) / 2, o.width * k, o.height * k);
    g.restore();
  };
  put("atlas_downtown/vehicle_car_a", 120, 120);
  put("atlas_downtown/vehicle_car_b", 300, 125);
  put("atlas_downtown/vehicle_carburnt_c", 480, 240, 0.25);
  put("atlas_downtown/vehicle_bus_a", 690, 400, Math.PI);
  put("atlas_downtown/vehicle_car_d", 170, 390, Math.PI);
  put("atlas_downtown/prop_dumpster_a", 820, 40);
  put("atlas_downtown/prop_sandbags_a", 420, 420);
  put("atlas_downtown/prop_barrier_a", 640, 180);
  put("atlas_downtown/prop_barrier_b", 300, 470);
  put("atlas_downtown/prop_block_a", 40, 260);
  put("atlas_downtown/prop_pump_a", 600, 40);
  night(g, W, H, 0.45, [
    [200, 60, 220],
    [700, 260, 240],
  ]);
  return c;
}

async function main(): Promise<void> {
  const before: Record<string, HTMLCanvasElement> = {};
  const after: Record<string, HTMLCanvasElement> = {};
  const list = document.getElementById("list") as HTMLElement;
  for (const it of ITEMS) {
    const url = CURRENT[it.id];
    if (url) before[it.id] = await img(url);
    after[it.id] = it.make();
    const row = document.createElement("article");
    row.className = "pair";
    row.innerHTML = `<h3>${it.name}</h3><div class="sides"><figure><figcaption>Now</figcaption></figure><figure><figcaption>Photoreal</figcaption></figure></div>`;
    const figs = row.querySelectorAll("figure");
    const maxW = Math.min(560, Math.max(260, (after[it.id] as HTMLCanvasElement).width + 48));
    if (before[it.id]) (figs[0] as HTMLElement).prepend(onStreet(before[it.id] as HTMLCanvasElement, maxW, false));
    (figs[1] as HTMLElement).prepend(onStreet(after[it.id] as HTMLCanvasElement, maxW, false));
    list.append(row);
    await new Promise((r) => setTimeout(r, 0)); // let the page paint between items
  }
  const sb = document.getElementById("scene-before");
  const sa = document.getElementById("scene-after");
  sb?.append(scene((id) => before[id] ?? (after[id] as HTMLCanvasElement)));
  sa?.append(scene((id) => after[id] as HTMLCanvasElement));
  document.getElementById("loading")?.remove();
}

void main();
