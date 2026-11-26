/**
 * Telegraphs, goal-first takes (-G): bake helpers. Everything here runs once in a Look's `bake()`; `draw()` only blits.
 * Light textures are cropped to their visible area (Story 9.15: a full-frame additive quad costs ~1 FPS): an edge is
 * 24 arc pieces of 15°, a zone's wash is 8 annulus pieces of 45°, a lane edge is one thin strip cropped to its range.
 */
import { make, countSprite, clamp01 } from "./kit";
import { fbm } from "./telegraphs-art";

/** A piece of a texture placed in a local frame (metres), rotated about the anchor. */
export interface GSeg {
  tex: HTMLCanvasElement;
  x0: number;
  y0: number;
  w: number;
  h: number;
}

const rgb = (s: string): [number, number, number] => s.split(",").map(Number) as [number, number, number];

/**
 * One piece of an EDGE of light at radius R (m), centred on +x, `span` rad wide: a hot core line `core` m thick and a
 * bloom `outM` outside / `inM` inside, mottled like light on rough asphalt. The ends fade over 0.02 rad so adjacent
 * pieces (drawn every `span`) blend into one line.
 */
export function edgeArc(R: number, span: number, o: { inM: number; outM: number; core: number; pxm: number; seed: number; hot: string; bloom: string }): GSeg {
  const half = span / 2 + 0.02;
  const rIn = R - o.inM;
  const rOut = R + o.outM;
  const x0 = rIn * Math.cos(half);
  const y0 = -rOut * Math.sin(half);
  const W = Math.ceil((rOut - x0) * o.pxm);
  const H = Math.ceil(-2 * y0 * o.pxm);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  const hot = rgb(o.hot);
  const bl = rgb(o.bloom);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const x = x0 + (px + 0.5) / o.pxm;
      const y = y0 + (py + 0.5) / o.pxm;
      const ang = Math.atan2(y, x);
      if (Math.abs(ang) > half) continue;
      const dr = Math.hypot(x, y) - R;
      const ag = 0.74 + 0.26 * fbm(x * 6, y * 6, o.seed);
      const bloom = (dr >= 0 ? Math.exp(-Math.pow(dr / (o.outM * 0.45), 2)) : Math.exp(-Math.pow(-dr / (o.inM * 0.45), 1.6))) * ag;
      const core = Math.exp(-Math.pow(dr / (o.core * 0.5), 2));
      const endF = clamp01((half - Math.abs(ang)) / 0.04);
      const a = clamp01(bloom * 0.7 + core) * endF;
      const k = core / (core + bloom * 0.7 + 1e-6);
      const j = (py * W + px) * 4;
      img.data[j] = Math.round(bl[0] + (hot[0] - bl[0]) * k);
      img.data[j + 1] = Math.round(bl[1] + (hot[1] - bl[1]) * k);
      img.data[j + 2] = Math.round(bl[2] + (hot[2] - bl[2]) * k);
      img.data[j + 3] = Math.round(255 * a);
    }
  g.putImageData(img, 0, 0);
  return { tex: c, x0, y0, w: W / o.pxm, h: H / o.pxm };
}

/**
 * One 45° piece of a zone's WASH: faint light on the asphalt between rIn and R, rising toward the edge (`a0` at rIn,
 * `a1` just inside R) and ending exactly at R (a 0.06 m soft edge), mottled. Drawn 8 times.
 */
export function washArc(rIn: number, R: number, o: { a0: number; a1: number; pxm: number; seed: number; col: string }): GSeg {
  const half = Math.PI / 8 + 0.02;
  const x0 = rIn * Math.cos(half);
  const y0 = -R * Math.sin(half) - 0.05;
  const W = Math.ceil((R + 0.05 - x0) * o.pxm);
  const H = Math.ceil(-2 * y0 * o.pxm);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  const col = rgb(o.col);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const x = x0 + (px + 0.5) / o.pxm;
      const y = y0 + (py + 0.5) / o.pxm;
      const ang = Math.atan2(y, x);
      if (Math.abs(ang) > half) continue;
      const r = Math.hypot(x, y);
      if (r < rIn - 0.3 || r > R + 0.05) continue;
      const u = clamp01((r - rIn) / (R - rIn));
      const inner = rIn > 0.01 ? clamp01((r - rIn + 0.3) / 0.3) : 1;
      const edge = clamp01((R - r) / 0.06 + 0.5);
      const ag = 0.7 + 0.3 * fbm(x * 3, y * 3, o.seed);
      const endF = clamp01((half - Math.abs(ang)) / 0.04);
      const a = (o.a0 + (o.a1 - o.a0) * u * u) * inner * edge * ag * endF;
      const j = (py * W + px) * 4;
      img.data[j] = col[0];
      img.data[j + 1] = col[1];
      img.data[j + 2] = col[2];
      img.data[j + 3] = Math.round(255 * clamp01(a));
    }
  g.putImageData(img, 0, 0);
  return { tex: c, x0, y0, w: W / o.pxm, h: H / o.pxm };
}

/** A straight edge of light along +x, `lenM` long: a hot core at y 0, bloom `wM` / 2 each side. */
export function edgeLine(lenM: number, wM: number, pxm: number, seed: number, hot: string, bloom: string): GSeg {
  const W = Math.ceil(lenM * pxm);
  const H = Math.ceil(wM * pxm);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  const h = rgb(hot);
  const b = rgb(bloom);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = (y + 0.5) / pxm - wM / 2;
      const core = Math.exp(-Math.pow(d / 0.04, 2));
      const bl = Math.exp(-Math.pow(d / (wM * 0.2), 2)) * (0.74 + 0.26 * fbm(x / pxm * 6, (y / pxm) * 6, seed));
      const a = clamp01(bl * 0.7 + core);
      const k = core / (core + bl * 0.7 + 1e-6);
      const j = (y * W + x) * 4;
      img.data[j] = Math.round(b[0] + (h[0] - b[0]) * k);
      img.data[j + 1] = Math.round(b[1] + (h[1] - b[1]) * k);
      img.data[j + 2] = Math.round(b[2] + (h[2] - b[2]) * k);
      img.data[j + 3] = Math.round(255 * a);
    }
  g.putImageData(img, 0, 0);
  return { tex: c, x0: 0, y0: -wM / 2, w: W / pxm, h: H / pxm };
}

/** The lane's wash: faint red light over `lenM` × `wM`, a little stronger toward both edges, mottled (low res: soft). */
export function laneWash(lenM: number, wM: number, pxm: number, seed: number): GSeg {
  const W = Math.ceil(lenM * pxm);
  const H = Math.ceil(wM * pxm);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = Math.abs((y + 0.5) / H - 0.5) * 2; // 0 centre, 1 edge
      const a = (0.55 + 0.45 * v * v) * (0.7 + 0.3 * fbm((x / pxm) * 3, (y / pxm) * 3, seed)) * clamp01((1 - v) / 0.03);
      const j = (y * W + x) * 4;
      img.data[j] = 255;
      img.data[j + 1] = 44;
      img.data[j + 2] = 30;
      img.data[j + 3] = Math.round(255 * clamp01(a));
    }
  g.putImageData(img, 0, 0);
  return { tex: c, x0: 0, y0: -wM / 2, w: W / pxm, h: H / pxm };
}

/** Blits a GSeg at (cx, cy) px, rotated, optionally showing only its x range [u0, u1] (0–1, Phaser `setCrop`). */
export function blitG(g: CanvasRenderingContext2D, s: GSeg, cx: number, cy: number, rot: number, pxm: number, a: number, add: boolean, u0 = 0, u1 = 1, scale = 1): void {
  const f0 = clamp01(u0);
  const f1 = clamp01(u1);
  if (a <= 0.003 || f1 - f0 <= 0.002) return;
  countSprite(add);
  g.save();
  g.globalAlpha = Math.min(1, a);
  if (add) g.globalCompositeOperation = "lighter";
  g.translate(cx, cy);
  if (rot) g.rotate(rot);
  const sx0 = Math.floor(s.tex.width * f0);
  const sx1 = Math.max(sx0 + 1, Math.round(s.tex.width * f1));
  const k = (s.w / s.tex.width) * pxm * scale;
  g.drawImage(s.tex, sx0, 0, sx1 - sx0, s.tex.height, s.x0 * pxm * scale + sx0 * k, s.y0 * pxm * scale, (sx1 - sx0) * k, s.h * pxm * scale);
  g.restore();
}

/**
 * Draws an edge made of `n` arc pieces round (cx, cy): piece i (clockwise from the top) gets alpha `base` + `lit(i)`.
 * `lit` is a fraction of the edge, so the edge itself is the dial: lit up to `upTo` (0–1) at `litA`, the rest at
 * `base`. The piece being crossed is lit by its share (no step).
 */
export function drawDial(g: CanvasRenderingContext2D, s: GSeg, n: number, cx: number, cy: number, pxm: number, base: number, litA: number, upTo: number, scale = 1): void {
  const span = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const lit = clamp01(upTo * n - i);
    blitG(g, s, cx, cy, -Math.PI / 2 + (i + 0.5) * span, pxm, base + (litA - base) * lit, true, 0, 1, scale);
  }
}

/** The CRASH word, horizontal, as amber light (bloom + core), `hM` tall. Baked once. */
export function wordShade(word: string, hM: number, pxm: number): HTMLCanvasElement {
  const fpx = Math.round(hM * pxm);
  const c = make(fpx * 3.9, fpx * 1.7);
  const g = c.getContext("2d")!;
  g.font = `bold ${fpx}px Oswald, Impact, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  // a dark under-plate so the amber reads on the lit body and on the street (matter: soft, not a box)
  g.filter = `blur(${fpx * 0.22}px)`;
  g.fillStyle = "rgba(10,8,6,0.75)";
  g.fillText(word, c.width / 2, c.height / 2);
  g.fillText(word, c.width / 2, c.height / 2);
  g.filter = "none";
  return c;
}
export function wordGlow(word: string, hM: number, pxm: number): HTMLCanvasElement {
  const fpx = Math.round(hM * pxm);
  const c = make(fpx * 3.9, fpx * 1.7);
  const g = c.getContext("2d")!;
  g.font = `bold ${fpx}px Oswald, Impact, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.filter = `blur(${fpx * 0.16}px)`;
  g.fillStyle = "rgba(255,150,30,0.9)";
  g.fillText(word, c.width / 2, c.height / 2);
  g.filter = "none";
  g.fillStyle = "rgba(255,222,150,1)";
  g.fillText(word, c.width / 2, c.height / 2);
  return c;
}

/** A soft dust film (matter, normal blend) the size of a decal: settled dust over fresh breaks, lit from the upper left. */
export function dustFilm(px: number, seed: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const img = g.createImageData(px, px);
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      const u = (x + 0.5) / px - 0.5;
      const v = (y + 0.5) / px - 0.5;
      const d = Math.hypot(u, v) * 2;
      if (d > 1) continue;
      const n = fbm(u * 7, v * 7, seed, 4);
      const a = clamp01((1 - d) * 1.4) * clamp01(n * 1.3 - 0.25) * 0.55;
      const lit = 0.9 + 0.12 * clamp01(0.5 - (u * 0.6 + v * 0.8));
      const j = (y * px + x) * 4;
      img.data[j] = 172 * lit * 0.93;
      img.data[j + 1] = 164 * lit * 0.98;
      img.data[j + 2] = 152 * lit * 1.06;
      img.data[j + 3] = Math.round(255 * a);
    }
  g.putImageData(img, 0, 0);
  return c;
}
