/**
 * Group 5, matter family: the take textures, made once at bake (never in draw). Everything is drawn for the street's
 * one key light from the upper left (kit.ts › LIGHT, cool tint): billows are brighter on the side facing the light and
 * self-shadowed on the far side, solid bits carry a soft shadow down-right. Textures meant to be tinted in the game
 * (Phaser multiplies the tint) are neutral grey-white with the light in their luminance, so one texture serves every
 * dust colour (Ruins materials, the Behemoth, placing a building).
 */
import { make, rng, LIGHT } from "./kit";

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function h2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s);
  const b = h2(xi + 1, yi, s);
  const c = h2(xi, yi + 1, s);
  const d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, s: number, oct = 4): number {
  let f = 0;
  let amp = 0.5;
  let fr = 1;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    f += amp * vnoise(x * fr, y * fr, s + o * 17);
    norm += amp;
    amp *= 0.5;
    fr *= 2.03;
  }
  return f / norm;
}
/** Direction toward the light (unit), in texture space (+y down). */
const TL = ((): [number, number] => {
  const l = Math.hypot(LIGHT.dx, LIGHT.dy);
  return [LIGHT.dx / l, LIGHT.dy / l];
})();

export interface PuffOpts {
  /** How ragged the edge is (0.3 soft dust … 0.7 wispy smoke). */
  rag?: number;
  /** Noise scale (bigger = smaller billows). */
  scale?: number;
  /** Peak alpha. */
  alpha?: number;
  /** Fill out to the edge (gas) instead of a round puff. */
  fill?: number;
  /** rgb multiplier (1,1,1 neutral). */
  rgb?: readonly [number, number, number];
  /** Self-shadow strength. */
  shade?: number;
}
/** A lit billow (dust, smoke, vapour, gas): neutral unless `rgb` is given; alpha soft to 0 at the frame edge. */
export function litPuff(px: number, seed: number, o: PuffOpts = {}): HTMLCanvasElement {
  const rag = o.rag ?? 0.45;
  const sc = o.scale ?? 2.2;
  const amax = o.alpha ?? 0.9;
  const fillTo = o.fill ?? 0;
  const [cr, cg, cb] = o.rgb ?? [1, 1, 1];
  const shade = o.shade ?? 1.6;
  const ox = seed * 3.17;
  const oy = seed * -1.93;
  const field = (x: number, y: number): number => {
    const r = Math.hypot(x, y);
    const n = fbm(x * sc + ox, y * sc + oy, 11 + seed, 3);
    const re = r + (0.5 - n) * rag;
    return fillTo > 0 ? smooth(1.0, fillTo, re) * (0.55 + 0.6 * n) : smooth(1.0, 0.25, re) * (0.6 + 0.55 * n);
  };
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  const e = 0.09;
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      const i = (py * px + qx) * 4;
      if (x * x + y * y >= 1) continue;
      const den = Math.min(1, field(x, y));
      if (den <= 0.004) continue;
      const toward = Math.min(1, field(x + TL[0] * e, y + TL[1] * e));
      // facing the light: denser here than toward the light; plus a broad side light
      let lum = 0.72 + shade * (den - toward) + 0.16 * (x * TL[0] + y * TL[1]);
      lum = Math.max(0.36, Math.min(1.04, lum));
      d[i] = Math.min(255, 255 * lum * LIGHT.tint[0] * cr);
      d[i + 1] = Math.min(255, 255 * lum * LIGHT.tint[1] * cg);
      d[i + 2] = Math.min(255, 255 * lum * LIGHT.tint[2] * cb);
      d[i + 3] = Math.max(0, Math.min(255, 255 * amax * den * smooth(1, 0.82, Math.hypot(x, y))));
    }
  g.putImageData(im, 0, 0);
  // soften the interior (the relight lesson: fine noise in the shading reads as crumpled paper)
  const out = make(px, px);
  const og = out.getContext("2d")!;
  og.filter = `blur(${Math.max(0.6, px / 90)}px)`;
  og.drawImage(c, 0, 0);
  return out;
}

/** A copy of `src` multiplied by `rgb` (what Phaser's tint does), alpha kept. */
export function tinted(src: HTMLCanvasElement, rgb: readonly [number, number, number]): HTMLCanvasElement {
  const c = make(src.width, src.height);
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(src, 0, 0);
  return c;
}
/** A flat-colour silhouette of `src` (a shadow). */
export function silhouette(src: HTMLCanvasElement, col: string, blurPx = 0): HTMLCanvasElement {
  const pad = Math.ceil(blurPx * 2);
  const c = make(src.width + pad * 2, src.height + pad * 2);
  const g = c.getContext("2d")!;
  if (blurPx) g.filter = `blur(${blurPx}px)`;
  g.drawImage(src, pad, pad);
  g.filter = "none";
  g.globalCompositeOperation = "source-in";
  g.fillStyle = col;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** A concrete chip (grit) with its soft shadow down-right, neutral grey for tinting. 20 px for ~0.08 m. */
export function gritChip(seed: number): HTMLCanvasElement {
  const px = 20;
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const r = rng(seed);
  const n = 5 + Math.floor(r() * 3);
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.5;
    const rr = 4.2 + r() * 2.4;
    pts.push([px / 2 + Math.cos(a) * rr, px / 2 + Math.sin(a) * rr * 0.85]);
  }
  const path = (dx: number, dy: number): void => {
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy)));
    g.closePath();
  };
  g.filter = "blur(1.2px)";
  g.fillStyle = "rgba(0,0,0,0.55)";
  path(1.6, 2.1);
  g.fill();
  g.filter = "blur(0.35px)";
  const gr = g.createLinearGradient(px * 0.25, px * 0.2, px * 0.75, px * 0.8);
  gr.addColorStop(0, "#f4f4f2");
  gr.addColorStop(0.55, "#b4b2ae");
  gr.addColorStop(1, "#6c6a66");
  g.fillStyle = gr;
  path(0, 0);
  g.fill();
  g.filter = "none";
  return c;
}

/** An ash flake: face-on and edge-on (the tumble swaps them and squashes), neutral grey. */
export function ashFlake(edge: boolean, seed: number): HTMLCanvasElement {
  const c = make(16, 12);
  const g = c.getContext("2d")!;
  const r = rng(seed);
  g.filter = "blur(0.4px)";
  g.translate(8, 6);
  g.rotate(r() * 0.6 - 0.3);
  const gr = g.createLinearGradient(-6, -4, 6, 4);
  gr.addColorStop(0, "#efeeea");
  gr.addColorStop(1, "#7b7873");
  g.fillStyle = gr;
  g.beginPath();
  if (edge) g.ellipse(0, 0, 6, 1.3, 0, 0, Math.PI * 2);
  else {
    g.moveTo(-6, -1);
    g.quadraticCurveTo(-2, -5, 5, -3);
    g.quadraticCurveTo(7, 1, 3, 4);
    g.quadraticCurveTo(-3, 5, -6, -1);
  }
  g.fill();
  g.fillStyle = "rgba(40,36,34,0.55)";
  g.beginPath();
  g.ellipse(1, 1, edge ? 4 : 2.2, edge ? 0.6 : 1.4, 0.4, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Soft radial cropped to its visible area (additive glows: every texel shows). */
export function glowTex(px: number, rgb: string, core = 1, mid = 0.35): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  gr.addColorStop(0, `rgba(${rgb},${core})`);
  gr.addColorStop(0.35, `rgba(${rgb},${mid})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
  g.fill();
  return c;
}

/* ---------------- Acid ---------------- */

/** The glob's body (facing +x, no highlight: the highlight is its own unrotated sprite so it stays upper-left). */
export function acidGlob(): HTMLCanvasElement {
  const W = 72;
  const H = 40;
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const cy = H / 2;
  g.filter = "blur(0.5px)";
  // the tail: viscous drops stretching behind
  const drops: [number, number, number][] = [
    [50, 0, 11],
    [36, 1.2, 7],
    [26, -0.8, 5],
    [18, 0.6, 3.6],
    [11, -0.4, 2.4],
  ];
  for (const [x, dy, r] of drops) {
    const gr = g.createRadialGradient(x - r * 0.25, cy + dy - r * 0.25, 0, x, cy + dy, r);
    gr.addColorStop(0, "rgba(222,250,120,1)");
    gr.addColorStop(0.45, "rgba(150,210,48,0.97)");
    gr.addColorStop(0.85, "rgba(70,118,22,0.92)");
    gr.addColorStop(1, "rgba(44,74,14,0.75)");
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, cy + dy, r * 1.15, r, 0, 0, Math.PI * 2);
    g.fill();
  }
  // strings joining them
  g.strokeStyle = "rgba(120,180,40,0.85)";
  g.lineCap = "round";
  g.lineWidth = 3.2;
  g.beginPath();
  g.moveTo(48, cy);
  g.bezierCurveTo(34, cy + 1.5, 22, cy - 1, 10, cy);
  g.stroke();
  g.filter = "none";
  return c;
}
/** A small soft highlight (the street light on wet acid). */
export function wetHighlight(): HTMLCanvasElement {
  const c = make(20, 14);
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(10, 7, 0, 10, 7, 7);
  gr.addColorStop(0, "rgba(255,255,240,0.95)");
  gr.addColorStop(1, "rgba(255,255,240,0)");
  g.fillStyle = gr;
  g.scale(1, 0.6);
  g.beginPath();
  g.arc(10, 11.6, 7, 0, Math.PI * 2);
  g.fill();
  return c;
}

/**
 * The acid pool (side `px` = the 2 m damage circle). `glow` false = take B (matte liquid, light only in bubbles and on
 * the ring). Layers drawn into one texture: the etched asphalt (the mark), the liquid (deep olive centre, thin
 * see-through edges, a bright meniscus), the street light's reflection upper-left, the crisp damage ring at the edge
 * exactly where today's is (outer edge at the frame's half side, 3 px wide at 120 px: kept in proportion).
 */
export function acidPool(px: number, seed: number, glow: boolean): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const R = px / 2;
  const ring = Math.max(2, (3 / 120) * px);
  const inner = R - ring;
  const im = g.createImageData(px, px);
  const d = im.data;
  const rad = (a: number, k: number, s: number): number => k * (0.84 + 0.2 * (fbm(Math.cos(a) * 1.3 + s, Math.sin(a) * 1.3, 5 + s) - 0.5) * 2);
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = qx + 0.5 - R;
      const y = py + 0.5 - R;
      const r = Math.hypot(x, y);
      if (r >= inner) continue;
      const a = Math.atan2(y, x);
      const i = (py * px + qx) * 4;
      const n = fbm((x / px) * 7 + seed, (y / px) * 7, 3 + seed);
      // the mark: asphalt eaten by the acid, a little wider than the liquid
      const markR = rad(a, inner * 0.97, seed + 9);
      const liqR = rad(a, inner * 0.86, seed);
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let al = 0;
      if (r < markR) {
        const m = smooth(markR, markR - inner * 0.08, r);
        rr = 38 + 18 * n;
        gg = 40 + 16 * n;
        bb = 26 + 8 * n;
        al = 0.62 * m;
      }
      if (r < liqR) {
        const depth = smooth(liqR, liqR * 0.35, r) * (0.75 + 0.35 * n);
        const edge = smooth(liqR - inner * 0.07, liqR - inner * 0.015, r) * (1 - smooth(liqR - inner * 0.01, liqR, r));
        const lit = 0.5 + 0.5 * ((-x * TL[0] - y * TL[1]) / inner) * -1; // brighter toward the light side
        const L = glow ? 1.22 : 0.62;
        let lr = (110 + 70 * (1 - depth)) * L;
        let lg = (165 + 70 * (1 - depth)) * L;
        let lb = (30 + 30 * (1 - depth)) * L;
        // deep = darker olive
        lr = lr * (1 - 0.55 * depth) + 40 * depth * 0.55;
        lg = lg * (1 - 0.45 * depth) + 78 * depth * 0.45;
        lb = lb * (1 - 0.5 * depth) + 12 * depth * 0.5;
        // meniscus (bright rim of the liquid)
        lr += edge * 70 * L;
        lg += edge * 75 * L;
        lb += edge * 40 * L;
        // street light reflection (upper left, soft)
        const sx = x + inner * 0.36;
        const sy = y + inner * 0.38;
        const spec = Math.exp(-(sx * sx) / (inner * inner * 0.03) - (sy * sy) / (inner * inner * 0.012)) * (0.7 + 0.3 * lit);
        lr += spec * 150;
        lg += spec * 150;
        lb += spec * 140;
        const la = 0.55 + 0.4 * depth + 0.3 * edge;
        rr = rr * (1 - la) + lr * la;
        gg = gg * (1 - la) + lg * la;
        bb = bb * (1 - la) + lb * la;
        al = Math.max(al, 0.55 + 0.4 * depth + 0.4 * edge);
      }
      if (al <= 0) continue;
      d[i] = Math.min(255, rr);
      d[i + 1] = Math.min(255, gg);
      d[i + 2] = Math.min(255, bb);
      d[i + 3] = Math.min(255, al * 255);
    }
  g.putImageData(im, 0, 0);
  // the damage edge: crisp, outer edge at R (kept from today: your body touches the ring = you are in acid)
  g.beginPath();
  g.arc(R, R, R - ring / 2, 0, Math.PI * 2);
  g.strokeStyle = glow ? "rgba(190,255,90,0.95)" : "rgba(196,250,104,0.95)";
  g.lineWidth = ring;
  g.stroke();
  return c;
}
/** A bubble on the acid: 0 rising dome, 1 full dome, 2 popped ring. 24 px. */
export function acidBubble(f: number, glow: boolean): HTMLCanvasElement {
  const c = make(24, 24);
  const g = c.getContext("2d")!;
  g.filter = "blur(1px)";
  const r = f === 0 ? 5 : f === 1 ? 8 : 9;
  if (f < 2) {
    const gr = g.createRadialGradient(12 - r * 0.35, 12 - r * 0.4, 0, 12, 12, r);
    gr.addColorStop(0, glow ? "rgba(246,255,190,0.8)" : "rgba(236,255,170,0.7)");
    gr.addColorStop(0.5, "rgba(170,230,70,0.75)");
    gr.addColorStop(1, "rgba(60,110,20,0.5)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(12, 12, r, 0, Math.PI * 2);
    g.fill();
  } else {
    g.strokeStyle = "rgba(220,255,150,0.7)";
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(12, 12, r, 0, Math.PI * 2);
    g.stroke();
  }
  return c;
}

/* ---------------- Rain ---------------- */
/** A falling drop: a thin motion-blurred streak, faint tail to a brighter head (it catches the street light). */
export function rainStreak(): HTMLCanvasElement {
  const c = make(6, 64);
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, "rgba(200,216,236,0)");
  gr.addColorStop(0.7, "rgba(200,216,236,0.55)");
  gr.addColorStop(0.93, "rgba(232,242,255,1)");
  gr.addColorStop(1, "rgba(232,242,255,0)");
  g.fillStyle = gr;
  g.filter = "blur(0.6px)";
  g.fillRect(2, 0, 2, 64);
  return c;
}
/** The splash in 4 frames: impact crown, crown with droplets thrown out, the ring spreading, a last ripple. 64×36. */
export function rainSplash(f: number): HTMLCanvasElement {
  const W = 64;
  const H = 36;
  const c = make(W, H);
  const g = c.getContext("2d")!;
  g.filter = "blur(0.9px)";
  const cx = W / 2;
  const cy = H / 2;
  const ringR = [7, 13, 22, 29][f] as number;
  const ringA = [0.75, 0.6, 0.38, 0.18][f] as number;
  g.strokeStyle = `rgba(214,228,246,${ringA})`;
  g.lineWidth = f < 2 ? 1.8 : 1.2;
  g.beginPath();
  g.ellipse(cx, cy, ringR, ringR * 0.5, 0, 0, Math.PI * 2);
  g.stroke();
  if (f < 2) {
    // droplets thrown up and out (top-down: a ring of soft beads, the far ones brighter: lit from upper left)
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.3;
      const out = f === 0 ? 9 : 17;
      const x = cx + Math.cos(a) * out;
      const y = cy + Math.sin(a) * out * 0.5 - (f === 0 ? 2 : 3);
      const lit = 0.55 + 0.45 * Math.max(0, -(Math.cos(a) * TL[0] + Math.sin(a) * TL[1]) * -1);
      g.fillStyle = `rgba(230,240,255,${0.3 + 0.3 * lit})`;
      g.beginPath();
      g.arc(x, y, f === 0 ? 1.8 : 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}
/** A wet patch on the asphalt (RN-B): darker, glossy, with the street light's streak reflected in it. */
export function wetPatch(seed: number): HTMLCanvasElement {
  const W = 192;
  const H = 112;
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const im = g.createImageData(W, H);
  const d = im.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x / W) * 2 - 1;
      const v = (y / H) * 2 - 1;
      const r = Math.hypot(u, v);
      const n = fbm(u * 2.4 + seed, v * 2.4, 40 + seed);
      const m = smooth(1, 0.55, r + (0.5 - n) * 0.7);
      if (m <= 0) continue;
      const i = (y * W + x) * 4;
      // the lamp's reflection: a soft vertical streak left of centre (the light is upper left)
      const sx = (u + 0.3) / 0.2;
      const sy = (v + 0.1) / 0.75;
      const s = 0.45 * Math.exp(-sx * sx * 0.35 - sy * sy) * (0.6 + 0.4 * fbm(u * 9, v * 20, 7));
      d[i] = 14 + s * 120;
      d[i + 1] = 18 + s * 125;
      d[i + 2] = 24 + s * 135;
      d[i + 3] = Math.min(255, (0.26 * m + s * 0.5 * m) * 255);
    }
  g.putImageData(im, 0, 0);
  return c;
}

/* ---------------- Signal flare (EV) ---------------- */
/** The flare stick (dark casing, burning green head with a white-hot core): light, so the head is bright. 48×24. */
export function flareStick(): HTMLCanvasElement {
  const c = make(48, 24);
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 7, 0, 17);
  gr.addColorStop(0, "#4a4f55");
  gr.addColorStop(0.5, "#24282c");
  gr.addColorStop(1, "#121416");
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(6, 8, 28, 8, 2);
  g.fill();
  g.fillStyle = "#8a2a20";
  g.fillRect(10, 8, 4, 8);
  const hg = g.createRadialGradient(37, 12, 0, 37, 12, 9);
  hg.addColorStop(0, "rgba(255,255,255,1)");
  hg.addColorStop(0.35, "rgba(190,255,190,1)");
  hg.addColorStop(1, "rgba(70,190,90,0)");
  g.fillStyle = hg;
  g.fillRect(26, 2, 22, 20);
  return c;
}
