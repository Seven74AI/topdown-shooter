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

const R = 68; // px per body radius (2× the game's)

interface Lit {
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

interface Anim {
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
}

const ZOMBIE: Anim = { breathe: 0.012, rate: 0.35, sway: 0.025, glowBase: 0.6, glowSwing: 0.4, glowRate: 1.2 };

interface Row {
  group: string;
  name: string;
  extent: number;
  zoom: number;
  draw: (g: G, r: number) => void;
  anim: Anim;
}

const held = (w: string) => (c: G, r: number): void => WEAPON_ART[w]?.(c, "held", r);
const SURV: Anim = { breathe: 0.008, rate: 0.28, sway: 0.012, glowBase: 0.7, glowSwing: 0.3, glowRate: 6, flicker: true };
const ROWS: Row[] = [
  { group: "Survivor", name: "Pistol (also SMG, hunting rifle, machete)", extent: 2.7, zoom: 1.5, draw: (g, r) => drawSurvivor(g, r), anim: SURV },
  ...["shotgun", "assault_rifle", "fire_axe", "chainsaw", "grenade_launcher", "flamethrower", "gas_torch"].map((w) => ({ group: "Survivor", name: w.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), extent: 2.7, zoom: 1.2, draw: (g: G, r: number) => drawSurvivor(g, r, held(w), WEAPON_BACK_ART[w]), anim: SURV })),
  { group: "Survivor", name: "Chainsaw running", extent: 2.7, zoom: 1.2, draw: (g, r) => drawSurvivor(g, r, (c, rr) => drawChainsawRunning(c, "held", rr)), anim: { ...SURV, shake: 1.2 } },
  ...[0, 1, 2, 3].map((v) => ({ group: "Walkers", name: `Walker ${"ABCD"[v]}`, extent: 1.55, zoom: 0.9, draw: (g: G, r: number) => drawZombie(g, "walker", r, v), anim: { ...ZOMBIE, sway: 0.05 } })),
  ...[0, 1].map((v) => ({ group: "Runners and crawlers", name: `Runner ${"AB"[v]}`, extent: 1.5, zoom: 0.9, draw: (g: G, r: number) => drawZombie(g, "runner", r, v), anim: { ...ZOMBIE, rate: 0.9, breathe: 0.018 } })),
  ...[0, 1].map((v) => ({ group: "Runners and crawlers", name: `Crawler ${"AB"[v]}`, extent: 1.75, zoom: 0.9, draw: (g: G, r: number) => drawZombie(g, "crawler", r, v), anim: { ...ZOMBIE, sway: 0.04 } })),
  ...[0, 1].flatMap((v) => [false, true].map((wu) => ({ group: "Spitters", name: `Spitter ${"AB"[v]}${wu ? " (windup)" : ""}`, extent: 2.35, zoom: 0.95, draw: (g: G, r: number) => drawZombie(g, "spitter", r, v, wu), anim: { ...ZOMBIE, glowBase: wu ? 0.9 : 0.6, glowSwing: wu ? 0.6 : 0.4, glowRate: wu ? 4 : 1.4, drip: [wu ? 0.85 : 1.15, 0] as [number, number] } }))),
  ...[0, 1, 2, 3, 4].flatMap((v) => [false, true].map((wu) => ({ group: "Brutes", name: `BR${v + 1} ${["riot cop", "construction worker", "butcher", "bodybuilder", "prisoner"][v]}${wu ? " (windup)" : ""}`, extent: 1.5, zoom: 0.9, draw: (g: G, r: number) => drawZombie(g, "brute", r, v, wu), anim: { ...ZOMBIE, breathe: wu ? 0.035 : 0.022, rate: wu ? 1.2 : 0.3, sway: 0.02 } }))),
  ...[0, 1, 2, 3, 4].flatMap((v) => [0, 1, 2, 3].map((st) => ({ group: "Bloaters", name: `BL${v + 1} ${["office worker", "hazmat", "sewer worker", "tourist", "gas sacs"][v]}${st ? ` (swell ${st})` : ""}`, extent: 1.8, zoom: 0.9, draw: (g: G, r: number) => drawBloater(g, r, v, st / 3), anim: { ...ZOMBIE, breathe: 0.02 + st * 0.012, rate: 0.35 + st * 0.6, sway: 0.01, glowBase: 0.5 + st * 0.15, glowSwing: 0.3 + st * 0.2, glowRate: 1 + st * 1.5 } }))),
];

/** One animated card canvas: the street, the cast shadow, the figure with its layers. */
function animated(lit: Lit, anim: Anim, zoom: number, size: number, phase: number): { c: HTMLCanvasElement; frame: (t: number) => void } {
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
    g.drawImage(lit.base, -N / 2, -N / 2);
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
    const a = animated(lit, row.anim, row.zoom, 220, i * 0.37);
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
