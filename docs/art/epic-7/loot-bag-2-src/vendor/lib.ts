/** The few helpers of docs/art/asset-fixes-1/src/lib.ts (branch claude/dazzling-meitner-zhu5p0) that relief.ts uses. */
export type G = CanvasRenderingContext2D;
export function canvas(w: number, h: number): HTMLCanvasElement { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
export function ctx(c: HTMLCanvasElement): G { return c.getContext("2d", { willReadFrequently: true }) as G; }
export function roundRect(g: G, x: number, y: number, w: number, h: number, r: number): void { g.beginPath(); g.roundRect(x, y, w, h, r); }
export function hash2(x: number, y: number, seed: number): number { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
export function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, seed: number, oct = 5): number { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, seed + i * 17); f *= 2.03; amp *= 0.5; } return s; }
