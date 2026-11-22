/**
 * Story 4.9 review (test helper, no DOM): a point-sampling stand-in for `CanvasRenderingContext2D`.
 * It runs the real `drawLightmap` / `drawGlow` and records, at a list of probe points (map px), the
 * colour the canvas would hold there: solid and gradient fills, `fillRect`, polygon paths, the
 * `source-over` and `lighter` composites, `save`/`restore`/`translate`/`scale`/`setTransform`
 * (no rotation: the light functions never rotate). Enough to test the baked light, not a renderer.
 */

type Rgba = [number, number, number, number];

function parseColor(c: string): Rgba {
  const s = c.trim();
  if (s.startsWith("#")) {
    const n = parseInt(s.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) throw new Error(`probe canvas: unsupported colour ${c}`);
  const p = (m[1] as string).split(",").map((v) => Number(v.trim()));
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
}

interface Stop {
  t: number;
  c: Rgba;
}
class ProbeGradient {
  readonly stops: Stop[] = [];
  constructor(
    readonly kind: "linear" | "radial",
    readonly a: readonly number[],
  ) {}
  addColorStop(t: number, c: string): void {
    this.stops.push({ t, c: parseColor(c) });
    this.stops.sort((x, y) => x.t - y.t);
  }
  /** Colour at local point (x, y). */
  at(x: number, y: number): Rgba {
    let t: number;
    if (this.kind === "linear") {
      const [x0, y0, x1, y1] = this.a as [number, number, number, number];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const l2 = dx * dx + dy * dy;
      t = l2 > 0 ? ((x - x0) * dx + (y - y0) * dy) / l2 : 0;
    } else {
      // concentric radial gradients only (r0 at the same centre)
      const [cx, cy, r0, , , r1] = this.a as [number, number, number, number, number, number];
      t = (Math.hypot(x - cx, y - cy) - r0) / Math.max(1e-9, r1 - r0);
    }
    t = Math.min(1, Math.max(0, t));
    const st = this.stops;
    if (st.length === 0) return [0, 0, 0, 0];
    if (t <= (st[0] as Stop).t) return (st[0] as Stop).c;
    for (let i = 1; i < st.length; i++) {
      const a = st[i - 1] as Stop;
      const b = st[i] as Stop;
      if (t <= b.t) {
        const k = (t - a.t) / Math.max(1e-9, b.t - a.t);
        return [0, 1, 2, 3].map((j) => (a.c[j] as number) + ((b.c[j] as number) - (a.c[j] as number)) * k) as Rgba;
      }
    }
    return (st[st.length - 1] as Stop).c;
  }
}

/** A probe "canvas": `colorAt(i)` is the RGB at probe i after the drawing (opaque black at first). */
export class ProbeContext {
  fillStyle: string | ProbeGradient = "#000";
  globalCompositeOperation = "source-over";
  private m = [1, 0, 0, 1, 0, 0]; // a b c d e f (only a, d, e, f used)
  private stack: number[][] = [];
  private path: [number, number][][] = [];
  private readonly px: Float64Array;
  constructor(private readonly points: readonly (readonly [number, number])[]) {
    this.px = new Float64Array(points.length * 3);
  }
  colorAt(i: number): [number, number, number] {
    return [this.px[i * 3] as number, this.px[i * 3 + 1] as number, this.px[i * 3 + 2] as number];
  }
  setTransform(a: number, _b: number, _c: number, d: number, e: number, f: number): void {
    this.m = [a, 0, 0, d, e, f];
  }
  save(): void {
    this.stack.push(this.m.slice());
  }
  restore(): void {
    this.m = this.stack.pop() ?? [1, 0, 0, 1, 0, 0];
  }
  translate(x: number, y: number): void {
    this.m[4] = (this.m[4] as number) + (this.m[0] as number) * x;
    this.m[5] = (this.m[5] as number) + (this.m[3] as number) * y;
  }
  scale(x: number, y: number): void {
    this.m[0] = (this.m[0] as number) * x;
    this.m[3] = (this.m[3] as number) * y;
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): ProbeGradient {
    return new ProbeGradient("radial", [x0, y0, r0, x1, y1, r1]);
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): ProbeGradient {
    return new ProbeGradient("linear", [x0, y0, x1, y1]);
  }
  beginPath(): void {
    this.path = [];
  }
  moveTo(x: number, y: number): void {
    this.path.push([[x, y]]);
  }
  lineTo(x: number, y: number): void {
    const sub = this.path[this.path.length - 1];
    if (sub) sub.push([x, y]);
    else this.path.push([[x, y]]);
  }
  closePath(): void {}
  fillRect(x: number, y: number, w: number, h: number): void {
    this.paint((lx, ly) => lx >= Math.min(x, x + w) && lx < Math.max(x, x + w) && ly >= Math.min(y, y + h) && ly < Math.max(y, y + h));
  }
  fill(): void {
    const subs = this.path;
    this.paint((lx, ly) => {
      let inside = false;
      for (const poly of subs) {
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i] as [number, number];
          const [xj, yj] = poly[j] as [number, number];
          if (yi > ly !== yj > ly && lx < ((xj - xi) * (ly - yi)) / (yj - yi) + xi) inside = !inside;
        }
      }
      return inside;
    });
  }
  private paint(inside: (lx: number, ly: number) => boolean): void {
    const [a, , , d, e, f] = this.m as [number, number, number, number, number, number];
    for (let i = 0; i < this.points.length; i++) {
      const [x, y] = this.points[i] as [number, number];
      const lx = (x - e) / a;
      const ly = (y - f) / d;
      if (!inside(lx, ly)) continue;
      const c = typeof this.fillStyle === "string" ? parseColor(this.fillStyle) : this.fillStyle.at(lx, ly);
      for (let j = 0; j < 3; j++) {
        const k = i * 3 + j;
        const src = c[j] as number;
        const dst = this.px[k] as number;
        this.px[k] = this.globalCompositeOperation === "lighter" ? Math.min(255, dst + src * c[3]) : src * c[3] + dst * (1 - c[3]);
      }
    }
  }
}
