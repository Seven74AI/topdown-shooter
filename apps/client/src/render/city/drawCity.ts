import { shopfrontsOf, type CoverObject, type DistrictMap, type FireRecord, type MapBox } from "@topdown/shared";
import type { AtlasCanvas } from "./spriteAtlas";
import { CAR_FRAMES, PROP_BARRIER, PROP_BLOCK, PROP_DUMPSTER, PROP_PUMP, PROP_SANDBAGS, VEHICLE_BUS } from "./spriteAtlas";
import { HEIGHT_BY_KIND, MAP_PX_PER_M, carStyle, nameHash, type Dressing, type Front } from "./dressing";
import {
  GROUND,
  LAMP,
  LAMP_FLICKER_A,
  LAMP_GLOW,
  LAMP_GLOW_A,
  LAMP_GLOW_R_PX,
  LAMP_HALO_A,
  LAMP_HALO_R_PX,
  LAMP_R_PX,
  LAMP_TAIL,
  LAMP_TAIL_A,
  LIGHT_DIR,
  ROOFS,
  ROOF_DEFAULT,
  SPILL_GLOW_K,
  TOP_LIGHT,
  nightAt,
  shadowLenPx,
} from "./palette";
import { bevel, circle, ell, outline, rrect, shade } from "./spriteArt";
import { blockNames, drawnWalls, hazardsAt, stageGroupAt } from "./stageFilter";

/**
 * Story 4.9: the static city (look B "Dead City"), ported from `downtown-look-study.html` to Canvas
 * 2D. Everything here runs only when the static layers are (re)drawn (load, stage change), never per
 * frame. Coordinates are map px (32 per metre, like the study and the Tiled file); the caller's
 * transform scales them to the bake resolution.
 */

type G = CanvasRenderingContext2D;

/** Everything one bake of the static layers depends on. */
export interface CityScene {
  readonly map: DistrictMap;
  readonly dressing: Dressing;
  readonly stage: number;
  /** The active cover (`world.obstacles.cover`: stage-filtered, mutated by Story 4.5). */
  readonly cover: readonly CoverObject[];
  /** The walls (`world.obstacles.walls`: map collision boxes not removed + `block` mutations, 4.5). */
  readonly walls: readonly MapBox[];
  /** The burning cars (`world.decay.fires`, 4.5: which car burns is picked per run). */
  readonly fires: readonly FireRecord[];
  readonly atlas: AtlasCanvas;
}

interface Box {
  readonly name: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const P = MAP_PX_PER_M;
const toBox = (b: MapBox, kind: string): Box => ({ name: b.name, kind, x: b.minX * P, y: b.minY * P, w: (b.maxX - b.minX) * P, h: (b.maxY - b.minY) * P });

/** Deterministic random stream (mulberry32): the same city on every bake and every phone. */
export function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Review L: one random stream per thing (keyed by its name or a fixed label), so adding or moving
 * one object (stage debris, a mutated car) never changes how another looks (rooftop units stay put).
 */
export function rng(key: string): () => number {
  return mulberry(nameHash(key));
}

/** A rectangle in map px (a bake tile, grown by `CULL_MARGIN_PX`). */
export interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}
/** Shadows (≤ 60 px), soft blur and the skid marks reach this far outside an object. */
export const CULL_MARGIN_PX = 96;
const meets = (b: Bounds, x: number, y: number, w: number, h: number): boolean => x < b.x1 && x + w > b.x0 && y < b.y1 && y + h > b.y0;
const boxIn = (b: Bounds, o: Box): boolean => meets(b, o.x - CULL_MARGIN_PX, o.y - CULL_MARGIN_PX, o.w + 2 * CULL_MARGIN_PX, o.h + 2 * CULL_MARGIN_PX);
const pointIn = (b: Bounds, x: number, y: number, r: number): boolean => meets(b, x - r, y - r, 2 * r, 2 * r);

// ---------------------------------------------------------------------------
// Shadows (soft: the shape is drawn far off-canvas and its blurred shadow offset back)
// ---------------------------------------------------------------------------
const OFF = 20000;
function softShadow(g: G, s: number, blur: number, color: string, drawFn: () => void): void {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur * s;
  g.shadowOffsetX = OFF * s;
  g.shadowOffsetY = 0;
  g.translate(-OFF, 0);
  g.fillStyle = "#000";
  drawFn();
  g.restore();
}
function boxShadowPath(g: G, x: number, y: number, w: number, h: number, len: number): void {
  const dx = LIGHT_DIR.x * len;
  const dy = LIGHT_DIR.y * len;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w + dx, y + dy);
  g.lineTo(x + w + dx, y + h + dy);
  g.lineTo(x + dx, y + h + dy);
  g.lineTo(x, y + h);
  g.closePath();
}
/** `contact`: a tight dark band at the footprint (tall things); low cover (barrier, sandbags) skips it, so its shadow stays short and soft. */
function castBoxShadow(g: G, s: number, b: Box, len: number, alpha: number, contact = true): void {
  softShadow(g, s, Math.max(1.5, len * 0.22), `rgba(0,0,0,${alpha})`, () => {
    boxShadowPath(g, b.x, b.y, b.w, b.h, len);
    g.fill();
  });
  if (contact) softShadow(g, s, 2.5, "rgba(0,0,0,0.6)", () => g.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2));
}
function carShadow(g: G, s: number, b: Box, len: number): void {
  softShadow(g, s, len * 0.3, "rgba(0,0,0,0.62)", () => {
    g.beginPath();
    for (let k = 0; k <= 6; k++) {
      const t = (k / 6) * len;
      rrect(g, b.x + 2 + LIGHT_DIR.x * t, b.y + 2 + LIGHT_DIR.y * t, b.w - 4, b.h - 4, 4);
      g.fill();
    }
  });
  softShadow(g, s, 2.5, "rgba(0,0,0,0.6)", () => {
    rrect(g, b.x, b.y, b.w, b.h, 4);
    g.fill();
  });
}

function heightOf(d: Dressing, b: Box): number {
  return d.heightByName[b.name] ?? HEIGHT_BY_KIND[b.kind] ?? HEIGHT_BY_KIND.solid ?? 2;
}

// ---------------------------------------------------------------------------
// Noise patterns (grain without tens of thousands of fillRects)
// ---------------------------------------------------------------------------
function noiseTile(seed: number, size: number, count: number, light: string, dark: string, lightShare: number, fleck: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d") as G;
  const R = mulberry(seed);
  for (let i = 0; i < count; i++) {
    g.fillStyle = R() < lightShare ? light : dark;
    g.fillRect(R() * size, R() * size, fleck, fleck);
  }
  return c;
}
function wetTile(seed: number, size: number, count: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d") as G;
  const R = mulberry(seed);
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgba(150,175,205,${0.03 + R() * 0.05})`;
    g.fillRect(R() * size, R() * size, 1 + R() * 2.5, 1);
  }
  return c;
}

interface Patterns {
  readonly grain: CanvasPattern;
  readonly fine: CanvasPattern;
  readonly wet: CanvasPattern;
}
let patternTiles: { grain: HTMLCanvasElement; fine: HTMLCanvasElement; wet: HTMLCanvasElement } | null = null;
function patterns(g: G): Patterns {
  patternTiles ??= {
    grain: noiseTile(7, 128, 300, "rgba(255,255,255,0.03)", "rgba(0,0,0,0.16)", 0.5, 1.3),
    fine: noiseTile(9, 128, 700, "rgba(255,255,255,0.03)", "rgba(0,0,0,0.12)", 0.5, 1.2),
    wet: wetTile(11, 256, 250),
  };
  return {
    grain: g.createPattern(patternTiles.grain, "repeat") as CanvasPattern,
    fine: g.createPattern(patternTiles.fine, "repeat") as CanvasPattern,
    wet: g.createPattern(patternTiles.wet, "repeat") as CanvasPattern,
  };
}

function subtract(iv: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [p, q] of iv) {
    if (b <= p || a >= q) {
      out.push([p, q]);
      continue;
    }
    if (a > p) out.push([p, a]);
    if (b < q) out.push([b, q]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classification of the static boxes
// ---------------------------------------------------------------------------
interface Classified {
  readonly buildings: Box[];
  readonly pumps: Box[];
  readonly walls: Box[];
  readonly cover: Box[];
  /** Ground props of stage 1 (sidewalks, lot, crosswalks, lanes, canopy): the base layer. */
  readonly ground: Box[];
  /** The visible stage group (swap model: `stageN_*` for N ≥ 2). */
  readonly stageProps: Box[];
  /** `block` mutations in force (dumpster, rubble): low props. */
  readonly blocks: Box[];
}
function classify(cs: CityScene): Classified {
  const d = cs.dressing;
  const buildings: Box[] = [];
  const pumps: Box[] = [];
  const walls: Box[] = [];
  const blocks: Box[] = [];
  const blockSet = blockNames(cs.map);
  for (const s of drawnWalls(cs.walls, cs.cover)) {
    if (blockSet.has(s.name)) blocks.push(toBox(s, "block"));
    else if (d.pumps.includes(s.name)) pumps.push(toBox(s, "pump"));
    else if (d.walls.includes(s.name)) walls.push(toBox(s, "wall"));
    else buildings.push(toBox(s, "building"));
  }
  const cover = cs.cover.map((c) => toBox(c, c.kind));
  const ground = (cs.map.stages[0] ?? []).map((p) => toBox(p, p.kind));
  const stageProps = stageGroupAt(cs.map, cs.stage).map((p) => toBox(p, p.kind));
  return { buildings, pumps, walls, cover, ground, stageProps, blocks };
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------
function drawGround(g: G, cs: CityScene, k: Classified, pat: Patterns, bd: Bounds): void {
  const W = cs.map.widthM * P;
  const H = cs.map.heightM * P;
  let R = rng("ground_patches");
  const ofKind = (kind: string): Box[] => k.ground.filter((o) => o.kind === kind && boxIn(bd, o));
  const bx = Math.max(0, bd.x0);
  const by = Math.max(0, bd.y0);
  const bw = Math.min(W, bd.x1) - bx;
  const bh = Math.min(H, bd.y1) - by;
  g.fillStyle = GROUND.asphalt;
  g.fillRect(bx, by, bw, bh);
  g.fillStyle = GROUND.alley;
  for (const [x, y, w, h] of cs.dressing.alleys) g.fillRect(x, y, w, h);
  g.fillStyle = pat.grain;
  g.fillRect(bx, by, bw, bh);
  for (let i = 0; i < 22; i++) {
    g.fillStyle = R() > 0.5 ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.06)";
    g.fillRect(R() * W, R() * H, 30 + R() * 90, 20 + R() * 50);
  }
  for (const f of ofKind("forecourt")) {
    R = rng(f.name);
    g.fillStyle = GROUND.forecourt;
    g.fillRect(f.x, f.y, f.w, f.h);
    g.fillStyle = pat.fine;
    g.fillRect(f.x, f.y, f.w, f.h);
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = f.x; x <= f.x + f.w; x += 96) {
      g.moveTo(x, f.y);
      g.lineTo(x, f.y + f.h);
    }
    for (let y = f.y; y <= f.y + f.h; y += 96) {
      g.moveTo(f.x, y);
      g.lineTo(f.x + f.w, y);
    }
    g.stroke();
    for (let i = 0; i < 14; i++) {
      g.fillStyle = "rgba(0,0,0,0.22)";
      ell(g, f.x + R() * f.w, f.y + R() * f.h, 6 + R() * 16, 4 + R() * 10, R() * 3);
      g.fill();
    }
    g.strokeStyle = "rgba(255,255,255,0.07)";
    g.lineWidth = 2;
    g.strokeRect(f.x + 1, f.y + 1, f.w - 2, f.h - 2);
  }
  for (const l of ofKind("lot")) {
    g.fillStyle = GROUND.lot;
    g.fillRect(l.x, l.y, l.w, l.h);
    g.fillStyle = pat.grain;
    g.fillRect(l.x, l.y, l.w, l.h);
    // bay lines every 3 m across the lot, the bays' back line near its far edge
    g.fillStyle = GROUND.lotLine;
    const top = l.y + 96;
    const bottom = l.y + l.h - 32;
    for (let x = l.x + 16; x <= l.x + l.w; x += 96) g.fillRect(x - 1.5, top, 3, bottom - top);
    g.fillRect(l.x + 16, bottom - 2, l.w - 16, 3);
  }
  const sw = k.ground.filter((o) => o.kind === "sidewalk");
  for (const s of sw) {
    if (!boxIn(bd, s)) continue;
    R = rng(s.name);
    g.fillStyle = GROUND.sidewalk;
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = pat.fine;
    g.fillRect(s.x, s.y, s.w, s.h);
    g.strokeStyle = GROUND.joint;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = s.x; x <= s.x + s.w; x += 32) {
      g.moveTo(x, s.y);
      g.lineTo(x, s.y + s.h);
    }
    for (let y = s.y; y <= s.y + s.h; y += 32) {
      g.moveTo(s.x, y);
      g.lineTo(s.x + s.w, y);
    }
    g.stroke();
    for (let i = 0; i < (s.w * s.h) / 4000; i++) {
      g.fillStyle = "rgba(0,0,0,0.1)";
      g.fillRect(s.x + Math.floor((R() * s.w) / 32) * 32, s.y + Math.floor((R() * s.h) / 32) * 32, 32, 32);
    }
  }
  // curbs: sidewalk edges facing the road or the lot (not those against buildings, other sidewalks or the map edge)
  const blockers = sw.concat(k.buildings);
  for (const s of sw) {
    if (!boxIn(bd, s)) continue;
    const edges = [
      { o: "h", c: s.y, a: s.x, b: s.x + s.w, side: -1 },
      { o: "h", c: s.y + s.h, a: s.x, b: s.x + s.w, side: 1 },
      { o: "v", c: s.x, a: s.y, b: s.y + s.h, side: -1 },
      { o: "v", c: s.x + s.w, a: s.y, b: s.y + s.h, side: 1 },
    ] as const;
    for (const e of edges) {
      if (e.c <= 0 || e.c >= (e.o === "h" ? H : W)) continue;
      let iv: [number, number][] = [[e.a, e.b]];
      for (const q of blockers) {
        if (q === s) continue;
        const [qa, qb, c1, c2] = e.o === "h" ? [q.x, q.x + q.w, q.y, q.y + q.h] : [q.y, q.y + q.h, q.x, q.x + q.w];
        const probe = e.c + e.side;
        if (probe > c1 && probe < c2) iv = subtract(iv, qa, qb);
      }
      for (const [a, b] of iv) {
        if (b - a < 2) continue;
        const out = e.side < 0 ? e.c - 4 : e.c;
        const top = e.side < 0 ? e.c : e.c - 4;
        const hi = e.side < 0 ? e.c : e.c - 1;
        if (e.o === "h") {
          g.fillStyle = "rgba(0,0,0,0.5)";
          g.fillRect(a, out, b - a, 4);
          g.fillStyle = GROUND.curb;
          g.fillRect(a, top, b - a, 4);
          g.fillStyle = "rgba(255,255,255,0.12)";
          g.fillRect(a, hi, b - a, 1);
        } else {
          g.fillStyle = "rgba(0,0,0,0.5)";
          g.fillRect(out, a, 4, b - a);
          g.fillStyle = GROUND.curb;
          g.fillRect(top, a, 4, b - a);
          g.fillStyle = "rgba(255,255,255,0.12)";
          g.fillRect(hi, a, 1, b - a);
        }
      }
    }
  }
  g.fillStyle = GROUND.lane;
  for (const l of ofKind("lane")) {
    if (l.w > l.h) for (let x = l.x; x < l.x + l.w; x += 112) g.fillRect(x, l.y, Math.min(64, l.x + l.w - x), l.h);
    else for (let y = l.y; y < l.y + l.h; y += 112) g.fillRect(l.x, y, l.w, Math.min(64, l.y + l.h - y));
  }
  for (const z of ofKind("crosswalk")) {
    const horiz = z.w > z.h;
    g.fillStyle = GROUND.zebra;
    for (let i = 0; ; i++) {
      const p = 8 + i * 24;
      if (p + 12 > (horiz ? z.w : z.h)) break;
      if (horiz) g.fillRect(z.x + p, z.y + 4, 12, z.h - 8);
      else g.fillRect(z.x + 4, z.y + p, z.w - 8, 12);
    }
    g.fillStyle = "rgba(28,29,32,0.55)";
    R = rng(z.name);
    for (let i = 0; i < (z.w * z.h) / 90; i++) g.fillRect(z.x + R() * z.w, z.y + R() * z.h, 1.5, 1.5);
  }
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 1;
  R = rng("ground_cracks");
  for (let i = 0; i < 70; i++) {
    let x = R() * W;
    let y = R() * H;
    const seen = pointIn(bd, x, y, 110);
    if (seen) {
      g.beginPath();
      g.moveTo(x, y);
    }
    for (let q = 0; q < 6; q++) {
      x += (R() - 0.5) * 34;
      y += (R() - 0.5) * 34;
      if (seen) g.lineTo(x, y);
    }
    if (seen) g.stroke();
  }
  for (const [x, y] of cs.dressing.manholes) {
    g.fillStyle = "#18191b";
    circle(g, x, y, 11);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 1.2;
    g.stroke();
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.beginPath();
    for (let q = -6; q <= 6; q += 4) {
      g.moveTo(x - 8, y + q);
      g.lineTo(x + 8, y + q);
    }
    g.stroke();
  }
  g.fillStyle = "#0e0e10";
  for (const [x, y, v] of cs.dressing.drains) {
    if (v) g.fillRect(x - 3, y - 12, 6, 24);
    else g.fillRect(x - 12, y - 3, 24, 6);
  }
  // the bus slid in from the east: skid marks and broken glass at its front
  const bus = k.cover.find((c) => c.kind === "bus");
  if (bus) {
    g.strokeStyle = "rgba(0,0,0,0.38)";
    g.lineWidth = 5;
    for (const yy of cs.dressing.busSkidY) {
      g.beginPath();
      g.moveTo(bus.x + bus.w + 10, yy + 4);
      g.bezierCurveTo(bus.x + bus.w + 100, yy + 10, bus.x + bus.w + 170, yy + 30, bus.x + bus.w + 250, yy + 46);
      g.stroke();
    }
    const gl = cs.dressing.busGlass;
    R = rng("bus_glass");
    if (gl) {
      for (let i = 0; i < 90; i++) {
        g.fillStyle = R() > 0.5 ? "rgba(170,190,205,0.35)" : "rgba(120,140,160,0.25)";
        g.fillRect(gl[0] + R() * gl[2], gl[1] + R() * gl[3], 1.6, 1.6);
      }
    }
  }
  R = rng("ground_litter");
  for (let i = 0; i < 160; i++) {
    g.fillStyle = R() > 0.6 ? "rgba(0,0,0,0.35)" : "rgba(190,185,170,0.14)";
    g.fillRect(R() * W, R() * H, 3 + R() * 4, 2 + R() * 2);
  }
}

function wetGround(g: G, cs: CityScene, pat: Patterns, bd: Bounds): void {
  const W = cs.map.widthM * P;
  const H = cs.map.heightM * P;
  const R = rng("wet_puddles");
  const bx = Math.max(0, bd.x0);
  const by = Math.max(0, bd.y0);
  g.fillStyle = "rgba(40,60,90,0.10)";
  g.fillRect(bx, by, Math.min(W, bd.x1) - bx, Math.min(H, bd.y1) - by);
  g.fillStyle = pat.wet;
  g.fillRect(bx, by, Math.min(W, bd.x1) - bx, Math.min(H, bd.y1) - by);
  const n = Math.round((W * H) / 34000);
  for (let i = 0; i < n; i++) {
    const x = R() * W;
    const y = R() * H;
    const rx = 18 + R() * 46;
    const ry = 7 + R() * 16;
    const a = R() * 0.6 - 0.3;
    if (!pointIn(bd, x, y, rx)) continue;
    const gr = g.createRadialGradient(x, y, 0, x, y, rx);
    gr.addColorStop(0, "rgba(70,92,120,0.42)");
    gr.addColorStop(0.8, "rgba(60,80,105,0.28)");
    gr.addColorStop(1, "rgba(60,80,105,0)");
    g.fillStyle = gr;
    ell(g, x, y, rx, ry, a);
    g.fill();
    g.fillStyle = "rgba(190,210,230,0.10)";
    ell(g, x - rx * 0.2, y - ry * 0.25, rx * 0.4, ry * 0.18, a);
    g.fill();
  }
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------
function roofBox(g: G, s: number, x: number, y: number, w: number, h: number, col: string, hgt: number): void {
  softShadow(g, s, 2, "rgba(0,0,0,0.55)", () => {
    boxShadowPath(g, x, y, w, h, hgt);
    g.fill();
  });
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
  bevel(g, x, y, w, h, 1.5, "rgba(255,255,255,0.22)", "rgba(0,0,0,0.4)");
  outline(g, x, y, w, h, 1);
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
function placeAll(R: () => number, ix: number, iy: number, iw: number, ih: number, n: number, minW: number, maxW: number, avoid: Rect[]): Rect[] {
  const out = avoid.slice();
  for (let t = 0; t < n * 30 && out.length < n + avoid.length; t++) {
    const w = minW + R() * (maxW - minW);
    const h = w * (0.55 + R() * 0.5);
    const x = ix + R() * (iw - w);
    const y = iy + R() * (ih - h);
    if (out.some((o) => x < o.x + o.w + 8 && x + w + 8 > o.x && y < o.y + o.h + 8 && y + h + 8 > o.y)) continue;
    out.push({ x, y, w, h });
  }
  return out.slice(avoid.length);
}

function building(g: G, s: number, o: Box, d: Dressing): void {
  const R = rng(o.name);
  const { x, y, w, h } = o;
  const col = ROOFS[o.name] ?? ROOF_DEFAULT;
  const pad = Math.min(6, w / 6, h / 6);
  g.fillStyle = shade(col, 0.16);
  g.fillRect(x, y, w, h);
  const ix = x + pad;
  const iy = y + pad;
  const iw = w - 2 * pad;
  const ih = h - 2 * pad;
  g.fillStyle = col;
  g.fillRect(ix, iy, iw, ih);
  const feature = d.roofFeature[o.name];
  if (feature === "metal") {
    for (let xx = ix; xx < ix + iw; xx += 8) {
      g.fillStyle = "rgba(255,255,255,0.06)";
      g.fillRect(xx, iy, 3, ih);
      g.fillStyle = "rgba(0,0,0,0.16)";
      g.fillRect(xx + 4, iy, 2, ih);
    }
    for (let q = 0; q < Math.floor((iw - 20) / 48); q++) {
      g.fillStyle = "rgba(140,160,175,0.22)";
      g.fillRect(ix + 20 + q * 48, iy + 30, 24, Math.max(0, ih - 60));
    }
  } else {
    for (let i = 0; i < (iw * ih) / 40; i++) {
      g.fillStyle = R() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.14)";
      g.fillRect(ix + R() * iw, iy + R() * ih, 1.3, 1.3);
    }
    for (let i = 0; i < 5; i++) {
      g.fillStyle = "rgba(0,0,0,0.08)";
      ell(g, ix + R() * iw, iy + R() * ih, 15 + R() * 30, 10 + R() * 18, R() * 3);
      g.fill();
    }
  }
  // parapet shadow on the roof (inner top and left) and its lit inner edge
  g.fillStyle = "rgba(0,0,0,0.32)";
  g.fillRect(ix, iy, iw, 5);
  g.fillRect(ix, iy, 4, ih);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fillRect(ix, iy + ih - 2, iw, 2);
  g.fillRect(ix + iw - 2, iy, 2, ih);
  const m = 16;
  const units: Rect[] = [];
  if (feature === "tank") {
    const tx = ix + iw * 0.7;
    const ty = iy + ih * 0.25;
    softShadow(g, s, 3, "rgba(0,0,0,0.55)", () => {
      g.beginPath();
      for (let q = 0; q <= 10; q++) g.arc(tx + LIGHT_DIR.x * q * 1.6, ty + LIGHT_DIR.y * q * 1.6, 18, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = "#7a6f66";
    circle(g, tx, ty, 18);
    g.fill();
    g.strokeStyle = "#08080a";
    g.lineWidth = 1.2;
    g.stroke();
    g.strokeStyle = "rgba(0,0,0,0.3)";
    circle(g, tx, ty, 12);
    g.stroke();
    units.push({ x: tx - 26, y: ty - 26, w: 52, h: 52 });
    roofBox(g, s, ix + 18, iy + ih - 70, 46, 40, shade(col, 0.1), 14);
    units.push({ x: ix + 18, y: iy + ih - 70, w: 46, h: 40 });
  }
  if (feature === "skylights") {
    roofBox(g, s, ix + 30, iy + 40, 70, 56, shade(col, 0.12), 18);
    units.push({ x: ix + 30, y: iy + 40, w: 70, h: 56 });
    for (let q = 0; q < 3; q++) {
      g.fillStyle = "rgba(120,150,175,0.28)";
      g.fillRect(ix + 130, iy + 120 + q * 46, 80, 30);
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.lineWidth = 1;
      g.strokeRect(ix + 130, iy + 120 + q * 46, 80, 30);
      units.push({ x: ix + 130, y: iy + 120 + q * 46, w: 80, h: 30 });
    }
  }
  const sign = d.signs[o.name];
  if (sign) {
    g.save();
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.font = `800 ${sign.length > 5 ? 30 : 34}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const sy = h > w * 1.2 ? y + h * 0.3 : y + h * 0.62;
    g.fillText(sign, x + w / 2, sy);
    g.restore();
    units.push({ x: x + w / 2 - 80, y: sy - 22, w: 160, h: 44 });
  }
  const n = Math.round((iw * ih) / 9000);
  if (iw > 2 * m + 40 && ih > 2 * m + 40) {
    for (const u of placeAll(R, ix + m, iy + m, iw - 2 * m, ih - 2 * m, n, 18, 34, units)) {
      roofBox(g, s, u.x, u.y, u.w, u.h, "#7d807f", 5);
      g.strokeStyle = "rgba(0,0,0,0.45)";
      g.lineWidth = 1;
      circle(g, u.x + u.w / 2, u.y + u.h / 2, Math.min(u.w, u.h) * 0.32);
      g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const vx = ix + m + R() * (iw - 2 * m);
      const vy = iy + m + R() * (ih - 2 * m);
      g.fillStyle = "#3a3b3c";
      circle(g, vx, vy, 3.5);
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.5)";
      circle(g, vx + 2, vy + 3, 3.5);
      g.fill();
      g.fillStyle = "#5a5c5c";
      circle(g, vx, vy, 2.5);
      g.fill();
    }
  }
  bevel(g, x, y, w, h, 2, "rgba(255,255,255,0.26)", "rgba(0,0,0,0.5)");
  outline(g, x + 1, y + 1, w - 2, h - 2, 2);
}

function wall(g: G, o: Box): void {
  const { x, y, w, h } = o;
  g.fillStyle = "#5b5b58";
  g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(0,0,0,0.3)";
  g.lineWidth = 1;
  g.beginPath();
  const long = h >= w;
  for (let p = 32; p < (long ? h : w); p += 32) {
    if (long) {
      g.moveTo(x, y + p);
      g.lineTo(x + w, y + p);
    } else {
      g.moveTo(x + p, y);
      g.lineTo(x + p, y + h);
    }
  }
  g.stroke();
  bevel(g, x, y, w, h, 2, "rgba(255,255,255,0.22)", "rgba(0,0,0,0.45)");
  outline(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 1.5);
}

/** Draws atlas frame `name` into box `b`, rotated so the frame's +x points to `front`. */
function drawFrame(g: G, atlas: AtlasCanvas, name: string, b: Box, front: Front): void {
  const f = atlas.frames.get(name);
  if (!f) return;
  const ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[front];
  const across = front === "up" || front === "down";
  const L = across ? b.h : b.w;
  const Wd = across ? b.w : b.h;
  g.save();
  g.translate(b.x + b.w / 2, b.y + b.h / 2);
  g.rotate(ang);
  g.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, -L / 2, -Wd / 2, L, Wd);
  g.restore();
}

function coverPiece(g: G, cs: CityScene, b: Box): void {
  const horiz = b.w >= b.h;
  // the bus frame's front (crushed) is at its −x end: unrotated it faces west, turned it faces north
  if (b.kind === "bus") drawFrame(g, cs.atlas, VEHICLE_BUS, b, horiz ? "right" : "down");
  else if (b.kind === "car") {
    const st = carStyle(cs.dressing, b.name, b.w, b.h);
    drawFrame(g, cs.atlas, CAR_FRAMES[st.variant % CAR_FRAMES.length] as string, b, st.front);
  } else if (b.kind === "barrier") drawFrame(g, cs.atlas, PROP_BARRIER, b, horiz ? "right" : "down");
  else if (b.kind === "sandbags") drawFrame(g, cs.atlas, PROP_SANDBAGS, b, horiz ? "right" : "down");
}

function canopy(g: G, o: Box): void {
  // Overhead roof (walkable under it): a see-through frame so the pumps stay visible.
  const { x, y, w, h } = o;
  g.fillStyle = "rgba(190,200,210,0.05)";
  g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(160,48,40,0.42)";
  g.lineWidth = 3;
  g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.fillStyle = "rgba(220,230,240,0.16)";
  for (let q = 0; q < Math.floor((w - 22) / 60); q++) {
    g.fillRect(x + 22 + q * 60, y + 16, 28, 4);
    g.fillRect(x + 22 + q * 60, y + h - 20, 28, 4);
    g.fillRect(x + 22 + q * 60, y + h / 2 - 2, 28, 4);
  }
}

/** Hazard zones of this stage: a faint hatch only (no outline, no label: never fights the canopy frame, D8). */
function hazards(g: G, cs: CityScene): void {
  for (const hz of hazardsAt(cs.map, cs.stage)) {
    const z = toBox(hz, hz.kind);
    const col = hz.kind === "gas_leak" ? "170,200,60" : "230,120,40";
    g.save();
    g.beginPath();
    g.rect(z.x, z.y, z.w, z.h);
    g.clip();
    g.strokeStyle = `rgba(${col},0.07)`;
    g.lineWidth = 6;
    g.beginPath();
    for (let dd = -z.h; dd < z.w; dd += 22) {
      g.moveTo(z.x + dd, z.y + z.h);
      g.lineTo(z.x + dd + z.h, z.y);
    }
    g.stroke();
    g.restore();
  }
}

/** Debris (walkable): flat rubble, no shadow, no bevel. */
function debris(g: G, o: Box): void {
  const R = rng(o.name);
  const n = Math.max(4, Math.round((o.w * o.h) / 60));
  for (let i = 0; i < n; i++) {
    const cx = o.x + R() * o.w;
    const cy = o.y + R() * o.h;
    const r = 1.5 + R() * 3.5;
    g.fillStyle = R() > 0.5 ? "rgba(92,88,82,0.75)" : "rgba(60,58,55,0.8)";
    g.beginPath();
    for (let q = 0; q < 5; q++) {
      const a = (q / 5) * Math.PI * 2 + R() * 0.6;
      const rr = r * (0.6 + R() * 0.5);
      if (q === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
}

function lampHeads(g: G, d: Dressing, mapW: number): void {
  d.lamps.forEach(([x, y], i) => {
    const toRoad = y > 300 && y < 512 ? [0, 1] : y > 512 && y < 700 ? [0, -1] : x < mapW / 2 ? [1, 0] : [-1, 0];
    g.fillStyle = "rgba(0,0,0,0.4)";
    g.fillRect(x + 1, y + 2, 6, 6);
    g.strokeStyle = "#2a2b2d";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - (toRoad[0] ?? 0) * 10, y - (toRoad[1] ?? 0) * 10);
    g.lineTo(x, y);
    g.stroke();
    g.fillStyle = i === d.flickerLamp ? "#5a5650" : "#efd9a8";
    ell(g, x, y, toRoad[0] ? 5 : 3, toRoad[0] ? 3 : 5);
    g.fill();
  });
}

/** Burnt ground around a burning car (its fire radius), under the car. */
function scorch(g: G, f: FireRecord): void {
  const x = f.x * P;
  const y = f.y * P;
  const r = f.radiusM * P;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, "rgba(8,6,5,0.75)");
  gr.addColorStop(0.7, "rgba(20,14,10,0.35)");
  gr.addColorStop(1, "rgba(20,14,10,0)");
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
}

/** Static flames over the burning car (the view adds a flickering light; Story 4.8 does real fire). */
function flames(g: G, f: FireRecord): void {
  const R = rng(f.name);
  const x = f.x * P;
  const y = f.y * P;
  for (let i = 0; i < 9; i++) {
    const fx = x + (R() - 0.5) * 40;
    const fy = y + (R() - 0.5) * 40;
    const r = 6 + R() * 9;
    const gr = g.createRadialGradient(fx, fy, 0, fx, fy, r);
    gr.addColorStop(0, "rgba(255,236,170,0.95)");
    gr.addColorStop(0.45, "rgba(255,140,40,0.8)");
    gr.addColorStop(1, "rgba(200,40,10,0)");
    g.fillStyle = gr;
    g.fillRect(fx - r, fy - r, 2 * r, 2 * r);
  }
  g.fillStyle = "rgba(30,30,32,0.35)"; // smoke drifting with the light direction
  ell(g, x + 26, y + 34, 26, 16, 0.6);
  g.fill();
}

/** The map's whole area in map px (a bounds that culls nothing). */
export function mapBounds(map: DistrictMap): Bounds {
  return { x0: 0, y0: 0, x1: map.widthM * P, y1: map.heightM * P };
}

/**
 * Review perf: what never changes with the stage (ground, wet layer, the static solids' shadows,
 * roofs, walls, pumps), into `g` (transform: map px → bake; `s` = bake px per map px, for blur
 * radii), culled to `bd`. The view caches it per tile and redraws it only when the set of static
 * solids changes.
 */
export function drawBase(g: G, s: number, cs: CityScene, bd: Bounds): void {
  const k = classify(cs);
  const pat = patterns(g);
  const d = cs.dressing;
  drawGround(g, cs, k, pat, bd);
  wetGround(g, cs, pat, bd);
  for (const o of k.buildings) if (boxIn(bd, o)) castBoxShadow(g, s, o, shadowLenPx(heightOf(d, o)), 0.55);
  for (const o of k.pumps.concat(k.walls)) if (boxIn(bd, o)) castBoxShadow(g, s, o, shadowLenPx(heightOf(d, o)), 0.6);
  for (const o of k.buildings) if (boxIn(bd, o)) building(g, s, o, d);
  for (const o of k.walls) if (boxIn(bd, o)) wall(g, o);
  for (const o of k.pumps) if (boxIn(bd, o)) drawFrame(g, cs.atlas, PROP_PUMP, o, o.w >= o.h ? "right" : "down");
}

/** Key of what `drawBase` shows: the buildings, pumps and walls drawn (their names). */
export function baseKey(cs: CityScene): string {
  const k = classify(cs);
  return [...k.buildings, ...k.pumps, ...k.walls].map((b) => b.name).join("|");
}

/**
 * What changes with the stage, on top of the base: cover shadows, hazards, stage debris, cover,
 * the canopy, lamp heads. Culled to `bd`.
 */
export function drawOverlay(g: G, s: number, cs: CityScene, bd: Bounds): void {
  const k = classify(cs);
  const d = cs.dressing;
  for (const o of k.cover) {
    if (!boxIn(bd, o)) continue;
    if (o.kind === "car") carShadow(g, s, o, shadowLenPx(heightOf(d, o)));
    else if (o.kind === "bus") castBoxShadow(g, s, { ...o, x: o.x + 1, y: o.y + 1, w: o.w - 2, h: o.h - 2 }, shadowLenPx(heightOf(d, o)), 0.6);
    else castBoxShadow(g, s, { ...o, x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 6 }, shadowLenPx(heightOf(d, o)), 0.45, false);
  }
  for (const o of k.blocks) if (boxIn(bd, o)) castBoxShadow(g, s, o, shadowLenPx(heightOf(d, o)), 0.5);
  hazards(g, cs);
  for (const f of cs.fires) scorch(g, f);
  for (const o of k.stageProps) if (boxIn(bd, o)) debris(g, o); // every stage-group prop is debris-like for now
  for (const o of k.blocks) if (boxIn(bd, o)) drawFrame(g, cs.atlas, o.name.includes("dumpster") ? PROP_DUMPSTER : PROP_BLOCK, o, "right");
  for (const o of k.cover) if (boxIn(bd, o)) coverPiece(g, cs, o);
  for (const f of cs.fires) flames(g, f);
  for (const o of k.ground) if (o.kind === "canopy" && boxIn(bd, o)) canopy(g, o);
  lampHeads(g, d, cs.map.widthM * P);
}

/** Base + overlay in one go (tests, one-off bakes). */
export function drawStatic(g: G, s: number, cs: CityScene): void {
  const bd = mapBounds(cs.map);
  drawBase(g, s, cs, bd);
  drawOverlay(g, s, cs, bd);
}

/** Story 4.7 review: the view's pool of barrier lamps — two on every police barrier (Downtown stage 2: 3 barriers; room for 4). */
export const BARRIER_LAMPS = 8;

/** Bus hazard blinkers and barrier lamps (the view animates them): positions in map px. */
export function blinkerSpots(cs: CityScene): { bus: [number, number][]; barrier: [number, number][] } {
  const bus: [number, number][] = [];
  const barrier: [number, number][] = [];
  for (const c of cs.cover) {
    const b = toBox(c, c.kind);
    if (c.kind === "bus") bus.push([b.x + 4, b.y + 12], [b.x + 4, b.y + b.h - 12]);
    if (c.kind === "barrier") {
      // At both ends along the barrier's length (police_line_gas runs north–south).
      if (b.w >= b.h) barrier.push([b.x + 5, b.y + b.h / 2], [b.x + b.w - 5, b.y + b.h / 2]);
      else barrier.push([b.x + b.w / 2, b.y + 5], [b.x + b.w / 2, b.y + b.h - 5]);
    }
  }
  return { bus, barrier };
}

// ---------------------------------------------------------------------------
// Light (low resolution; the view stretches them over the map)
// ---------------------------------------------------------------------------
function radial(g: G, x: number, y: number, r: number, col: string, a: number, mid = 0.45): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${col},${a})`);
  gr.addColorStop(0.5, `rgba(${col},${a * mid})`);
  gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}
function oval(g: G, x: number, y: number, rx: number, ry: number, col: string, a: number): void {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${col},${a})`);
  gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr;
  g.fillRect(-rx, -rx, rx * 2, rx * 2);
  g.restore();
}

type Spill = readonly [number, number, number, number, number, number, string, number];
const SHOP_LIGHT_DEFAULT: readonly [string, number] = ["255,190,120", 0.5];
const spillCache = new WeakMap<DistrictMap, WeakMap<Dressing, readonly Spill[]>>();

/**
 * Story 4.6 (FR59): the window light on the street — every lit shop front of the map
 * (`shopfrontsOf`: the strip and the face touching its shop) as a facade segment on that face,
 * shining outward across the strip, coloured by `dressing.shopLight`; then the dressing's other
 * window light (side facades). So the glow is exactly where the map says a good build spot is.
 * Cached per (map, dressing): bakes call it, never per frame.
 */
export function windowSpill(map: DistrictMap, d: Dressing): readonly Spill[] {
  let byD = spillCache.get(map);
  if (!byD) spillCache.set(map, (byD = new WeakMap()));
  const hit = byD.get(d);
  if (hit) return hit;
  const out: Spill[] = [];
  for (const f of shopfrontsOf(map)) {
    const [col, a] = d.shopLight[f.name] ?? SHOP_LIGHT_DEFAULT;
    const x0 = f.minX * P;
    const x1 = f.maxX * P;
    const y0 = f.minY * P;
    const y1 = f.maxY * P;
    if (f.face === "n") out.push([x0, y0, x1, y0, 0, 1, col, a]);
    else if (f.face === "s") out.push([x0, y1, x1, y1, 0, -1, col, a]);
    else if (f.face === "w") out.push([x0, y0, x0, y1, 1, 0, col, a]);
    else out.push([x1, y0, x1, y1, -1, 0, col, a]);
  }
  for (const s of d.spill) out.push(s);
  byD.set(d, out);
  return out;
}

/** The lightmap (drawn with MULTIPLY): ambient, lit tops, lamp pools, window spill, canopy, headlights; roofs at a fixed level (D6). */
export function drawLightmap(g: G, cs: CityScene): void {
  const d = cs.dressing;
  const k = classify(cs);
  const W = cs.map.widthM * P;
  const H = cs.map.heightM * P;
  g.globalCompositeOperation = "source-over";
  const night = nightAt(cs.stage);
  g.fillStyle = `rgb(${night.ambient})`;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = `rgba(${TOP_LIGHT},${night.topLightA})`;
  for (const o of k.pumps.concat(k.walls, k.cover)) g.fillRect(o.x, o.y, o.w, o.h);
  d.lamps.forEach(([x, y], i) => radial(g, x, y, LAMP_R_PX, LAMP, i === d.flickerLamp ? LAMP_FLICKER_A : night.lampA));
  for (const [x1, y1, x2, y2, nx, ny, col, a0] of windowSpill(cs.map, d)) {
    const a = Math.min(1, a0 * night.spillK);
    const dist = 70;
    const gr = g.createLinearGradient(x1, y1, x1 + nx * dist, y1 + ny * dist);
    gr.addColorStop(0, `rgba(${col},${a})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(Math.min(x1, x1 + nx * dist), Math.min(y1, y1 + ny * dist), Math.abs(x2 - x1) + Math.abs(nx * dist), Math.abs(y2 - y1) + Math.abs(ny * dist));
  }
  const cp = k.ground.find((o) => o.name === d.canopy);
  if (cp) radial(g, cp.x + cp.w / 2, cp.y + cp.h / 2, 190, "200,225,255", 0.5);
  const sc = k.cover.find((o) => o.name === d.runningCar);
  if (sc) {
    const st = carStyle(d, sc.name, sc.w, sc.h);
    if (st.front === "right") {
      const hx = sc.x + sc.w;
      const hy = sc.y + sc.h / 2;
      const gr = g.createRadialGradient(hx, hy, 0, hx, hy, 220);
      gr.addColorStop(0, "rgba(255,240,200,0.55)");
      gr.addColorStop(1, "rgba(255,240,200,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(hx, hy - 20);
      g.lineTo(hx + 220, hy - 80);
      g.lineTo(hx + 220, hy + 80);
      g.lineTo(hx, hy + 20);
      g.closePath();
      g.fill();
    }
  }
  for (const f of cs.fires) radial(g, f.x * P, f.y * P, f.radiusM * P * 2.5, "255,120,40", 0.45);
  // roofs: one fixed light level, whatever lamps are near (streetlights hang below the roofs)
  g.globalCompositeOperation = "source-over";
  g.fillStyle = `rgb(${night.roofLight})`;
  for (const o of k.buildings) g.fillRect(o.x, o.y, o.w, o.h);
}

/** The glow layer (drawn with ADD over a black field): lamp heads, their tails, spill, neon, canopy, headlights. */
export function drawGlow(g: G, cs: CityScene): void {
  const d = cs.dressing;
  const k = classify(cs);
  const W = cs.map.widthM * P;
  const H = cs.map.heightM * P;
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  const night = nightAt(cs.stage);
  if (night.skyA > 0) {
    g.fillStyle = `rgba(${night.sky},${night.skyA})`;
    g.fillRect(0, 0, W, H);
  }
  d.lamps.forEach(([x, y], i) => {
    if (i === d.flickerLamp) return;
    oval(g, x, y, LAMP_GLOW_R_PX, LAMP_GLOW_R_PX, LAMP_GLOW, LAMP_GLOW_A);
    oval(g, x, y + (y < H / 2 ? 40 : -40), 18, 60, LAMP_TAIL, LAMP_TAIL_A);
    oval(g, x, y, LAMP_HALO_R_PX, LAMP_HALO_R_PX, LAMP_TAIL, LAMP_HALO_A);
  });
  for (const [x1, y1, x2, y2, nx, ny, col, a0] of windowSpill(cs.map, d)) {
    const a = Math.min(1, a0 * night.spillK);
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 40));
    for (let q = 0; q <= n; q++) oval(g, x1 + ((x2 - x1) * q) / n + nx * 8, y1 + ((y2 - y1) * q) / n + ny * 8, 24, 24, col, a * SPILL_GLOW_K);
  }
  for (const [x, y, rx, ry, col, a] of d.neon) oval(g, x, y, rx, ry, col, a);
  for (const f of cs.fires) oval(g, f.x * P, f.y * P, f.radiusM * P * 1.6, f.radiusM * P * 1.6, "255,130,50", 0.12);
  const cp = k.ground.find((o) => o.name === d.canopy);
  if (cp) oval(g, cp.x + cp.w / 2, cp.y + cp.h / 2, 110, 120, "190,215,255", 0.12);
  const sc = k.cover.find((o) => o.name === d.runningCar);
  if (sc) {
    const st = carStyle(d, sc.name, sc.w, sc.h);
    if (st.front === "right") {
      oval(g, sc.x + sc.w + 4, sc.y + 12, 10, 10, "255,245,210", 0.7);
      oval(g, sc.x + sc.w + 4, sc.y + sc.h - 12, 10, 10, "255,245,210", 0.7);
    }
  }
}
