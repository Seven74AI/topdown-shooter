import { frameName, variantLetter, type FrameSpec } from "./atlasLayout";
import { CB, FRONT_BASE_Y, SIDE_C } from "./barricadeArt";

/**
 * Story 9.14: the standing police set's frames in the downtown atlas (pre-rendered with the street props by
 * `npm run art:street-props`), and how a sawhorse police line is laid out with them. Pure (no Phaser, no DOM): the
 * offline tool, the view and the tests share it.
 *
 * Pictures (as the approved `barricadeArt.ts` police set, page `docs/art/photoreal-3/compare.html`): a front piece is
 * three sawhorses edge to edge, 2 × 1 m, its ground line `FRONT_BASE_Y` below the middle (`units` 1–2: only the first
 * sawhorses, for the end of a line); a side piece shows them end-on, 1 × 2.8 m, footprint centre `SIDE_C` below the
 * middle; the traffic drum is 1.4 × 2 m, its spot `CB` below the middle. Drawn at the standing barricades' 96 px/m.
 */
export const POLICE_PX_PER_M = 96;
export const POLICE_VARIANTS = 2;
/** One sawhorse's share of a front piece (three per 2 m picture). */
export const POLICE_UNIT_M = 2 / 3;
export const POLICE_FRONT_W_M = 2;
export const POLICE_FRONT_H_M = 1;
export const POLICE_SIDE_W_M = 1;
export const POLICE_SIDE_H_M = 2.8;
/** A side piece's footprint along the line. */
export const POLICE_SIDE_LEN_M = 2;
export const POLICE_DRUM_W_M = 1.4;
export const POLICE_DRUM_H_M = 2;
/** The drum's base radius (its dark foot, `drawPoliceCorner`): the drum sits this far inside each line end. */
export const POLICE_DRUM_R_M = 0.23;
/**
 * The drum's lamp above its spot (m, screen up): `drawPoliceCorner` puts the lamp at `sy(0.95, CB) − 0.03 − 0.012` in
 * the picture's frame, the spot at `CB` (B4; the atlas test checks it against the lamp the tool found in the picture).
 */
export const POLICE_DRUM_LAMP_DY_M = -(0.95 * 0.6 + 0.042);

/** Front piece with `units` sawhorses (1–3), variant v. */
export function policeFrontFrame(units: number, variant: number): string {
  return frameName("prop", "policefront", `${units}${variantLetter(variant)}`);
}
export function policeSideFrame(variant: number): string {
  return frameName("prop", "policeside", variantLetter(variant));
}
export const POLICE_DRUM = frameName("prop", "policedrum", "a");

export interface PoliceArt {
  readonly frame: string;
  readonly kind: "front" | "side" | "drum";
  readonly units: number;
  readonly variant: number;
  readonly wM: number;
  readonly hM: number;
}

/** Every police picture in the atlas. */
export function policeArt(): PoliceArt[] {
  const out: PoliceArt[] = [];
  for (let v = 0; v < POLICE_VARIANTS; v++) {
    for (let k = 1; k <= 3; k++) out.push({ frame: policeFrontFrame(k, v), kind: "front", units: k, variant: v, wM: POLICE_FRONT_W_M, hM: POLICE_FRONT_H_M });
    out.push({ frame: policeSideFrame(v), kind: "side", units: 3, variant: v, wM: POLICE_SIDE_W_M, hM: POLICE_SIDE_H_M });
  }
  out.push({ frame: POLICE_DRUM, kind: "drum", units: 1, variant: 0, wM: POLICE_DRUM_W_M, hM: POLICE_DRUM_H_M });
  return out;
}
export function policeSpecs(): FrameSpec[] {
  return policeArt().map((a) => ({ name: a.frame, w: Math.round(a.wM * POLICE_PX_PER_M), h: Math.round(a.hM * POLICE_PX_PER_M) }));
}

/** One placed police picture: its spot (m; the sprite's origin), display size (m), origin, and the y it sorts by. */
export interface PolicePiece {
  readonly frame: string;
  readonly x: number;
  readonly y: number;
  readonly wM: number;
  readonly hM: number;
  readonly originX: number;
  readonly originY: number;
  /**
   * The y the piece sorts by (`standDepth`): its footprint y; a drum's is the largest of the pieces it stands over (review
   * M2: it closes the line's end, over its boards, like the 9.11 corner pieces), and the view lifts it a little more.
   */
  readonly sortY: number;
  readonly drum: boolean;
  /** Its place in its own line (the view's tie-break between pieces of one row: later over earlier). */
  readonly order: number;
}

/** A line's box (m). */
export interface LineBox {
  readonly name: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const variantOf = (name: string, i: number): number => {
  let h = 0x811c9dc5;
  for (let c = 0; c < name.length; c++) h = Math.imul(h ^ name.charCodeAt(c), 0x01000193);
  return ((h >>> 3) + i) % POLICE_VARIANTS;
};

const FRONT_OY = 0.5 + FRONT_BASE_Y / POLICE_FRONT_H_M;
const SIDE_OY = 0.5 + SIDE_C / POLICE_SIDE_H_M;
const DRUM_OY = 0.5 + CB / POLICE_DRUM_H_M;
/** How much shorter a run of sawhorses may get than its fixed spacing before a sawhorse is dropped (float slack). */
const EPS = 1e-6;

/**
 * Lays a sawhorse police line (AC 4): pictures repeated along the line's length, never stretched. A line running
 * east–west gets front pieces: as many sawhorses as needed so the run is at least the line's length, in pieces of
 * three (the last one shorter when the count isn't a multiple of three); the joins between pieces close up evenly so
 * the first sawhorse starts at the west end and the last one ends at the east end (overlap, never a gap, never past
 * the box). A line short enough for one piece gets the sawhorses that fit, centred (review L3: no overhang). A
 * north–south line gets side pieces (2 m each), as many as cover it, spread so they reach both ends (overlapping when
 * the length isn't a multiple of 2 m); one shorter than a side piece gets only its drums (L3). A traffic drum stands
 * inside each end (B4), sorted over the pieces it stands on (M2), and never so near the map's top edge that its lamp
 * would leave the map (M2: the gas line starts at y = 0). `out` is reused.
 */
export function policeLineLayout(b: LineBox, out: PolicePiece[] = []): PolicePiece[] {
  out.length = 0;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  if (w <= 0 || h <= 0) return out;
  if (w >= h) {
    const L = w;
    const y = (b.minY + b.maxY) / 2;
    const fit = Math.max(1, Math.floor(L / POLICE_UNIT_M + EPS));
    const cover = Math.max(1, Math.ceil(L / POLICE_UNIT_M - EPS));
    const units = cover <= 3 ? Math.min(3, fit) : cover; // one piece: only what fits (L3); more: close up the joins
    const sizes: number[] = [];
    for (let left = units; left > 0; left -= 3) sizes.push(Math.min(3, left));
    const span = units * POLICE_UNIT_M;
    const join = sizes.length > 1 ? (L - span) / (sizes.length - 1) : 0;
    let left = sizes.length > 1 ? b.minX : b.minX + (L - span) / 2;
    sizes.forEach((k, i) => {
      // the picture's west edge is its first sawhorse's west edge: its centre lies 1 m east of it
      out.push({ frame: policeFrontFrame(k, variantOf(b.name, i)), x: left + POLICE_FRONT_W_M / 2, y, wM: POLICE_FRONT_W_M, hM: POLICE_FRONT_H_M, originX: 0.5, originY: FRONT_OY, sortY: y, drum: false, order: i });
      left += k * POLICE_UNIT_M + join;
    });
    const n = out.length;
    out.push(drum(b.minX + POLICE_DRUM_R_M, lampOnMap(y), out, n), drum(b.maxX - POLICE_DRUM_R_M, lampOnMap(y), out, n + 1));
  } else {
    const L = h;
    const x = (b.minX + b.maxX) / 2;
    const n = L < POLICE_SIDE_LEN_M - EPS ? 0 : Math.ceil(L / POLICE_SIDE_LEN_M - EPS);
    const step = n > 1 ? (L - POLICE_SIDE_LEN_M) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const y = n > 1 ? b.minY + POLICE_SIDE_LEN_M / 2 + i * step : (b.minY + b.maxY) / 2;
      out.push({ frame: policeSideFrame(variantOf(b.name, i)), x, y, wM: POLICE_SIDE_W_M, hM: POLICE_SIDE_H_M, originX: 0.5, originY: SIDE_OY, sortY: y, drum: false, order: i });
    }
    out.push(drum(x, lampOnMap(b.minY + POLICE_DRUM_R_M), out, n), drum(x, b.maxY - POLICE_DRUM_R_M, out, n + 1));
  }
  return out;
}

/** The drum's lamp stays on the map (y ≥ 0, a little margin): a drum this near the top edge moves down (M2). */
const lampOnMap = (y: number): number => Math.max(y, -POLICE_DRUM_LAMP_DY_M + POLICE_LAMP_MARGIN_M);
const POLICE_LAMP_MARGIN_M = 0.05;

/** A drum at (x, y), sorted over every piece of its line whose footprint it stands on (review M2). */
function drum(x: number, y: number, pieces: readonly PolicePiece[], order: number): PolicePiece {
  let sortY = y;
  for (const p of pieces) {
    if (p.drum) continue;
    const front = p.frame.startsWith("prop_policefront");
    const halfW = front ? POLICE_FRONT_W_M / 2 : POLICE_SIDE_W_M / 2;
    const halfL = front ? 0.25 : POLICE_SIDE_LEN_M / 2;
    if (Math.abs(x - p.x) <= halfW + POLICE_DRUM_R_M && Math.abs(y - p.y) <= halfL + POLICE_DRUM_R_M) sortY = Math.max(sortY, p.sortY);
  }
  return { frame: POLICE_DRUM, x, y, wM: POLICE_DRUM_W_M, hM: POLICE_DRUM_H_M, originX: 0.5, originY: DRUM_OY, sortY, drum: true, order };
}

/** The sawhorses' horizontal extent in a front piece of `units` (share of the picture's width). */
export function policeFrontExtent(units: number): readonly [number, number] {
  return [0, (units * POLICE_UNIT_M) / POLICE_FRONT_W_M];
}

/**
 * The part of a police picture that hides what's behind it (share of its width), for the 9.12 silhouettes: a front
 * piece's sawhorses; a side piece's boards and A-frames (±0.22 m about the middle); the drum's body. Null otherwise.
 */
export function policeOccluderX(frame: string): readonly [number, number] | null {
  const m = /^prop_police(front|side|drum)_(\d?)[a-z]$/.exec(frame);
  if (!m) return null;
  if (m[1] === "front") return policeFrontExtent(Number(m[2]));
  if (m[1] === "side") return [0.5 - 0.22 / POLICE_SIDE_W_M, 0.5 + 0.22 / POLICE_SIDE_W_M];
  return [0.5 - POLICE_DRUM_R_M / POLICE_DRUM_W_M, 0.5 + POLICE_DRUM_R_M / POLICE_DRUM_W_M];
}
