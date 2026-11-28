/**
 * Photoreal group 5, gunfire family, round 2 (designer 2026-11-28): the new baked pictures. Runs once, in a Look's
 * bake(); `gunfire-r2.ts` only composes. Reuses `gunfire-art.ts` (one noise, one key light).
 *
 *  - ML-M: ML-A's sweep smear, cropped to the sector and trimmed to the exact range (so the band owns the rim), and
 *    ML-G's reach band as its own layer, so it can hold after the smear fades.
 */
import { make } from "./kit";
import { fbm } from "./gunfire-art";

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

/** A picture cropped to a sector (facing +x, the wielder at (0, 0)), and its anchor: the wielder, in metres from the picture's centre. */
export interface SectorPic {
  pic: HTMLCanvasElement;
  ax: number;
  ay: number;
}
export const MLM_P = 40; // px per metre of the baked pictures
/** The sector's box (as ML-G's bakeReach crops it), with a small pad. */
function sectorBox(rangeM: number, arcRad: number): { xMin: number; xMax: number; yExt: number; W: number; H: number } {
  const half = arcRad / 2;
  const yExt = rangeM * Math.sin(Math.min(half, Math.PI / 2)) + 0.06;
  const xMin = Math.min(0, rangeM * Math.cos(half)) - 0.06;
  const xMax = rangeM + 0.06;
  return { xMin, xMax, yExt, W: Math.ceil((xMax - xMin) * MLM_P), H: Math.ceil(2 * yExt * MLM_P) };
}

/**
 * ML-M sweep smear: ML-A's `bakeSweep` formula (dense at the blade, fading behind it, concentrated toward the rim,
 * cool steel-white; `warm` = the Fire Axe's warmer, wider band), with two changes: cropped to the sector's box
 * (ML-G's finding: A's squares are half empty), and its outer edge ends AT the range instead of 2 % past it, so the
 * reach band is the only thing on the rim.
 */
export function bakeSweepM(rangeM: number, arcRad: number, frac: number, warm: boolean): SectorPic {
  const b = sectorBox(rangeM, arcRad);
  const half = arcRad / 2;
  const a1 = -half + arcRad * frac;
  const inner = warm ? 0.38 : 0.5;
  const pic = pixels(b.W, b.H, (x, y, o) => {
    const mx = x / MLM_P + b.xMin;
    const my = y / MLM_P - b.yExt;
    const d = Math.hypot(mx, my) / rangeM;
    if (d > 1 || d < inner * 0.8) return;
    const a = Math.atan2(my, mx);
    if (a < -half - 0.02 || a > a1 + 0.04) return;
    const behind = (a1 - a) / Math.max(0.2, arcRad * 0.75);
    const trail = Math.exp(-behind * 3.2) * (a <= a1 ? 1 : Math.max(0, 1 - (a - a1) / 0.04));
    const rad = Math.max(0, Math.min(1, (d - inner) / (1 - inner))) * Math.max(0, Math.min(1, (1 - d) / 0.06));
    const n = 0.8 + 0.4 * fbm(d * 6, a * 5, warm ? 3 : 2, 2);
    const al = Math.min(1, trail * Math.pow(rad, 1.3) * n * (warm ? 0.6 : 0.5));
    if (al < 0.01) return;
    const hot = Math.exp(-behind * 14) * rad;
    const base = warm ? [236, 222, 206] : [222, 230, 236];
    o[0] = Math.min(255, base[0]! + hot * 30);
    o[1] = Math.min(255, base[1]! + hot * (warm ? 10 : 22));
    o[2] = Math.min(255, base[2]! + hot * (warm ? -20 : 18));
    o[3] = 255 * al;
  });
  return { pic, ax: -(b.xMin + (b.xMax - b.xMin) / 2), ay: 0 };
}

/**
 * ML-M reach band (ML-G's idea, on its own layer): a crisp band whose OUTER edge is exactly the range (1 px
 * anti-aliased), softening inward over `bandM`; written from the sector's start edge up to the blade's angle.
 * `frac` < 0: the settled band (the whole arc, even, no hot head) that holds after the blade has passed.
 * `frac` 0…1: during the sweep, the freshest part (just behind the blade) is brighter and a touch whiter.
 */
export function bakeBandM(rangeM: number, arcRad: number, frac: number, warm: boolean): SectorPic {
  const b = sectorBox(rangeM, arcRad);
  const half = arcRad / 2;
  const settled = frac < 0;
  const a1 = settled ? half : -half + arcRad * frac;
  const bandM = warm ? 0.12 : 0.08;
  const aa = 1 / MLM_P; // 1 px outer edge
  const base: readonly [number, number, number] = warm ? [240, 222, 202] : [226, 234, 242];
  const pic = pixels(b.W, b.H, (x, y, o) => {
    const mx = x / MLM_P + b.xMin;
    const my = y / MLM_P - b.yExt;
    const d = Math.hypot(mx, my);
    if (d > rangeM + aa || d < rangeM - bandM * 2.2) return;
    const a = Math.atan2(my, mx);
    if (a < -half - 0.006 || a > a1 + 0.03) return;
    // the arc's ends: 1 px soft (the sector's edges), and the lead just ahead of the blade
    const ends = Math.min(1, (a + half + 0.006) * rangeM * MLM_P * 0.5) * (a <= a1 ? 1 : Math.max(0, 1 - (a - a1) / 0.03));
    const outer = Math.max(0, Math.min(1, (rangeM + aa - d) / aa)); // crisp: the range itself
    const k = Math.max(0, rangeM - d) / bandM; // 0 at the range, 1 one band inside
    const inward = k < 0.45 ? 1 : Math.exp(-((k - 0.45) ** 2) * 3.2); // a solid core, a soft inner side
    const behind = settled ? 1 : (a1 - a) / Math.max(0.2, arcRad);
    const fresh = settled ? 0 : Math.exp(-Math.max(0, behind) * 5);
    const grain = 0.92 + 0.12 * fbm(d * 9, a * 14, warm ? 5 : 4, 2); // the air is not a plastic line
    const al = Math.min(1, outer * inward * ends * grain * (0.62 + 0.3 * fresh));
    if (al < 0.01) return;
    o[0] = Math.min(255, base[0] + fresh * 20);
    o[1] = Math.min(255, base[1] + fresh * 18);
    o[2] = Math.min(255, base[2] + fresh * (warm ? 8 : 13));
    o[3] = 255 * al;
  });
  return { pic, ax: -(b.xMin + (b.xMax - b.xMin) / 2), ay: 0 };
}
