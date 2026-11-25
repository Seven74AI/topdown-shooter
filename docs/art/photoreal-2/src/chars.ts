/**
 * Photoreal rollout, group 2: zombies and survivors (designer, 2026-11-25: "roll the style out to the next
 * group"; zombies and survivors first: most on screen). One of each kind first (the survivor with a pistol
 * and with the shotgun, walker, runner, crawler, spitter, Brute, Bloater); the variants follow once the style
 * is approved. Each figure is built from rounded body parts (ellipsoids and capsules) whose heights meet
 * like real volumes, lit by the street light, with skin (bruises, veins, wounds), cloth (folds, stains, wet
 * blood), hair and metal. Drawn at twice the game's character resolution (68 px per body radius), 3×
 * supersampled. Facing +x like the game's frames. Built into ../compare.html by build.mjs.
 */
import { drawSurvivor, drawZombie } from "../../../../apps/client/src/render/city/spriteArt";
import { WEAPON_ART } from "../../../../apps/client/src/render/city/weaponArt";
import { asphalt, canvas, ctx, fbm, hash2, night, rng, type G } from "../../asset-fixes-1/src/lib";
import { cl, mix, render, type Rgb } from "../../photoreal-1/src/relief";

declare const CURRENT: Record<string, string>; // today's frames (data URLs), injected by build.mjs

const TAU = Math.PI * 2;
const R = 68; // px per body radius (the game uses 34: these are drawn at twice that)
const SS = 3;

type Mat = "skin" | "zskin" | "cloth" | "cloth2" | "hair" | "metal" | "wood" | "rubber" | "acid" | "pack" | "cap" | "wound" | "plastic" | "shirt";

interface Ell {
  kind: "ell";
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot?: number;
  z: number; // base height
  t: number; // thickness (dome height)
  mat: Mat;
  seed?: number;
  /** Colour override for cloth-like materials. */
  col?: Rgb;
}
interface Cap {
  kind: "cap";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  z: number;
  t: number;
  mat: Mat;
  col?: Rgb;
}
type Prim = Ell | Cap;

/** Height and local coords of a primitive at (x, y) (in body radii from the centre); -1 outside. */
function primAt(p: Prim, x: number, y: number): number {
  if (p.kind === "ell") {
    const c = Math.cos(-(p.rot ?? 0));
    const s = Math.sin(-(p.rot ?? 0));
    const dx = x - p.x;
    const dy = y - p.y;
    const u = (dx * c - dy * s) / p.rx;
    const v = (dx * s + dy * c) / p.ry;
    const d = u * u + v * v;
    return d < 1 ? p.z + p.t * Math.sqrt(1 - d) : -1;
  }
  const vx = p.x1 - p.x0;
  const vy = p.y1 - p.y0;
  const len2 = vx * vx + vy * vy;
  const k = Math.max(0, Math.min(1, ((x - p.x0) * vx + (y - p.y0) * vy) / len2));
  const d = Math.hypot(x - (p.x0 + vx * k), y - (p.y0 + vy * k)) / p.r;
  return d < 1 ? p.z + p.t * Math.sqrt(1 - d * d) : -1;
}

function drawPrim(g: G, p: Prim): void {
  g.beginPath();
  if (p.kind === "ell") g.ellipse(p.x * R, p.y * R, p.rx * R, p.ry * R, p.rot ?? 0, 0, TAU);
  else {
    g.lineWidth = 2 * p.r * R;
    g.lineCap = "round";
    g.moveTo(p.x0 * R, p.y0 * R);
    g.lineTo(p.x1 * R, p.y1 * R);
    g.stroke();
    return;
  }
  g.fill();
}

interface Look {
  skin: Rgb;
  cloth: Rgb;
  cloth2: Rgb;
  hair: Rgb;
  blood: number; // 0–1 how bloodied
  seed: number;
}

/** Renders a figure: `prims` in body radii, `extent` = frame half-size in radii. */
function figure(prims: Prim[], extent: number, look: Look, extras?: (g: G) => void): HTMLCanvasElement {
  const N = Math.ceil(2 * extent * R);
  const top = (x: number, y: number): [Prim | null, number] => {
    let best: Prim | null = null;
    let hb = -1;
    for (const p of prims) {
      const h = primAt(p, x, y);
      if (h > hb) {
        hb = h;
        best = p;
      }
    }
    return [best, hb];
  };
  const toR = (x: number): number => (x - N / 2) / R;
  const tex = render({
    w: N,
    h: N,
    ss: SS,
    edgeAO: 0.3,
    layers: [{ draw: (g) => prims.forEach((p) => drawPrim(g, p)), blur: 0, amount: 0 }],
    detail: 0.01,
    grain: 3,
    heightAt: (x, y) => {
      const rx = toR(x);
      const ry = toR(y);
      const [p, h] = top(rx, ry);
      if (!p) return 0;
      // cloth folds and creases, skin pores, hair strands
      let d = 0;
      if (p.mat === "cloth" || p.mat === "cloth2" || p.mat === "pack") d = Math.sin(ry * 22 + fbm(rx * 3, ry * 3, look.seed, 2) * 6) * 0.012 + (fbm(rx * 8, ry * 8, look.seed + 1, 3) - 0.5) * 0.03;
      else if (p.mat === "hair") d = (fbm(rx * 4, ry * 30, look.seed + 2, 3) - 0.5) * 0.03 + (fbm(rx * 14, ry * 14, look.seed + 12, 2) - 0.5) * 0.015;
      else if (p.mat === "shirt") d = Math.sin(rx * 18 + fbm(rx * 2, ry * 2, look.seed, 2) * 5) * 0.01 + (fbm(rx * 6, ry * 6, look.seed + 1, 3) - 0.5) * 0.02;
      else if (p.mat === "skin" || p.mat === "zskin") d = (fbm(rx * 12, ry * 12, look.seed + 3, 3) - 0.5) * 0.015;
      return h * 0.55 + d;
    },
    albedo: (x, y, s) => {
      const rx = toR(x);
      const ry = toR(y);
      const [p] = top(rx, ry);
      const m = p?.mat ?? "cloth";
      const n = fbm(rx * 5, ry * 5, look.seed + 4, 4);
      let c: Rgb;
      switch (m) {
        case "skin":
          c = mix(look.skin, mix(look.skin, [255, 220, 200], 0.25), n);
          break;
        case "zskin": {
          c = mix(look.skin, mix(look.skin, [200, 205, 190], 0.25), n);
          const bruise = fbm(rx * 3, ry * 3, look.seed + 5, 3);
          if (bruise > 0.6) c = mix(c, [72, 64, 86], cl((bruise - 0.6) * 3)); // bruises
          if (Math.abs(fbm(rx * 9, ry * 9, look.seed + 6, 2) - 0.5) < 0.012) c = mix(c, [60, 70, 90], 0.5); // veins
          break;
        }
        case "cloth":
        case "cloth2": {
          const base = p?.col ?? (m === "cloth" ? look.cloth : look.cloth2);
          c = mix(mix(base, [20, 18, 16], 0.25), mix(base, [255, 255, 255], 0.08), n);
          if ((Math.floor(x * 1.5) + Math.floor(y * 1.5)) % 2 === 0) c = mix(c, [0, 0, 0], 0.05); // weave
          c = mix(c, [64, 56, 46], cl(fbm(rx * 2, ry * 2, look.seed + 7, 3) - 0.55) * 1.2); // grime
          break;
        }
        case "hair": {
          // strands running front to back, clumped and greasy, a few lighter hairs
          const st = fbm(rx * 4, ry * 30, look.seed + 2, 3);
          c = mix(mix(look.hair, [0, 0, 0], 0.35), mix(look.hair, [255, 255, 255], 0.12), st);
          break;
        }
        case "cap":
          c = mix(mix(p?.col ?? [31, 35, 38], [0, 0, 0], 0.2), mix(p?.col ?? [31, 35, 38], [255, 255, 255], 0.1), n);
          break;
        case "pack":
          c = mix(mix(p?.col ?? [38, 37, 31], [0, 0, 0], 0.2), mix(p?.col ?? [38, 37, 31], [255, 255, 255], 0.12), n);
          break;
        case "plastic":
          c = mix(p?.col ?? [22, 23, 26], [44, 46, 50], n * 0.6);
          break;
        case "shirt": {
          const base = p?.col ?? [200, 198, 188];
          c = mix(mix(base, [120, 116, 104], 0.3), base, n);
          c = mix(c, [150, 140, 100], cl(fbm(rx * 3, ry * 3, look.seed + 13, 3) - 0.55) * 1.2); // sweat and grime stains
          break;
        }
        case "metal":
          c = mix([34, 36, 40], [72, 76, 82], n);
          break;
        case "wood":
          c = mix([82, 50, 28], [124, 80, 46], cl(Math.sin(rx * 40 + n * 4) * 0.5 + 0.5));
          break;
        case "rubber":
          c = [26, 26, 28];
          break;
        case "acid":
          c = mix([110, 170, 30], [200, 240, 80], n);
          break;
        case "wound":
          c = mix([70, 6, 8], [140, 18, 16], n);
          break;
      }
      // blood: dried stains on cloth and skin, fresh near the mouth and hands for the dead
      if (look.blood > 0 && m !== "metal" && m !== "wood" && m !== "acid") {
        const b = fbm(rx * 4, ry * 4, look.seed + 8, 4);
        if (b > 0.68 - look.blood * 0.12) c = mix(c, [86, 12, 12], cl((b - (0.68 - look.blood * 0.12)) * 4) * 0.85);
      }
      return mix(c, [16, 12, 10], cl(s.cav));
    },
    spec: (x, y) => {
      const [p] = top(toR(x), toR(y));
      const m = p?.mat;
      if (m === "metal" || m === "plastic") return 0.8;
      if (m === "acid" || m === "wound") return 0.9;
      if (m === "zskin") return 0.25 + 0.3 * (fbm(toR(x) * 4, toR(y) * 4, look.seed + 9, 2) > 0.6 ? 1 : 0); // clammy
      if (m === "skin") return 0.2;
      if (m === "hair") return 0.25;
      return 0.06;
    },
    seed: look.seed,
  });
  if (!extras) return tex;
  const c = canvas(N, N);
  const g = ctx(c);
  g.drawImage(tex, 0, 0);
  g.save();
  g.translate(N / 2, N / 2);
  extras(g);
  g.restore();
  return c;
}

// ─────────────────────────────── the figures ───────────────────────────────

const ell = (x: number, y: number, rx: number, ry: number, z: number, t: number, mat: Mat, rot = 0): Ell => ({ kind: "ell", x, y, rx, ry, z, t, mat, rot });
const cap = (x0: number, y0: number, x1: number, y1: number, r: number, z: number, t: number, mat: Mat): Cap => ({ kind: "cap", x0, y0, x1, y1, r, z, t, mat });

/** A head seen from above (+x is the face): skull, ears, nose tip, hair over the crown and back. */
function head(x: number, y: number, r: number, skin: Mat, hairCover: number, z = 0.95): Prim[] {
  return [
    ell(x, y - r * 0.95, r * 0.18, r * 0.12, z - 0.1, 0.08, skin), // ears
    ell(x, y + r * 0.95, r * 0.18, r * 0.12, z - 0.1, 0.08, skin),
    ell(x + r * 0.9, y, r * 0.18, r * 0.14, z - 0.05, 0.12, skin), // nose
    ell(x, y, r * 1.0, r * 0.92, z, 0.3, skin),
    ...(hairCover > 0 ? [ell(x - r * (1 - hairCover) * 0.6, y, r * (0.5 + hairCover * 0.45), r * 0.86, z + 0.02, 0.3, "hair" as Mat)] : []),
  ];
}

const hx = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** The game's character palette (spriteArt.ts CHAR), so each figure keeps its colours. */
const PAL = {
  skin: hx("#7c8676"),
  runnerSkin: hx("#a99c84"),
  crawlerSkin: hx("#5d6658"),
  hair: hx("#231f1c"),
  walkerShirt: hx("#454c5a"),
  runnerShirt: hx("#6e2a24"),
  crawlerShirt: hx("#2c3328"),
  jacket: hx("#3c5670"),
  pack: hx("#26251f"),
  cap: hx("#1f2326"),
  survivorSkin: hx("#c49a7c"),
};

const withCol = <T extends Prim>(p: T, col: Rgb): T => ({ ...p, col });

function walker(): HTMLCanvasElement {
  const look: Look = { skin: PAL.skin, cloth: PAL.walkerShirt, cloth2: PAL.walkerShirt, hair: PAL.hair, blood: 0.8, seed: 11 };
  const prims: Prim[] = [
    ell(-0.15, 0, 0.5, 0.95, 0.35, 0.3, "cloth"), // shoulders and back in a torn shirt
    cap(0.05, -0.62, 0.5, -0.66, 0.17, 0.35, 0.18, "cloth"), // sleeves
    cap(0.05, 0.62, 0.55, 0.6, 0.17, 0.35, 0.18, "cloth"),
    cap(0.5, -0.66, 1.18, -0.6, 0.13, 0.33, 0.15, "zskin"), // bare forearms reaching forward
    cap(0.55, 0.6, 1.25, 0.66, 0.13, 0.33, 0.15, "zskin"),
    ell(1.28, -0.6, 0.17, 0.13, 0.33, 0.14, "zskin"),
    ell(1.35, 0.67, 0.17, 0.13, 0.33, 0.14, "zskin"),
    ell(-0.25, 0.55, 0.14, 0.18, 0.62, 0.06, "wound"), // a bite through the shirt
    ...head(0.14, 0, 0.46, "zskin", 0.55),
  ];
  return figure(prims, 1.55, look);
}

function runner(): HTMLCanvasElement {
  const look: Look = { skin: PAL.runnerSkin, cloth: PAL.runnerShirt, cloth2: PAL.runnerShirt, hair: PAL.hair, blood: 0.6, seed: 23 };
  const prims: Prim[] = [
    ell(-0.1, 0, 0.42, 0.8, 0.35, 0.28, "cloth", 0.12),
    cap(0, -0.55, 0.85, -0.8, 0.14, 0.33, 0.15, "zskin"), // one arm forward
    cap(0, 0.55, -0.85, 0.8, 0.14, 0.33, 0.15, "zskin"), // one swept back
    ell(0.92, -0.82, 0.15, 0.12, 0.33, 0.12, "zskin"),
    ell(-0.92, 0.82, 0.15, 0.12, 0.33, 0.12, "zskin"),
    ...head(0.42, 0, 0.4, "zskin", 0.7),
  ];
  return figure(prims, 1.5, look);
}

function crawler(): HTMLCanvasElement {
  const look: Look = { skin: PAL.crawlerSkin, cloth: PAL.crawlerShirt, cloth2: PAL.crawlerShirt, hair: PAL.hair, blood: 1, seed: 37 };
  const prims: Prim[] = [
    ell(-1.25, 0, 0.32, 0.4, 0, 0.04, "wound"), // the blood it drags
    ell(-0.5, 0, 0.95, 0.55, 0.15, 0.25, "cloth"), // body flat on the ground
    cap(0.15, -0.45, 0.9, -1.05, 0.14, 0.18, 0.13, "zskin"), // arms clawing forward, spread
    cap(0.15, 0.45, 0.95, 1.0, 0.14, 0.18, 0.13, "zskin"),
    ell(0.98, -1.12, 0.16, 0.13, 0.18, 0.1, "zskin"),
    ell(1.03, 1.07, 0.16, 0.13, 0.18, 0.1, "zskin"),
    ...head(0.55, 0, 0.42, "zskin", 0.45, 0.6),
  ];
  return figure(prims, 1.75, look);
}

/** P4 "gaunt": a thin grey body crouched forward, knees out, glowing acid sacs on the back and shoulders. */
function spitter(): HTMLCanvasElement {
  const look: Look = { skin: [128, 132, 118], cloth: [52, 50, 48], cloth2: [40, 38, 36], hair: PAL.hair, blood: 0.2, seed: 51 };
  const r = rng(51);
  const sacs: Prim[] = [];
  for (let i = 0; i < 18; i++) {
    const a = r() * TAU;
    const d = r() * 0.75;
    sacs.push(ell(-0.25 + Math.cos(a) * d * 0.55, Math.sin(a) * d * 0.95, 0.06 + r() * 0.08, 0.06 + r() * 0.08, 0.55, 0.08 + r() * 0.06, "acid"));
  }
  const prims: Prim[] = [
    ell(-1.5, 0.15, 0.12, 0.09, 0, 0.03, "acid"), // the drops it leaves
    ell(-1.85, -0.1, 0.1, 0.07, 0, 0.03, "acid"),
    cap(-0.4, -0.45, -0.95, -0.85, 0.12, 0.15, 0.12, "cloth"), // crouched legs in torn trousers, knees out
    cap(-0.4, 0.45, -0.95, 0.85, 0.12, 0.15, 0.12, "cloth"),
    ell(-1.02, -0.9, 0.14, 0.1, 0.12, 0.1, "zskin"), // bare feet
    ell(-1.02, 0.9, 0.14, 0.1, 0.12, 0.1, "zskin"),
    ell(-0.25, 0, 0.55, 0.85, 0.3, 0.28, "zskin"), // the gaunt bare back
    cap(0.1, -0.7, 0.85, -0.85, 0.09, 0.3, 0.1, "zskin"), // thin arms, long fingers
    cap(0.1, 0.7, 0.85, 0.85, 0.09, 0.3, 0.1, "zskin"),
    ell(0.95, -0.88, 0.13, 0.08, 0.3, 0.08, "zskin"),
    ell(0.95, 0.88, 0.13, 0.08, 0.3, 0.08, "zskin"),
    ...sacs,
    ...head(0.45, 0, 0.36, "zskin", 0.15),
    ell(0.88, 0, 0.18, 0.2, 0.75, 0.08, "acid"), // the open, dripping mouth
    ell(1.25, 0.05, 0.16, 0.1, 0.05, 0.04, "acid"),
  ];
  return figure(prims, 2.35, look, (g) => {
    g.globalCompositeOperation = "lighter";
    for (const [x, y, rr] of [
      [0.9, 0, 0.6],
      [-0.25, 0, 0.9],
    ] as const) {
      const gr = g.createRadialGradient(x * R, y * R, 0, x * R, y * R, rr * R);
      gr.addColorStop(0, "rgba(150,255,50,0.22)");
      gr.addColorStop(1, "rgba(150,255,50,0)");
      g.fillStyle = gr;
      g.fillRect((x - rr) * R, (y - rr) * R, 2 * rr * R, 2 * rr * R);
    }
  });
}

/** BR1 riot cop: black body armour with a POLICE back plate, round shoulder pads, gloves, a helmet. */
function brute(): HTMLCanvasElement {
  const look: Look = { skin: [118, 124, 104], cloth: [36, 38, 42], cloth2: [28, 30, 34], hair: PAL.hair, blood: 0.5, seed: 67 };
  const black: Rgb = [24, 25, 28];
  const prims: Prim[] = [
    cap(0.0, -0.78, 0.85, -0.72, 0.22, 0.38, 0.22, "cloth"), // arms in black sleeves
    cap(0.0, 0.78, 0.85, 0.72, 0.22, 0.38, 0.22, "cloth"),
    ell(0.45, -0.76, 0.16, 0.2, 0.55, 0.1, "plastic"), // elbow pads
    ell(0.45, 0.76, 0.16, 0.2, 0.55, 0.1, "plastic"),
    ell(1.05, -0.7, 0.26, 0.23, 0.4, 0.24, "plastic"), // gloved fists
    ell(1.05, 0.7, 0.26, 0.23, 0.4, 0.24, "plastic"),
    ell(-0.2, 0, 0.6, 1.08, 0.4, 0.35, "cloth"), // the bulk under the armour
    withCol(ell(-0.28, 0, 0.48, 0.82, 0.6, 0.22, "plastic"), [40, 42, 46]), // the vest's back plate
    ell(0.0, -0.95, 0.32, 0.3, 0.55, 0.3, "plastic"), // round shoulder pads
    ell(0.0, 0.95, 0.32, 0.3, 0.55, 0.3, "plastic"),
    ...head(0.22, 0, 0.38, "zskin", 0),
    withCol(ell(0.16, 0, 0.43, 0.41, 1.12, 0.24, "plastic"), black), // helmet
    withCol(ell(0.52, 0, 0.1, 0.3, 1.1, 0.12, "metal"), [70, 82, 94]), // its visor edge
  ];
  return figure(prims, 1.5, look, (g) => {
    // POLICE across the back plate, worn and cracked
    g.save();
    g.translate(-0.3 * R, 0);
    g.rotate(Math.PI / 2);
    g.font = `700 ${Math.round(0.28 * R)}px Oswald, Impact, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(220,222,224,0.82)";
    g.fillText("POLICE", 0, 0);
    g.globalCompositeOperation = "destination-out";
    const r = rng(68);
    for (let i = 0; i < 60; i++) g.fillRect((r() - 0.5) * 0.9 * R, (r() - 0.5) * 0.3 * R, 2, 1);
    g.restore();
  });
}

/** BL1 swollen office worker: a white shirt stretched over the swollen body, buttons popping, a red tie. */
function bloater(): HTMLCanvasElement {
  const look: Look = { skin: [150, 154, 124], cloth: [196, 194, 184], cloth2: [70, 64, 54], hair: [60, 54, 46], blood: 0.25, seed: 79 };
  const r = rng(79);
  const blisters: Prim[] = [];
  for (let i = 0; i < 8; i++) {
    const a = r() * TAU;
    const d = 0.4 + r() * 0.5;
    blisters.push(ell(-0.1 + Math.cos(a) * d, Math.sin(a) * d * 1.1, 0.07 + r() * 0.06, 0.07 + r() * 0.06, 0.7, 0.06, "zskin"));
  }
  const prims: Prim[] = [
    cap(0.5, -0.82, 1.0, -0.95, 0.15, 0.3, 0.16, "shirt"), // sleeves
    cap(0.5, 0.82, 1.0, 0.95, 0.15, 0.3, 0.16, "shirt"),
    ell(1.1, -0.98, 0.2, 0.18, 0.3, 0.16, "zskin"), // puffy hands
    ell(1.1, 0.98, 0.2, 0.18, 0.3, 0.16, "zskin"),
    ell(-0.08, 0, 1.02, 1.15, 0.2, 0.7, "zskin"), // the swollen body
    ell(-0.12, 0, 0.92, 1.05, 0.3, 0.62, "shirt"), // the shirt stretched over it
    ell(0.42, 0.38, 0.26, 0.19, 0.82, 0.1, "zskin"), // skin bulging through a split
    ...blisters,
    withCol(cap(0.62, 0, 0.05, 0.05, 0.07, 0.94, 0.04, "cloth"), [150, 24, 28]), // the red tie hanging over the front
    ...head(0.72, 0, 0.34, "zskin", 0.4, 1.0),
  ];
  return figure(prims, 1.8, look, (g) => {
    g.fillStyle = "rgba(230,228,220,0.9)"; // buttons down the shirt front
    for (const y of [-0.15, 0.0, 0.15, 0.3]) {
      g.beginPath();
      g.arc((0.5 - Math.abs(y) * 0.2) * R, (y - 0.2) * R, 0.03 * R, 0, TAU);
      g.fill();
    }
  });
}

/** The survivor (the default look): blue jacket, backpack, dark cap, both hands on the weapon. */
function survivor(weapon: "pistol" | "shotgun"): HTMLCanvasElement {
  const look: Look = { skin: PAL.survivorSkin, cloth: PAL.jacket, cloth2: PAL.jacket, hair: [52, 38, 26], blood: 0.05, seed: 91 };
  const gun: Prim[] =
    weapon === "pistol"
      ? [ell(1.12, 0.05, 0.22, 0.07, 0.45, 0.07, "metal")]
      : [
          cap(0.55, 0.12, 2.25, 0.08, 0.055, 0.45, 0.05, "metal"), // barrel
          cap(1.15, 0.12, 1.6, 0.11, 0.08, 0.45, 0.07, "wood"), // pump
          cap(0.2, 0.18, 0.75, 0.13, 0.1, 0.42, 0.08, "wood"), // stock against the shoulder
        ];
  const prims: Prim[] = [
    withCol(ell(-0.62, 0, 0.32, 0.62, 0.45, 0.3, "pack"), PAL.pack), // backpack
    withCol(cap(-0.62, -0.5, -0.62, 0.5, 0.06, 0.72, 0.03, "pack"), [60, 58, 50]), // its top strap
    ell(-0.1, 0, 0.5, 0.95, 0.35, 0.32, "cloth"), // jacket over the shoulders
    cap(0.05, -0.66, 0.6, -0.35, 0.16, 0.35, 0.16, "cloth"), // arms bent forward to the grip
    cap(0.05, 0.66, 0.55, 0.42, 0.16, 0.35, 0.16, "cloth"),
    cap(0.6, -0.35, 1.0, -0.02, 0.12, 0.38, 0.12, "skin"),
    cap(0.55, 0.42, 0.95, 0.12, 0.12, 0.38, 0.12, "skin"),
    ...gun,
    ell(1.0, 0, 0.13, 0.13, 0.48, 0.1, "skin"), // hands on the grip
    ...head(0.1, 0, 0.44, "skin", 0.5),
    withCol(ell(0.06, 0, 0.45, 0.43, 1.04, 0.22, "cap"), PAL.cap), // the cap's crown
    withCol(ell(0.5, 0, 0.2, 0.34, 0.98, 0.06, "cap"), PAL.cap), // its brim forward
  ];
  return figure(prims, 2.7, look);
}

// ─────────────────────────────── page ───────────────────────────────

interface Item {
  readonly id: string;
  readonly name: string;
  readonly extent: number;
  make(): HTMLCanvasElement;
  now(r: number): HTMLCanvasElement;
}

/** Today's figure, drawn by the game's own code at the same doubled resolution (fair comparison). */
function nowFigure(extent: number, draw: (g: G, r: number) => void): HTMLCanvasElement {
  const N = Math.ceil(2 * extent * R);
  const c = canvas(N, N);
  const g = ctx(c);
  g.translate(N / 2, N / 2);
  draw(g, R);
  return c;
}

const ITEMS: Item[] = [
  { id: "survivor_body_a", name: "Survivor (pistol)", extent: 2.7, make: () => survivor("pistol"), now: () => nowFigure(2.7, (g, r) => drawSurvivor(g, r)) },
  { id: "survivor_shotgun_a", name: "Survivor (shotgun)", extent: 2.7, make: () => survivor("shotgun"), now: () => nowFigure(2.7, (g, r) => drawSurvivor(g, r, (c, rr) => WEAPON_ART.shotgun?.(c, "held", rr))) },
  { id: "zombie_walker_a", name: "Walker", extent: 1.55, make: walker, now: () => nowFigure(1.55, (g, r) => drawZombie(g, "walker", r, 0)) },
  { id: "zombie_runner_a", name: "Runner", extent: 1.5, make: runner, now: () => nowFigure(1.5, (g, r) => drawZombie(g, "runner", r, 0)) },
  { id: "zombie_crawler_a", name: "Crawler", extent: 1.75, make: crawler, now: () => nowFigure(1.75, (g, r) => drawZombie(g, "crawler", r, 0)) },
  { id: "zombie_spitter_a", name: "Spitter", extent: 2.35, make: spitter, now: () => nowFigure(2.35, (g, r) => drawZombie(g, "spitter", r, 0)) },
  { id: "zombie_brute_a", name: "Brute", extent: 1.5, make: brute, now: () => nowFigure(1.5, (g, r) => drawZombie(g, "brute", r, 0)) },
  { id: "zombie_bloater_a", name: "Bloater", extent: 1.8, make: bloater, now: () => nowFigure(1.8, (g, r) => drawZombie(g, "bloater", r, 0)) },
];

/** A figure on a patch of night street, scaled to `size` px. */
function onStreet(obj: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const c = canvas(size, size);
  const g = ctx(c);
  asphalt(g, size, size, 5);
  const s = (size * 0.9) / obj.width;
  g.save();
  g.globalAlpha = 0.45;
  g.filter = "blur(3px) brightness(0)";
  g.drawImage(obj, size * 0.05 + 3, size * 0.05 + 4, obj.width * s, obj.height * s);
  g.restore();
  g.drawImage(obj, size * 0.05, size * 0.05, obj.width * s, obj.height * s);
  return c;
}

/** A street scene with the horde and a survivor at game scale (both versions). */
function scene(get: (i: number) => HTMLCanvasElement, extentOf: (i: number) => number): HTMLCanvasElement {
  const W = 620;
  const H = 360;
  const pxr = 15; // scene px per body radius (≈ game scale on a phone)
  const c = canvas(W, H);
  const g = ctx(c);
  asphalt(g, W, H, 31);
  const r = rng(4);
  const put = (i: number, x: number, y: number, a: number): void => {
    const o = get(i);
    const sz = 2 * extentOf(i) * pxr;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.drawImage(o, -sz / 2, -sz / 2, sz, sz);
    g.restore();
  };
  put(0, 140, 180, 0);
  for (let k = 0; k < 14; k++) {
    const i = 2 + (k % 6);
    put(i, 330 + r() * 260, 30 + r() * 300, Math.PI + (r() - 0.5) * 0.8);
  }
  night(g, W, H, 0.45, [[160, 180, 220]]);
  return c;
}

async function main(): Promise<void> {
  const list = document.getElementById("list") as HTMLElement;
  const after: HTMLCanvasElement[] = [];
  const before: HTMLCanvasElement[] = [];
  for (const it of ITEMS) {
    const b = it.now(R);
    const a = it.make();
    before.push(b);
    after.push(a);
    const row = document.createElement("article");
    row.className = "pair";
    row.innerHTML = `<h3>${it.name}</h3><div class="sides"><figure><figcaption>Now</figcaption></figure><figure><figcaption>Photoreal</figcaption></figure></div>`;
    const figs = row.querySelectorAll("figure");
    (figs[0] as HTMLElement).prepend(onStreet(b, 260));
    (figs[1] as HTMLElement).prepend(onStreet(a, 260));
    list.append(row);
    await new Promise((res) => setTimeout(res, 0));
  }
  document.getElementById("scene-before")?.append(scene((i) => before[i] as HTMLCanvasElement, (i) => (ITEMS[i] as Item).extent));
  document.getElementById("scene-after")?.append(scene((i) => after[i] as HTMLCanvasElement, (i) => (ITEMS[i] as Item).extent));
  document.getElementById("loading")?.remove();
  void CURRENT;
  void hash2;
}

void main();
