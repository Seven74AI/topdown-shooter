/**
 * Characters, take 4 (designer 2026-11-25: "we are losing a lot of details [in take 3]. Maybe some details could be
 * turned into animation, to make it feel more like a premium AAA game"). Game code, built on today's drawings so
 * every detail stays, rendered with take 3's look, and animated:
 *
 * - Rendering (`relight4`): each colour region of the drawing becomes its own rounded volume (outlines and colour
 *   edges are creases), lit by take 3's cool key light with deep shading; cloth gets a woven texture, skin a fine
 *   mottle; dark, saturated and pale-metal areas get gloss. Glowing details (acid, veins, pilot flames, lamps) are
 *   detected from their colour and kept as a separate emissive layer.
 * - Animation (`animate`): breathing (a slow swell of the body, stronger for Brutes and Bloaters), a weight shift
 *   (a slight sway), the emissive layer pulsing with a bloom, acid dripping from the Spitter's mouth, the running
 *   chainsaw's vibration, and a sheen of the street light drifting over the glossy parts.
 * In the game this maps to a few cheap layers per sprite (base, emissive, sheen) and a transform per frame.
 */
import { drawBloater } from "../../../../apps/client/src/render/city/bloaterArt";
import { drawSurvivor, drawZombie } from "../../../../apps/client/src/render/city/spriteArt";
import { WEAPON_ART, WEAPON_BACK_ART, drawChainsawRunning } from "../../../../apps/client/src/render/city/weaponArt";
import { asphalt, canvas, ctx, fbm, hash2, night, type G } from "../../asset-fixes-1/src/lib";
import { drawCrawler2, drawRunner2, drawWalker2 } from "./commonz";

const R = 68; // px per body radius (2× the game's)

export interface Lit {
  base: HTMLCanvasElement;
  /** Glowing pixels only (additive), and their bloom. */
  glow: HTMLCanvasElement;
  bloom: HTMLCanvasElement;
  /** Glossy pixels as a mask (white), for the moving sheen. */
  gloss: HTMLCanvasElement;
  hasGlow: boolean;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = src.slice();
  const t = new Float32Array(w * h);
  const rr = Math.max(1, Math.round(r));
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -rr; x <= rr; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))] as number;
      for (let x = 0; x < w; x++) {
        t[y * w + x] = acc / (2 * rr + 1);
        acc += (a[y * w + Math.min(w - 1, x + rr + 1)] as number) - (a[y * w + Math.max(0, x - rr)] as number);
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -rr; y <= rr; y++) acc += t[Math.min(h - 1, Math.max(0, y)) * w + x] as number;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * rr + 1);
        acc += (t[Math.min(h - 1, y + rr + 1) * w + x] as number) - (t[Math.max(0, y - rr) * w + x] as number);
      }
    }
  }
  return a;
}

/** Hue (0–360) of an rgb triple. */
function hue(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Take 4's renderer: today's drawing → volume, light, texture, gloss, and a separate glow layer. */
export function relight4(draw: (g: G, r: number) => void, extent: number, seed: number, ss = 2): Lit {
  const N = Math.ceil(2 * extent * R);
  const W = N * ss;
  const src = canvas(W, W);
  const sg = ctx(src);
  sg.translate(W / 2, W / 2);
  draw(sg, R * ss);
  const d = sg.getImageData(0, 0, W, W).data;
  const n = W * W;
  const A = new Float32Array(n);
  const lum = new Float32Array(n);
  const sat = new Float32Array(n);
  const emis = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] as number;
    const g = d[i * 4 + 1] as number;
    const b = d[i * 4 + 2] as number;
    A[i] = (d[i * 4 + 3] as number) / 255;
    lum[i] = (r * 0.3 + g * 0.55 + b * 0.15) / 255;
    const mx = Math.max(r, g, b);
    sat[i] = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
    // glowing details: bright, saturated acid green / yellow-green, flame orange, pilot blue
    const h = hue(r, g, b);
    const bright = mx / 255;
    const isAcid = h > 80 && h < 135 && sat[i]! > 0.55 && bright > 0.6; // acid green (hi-vis yellow-green at ~68° stays matte)
    const isFlame = (h < 45 || h > 330) && sat[i]! > 0.6 && bright > 0.85;
    const isPilot = h > 190 && h < 240 && sat[i]! > 0.45 && bright > 0.8;
    emis[i] = A[i]! > 0.5 && (isAcid || isFlame || isPilot) ? 1 : 0;
  }
  // creases: dark outlines and sharp colour edges
  const E = new Float32Array(n);
  for (let y = 1; y < W - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (A[i]! < 0.5) continue;
      let edge = 0;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        edge = Math.max(edge, (Math.abs((d[i * 4] as number) - (d[j * 4] as number)) + Math.abs((d[i * 4 + 1] as number) - (d[j * 4 + 1] as number)) + Math.abs((d[i * 4 + 2] as number) - (d[j * 4 + 2] as number))) / 255);
      }
      E[i] = Math.min(1, Math.max(lum[i]! < 0.09 ? 1 : 0, edge > 0.22 ? edge * 1.2 : 0));
    }
  }
  const cut = new Float32Array(n);
  for (let i = 0; i < n; i++) cut[i] = A[i]! * (1 - E[i]!);
  const b1 = boxBlur(cut, W, W, 1.2 * ss);
  const b2 = boxBlur(cut, W, W, 3.5 * ss);
  const b3 = boxBlur(cut, W, W, 8 * ss);
  const H = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % W;
    const y = (i / W) | 0;
    const matte = sat[i]! < 0.5 && lum[i]! > 0.12 && lum[i]! < 0.8 ? 1 : 0;
    // woven texture on matte areas (cloth), fine mottle elsewhere
    const weave = matte ? (Math.sin(x * 1.3 / ss) * Math.sin(y * 1.3 / ss)) * 0.008 + (fbm(x / (3 * ss), y / (3 * ss), seed, 3) - 0.5) * 0.05 : (fbm(x / (1.5 * ss), y / (1.5 * ss), seed + 1, 2) - 0.5) * 0.02;
    H[i] = (b1[i]! * 0.25 + b2[i]! * 0.35 + b3[i]! * 0.4) * A[i]! + weave * A[i]! - E[i]! * 0.09;
  }
  const base = sg.createImageData(W, W);
  const glow = sg.createImageData(W, W);
  const gloss = sg.createImageData(W, W);
  const o = base.data;
  const go = glow.data;
  const so = gloss.data;
  const L = [-0.5, -0.72, 0.48];
  const ll = Math.hypot(L[0]!, L[1]!, L[2]!);
  const [lx, ly, lz] = [L[0]! / ll, L[1]! / ll, L[2]! / ll];
  const tint = [0.94, 0.98, 1.06];
  const K = 12;
  let hasGlow = false;
  for (let y = 1; y < W - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const a = A[i]!;
      if (a <= 0.004) continue;
      const dx = (H[i + 1]! - H[i - 1]!) * K;
      const dy = (H[i + W]! - H[i - W]!) * K;
      const nl = Math.hypot(dx, dy, 1);
      const nx = -dx / nl;
      const ny = -dy / nl;
      const nz = 1 / nl;
      const nd = nx * lx + ny * ly + nz * lz;
      const diff = Math.max(0, nd);
      const l0 = lum[i]!;
      const s0 = sat[i]!;
      const glossK = Math.min(1, (l0 < 0.18 ? 0.6 : 0) + (s0 > 0.55 ? 0.45 : 0) + (l0 > 0.78 && s0 < 0.25 ? 0.5 : 0) + 0.06);
      const rz = 2 * nd * nz - lz;
      const sp = Math.pow(Math.max(0, rz), 20) * glossK;
      const grain = 1 + (hash2(x, y, seed) - 0.5) * 0.06 + (fbm(x / (1.1 * ss), y / (1.1 * ss), seed + 3, 2) - 0.5) * 0.18 * (1 - glossK);
      const ao = 1 - E[i]! * 0.3;
      for (let c = 0; c < 3; c++) {
        const v = d[i * 4 + c] as number;
        const lit = (0.4 + 0.9 * diff * (tint[c] as number)) * grain * ao;
        o[i * 4 + c] = Math.min(255, v * lit + sp * 240 * (tint[c] as number));
      }
      o[i * 4 + 3] = d[i * 4 + 3] as number;
      if (emis[i]) {
        hasGlow = true;
        for (let c = 0; c < 3; c++) go[i * 4 + c] = d[i * 4 + c] as number;
        go[i * 4 + 3] = 255;
      }
      if (glossK > 0.4) {
        so[i * 4] = so[i * 4 + 1] = so[i * 4 + 2] = 255;
        so[i * 4 + 3] = Math.round(255 * glossK * a * Math.max(0, nz));
      }
    }
  }
  const shrink = (img: ImageData, blur = 0): HTMLCanvasElement => {
    const w = canvas(W, W);
    ctx(w).putImageData(img, 0, 0);
    const out = canvas(N, N);
    const og = ctx(out);
    og.imageSmoothingQuality = "high";
    if (blur) og.filter = `blur(${blur}px)`;
    og.drawImage(w, 0, 0, N, N);
    return out;
  };
  return { base: shrink(base), glow: shrink(glow), bloom: shrink(glow, 6), gloss: shrink(gloss), hasGlow };
}

// ─────────────────────────────── animation ───────────────────────────────

export interface Anim {
  /** Breathing strength (body swell amplitude) and rate (breaths per second). */
  breathe: number;
  rate: number;
  /** Weight-shift sway (radians). */
  sway: number;
  /** Glow pulse: base and swing. */
  glowBase: number;
  glowSwing: number;
  glowRate: number;
  /** Acid drips from (x, y) in radii (the Spitter's mouth). */
  drip?: [number, number];
  /** Vibration (px) for running engines. */
  shake?: number;
  /** Flicker (pilot flames). */
  flicker?: boolean;
  /** Bloaters: the swell (0–1) and the look, for the veins and the acid sacs. */
  bloater?: { s: number; look: number };
}

const ZOMBIE: Anim = { breathe: 0.012, rate: 0.35, sway: 0.025, glowBase: 0.6, glowSwing: 0.4, glowRate: 1.2 };

interface Row {
  group: string;
  name: string;
  extent: number;
  zoom: number;
  draw: (g: G, r: number) => void;
  anim: Anim;
  /** New animated design (walkers, runners, crawlers): the drawing at phase `ph`; one loop lasts `loopS` seconds. */
  frames?: { draw: (g: G, r: number, ph: number) => void; loopS: number };
}

/** Phases per animation loop (crossfaded, so 10 drawings read as smooth motion). */
const LOOP_FRAMES = 10;

const held = (w: string) => (c: G, r: number): void => WEAPON_ART[w]?.(c, "held", r);
export const SURV: Anim = { breathe: 0.008, rate: 0.28, sway: 0.012, glowBase: 0.7, glowSwing: 0.3, glowRate: 6, flicker: true };
const ROWS: Row[] = [
  { group: "Survivor", name: "Pistol (also SMG, hunting rifle, machete)", extent: 2.7, zoom: 1.5, draw: (g, r) => drawSurvivor(g, r), anim: SURV },
  ...["shotgun", "assault_rifle", "fire_axe", "chainsaw", "grenade_launcher", "flamethrower", "gas_torch"].map((w) => ({ group: "Survivor", name: w.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), extent: 2.7, zoom: 1.2, draw: (g: G, r: number) => drawSurvivor(g, r, held(w), WEAPON_BACK_ART[w]), anim: SURV })),
  { group: "Survivor", name: "Chainsaw running", extent: 2.7, zoom: 1.2, draw: (g, r) => drawSurvivor(g, r, (c, rr) => drawChainsawRunning(c, "held", rr)), anim: { ...SURV, shake: 1.2 } },
  ...[0, 1, 2, 3].map((v) => ({ group: "Walkers", name: `Walker ${"ABCD"[v]} (new design)`, extent: 1.55, zoom: 0.9, draw: (g: G, r: number) => drawZombie(g, "walker", r, v), anim: { ...ZOMBIE, sway: 0.02 }, frames: { draw: (g: G, r: number, ph: number) => drawWalker2(g, r, v, ph), loopS: 1.6 + v * 0.15 } })),
  ...[0, 1].map((v) => ({ group: "Runners and crawlers", name: `Runner ${"AB"[v]} (new design)`, extent: 1.5, zoom: 0.9, draw: (g: G, r: number) => drawZombie(g, "runner", r, v), anim: { ...ZOMBIE, rate: 0.9, breathe: 0.012, sway: 0 }, frames: { draw: (g: G, r: number, ph: number) => drawRunner2(g, r, v, ph), loopS: 0.55 } })),
  ...[0, 1].map((v) => ({ group: "Runners and crawlers", name: `Crawler ${"AB"[v]} (new design)`, extent: 1.75, zoom: 0.9, draw: (g: G, r: number) => drawZombie(g, "crawler", r, v), anim: { ...ZOMBIE, sway: 0.015 }, frames: { draw: (g: G, r: number, ph: number) => drawCrawler2(g, r, v, ph), loopS: 1.9 } })),
  ...[0, 1].flatMap((v) => [false, true].map((wu) => ({ group: "Spitters", name: `Spitter ${"AB"[v]}${wu ? " (windup)" : ""}`, extent: 2.35, zoom: 0.95, draw: (g: G, r: number) => drawZombie(g, "spitter", r, v, wu), anim: { ...ZOMBIE, glowBase: wu ? 0.9 : 0.6, glowSwing: wu ? 0.6 : 0.4, glowRate: wu ? 4 : 1.4, drip: [wu ? 0.85 : 1.15, 0] as [number, number] } }))),
  ...[0, 1, 2, 3, 4].flatMap((v) => [false, true].map((wu) => ({ group: "Brutes", name: `BR${v + 1} ${["riot cop", "construction worker", "butcher", "bodybuilder", "prisoner"][v]}${wu ? " (windup)" : ""}`, extent: 1.5, zoom: 0.9, draw: (g: G, r: number) => drawZombie(g, "brute", r, v, wu), anim: { ...ZOMBIE, breathe: wu ? 0.035 : 0.022, rate: wu ? 1.2 : 0.3, sway: 0.02 } }))),
  ...[0, 1, 2, 3, 4].flatMap((v) => [0, 1, 2, 3].map((st) => ({ group: "Bloaters", name: `BL${v + 1} ${["office worker", "hazmat", "sewer worker", "tourist", "gas sacs"][v]}${st ? ` (swell ${st})` : ""}`, extent: 1.8, zoom: 0.9, draw: (g: G, r: number) => drawBloater(g, r, v, st / 3), anim: { ...ZOMBIE, breathe: 0.02 + st * 0.012, rate: 0.35 + st * 0.6, sway: 0.01, glowBase: 0.5 + st * 0.15, glowSwing: 0.3 + st * 0.2, glowRate: 1 + st * 1.5, bloater: { s: st / 3, look: v } } }))),
];

// ─────────────────────────────── Bloaters: glowing veins and acid sacs ───────────────────────────────

interface Vein {
  /** Points along the vein (frame px), and the distance from its root at each point. */
  pts: number[];
  dist: number[];
  width: number;
}
interface Sac {
  x: number;
  y: number;
  r: number;
  seed: number;
}
interface BloaterFx {
  veins: Vein[];
  sacs: Sac[];
  /** The veins drawn dark into the skin (static, under the glow). */
  veinBase: HTMLCanvasElement;
  s: number;
  /** How much shows through clothes (1 bare skin … 0.45 through a suit). */
  through: number;
}

/**
 * The Bloater's veins and sacs, prepared once per frame picture: veins branch out from the belly across the body
 * (kept on the figure's opaque pixels), and the acid sacs are found from the drawing's glowing blobs.
 */
function prepareBloater(lit: Lit, b: { s: number; look: number }, seed: number): BloaterFx {
  const N = lit.base.width;
  const a = ctx(lit.base).getImageData(0, 0, N, N).data;
  const headX = N / 2 + 0.45 * R * (1 + 0.35 * b.s); // veins stay off the head (it sits at the front, +x)
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < N && y < N && x < headX && (a[(Math.floor(y) * N + Math.floor(x)) * 4 + 3] as number) > 230;
  const rnd = ((): (() => number) => {
    let q = seed;
    return () => {
      q = (q * 16807) % 2147483647;
      return q / 2147483647;
    };
  })();
  const cx = N / 2 - 0.08 * R;
  const body = R * (1.0 + 0.35 * b.s) * 0.95;
  const veins: Vein[] = [];
  const grow = (x: number, y: number, ang: number, len: number, w: number, d0: number, depth: number): void => {
    const pts = [x, y];
    const dist = [d0];
    let d = d0;
    for (let t = 0; t < len; t += 3) {
      ang += (rnd() - 0.5) * 0.55;
      const nx = x + Math.cos(ang) * 3;
      const ny = y + Math.sin(ang) * 3;
      if (!inside(nx, ny)) break;
      x = nx;
      y = ny;
      d += 3;
      pts.push(x, y);
      dist.push(d);
      if (depth < 2 && rnd() < 0.06) grow(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5), len * 0.45, w * 0.6, d, depth + 1);
    }
    if (pts.length > 6) veins.push({ pts, dist, width: w });
  };
  const roots = 7 + Math.round(b.s * 4);
  for (let i = 0; i < roots; i++) {
    const ang = (i / roots) * Math.PI * 2 + rnd() * 0.5;
    const r0 = body * (0.12 + rnd() * 0.15);
    grow(cx + Math.cos(ang) * r0, N / 2 + Math.sin(ang) * r0, ang, body * (0.6 + rnd() * 0.35), 1.2 + rnd() * 0.7, 0, 0);
  }
  // acid sacs: blobs of glowing pixels in the drawing (a coarse grid flood fill)
  const g = ctx(lit.glow).getImageData(0, 0, N, N).data;
  const cell = 3;
  const gw = Math.ceil(N / cell);
  const on = new Uint8Array(gw * gw);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const r0 = a[i] as number;
      const g0 = a[i + 1] as number;
      const b0 = a[i + 2] as number;
      const mx = Math.max(r0, g0, b0);
      const sat = mx ? (mx - Math.min(r0, g0, b0)) / mx : 0;
      const h = hue(r0, g0, b0);
      const pale = b.look === 4 && (a[i + 3] as number) > 200 && h > 55 && h < 110 && sat > 0.38 && mx > 120; // BL5's pale gas sacs
      if ((g[i + 3] as number) > 100 || pale) on[Math.floor(y / cell) * gw + Math.floor(x / cell)] = 1;
    }
  }
  const seen = new Uint8Array(gw * gw);
  const sacs: Sac[] = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let sx = 0;
    let sy = 0;
    let count = 0;
    while (stack.length) {
      const j = stack.pop() as number;
      const x = j % gw;
      const y = (j / gw) | 0;
      sx += x;
      sy += y;
      count++;
      for (const k of [j - 1, j + 1, j - gw, j + gw]) if (k >= 0 && k < on.length && on[k] && !seen[k]) {
        seen[k] = 1;
        stack.push(k);
      }
    }
    if (count < 3 || count > 400) continue;
    sacs.push({ x: ((sx / count) + 0.5) * cell, y: ((sy / count) + 0.5) * cell, r: Math.max(4, Math.sqrt(count / Math.PI) * cell * 1.15), seed: sacs.length + seed });
  }
  // BL5 is all gas sacs; add a few where its drawing has them dim, and one or two on every look
  const extra = b.look === 4 ? 4 : 1;
  for (let i = 0; i < extra; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const ang = rnd() * Math.PI * 2;
      const rr = body * (0.25 + rnd() * 0.5);
      const x = cx + Math.cos(ang) * rr;
      const y = N / 2 + Math.sin(ang) * rr;
      if (inside(x, y) && sacs.every((q) => Math.hypot(q.x - x, q.y - y) > q.r + 10)) {
        sacs.push({ x, y, r: 5 + rnd() * 5 * (1 + b.s), seed: seed + 100 + i });
        break;
      }
    }
  }
  const through = b.look === 1 ? 0.45 : b.look === 2 ? 0.7 : 1;
  // the veins' dark trace in the skin
  const veinBase = canvas(N, N);
  const vg = ctx(veinBase);
  vg.lineCap = "round";
  vg.lineJoin = "round";
  for (const v of veins) {
    vg.strokeStyle = `rgba(30,50,40,${0.35 * through})`;
    vg.lineWidth = v.width + 1;
    vg.beginPath();
    for (let k = 0; k < v.pts.length; k += 2) (k ? vg.lineTo : vg.moveTo).call(vg, v.pts[k] as number, v.pts[k + 1] as number);
    vg.stroke();
  }
  vg.globalCompositeOperation = "destination-in";
  vg.drawImage(lit.base, 0, 0);
  return { veins, sacs, veinBase, s: b.s, through };
}

/** Draws the Bloater's veins (pulses travelling out from the belly) and its sacs, around the frame centre. */
function drawBloaterFx(g: G, fx: BloaterFx, t: number, N: number): void {
  const off = -N / 2;
  g.drawImage(fx.veinBase, off, off);
  // glowing veins: a faint steady glow plus bright pulses running outward, faster and brighter as it swells
  const speed = 40 + fx.s * 90;
  const spacing = 70 - fx.s * 25;
  const steady = (0.06 + fx.s * 0.2) * fx.through;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  for (const v of fx.veins) {
    for (let k = 2; k < v.pts.length; k += 2) {
      const d = v.dist[k / 2] as number;
      const wave = Math.pow(Math.max(0, Math.cos(((d - t * speed) / spacing) * Math.PI * 2)), 6);
      const a = Math.min(0.85, steady + wave * (0.3 + fx.s * 0.35) * fx.through);
      if (a < 0.03) continue;
      const x0 = off + (v.pts[k - 2] as number);
      const y0 = off + (v.pts[k - 1] as number);
      const x1 = off + (v.pts[k] as number);
      const y1 = off + (v.pts[k + 1] as number);
      g.strokeStyle = `rgba(140,255,70,${a * 0.3})`;
      g.lineWidth = v.width * 2.6;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = `rgba(200,255,140,${a})`;
      g.lineWidth = v.width;
      g.stroke();
    }
  }
  g.restore();
  // acid sacs: translucent glossy blisters with a glowing core, a lit rim, a wet highlight, bubbles rising inside
  for (const sc of fx.sacs) {
    const th = 1 + 0.08 * Math.sin(t * (2 + fx.s * 4) + sc.seed);
    const r = sc.r * th * (1 + fx.s * 0.25);
    const x = off + sc.x;
    const y = off + sc.y;
    g.save();
    const body = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    body.addColorStop(0, "rgba(230,255,150,0.95)");
    body.addColorStop(0.45, "rgba(150,220,50,0.9)");
    body.addColorStop(0.85, "rgba(60,110,20,0.92)");
    body.addColorStop(1, "rgba(30,50,10,0.9)");
    g.fillStyle = body;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    // bubbles rising inside
    g.clip();
    for (let k = 0; k < 4; k++) {
      const ph = (t * (0.5 + 0.2 * k) + sc.seed * 0.37 + k * 0.25) % 1;
      const bx = x + Math.sin(sc.seed + k * 2.1) * r * 0.45;
      const by = y + r * 0.8 - ph * r * 1.6;
      g.fillStyle = `rgba(240,255,200,${0.55 * Math.sin(ph * Math.PI)})`;
      g.beginPath();
      g.arc(bx, by, Math.max(0.8, r * 0.12), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // rim and wet highlight
    g.strokeStyle = "rgba(20,40,10,0.7)";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.beginPath();
    g.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
    g.fill();
    // its glow on the skin around it
    g.save();
    g.globalCompositeOperation = "lighter";
    const halo = g.createRadialGradient(x, y, r * 0.6, x, y, r * 1.8);
    halo.addColorStop(0, `rgba(150,255,60,${0.1 + fx.s * 0.12})`);
    halo.addColorStop(1, "rgba(150,255,60,0)");
    g.fillStyle = halo;
    g.fillRect(x - r * 1.8, y - r * 1.8, r * 3.6, r * 3.6);
    g.restore();
  }
}

/** One animated card canvas: the street, the cast shadow, the figure with its layers. */
export function animated(lit: Lit, anim: Anim, zoom: number, size: number, phase: number, bfx?: BloaterFx, loop?: { lits: Lit[]; loopS: number }): { c: HTMLCanvasElement; frame: (t: number) => void } {
  const c = canvas(size, size);
  const g = ctx(c);
  const bg = canvas(size, size);
  const bgg = ctx(bg);
  asphalt(bgg, size, size, 5);
  night(bgg, size, size, 0.3, [[size * 0.05, size * 0.05, size * 0.9]]);
  const N = lit.base.width;
  const s = (size * zoom) / N;
  const drops: { x: number; y: number; t0: number }[] = [];
  const frame = (tt: number): void => {
    const t = tt + phase;
    g.drawImage(bg, 0, 0);
    const br = 1 + anim.breathe * Math.sin(t * anim.rate * Math.PI * 2);
    const sw = anim.sway * Math.sin(t * anim.rate * Math.PI * 0.7 + 1);
    const sh = anim.shake ? (Math.random() - 0.5) * anim.shake : 0;
    g.save();
    g.translate(size / 2 + sh, size / 2 + sh * 0.6);
    g.rotate(sw);
    g.scale(s * br, s * (1 + (br - 1) * 0.6));
    // cast shadow
    g.save();
    g.globalAlpha = 0.6;
    g.filter = "blur(4px) brightness(0)";
    g.drawImage(lit.base, -N / 2 + 8 / s, -N / 2 + 12 / s);
    g.restore();
    if (loop) {
      // the animation loop: two neighbouring drawings crossfaded
      const f = ((t / loop.loopS) % 1) * loop.lits.length;
      const i0 = Math.floor(f) % loop.lits.length;
      const i1 = (i0 + 1) % loop.lits.length;
      g.drawImage((loop.lits[i0] as Lit).base, -N / 2, -N / 2);
      g.globalAlpha = f - Math.floor(f);
      g.drawImage((loop.lits[i1] as Lit).base, -N / 2, -N / 2);
      g.globalAlpha = 1;
    } else g.drawImage(lit.base, -N / 2, -N / 2);
    if (bfx) drawBloaterFx(g, bfx, t, N);
    // the street light's sheen drifting over the glossy parts
    const sx = Math.sin(t * 0.4) * N * 0.35;
    const sheen = canvas(N, N);
    const shg = ctx(sheen);
    shg.drawImage(lit.gloss, 0, 0);
    shg.globalCompositeOperation = "source-in";
    const gr = shg.createLinearGradient(N / 2 + sx - N * 0.25, 0, N / 2 + sx + N * 0.25, N);
    gr.addColorStop(0, "rgba(200,220,255,0)");
    gr.addColorStop(0.5, "rgba(200,220,255,0.28)");
    gr.addColorStop(1, "rgba(200,220,255,0)");
    shg.fillStyle = gr;
    shg.fillRect(0, 0, N, N);
    g.globalCompositeOperation = "lighter";
    g.drawImage(sheen, -N / 2, -N / 2);
    // glowing details pulse with a bloom
    if (lit.hasGlow) {
      let k = anim.glowBase + anim.glowSwing * Math.sin(t * anim.glowRate * Math.PI * 2);
      if (anim.flicker) k *= 0.8 + 0.2 * fbm(t * 9, 0.5, 3, 2) * 2;
      g.globalAlpha = Math.max(0, Math.min(1, k * 0.5));
      g.drawImage(lit.glow, -N / 2, -N / 2);
      g.globalAlpha = Math.max(0, Math.min(1, k));
      g.drawImage(lit.bloom, -N / 2, -N / 2);
      g.drawImage(lit.bloom, -N / 2, -N / 2);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = "source-over";
    // acid drips falling from the mouth and spreading on the asphalt
    if (anim.drip) {
      if (drops.length === 0 || t - (drops[drops.length - 1] as { t0: number }).t0 > 0.6) drops.push({ x: anim.drip[0] * R + (Math.random() - 0.5) * 6, y: anim.drip[1] * R + (Math.random() - 0.5) * 6, t0: t });
      while (drops.length && t - (drops[0] as { t0: number }).t0 > 2.4) drops.shift();
      for (const dp of drops) {
        const age = t - dp.t0;
        const fall = Math.min(1, age / 0.35);
        g.globalCompositeOperation = "lighter";
        g.fillStyle = `rgba(160,240,60,${fall < 1 ? 0.9 : Math.max(0, 0.6 - (age - 0.35) * 0.3)})`;
        g.beginPath();
        if (fall < 1) g.ellipse(dp.x + fall * 6, dp.y, 2.5, 3.5, 0, 0, Math.PI * 2);
        else g.ellipse(dp.x + 6, dp.y, 3 + (age - 0.35) * 5, 2.2 + (age - 0.35) * 3.5, 0, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = "source-over";
      }
    }
    g.restore();
  };
  return { c, frame };
}

function staticNow(row: Row, size: number): HTMLCanvasElement {
  const N = Math.ceil(2 * row.extent * R);
  const f = canvas(N, N);
  const fg = ctx(f);
  fg.translate(N / 2, N / 2);
  row.draw(fg, R);
  const c = canvas(size, size);
  const g = ctx(c);
  asphalt(g, size, size, 5);
  night(g, size, size, 0.3, [[size * 0.05, size * 0.05, size * 0.9]]);
  const s = (size * row.zoom) / N;
  const off = (size - N * s) / 2;
  g.save();
  g.globalAlpha = 0.6;
  g.filter = "blur(5px) brightness(0)";
  g.drawImage(f, off + 8, off + 12, N * s, N * s);
  g.restore();
  g.drawImage(f, off, off, N * s, N * s);
  return c;
}

async function main(): Promise<void> {
  if (!document.getElementById("groups")) return; // imported by another page (outline test)
  const host = document.getElementById("groups") as HTMLElement;
  const nav = document.getElementById("nav") as HTMLElement;
  const status = document.getElementById("loading") as HTMLElement;
  const live: { frame: (t: number) => void; el: HTMLElement; on: boolean }[] = [];
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      const l = live.find((x) => x.el === e.target);
      if (l) l.on = e.isIntersecting;
    }
  });
  let grid: HTMLElement | null = null;
  let current = "";
  for (const [i, row] of ROWS.entries()) {
    if (row.group !== current) {
      current = row.group;
      const id = "g-" + current.toLowerCase().replace(/[^a-z]+/g, "-");
      const sec = document.createElement("section");
      sec.id = id;
      sec.innerHTML = `<h2>${current}</h2><div class="grid"></div>`;
      host.append(sec);
      grid = sec.querySelector(".grid");
      const a = document.createElement("a");
      a.href = "#" + id;
      a.textContent = current;
      nav.append(a);
    }
    const card = document.createElement("article");
    card.className = "pair";
    card.innerHTML = `<h3></h3><div class="sides"><figure><figcaption>Now</figcaption></figure><figure><figcaption>Take 4 (animated)</figcaption></figure></div>`;
    (card.querySelector("h3") as HTMLElement).textContent = row.name;
    const figs = card.querySelectorAll("figure");
    (figs[0] as HTMLElement).prepend(staticNow(row, 220));
    const lit = relight4(row.draw, row.extent, 900 + i * 7);
    const bfx = row.anim.bloater ? prepareBloater(lit, row.anim.bloater, 1300 + i * 17) : undefined;
    const fr = row.frames;
    const loop = fr ? { lits: Array.from({ length: LOOP_FRAMES }, (_, k) => relight4((g, r) => fr.draw(g, r, k / LOOP_FRAMES), row.extent, 900 + i * 7)), loopS: fr.loopS } : undefined;
    const a = animated(loop ? (loop.lits[0] as Lit) : lit, row.anim, row.zoom, 220, i * 0.37, bfx, loop);
    a.frame(0);
    (figs[1] as HTMLElement).prepend(a.c);
    grid?.append(card);
    const entry = { frame: a.frame, el: card, on: true };
    live.push(entry);
    io.observe(card);
    status.textContent = `Drawing ${i + 1} of ${ROWS.length}…`;
    await new Promise((res) => setTimeout(res, 0));
  }
  status.remove();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  const loop = (now: number): void => {
    const t = (now - t0) / 1000;
    for (const l of live) if (l.on) l.frame(t);
    if (!reduce) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void main();
