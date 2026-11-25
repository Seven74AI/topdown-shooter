/**
 * Characters, take 3 (designer 2026-11-25: "use [the Meshy pictures] as reference … a take 3, in game code,
 * photorealistic"). Game code only (Canvas 2D, like all the game's art); the four Meshy pictures in
 * ../refs are the target look: a cool key light from the upper left with deep soft shadows, cloth that
 * folds across the limbs and tears at the edges, spread fingers, detailed hair, muted colours. Unlike the
 * pictures (seen at an angle), these are strictly top-down, as the game's sprites must be.
 *
 * Engine: rounded body parts (ellipsoids, capsules) meeting as volumes, with torn edges, anisotropic folds,
 * regions for lettering and stitching, lit with a cool key and a dark ambient. 68 px per body radius (2× the
 * game's), 3× supersampled.
 */
import { drawSurvivor, drawZombie } from "../../../../apps/client/src/render/city/spriteArt";
import { WEAPON_ART } from "../../../../apps/client/src/render/city/weaponArt";
import { asphalt, canvas, ctx, fbm, hash2, night, rng, type G } from "../../asset-fixes-1/src/lib";
import { cl, mix, render, type Rgb } from "../../photoreal-1/src/relief";

declare const REFS: Record<string, string>; // the Meshy reference pictures (data URLs), injected by build.mjs

const TAU = Math.PI * 2;
const R = 68;

type Mat = "skin" | "zskin" | "cloth" | "hair" | "metal" | "wood" | "plastic" | "strap" | "wound" | "nail";

interface PrimBase {
  z: number;
  t: number;
  mat: Mat;
  col?: Rgb;
  /** Torn edge: how ragged (0 clean … 0.3 very). */
  torn?: number;
  /** Fold direction (radians) for cloth; defaults to across the part. */
  fold?: number;
}
interface Ell extends PrimBase {
  kind: "ell";
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
}
interface Cap extends PrimBase {
  kind: "cap";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}
type Prim = Ell | Cap;

const ell = (x: number, y: number, rx: number, ry: number, z: number, t: number, mat: Mat, o: Partial<PrimBase> & { rot?: number } = {}): Ell => ({ kind: "ell", x, y, rx, ry, z, t, mat, rot: o.rot ?? 0, ...o });
const cap = (x0: number, y0: number, x1: number, y1: number, r: number, z: number, t: number, mat: Mat, o: Partial<PrimBase> = {}): Cap => ({ kind: "cap", x0, y0, x1, y1, r, z, t, mat, ...o });

/** Height of a part at (x, y) (body radii), or -1 outside; also returns the coordinate along the part (0–1). */
function primAt(p: Prim, x: number, y: number, out: { along: number; edge: number }): number {
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

function drawPrim(g: G, p: Prim): void {
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

interface Look {
  skin: Rgb;
  cloth: Rgb;
  hair: Rgb;
  /** Where blood soaks the cloth (0 none … 1 heavy) and a seed. */
  blood: number;
  seed: number;
}

interface Figure {
  prims: Prim[];
  extent: number;
  look: Look;
  /** Lit lettering, stitching, zips, buckles: white-filled shapes in body radii × R, centred. */
  regions?: Record<string, (g: G) => void>;
  albedo?: (rx: number, ry: number, base: Rgb, region: Record<string, number>) => Rgb;
}

const COOL: Rgb = [0.86, 0.95, 1.14];
const AMB: Rgb = [0.13, 0.145, 0.2];

function build(f: Figure): HTMLCanvasElement {
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
  return render({
    w: N,
    h: N,
    ss: 3,
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
          if (fbm(rx * 3, ry * 3, L.seed + 8, 3) > 0.6) c = mix(c, [70, 62, 84], 0.45); // bruising
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
      if (m === "plastic" || m === "metal") return 0.9;
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
}

// ─────────────────────────────── parts ───────────────────────────────

/** A hand at the end of an arm (pointing `dir`), with `n` spread fingers. */
function hand(x: number, y: number, dir: number, size: number, mat: Mat, spread: number, z = 0.34): Prim[] {
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
function head(x: number, y: number, r: number, skin: Mat, hair: number, hairDir = 0, z = 0.95): Prim[] {
  return [
    ell(x - r * 0.05, y - r * 0.93, r * 0.16, r * 0.1, z - 0.08, 0.06, skin),
    ell(x - r * 0.05, y + r * 0.93, r * 0.16, r * 0.1, z - 0.08, 0.06, skin),
    ell(x + r * 0.88, y, r * 0.16, r * 0.12, z - 0.02, 0.1, skin),
    ell(x, y, r, r * 0.9, z, 0.3, skin),
    ...(hair > 0 ? [ell(x - r * (1 - hair) * 0.55, y, r * (0.55 + hair * 0.45), r * 0.88, z + 0.03, 0.3, "hair" as Mat, { fold: hairDir, torn: 0.12 })] : []),
  ];
}

// ─────────────────────────────── the four characters ───────────────────────────────

/** Walker (Meshy ref "zombie_walker"): torn blue-grey work shirt, bloody shoulders, grey-green arms reaching, matted hair. */
function walker(): HTMLCanvasElement {
  const shirt: Rgb = [84, 96, 112];
  const look: Look = { skin: [128, 140, 118], cloth: shirt, hair: [44, 38, 30], blood: 0.9, seed: 301 };
  const prims: Prim[] = [
    ell(-0.2, 0, 0.52, 0.98, 0.32, 0.3, "cloth", { torn: 0.25, fold: Math.PI / 2 }), // back and shoulders, torn hem
    cap(0.0, -0.66, 0.5, -0.7, 0.19, 0.34, 0.18, "cloth", { torn: 0.35 }), // ragged sleeves
    cap(0.0, 0.66, 0.55, 0.62, 0.19, 0.34, 0.18, "cloth", { torn: 0.35 }),
    cap(0.48, -0.7, 1.12, -0.6, 0.12, 0.32, 0.13, "zskin"), // bare forearms
    cap(0.53, 0.62, 1.18, 0.68, 0.12, 0.32, 0.13, "zskin"),
    ...hand(1.2, -0.6, 0.12, 0.2, "zskin", 0.22),
    ...hand(1.26, 0.68, -0.08, 0.2, "zskin", 0.25),
    ell(-0.05, -0.55, 0.09, 0.12, 0.6, 0.02, "wound", { torn: 0.3 }), // bite wounds on the shoulders
    ell(-0.15, 0.5, 0.07, 0.09, 0.6, 0.02, "wound", { torn: 0.3 }),
    ...head(0.14, 0, 0.44, "zskin", 0.75, 0.3),
  ];
  return build({ prims, extent: 1.55, look });
}

/** Brute BR1 (Meshy ref "zombie_brute"): black riot armour, segmented shoulder pads, POLICE plate, gloved fists, cracked helmet. */
function brute(): HTMLCanvasElement {
  const look: Look = { skin: [118, 124, 104], cloth: [32, 34, 38], hair: [20, 20, 20], blood: 0.35, seed: 311 };
  const armour: Rgb = [26, 27, 31];
  const pads: Prim[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) pads.push(ell(0.06 - k * 0.11, s * (0.93 + k * 0.03), 0.3 - k * 0.05, 0.27 - k * 0.04, 0.5 + k * 0.07, 0.08, "plastic", { col: armour })); // layered shoulder pads
  const prims: Prim[] = [
    cap(0.0, -0.8, 0.82, -0.72, 0.22, 0.36, 0.22, "cloth", { fold: 0.2 }), // black padded sleeves
    cap(0.0, 0.8, 0.82, 0.72, 0.22, 0.36, 0.22, "cloth", { fold: -0.2 }),
    ell(0.45, -0.77, 0.15, 0.21, 0.56, 0.1, "plastic", { col: armour }), // elbow guards
    ell(0.45, 0.77, 0.15, 0.21, 0.56, 0.1, "plastic", { col: armour }),
    ell(1.05, -0.7, 0.27, 0.24, 0.38, 0.26, "plastic", { col: [30, 30, 32] }), // gloved fists
    ell(1.05, 0.7, 0.27, 0.24, 0.38, 0.26, "plastic", { col: [30, 30, 32] }),
    ell(-0.2, 0, 0.62, 1.08, 0.38, 0.34, "cloth"),
    ell(-0.3, 0, 0.5, 0.84, 0.58, 0.22, "plastic", { col: [36, 38, 42] }), // back plate
    ...pads,
    ...head(0.22, 0, 0.37, "zskin", 0),
    ell(0.16, 0, 0.44, 0.42, 1.12, 0.26, "plastic", { col: [18, 19, 22] }), // helmet
    ell(0.55, 0, 0.1, 0.32, 1.1, 0.12, "metal", { col: [60, 74, 90] }), // visor
  ];
  return build({
    prims,
    extent: 1.5,
    look,
    regions: {
      letters: (g) => {
        g.save();
        g.translate(-0.3 * R, 0);
        g.rotate(Math.PI / 2);
        g.font = `700 ${Math.round(0.26 * R)}px Oswald, Impact, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("POLICE", 0, 0);
        g.restore();
      },
      plate: (g) => {
        g.save();
        g.translate(-0.3 * R, 0);
        g.fillRect(-0.17 * R, -0.5 * R, 0.34 * R, 1.0 * R);
        g.restore();
      },
      crack: (g) => {
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(0.05 * R, -0.3 * R);
        g.lineTo(0.15 * R, -0.12 * R);
        g.lineTo(0.08 * R, 0.02 * R);
        g.lineTo(0.2 * R, 0.15 * R);
        g.stroke();
      },
    },
    albedo: (rx, ry, c, r) => {
      if ((r.letters ?? 0) > 0.5) return mix([176, 178, 182], [120, 122, 126], cl(fbm(rx * 30, ry * 30, 5, 2) - 0.3)); // worn print
      if ((r.plate ?? 0) > 0.5) c = mix(c, [58, 60, 64], 0.6); // the badge plate
      if ((r.crack ?? 0) > 0.5) c = [110, 116, 124];
      return c;
    },
  });
}

/** Survivor (Meshy ref "survivor_pistol"): blue jacket, dark baseball cap, small dark backpack, pistol in both hands. */
function survivorPistol(): HTMLCanvasElement {
  const look: Look = { skin: [196, 152, 120], cloth: [56, 84, 120], hair: [50, 36, 24], blood: 0, seed: 321 };
  const prims: Prim[] = [
    ell(-0.62, 0, 0.32, 0.6, 0.42, 0.3, "cloth", { col: [36, 36, 34], fold: Math.PI / 2 }), // backpack
    cap(-0.45, -0.55, 0.1, -0.6, 0.06, 0.62, 0.04, "strap"), // its straps over the shoulders
    cap(-0.45, 0.55, 0.1, 0.6, 0.06, 0.62, 0.04, "strap"),
    ell(-0.1, 0, 0.52, 0.96, 0.34, 0.3, "cloth", { fold: Math.PI / 2 }), // jacket
    cap(0.05, -0.68, 0.6, -0.34, 0.17, 0.34, 0.16, "cloth"), // arms to the grip
    cap(0.05, 0.68, 0.56, 0.4, 0.17, 0.34, 0.16, "cloth"),
    cap(0.6, -0.34, 0.95, -0.06, 0.11, 0.36, 0.11, "skin"),
    cap(0.56, 0.4, 0.92, 0.1, 0.11, 0.36, 0.11, "skin"),
    ell(1.15, 0.02, 0.24, 0.07, 0.46, 0.07, "metal"), // pistol
    ell(0.98, 0.02, 0.13, 0.15, 0.46, 0.1, "skin"), // hands wrapped round the grip
    ...head(0.08, 0, 0.43, "skin", 0.5, 0),
    ell(0.04, 0, 0.45, 0.43, 1.05, 0.22, "cloth", { col: [30, 34, 38] }), // cap crown
    ell(0.5, 0, 0.21, 0.35, 0.99, 0.06, "cloth", { col: [30, 34, 38] }), // brim
  ];
  return build({
    prims,
    extent: 2.7,
    look,
    regions: {
      seams: (g) => {
        g.lineWidth = 1;
        g.beginPath();
        for (const a of [0.5, 1.6, 2.6]) {
          g.moveTo(0.04 * R, 0);
          g.lineTo(0.04 * R + Math.cos(a + Math.PI) * 0.43 * R, Math.sin(a + Math.PI) * 0.43 * R);
        }
        g.stroke();
      },
      button: (g) => {
        g.beginPath();
        g.arc(0.04 * R, 0, 0.05 * R, 0, TAU);
        g.fill();
      },
      buckle: (g) => [-1, 1].forEach((s) => g.fillRect(-0.36 * R, s * 0.56 * R - 2, 6, 5)),
    },
    albedo: (_rx, _ry, c, r) => {
      if ((r.button ?? 0) > 0.5) return [36, 40, 44];
      if ((r.seams ?? 0) > 0.5) return mix(c, [12, 14, 16], 0.5);
      if ((r.buckle ?? 0) > 0.5) return [120, 122, 126];
      return c;
    },
  });
}

/** Survivor (Meshy ref "survivor_shotgun"): olive field jacket, ponytail, backpack, pump shotgun. */
function survivorShotgun(): HTMLCanvasElement {
  const look: Look = { skin: [200, 158, 126], cloth: [86, 88, 58], hair: [92, 66, 40], blood: 0, seed: 331 };
  const prims: Prim[] = [
    ell(-0.62, 0.02, 0.34, 0.62, 0.42, 0.3, "cloth", { col: [70, 62, 44], fold: Math.PI / 2 }), // backpack
    cap(-0.45, -0.55, 0.1, -0.6, 0.06, 0.62, 0.04, "strap"),
    cap(-0.45, 0.55, 0.1, 0.6, 0.06, 0.62, 0.04, "strap"),
    ell(-0.1, 0, 0.5, 0.92, 0.34, 0.3, "cloth", { fold: Math.PI / 2 }), // field jacket
    cap(0.05, -0.64, 0.62, -0.28, 0.16, 0.34, 0.15, "cloth"),
    cap(0.05, 0.64, 0.5, 0.36, 0.16, 0.34, 0.15, "cloth"),
    cap(0.62, -0.28, 1.2, 0.06, 0.1, 0.38, 0.1, "skin"), // left hand forward on the pump
    cap(0.5, 0.36, 0.72, 0.16, 0.1, 0.38, 0.1, "skin"), // right hand at the grip
    cap(0.3, 0.17, 0.78, 0.14, 0.1, 0.42, 0.08, "wood"), // stock against the shoulder
    cap(0.6, 0.12, 2.2, 0.06, 0.055, 0.45, 0.05, "metal"), // barrel and magazine tube
    cap(1.1, 0.1, 1.55, 0.08, 0.08, 0.45, 0.07, "wood"), // pump
    ell(1.22, 0.06, 0.12, 0.11, 0.5, 0.09, "skin"),
    ell(0.72, 0.16, 0.11, 0.11, 0.5, 0.09, "skin"),
    ...head(0.08, 0, 0.41, "skin", 0.85, 0),
    cap(-0.32, 0, -0.88, 0.05, 0.11, 1.0, 0.12, "hair", { fold: 0 }), // the ponytail down the back
    ell(-0.3, 0, 0.07, 0.1, 1.08, 0.06, "strap", { col: [20, 20, 20] }), // its band
  ];
  return build({
    prims,
    extent: 2.7,
    look,
    regions: {
      zip: (g) => {
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(0.35 * R, -0.05 * R);
        g.lineTo(0.38 * R, 0.4 * R);
        g.stroke();
      },
      pockets: (g) => {
        g.lineWidth = 1;
        for (const s of [-1, 1]) g.strokeRect(-0.25 * R, s * 0.6 * R - 0.12 * R, 0.24 * R, 0.24 * R);
      },
    },
    albedo: (_rx, _ry, c, r) => {
      if ((r.zip ?? 0) > 0.5) return [40, 40, 36];
      if ((r.pockets ?? 0) > 0.5) return mix(c, [20, 20, 16], 0.5);
      return c;
    },
  });
}

// ─────────────────────────────── page ───────────────────────────────

const R_NOW = R;
function nowFigure(extent: number, draw: (g: G, r: number) => void): HTMLCanvasElement {
  const N = Math.ceil(2 * extent * R_NOW);
  const c = canvas(N, N);
  const g = ctx(c);
  g.translate(N / 2, N / 2);
  draw(g, R_NOW);
  return c;
}

function onStreet(obj: HTMLCanvasElement, size: number, zoom = 0.9): HTMLCanvasElement {
  const c = canvas(size, size);
  const g = ctx(c);
  asphalt(g, size, size, 5);
  night(g, size, size, 0.3, [[size * 0.05, size * 0.05, size * 0.9]]); // the street at night, lit from the upper left
  const s = (size * zoom) / obj.width;
  const off = (size - obj.width * s) / 2;
  g.save();
  g.globalAlpha = 0.6;
  g.filter = "blur(6px) brightness(0)";
  g.drawImage(obj, off + 10, off + 15, obj.width * s, obj.height * s);
  g.restore();
  g.drawImage(obj, off, off, obj.width * s, obj.height * s);
  return c;
}

const ITEMS = [
  { ref: "zombie_walker", name: "Walker", make: walker, now: () => nowFigure(1.55, (g, r) => drawZombie(g, "walker", r, 0)), zoom: 0.9 },
  { ref: "zombie_brute", name: "Brute (riot cop)", make: brute, now: () => nowFigure(1.5, (g, r) => drawZombie(g, "brute", r, 0)), zoom: 0.9 },
  { ref: "survivor_pistol", name: "Survivor (pistol)", make: survivorPistol, now: () => nowFigure(2.7, (g, r) => drawSurvivor(g, r)), zoom: 1.5 },
  { ref: "survivor_shotgun", name: "Survivor (shotgun)", make: survivorShotgun, now: () => nowFigure(2.7, (g, r) => drawSurvivor(g, r, (c, rr) => WEAPON_ART.shotgun?.(c, "held", rr))), zoom: 1.5 },
];

async function main(): Promise<void> {
  try {
    await document.fonts.load('700 20px "Oswald"');
  } catch {
    // fallback face
  }
  const list = document.getElementById("list") as HTMLElement;
  for (const it of ITEMS) {
    const row = document.createElement("article");
    row.className = "trio";
    row.innerHTML = `<h3>${it.name}</h3><div class="cols"><figure><img alt="Meshy reference" src="${REFS[it.ref]}"><figcaption>Meshy reference</figcaption></figure><figure><figcaption>Now</figcaption></figure><figure><figcaption>Take 3</figcaption></figure></div>`;
    const figs = row.querySelectorAll("figure");
    (figs[1] as HTMLElement).prepend(onStreet(it.now(), 300, it.zoom));
    (figs[2] as HTMLElement).prepend(onStreet(it.make(), 300, it.zoom));
    list.append(row);
    await new Promise((res) => setTimeout(res, 0));
  }
  document.getElementById("loading")?.remove();
  void hash2;
  void rng;
}

void main();
