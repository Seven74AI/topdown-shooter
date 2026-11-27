/**
 * Group 5, matter family, the goal-first (-G) takes: their textures, made once at bake (never in draw). Same rules as
 * `matter-tex.ts`: one key light from the upper left (kit.ts › LIGHT), no hard specks, nothing under 1 px at 36 px/m,
 * additive textures cropped to what they show. Zone textures (the acid's glow and edge, the gas front) span exactly the
 * game's circle: the frame's half side is the radius, so `sprite(…, 2 R)` puts the edge where the sim has it.
 */
import { make, rng, LIGHT } from "./kit";
import { fbm } from "./matter-tex";

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const TL = ((): [number, number] => {
  const l = Math.hypot(LIGHT.dx, LIGHT.dy);
  return [LIGHT.dx / l, LIGHT.dy / l];
})();

/* ---------------- AC-G: the acid ---------------- */

/** The splat's blobs, in units of the zone radius R (x = the flight direction). All inside 0.9 R. */
function splatBlobs(seed: number): [number, number, number][] {
  const r = rng(seed);
  const out: [number, number, number][] = [
    [0.1, 0, 0.5], // the body, pushed forward by the glob's momentum
    [-0.22, 0.05, 0.36],
    [0.32, -0.12, 0.3],
  ];
  // forward fingers (the liquid kept going), and two small drops thrown ahead
  for (let k = 0; k < 4; k++) {
    const a = -0.75 + (k / 3) * 1.5 + (r() - 0.5) * 0.25;
    const d = 0.46 + r() * 0.1;
    const w = 0.12 + r() * 0.05;
    out.push([Math.cos(a) * d, Math.sin(a) * d * 0.9, w]);
    out.push([Math.cos(a) * (d + 0.15), Math.sin(a) * (d + 0.15) * 0.9, w * 0.62]); // the finger runs on, thinning
  }
  for (let k = 0; k < 3; k++) {
    const a = -0.9 + r() * 1.8;
    const d = 0.74 + r() * 0.08;
    out.push([Math.cos(a) * d, Math.sin(a) * d * 0.85, 0.06 + r() * 0.03]);
  }
  // a little splashed back
  out.push([-0.55, (r() - 0.5) * 0.4, 0.09]);
  return out;
}
/** A compact-support field (Wyvill kernel): 0 outside 1.7 × each blob's radius, so blobs merge only where they touch. 1 = the surface. */
function splatField(b: [number, number, number][], x: number, y: number): number {
  let f = 0;
  for (const [bx, by, br] of b) {
    const q = ((x - bx) ** 2 + (y - by) ** 2) / (br * br * 2.9);
    if (q < 1) f += (1 - q) ** 3;
  }
  return f * 3.4;
}
/**
 * The liquid (frame = the 2 R zone, facing +x = the flight): a splat, not a disc, inside the circle. Deep olive centre,
 * see-through thin edges, a bright meniscus; no specular (the street light's reflection is its own unrotated sprite).
 */
export function acidSplat(px: number, seed: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  const B = splatBlobs(seed);
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      const f = splatField(B, x, y);
      if (f < 0.9) continue;
      const n = fbm(x * 5 + seed, y * 5, 3 + seed, 3);
      const depth = smooth(1, 3.2, f) * (0.8 + 0.3 * n);
      const rim = smooth(0.9, 1.05, f) * (1 - smooth(1.15, 1.6, f));
      const i = (py * px + qx) * 4;
      // the meniscus catches the light on the side facing it (upper left), darker on the far side
      const facing = 0.55 + 0.45 * Math.max(-1, Math.min(1, -(x * TL[0] + y * TL[1]) * -1.2));
      let r = 150 - 95 * depth;
      let gg = 205 - 110 * depth;
      let bb = 52 - 36 * depth;
      r += rim * 60 * facing;
      gg += rim * 50 * facing;
      bb += rim * 24 * facing;
      d[i] = Math.min(255, r);
      d[i + 1] = Math.min(255, gg);
      d[i + 2] = Math.min(255, bb);
      d[i + 3] = Math.min(255, 255 * (0.5 + 0.45 * depth + 0.25 * rim) * smooth(0.9, 0.98, f));
    }
  g.putImageData(im, 0, 0);
  const out = make(px, px);
  const og = out.getContext("2d")!;
  og.filter = "blur(0.6px)";
  og.drawImage(c, 0, 0);
  return out;
}
/** The mark: the asphalt the acid ate, in the splat's own shape (a little wider), dark and desaturated: it never glows. */
export function acidEtch(px: number, seed: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  const B = splatBlobs(seed);
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      const f = splatField(B, x, y);
      if (f < 0.55) continue;
      const n = fbm(x * 9 + seed, y * 9, 21 + seed, 3);
      const i = (py * px + qx) * 4;
      d[i] = 30 + 14 * n;
      d[i + 1] = 30 + 12 * n;
      d[i + 2] = 24 + 8 * n;
      d[i + 3] = 255 * (0.42 + 0.2 * n) * smooth(0.55, 0.9, f);
    }
  g.putImageData(im, 0, 0);
  const out = make(px, px);
  const og = out.getContext("2d")!;
  og.filter = "blur(0.8px)";
  og.drawImage(c, 0, 0);
  return out;
}
/**
 * The acid's light on the ground (ADD): the zone. A faint, even floor of yellow-green that ends AT R (within 3 %),
 * a little stronger at the liquid. Light pools really are round, so the circle comes from the light, not the liquid.
 */
export function acidZoneGlow(px: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      const r = Math.hypot(x, y);
      if (r > 1) continue;
      const a = (0.34 + 0.66 * Math.pow(Math.max(0, 1 - r), 1.6)) * (1 - smooth(0.97, 1, r));
      const i = (py * px + qx) * 4;
      d[i] = 150;
      d[i + 1] = 235;
      d[i + 2] = 60;
      d[i + 3] = 255 * a;
    }
  g.putImageData(im, 0, 0);
  return c;
}
/** The damage edge (ADD): a thin, even line whose OUTER edge is R (your body touches it = you are in acid). */
export function acidEdge(px: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  const w = (0.05 / 1.0) * (px / 2); // 0.05 m at R 1 m
  const R = px / 2;
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const r = Math.hypot(qx + 0.5 - R, py + 0.5 - R);
      const band = (r - (R - w * 0.9)) / w; // 0 at the line's centre
      if (Math.abs(band) > 2.2 || r > R) continue;
      const a = Math.exp(-band * band * 1.6) + 0.18 * Math.exp(-((r - R + w * 3) ** 2) / (w * w * 4)) * (r < R ? 1 : 0);
      const i = (py * px + qx) * 4;
      d[i] = 200;
      d[i + 1] = 255;
      d[i + 2] = 96;
      d[i + 3] = 255 * Math.min(1, a) * (1 - smooth(R - 0.5, R, r));
    }
  g.putImageData(im, 0, 0);
  return c;
}

/* ---------------- GA-G: the gas front ---------------- */

/**
 * The Bloater's gas lying on the street (frame = the 5 m zone). Heavy gas spreads like a spilled liquid: thin over the
 * middle and piled up at its front, a rolling rim whose outside face ends at R. Lit from the upper left (bright on the
 * rolls' faces toward the light), yellow-green, matte (no glow). `inner` = the thin layer only; else the front only.
 */
export function gasLayer(px: number, seed: number, front: boolean): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  const dens = (x: number, y: number): number => {
    const r = Math.hypot(x, y);
    if (r >= 1) return 0;
    const a = Math.atan2(y, x);
    const n = fbm(x * 3.2 + seed, y * 3.2, 9 + seed, 4);
    if (!front) return (0.15 + 0.85 * n * n * 1.3) * smooth(1, 0.9, r);
    // the rolls: uneven lumps along the rim (a billowing front, not a drawn band); the outside face sharp at R, the
    // inside trailing off into the thin layer
    const n2 = fbm(x * 7.5 + seed * 1.7, y * 7.5, 61 + seed, 4);
    const lump = 0.5 + 0.5 * Math.sin(a * 9 + seed + 8 * fbm(Math.cos(a) * 2.5 + seed, Math.sin(a) * 2.5, 31, 3));
    const halfW = 0.035 + 0.075 * lump * (0.6 + 0.8 * n2);
    const centre = 0.975 - halfW * 1.1;
    const inside = Math.exp(-(((r - centre) / halfW) ** 2) * (r < centre ? 0.45 : 1.6)) * (0.3 + 1.1 * n2 * n2 * 1.6);
    return Math.min(1, inside * (0.55 + 0.5 * n)) * (1 - smooth(0.985, 1, r));
  };
  const e = 0.025;
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      const den = Math.min(1, dens(x, y));
      if (den <= 0.004) continue;
      const toward = Math.min(1, dens(x + TL[0] * e, y + TL[1] * e));
      let lum = 0.7 + (front ? 3.2 : 1.4) * (den - toward);
      lum = Math.max(0.42, Math.min(1.05, lum));
      const i = (py * px + qx) * 4;
      d[i] = Math.min(255, 196 * lum * LIGHT.tint[0]);
      d[i + 1] = Math.min(255, 212 * lum * LIGHT.tint[1]);
      d[i + 2] = Math.min(255, 104 * lum * LIGHT.tint[2]);
      d[i + 3] = 255 * Math.min(1, den) * (front ? 0.82 : 0.6);
    }
  g.putImageData(im, 0, 0);
  const out = make(px, px);
  const og = out.getContext("2d")!;
  og.filter = `blur(${px / 220}px)`;
  og.drawImage(c, 0, 0);
  return out;
}

/* ---------------- EV-G ---------------- */

/** The leak's jet (facing +x): a narrow, fast, pale core from the cap that widens into a cone of cold vapour. 96×40. */
export function vapourJet(): HTMLCanvasElement {
  const W = 96;
  const H = 40;
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const im = g.createImageData(W, H);
  const d = im.data;
  for (let py = 0; py < H; py++)
    for (let qx = 0; qx < W; qx++) {
      const u = (qx + 0.5) / W; // along
      const v = ((py + 0.5) / H) * 2 - 1; // across
      const half = 0.12 + 0.88 * Math.pow(u, 0.8);
      const across = Math.abs(v) / half;
      if (across >= 1) continue;
      const n = fbm(u * 6 - 0, v * 3, 51, 3);
      const a = (1 - across * across) * smooth(0, 0.06, u) * (1 - smooth(0.55, 1, u)) * (0.6 + 0.5 * n);
      const core = Math.exp(-across * across * 6) * (1 - u);
      const lit = 0.85 + 0.2 * -v * 0.5; // the upper side faces the light a little
      const i = (py * W + qx) * 4;
      d[i] = Math.min(255, (200 + 40 * core) * lit);
      d[i + 1] = Math.min(255, (214 + 36 * core) * lit);
      d[i + 2] = Math.min(255, (150 + 70 * core) * lit);
      d[i + 3] = 255 * Math.min(1, a * 0.9);
    }
  g.putImageData(im, 0, 0);
  const out = make(W, H);
  const og = out.getContext("2d")!;
  og.filter = "blur(0.8px)";
  og.drawImage(c, 0, 0);
  return out;
}
/** The gas tank (2 × 1 m, as the game's frame): a dented steel drum lying down, fill cap at its left end. 96×48. */
export function gasTank(): HTMLCanvasElement {
  const W = 96;
  const H = 48;
  const c = make(W, H);
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.filter = "blur(3px)";
  g.beginPath();
  g.roundRect(10, 12, 82, 32, 14);
  g.fill();
  g.filter = "none";
  const gr = g.createLinearGradient(0, 6, 0, 40);
  gr.addColorStop(0, "#9aa08a");
  gr.addColorStop(0.35, "#6e7462");
  gr.addColorStop(1, "#2e3128");
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(6, 7, 82, 32, 15);
  g.fill();
  g.strokeStyle = "rgba(20,22,18,0.6)";
  g.lineWidth = 1.5;
  for (const x of [30, 64]) {
    g.beginPath();
    g.moveTo(x, 8);
    g.lineTo(x, 38);
    g.stroke();
  }
  // the hazard band (yellow-green = gas)
  g.fillStyle = "rgba(190,206,92,0.85)";
  g.fillRect(40, 8, 12, 30);
  // the fill cap (where it leaks)
  g.fillStyle = "#3a3d34";
  g.beginPath();
  g.arc(14, 23, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(220,226,200,0.5)";
  g.beginPath();
  g.arc(12.5, 21.5, 1.8, 0, Math.PI * 2);
  g.fill();
  return c;
}

/* ---------------- RD-G / PD-G / BD-G ---------------- */

/** A soft contact shadow (PD-G: the piece's weight pressing on the street), a blurred rect. `w`×`h` px. */
export function contactShadow(w: number, h: number): HTMLCanvasElement {
  const pad = 10;
  const c = make(w + pad * 2, h + pad * 2);
  const g = c.getContext("2d")!;
  g.filter = "blur(4px)";
  g.fillStyle = "rgba(0,0,0,0.75)";
  g.fillRect(pad, pad, w, h);
  return c;
}

/* ---------------- RN-G ---------------- */

/** A drop seen from above: short (it falls mostly toward the camera), thin, a faint head. 4×28. */
export function rainShort(): HTMLCanvasElement {
  const c = make(4, 28);
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 28);
  gr.addColorStop(0, "rgba(196,210,230,0)");
  gr.addColorStop(0.75, "rgba(200,214,234,0.6)");
  gr.addColorStop(0.95, "rgba(226,236,250,0.9)");
  gr.addColorStop(1, "rgba(226,236,250,0)");
  g.fillStyle = gr;
  g.filter = "blur(0.5px)";
  g.fillRect(1, 0, 2, 28);
  return c;
}
/**
 * A drop hitting the street, NOT a ring (rings mean zones and feedback in this game): a dark wet dot and two or three
 * beads thrown up, lit on the side facing the light. f 0 = impact, 1 = beads falling back. 32×22 (0.32 m).
 */
export function rainHit(f: number, seed: number): HTMLCanvasElement {
  const W = 32;
  const H = 22;
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const r = rng(seed);
  g.filter = "blur(1px)";
  g.fillStyle = `rgba(8,10,14,${f ? 0.3 : 0.42})`;
  g.beginPath();
  g.ellipse(16, 12, f ? 6.5 : 4.5, f ? 3.6 : 2.6, 0, 0, Math.PI * 2);
  g.fill();
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k - 1) * 1.1 + (r() - 0.5) * 0.5;
    const out = f ? 8.5 : 4.5;
    const x = 16 + Math.cos(a) * out;
    const y = 12 + Math.sin(a) * out * 0.6 - (f ? 1.5 : 3.5);
    // a soft bead, brighter on the side facing the light (upper left)
    const gr = g.createRadialGradient(x - 0.8, y - 0.8, 0, x, y, 2.6);
    gr.addColorStop(0, `rgba(232,240,252,${f ? 0.45 : 0.7})`);
    gr.addColorStop(1, "rgba(232,240,252,0)");
    g.fillStyle = gr;
    g.fillRect(x - 3, y - 3, 6, 6);
  }
  return c;
}
