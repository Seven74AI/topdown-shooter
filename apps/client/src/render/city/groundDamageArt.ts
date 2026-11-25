/**
 * Asset fixes (designer, 2026-11-24): the Behemoth's slam decal, picked from `docs/art/asset-fixes-1`
 * round 2 ("great, there is detail, it's not cartoonesque") as R1 + R2 + R3 combined: a shaded impact
 * dish from a noise height field, a scorched centre, tapering fractures with a lit lip, long hairline
 * fractures, dust ejecta rays and loose gravel. Drawn once into the boss FX atlas (and again by its
 * repaint after a lost canvas). Pure Canvas 2D, seeded: the same decal every time.
 */

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal value noise, about 0–1. */
export function fbm(x: number, y: number, seed: number, oct = 5): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, seed + i * 17);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export interface DamageLook {
  /** How deep the impact dish reads (0 = flat). */
  readonly bowl: number;
  /** Main fractures. */
  readonly cracks: number;
  /** Scorch strength. */
  readonly soot: number;
  /** Dust ejecta strength. */
  readonly rays: number;
  /** Loose chunks. */
  readonly debris: number;
  /** Long hairline fractures reaching past the dish. */
  readonly fine: number;
  readonly seed: number;
}

/** The designer's pick: R1 + R2 + R3 in one decal. */
export const SLAM_DAMAGE: DamageLook = { bowl: 1, cracks: 11, soot: 0.6, rays: 0.55, debris: 260, fine: 9, seed: 7 };

/**
 * Draws the ground damage into `g` as an `n` × `n` square at (x0, y0) (transparent where untouched).
 * `scratch` makes the pixel buffer (a canvas of n × n; injectable for tests).
 */
export function drawGroundDamage(g: G, x0: number, y0: number, n: number, o: DamageLook = SLAM_DAMAGE, scratch: () => HTMLCanvasElement = () => document.createElement("canvas")): void {
  const N = n;
  const c = scratch();
  c.width = N;
  c.height = N;
  const sg = c.getContext("2d");
  if (!sg) return;
  const img = sg.createImageData(N, N);
  const d = img.data;
  const cx = N / 2;
  const R0 = N * 0.15; // dish radius
  const unit = N / 256; // the look was tuned at 256 px
  // the height field, once per pixel (plus a 1 px border for the slopes)
  const W = N + 2;
  const H = new Float32Array(W * W);
  for (let y = -1; y <= N; y++) {
    for (let x = -1; x <= N; x++) {
      const dx = (x - cx) / R0;
      const dy = (y - cx) / R0;
      const r = Math.sqrt(dx * dx + dy * dy);
      const dish = r < 1.6 ? -Math.cos(Math.min(1, r / 1.25) * Math.PI * 0.5) * (1 - Math.max(0, r - 1.25) / 0.35) : 0;
      const rim = Math.exp(-((r - 1.25) ** 2) / 0.04) * 0.25; // the pushed-up lip
      const nz = fbm(x / (9 * unit), y / (9 * unit), o.seed, 4) - 0.5;
      H[(y + 1) * W + (x + 1)] = (dish + rim) * o.bowl + nz * 0.35 * Math.min(1, 1.8 / (r + 0.3));
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const hi = (y + 1) * W + (x + 1);
      const nx = (H[hi - 1] as number) - (H[hi + 1] as number);
      const ny = (H[hi - W] as number) - (H[hi + W] as number);
      const shade = (nx * -0.55 + ny * -0.83) * 6 * unit; // light from the top-left (the map's light)
      const dx = (x - cx) / (N / 2);
      const dy = (y - cx) / (N / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const fade = Math.max(0, 1 - r / 0.62);
      let soot = 0;
      if (o.soot > 0 && r < 0.45) soot = o.soot * Math.max(0, 1 - r / (0.32 + 0.12 * fbm(x / (20 * unit), y / (20 * unit), o.seed + 9, 3))) * (0.7 + 0.3 * fbm(x / (6 * unit), y / (6 * unit), o.seed + 4, 3));
      let dust = 0;
      if (o.rays > 0 && Math.abs(r - 0.45) < 0.32) {
        const ang = Math.atan2(dy, dx);
        const ray = Math.pow(fbm(Math.cos(ang) * 6 + 10, Math.sin(ang) * 6 + 10, o.seed + 2, 3), 3) * 4;
        dust = o.rays * ray * (1 - Math.abs(r - 0.45) / 0.32) * (0.6 + 0.4 * fbm(x / (3 * unit), y / (3 * unit), o.seed + 5, 2));
      }
      let lr = 0;
      let lg = 0;
      let lb = 0;
      let a: number;
      if (shade > 0) {
        lr = lg = lb = 200;
        a = Math.min(0.5, shade * 0.6) * fade;
      } else a = Math.min(0.75, -shade * 0.8) * fade;
      const sa = Math.min(0.85, soot);
      lr = lr * (1 - sa) + 18 * sa;
      lg = lg * (1 - sa) + 14 * sa;
      lb = lb * (1 - sa) + 12 * sa;
      a = a + sa * (1 - a);
      const da = Math.min(0.35, dust);
      lr = lr * (1 - da) + 150 * da;
      lg = lg * (1 - da) + 144 * da;
      lb = lb * (1 - da) + 134 * da;
      a = a + da * (1 - a);
      d[i] = lr;
      d[i + 1] = lg;
      d[i + 2] = lb;
      d[i + 3] = Math.round(a * 255);
    }
  }
  sg.putImageData(img, 0, 0);
  g.drawImage(c, x0, y0);
  c.width = 0; // free the scratch pixels at once
  c.height = 0;
  // fractures: branching, tapering, straight runs with sharp kinks, a lit lip on the light side
  g.save();
  g.translate(x0, y0);
  g.scale(unit, unit);
  const rr = rng(o.seed);
  const crack = (x: number, y: number, ang: number, len: number, w: number, depth: number): void => {
    const pts: number[] = [x, y, w];
    let px = x;
    let py = y;
    let pa = ang;
    for (let t = 0; t < len; t += 2.2) {
      pa += (rr() - 0.5) * 0.16 + (fbm(px / 30, py / 30, o.seed + 30, 2) - 0.5) * 0.1 + (rr() < 0.07 ? (rr() - 0.5) * 1.3 : 0);
      px += Math.cos(pa) * 2.2;
      py += Math.sin(pa) * 2.2;
      pts.push(px, py, w * (1 - t / len) + 0.35);
      if (depth < 2 && rr() < 0.022) crack(px, py, pa + (rr() < 0.5 ? -1 : 1) * (0.5 + rr() * 0.6), len * (0.3 + rr() * 0.3), w * 0.55, depth + 1);
    }
    g.lineCap = "round";
    for (const [ox, col, k] of [
      [-0.8, "rgba(190,185,175,0.18)", 1.1],
      [0, "rgba(6,5,4,0.92)", 1],
    ] as const) {
      g.strokeStyle = col;
      for (let i = 3; i < pts.length; i += 3) {
        g.lineWidth = (pts[i - 1] as number) * k;
        g.beginPath();
        g.moveTo((pts[i - 3] as number) + ox, (pts[i - 2] as number) + ox);
        g.lineTo((pts[i] as number) + ox, (pts[i + 1] as number) + ox);
        g.stroke();
      }
    }
  };
  const C = 128;
  const D0 = 256 * 0.15;
  for (let i = 0; i < o.cracks; i++) {
    const ang = (i / o.cracks) * TAU + rr() * 0.4;
    const start = D0 * (0.3 + rr() * 0.5);
    crack(C + Math.cos(ang) * start, C + Math.sin(ang) * start, ang, 256 * (0.18 + rr() * 0.22), 1.6 + rr() * 1.2, 0);
  }
  for (let i = 0; i < o.cracks * 2; i++) {
    const ang = rr() * TAU;
    const rad = D0 * (0.5 + rr() * 0.9);
    crack(C + Math.cos(ang) * rad, C + Math.sin(ang) * rad, ang + Math.PI / 2 + (rr() - 0.5) * 0.6, 10 + rr() * 16, 1.3, 2);
  }
  for (let i = 0; i < o.fine; i++) {
    const ang = rr() * TAU;
    const start = D0 * (1.1 + rr() * 0.6);
    crack(C + Math.cos(ang) * start, C + Math.sin(ang) * start, ang + (rr() - 0.5) * 0.4, 256 * (0.12 + rr() * 0.16), 0.9 + rr() * 0.5, 1);
  }
  for (let i = 0; i < o.debris; i++) {
    const ang = rr() * TAU;
    const dd = D0 * (0.6 + Math.pow(rr(), 0.7) * 2.6);
    const x = C + Math.cos(ang) * dd;
    const y = C + Math.sin(ang) * dd;
    const s = rr() < 0.15 ? 2 + rr() * 3 : 0.8 + rr() * 1.2;
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(x + 0.8, y + 0.8, s, s * 0.8);
    const v = Math.round(55 + rr() * 55);
    g.fillStyle = `rgb(${v},${v - 3},${v - 6})`;
    g.fillRect(x, y, s, s * 0.8);
  }
  g.restore();
}
