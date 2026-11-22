/**
 * Story 4.9: atlas frame naming and layout (pure; no Phaser, no DOM). The placeholder atlases are
 * drawn at runtime, but they already follow the final atlas rules (architecture › Game Assets):
 * frames named `category_name_variant` in snake case, every atlas ≤ 2048 × 2048. Epic 9 swaps in
 * real files under the same texture keys and frame names.
 */

/** The largest atlas side the architecture allows (phones: §Performance). */
export const MAX_ATLAS_PX = 2048;
/** Empty pixels around every frame (no bleeding when a frame is scaled with linear filtering). */
export const ATLAS_PADDING_PX = 2;

/** `category_name_variant`: lowercase snake case, three or more parts (`vehicle_car_a`, `fx_blood_splat_02`). */
const FRAME_NAME = /^[a-z]+(?:_[a-z0-9]+){2,}$/;

export function isFrameName(name: string): boolean {
  return FRAME_NAME.test(name);
}

/** Builds a frame name; throws on a part that would break the convention (a programming error). */
export function frameName(category: string, name: string, variant: string): string {
  const n = `${category}_${name}_${variant}`;
  if (!isFrameName(n) || category.includes("_")) throw new Error(`bad atlas frame name: ${n}`);
  return n;
}

/** Variant letter for index i (0 → "a"). */
export function variantLetter(i: number): string {
  return String.fromCharCode(97 + (i % 26));
}

export interface FrameSpec {
  readonly name: string;
  /** Frame size in px. */
  readonly w: number;
  readonly h: number;
}

export interface PlacedFrame extends FrameSpec {
  readonly x: number;
  readonly y: number;
}

export interface AtlasLayout {
  readonly width: number;
  readonly height: number;
  readonly frames: readonly PlacedFrame[];
}

/**
 * Shelf packer: frames sorted by height (tallest first), placed left to right in rows no wider than
 * `maxPx`, with `ATLAS_PADDING_PX` around each. Width and height are rounded up to a multiple of 4.
 * Throws when a frame name is invalid or duplicated, or the result would exceed `maxPx`.
 */
export function packAtlas(specs: readonly FrameSpec[], maxPx = MAX_ATLAS_PX): AtlasLayout {
  const seen = new Set<string>();
  for (const s of specs) {
    if (!isFrameName(s.name)) throw new Error(`bad atlas frame name: ${s.name}`);
    if (seen.has(s.name)) throw new Error(`duplicate atlas frame: ${s.name}`);
    seen.add(s.name);
    if (s.w <= 0 || s.h <= 0) throw new Error(`empty atlas frame: ${s.name}`);
  }
  const order = specs.slice().sort((a, b) => b.h - a.h || b.w - a.w || (a.name < b.name ? -1 : 1));
  const frames: PlacedFrame[] = [];
  const pad = ATLAS_PADDING_PX;
  let x = pad;
  let y = pad;
  let rowH = 0;
  let width = 0;
  for (const s of order) {
    const w = Math.ceil(s.w);
    const h = Math.ceil(s.h);
    if (x + w + pad > maxPx && x > pad) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    if (x + w + pad > maxPx) throw new Error(`atlas frame wider than ${maxPx}: ${s.name}`);
    frames.push({ name: s.name, w, h, x, y });
    x += w + pad;
    rowH = Math.max(rowH, h);
    width = Math.max(width, x);
  }
  const height = y + rowH + pad;
  const out = { width: Math.ceil(width / 4) * 4, height: Math.ceil(height / 4) * 4, frames };
  if (out.width > maxPx || out.height > maxPx) throw new Error(`atlas larger than ${maxPx}: ${out.width}×${out.height}`);
  return out;
}

/** True when no two frames (with padding) overlap and all lie inside the atlas: the packer's contract, for tests. */
export function layoutIsValid(l: AtlasLayout): boolean {
  for (let i = 0; i < l.frames.length; i++) {
    const a = l.frames[i] as PlacedFrame;
    if (a.x < 0 || a.y < 0 || a.x + a.w > l.width || a.y + a.h > l.height) return false;
    for (let j = i + 1; j < l.frames.length; j++) {
      const b = l.frames[j] as PlacedFrame;
      if (a.x < b.x + b.w + ATLAS_PADDING_PX && b.x < a.x + a.w + ATLAS_PADDING_PX && a.y < b.y + b.h + ATLAS_PADDING_PX && b.y < a.y + a.h + ATLAS_PADDING_PX) return false;
    }
  }
  return true;
}

/** Tiles of at most `maxPx` covering a `w × h` px image (the static city bake): x, y, w, h each. */
export function tileRects(w: number, h: number, maxPx = MAX_ATLAS_PX): { x: number; y: number; w: number; h: number }[] {
  const cols = Math.max(1, Math.ceil(w / maxPx));
  const rows = Math.max(1, Math.ceil(h / maxPx));
  const tw = Math.ceil(w / cols);
  const th = Math.ceil(h / rows);
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * tw;
      const y = r * th;
      out.push({ x, y, w: Math.min(tw, w - x), h: Math.min(th, h - y) });
    }
  }
  return out;
}
