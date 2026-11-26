/**
 * Photoreal group 5, gunfire family, goal-first takes (-G): the new baked pictures. Everything here runs once, in a
 * Look's bake(); `gunfire-g.ts` only composes. Reuses `gunfire-art.ts` (one blood palette, one heat ramp, one key light).
 *
 * New pictures, each made for one job named in its card's goalFirst (dead-city-model fx.md › FX 4):
 *  - a hot round head (TR-G: where the round IS) and a motion tail sized from the speed (where it goes);
 *  - a short muzzle bloom for the shotgun, cropped to its gas (SG-G: the gun fired; the spread is the pellets' job);
 *  - a footprint-shaped light band (BF-G: the BUILDING was repaired / upgraded, in its own rectangle, not a circle);
 *  - bear-trap jaws (BF-G snap: the jaws are really round, so the circle stays, as steel);
 *  - a plank barricade and its broken halves (BF-G destroyed: the wreck stays in the footprint, the gap reads open);
 *  - a hand smudge (BT-G: the Crawler pulls itself by its hands);
 *  - a reach band (ML-G: the rim of the swing = exactly the weapon's range), cropped to the sector.
 */
import { make, rng } from "./kit";
import { BLOOD_DEEP, BLOOD_MID, BLOOD_THIN, fbm, heat } from "./gunfire-art";

/** Fills a canvas pixel by pixel: fn(x, y, out) → [r, g, b, a] 0–255. (Same as gunfire-art's private helper.) */
function pixels(w: number, h: number, fn: (x: number, y: number, out: number[]) => void): HTMLCanvasElement {
  const c = make(w, h);
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const o = [0, 0, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      o[0] = o[1] = o[2] = o[3] = 0;
      fn(x + 0.5, y + 0.5, o);
      const j = (y * w + x) * 4;
      img.data[j] = o[0] as number;
      img.data[j + 1] = o[1] as number;
      img.data[j + 2] = o[2] as number;
      img.data[j + 3] = o[3] as number;
    }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------- TR-G: round head + motion tail (light) ---------- */
/** The round itself: a small white-hot head (ADD), soft, ≥ 2 px at game size. */
export function bakeHead(px: number, tint: readonly [number, number, number] | null): HTMLCanvasElement {
  const r0 = px / 2;
  return pixels(px, px, (x, y, o) => {
    const d = Math.hypot(x - r0, y - r0) / r0;
    if (d >= 1) return;
    const core = Math.exp(-d * d * 9);
    const halo = Math.exp(-d * d * 3) * 0.35;
    const a = Math.min(1, core + halo);
    let [r, g, b] = heat(0.7 + 0.3 * core);
    if (tint) {
      const k = (1 - core) * 0.8;
      r += (tint[0] - r) * k;
      g += (tint[1] - g) * k;
      b += (tint[2] - b) * k;
    }
    o[0] = r * a;
    o[1] = g * a;
    o[2] = b * a;
    o[3] = 255 * a;
  });
}
/**
 * The motion tail: what the eye keeps of a round in ONE frame (speed / 60 Hz long), thin, cooling from the head (right
 * end) to nothing at the tail. No hot head of its own (the head sprite is the round).
 */
export function bakeTail(lenPx: number, widPx: number, tint: readonly [number, number, number] | null): HTMLCanvasElement {
  return pixels(lenPx, widPx, (x, y, o) => {
    const u = x / lenPx;
    const v = (y - widPx / 2) / (widPx / 2);
    const thick = 0.35 + 0.65 * u;
    const across = Math.exp(-(v * v) / (thick * thick * 0.3));
    const along = Math.pow(u, 1.2);
    const a = Math.min(1, across * along * 1.3);
    if (a < 0.01) return;
    let [r, g, b] = heat(0.25 + 0.45 * u);
    if (tint) {
      const k = 0.8;
      r += (tint[0] - r) * k;
      g += (tint[1] - g) * k;
      b += (tint[2] - b) * k;
    }
    o[0] = r * a;
    o[1] = g * a;
    o[2] = b * a;
    o[3] = 255 * a;
  });
}

/* ---------- SG-G: a short muzzle bloom (light), cropped: the muzzle at x = 8 % of the width ---------- */
export const BLOOM_W_M = 1.3;
export const BLOOM_H_M = 0.9;
export const BLOOM_MUZZLE = 0.08; // fraction of the width where the muzzle sits
/** The burst of gas at the muzzle: round, hot, 0.9 m long at most (gas doesn't fly 5 m; the pellets do). f 0–2. */
export function bakeBloom(f: number, seed: number): HTMLCanvasElement {
  const P = 64;
  const w = Math.round(BLOOM_W_M * P);
  const h = Math.round(BLOOM_H_M * P);
  const fade = [1, 0.55, 0.25][f] as number;
  const grow = [0.75, 1, 1.12][f] as number;
  return pixels(w, h, (x, y, o) => {
    const mx = x / P - BLOOM_W_M * BLOOM_MUZZLE;
    const my = (y - h / 2) / P;
    if (mx < -0.06) return;
    // a pear of gas: centre 0.32 m ahead, wider forward
    const cx = 0.32 * grow;
    const rx = 0.42 * grow;
    const ry = 0.25 * grow * (0.75 + 0.35 * Math.max(0, Math.min(1, mx / 0.6)));
    const d = Math.hypot((mx - cx) / rx, my / ry);
    const n = fbm(mx * 7 + seed, my * 7, seed + f, 3);
    const body = Math.max(0, 1 - d * d) * (0.55 + 0.7 * n);
    const throat = Math.exp(-(mx * mx + my * my) / 0.006);
    const e = Math.min(1, (body * 0.85 + throat * 0.8) * fade);
    if (e < 0.01) return;
    const [r, g, b] = heat(e * 0.95 - f * 0.15);
    const a = Math.min(1, e * 1.1);
    o[0] = r * a;
    o[1] = g * a;
    o[2] = b * a;
    o[3] = 255 * a;
  });
}

/* ---------- BF-G: footprint-shaped light band (ADD) ---------- */
/**
 * A soft band of light along a rounded rectangle wM × hM (the building's footprint), with a thin hot core; the texture
 * spans the rectangle + `padM` round it (cropped: no full-frame quad). Drawn at the footprint size (scale 1 = on the
 * outline).
 */
export function bakeOutline(wM: number, hM: number, padM: number, rgb: readonly [number, number, number], bandM: number): HTMLCanvasElement {
  const P = 64;
  const W = Math.ceil((wM + 2 * padM) * P);
  const H = Math.ceil((hM + 2 * padM) * P);
  const hw = (wM / 2) * P;
  const hh = (hM / 2) * P;
  const rr = Math.min(hw, hh) * 0.35;
  const band = bandM * P;
  return pixels(W, H, (x, y, o) => {
    // signed distance to a rounded rectangle
    const qx = Math.abs(x - W / 2) - (hw - rr);
    const qy = Math.abs(y - H / 2) - (hh - rr);
    const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
    const k = sd / band;
    const a = Math.min(1, Math.exp(-k * k * 2.2) * 0.7 + Math.exp(-k * k * 16) * 0.6);
    if (a < 0.004) return;
    const hot = Math.exp(-k * k * 16) * 0.3;
    o[0] = (rgb[0] + (255 - rgb[0]) * hot) * a;
    o[1] = (rgb[1] + (255 - rgb[1]) * hot) * a;
    o[2] = (rgb[2] + (255 - rgb[2]) * hot) * a;
    o[3] = 255 * a;
  });
}

/* ---------- BF-G context + matter: the barricade, its wreck, the bear trap ---------- */
const PLANK = [126, 90, 56] as const;
/**
 * A wood barricade seen from above, 2 × 0.5 m (buildings.json wood_barricade): three planks across two posts, lit from
 * the upper left. `broken`: 0 whole; 1 / 2 = the left / right broken half (planks snapped in the middle, jagged end).
 */
export function bakeBarricade(broken: 0 | 1 | 2, seed: number): HTMLCanvasElement {
  const P = 64;
  const W = Math.round(2.1 * P);
  const H = Math.round(0.62 * P);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const R = rng(seed);
  const x0 = 0.05 * P;
  const x1 = W - 0.05 * P;
  const mid = W / 2 + (R() - 0.5) * 0.2 * P;
  // shadow down-right
  g.save();
  g.filter = "blur(3px)";
  g.fillStyle = "rgba(0,0,0,0.5)";
  const sa = broken === 2 ? mid : x0;
  const sb = broken === 1 ? mid : x1;
  g.fillRect(sa + 4, 0.08 * P + 5, sb - sa, H - 0.16 * P);
  g.restore();
  for (let k = 0; k < 3; k++) {
    const y = (0.08 + k * 0.155) * P;
    const h = 0.14 * P;
    let a = x0;
    let b = x1;
    if (broken === 1) b = mid + (R() - 0.5) * 0.25 * P;
    if (broken === 2) a = mid + (R() - 0.5) * 0.25 * P;
    g.save();
    g.beginPath();
    // a jagged broken end on the snapped side
    g.moveTo(a, y);
    if (broken === 2) {
      g.lineTo(a + 0.06 * P, y);
    }
    g.lineTo(b, y);
    if (broken === 1) {
      g.lineTo(b - 0.05 * P, y + h * 0.35);
      g.lineTo(b + 0.04 * P, y + h * 0.6);
      g.lineTo(b - 0.03 * P, y + h);
    } else g.lineTo(b, y + h);
    g.lineTo(a, y + h);
    if (broken === 2) {
      g.lineTo(a + 0.05 * P, y + h * 0.55);
      g.lineTo(a - 0.03 * P, y + h * 0.3);
    }
    g.closePath();
    const tone = 0.85 + R() * 0.25;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, `rgb(${PLANK[0] * tone * 1.25},${PLANK[1] * tone * 1.22},${PLANK[2] * tone * 1.2})`);
    gr.addColorStop(0.55, `rgb(${PLANK[0] * tone},${PLANK[1] * tone},${PLANK[2] * tone})`);
    gr.addColorStop(1, `rgb(${PLANK[0] * tone * 0.6},${PLANK[1] * tone * 0.58},${PLANK[2] * tone * 0.55})`);
    g.fillStyle = gr;
    g.fill();
    g.clip();
    // two broad soft grain bands (not fine lines), a pale fresh break on the snapped end
    g.fillStyle = "rgba(60,36,18,0.22)";
    g.fillRect(a, y + h * 0.35, b - a, h * 0.25);
    if (broken) {
      g.fillStyle = "rgba(230,196,140,0.6)";
      g.beginPath();
      g.ellipse(broken === 1 ? b : a, y + h / 2, 0.06 * P, h * 0.7, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  // the two posts (dark, square, catching the light on the upper-left edge)
  for (const px of [0.3 * P, W - 0.3 * P]) {
    if (broken === 1 && px > mid) continue;
    if (broken === 2 && px < mid) continue;
    g.fillStyle = "#2b241d";
    g.fillRect(px - 0.07 * P, 0.03 * P, 0.14 * P, H - 0.06 * P);
    g.fillStyle = "rgba(180,170,150,0.25)";
    g.fillRect(px - 0.07 * P, 0.03 * P, 0.03 * P, H - 0.06 * P);
  }
  return c;
}
/** A bear trap's plate seen from above (0.7 m: plateRadiusM 0.35), the open jaws flat round it; base only (no jaws). */
export function bakeTrapBase(): HTMLCanvasElement {
  const P = 96;
  const S = Math.round(0.9 * P);
  const c = make(S, S);
  const g = c.getContext("2d")!;
  const o = S / 2;
  g.save();
  g.filter = "blur(2px)";
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.beginPath();
  g.arc(o + 3, o + 4, 0.16 * P, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // the pan (dark steel disc) and the chain stub
  const gr = g.createRadialGradient(o - 0.05 * P, o - 0.06 * P, 0, o, o, 0.15 * P);
  gr.addColorStop(0, "#6c7176");
  gr.addColorStop(1, "#2d3136");
  g.fillStyle = gr;
  g.beginPath();
  g.arc(o, o, 0.15 * P, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#24282c";
  g.fillRect(o - 0.02 * P, o + 0.15 * P, 0.04 * P, 0.25 * P);
  return c;
}
/**
 * One jaw: a half ring of toothed steel, r 0.35 m (plateRadiusM), seen from above, lying open (the hinge on the x axis,
 * the jaw on the -y side). Rotating it about the hinge is drawn as squashing it toward the hinge (top-down: a jaw that
 * swings up looks shorter), so the composer scales its height 1 → 0.
 */
export function bakeJaw(): HTMLCanvasElement {
  const P = 96;
  const W = Math.round(0.84 * P);
  const H = Math.round(0.44 * P);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const ox = W / 2;
  const oy = H; // hinge line at the bottom edge
  const r = 0.35 * P;
  g.lineCap = "round";
  g.strokeStyle = "#5d6369";
  g.lineWidth = 0.055 * P;
  g.beginPath();
  g.arc(ox, oy, r, Math.PI, 0);
  g.stroke();
  // lit rim (upper left)
  g.strokeStyle = "rgba(214,222,228,0.75)";
  g.lineWidth = 0.015 * P;
  g.beginPath();
  g.arc(ox, oy, r + 0.012 * P, Math.PI * 1.05, Math.PI * 1.55);
  g.stroke();
  // teeth: broad, few (≥ 2 px at game size), pointing in
  g.fillStyle = "#737a80";
  for (let k = 1; k < 8; k++) {
    const a = Math.PI + (k / 8) * Math.PI;
    const x1 = ox + Math.cos(a) * (r - 0.02 * P);
    const y1 = oy + Math.sin(a) * (r - 0.02 * P);
    const x2 = ox + Math.cos(a) * (r - 0.09 * P);
    const y2 = oy + Math.sin(a) * (r - 0.09 * P);
    const nx = -Math.sin(a) * 0.025 * P;
    const ny = Math.cos(a) * 0.025 * P;
    g.beginPath();
    g.moveTo(x1 + nx, y1 + ny);
    g.lineTo(x2, y2);
    g.lineTo(x1 - nx, y1 - ny);
    g.closePath();
    g.fill();
  }
  return c;
}
/** A pale dust print of a footprint (the sold building's ghost on the street): soft, low contrast, matte. */
export function bakePrint(wM: number, hM: number): HTMLCanvasElement {
  const P = 48;
  const pad = 0.15;
  const W = Math.ceil((wM + 2 * pad) * P);
  const H = Math.ceil((hM + 2 * pad) * P);
  return pixels(W, H, (x, y, o) => {
    const dx = Math.max(0, Math.abs(x - W / 2) - (wM / 2) * P) / (pad * P);
    const dy = Math.max(0, Math.abs(y - H / 2) - (hM / 2) * P) / (pad * P);
    const e = Math.max(0, 1 - Math.hypot(dx, dy));
    if (e <= 0) return;
    const n = 0.75 + 0.5 * fbm(x * 0.08, y * 0.08, 5, 3);
    o[0] = 150;
    o[1] = 140;
    o[2] = 124;
    o[3] = 255 * Math.min(1, e * 1.3) * 0.32 * n;
  });
}

/* ---------- BT-G: a hand smudge (mark) ---------- */
/** A palm and three finger drags, pulled backward (-x), dark red-brown, soft, ≥ 2 px at game size. */
export function bakeHand(seed: number): HTMLCanvasElement {
  const P = 320;
  const W = Math.round(0.26 * P);
  const H = Math.round(0.16 * P);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const R = rng(seed);
  const col = (k: readonly number[], a: number): string => `rgba(${k[0]},${k[1]},${k[2]},${a})`;
  g.filter = "blur(1.5px)";
  // finger drags first, pulled back toward -x, thinning (broad: ≥ 2 px each at game size)
  for (let k = 0; k < 3; k++) {
    const y = H * (0.25 + k * 0.25) + (R() - 0.5) * 3;
    const gr = g.createLinearGradient(W * 0.02, 0, W * 0.66, 0);
    gr.addColorStop(0, col(BLOOD_THIN, 0));
    gr.addColorStop(0.5, col(BLOOD_MID, 0.55));
    gr.addColorStop(1, col(BLOOD_MID, 0.9));
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(W * 0.38, y, W * 0.34, H * 0.1, (R() - 0.5) * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  // the palm (front, +x), heaviest
  g.fillStyle = col(BLOOD_DEEP, 0.9);
  g.beginPath();
  g.ellipse(W * 0.74, H / 2, W * 0.15, H * 0.36, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

/* ---------- ML-G: the reach band (the rim of the swing), cropped to the sector ---------- */
/**
 * One frame of a swing, read from the rim: a crisp band exactly at the weapon's range (what you can reach), the swept
 * fill very faint inside it, the blade a radial line at the leading angle. Facing +x, the wielder at (0, 0).
 * Cropped to the sector's box: x 0 … range, y ±range·sin(min(half, 90°)). Returns the picture and its anchor (the
 * wielder) in metres from the picture's centre.
 */
export function bakeReach(rangeM: number, arcRad: number, frac: number, warm: boolean): { pic: HTMLCanvasElement; ax: number; ay: number } {
  const P = 40;
  const half = arcRad / 2;
  const yExt = rangeM * Math.sin(Math.min(half, Math.PI / 2)) + 0.12;
  const xMin = Math.min(0, rangeM * Math.cos(half)) - 0.12;
  const xMax = rangeM + 0.12;
  const W = Math.ceil((xMax - xMin) * P);
  const H = Math.ceil(2 * yExt * P);
  const a1 = -half + arcRad * frac;
  const band = warm ? 0.12 : 0.08; // m: the axe's heavier band
  const inner = warm ? 0.38 : 0.5;
  const base: readonly [number, number, number] = warm ? [255, 214, 176] : [226, 234, 240];
  const pic = pixels(W, H, (x, y, o) => {
    const mx = x / P + xMin;
    const my = y / P - yExt;
    const d = Math.hypot(mx, my);
    if (d > rangeM + 0.1 || d < rangeM * inner * 0.8) return;
    const a = Math.atan2(my, mx);
    if (a < -half - 0.01 || a > a1 + 0.03) return;
    const behind = (a1 - a) / Math.max(0.2, arcRad); // 0 at the blade, 1 at the start edge
    const lead = a <= a1 ? 1 : Math.max(0, 1 - (a - a1) / 0.03);
    // the reach band: exactly on the range, soft both sides
    const k = (d - (rangeM - band * 0.5)) / band;
    const rim = Math.exp(-k * k * 2.5) * (0.35 + 0.65 * Math.exp(-behind * 2.2));
    // the swept air: faint, fading behind the blade
    const rad = Math.max(0, Math.min(1, (d / rangeM - inner) / (1 - inner)));
    const fill = Math.exp(-behind * 3.5) * rad * 0.22;
    // the blade: a radial line at the leading angle, outer half only
    const bl = Math.exp(-(((a1 - a) * d) ** 2) / 0.003) * Math.max(0, Math.min(1, (d / rangeM - 0.55) / 0.2));
    const al = Math.min(1, (rim * 0.85 + fill + bl * 0.6) * lead);
    if (al < 0.01) return;
    const hot = Math.max(bl, rim * Math.exp(-behind * 6)) * 0.6;
    o[0] = Math.min(255, base[0] + hot * 30);
    o[1] = Math.min(255, base[1] + hot * 20);
    o[2] = Math.min(255, base[2] + hot * (warm ? 0 : 15));
    o[3] = 255 * al;
  });
  // anchor (the wielder) relative to the picture's centre, metres
  return { pic, ax: -(xMin + (xMax - xMin) / 2), ay: 0 };
}
