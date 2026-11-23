import type * as Phaser from "phaser";
import { frameName, packAtlas, variantLetter, type FrameSpec, type PlacedFrame } from "./atlasLayout";
import { addGeneratedTexture } from "./canvasTexture";

/**
 * Story 5.12: the thrown consumables, top-down, nose along +x (designer picks, round D 2026-11-23,
 * ported from `docs/art/epic-5/round-d/looks.html` › `grenadeArt` / `bottleArt` / `part`):
 *
 * - hand grenade, all three kept: **HG1 pineapple** (base), HG2 smooth M67, HG3 can-shaped;
 * - molotov bottle, all three kept: **MB1 wine bottle** (base), MB2 beer bottle, MB3 liquor flask,
 *   each with its rag stuffed in the neck (the view adds a pooled 4.12 flame there in flight).
 *
 * One canvas atlas `atlas_throwfx` (frames `fx_handgrenade_<a|b|c>`, `fx_molotov_<a|b|c>`,
 * category_name_variant, ≤ 2048²), drawn once through `addGeneratedTexture` (4.13: repainted after a
 * lost graphics context). The variant of a throw is `throwVariant` (shared, from the landing point:
 * every client draws the same; cosmetic only).
 */
export const ATLAS_THROWFX = "atlas_throwfx";
export const HAND_GRENADE_FRAMES: readonly string[] = [0, 1, 2].map((i) => frameName("fx", "handgrenade", variantLetter(i)));
export const MOLOTOV_FRAMES: readonly string[] = [0, 1, 2].map((i) => frameName("fx", "molotov", variantLetter(i)));
/** Texture pixels per metre of the drawings. */
export const THROW_PX_PER_M = 400;
/** Each frame's extent in metres (x from −half to +half; the objects are drawn in looks.html metres). */
export const GRENADE_FRAME_M = { w: 0.2, h: 0.11 } as const;
export const MOLOTOV_FRAME_M = { w: 0.42, h: 0.13 } as const;
/** Where the rag's flame sits on each bottle (m from the frame centre, along +x): looks.html `nx + 0.03`. */
export const MOLOTOV_RAG_X_M: readonly number[] = [0.19, 0.15, 0.12];
const GRENADE_KINDS = ["pine", "m67", "can"] as const;
const BOTTLE_KINDS = ["wine", "beer", "flask"] as const;

type G = CanvasRenderingContext2D;
type Path = (q: G) => void;
/** One display pixel in drawing units (metres) while a frame is drawn. */
let P = 1 / THROW_PX_PER_M;

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
function R(c: G, x: number, y: number, w: number, h: number, r = 0): void {
  if (!r) {
    c.rect(x, y, w, h);
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
function E(c: G, x: number, y: number, rx: number, ry: number): void {
  c.moveTo(x + rx, y);
  c.ellipse(x, y, Math.max(1e-5, rx), Math.max(1e-5, ry), 0, 0, Math.PI * 2);
  c.closePath();
}
function fillP(c: G, fn: Path, style: string): void {
  c.beginPath();
  fn(c);
  c.fillStyle = style;
  c.fill();
}
function strokeP(c: G, fn: Path, style: string, w: number, cap: CanvasLineCap = "round"): void {
  c.beginPath();
  fn(c);
  c.strokeStyle = style;
  c.lineWidth = w;
  c.lineCap = cap;
  c.lineJoin = "round";
  c.stroke();
}
function devToLocal(c: G, dx: number, dy: number): [number, number] {
  const m = c.getTransform();
  const det = m.a * m.d - m.b * m.c;
  return [(m.d * dx - m.c * dy) / det, (-m.b * dx + m.a * dy) / det];
}
function lightDir(c: G): [number, number] {
  const v = devToLocal(c, -1, -1);
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
}
interface PartOpts {
  base: string;
  box: readonly [number, number, number, number];
  lit?: "top" | "radial";
  hi?: number;
  lo?: number;
  rim?: number;
  inner?: number;
  line?: number;
  tex?: Tex;
}
type Tex = (c: G, x0: number, y0: number, x1: number, y1: number) => void;
/** looks.html `part`: fill, texture, light gradient, rim light upper-left, inner shade lower-right, outline. */
function part(c: G, path: Path, o: PartOpts): void {
  const [x0, y0, x1, y1] = o.box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = x1 - x0;
  const h = y1 - y0;
  c.beginPath();
  path(c);
  c.fillStyle = o.base;
  c.fill();
  c.save();
  c.clip();
  if (o.tex) o.tex(c, x0, y0, x1, y1);
  const hi = o.hi ?? 0.22;
  const lo = o.lo ?? 0.4;
  let g: CanvasGradient;
  const L = lightDir(c);
  if (o.lit === "top") {
    const s = Math.hypot(w, h) / 2;
    g = c.createLinearGradient(cx + L[0] * s, cy + L[1] * s, cx - L[0] * s, cy - L[1] * s);
    g.addColorStop(0, `rgba(200,215,240,${hi})`);
    g.addColorStop(0.5, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${lo})`);
  } else if (o.lit === "radial") {
    const m = Math.max(w, h);
    g = c.createRadialGradient(cx + L[0] * w * 0.28, cy + L[1] * h * 0.32, 0, cx, cy, m * 0.62);
    g.addColorStop(0, `rgba(225,235,255,${hi})`);
    g.addColorStop(0.45, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${lo})`);
  } else {
    g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(215,225,242,${hi})`);
    g.addColorStop(0.5, "rgba(0,0,0,0.04)");
    g.addColorStop(1, `rgba(0,0,0,${lo})`);
  }
  c.fillStyle = g;
  c.fillRect(x0 - w, y0 - h, w * 3, h * 3);
  const rim = o.rim ?? 0.42;
  if (rim > 0) {
    const d = devToLocal(c, 1.5, 1.7);
    c.beginPath();
    c.rect(x0 - w, y0 - h, w * 3, h * 3);
    c.save();
    c.translate(d[0], d[1]);
    path(c);
    c.restore();
    c.fillStyle = `rgba(195,210,235,${rim})`;
    c.fill("evenodd");
  }
  const dk = o.inner ?? 0.32;
  if (dk > 0) {
    const d = devToLocal(c, -1.3, -1.5);
    c.beginPath();
    c.rect(x0 - w, y0 - h, w * 3, h * 3);
    c.save();
    c.translate(d[0], d[1]);
    path(c);
    c.restore();
    c.fillStyle = `rgba(0,0,0,${dk})`;
    c.fill("evenodd");
  }
  c.restore();
  if (o.line !== 0) {
    c.beginPath();
    path(c);
    c.lineJoin = "round";
    c.strokeStyle = "rgba(4,4,6,0.95)";
    c.lineWidth = (o.line ?? 1.3) * P;
    c.stroke();
  }
}
/** looks.html `steelTex` (light): a few scratches. */
function steelTex(seed: number): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    for (let i = 0; i < 40; i++) {
      c.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.12)";
      c.fillRect(x0 + r() * w, y0 + r() * h, P * (1 + r() * 3), P);
    }
  };
}
/** looks.html `clothTex`: a stained weave. */
function clothTex(seed: number): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    for (let i = 0; i < 60; i++) {
      c.fillStyle = r() < 0.5 ? "rgba(255,250,235,0.08)" : "rgba(60,40,20,0.16)";
      c.fillRect(x0 + r() * w, y0 + r() * h, P * 1.4, P * 1.4);
    }
  };
}

/** looks.html `grenadeArt` (HG1 pine, HG2 m67, HG3 can), centred on the origin, fuze along +x. */
export function drawHandGrenade(c: G, kind: (typeof GRENADE_KINDS)[number]): void {
  if (kind === "pine") {
    const bp: Path = (q) => E(q, 0, 0, 0.05, 0.04);
    part(c, bp, { base: "#4f5a33", lit: "radial", box: [-0.05, -0.04, 0.05, 0.04], hi: 0.45, lo: 0.55 });
    c.save();
    c.beginPath();
    bp(c);
    c.clip();
    for (const x of [-0.03, -0.01, 0.01, 0.03]) strokeP(c, (q) => (q.moveTo(x, -0.05), q.lineTo(x, 0.05)), "rgba(10,14,4,0.75)", 1.4 * P, "butt");
    for (const y of [-0.014, 0.014]) strokeP(c, (q) => (q.moveTo(-0.05, y), q.lineTo(0.05, y)), "rgba(10,14,4,0.75)", 1.4 * P, "butt");
    c.restore();
    part(c, (q) => R(q, 0.044, -0.014, 0.026, 0.028, 0.005), { base: "#7d7f78", box: [0.044, -0.014, 0.07, 0.014], hi: 0.5, line: 1 });
    part(
      c,
      (q) => {
        q.moveTo(0.06, -0.016);
        q.lineTo(-0.02, -0.042);
        q.lineTo(-0.025, -0.034);
        q.lineTo(0.05, -0.008);
        q.closePath();
      },
      { base: "#8a8c86", box: [-0.03, -0.045, 0.06, -0.005], hi: 0.5, line: 1 },
    );
    strokeP(c, (q) => E(q, 0.082, 0.022, 0.013, 0.013), "#c2c6cc", 1.6 * P);
  } else if (kind === "m67") {
    part(c, (q) => E(q, 0, 0, 0.034, 0.034), { base: "#5d6640", lit: "radial", box: [-0.034, -0.034, 0.034, 0.034], hi: 0.55, lo: 0.55 });
    part(c, (q) => R(q, 0.028, -0.011, 0.022, 0.022, 0.004), { base: "#7d7f78", box: [0.028, -0.011, 0.05, 0.011], hi: 0.5, line: 1 });
    part(
      c,
      (q) => {
        q.moveTo(0.046, -0.012);
        q.quadraticCurveTo(0.02, -0.04, -0.022, -0.03);
        q.lineTo(-0.02, -0.022);
        q.quadraticCurveTo(0.015, -0.03, 0.036, -0.006);
        q.closePath();
      },
      { base: "#8a8c86", box: [-0.025, -0.04, 0.05, -0.005], hi: 0.5, line: 1 },
    );
    strokeP(c, (q) => E(q, 0.062, 0.02, 0.012, 0.012), "#c2c6cc", 1.6 * P);
  } else {
    part(c, (q) => R(q, -0.05, -0.028, 0.09, 0.056, 0.008), { base: "#4b5534", lit: "top", box: [-0.05, -0.028, 0.04, 0.028], tex: steelTex(78), hi: 0.5, lo: 0.55 });
    fillP(c, (q) => R(q, -0.02, -0.028, 0.008, 0.056), "#c9b55a");
    part(c, (q) => R(q, 0.038, -0.012, 0.02, 0.024, 0.004), { base: "#7d7f78", box: [0.038, -0.012, 0.058, 0.012], hi: 0.5, line: 1 });
    part(c, (q) => R(q, -0.03, -0.036, 0.08, 0.01, 0.003), { base: "#8a8c86", box: [-0.03, -0.036, 0.05, -0.026], hi: 0.5, line: 1 });
    strokeP(c, (q) => E(q, 0.07, 0.02, 0.012, 0.012), "#c2c6cc", 1.6 * P);
  }
}

function glassPart(c: G, path: Path, box: readonly [number, number, number, number], base: string): void {
  part(c, path, { base, lit: "top", box, hi: 0.55, lo: 0.5, rim: 0.5, inner: 0.3, line: 1.1 });
}

/** looks.html `bottleArt` (MB1 wine, MB2 beer, MB3 flask) with the rag, neck along +x. Returns the rag's tip x. */
export function drawMolotovBottle(c: G, kind: (typeof BOTTLE_KINDS)[number]): number {
  if (kind === "wine") {
    glassPart(
      c,
      (q) => {
        q.moveTo(-0.15, -0.038);
        q.lineTo(0.05, -0.038);
        q.quadraticCurveTo(0.09, -0.038, 0.1, -0.014);
        q.lineTo(0.16, -0.013);
        q.lineTo(0.16, 0.013);
        q.lineTo(0.1, 0.014);
        q.quadraticCurveTo(0.09, 0.038, 0.05, 0.038);
        q.lineTo(-0.15, 0.038);
        q.quadraticCurveTo(-0.16, 0, -0.15, -0.038);
        q.closePath();
      },
      [-0.16, -0.04, 0.16, 0.04],
      "#1f4a2c",
    );
    fillP(c, (q) => R(q, -0.09, -0.039, 0.1, 0.078), "rgba(222,208,170,0.8)");
    fillP(c, (q) => R(q, -0.07, -0.02, 0.06, 0.012), "rgba(120,30,30,0.6)");
  } else if (kind === "beer") {
    glassPart(
      c,
      (q) => {
        q.moveTo(-0.11, -0.03);
        q.lineTo(0.02, -0.03);
        q.quadraticCurveTo(0.05, -0.03, 0.07, -0.012);
        q.lineTo(0.12, -0.011);
        q.lineTo(0.12, 0.011);
        q.lineTo(0.07, 0.012);
        q.quadraticCurveTo(0.05, 0.03, 0.02, 0.03);
        q.lineTo(-0.11, 0.03);
        q.quadraticCurveTo(-0.12, 0, -0.11, -0.03);
        q.closePath();
      },
      [-0.12, -0.03, 0.12, 0.03],
      "#5a3410",
    );
    fillP(c, (q) => R(q, -0.07, -0.031, 0.06, 0.062), "rgba(205,190,120,0.75)");
  } else {
    glassPart(c, (q) => R(q, -0.08, -0.05, 0.13, 0.1, 0.025), [-0.08, -0.05, 0.05, 0.05], "#8fa3ab");
    fillP(c, (q) => R(q, -0.075, -0.03, 0.11, 0.07, 0.02), "rgba(190,120,40,0.65)");
    glassPart(c, (q) => R(q, 0.045, -0.014, 0.045, 0.028, 0.006), [0.045, -0.014, 0.09, 0.014], "#9aa0a8");
  }
  const nx = kind === "wine" ? 0.16 : kind === "beer" ? 0.12 : 0.09;
  part(
    c,
    (q) => {
      q.moveTo(nx - 0.01, -0.012);
      q.lineTo(nx + 0.035, -0.02);
      q.quadraticCurveTo(nx + 0.06, 0.0, nx + 0.04, 0.03);
      q.quadraticCurveTo(nx + 0.0, 0.05, nx - 0.06, 0.045);
      q.quadraticCurveTo(nx - 0.02, 0.02, nx - 0.01, 0.012);
      q.closePath();
    },
    { base: "#cbbd98", box: [nx - 0.06, -0.02, nx + 0.06, 0.05], tex: clothTex(77), hi: 0.3, lo: 0.45, line: 1 },
  );
  return nx + 0.03;
}

/** The atlas's frames (pure: a test checks names and the ≤ 2048 rule). */
export function throwFxSpecs(): FrameSpec[] {
  const gw = Math.ceil(GRENADE_FRAME_M.w * THROW_PX_PER_M);
  const gh = Math.ceil(GRENADE_FRAME_M.h * THROW_PX_PER_M);
  const mw = Math.ceil(MOLOTOV_FRAME_M.w * THROW_PX_PER_M);
  const mh = Math.ceil(MOLOTOV_FRAME_M.h * THROW_PX_PER_M);
  return [...HAND_GRENADE_FRAMES.map((name) => ({ name, w: gw, h: gh })), ...MOLOTOV_FRAMES.map((name) => ({ name, w: mw, h: mh }))];
}

function drawFrame(g: G, f: PlacedFrame): void {
  g.save();
  g.beginPath();
  g.rect(f.x, f.y, f.w, f.h);
  g.clip();
  g.translate(f.x + f.w / 2, f.y + f.h / 2);
  g.scale(THROW_PX_PER_M, THROW_PX_PER_M);
  P = 1 / THROW_PX_PER_M;
  const gi = HAND_GRENADE_FRAMES.indexOf(f.name);
  if (gi >= 0) {
    g.translate(-0.015, 0); // the pineapple's ring reaches +0.095 m: centre the drawing in the frame
    drawHandGrenade(g, GRENADE_KINDS[gi] as (typeof GRENADE_KINDS)[number]);
  } else {
    const mi = MOLOTOV_FRAMES.indexOf(f.name);
    if (mi >= 0) drawMolotovBottle(g, BOTTLE_KINDS[mi] as (typeof BOTTLE_KINDS)[number]);
  }
  g.restore();
}

/** Registers the atlas (idempotent). */
export function ensureThrowFxAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_THROWFX) || typeof document === "undefined") return;
  const layout = packAtlas(throwFxSpecs());
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  addGeneratedTexture(
    scene,
    ATLAS_THROWFX,
    canvas,
    (g) => {
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (const f of layout.frames) drawFrame(g, f);
    },
    (tex) => {
      for (const f of layout.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
}
