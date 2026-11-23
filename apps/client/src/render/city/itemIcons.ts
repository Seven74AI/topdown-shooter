/**
 * Round D item icons (designer picks, 2026-11-23): **GR6** for gear (Story 5.11) — the GR4 realistic
 * painted objects, each mounted on the GR2 embossed steel tag — and **CI4** for consumables (Story
 * 5.12: the same painted-object painter, no tag). Ported from `docs/art/epic-5/round-d/looks.html`
 * (`makePainter('real' | 'tag' | 'realtag')`, the `ICONS` table, `bakeIcon`).
 *
 * Every icon is drawn in a unit box (0..1) through a `Painter`; `bakeItemIcon` paints one into a
 * square canvas region with the drop shadow. Pure Canvas 2D, no Phaser: the HUD atlas
 * (`gearIcons.ts`, via `addGeneratedTexture`) and the DOM shop (data URLs) both use it.
 * Story 5.12: add the CI4 drawings (medkit, grenade, molotov) to `ITEM_ICONS` and bake them with
 * `{ tag: false }`.
 */

type Path = (q: CanvasRenderingContext2D) => void;

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function R(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 0): void {
  if (!r) {
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.closePath();
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function Pg(c: CanvasRenderingContext2D, p: readonly number[]): void {
  c.moveTo(p[0] as number, p[1] as number);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] as number, p[i + 1] as number);
  c.closePath();
}

function fillP(c: CanvasRenderingContext2D, fn: Path, style: string | CanvasGradient): void {
  c.beginPath();
  fn(c);
  c.fillStyle = style;
  c.fill();
}

function strokeP(c: CanvasRenderingContext2D, fn: Path, style: string | CanvasGradient, w: number): void {
  c.beginPath();
  fn(c);
  c.strokeStyle = style;
  c.lineWidth = w;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
}

const rq =
  (x: number, y: number, w: number, h: number, r = 0): Path =>
  (q) =>
    R(q, x, y, w, h, r);

function crossP(cx: number, cy: number, s: number, t: number): Path {
  return (q) =>
    Pg(q, [
      cx - t / 2, cy - s / 2, cx + t / 2, cy - s / 2, cx + t / 2, cy - t / 2, cx + s / 2, cy - t / 2, cx + s / 2, cy + t / 2, cx + t / 2, cy + t / 2,
      cx + t / 2, cy + s / 2, cx - t / 2, cy + s / 2, cx - t / 2, cy + t / 2, cx - s / 2, cy + t / 2, cx - s / 2, cy - t / 2, cx - t / 2, cy - t / 2,
    ]);
}

function rotPath(cx: number, cy: number, ang: number, pts: readonly number[]): Path {
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  return (q) => {
    for (let i = 0; i < pts.length; i += 2) {
      const px = pts[i] as number;
      const py = pts[i + 1] as number;
      const x = cx + px * cs - py * sn;
      const y = cy + px * sn + py * cs;
      if (i) q.lineTo(x, y);
      else q.moveTo(x, y);
    }
    q.closePath();
  };
}

function rotLines(cx: number, cy: number, ang: number, segs: readonly (readonly [number, number, number, number])[]): Path {
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  return (q) => {
    for (const s of segs) {
      q.moveTo(cx + s[0] * cs - s[1] * sn, cy + s[0] * sn + s[1] * cs);
      q.lineTo(cx + s[2] * cs - s[3] * sn, cy + s[2] * sn + s[3] * cs);
    }
  };
}

// ---- shapes (unit box) ----
const VEST1: Path = (q) => {
  q.moveTo(0.3, 0.1);
  q.lineTo(0.41, 0.1);
  q.quadraticCurveTo(0.43, 0.3, 0.5, 0.34);
  q.quadraticCurveTo(0.57, 0.3, 0.59, 0.1);
  q.lineTo(0.7, 0.1);
  q.quadraticCurveTo(0.72, 0.34, 0.85, 0.4);
  q.lineTo(0.85, 0.86);
  q.quadraticCurveTo(0.85, 0.92, 0.79, 0.92);
  q.lineTo(0.21, 0.92);
  q.quadraticCurveTo(0.15, 0.92, 0.15, 0.86);
  q.lineTo(0.15, 0.4);
  q.quadraticCurveTo(0.28, 0.34, 0.3, 0.1);
  q.closePath();
};
const VEST2: Path = (q) => {
  q.moveTo(0.2, 0.06);
  q.lineTo(0.39, 0.06);
  q.quadraticCurveTo(0.41, 0.22, 0.5, 0.24);
  q.quadraticCurveTo(0.59, 0.22, 0.61, 0.06);
  q.lineTo(0.8, 0.06);
  q.lineTo(0.82, 0.24);
  q.quadraticCurveTo(0.85, 0.33, 0.95, 0.35);
  q.lineTo(0.95, 0.9);
  q.quadraticCurveTo(0.95, 0.95, 0.9, 0.95);
  q.lineTo(0.1, 0.95);
  q.quadraticCurveTo(0.05, 0.95, 0.05, 0.9);
  q.lineTo(0.05, 0.35);
  q.quadraticCurveTo(0.15, 0.33, 0.18, 0.24);
  q.closePath();
};
const SHOE_UP: Path = (q) => {
  q.moveTo(0.11, 0.66);
  q.lineTo(0.13, 0.34);
  q.quadraticCurveTo(0.14, 0.27, 0.22, 0.27);
  q.lineTo(0.32, 0.3);
  q.quadraticCurveTo(0.35, 0.4, 0.44, 0.4);
  q.quadraticCurveTo(0.52, 0.4, 0.56, 0.44);
  q.quadraticCurveTo(0.75, 0.48, 0.87, 0.54);
  q.quadraticCurveTo(0.96, 0.58, 0.94, 0.66);
  q.closePath();
};
const SHOE_SOLE: Path = (q) => {
  q.moveTo(0.07, 0.64);
  q.lineTo(0.96, 0.64);
  q.quadraticCurveTo(0.99, 0.75, 0.91, 0.77);
  q.lineTo(0.13, 0.77);
  q.quadraticCurveTo(0.06, 0.77, 0.07, 0.64);
  q.closePath();
};
const SHOE_LACE: Path = (q) => {
  q.moveTo(0.39, 0.42);
  q.lineTo(0.43, 0.5);
  q.moveTo(0.47, 0.43);
  q.lineTo(0.51, 0.51);
  q.moveTo(0.55, 0.46);
  q.lineTo(0.59, 0.53);
};
const SHOE_STRIPE: Path = (q) => {
  q.moveTo(0.21, 0.57);
  q.quadraticCurveTo(0.46, 0.63, 0.75, 0.52);
};
const SPEED: Path = (q) => {
  q.moveTo(0.0, 0.4);
  q.lineTo(0.08, 0.4);
  q.moveTo(0.02, 0.51);
  q.lineTo(0.08, 0.51);
};
const BAG = rq(0.06, 0.38, 0.68, 0.5, 0.09);
const BAG_HANDLE: Path = (q) => {
  q.moveTo(0.24, 0.39);
  q.quadraticCurveTo(0.24, 0.2, 0.4, 0.2);
  q.quadraticCurveTo(0.56, 0.2, 0.56, 0.39);
};
const BAG_CROSS = crossP(0.38, 0.64, 0.3, 0.1);
const SA = -0.8;
const SYR = rotPath(0.74, 0.36, SA, [-0.2, -0.055, 0.12, -0.055, 0.12, 0.055, -0.2, 0.055]);
const SYR_THUMB = rotPath(0.74, 0.36, SA, [-0.33, -0.07, -0.29, -0.07, -0.29, 0.07, -0.33, 0.07]);
const SYR_ROD = rotLines(0.74, 0.36, SA, [[-0.3, 0, -0.2, 0]]);
const SYR_NEEDLE = rotLines(0.74, 0.36, SA, [[0.12, 0, 0.27, 0]]);
const SYR_MARK = rotLines(0.74, 0.36, SA, [
  [-0.1, -0.055, -0.1, 0],
  [0.0, -0.055, 0.0, 0],
  [0.08, -0.055, 0.08, 0],
]);
const FA = -0.72;
const TORCH_BODY = rotPath(0.4, 0.62, FA, [-0.34, -0.065, 0.08, -0.065, 0.08, 0.065, -0.34, 0.065]);
const TORCH_HEAD = rotPath(0.4, 0.62, FA, [0.06, -0.075, 0.15, -0.115, 0.25, -0.115, 0.25, 0.115, 0.15, 0.115, 0.06, 0.075]);
const TORCH_TAIL = rotPath(0.4, 0.62, FA, [-0.39, -0.078, -0.32, -0.078, -0.32, 0.078, -0.39, 0.078]);
const TORCH_LENS = rotPath(0.4, 0.62, FA, [0.24, -0.1, 0.28, -0.1, 0.28, 0.1, 0.24, 0.1]);
const TORCH_BEAM = rotPath(0.4, 0.62, FA, [0.28, -0.1, 0.56, -0.21, 0.56, 0.21, 0.28, 0.1]);
const TORCH_KNURL = rotLines(0.4, 0.62, FA, [
  [-0.27, -0.065, -0.27, 0.065],
  [-0.21, -0.065, -0.21, 0.065],
  [-0.15, -0.065, -0.15, 0.065],
]);

/** What an icon drawing calls (looks.html's painter contract). */
export interface Painter {
  pre?(): void;
  body(p: Path, base: string): void;
  sub(p: Path, base: string): void;
  mark(p: Path, base: string): void;
  line(p: Path, w: number, base?: string): void;
  rod(p: Path, w: number, base: string): void;
  beam(p: Path): void;
}

/** One icon: draws itself with a painter in the unit box. */
export type ItemIconDraw = (p: Painter) => void;

/** The drawings by icon id (looks.html `ICONS`; gear ids are `gear.json` keys). */
export const ITEM_ICONS: Readonly<Record<string, ItemIconDraw>> = {
  body_armor_1(p) {
    p.body(VEST1, "#5b6440");
    p.line((q) => {
      q.moveTo(0.5, 0.36);
      q.lineTo(0.5, 0.9);
    }, 0.035, "#2a2e1c");
    p.line((q) => {
      q.moveTo(0.16, 0.63);
      q.lineTo(0.4, 0.63);
      q.moveTo(0.6, 0.63);
      q.lineTo(0.84, 0.63);
    }, 0.05, "#2a2e1c");
  },
  body_armor_2(p) {
    p.body(VEST2, "#2a2d31");
    p.sub(rq(0.27, 0.31, 0.46, 0.37, 0.04), "#535a63");
    for (const x of [0.12, 0.395, 0.67]) p.sub(rq(x, 0.73, 0.21, 0.17, 0.03), "#4a5230");
  },
  running_shoes(p) {
    p.body(SHOE_UP, "#c8382a");
    p.sub(SHOE_SOLE, "#e6e2d6");
    p.line(SHOE_LACE, 0.035, "#f2efe6");
    p.line(SHOE_STRIPE, 0.05, "#f2efe6");
    p.rod(SPEED, 0.045, "#cfd6e0");
  },
  revive_kit(p) {
    p.rod(BAG_HANDLE, 0.07, "#3a0d0a");
    p.body(BAG, "#b3261e");
    p.mark(BAG_CROSS, "#f4f1ea");
    p.rod(SYR_ROD, 0.04, "#3a3d42");
    p.sub(SYR_THUMB, "#3a3d42");
    p.sub(SYR, "#dfe7ec");
    p.line(SYR_MARK, 0.025, "#6a7480");
    p.rod(SYR_NEEDLE, 0.025, "#c9d2da");
  },
  tactical_flashlight(p) {
    p.beam(TORCH_BEAM);
    p.body(TORCH_BODY, "#1e2023");
    p.sub(TORCH_TAIL, "#33363b");
    p.sub(TORCH_HEAD, "#33363b");
    p.mark(TORCH_LENS, "#fff1c2");
    p.line(TORCH_KNURL, 0.025, "#4a4e55");
  },
};

/** GR4 / CI4: painted objects in their real colours (`px` = one display pixel in unit-box units). */
export function realPainter(g: CanvasRenderingContext2D, px: number): Painter {
  const W1 = (w: number) => Math.max(px, w);
  const shadeIt = (p: Path, base: string): void => {
    fillP(g, p, base);
    g.save();
    g.beginPath();
    p(g);
    g.clip();
    const gr = g.createLinearGradient(0.1, 0.1, 0.9, 0.9);
    gr.addColorStop(0, "rgba(255,255,255,0.32)");
    gr.addColorStop(0.5, "rgba(0,0,0,0)");
    gr.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 1, 1);
    const r = mulberry(base.length * 7 + 3);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.1)";
      g.fillRect(r(), r(), px * 1.2, px * 1.2);
    }
    g.restore();
    strokeP(g, p, "rgba(0,0,0,0.85)", W1(0.028));
  };
  return {
    body: shadeIt,
    sub: shadeIt,
    mark(p, b) {
      fillP(g, p, b);
      strokeP(g, p, "rgba(0,0,0,0.45)", W1(0.015));
    },
    line(p, w, b) {
      strokeP(g, p, b ?? "rgba(0,0,0,0.55)", W1(w));
    },
    rod(p, w, b) {
      strokeP(g, p, "rgba(0,0,0,0.85)", W1(w) + W1(0.03));
      strokeP(g, p, b, W1(w));
    },
    beam(p) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const gr = g.createLinearGradient(0.6, 0.45, 0.9, 0.18);
      gr.addColorStop(0, "rgba(255,240,190,0.65)");
      gr.addColorStop(1, "rgba(255,230,170,0)");
      fillP(g, p, gr);
      g.restore();
    },
  };
}

/** GR2's embossed steel plate (the tag under every GR6 gear icon), in the unit box. */
export function drawSteelTag(g: CanvasRenderingContext2D, px: number): void {
  const W1 = (w: number) => Math.max(px, w);
  const pl = rq(0.02, 0.02, 0.96, 0.96, 0.18);
  const gr = g.createLinearGradient(0, 0, 1, 1);
  gr.addColorStop(0, "#737a83");
  gr.addColorStop(1, "#3a3f46");
  fillP(g, pl, gr);
  g.save();
  g.beginPath();
  pl(g);
  g.clip();
  const r = mulberry(5);
  for (let i = 0; i < 40; i++) fillP(g, rq(r(), r(), 0.2 + r() * 0.4, W1(0.006)), `rgba(255,255,255,${0.04 + r() * 0.05})`);
  g.restore();
  strokeP(g, rq(0.05, 0.05, 0.9, 0.9, 0.15), "rgba(255,255,255,0.22)", W1(0.02));
  strokeP(g, pl, "rgba(0,0,0,0.8)", W1(0.025));
}

export interface BakeOptions {
  /** GR6: on the steel tag (the object scaled to 80 % round the centre). CI4 consumables: false. */
  readonly tag: boolean;
  /** The CSS size the icon is designed for (minimum line widths = one CSS px at that size). */
  readonly designPx: number;
}

/**
 * Paints icon `id` into the `s` × `s` square at (x, y) of `g` (device pixels), with looks.html's drop
 * shadow. Allocates one scratch canvas per call: bake time only (atlas build / repaint, DOM icon), never per frame.
 */
export function bakeItemIcon(g: CanvasRenderingContext2D, id: string, x: number, y: number, s: number, o: BakeOptions): void {
  const draw = ITEM_ICONS[id];
  if (!draw) return;
  const S = Math.max(1, Math.round(s));
  const layer = document.createElement("canvas");
  layer.width = S;
  layer.height = S;
  const l = layer.getContext("2d");
  if (!l) return;
  l.setTransform(S, 0, 0, S, 0, 0);
  l.lineJoin = "round";
  l.lineCap = "round";
  const px = 1 / o.designPx;
  if (o.tag) {
    drawSteelTag(l, px);
    l.translate(0.5, 0.5);
    l.scale(0.8, 0.8);
    l.translate(-0.5, -0.5);
  }
  draw(realPainter(l, px));
  g.save();
  g.beginPath();
  g.rect(x, y, S, S); // the shadow stays inside the icon's own square (looks.html bakes into an S × S canvas)
  g.clip();
  g.shadowColor = "rgba(0,0,0,0.7)";
  g.shadowOffsetX = g.shadowOffsetY = Math.max(1, S * 0.02);
  g.shadowBlur = Math.max(1, S * 0.03);
  g.drawImage(layer, x, y);
  g.restore();
  layer.width = 0; // free the scratch pixels at once
  layer.height = 0;
}
