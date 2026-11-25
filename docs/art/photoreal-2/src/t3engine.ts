/** Take 3's character engine (shared by the take 3 page and the full comparison). See take3.ts for the method. */
import { fbm, type G } from "../../asset-fixes-1/src/lib";
import { cl, mix, render, type Rgb } from "../../photoreal-1/src/relief";

export const TAU = Math.PI * 2;
export const R = 68;

export type Mat = "skin" | "zskin" | "cloth" | "hair" | "metal" | "wood" | "plastic" | "strap" | "wound" | "nail" | "acid" | "rubber" | "gold";

export interface PrimBase {
  z: number;
  t: number;
  mat: Mat;
  col?: Rgb;
  /** Torn edge: how ragged (0 clean … 0.3 very). */
  torn?: number;
  /** Fold direction (radians) for cloth; defaults to across the part. */
  fold?: number;
}
export interface Ell extends PrimBase {
  kind: "ell";
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
}
export interface Cap extends PrimBase {
  kind: "cap";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}
export type Prim = Ell | Cap;

export const ell = (x: number, y: number, rx: number, ry: number, z: number, t: number, mat: Mat, o: Partial<PrimBase> & { rot?: number } = {}): Ell => ({ kind: "ell", x, y, rx, ry, z, t, mat, rot: o.rot ?? 0, ...o });
export const cap = (x0: number, y0: number, x1: number, y1: number, r: number, z: number, t: number, mat: Mat, o: Partial<PrimBase> = {}): Cap => ({ kind: "cap", x0, y0, x1, y1, r, z, t, mat, ...o });

/** Height of a part at (x, y) (body radii), or -1 outside; also returns the coordinate along the part (0–1). */
export function primAt(p: Prim, x: number, y: number, out: { along: number; edge: number }): number {
  let d: number;
  if (p.kind === "ell") {
    const c = Math.cos(-p.rot);
    const s = Math.sin(-p.rot);
    const dx = x - p.x;
    const dy = y - p.y;
    const u = (dx * c - dy * s) / p.rx;
    const v = (dx * s + dy * c) / p.ry;
    d = Math.sqrt(u * u + v * v);
    out.along = (u + 1) / 2;
    if (p.torn) d += (fbm(Math.atan2(v, u) * 2.5 + p.x * 9, 0.5, 13, 3) - 0.5) * p.torn * 2 * Math.max(0, d - 0.6);
  } else {
    const vx = p.x1 - p.x0;
    const vy = p.y1 - p.y0;
    const len2 = vx * vx + vy * vy;
    const k = Math.max(0, Math.min(1, ((x - p.x0) * vx + (y - p.y0) * vy) / len2));
    d = Math.hypot(x - (p.x0 + vx * k), y - (p.y0 + vy * k)) / p.r;
    out.along = k;
    if (p.torn) d += (fbm(k * 6 + p.x0 * 9, (x - p.x0) * 3, 17, 3) - 0.5) * p.torn * 2 * Math.max(0, d - 0.5);
  }
  out.edge = d;
  return d < 1 ? p.z + p.t * Math.sqrt(1 - d * d) : -1;
}

export function drawPrim(g: G, p: Prim): void {
  g.beginPath();
  if (p.kind === "ell") {
    g.ellipse(p.x * R, p.y * R, p.rx * R * 1.05, p.ry * R * 1.05, p.rot, 0, TAU);
    g.fill();
  } else {
    g.lineWidth = 2 * p.r * R * 1.05;
    g.lineCap = "round";
    g.moveTo(p.x0 * R, p.y0 * R);
    g.lineTo(p.x1 * R, p.y1 * R);
    g.stroke();
  }
}

export interface Look {
  skin: Rgb;
  cloth: Rgb;
  hair: Rgb;
  /** Where blood soaks the cloth (0 none … 1 heavy) and a seed. */
  blood: number;
  seed: number;
}

export interface Figure {
  prims: Prim[];
  extent: number;
  look: Look;
  /** Lit lettering, stitching, zips, buckles: white-filled shapes in body radii × R, centred. */
  regions?: Record<string, (g: G) => void>;
  albedo?: (rx: number, ry: number, base: Rgb, region: Record<string, number>) => Rgb;
  /** Drawn on top after lighting (glows, sparks), in px around the frame centre. */
  extras?: (g: G) => void;
  /** Supersampling (default 3). */
  ss?: number;
}

export const COOL: Rgb = [0.93, 0.98, 1.06];
export const AMB: Rgb = [0.14, 0.15, 0.17];

export function build(f: Figure): HTMLCanvasElement {
  const N = Math.ceil(2 * f.extent * R);
  const tmp = { along: 0, edge: 0 };
  const top = (x: number, y: number): [Prim | null, number, number, number] => {
    let best: Prim | null = null;
    let hb = -1;
    let along = 0;
    let edge = 0;
    for (const p of f.prims) {
      const h = primAt(p, x, y, tmp);
      if (h > hb) {
        hb = h;
        best = p;
        along = tmp.along;
        edge = tmp.edge;
      }
    }
    return [best, hb, along, edge];
  };
  const toR = (v: number): number => (v - N / 2) / R;
  const L = f.look;
  const img = render({
    w: N,
    h: N,
    ss: f.ss ?? 3,
    edgeAO: 0.5,
    tint: COOL,
    ambient: AMB,
    key: 1.55,
    slope: 13,
    layers: [{ draw: (g) => f.prims.forEach((p) => drawPrim(g, p)), blur: 0, amount: 0 }],
    regions: f.regions,
    detail: 0.004,
    grain: 2,
    heightAt: (x, y) => {
      const rx = toR(x);
      const ry = toR(y);
      const [p, h, along] = top(rx, ry);
      if (!p || h < 0) return -0.5; // torn away: a gap (footprint edge)
      let d = 0;
      if (p.mat === "cloth" || p.mat === "strap") {
        // folds running across the part (sleeves bunch at the elbow), plus crumple noise
        const dir = p.fold ?? (p.kind === "cap" ? Math.atan2(p.y1 - p.y0, p.x1 - p.x0) : 0);
        const u = rx * Math.cos(dir) + ry * Math.sin(dir);
        const crumple = fbm(rx * 5, ry * 5, L.seed, 3);
        d = Math.sin(u * 26 + crumple * 7) * 0.016 * (0.5 + crumple) + (fbm(rx * 14, ry * 14, L.seed + 1, 2) - 0.5) * 0.012;
        if (p.kind === "cap" && along > 0.4 && along < 0.65) d += Math.sin(along * 60) * 0.01; // bunching
      } else if (p.mat === "hair") {
        const dir = p.fold ?? 0;
        const u = rx * Math.cos(dir) + ry * Math.sin(dir);
        const v = -rx * Math.sin(dir) + ry * Math.cos(dir);
        d = (fbm(u * 3, v * 40, L.seed + 2, 3) - 0.5) * 0.04 + (fbm(u * 12, v * 12, L.seed + 3, 2) - 0.5) * 0.02;
      } else if (p.mat === "skin" || p.mat === "zskin") {
        d = (fbm(rx * 18, ry * 18, L.seed + 4, 2) - 0.5) * 0.01;
        if (p.mat === "zskin") d -= Math.max(0, 0.02 - Math.abs(fbm(rx * 7, ry * 7, L.seed + 5, 2) - 0.5)) * 0.5; // sunken veins
      } else if (p.mat === "plastic" || p.mat === "metal") d = (fbm(rx * 20, ry * 20, L.seed + 6, 2) - 0.5) * 0.004;
      return h * 0.5 + d;
    },
    albedo: (x, y, s) => {
      const rx = toR(x);
      const ry = toR(y);
      const [p, , along, edge] = top(rx, ry);
      const m = p?.mat ?? "cloth";
      const n = fbm(rx * 6, ry * 6, L.seed + 7, 4);
      let c: Rgb;
      switch (m) {
        case "skin":
          c = mix(mix(L.skin, [90, 50, 40], 0.15), mix(L.skin, [255, 230, 210], 0.12), n);
          break;
        case "zskin": {
          c = mix(mix(L.skin, [40, 50, 40], 0.25), mix(L.skin, [210, 215, 200], 0.15), n);
          const br = fbm(rx * 3, ry * 3, L.seed + 8, 3);
          if (br > 0.7) c = mix(c, [78, 66, 74], Math.min(0.35, (br - 0.7) * 3)); // bruising, in patches
          if (Math.abs(fbm(rx * 7, ry * 7, L.seed + 5, 2) - 0.5) < 0.012) c = mix(c, [52, 62, 82], 0.6); // veins
          if (p?.kind === "cap" && along > 0.9) c = mix(c, [60, 14, 12], 0.5); // filthy, bloodied fingertips
          break;
        }
        case "cloth": {
          const base = p?.col ?? L.cloth;
          c = mix(mix(base, [10, 10, 12], 0.3), mix(base, [255, 255, 255], 0.07), n);
          if ((Math.floor(x * 2) + Math.floor(y * 2)) % 2 === 0) c = mix(c, [0, 0, 0], 0.04); // weave
          c = mix(c, [58, 52, 44], cl(fbm(rx * 2.5, ry * 2.5, L.seed + 9, 3) - 0.56) * 1.3); // grime
          if (p?.torn && edge > 0.85) c = mix(c, [40, 36, 32], 0.5); // frayed edge
          break;
        }
        case "strap":
          c = mix(p?.col ?? [30, 30, 28], [60, 58, 52], n * 0.5);
          break;
        case "hair":
          c = mix(mix(L.hair, [0, 0, 0], 0.4), mix(L.hair, [200, 190, 170], 0.1), fbm(rx * 3, ry * 40, L.seed + 2, 3));
          break;
        case "metal":
          c = mix(p?.col ?? [30, 32, 36], [80, 84, 90], n);
          break;
        case "wood":
          c = mix([70, 42, 24], [118, 76, 44], cl(Math.sin(rx * 50 + n * 5) * 0.5 + 0.5));
          break;
        case "plastic":
          c = mix(p?.col ?? [20, 21, 24], [40, 42, 46], n * 0.5);
          break;
        case "wound":
          c = mix([34, 4, 4], [92, 12, 10], n);
          break;
        case "nail":
          c = [70, 66, 60];
          break;
        case "acid":
          c = mix([90, 150, 20], [190, 235, 70], n);
          break;
        case "rubber":
          c = mix(p?.col ?? [28, 28, 30], [50, 50, 52], n * 0.4);
          break;
        case "gold":
          c = mix([150, 110, 30], [230, 190, 80], n);
          break;
      }
      if (L.blood > 0 && (m === "cloth" || m === "zskin")) {
        const b = fbm(rx * 3.5, ry * 3.5, L.seed + 10, 4);
        const th = 0.7 - L.blood * 0.12;
        if (b > th) c = mix(c, [74, 8, 8], cl((b - th) * 4) * 0.9);
      }
      if (f.albedo) c = f.albedo(rx, ry, c, s.r);
      return mix(c, [8, 8, 10], cl(s.cav * 1.1));
    },
    spec: (x, y, s) => {
      const rx = toR(x);
      const ry = toR(y);
      const [p] = top(rx, ry);
      const m = p?.mat;
      if (m === "plastic" || m === "metal" || m === "gold" || m === "acid") return 0.9;
      if (m === "rubber") return 0.4;
      if (m === "wound") return 0.85;
      if (m === "hair") return 0.35;
      if (m === "zskin") return 0.3;
      if (m === "skin") return 0.22;
      if (L.blood > 0 && m === "cloth" && fbm(rx * 3.5, ry * 3.5, L.seed + 10, 4) > 0.7 - L.blood * 0.12) return 0.6; // wet blood
      void s;
      return 0.07;
    },
    seed: L.seed,
  });
  if (!f.extras) return img;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const g = c.getContext("2d") as G;
  g.drawImage(img, 0, 0);
  g.save();
  g.translate(N / 2, N / 2);
  f.extras(g);
  g.restore();
  return c;
}

// ─────────────────────────────── parts ───────────────────────────────

/** A hand at the end of an arm (pointing `dir`), with `n` spread fingers. */
export function hand(x: number, y: number, dir: number, size: number, mat: Mat, spread: number, z = 0.34): Prim[] {
  const out: Prim[] = [ell(x, y, size * 0.75, size * 0.6, z, 0.12, mat, { rot: dir })];
  for (let i = 0; i < 4; i++) {
    const a = dir + (i - 1.5) * spread;
    const bx = x + Math.cos(dir) * size * 0.45 + Math.cos(dir + Math.PI / 2) * (i - 1.5) * size * 0.32;
    const by = y + Math.sin(dir) * size * 0.45 + Math.sin(dir + Math.PI / 2) * (i - 1.5) * size * 0.32;
    out.push(cap(bx, by, bx + Math.cos(a) * size * 0.9, by + Math.sin(a) * size * 0.9, size * 0.14, z, 0.07, mat));
  }
  // thumb toward the body's midline
  return out;
}

/** A head seen from above, face toward +x: skull, ears, brow, nose, hair over the crown. */
export function head(x: number, y: number, r: number, skin: Mat, hair: number, hairDir = 0, z = 0.95): Prim[] {
  return [
    ell(x - r * 0.05, y - r * 0.93, r * 0.16, r * 0.1, z - 0.08, 0.06, skin),
    ell(x - r * 0.05, y + r * 0.93, r * 0.16, r * 0.1, z - 0.08, 0.06, skin),
    ell(x + r * 0.88, y, r * 0.16, r * 0.12, z - 0.02, 0.1, skin),
    ell(x, y, r, r * 0.9, z, 0.3, skin),
    ...(hair > 0 ? [ell(x - r * (1 - hair) * 0.55, y, r * (0.55 + hair * 0.45), r * 0.88, z + 0.03, 0.3, "hair" as Mat, { fold: hairDir, torn: 0.12 })] : []),
  ];
}

