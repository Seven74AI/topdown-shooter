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
  /** Supersampling: drawn at `ss` × the size, then shrunk (crisper edges, finer detail). Default 1. */
  readonly ss?: number;
  /** Darkening along the footprint's inner edge (contact shadow / ambient occlusion), 0–1. */
  readonly edgeAO?: number;
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
  const ss = o.ss ?? 1;
  const w = o.w * ss;
  const h = o.h * ss;
  const up = (f: (g: G) => void) => (g: G): void => {
    g.scale(ss, ss);
    f(g);
  };
  const foot = maskOf(w, h, up((o.layers[0] as Layer).draw));
  const footSoft = o.edgeAO ? maskOf(w, h, up((o.layers[0] as Layer).draw), 3 * ss) : null;
  const layers = o.layers.map((l) => ({ m: maskOf(w, h, up(l.draw), l.blur * ss), a: l.amount }));
  const eng = o.engrave ? maskOf(w, h, up(o.engrave), 0.6 * ss) : null;
  const engW = o.engrave ? maskOf(w, h, up(o.engrave), 2.5 * ss) : null;
  const regions: Record<string, Float32Array> = {};
  for (const [k, f] of Object.entries(o.regions ?? {})) regions[k] = maskOf(w, h, up(f), 0.6 * ss);
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const fx = x / ss;
      const fy = y / ss;
      let v = 0;
      for (const l of layers) v += (l.m[i] as number) * l.a;
      v += (fbm(fx / o.grain, fy / o.grain, o.seed, 4) - 0.5) * o.detail;
      if (o.heightAt) v += o.heightAt(fx, fy);
      if (eng) v -= (eng[i] as number) * (o.engraveDepth ?? 0.35);
      H[i] = v * (foot[i] as number);
    }
  }
  const hi = canvas(w, h);
  const hg = ctx(hi);
  const img = hg.createImageData(w, h);
  const d = img.data;
  const L = [-0.5, -0.72, 0.48];
  const ll = Math.hypot(L[0] as number, L[1] as number, L[2] as number);
  const [lx, ly, lz] = [(L[0] as number) / ll, (L[1] as number) / ll, (L[2] as number) / ll];
  const K = 7 * ss;
  const r: Record<string, number> = {};
  const keys = Object.keys(regions);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = foot[i] as number;
      if (a <= 0.01) continue;
      const fx = x / ss;
      const fy = y / ss;
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
      const sm: Sample = { h: H[i] as number, cav, r };
      const [cr, cg, cb] = o.albedo(fx, fy, sm);
      const gl = o.spec(fx, fy, sm);
      const sp = Math.pow(Math.max(0, rz), 22) * gl;
      const sky = gl * 0.18 * nz; // a soft night-sky reflection on glossy, upward faces
      const ao = footSoft ? 1 - (o.edgeAO ?? 0) * (1 - (footSoft[i] as number)) * 2 : 1;
      const lit = (0.32 + 0.9 * diff) * Math.max(0.3, ao);
      const k = i * 4;
      d[k] = Math.min(255, cr * lit + sp * 255 + sky * 90);
      d[k + 1] = Math.min(255, cg * lit + sp * 248 + sky * 100);
      d[k + 2] = Math.min(255, cb * lit + sp * 240 + sky * 125);
      d[k + 3] = Math.round(a * 255);
    }
  }
  hg.putImageData(img, 0, 0);
  if (ss === 1) return hi;
  const out = canvas(o.w, o.h);
  const og = ctx(out);
  og.imageSmoothingQuality = "high";
  og.drawImage(hi, 0, 0, o.w, o.h);
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

/**
 * Cars, round 3 (designer: "the cars look strange, take inspiration from real cars"). Modelled on a real
 * sedan seen from straight above (4.5 m × 1.8 m): a long bonnet, a large raked windscreen, a roof in the
 * body colour, a smaller rear window and the boot; the body's sides curve away (tumblehome) so they fall
 * into shade; the wheels are hidden under the body; slim lamps in the corners; mirrors at the windscreen's
 * foot. The body height is one smooth analytic surface (no stacked blurred boxes), so the light flows over
 * it like over pressed steel. Front at +x. Drawn at 3× and shrunk.
 */
const smooth = (a: number, b: number, x: number): number => {
  const t = cl((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Sedan stations along the body (frame px from the centre, front +x), shared by the clean and wrecked cars. */
const SEDAN = {
  front: 139,
  bonnet: 54, // bonnet → windscreen
  roofFront: 18, // windscreen → roof
  roofBack: -40, // roof → rear window
  boot: -70, // rear window → boot
  rear: -139,
  hw: 57, // body half width
  roofHw: 41, // roof half width
};

function sedanOutline(g: G): void {
  const { front: f, rear: r, hw } = SEDAN;
  const nose = hw - 6;
  g.beginPath();
  g.moveTo(f - 22, -nose);
  g.bezierCurveTo(f - 4, -nose + 1, f, -nose + 12, f, 0);
  g.bezierCurveTo(f, nose - 12, f - 4, nose - 1, f - 22, nose);
  g.bezierCurveTo(f - 40, hw, f - 60, hw, f - 80, hw);
  g.lineTo(r + 70, hw);
  g.bezierCurveTo(r + 40, hw, r + 12, hw - 1, r + 6, hw - 8);
  g.bezierCurveTo(r, hw - 18, r, -hw + 18, r + 6, -hw + 8);
  g.bezierCurveTo(r + 12, -hw + 1, r + 40, -hw, r + 70, -hw);
  g.lineTo(f - 80, -hw);
  g.bezierCurveTo(f - 60, -hw, f - 40, -nose, f - 22, -nose);
  g.closePath();
  g.fill();
  // mirrors at the windscreen's foot
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(SEDAN.bonnet - 4, s * (hw + 3), 6, 4, 0, 0, TAU);
    g.fill();
  }
}

/** Body height at (x, y) in frame px from the centre (0 … ~1). */
function sedanHeight(x: number, y: number): number {
  const { front, bonnet, roofFront, roofBack, boot, rear, hw, roofHw } = SEDAN;
  const ay = Math.abs(y);
  // the lower body: crowned, falling away at the sides and rounding off at the bumpers
  const side = 1 - smooth(hw - 16, hw + 1, ay) * 0.75;
  const ends = smooth(front, front - 14, x) * smooth(rear, rear + 12, x);
  let h = 0.42 * side * (0.7 + 0.3 * ends) + 0.03 * (1 - (ay / hw) ** 2);
  // bonnet slopes slightly down to the nose, boot slightly down to the tail
  if (x > bonnet) h -= 0.05 * ((x - bonnet) / (front - bonnet));
  if (x < boot) h += 0.04 * (1 - (x - rear) / (boot - rear)) - 0.02;
  // the greenhouse: windscreen ramp up, the roof, the rear window ramp down; narrower than the body
  let cab = 0;
  if (x <= bonnet && x >= boot) {
    if (x > roofFront) cab = smooth(bonnet, roofFront, x);
    else if (x < roofBack) cab = smooth(boot, roofBack, x);
    else cab = 1;
  }
  const cabSide = 1 - smooth(roofHw - 4, roofHw + 9, ay);
  h += 0.4 * cab * cabSide * (1 + 0.04 * (1 - (ay / roofHw) ** 2));
  return h;
}

function car(variant: number): HTMLCanvasElement {
  const L = CAR_L;
  const W = CAR_W;
  const S = SEDAN;
  const paint = hex(CAR_COLORS[variant % CAR_COLORS.length] as string);
  const wreck = CAR_WRECK[variant % CAR_WRECK.length] as boolean;
  const sunroof = variant === 2;
  const seed = 100 + variant * 7;
  const windscreen = (g: G): void => {
    g.beginPath();
    g.moveTo(S.bonnet - 2, -S.roofHw - 7);
    g.lineTo(S.roofFront + 2, -S.roofHw + 1);
    g.lineTo(S.roofFront + 2, S.roofHw - 1);
    g.lineTo(S.bonnet - 2, S.roofHw + 7);
    g.quadraticCurveTo(S.bonnet + 2, 0, S.bonnet - 2, -S.roofHw - 7);
    g.fill();
  };
  const rearWindow = (g: G): void => {
    g.beginPath();
    g.moveTo(S.boot + 3, -S.roofHw - 4);
    g.lineTo(S.roofBack - 2, -S.roofHw + 1);
    g.lineTo(S.roofBack - 2, S.roofHw - 1);
    g.lineTo(S.boot + 3, S.roofHw + 4);
    g.quadraticCurveTo(S.boot, 0, S.boot + 3, -S.roofHw - 4);
    g.fill();
  };
  const sideWindows = (g: G): void => {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(S.bonnet - 6, s * (S.roofHw + 6));
      g.lineTo(S.roofFront, s * (S.roofHw + 1));
      g.lineTo(S.roofBack, s * (S.roofHw + 1));
      g.lineTo(S.boot + 6, s * (S.roofHw + 4));
      g.lineTo(S.boot + 8, s * (S.roofHw + 8));
      g.lineTo(S.bonnet - 10, s * (S.roofHw + 10));
      g.closePath();
      g.fill();
    }
  };
  const glass = (g: G): void => {
    windscreen(g);
    rearWindow(g);
    sideWindows(g);
  };
  const heads = (g: G): void => {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(S.front - 9, s * (S.hw - 16), 5, 10, s * -0.35, 0, TAU);
      g.fill();
    }
  };
  const tails = (g: G): void => {
    for (const s of [-1, 1]) rect(S.rear + 3, s > 0 ? S.hw - 26 : -S.hw + 8, 5, 18, 2)(g);
  };
  const mirrorGlass = (g: G): void => {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(S.bonnet - 6, s * (S.hw + 4.5), 2.2, 1.4, 0, 0, TAU);
      g.fill();
    }
  };
  const body = render({
    w: L,
    h: W,
    ss: SS,
    edgeAO: 0.2,
    layers: [{ draw: sedanOutline, blur: 0, amount: 0 }],
    engrave: (g) => {
      g.lineWidth = 0.8;
      g.beginPath();
      // bonnet and boot shut lines, following the body's curve
      g.moveTo(S.bonnet + 4, -S.hw + 6);
      g.quadraticCurveTo(S.bonnet + 8, 0, S.bonnet + 4, S.hw - 6);
      g.moveTo(S.boot - 4, -S.hw + 7);
      g.quadraticCurveTo(S.boot - 7, 0, S.boot - 4, S.hw - 7);
      // door shut lines on the shoulders (front and rear doors)
      for (const s of [-1, 1]) {
        for (const x of [S.bonnet - 8, -12, S.boot + 6]) {
          g.moveTo(x, s * (S.hw - 9));
          g.lineTo(x - 2, s * (S.hw - 1));
        }
      }
      g.stroke();
      if (sunroof) {
        roundRect(g, S.roofBack + 12, -S.roofHw + 12, S.roofFront - S.roofBack - 22, 2 * S.roofHw - 24, 4);
        g.stroke();
      }
      if (wreck) carWindowCracks(L, W, seed)(g);
    },
    engraveDepth: 0.12,
    regions: {
      glass,
      sun: sunroof ? rect(S.roofBack + 13, -S.roofHw + 13, S.roofFront - S.roofBack - 24, 2 * S.roofHw - 26, 3) : () => undefined,
      head: heads,
      tail: tails,
      mglass: mirrorGlass,
      handle: (g) => [-1, 1].forEach((s) => [S.bonnet - 22, -26].forEach((x) => rect(x - 4, s * (S.hw - 5) - 1, 8, 2, 1)(g))),
    },
    detail: wreck ? 0.05 : 0.004,
    grain: wreck ? 14 : 40,
    heightAt: (x, y) => {
      let h = sedanHeight(x - L / 2, y - W / 2);
      if (wreck) h -= Math.max(0, fbm(x / 22, y / 22, seed + 3, 3) - 0.62) * 0.5;
      return h;
    },
    albedo: (x, y, s) => {
      const px = x - L / 2;
      const py = y - W / 2;
      if (s.r.glass! > 0.5 || s.r.sun! > 0.5) {
        // dark tinted glass: the night sky's gradient, a street light's reflection, the dashboard's edge
        let c = mix([10, 13, 18], [34, 42, 54], cl(0.5 + (px - S.roofFront) / 80));
        const glare = cl(1 - Math.abs(py + 10 - (px - 30) * 0.6) / 7) * (px > S.roofFront ? 1 : 0);
        c = mix(c, [150, 160, 176], glare * 0.45);
        if (px > S.bonnet - 8 && px < S.bonnet - 2) c = mix(c, [6, 6, 8], 0.6);
        return c;
      }
      if (s.r.head! > 0.5) return mix([226, 230, 230], [150, 156, 162], cl(((px - (S.front - 9)) / 5) ** 2));
      if (s.r.tail! > 0.5) return Math.floor((py + 64) / 3) % 2 === 0 ? [176, 20, 24] : [104, 10, 14];
      if (s.r.mglass! > 0.5) return [96, 108, 122];
      if (s.r.handle! > 0.5) return mix(paint, [200, 200, 204], 0.4);
      // paint: the base coat, a fine metallic flake, the night sky reflected on the flat tops,
      // road dirt on the lower sides and the tail
      let c = mix(paint, mix(paint, [255, 255, 255], 0.06), fbm(x / 40, y / 40, seed + 2, 3));
      if (hash2(Math.floor(x * 3), Math.floor(y * 3), seed + 4) < 0.04) c = mix(c, [255, 255, 255], 0.08);
      const top = cl(1 - Math.abs(py) / (S.hw - 10));
      c = mix(c, [110, 122, 140], top * 0.12);
      const lower = cl((Math.abs(py) - (S.hw - 8)) / 8);
      c = mix(c, [70, 62, 52], lower * 0.5 * (0.6 + 0.6 * fbm(x / 5, y / 5, seed + 5, 3)));
      c = mix(c, [24, 22, 20], cl(s.cav));
      if (wreck) {
        const rust = fbm(x / 8, y / 8, seed + 6, 4);
        if (rust > 0.67) c = mix(c, [112, 52, 24], cl((rust - 0.67) * 4));
        if (fbm(x / 1.2, y / 30, seed + 7, 2) > 0.75) c = mix(c, [170, 168, 164], 0.5);
      }
      return c;
    },
    spec: (_x, _y, s) => (s.r.glass! > 0.5 || s.r.sun! > 0.5 || s.r.head! > 0.5 || s.r.mglass! > 0.5 ? 1 : wreck ? 0.3 : 0.7),
    seed,
  });
  const c = canvas(L, W);
  const g = ctx(c);
  g.drawImage(body, 0, 0);
  // a few rain beads on the flat tops
  const bd = ctx(body);
  const r = rng(seed + 9);
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(L / 2 + (r() - 0.5) * L * 0.85);
    const y = Math.floor(W / 2 + (r() - 0.5) * W * 0.55);
    if ((bd.getImageData(x, y, 1, 1).data[3] as number) < 250) continue;
    g.fillStyle = "rgba(0,0,0,0.14)";
    g.beginPath();
    g.arc(x + 0.4, y + 0.5, 0.9, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.28)";
    g.beginPath();
    g.arc(x - 0.3, y - 0.3, 0.45, 0, TAU);
    g.fill();
  }
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

// ─────────────────────────────── props (round 2: sharper, more detail) ───────────────────────────────
// Designer: the burnt car, dumpster, pump, rubble and sandbags "look low resolution, not enough details"
// next to the sawhorses. So: drawn at 3× and shrunk, parts shaded one by one (no blurred blob that melts
// them together), hard edges with a contact shadow, fine textures, more small parts.

const SS = 3;

/** Point in polygon (flat array x0,y0,x1,y1…). */
function inPoly(px: number, py: number, pts: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i] as number;
    const yi = pts[i + 1] as number;
    const xj = pts[j] as number;
    const yj = pts[j + 1] as number;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function burntCar(variant: number): HTMLCanvasElement {
  const L = CAR_L;
  const W = CAR_W;
  const P = carParts(L, W);
  const seed = 300 + variant * 11;
  const cab = P.cabin_;
  // rims with spokes (the tyres burnt away)
  const rims = render({
    w: L,
    h: W,
    ss: SS,
    layers: [{ draw: P.wheels, blur: 0.6, amount: 0.25 }],
    engrave: (g) => {
      g.lineWidth = 1.2;
      for (const wx of [-L * 0.3, L * 0.29]) {
        for (const s of [-1, 1]) {
          const cy = s > 0 ? W / 2 - 8 : -W / 2 + 8;
          for (let k = -18; k <= 18; k += 6) {
            g.beginPath();
            g.moveTo(wx + k, cy - 5);
            g.lineTo(wx + k, cy + 5);
            g.stroke();
          }
        }
      }
    },
    detail: 0.2,
    grain: 1.5,
    albedo: (x, y, s) => mix(mix([44, 38, 34], [110, 80, 56], fbm(x / 2, y / 2, seed, 3)), [10, 8, 7], cl(s.cav)),
    spec: () => 0.15,
    seed,
  });
  const body = render({
    w: L,
    h: W,
    ss: SS,
    edgeAO: 0.35,
    layers: [
      { draw: P.body, blur: 3, amount: 0.5 },
      { draw: P.cabin, blur: 2.5, amount: 0.28 },
      { draw: P.roof, blur: 1.5, amount: 0.06 }, // the roof sagged in the heat
    ],
    engrave: (g) => {
      P.seams(g);
      P.glass(g); // the glass is gone: holes into the burnt cabin
      g.lineWidth = 1;
      // buckled panels: short creases
      const r = rng(seed + 1);
      for (let i = 0; i < 14; i++) {
        const x = (r() - 0.5) * L * 0.85;
        const y = (r() - 0.5) * W * 0.6;
        const a = r() * TAU;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
        g.stroke();
      }
    },
    engraveDepth: 0.6,
    regions: { glass: P.glass, lights: (g) => (P.lights.front(g), P.lights.rear(g)) },
    detail: 0.12,
    grain: 4,
    heightAt: (x, y) => -Math.max(0, fbm(x / 20, y / 20, seed + 3, 3) - 0.58) * 0.7,
    albedo: (x, y, s) => {
      if (s.r.glass! > 0.5) {
        // inside: ash, the seat frames' springs, a steering wheel ring
        let c: Rgb = mix([10, 9, 8], [40, 36, 32], fbm(x / 3, y / 3, seed + 1, 3));
        const sx = ((x - L / 2) % 7 + 7) % 7;
        const sy = ((y - W / 2) % 7 + 7) % 7;
        if (sx < 1.1 || sy < 1.1) c = mix(c, [96, 62, 40], 0.8);
        const d = Math.hypot(x - (L / 2 + cab.x + cab.w * 0.72), y - (W / 2 - W * 0.14));
        if (Math.abs(d - 9) < 1.2) c = [80, 60, 44];
        return c;
      }
      if (s.r.lights! > 0.5) return [30, 26, 24]; // melted light housings
      // charred paint: black flakes over scorched metal, rust blooms, white ash, a band of surviving paint low on the sides
      const n = fbm(x / 6, y / 6, seed + 2, 5);
      let c: Rgb = mix([16, 14, 13], [52, 46, 42], n);
      const flake = fbm(x / 1.8, y / 1.8, seed + 7, 2);
      if (flake > 0.62) c = mix(c, [74, 68, 62], 0.6);
      const rust = fbm(x / 5, y / 5, seed + 5, 4);
      if (rust > 0.52) c = mix(c, [128, 60, 26], cl((rust - 0.52) * 3.2));
      const ash = fbm(x / 3, y / 3, seed + 8, 3);
      if (ash > 0.64) c = mix(c, [150, 146, 140], cl((ash - 0.64) * 3.5));
      const side = Math.abs(y - W / 2) / (W / 2);
      if (side > 0.78) c = mix(c, hex(CAR_COLORS[variant % CAR_COLORS.length] as string), cl((side - 0.78) * 3) * 0.5 * (fbm(x / 9, y / 3, seed + 9, 3) > 0.5 ? 1 : 0.2));
      return mix(c, [6, 5, 4], cl(s.cav));
    },
    spec: (x, y) => 0.08 + 0.12 * (fbm(x / 6, y / 6, seed + 6, 2) > 0.6 ? 1 : 0),
    seed,
  });
  const c = canvas(L, W);
  const g = ctx(c);
  g.drawImage(rims, 0, 0);
  g.drawImage(body, 0, 0);
  // broken glass glinting around the car body
  const r = rng(seed + 12);
  for (let i = 0; i < 60; i++) {
    const x = L / 2 + (r() - 0.5) * L * 0.95;
    const y = r() < 0.5 ? 6 + r() * 6 : W - 12 + r() * 6;
    g.fillStyle = `rgba(200,215,225,${0.35 + r() * 0.4})`;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}

function dumpster(): HTMLCanvasElement {
  const N = 96;
  const seed = 600;
  const lid1 = { x: -41, y: -42, w: 82, h: 40 };
  const lid2 = { x: -41, y: 3, w: 82, h: 39 };
  return render({
    w: N,
    h: N,
    ss: SS,
    edgeAO: 0.4,
    layers: [
      { draw: rect(-45, -45, 90, 90, 3), blur: 1.5, amount: 0.5 },
      { draw: rect(lid1.x, lid1.y, lid1.w, lid1.h, 2), blur: 1, amount: 0.1 },
      { draw: rect(lid2.x, lid2.y + 3, lid2.w, lid2.h - 3, 2), blur: 1, amount: 0.16 }, // propped open a little: higher at the far edge
      {
        // raised ribs pressed into the lids
        draw: (g) => {
          for (let x = -33; x <= 33; x += 11) {
            rect(x - 2, lid1.y + 4, 4, lid1.h - 8, 2)(g);
            rect(x - 2, lid2.y + 6, 4, lid2.h - 10, 2)(g);
          }
        },
        blur: 0.8,
        amount: 0.08,
      },
      { draw: (g) => [-1, 1].forEach((sx) => rect(sx * 45 - (sx > 0 ? 6 : 0), -30, 6, 60, 1)(g)), blur: 0.8, amount: 0.12 }, // lifting pockets on the sides
    ],
    engrave: (g) => {
      g.lineWidth = 2.6;
      g.beginPath(); // the gap between the lids (dark: the lid stands open)
      g.moveTo(-44, 0.5);
      g.lineTo(44, 0.5);
      g.stroke();
      g.lineWidth = 0.9;
      g.strokeRect(lid1.x, lid1.y, lid1.w, lid1.h);
      g.strokeRect(lid2.x, lid2.y, lid2.w, lid2.h);
      for (const hx of [-30, 0, 30]) {
        g.beginPath(); // hinges
        g.arc(hx, -44, 2, 0, TAU);
        g.fill();
      }
      // dents
      g.beginPath();
      g.ellipse(18, 24, 7, 4, 0.4, 0, TAU);
      g.stroke();
    },
    engraveDepth: 0.3,
    regions: {
      caps: (g) => [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => rect(sx * 41 - 4, sy * 41 - 4, 8, 8, 1.5)(g))),
      label: rect(-20, 14, 40, 9),
      graffiti: (g) => {
        g.lineWidth = 2.2;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(-34, -30);
        g.bezierCurveTo(-22, -40, -12, -14, 0, -26);
        g.bezierCurveTo(8, -34, 14, -18, 26, -28);
        g.stroke();
      },
    },
    detail: 0.04,
    grain: 2,
    albedo: (x, y, s) => {
      if (s.r.caps! > 0.5) return mix([56, 58, 60], [96, 98, 100], fbm(x, y, seed, 2));
      if (s.r.label! > 0.5) return mix([200, 196, 184], [120, 116, 104], cl(fbm(x / 2, y / 2, seed + 4, 2) - 0.3)); // a peeling sticker
      let c: Rgb = mix([30, 56, 40], [56, 92, 64], fbm(x / 7, y / 7, seed, 4));
      if (s.r.graffiti! > 0.5) c = mix(c, [210, 210, 214], 0.75);
      // chipped paint showing bare steel, rust streaks running down from the edges and chips
      const chip = fbm(x / 2.2, y / 2.2, seed + 2, 3);
      if (chip > 0.68) c = mix(c, [118, 112, 104], 0.7);
      const streak = fbm(x / 1.6, y / 14, seed + 3, 3);
      if (streak > 0.6) c = mix(c, [118, 58, 28], cl((streak - 0.6) * 3));
      c = mix(c, [60, 50, 36], cl(fbm(x / 10, y / 10, seed + 5, 3) - 0.55) * 1.2); // grime
      return mix(c, [10, 12, 10], cl(s.cav));
    },
    spec: (x, y, s) => (s.r.label! > 0.5 ? 0.2 : 0.3 + 0.2 * fbm(x / 4, y / 4, seed + 6, 2)),
    seed,
  });
}

function pump(): HTMLCanvasElement {
  const seed = 700;
  const island = rect(-62, -30, 124, 60, 5);
  const housing = rect(-24, -17, 48, 34, 3);
  return render({
    w: 128,
    h: 64,
    ss: SS,
    edgeAO: 0.35,
    layers: [
      { draw: island, blur: 1, amount: 0.15 },
      { draw: housing, blur: 1.5, amount: 0.5 },
      { draw: rect(-21, -14, 42, 12, 2), blur: 0.6, amount: 0.04 }, // display bezel
      { draw: (g) => [-1, 1].forEach((s) => (g.beginPath(), g.arc(s * 48, 0, 5.5, 0, TAU), g.fill())), blur: 1.5, amount: 0.45 }, // bollards
      {
        // the hose: from the housing round to the nozzle in its holster
        draw: (g) => {
          g.lineWidth = 3.2;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(20, 12);
          g.bezierCurveTo(36, 26, 44, 4, 30, -6);
          g.stroke();
        },
        blur: 0.8,
        amount: 0.32,
      },
      { draw: rect(24, -12, 10, 6, 1.5), blur: 0.6, amount: 0.38 }, // the nozzle
    ],
    engrave: (g) => {
      g.lineWidth = 0.8;
      g.strokeRect(-24, -17, 48, 34);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) g.strokeRect(-18 + j * 6, 3 + i * 4.5, 4, 3); // keypad
      g.beginPath(); // drain in the island
      g.arc(-44, 18, 3, 0, TAU);
      g.stroke();
    },
    engraveDepth: 0.2,
    regions: {
      housing,
      display: rect(-19, -12, 38, 8),
      digits: (g) => {
        g.font = "bold 7px monospace";
        g.textBaseline = "middle";
        g.fillText("1.89 9", -17, -8);
      },
      bollard: (g) => [-1, 1].forEach((s) => (g.beginPath(), g.arc(s * 48, 0, 5.5, 0, TAU), g.fill())),
      hose: (g) => {
        g.lineWidth = 3.2;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(20, 12);
        g.bezierCurveTo(36, 26, 44, 4, 30, -6);
        g.stroke();
        rect(24, -12, 10, 6, 1.5)(g);
      },
      edge: (g) => {
        g.lineWidth = 3;
        roundRect(g, -60.5, -28.5, 121, 57, 4);
        g.stroke();
      },
    },
    detail: 0.05,
    grain: 2,
    albedo: (x, y, s) => {
      if (s.r.digits! > 0.5 && s.r.display! > 0.5) return [150, 255, 160];
      if (s.r.display! > 0.5) return [20, 40, 26];
      if (s.r.hose! > 0.5) return [18, 18, 20];
      if (s.r.bollard! > 0.5) {
        const band = Math.floor((x + y) / 3) % 2 === 0;
        return mix(band ? [214, 170, 30] : [24, 22, 20], [70, 60, 40], cl(fbm(x, y, seed, 2) - 0.5));
      }
      if (s.r.housing! > 0.5) {
        let c: Rgb = mix([150, 26, 28], [196, 46, 40], fbm(x / 6, y / 6, seed + 1, 3));
        if (fbm(x / 1.5, y / 1.5, seed + 8, 2) > 0.7) c = mix(c, [210, 200, 190], 0.5); // scratches
        return mix(c, [30, 16, 14], cl(s.cav));
      }
      // concrete island: stained, oil spots, a chipped yellow painted edge
      let c: Rgb = mix([104, 102, 96], [152, 148, 140], fbm(x / 3, y / 3, seed + 2, 4));
      c = mix(c, [30, 26, 22], cl(fbm(x / 9, y / 9, seed + 3, 3) - 0.56) * 2.2);
      if (s.r.edge! > 0.5 && fbm(x / 2, y / 2, seed + 4, 2) < 0.62) c = mix(c, [210, 168, 40], 0.85);
      if (hash2(Math.floor(x * 2), Math.floor(y * 2), seed) < 0.03) c = mix(c, [60, 58, 54], 0.5); // aggregate
      return mix(c, [24, 22, 20], cl(s.cav));
    },
    spec: (_x, _y, s) => (s.r.display! > 0.5 ? 0.9 : s.r.hose! > 0.5 ? 0.5 : s.r.housing! > 0.5 ? 0.5 : 0.06),
    seed,
  });
}

/** A heap of broken concrete slabs, bricks and rebar, each chunk lit as flat faces (crisp edges). */
function block(): HTMLCanvasElement {
  const N = 96;
  const seed = 800;
  const r = rng(seed);
  type Chunk = { pts: number[]; cx: number; cy: number; a: number; b: number; z: number; brick: boolean };
  const chunks: Chunk[] = [];
  for (let i = 0; i < 34; i++) {
    const big = i < 10;
    const cx = (r() - 0.5) * (big ? 50 : 78);
    const cy = (r() - 0.5) * (big ? 50 : 78);
    const s = big ? 12 + r() * 9 : 4 + r() * 7;
    const brick = !big && r() < 0.35;
    const pts: number[] = [];
    const n = brick ? 4 : 5 + Math.floor(r() * 3);
    const rot = r() * TAU;
    for (let k = 0; k < n; k++) {
      const t = rot + (k / n) * TAU + (brick ? 0 : (r() - 0.5) * 0.5);
      const q = brick ? s * (k % 2 ? 0.55 : 1) : s * (0.65 + r() * 0.45);
      pts.push(cx + Math.cos(t) * q, cy + Math.sin(t) * q);
    }
    // each chunk is a tilted plane: height = z + a·dx + b·dy (big ones sit higher, on top of the heap)
    chunks.push({ pts, cx, cy, a: (r() - 0.5) * 0.05, b: (r() - 0.5) * 0.05, z: (big ? 0.4 : 0.15) + r() * 0.15 + Math.max(0, 0.3 - Math.hypot(cx, cy) / 120), brick });
  }
  chunks.sort((p, q) => p.z - q.z); // higher chunks drawn last (on top)
  const top = (x: number, y: number): Chunk | null => {
    let best: Chunk | null = null;
    for (const c of chunks) if (inPoly(x, y, c.pts)) best = c;
    return best;
  };
  const path = (g: G, c: Chunk): void => {
    g.beginPath();
    for (let k = 0; k < c.pts.length; k += 2) (k ? g.lineTo : g.moveTo).call(g, c.pts[k] as number, c.pts[k + 1] as number);
    g.closePath();
    g.fill();
  };
  return render({
    w: N,
    h: N,
    ss: SS,
    edgeAO: 0.45,
    layers: [{ draw: (g) => chunks.forEach((c) => path(g, c)), blur: 0, amount: 0 }],
    engrave: (g) => {
      // rebar sticking out of the slabs
      g.lineWidth = 1.4;
      for (const c of chunks.slice(-6)) {
        g.beginPath();
        g.moveTo(c.cx, c.cy);
        g.lineTo(c.cx + 9, c.cy - 7);
        g.stroke();
      }
    },
    engraveDepth: -0.25, // rebar stands proud
    regions: {
      rebar: (g) => {
        g.lineWidth = 1.4;
        for (const c of chunks.slice(-6)) {
          g.beginPath();
          g.moveTo(c.cx, c.cy);
          g.lineTo(c.cx + 9, c.cy - 7);
          g.stroke();
        }
      },
    },
    detail: 0.06,
    grain: 1.2,
    heightAt: (x, y) => {
      const c = top(x - N / 2, y - N / 2);
      if (!c) return 0;
      return c.z + c.a * (x - N / 2 - c.cx) + c.b * (y - N / 2 - c.cy);
    },
    albedo: (x, y, s) => {
      if (s.r.rebar! > 0.5) return [104, 56, 30];
      const c = top(x - N / 2, y - N / 2);
      let col: Rgb = c?.brick ? mix([104, 56, 42], [146, 78, 58], fbm(x / 2, y / 2, seed, 3)) : mix([112, 108, 100], [170, 164, 154], fbm(x / 3, y / 3, seed + 1, 4));
      if (!c?.brick && fbm(x / 1.1, y / 1.1, seed + 4, 2) > 0.66) col = mix(col, [70, 66, 60], 0.65); // aggregate in the broken faces
      col = mix(col, [120, 116, 108], cl(fbm(x / 8, y / 8, seed + 6, 3) - 0.55) * 1.2); // dust settled on top
      return mix(col, [16, 14, 12], cl(s.cav * 1.2));
    },
    spec: () => 0.05,
    seed,
  });
}

/** Sandbags: two rows of burlap sacks, each its own rounded volume with a seam, a tied end and a coarse weave. */
function sandbags(): HTMLCanvasElement {
  const w = 192;
  const h = 64;
  const seed = 900;
  type Sack = { x: number; y: number; rx: number; ry: number; z: number; a: number };
  const sacks: Sack[] = [];
  const r = rng(seed);
  for (let row = 0; row < 2; row++) {
    const n = row ? 5 : 5;
    for (let i = 0; i < n; i++) {
      sacks.push({ x: -w / 2 + 22 + i * 36 + (row ? 15 : 0) + (r() - 0.5) * 3, y: row ? 13 : -13, rx: 19 + r() * 2, ry: 12.5, z: row ? 0.42 : 0.55, a: (r() - 0.5) * 0.12 });
    }
  }
  const local = (s: Sack, x: number, y: number): [number, number] => {
    const dx = x - s.x;
    const dy = y - s.y;
    const ca = Math.cos(-s.a);
    const sa = Math.sin(-s.a);
    return [(dx * ca - dy * sa) / s.rx, (dx * sa + dy * ca) / s.ry];
  };
  /** The sack on top at a point, and its dome height there (pillow-shaped: flat-ish top, round edges). */
  const at = (x: number, y: number): [Sack | null, number] => {
    let best: Sack | null = null;
    let hb = -1;
    for (const s of sacks) {
      const [u, v] = local(s, x, y);
      const d = u ** 4 + v ** 2; // squarer ends than an ellipse
      if (d >= 1) continue;
      const hh = s.z * Math.sqrt(1 - d);
      if (hh > hb) {
        hb = hh;
        best = s;
      }
    }
    return [best, Math.max(0, hb)];
  };
  return render({
    w,
    h,
    ss: SS,
    edgeAO: 0.3,
    layers: [{ draw: (g) => sacks.forEach((s) => (g.save(), g.translate(s.x, s.y), g.rotate(s.a), g.beginPath(), g.ellipse(0, 0, s.rx, s.ry, 0, 0, TAU), g.fill(), g.restore())), blur: 0, amount: 0 }],
    detail: 0.03,
    grain: 2,
    heightAt: (x, y) => {
      const px = x - w / 2;
      const py = y - h / 2;
      const [s, hh] = at(px, py);
      if (!s) return 0;
      const [u, v] = local(s, px, py);
      // sagging wrinkles across the sack, a seam along it, the tied end squeezed
      const wrinkle = Math.sin(u * 9 + v * 2 + s.x) * 0.012 * (1 - Math.abs(v));
      const seam = Math.abs(v + 0.15) < 0.05 ? -0.02 : 0;
      const tie = u > 0.78 ? -0.06 * (u - 0.78) * 5 : 0;
      const weave = (Math.sin(px * 3.1) + Math.sin(py * 3.1)) * 0.0035;
      return hh + wrinkle + seam + tie + weave;
    },
    albedo: (x, y, sm) => {
      const px = x - w / 2;
      const py = y - h / 2;
      const [s] = at(px, py);
      const tone = s ? hash2(Math.round(s.x), Math.round(s.y), seed) : 0.5;
      let c: Rgb = mix([112, 94, 64], [158, 136, 98], cl(fbm(x / 4, y / 4, seed, 4) * 0.8 + tone * 0.3));
      // burlap: crisp crossing threads
      const tx = (px * 2.2) % 2;
      const ty = (py * 2.2) % 2;
      if ((tx < 0.5 && ty > 1) || (ty < 0.5 && tx > 1)) c = mix(c, [86, 70, 46], 0.4);
      if (s) {
        const [u, v] = local(s, px, py);
        if (Math.abs(v + 0.15) < 0.05) c = mix(c, [70, 56, 36], 0.7); // the stitched seam
        if (u > 0.82 && Math.abs(v) < 0.35) c = mix(c, [64, 52, 34], 0.5); // the tied end
      }
      c = mix(c, [74, 64, 48], cl(fbm(x / 9, y / 9, seed + 2, 3) - 0.55) * 1.4); // damp patches, mud
      return mix(c, [22, 18, 12], cl(sm.cav * 1.4));
    },
    spec: (x, y) => 0.06 + 0.06 * (fbm(x / 9, y / 9, seed + 2, 3) > 0.6 ? 1 : 0),
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
