import { relitSurvivor } from "./relit";
/**
 * Fire family (group 5): shared bake helpers for the "Now" columns (the game's own atlas frames, tinted like
 * Phaser's multiply tint) and for take A (the photoreal textures every fire card shares: flames by temperature,
 * smoke lit from the upper left, sparks, flash, light pool, scorch, relit debris). Everything is made ONCE (bake);
 * the cards' draw() only places sprites.
 */
import { fakeScene, frameCanvas } from "./textureShim";
import { make, run, rng, LIGHT } from "./kit";
import { ensureAtlases } from "../../../../apps/client/src/render/city/spriteAtlas";
import { ensureBlastFxAtlas, ATLAS_BLASTFX, BLAST_FLAME_FRAMES, BLAST_SMOKE_FRAMES, FX_BLAST_EMBER, FX_BLAST_FLASH, FX_BLAST_GLOW, FX_DEBRIS, FX_SCORCH, FX_GRENADE_ROUND, FX_GRENADE_SHADOW } from "../../../../apps/client/src/render/city/blastFxAtlas";
import { ensureFireFxAtlas, ATLAS_FIREFX, FIRE_FLAME_FRAMES, FIRE_SMOKE_FRAMES, FX_FIRE_EMBER, FX_FIRE_LIGHT } from "../../../../apps/client/src/render/city/fireFxAtlas";
import { ensureThrowFxAtlas, ATLAS_THROWFX, HAND_GRENADE_FRAMES, MOLOTOV_FRAMES, FX_MOLOTOV_RING } from "../../../../apps/client/src/render/city/throwArt";
import { ATLAS_FX, FX_BILE_SPLATS, FX_CLOTH_SCRAP, FX_EXPLOSION_BLOATER, FX_GAS_CLOUDS, FX_GLOW, ATLAS_DOWNTOWN, ATLAS_CHARACTERS } from "../../../../apps/client/src/render/city/spriteAtlas";
import { flameMasks, smokeMask, FLAME_SPRITE_PX, SMOKE_SPRITE_PX } from "../../../../apps/client/src/render/city/fireSprites";
import { relightCharSteps } from "../../../../apps/client/src/render/city/charRelight";
import { fbm as gfbm, hash2 } from "../../../../apps/client/src/render/city/groundDamageArt";

export const hex = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;

/** A copy of `src` multiplied by `tint` (Phaser's multiply tint; alpha kept). */
export function tinted(src: HTMLCanvasElement, tint: number): HTMLCanvasElement {
  const c = make(src.width, src.height);
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = hex(tint);
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(src, 0, 0);
  return c;
}

/** Tinted copies made at bake, looked up by (frame, tint) in draw (never made there). */
export class TintCache {
  private readonly m = new Map<number, HTMLCanvasElement>();
  private readonly frames: HTMLCanvasElement[];
  constructor(frames: HTMLCanvasElement[], tints: readonly number[]) {
    this.frames = frames;
    frames.forEach((f, i) => tints.forEach((t) => this.m.set(i * 0x1000000 + t, tinted(f, t))));
  }
  get(frame: number, tint: number): HTMLCanvasElement {
    return this.m.get((frame % this.frames.length) * 0x1000000 + tint) ?? (this.frames[frame % this.frames.length] as HTMLCanvasElement);
  }
  all(): HTMLCanvasElement[] {
    return [...this.m.values()];
  }
}

/** The game's FX atlases, painted by the game's own code (once). */
let gameReady = false;
export function gameAtlases(): void {
  if (gameReady) return;
  gameReady = true;
  ensureAtlases(fakeScene);
  ensureBlastFxAtlas(fakeScene);
  ensureFireFxAtlas(fakeScene);
  ensureThrowFxAtlas(fakeScene);
}
export const G = {
  blastFlame: (): HTMLCanvasElement[] => BLAST_FLAME_FRAMES.map((n) => frameCanvas(ATLAS_BLASTFX, n)),
  blastSmoke: (): HTMLCanvasElement[] => BLAST_SMOKE_FRAMES.map((n) => frameCanvas(ATLAS_BLASTFX, n)),
  blastEmber: (): HTMLCanvasElement => frameCanvas(ATLAS_BLASTFX, FX_BLAST_EMBER),
  blastFlash: (): HTMLCanvasElement => frameCanvas(ATLAS_BLASTFX, FX_BLAST_FLASH),
  blastGlow: (): HTMLCanvasElement => frameCanvas(ATLAS_BLASTFX, FX_BLAST_GLOW),
  debris: (): HTMLCanvasElement => frameCanvas(ATLAS_BLASTFX, FX_DEBRIS),
  scorch: (): HTMLCanvasElement => frameCanvas(ATLAS_BLASTFX, FX_SCORCH),
  round: (): HTMLCanvasElement => frameCanvas(ATLAS_BLASTFX, FX_GRENADE_ROUND),
  roundShadow: (): HTMLCanvasElement => frameCanvas(ATLAS_BLASTFX, FX_GRENADE_SHADOW),
  fireFlame: (): HTMLCanvasElement[] => FIRE_FLAME_FRAMES.map((n) => frameCanvas(ATLAS_FIREFX, n)),
  fireSmoke: (): HTMLCanvasElement[] => FIRE_SMOKE_FRAMES.map((n) => frameCanvas(ATLAS_FIREFX, n)),
  fireEmber: (): HTMLCanvasElement => frameCanvas(ATLAS_FIREFX, FX_FIRE_EMBER),
  fireLight: (): HTMLCanvasElement => frameCanvas(ATLAS_FIREFX, FX_FIRE_LIGHT),
  hand: (): HTMLCanvasElement[] => HAND_GRENADE_FRAMES.map((n) => frameCanvas(ATLAS_THROWFX, n)),
  bottle: (): HTMLCanvasElement[] => MOLOTOV_FRAMES.map((n) => frameCanvas(ATLAS_THROWFX, n)),
  molRing: (): HTMLCanvasElement => frameCanvas(ATLAS_THROWFX, FX_MOLOTOV_RING),
  bile: (): HTMLCanvasElement[] => FX_BILE_SPLATS.map((n) => frameCanvas(ATLAS_FX, n)),
  scrap: (): HTMLCanvasElement => frameCanvas(ATLAS_FX, FX_CLOTH_SCRAP),
  bloaterFlash: (): HTMLCanvasElement => frameCanvas(ATLAS_FX, FX_EXPLOSION_BLOATER),
  gasClouds: (): HTMLCanvasElement[] => FX_GAS_CLOUDS.map((n) => frameCanvas(ATLAS_FX, n)),
  glow: (): HTMLCanvasElement => frameCanvas(ATLAS_FX, FX_GLOW),
  burntCar: (): HTMLCanvasElement => frameCanvas(ATLAS_DOWNTOWN, "vehicle_carburnt_a"),
  survivor: (w: string): HTMLCanvasElement => relitSurvivor(w), // relit (9.13), as the game shows it
  survivorGun: (w: string): HTMLCanvasElement => frameCanvas(ATLAS_CHARACTERS, `survivorgun_${w}_a`),
};

/**
 * Re-plays a pure particle sim to time t (fixed 1/60 s steps), the way the game's views step them every frame.
 * Stepping forward is incremental; a jump back (a new loop, a still drawn earlier) re-runs from 0.
 */
export class Replay<S> {
  private s: S | null = null;
  private simT = 0;
  private seed = Number.NaN;
  private low = false;
  constructor(
    private readonly create: (seed: number, low: boolean) => S,
    private readonly step: (s: S, dt: number, T: number) => void,
    readonly dt = 1 / 60,
  ) {}
  at(t: number, seed: number, low: boolean): S {
    if (!this.s || seed !== this.seed || low !== this.low || t < this.simT - 1e-6) {
      this.s = this.create(seed, low);
      this.simT = 0;
      this.seed = seed;
      this.low = low;
    }
    while (this.simT + this.dt <= t + 1e-9) {
      this.simT += this.dt;
      this.step(this.s, this.dt, this.simT);
    }
    return this.s;
  }
}

/* ======================= take A textures (shared, baked once) ======================= */

/** Black-body-ish ramp by temperature 0..1 (cold red-brown → white-yellow). Not the boss red: it is orange first. */
function heat(T: number): [number, number, number] {
  const S: [number, number, number, number][] = [
    [0, 70, 18, 6],
    [0.25, 170, 52, 10],
    [0.45, 236, 108, 22],
    [0.65, 255, 168, 52],
    [0.85, 255, 222, 140],
    [1, 255, 248, 226],
  ];
  const t = Math.max(0, Math.min(1, T));
  for (let i = 1; i < S.length; i++) {
    const b = S[i] as [number, number, number, number];
    if (t <= b[0]) {
      const a = S[i - 1] as [number, number, number, number];
      const u = (t - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
    }
  }
  return [255, 248, 226];
}
export const FLAME_A_STEPS = 6;
/** Box blur of a mask (bake only). */
function blurMask(m: Float32Array, n: number, r: number): Float32Array {
  const a = new Float32Array(n * n);
  const b = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let s = 0;
      let k = 0;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= n) continue;
        s += m[y * n + xx] as number;
        k++;
      }
      a[y * n + x] = s / k;
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let s = 0;
      let k = 0;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= n) continue;
        s += a[yy * n + x] as number;
        k++;
      }
      b[y * n + x] = s / k;
    }
  return b;
}
/** Crops a canvas to its non-transparent box (+pad). Returns the crop and its share of the original size. */
export function cropAlpha(c: HTMLCanvasElement, pad = 2): { canvas: HTMLCanvasElement; fx: number; fy: number; fw: number; fh: number } {
  const rb = make(c.width, c.height);
  const rg = rb.getContext("2d", { willReadFrequently: true })!;
  rg.drawImage(c, 0, 0);
  const d = rg.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width;
  let y0 = c.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if ((d[(y * c.width + x) * 4 + 3] as number) > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { canvas: c, fx: 0, fy: 0, fw: 1, fh: 1 };
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(c.width - 1, x1 + pad);
  y1 = Math.min(c.height - 1, y1 + pad);
  const o = make(x1 - x0 + 1, y1 - y0 + 1);
  o.getContext("2d")!.drawImage(c, -x0, -y0);
  return { canvas: o, fx: x0 / c.width, fy: y0 / c.height, fw: o.width / c.width, fh: o.height / c.height };
}

export interface TakeA {
  /** [step][variant]: flames by temperature (step 0 = young, white-hot; 5 = old, red-brown), additive. */
  flame: HTMLCanvasElement[][];
  /** FS2's blue torch core (4 variants), additive. */
  torch: HTMLCanvasElement[];
  /** Lit smoke: [tone][variant]; tone 0 young (warm under-light from the fire), 1 mid, 2 old (thin, cool). */
  soot: HTMLCanvasElement[][];
  dust: HTMLCanvasElement[][];
  gas: HTMLCanvasElement[][];
  spark: HTMLCanvasElement;
  flash: HTMLCanvasElement;
  flashGas: HTMLCanvasElement;
  pool: HTMLCanvasElement;
  scorch: HTMLCanvasElement;
  scorchGlow: HTMLCanvasElement;
  fuel: HTMLCanvasElement;
  chunks: HTMLCanvasElement[];
  chunkShadows: HTMLCanvasElement[];
}
let A: TakeA | null = null;
export function takeA(): TakeA {
  if (A) return A;
  const masks = flameMasks();
  const FP = FLAME_SPRITE_PX;
  // flames: colour by local temperature = mask strength × the step's heat; tongues from fine noise
  const flame: HTMLCanvasElement[][] = [];
  for (let s = 0; s < FLAME_A_STEPS; s++) {
    const peak = 1 - s * 0.15; // young: white core; old: only orange-red left
    const row: HTMLCanvasElement[] = [];
    masks.forEach((m, v) => {
      const c = make(FP, FP);
      const g = c.getContext("2d")!;
      const img = g.createImageData(FP, FP);
      for (let y = 0; y < FP; y++)
        for (let x = 0; x < FP; x++) {
          const i = y * FP + x;
          const tongue = 0.75 + 0.5 * gfbm(x / 9 + v * 3, y / 7 - s, 31 + v, 3);
          const a = Math.min(1, (m[i] as number) * tongue);
          if (a < 0.01) continue;
          const [r, gg, b] = heat(Math.pow(a, 0.9) * peak);
          const j = i * 4;
          img.data[j] = r;
          img.data[j + 1] = gg;
          img.data[j + 2] = b;
          img.data[j + 3] = Math.round(255 * Math.pow(a, 1.1) * (1 - s * 0.08));
        }
      g.putImageData(img, 0, 0);
      row.push(c);
    });
    flame.push(row);
  }
  const torch = masks.map((m) => {
    const c = make(FP, FP);
    const g = c.getContext("2d")!;
    const img = g.createImageData(FP, FP);
    for (let i = 0; i < FP * FP; i++) {
      const a = m[i] as number;
      if (a < 0.01) continue;
      const k = Math.pow(a, 0.8);
      img.data[i * 4] = 140 + 115 * k * k;
      img.data[i * 4 + 1] = 180 + 75 * k;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(255 * Math.pow(a, 1.2));
    }
    g.putImageData(img, 0, 0);
    return c;
  });
  // smoke: a height from the blurred mask, lit by the key light (upper left), cool tint; matter, normal blend
  const SP = SMOKE_SPRITE_PX;
  const sm = [0, 1, 2].map((v) => smokeMask(v));
  const smb = sm.map((m) => blurMask(m, SP, 4));
  const L = [LIGHT.dx * 0.7, LIGHT.dy * 0.7, 0.5];
  const ll = Math.hypot(L[0] as number, L[1] as number, L[2] as number);
  const lit = (base: readonly [number, number, number][], warm: readonly number[], alphaK: readonly number[], detail: number): HTMLCanvasElement[][] =>
    base.map((col, tone) =>
      sm.map((m, v) => {
        const hb = smb[v] as Float32Array;
        const c = make(SP, SP);
        const g = c.getContext("2d")!;
        const img = g.createImageData(SP, SP);
        for (let y = 1; y < SP - 1; y++)
          for (let x = 1; x < SP - 1; x++) {
            const i = y * SP + x;
            const a = m[i] as number;
            if (a < 0.01) continue;
            const nx = ((hb[i - 1] as number) - (hb[i + 1] as number)) * 6;
            const ny = ((hb[i - SP] as number) - (hb[i + SP] as number)) * 6;
            const nl = Math.hypot(nx, ny, 1);
            const lam = Math.max(0, (nx * (L[0] as number) + ny * (L[1] as number) + (L[2] as number)) / (nl * ll));
            const det = 1 + detail * (gfbm(x / 6 + v * 7, y / 6 + tone * 3, 17 + v, 4) - 0.5);
            const sh = (0.42 + 0.75 * lam) * det;
            // the warm under-light from the fire sits on the side facing away from the key (down-right), young puffs only
            const under = (warm[tone] as number) * Math.max(0, -(nx * (L[0] as number) + ny * (L[1] as number)) / nl) * 1.6;
            const j = i * 4;
            img.data[j] = Math.min(255, col[0] * sh * LIGHT.tint[0] + 255 * under);
            img.data[j + 1] = Math.min(255, col[1] * sh * LIGHT.tint[1] + 120 * under);
            img.data[j + 2] = Math.min(255, col[2] * sh * LIGHT.tint[2] + 40 * under);
            img.data[j + 3] = Math.round(255 * Math.min(1, a * (alphaK[tone] as number)));
          }
        g.putImageData(img, 0, 0);
        return c;
      }),
    );
  const soot = lit(
    [
      [88, 74, 66],
      [62, 60, 60],
      [56, 58, 62],
    ],
    [0.35, 0.08, 0],
    [1, 0.95, 0.8],
    0.5,
  );
  const dust = lit(
    [
      [150, 132, 108],
      [126, 116, 102],
      [108, 104, 98],
    ],
    [0.12, 0, 0],
    [1, 0.9, 0.75],
    0.55,
  );
  const gas = lit(
    [
      [178, 196, 92],
      [158, 176, 84],
      [140, 156, 80],
    ],
    [0, 0, 0],
    [0.9, 0.8, 0.65],
    0.4,
  );
  // a spark streak: white-hot head, orange tail (additive, cropped tight)
  const spark = make(40, 10);
  {
    const g = spark.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 40, 0);
    gr.addColorStop(0, "rgba(255,120,30,0)");
    gr.addColorStop(0.6, "rgba(255,170,70,0.55)");
    gr.addColorStop(0.9, "rgba(255,240,200,1)");
    gr.addColorStop(1, "rgba(255,250,230,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(20, 5, 20, 3.2, 0, 0, Math.PI * 2);
    g.fill();
  }
  // flash: a white core, short soft rays, an amber halo (light: additive; square = its circle, nothing wasted)
  const flashOf = (core: string, mid: string, halo: string, rays: number, seed: number): HTMLCanvasElement => {
    const N = 192;
    const c = make(N, N);
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    gr.addColorStop(0, core);
    gr.addColorStop(0.12, core);
    gr.addColorStop(0.3, mid);
    gr.addColorStop(0.62, halo);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, N, N);
    const r = rng(seed);
    g.globalCompositeOperation = "lighter";
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2 + r() * 0.5;
      const len = N * (0.3 + r() * 0.17);
      g.save();
      g.translate(N / 2, N / 2);
      g.rotate(a);
      const lg = g.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, mid);
      lg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(0, -N * 0.035);
      g.lineTo(len, 0);
      g.lineTo(0, N * 0.035);
      g.fill();
      g.restore();
    }
    return c;
  };
  const flash = flashOf("rgba(255,252,240,1)", "rgba(255,200,110,0.75)", "rgba(255,120,30,0.18)", 7, 41);
  const flashGas = flashOf("rgba(248,255,230,1)", "rgba(214,236,120,0.7)", "rgba(150,190,60,0.16)", 5, 43);
  // light pool on the ground: warm, soft, ends exactly at its circle (additive)
  const pool = make(128, 128);
  {
    const g = pool.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,170,80,0.9)");
    gr.addColorStop(0.45, "rgba(255,128,48,0.45)");
    gr.addColorStop(0.8, "rgba(220,90,30,0.14)");
    gr.addColorStop(1, "rgba(200,70,20,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  // scorch: the mark. Soot thickest at the centre, blast rays outward, cracked bitumen, an ash rim; matte, no specks
  const SC = 256;
  const scorch = make(SC, SC);
  const scorchGlow = make(128, 128);
  {
    const g = scorch.getContext("2d")!;
    const img = g.createImageData(SC, SC);
    const rays = 26;
    for (let y = 0; y < SC; y++)
      for (let x = 0; x < SC; x++) {
        const dx = (x + 0.5) / (SC / 2) - 1;
        const dy = (y + 0.5) / (SC / 2) - 1;
        const r = Math.hypot(dx, dy);
        if (r >= 1) continue;
        const an = Math.atan2(dy, dx);
        const edge = 0.78 + 0.22 * gfbm(Math.cos(an) * 2 + 3, Math.sin(an) * 2, 5, 4);
        const rr = r / edge;
        if (rr >= 1) continue;
        const ray = Math.pow(Math.abs(Math.sin(an * rays * 0.5 + gfbm(an * 3, r * 2, 9, 3) * 3)), 6);
        const body = Math.pow(1 - rr, 0.8);
        const n = gfbm(x / 14, y / 14, 3, 5);
        const crack = Math.max(0, 1 - Math.abs(gfbm(x / 22, y / 22, 77, 4) - 0.5) * 22) * (1 - rr) * 0.5;
        let a = body * (0.7 + 0.3 * n) + ray * (1 - rr) * 0.35 * (rr > 0.25 ? 1 : 0) + crack;
        const ash = Math.exp(-Math.pow((rr - 0.82) / 0.07, 2)) * 0.25 * (0.6 + 0.4 * hash2(x >> 2, y >> 2, 4));
        a = Math.min(0.95, a);
        const j = (y * SC + x) * 4;
        const v = 14 + 10 * n + 60 * ash;
        img.data[j] = v + 2;
        img.data[j + 1] = v;
        img.data[j + 2] = v - 1;
        img.data[j + 3] = Math.round(255 * Math.min(1, a * 0.9 + ash));
      }
    g.putImageData(img, 0, 0);
    // embers still glowing in the fresh mark (additive, fades in the first 1.5 s)
    const h = scorchGlow.getContext("2d")!;
    const gi = h.createImageData(128, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const r = Math.hypot(x / 64 - 1, y / 64 - 1);
        if (r >= 0.8) continue;
        const n = gfbm(x / 5, y / 5, 61, 4);
        const k = Math.max(0, (n - 0.55) * 4) * (1 - r / 0.8);
        if (k <= 0) continue;
        const j = (y * 128 + x) * 4;
        gi.data[j] = 255;
        gi.data[j + 1] = 110 + 80 * k;
        gi.data[j + 2] = 30;
        gi.data[j + 3] = Math.round(255 * Math.min(1, k) * 0.8);
      }
    h.putImageData(gi, 0, 0);
    h.filter = "blur(1.5px)";
    h.drawImage(scorchGlow, 0, 0);
    h.filter = "none";
  }
  // spilled fuel: a dark wet stain with a faint oily sheen (normal blend)
  const fuel = make(192, 192);
  {
    const g = fuel.getContext("2d")!;
    const img = g.createImageData(192, 192);
    for (let y = 0; y < 192; y++)
      for (let x = 0; x < 192; x++) {
        const dx = x / 96 - 1;
        const dy = y / 96 - 1;
        const r = Math.hypot(dx, dy);
        const an = Math.atan2(dy, dx);
        const e = 0.7 + 0.3 * gfbm(Math.cos(an) * 1.6 + 1, Math.sin(an) * 1.6, 23, 4);
        if (r >= e) continue;
        const n = gfbm(x / 18, y / 18, 29, 4);
        const sheen = Math.pow(Math.max(0, 0.5 + 0.5 * Math.sin((n * 2.2 + dx * 0.8 - dy * 0.5) * Math.PI)), 3) * 0.22 * Math.max(0, 0.6 - (dx + dy) * 0.5);
        const j = (y * 192 + x) * 4;
        img.data[j] = 12 + 70 * sheen;
        img.data[j + 1] = 12 + 50 * sheen;
        img.data[j + 2] = 14 + 90 * sheen;
        img.data[j + 3] = Math.round(255 * Math.min(0.75, (1 - r / e) * 3) * 0.8);
      }
    g.putImageData(img, 0, 0);
  }
  // debris: six asphalt / concrete chunks drawn as faceted lumps and put through the characters' relight
  const chunks: HTMLCanvasElement[] = [];
  const chunkShadows: HTMLCanvasElement[] = [];
  const CN = 48;
  for (let k = 0; k < 6; k++) {
    const src = make(CN * 2, CN * 2);
    const g = src.getContext("2d", { willReadFrequently: true })!; // the relight reads it back
    const r = rng(500 + k);
    const n = 6 + Math.floor(r() * 3);
    const base = k % 3 === 0 ? [92, 90, 86] : k % 3 === 1 ? [46, 46, 48] : [128, 122, 112];
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4;
      const rr = CN * (0.42 + r() * 0.36);
      const x = CN + Math.cos(a) * rr;
      const y = CN + Math.sin(a) * rr * 0.8;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    g.fill();
    // aggregate: soft patches (no hard specks)
    g.save();
    g.clip();
    for (let i = 0; i < 26; i++) {
      const x = r() * CN * 2;
      const y = r() * CN * 2;
      const rad = 3 + r() * 7;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const l = r() < 0.5 ? 30 : -24;
      gr.addColorStop(0, `rgba(${base[0] + l},${base[1] + l},${base[2] + l},0.55)`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // a lit top face (upper left) and a dark broken side (lower right)
    const lg = g.createLinearGradient(CN * 0.4, CN * 0.4, CN * 1.6, CN * 1.6);
    lg.addColorStop(0, "rgba(255,255,255,0.18)");
    lg.addColorStop(0.55, "rgba(0,0,0,0)");
    lg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = lg;
    g.fillRect(0, 0, CN * 2, CN * 2);
    g.restore();
    const L2 = run(relightCharSteps(src, CN, 2, CN * 0.8, 77 + k, make));
    const cr = cropAlpha(L2.base);
    chunks.push(cr.canvas);
    const sh = make(cr.canvas.width + 8, cr.canvas.height + 8);
    const sg = sh.getContext("2d")!;
    sg.filter = "blur(2px) brightness(0)";
    sg.globalAlpha = 0.7;
    sg.drawImage(cr.canvas, 4, 4);
    chunkShadows.push(sh);
  }
  A = { flame, torch, soot, dust, gas, spark, flash, flashGas, pool, scorch, scorchGlow, fuel, chunks, chunkShadows };
  return A;
}
export function takeATextures(keys: readonly (keyof TakeA)[]): { name: string; canvas: HTMLCanvasElement; note?: string }[] {
  const a = takeA();
  const out: { name: string; canvas: HTMLCanvasElement; note?: string }[] = [];
  for (const k of keys) {
    const v = a[k] as HTMLCanvasElement | HTMLCanvasElement[] | HTMLCanvasElement[][];
    if (Array.isArray(v)) {
      (v as (HTMLCanvasElement | HTMLCanvasElement[])[]).forEach((x, i) => {
        if (Array.isArray(x)) x.forEach((y, j) => out.push({ name: `A ${k} ${i}.${j}`, canvas: y }));
        else out.push({ name: `A ${k} ${i}`, canvas: x });
      });
    } else out.push({ name: `A ${k}`, canvas: v });
  }
  return out;
}

/** A game frame put through the characters' relight (keep the design, raise the rendering), cropped. */
export function relitFrame(src: HTMLCanvasElement, outPx: number, seed: number, pxPerR = outPx * 0.8): HTMLCanvasElement {
  const s = make(outPx * 2, outPx * 2);
  const g = s.getContext("2d", { willReadFrequently: true })!; // the relight reads it back
  const k = Math.min((outPx * 2 * 0.9) / src.width, (outPx * 2 * 0.9) / src.height);
  g.drawImage(src, outPx - (src.width * k) / 2, outPx - (src.height * k) / 2, src.width * k, src.height * k);
  return run(relightCharSteps(s, outPx, 2, pxPerR, seed, make)).base;
}
/** A soft drop shadow of a picture (bake). */
export function shadowOf(src: HTMLCanvasElement, blurPx = 2, alpha = 0.6): HTMLCanvasElement {
  const p = blurPx * 2;
  const c = make(src.width + p * 2, src.height + p * 2);
  const g = c.getContext("2d")!;
  g.filter = `blur(${blurPx}px) brightness(0)`;
  g.globalAlpha = alpha;
  g.drawImage(src, p, p);
  return c;
}
