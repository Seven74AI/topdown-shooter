import { hueOf, type MakeCanvas } from "./relight";
import { freeCanvas } from "./canvasRecycle";

/**
 * Story 9.13 (B6): the Bloater's glowing veins and acid sacs (take 4 › `prepareBloater` / `drawBloaterFx`), prepared
 * once per relit frame in the bake. The veins branch out from the belly across the body (kept on the figure's opaque
 * pixels, off the head); their dark trace goes into the base picture; their glow (a faint steady glow plus bright
 * pulses running outward, faster and brighter with the swell) is baked as `VEIN_STEPS` pictures over one pulse
 * period, crossfaded by the view. The acid sacs are found from the drawing's glowing blobs and drawn by the view as
 * pooled sprites (`CharacterFxView`). Pure canvas work; px are the frame's (the page's constants × `k`).
 */

/** Vein pulse pictures per period (crossfaded: the pulse runs outward between them). */
export const VEIN_STEPS = 4;

export interface Sac {
  /** Centre and radius in frame px (from the frame's top-left; the frame faces +x). */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly seed: number;
}
export interface BloaterFxData {
  readonly sacs: readonly Sac[];
  /** One pulse period (s): spacing / speed. */
  readonly periodS: number;
  /** Swell 0–1 (sac throb rate and size). */
  readonly s: number;
  /** How much shows through the clothes (1 bare skin … 0.45 through a suit). */
  readonly through: number;
}
interface Vein {
  readonly pts: number[];
  readonly dist: number[];
  readonly width: number;
}

/**
 * Prepares one Bloater frame: draws the veins' dark trace into `base` (in place), returns the vein pulse strip
 * (`VEIN_STEPS` pictures of `n` px side by side, premultiplied for ADD) and the sacs. `k` = frame px per page px
 * (0.5 at the game's 34 px per radius); `R` = frame px per radius.
 */
export function prepareBloaterFx(base: HTMLCanvasElement, glow: HTMLCanvasElement | null, look: number, s: number, seed: number, R: number, k: number, make: MakeCanvas): { fx: BloaterFxData; veins: HTMLCanvasElement } {
  const N = base.width;
  const bg = base.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const a = bg.getImageData(0, 0, N, N).data;
  const headX = N / 2 + 0.45 * R * (1 + 0.35 * s); // veins stay off the head (it sits at the front, +x)
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < N && y < N && x < headX && (a[(Math.floor(y) * N + Math.floor(x)) * 4 + 3] as number) > 230;
  let q = seed;
  const rnd = (): number => {
    q = (q * 16807) % 2147483647;
    return q / 2147483647;
  };
  const cx = N / 2 - 0.08 * R;
  const body = R * (1.0 + 0.35 * s) * 0.95;
  const step = 3 * k;
  const veins: Vein[] = [];
  const grow = (x: number, y: number, ang: number, len: number, w: number, d0: number, depth: number): void => {
    const pts = [x, y];
    const dist = [d0];
    let d = d0;
    for (let t = 0; t < len; t += step) {
      ang += (rnd() - 0.5) * 0.55;
      const nx = x + Math.cos(ang) * step;
      const ny = y + Math.sin(ang) * step;
      if (!inside(nx, ny)) break;
      x = nx;
      y = ny;
      d += step;
      pts.push(x, y);
      dist.push(d);
      if (depth < 2 && rnd() < 0.06) grow(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5), len * 0.45, w * 0.6, d, depth + 1);
    }
    if (pts.length > 6) veins.push({ pts, dist, width: w });
  };
  const roots = 7 + Math.round(s * 4);
  for (let i = 0; i < roots; i++) {
    const ang = (i / roots) * Math.PI * 2 + rnd() * 0.5;
    const r0 = body * (0.12 + rnd() * 0.15);
    grow(cx + Math.cos(ang) * r0, N / 2 + Math.sin(ang) * r0, ang, body * (0.6 + rnd() * 0.35), (1.2 + rnd() * 0.7) * k, 0, 0);
  }
  // acid sacs: blobs of glowing pixels in the drawing (a coarse grid flood fill; the page's 3 px cell)
  const g = glow ? (glow.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D).getImageData(0, 0, N, N).data : null;
  const cell = Math.max(1, Math.round(3 * k));
  const areaK = (3 * k * (3 * k)) / (cell * cell); // page cells per game cell
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
      const h = hueOf(r0, g0, b0);
      const pale = look === 4 && (a[i + 3] as number) > 200 && h > 55 && h < 110 && sat > 0.38 && mx > 120; // BL5's pale gas sacs
      if ((g !== null && (g[i + 3] as number) > 100) || pale) on[Math.floor(y / cell) * gw + Math.floor(x / cell)] = 1;
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
      for (const m of [j - 1, j + 1, j - gw, j + gw]) {
        if (m >= 0 && m < on.length && on[m] && !seen[m]) {
          seen[m] = 1;
          stack.push(m);
        }
      }
    }
    const pageCount = count / areaK;
    if (pageCount < 3 || pageCount > 400) continue;
    sacs.push({ x: (sx / count + 0.5) * cell, y: (sy / count + 0.5) * cell, r: Math.max(4 * k, Math.sqrt(count / Math.PI) * cell * 1.15), seed: sacs.length + seed });
  }
  // BL5 is all gas sacs; add a few where its drawing has them dim, and one on every look
  const extra = look === 4 ? 4 : 1;
  for (let i = 0; i < extra; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const ang = rnd() * Math.PI * 2;
      const rr = body * (0.25 + rnd() * 0.5);
      const x = cx + Math.cos(ang) * rr;
      const y = N / 2 + Math.sin(ang) * rr;
      if (inside(x, y) && sacs.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + 10 * k)) {
        sacs.push({ x, y, r: (5 + rnd() * 5 * (1 + s)) * k, seed: seed + 100 + i });
        break;
      }
    }
  }
  const through = look === 1 ? 0.45 : look === 2 ? 0.7 : 1;
  // the veins' dark trace in the skin, into the base picture (kept on the figure)
  const trace = make(N, N);
  const vg = trace.getContext("2d") as CanvasRenderingContext2D;
  vg.lineCap = "round";
  vg.lineJoin = "round";
  for (const v of veins) {
    vg.strokeStyle = `rgba(30,50,40,${0.35 * through})`;
    vg.lineWidth = v.width + k;
    vg.beginPath();
    for (let m = 0; m < v.pts.length; m += 2) {
      if (m) vg.lineTo(v.pts[m] as number, v.pts[m + 1] as number);
      else vg.moveTo(v.pts[m] as number, v.pts[m + 1] as number);
    }
    vg.stroke();
  }
  vg.globalCompositeOperation = "destination-in";
  vg.drawImage(base, 0, 0);
  bg.drawImage(trace, 0, 0);
  freeCanvas(trace);
  // the glowing veins over one pulse period
  const speed = (40 + s * 90) * k;
  const spacing = (70 - s * 25) * k;
  const periodS = spacing / speed;
  const steady = (0.06 + s * 0.2) * through;
  const veinsStrip = make(N * VEIN_STEPS, N);
  const sg = veinsStrip.getContext("2d") as CanvasRenderingContext2D;
  sg.lineCap = "round";
  for (let f = 0; f < VEIN_STEPS; f++) {
    const t = (f / VEIN_STEPS) * periodS;
    sg.save();
    sg.beginPath();
    sg.rect(f * N, 0, N, N);
    sg.clip();
    sg.translate(f * N, 0);
    sg.globalCompositeOperation = "lighter";
    for (const v of veins) {
      for (let m = 2; m < v.pts.length; m += 2) {
        const d = v.dist[m / 2] as number;
        const wave = Math.pow(Math.max(0, Math.cos(((d - t * speed) / spacing) * Math.PI * 2)), 6);
        const al = Math.min(0.85, steady + wave * (0.3 + s * 0.35) * through);
        if (al < 0.03) continue;
        sg.beginPath();
        sg.moveTo(v.pts[m - 2] as number, v.pts[m - 1] as number);
        sg.lineTo(v.pts[m] as number, v.pts[m + 1] as number);
        sg.strokeStyle = `rgba(140,255,70,${al * 0.3})`;
        sg.lineWidth = v.width * 2.6;
        sg.stroke();
        sg.strokeStyle = `rgba(200,255,140,${al})`;
        sg.lineWidth = v.width;
        sg.stroke();
      }
    }
    sg.restore();
  }
  return { fx: { sacs, periodS, s, through }, veins: veinsStrip };
}
