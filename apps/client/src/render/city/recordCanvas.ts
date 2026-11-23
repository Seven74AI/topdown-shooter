/**
 * Story 4.12 (test helper, no DOM): a recording stand-in for `CanvasRenderingContext2D` that runs a
 * code drawing and keeps, per fill / stroke, the bounding box of what it painted (in the canvas's
 * device units, after the current transform) and whether it was inside a clip or cast a canvas
 * shadow. Enough to test where a drawing puts its parts, not a renderer.
 */

export interface PaintOp {
  readonly kind: "fill" | "stroke";
  /** Bounding box (device units); for a shadowed op, of the shape itself (not of its shadow). */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly clipped: boolean;
  /** Where the canvas shadow lands (the box moved by the shadow offset), or null without a shadow. */
  readonly shadow: { x0: number; y0: number; x1: number; y1: number } | null;
  readonly style: string;
}

type M = [number, number, number, number, number, number];

interface State {
  m: M;
  clipped: boolean;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  globalAlpha: number;
  globalCompositeOperation: string;
}

const gradient = { addColorStop: (): void => {} };

export class RecordCanvas {
  readonly ops: PaintOp[] = [];
  private st: State = { m: [1, 0, 0, 1, 0, 0], clipped: false, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, shadowColor: "rgba(0,0,0,0)", shadowOffsetX: 0, shadowOffsetY: 0, globalAlpha: 1, globalCompositeOperation: "source-over" };
  private readonly stack: State[] = [];
  private pts: [number, number][] = [];
  lineCap = "butt";
  lineJoin = "miter";
  shadowBlur = 0;
  filter = "none";

  get fillStyle(): unknown {
    return this.st.fillStyle;
  }
  set fillStyle(v: unknown) {
    this.st.fillStyle = v;
  }
  get strokeStyle(): unknown {
    return this.st.strokeStyle;
  }
  set strokeStyle(v: unknown) {
    this.st.strokeStyle = v;
  }
  get lineWidth(): number {
    return this.st.lineWidth;
  }
  set lineWidth(v: number) {
    this.st.lineWidth = v;
  }
  get shadowColor(): string {
    return this.st.shadowColor;
  }
  set shadowColor(v: string) {
    this.st.shadowColor = v;
  }
  get shadowOffsetX(): number {
    return this.st.shadowOffsetX;
  }
  set shadowOffsetX(v: number) {
    this.st.shadowOffsetX = v;
  }
  get shadowOffsetY(): number {
    return this.st.shadowOffsetY;
  }
  set shadowOffsetY(v: number) {
    this.st.shadowOffsetY = v;
  }
  get globalAlpha(): number {
    return this.st.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.st.globalAlpha = v;
  }
  get globalCompositeOperation(): string {
    return this.st.globalCompositeOperation;
  }
  set globalCompositeOperation(v: string) {
    this.st.globalCompositeOperation = v;
  }

  save(): void {
    this.stack.push({ ...this.st, m: [...this.st.m] as M });
  }
  restore(): void {
    const s = this.stack.pop();
    if (s) this.st = s;
  }
  private mul(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const [A, B, C, D, E, F] = this.st.m;
    this.st.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  translate(x: number, y: number): void {
    this.mul(1, 0, 0, 1, x, y);
  }
  scale(x: number, y: number): void {
    this.mul(x, 0, 0, y, 0, 0);
  }
  rotate(a: number): void {
    this.mul(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.st.m = [a, b, c, d, e, f];
  }
  getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number } {
    const [a, b, c, d, e, f] = this.st.m;
    return { a, b, c, d, e, f };
  }
  private pt(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.st.m;
    this.pts.push([a * x + c * y + e, b * x + d * y + f]);
  }
  beginPath(): void {
    this.pts = [];
  }
  closePath(): void {}
  moveTo(x: number, y: number): void {
    this.pt(x, y);
  }
  lineTo(x: number, y: number): void {
    this.pt(x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.pt(cx, cy);
    this.pt(x, y);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number): void {
    this.pt(x1, y1);
    this.pt(x2, y2);
  }
  arc(x: number, y: number, r: number): void {
    this.box(x, y, r, r);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rotation = 0): void {
    // Story 5.26: exact for an unrotated ellipse; a rotated one keeps the conservative circle.
    if (rotation === 0) this.box(x, y, rx, ry);
    else {
      const r = Math.max(rx, ry);
      this.box(x, y, r, r);
    }
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.pt(x, y);
    this.pt(x + w, y);
    this.pt(x + w, y + h);
    this.pt(x, y + h);
  }
  private box(x: number, y: number, rx: number, ry: number): void {
    this.pt(x - rx, y - ry);
    this.pt(x + rx, y - ry);
    this.pt(x + rx, y + ry);
    this.pt(x - rx, y + ry);
  }
  clip(): void {
    this.st.clipped = true;
  }
  private record(kind: "fill" | "stroke"): void {
    if (this.pts.length === 0) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of this.pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const sc = /rgba\([^)]*,\s*0\)$/.test(this.st.shadowColor.replace(/\s/g, "")) ? null : this.st.shadowColor;
    const dx = this.st.shadowOffsetX;
    const dy = this.st.shadowOffsetY;
    const shadow = sc ? { x0: x0 + dx, y0: y0 + dy, x1: x1 + dx, y1: y1 + dy } : null;
    const style = kind === "fill" ? this.st.fillStyle : this.st.strokeStyle;
    this.ops.push({ kind, x0, y0, x1, y1, clipped: this.st.clipped, shadow, style: typeof style === "string" ? style : "gradient" });
  }
  fill(): void {
    this.record("fill");
  }
  stroke(): void {
    this.record("stroke");
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.beginPath();
    this.rect(x, y, w, h);
    this.record("fill");
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.beginPath();
    this.rect(x, y, w, h);
    this.record("stroke");
  }
  createLinearGradient(): typeof gradient {
    return gradient;
  }
  createRadialGradient(): typeof gradient {
    return gradient;
  }

  /** Unclipped, unshadowed paint (what the drawing puts where it says). */
  painted(): PaintOp[] {
    return this.ops.filter((o) => !o.clipped && !o.shadow);
  }
}

/** The recorder as a 2D context (the code drawings only use what it implements). */
export function asContext(r: RecordCanvas): CanvasRenderingContext2D {
  return r as unknown as CanvasRenderingContext2D;
}
