/**
 * Fire family, goal-first takes (`-G`, dead-city-model fx.md › FX 4): the textures and helpers the -G looks share.
 * Everything is baked ONCE (`gk()`); the looks' draw() only places sprites. Flames, soot, dust, gas, sparks, flash,
 * light pool, scorch and chunks are take A's (`fire-kit.ts › takeA`), so a -G differs from A by what it draws where,
 * not by new pictures of the same thing.
 *
 * New here, each made for one read:
 *  - heat zone + heat line: a zone the game computes as a circle, shown by heat (the FI-B rule), for MO-G;
 *  - blast front ×3: the round edge of a blast, cooling white → orange → red-brown (EX1-G: the reach, by light);
 *  - crack star + dust deposit: EX2-G's mark, its cracks and settled dust end at the reach;
 *  - cone light: the flamers' floor light, shaped like the cone the game computes (FS-G);
 *  - gas body: the Bloater cloud as one lit volume whose rolled rim is its edge (BX-G);
 *  - glass shard: the Molotov's broken bottle;
 *  - shadows by height ×3 (GR-G).
 */
import { make, rng, LIGHT } from "./kit";
import { takeA, type TakeA } from "./fire-kit";
import { fbm as gfbm } from "../../../../apps/client/src/render/city/groundDamageArt";

export const on = (st: { only: string | null }, id: string): boolean => st.only === null || st.only === id;
export const hash = (n: number): number => {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
/** The game's wind (fireParticles: 0.55, 0.32), normalised. */
export const WIND: readonly [number, number] = ((): [number, number] => {
  const l = Math.hypot(0.55, 0.32);
  return [0.55 / l, 0.32 / l];
})();
export const WIND_ANG = Math.atan2(WIND[1], WIND[0]);
/** The damage pulse (0.5 s): 1 at the tick, back to 0 in 0.25 s (same as FI-B). */
export const pulse05 = (t: number): number => (t < 0 ? 0 : Math.max(0, 1 - (t % 0.5) / 0.25) ** 2);
/** Rings and zones are baked with their edge at 96 % of the half size: draw them `2R / 0.96` wide. */
export const EDGE = 0.96;

export interface GKit {
  A: TakeA;
  heat: HTMLCanvasElement;
  heatLine: HTMLCanvasElement;
  front: HTMLCanvasElement[];
  cracks: HTMLCanvasElement;
  deposit: HTMLCanvasElement;
  cone6: HTMLCanvasElement;
  cone3: HTMLCanvasElement;
  gasBody: HTMLCanvasElement;
  shard: HTMLCanvasElement;
}
let K: GKit | null = null;

function pixels(w: number, h: number, f: (x: number, y: number, out: number[]) => boolean): HTMLCanvasElement {
  const c = make(w, h);
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const o = [0, 0, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!f(x, y, o)) continue;
      const j = (y * w + x) * 4;
      img.data[j] = o[0] as number;
      img.data[j + 1] = o[1] as number;
      img.data[j + 2] = o[2] as number;
      img.data[j + 3] = Math.round(255 * Math.min(1, Math.max(0, o[3] as number)));
    }
  g.putImageData(img, 0, 0);
  return c;
}

export function gk(): GKit {
  if (K) return K;
  const A = takeA();
  // heat on the ground: warm, brightest at the centre, a floor of warmth to the edge, ends AT R (FI-B's rule)
  const HP = 192;
  const heat = pixels(HP, HP, (x, y, o) => {
    const d = Math.hypot(x + 0.5 - HP / 2, y + 0.5 - HP / 2) / (HP / 2) / EDGE;
    if (d > 1.04) return false;
    const inner = 0.5 + 0.25 * Math.max(0, 1 - d); // a near-even floor of warmth: the hot spot comes from the flames' own light, where the fuel is
    const edge = d <= 1 ? 1 : Math.max(0, 1 - (d - 1) / 0.04);
    o[0] = 255;
    o[1] = 118 + 70 * (1 - d);
    o[2] = 40 + 30 * (1 - d);
    o[3] = inner * edge;
    return true;
  });
  // the heat line on the edge: thin, soft, slightly uneven (heat, not a drawn circle)
  const EP = 256;
  const wr = rng(78);
  const wob = [wr(), wr(), wr(), wr()];
  const heatLine = pixels(EP, EP, (x, y, o) => {
    const dx = x + 0.5 - EP / 2;
    const dy = y + 0.5 - EP / 2;
    const d = Math.hypot(dx, dy);
    const R = (EP / 2) * EDGE;
    const band = Math.abs(d - R) / (EP * 0.011);
    if (band > 3 && d > R) return false;
    const ang = Math.atan2(dy, dx);
    let w = 0;
    for (let k = 0; k < 4; k++) w += Math.sin(ang * (k + 2) + (wob[k] as number) * 6.28) * 0.25;
    const inner = d < R ? Math.exp(-(((R - d) / (EP * 0.035)) ** 2)) * 0.3 : 0;
    o[0] = 255;
    o[1] = 140;
    o[2] = 62;
    o[3] = Math.exp(-band * band) * (0.75 + 0.25 * w) + inner;
    return o[3] > 0.004;
  });
  // the blast front: a soft band on R with a short trailing glow inside, three temperatures (light, additive)
  const FP = 256;
  const front = [
    [255, 246, 214],
    [255, 160, 60],
    [190, 70, 18],
  ].map(([r, gg, b]) =>
    pixels(FP, FP, (x, y, o) => {
      const d = Math.hypot(x + 0.5 - FP / 2, y + 0.5 - FP / 2) / (FP / 2) / EDGE; // 1 = R
      if (d > 1.04 || d < 0.45) return false;
      // a pressure front of hot air, not a line: a soft leading band, a long trailing glow, torn by turbulence
      const band = d > 1 ? Math.max(0, 1 - (d - 1) / 0.04) : 0.55 * Math.exp(-(((1 - d) / 0.06) ** 2)) + 0.4 * Math.exp(-(((1 - d) / 0.2) ** 2));
      const n = 0.45 + 0.9 * gfbm((x / FP) * 9, (y / FP) * 9, 61, 4);
      o[0] = r as number;
      o[1] = gg as number;
      o[2] = b as number;
      o[3] = Math.min(1, band) * n;
      return o[3] > 0.004;
    }),
  );
  // EX2's mark: a crater, cracks radiating out and ending at R, concrete dust settled at the reach (matte)
  const CP = 256;
  const cracks = make(CP, CP);
  {
    const g = cracks.getContext("2d")!;
    const C = CP / 2;
    const Rpx = C * EDGE;
    const r = rng(907);
    // pit: soft, darker centre, a pale lip on the side facing the light (upper left)
    const pit = g.createRadialGradient(C, C, 0, C, C, Rpx * 0.22);
    pit.addColorStop(0, "rgba(12,11,10,0.85)");
    pit.addColorStop(0.6, "rgba(20,18,16,0.55)");
    pit.addColorStop(1, "rgba(20,18,16,0)");
    g.fillStyle = pit;
    g.fillRect(0, 0, CP, CP);
    g.strokeStyle = "rgba(170,160,145,0.22)";
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(C, C, Rpx * 0.14, Math.PI * 0.95, Math.PI * 1.65);
    g.stroke();
    // soot fans along the cracks (soft, low contrast)
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = Rpx * (0.15 + r() * 0.5);
      const x = C + Math.cos(a) * d;
      const y = C + Math.sin(a) * d;
      const rad = 10 + r() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(16,14,12,${0.12 + r() * 0.08})`);
      gr.addColorStop(1, "rgba(16,14,12,0)");
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // cracks: 9 main ones, jagged, thinning out, the longest ending exactly at R, a few branches
    const crack = (x0: number, y0: number, a0: number, len: number, w0: number, depth: number): void => {
      let x = x0;
      let y = y0;
      let a = a0;
      const steps = Math.max(4, Math.round(len / 4));
      for (let s = 0; s < steps; s++) {
        const u = s / steps;
        a += (r() - 0.5) * 0.8;
        a += (a0 - a) * 0.25; // jagged, but it keeps running outward
        const nx = x + Math.cos(a) * (len / steps);
        const ny = y + Math.sin(a) * (len / steps);
        const w = w0 * (1 - u * 0.75);
        // the crack's far wall catches the light: a pale hairline on its lower-right edge, the dark gap above
        g.strokeStyle = "rgba(150,142,130,0.1)";
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x + 1, y + 1);
        g.lineTo(nx + 1, ny + 1);
        g.stroke();
        g.strokeStyle = `rgba(8,7,6,${0.55 - u * 0.35})`;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(nx, ny);
        g.stroke();
        if (depth > 0 && r() < 0.06) crack(nx, ny, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.4), len * (1 - u) * 0.45, w * 0.7, depth - 1);
        x = nx;
        y = ny;
      }
    };
    g.lineCap = "round";
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + r() * 0.5;
      const start = Rpx * 0.12;
      const len = (k % 3 === 0 ? Rpx * 0.97 : Rpx * (0.5 + r() * 0.35)) - start;
      crack(C + Math.cos(a) * start, C + Math.sin(a) * start, a, len, 2.6, 1);
    }
  }
  // the dust the shock front dropped where it stopped: a soft pale band just inside R (matte, normal blend)
  const deposit = pixels(CP, CP, (x, y, o) => {
    const d = Math.hypot(x + 0.5 - CP / 2, y + 0.5 - CP / 2) / (CP / 2) / EDGE;
    if (d > 1.02 || d < 0.6) return false;
    const n = gfbm(x / 10, y / 10, 313, 4);
    const band = d > 1 ? Math.max(0, 1 - (d - 1) / 0.03) : Math.exp(-(((1 - d) / 0.06) ** 2));
    o[0] = 150 * LIGHT.tint[0];
    o[1] = 138 * LIGHT.tint[1];
    o[2] = 120 * LIGHT.tint[2];
    o[3] = band * (0.2 + 0.8 * n) * 0.6;
    return o[3] > 0.004;
  });
  // the flamers' floor light: the cone the game computes (range, half angle), from the nozzle (left middle). 24 px/m
  const cone = (range: number, half: number): HTMLCanvasElement => {
    const PX = 24;
    const W = Math.ceil(range * PX * 1.02);
    const H = Math.ceil(2 * range * Math.tan(half) * PX * 1.1) + 8;
    return pixels(W, H, (x, y, o) => {
      const dx = (x + 0.5) / PX;
      const dy = (y + 0.5 - H / 2) / PX;
      const d = Math.hypot(dx, dy);
      const a = Math.abs(Math.atan2(dy, dx));
      if (d > range * 1.01 || a > half * 1.12) return false;
      // brightest along the stream, still readable at the cone's side (40 %), soft past it; it ends at the reach
      const q = a / half;
      const ang = q <= 1 ? 0.4 + 0.6 * Math.exp(-((q / 0.55) ** 2)) : Math.max(0, 0.4 * (1 - (q - 1) / 0.12));
      const rad = d < range * 0.9 ? 1 : Math.max(0, 1 - (d - range * 0.9) / (range * 0.11));
      const near = Math.min(1, d / 0.6);
      const k = ang * rad * near * (0.6 + 0.4 * (1 - d / range)) * (0.85 + 0.3 * gfbm(x / 14, y / 14, 88, 3));
      o[0] = 255;
      o[1] = 150;
      o[2] = 62;
      o[3] = k;
      return k > 0.004;
    });
  };
  const cone6 = cone(6, (10 * Math.PI) / 180);
  const cone3 = cone(3, (30 * Math.PI) / 180);
  // the gas cloud as one lit volume: dense body, a rolled rim at the edge (the edge IS the cloud's), lit top-left
  const GP = 256;
  const dens = new Float32Array(GP * GP);
  for (let y = 0; y < GP; y++)
    for (let x = 0; x < GP; x++) {
      const dx = x + 0.5 - GP / 2;
      const dy = y + 0.5 - GP / 2;
      const d = Math.hypot(dx, dy) / (GP / 2) / EDGE;
      if (d > 1.03) continue;
      const n = gfbm(x / 30, y / 30, 515, 5);
      const rim = Math.exp(-(((d - 0.91) / 0.06) ** 2)) * 0.3;
      const body = 0.72 + 0.1 * (1 - d);
      const edge = d <= 0.97 ? 1 : Math.max(0, 1 - (d - 0.97) / 0.06);
      dens[y * GP + x] = (body + rim) * (0.7 + 0.5 * n) * edge;
    }
  const gasBody = pixels(GP, GP, (x, y, o) => {
    if (x < 1 || y < 1 || x >= GP - 1 || y >= GP - 1) return false;
    const i = y * GP + x;
    const a = dens[i] as number;
    if (a < 0.01) return false;
    const nx = ((dens[i - 1] as number) - (dens[i + 1] as number)) * 5;
    const ny = ((dens[i - GP] as number) - (dens[i + GP] as number)) * 5;
    const lam = Math.max(0, (nx * LIGHT.dx + ny * LIGHT.dy) / Math.hypot(nx, ny, 1)) ;
    const sh = 0.62 + 0.55 * lam;
    o[0] = 150 * sh * LIGHT.tint[0];
    o[1] = 170 * sh * LIGHT.tint[1];
    o[2] = 78 * sh * LIGHT.tint[2];
    o[3] = Math.min(1, a) * 0.8;
    return true;
  });
  // a glass shard: a thin sliver, dark green-brown glass with a lit edge facing the upper left (matter, normal)
  const shard = make(16, 8);
  {
    const g = shard.getContext("2d")!;
    g.fillStyle = "rgba(70,62,40,0.85)";
    g.beginPath();
    g.moveTo(1, 5);
    g.lineTo(9, 1);
    g.lineTo(15, 3);
    g.lineTo(7, 7);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(235,228,205,0.9)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(1.5, 4.6);
    g.lineTo(9, 1.3);
    g.stroke();
  }
  K = { A, heat, heatLine, front, cracks, deposit, cone6, cone3, gasBody, shard };
  return K;
}
