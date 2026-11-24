/**
 * Story 6.3 (test helper, no DOM, no Phaser): a scene stand-in with chainable fake game objects, a
 * fake texture manager, and fake canvases whose 2D context records what the darkness paints. Enough
 * to test what the darkness views draw and when, not a renderer.
 */
export class FakeObject {
  x = 0;
  y = 0;
  depth = 0;
  visible = true;
  alpha = 1;
  rotation = 0;
  frame = "";
  texture = "";
  displayWidth = 0;
  displayHeight = 0;
  blend = 0;
  tint = 0;
  destroyed = false;
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  setVisible(v: boolean): this {
    this.visible = v;
    return this;
  }
  setAlpha(a: number): this {
    this.alpha = a;
    return this;
  }
  setRotation(r: number): this {
    this.rotation = r;
    return this;
  }
  setFrame(f: string): this {
    this.frame = f;
    return this;
  }
  setTexture(t: string, f?: string): this {
    this.texture = t;
    if (f !== undefined) this.frame = f;
    return this;
  }
  setDisplaySize(w: number, h: number): this {
    this.displayWidth = w;
    this.displayHeight = h;
    return this;
  }
  setOrigin(): this {
    return this;
  }
  setScale(): this {
    return this;
  }
  setBlendMode(b: number): this {
    this.blend = b;
    return this;
  }
  setTint(t: number): this {
    this.tint = t;
    return this;
  }
  clearTint(): this {
    return this;
  }
  setTintMode(): this {
    return this;
  }
  setStrokeStyle(): this {
    return this;
  }
  fillStyle(): this {
    return this;
  }
  fillRect(): this {
    return this;
  }
  strokes = 0;
  lineAlpha = 0;
  lineStyle(_w: number, _c: number, a = 1): this {
    this.lineAlpha = a;
    return this;
  }
  strokeCircle(): this {
    this.strokes++;
    return this;
  }
  clear(): this {
    this.strokes = 0;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

/** One recorded 2D call. */
export interface CtxOp {
  op: string;
  alpha: number;
  comp: string;
  fill: unknown;
  args: readonly unknown[];
}

export class FakeCtx {
  readonly ops: CtxOp[] = [];
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  fillStyle: unknown = "#000";
  strokeStyle: unknown = "#000";
  lineWidth = 1;
  private rec(op: string, args: readonly unknown[]): void {
    this.ops.push({ op, alpha: this.globalAlpha, comp: this.globalCompositeOperation, fill: this.fillStyle, args });
  }
  setTransform(...a: number[]): void {
    this.rec("setTransform", a);
  }
  clearRect(...a: number[]): void {
    this.rec("clearRect", a);
  }
  fillRect(...a: number[]): void {
    this.rec("fillRect", a);
  }
  drawImage(...a: unknown[]): void {
    this.rec("drawImage", a);
  }
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  fill(): void {
    this.rec("fill", []);
  }
  createRadialGradient(): { stops: [number, string][]; addColorStop(at: number, c: string): void } {
    const g = { stops: [] as [number, string][], addColorStop: (at: number, c: string) => void g.stops.push([at, c]) };
    return g;
  }
  createLinearGradient(): { addColorStop(): void } {
    return { addColorStop: () => {} };
  }
  /** Ops of one kind. */
  count(op: string): number {
    return this.ops.filter((o) => o.op === op).length;
  }
  clear(): void {
    this.ops.length = 0;
  }
}

export interface FakeCanvas {
  width: number;
  height: number;
  ctx: FakeCtx;
  getContext(): FakeCtx;
  addEventListener(): void;
  removeEventListener(): void;
}

export function fakeCanvas(): FakeCanvas {
  const ctx = new FakeCtx();
  return { width: 0, height: 0, ctx, getContext: () => ctx, addEventListener: () => {}, removeEventListener: () => {} };
}

export interface FakeScene {
  readonly objects: FakeObject[];
  readonly canvases: FakeCanvas[];
  readonly keys: Set<string>;
  refreshes: number;
  makeCanvas(): HTMLCanvasElement;
  /** The scene as the views take it. */
  readonly scene: never;
}

/** A fake scene: `add.image/circle/graphics`, `textures.exists/addCanvas/remove` (every atlas key "exists"). */
export function fakeScene(atlasKeys: readonly string[] = []): FakeScene {
  const objects: FakeObject[] = [];
  const canvases: FakeCanvas[] = [];
  const keys = new Set<string>(atlasKeys);
  const out: FakeScene = {
    objects,
    canvases,
    keys,
    refreshes: 0,
    makeCanvas: () => {
      const c = fakeCanvas();
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
    scene: null as never,
  };
  const make = (texture = "", frame = ""): FakeObject => {
    const o = new FakeObject().setTexture(texture, frame);
    objects.push(o);
    return o;
  };
  const tex = { refresh: () => (out.refreshes += 1), add: () => {}, getFrameNames: () => [], get: () => ({ cutX: 0, cutY: 0, cutWidth: 1, cutHeight: 1 }) };
  (out as { scene: unknown }).scene = {
    add: {
      image: (_x: number, _y: number, t: string, f?: string) => make(t, f ?? ""),
      circle: () => make(),
      graphics: () => make(),
    },
    textures: {
      exists: (k: string) => keys.has(k),
      addCanvas: (k: string) => {
        keys.add(k);
        return tex;
      },
      remove: (k: string) => keys.delete(k),
    },
  };
  return out;
}
