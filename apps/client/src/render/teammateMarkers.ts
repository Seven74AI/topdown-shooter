import { MAX_PLAYERS } from "@topdown/shared";
import { edgeArrow } from "./edgeArrow";
import { TEAMMATE_DOWNED, TEAMMATE_OUT, type HudModel } from "../scenes/hudModel";
import { PULSE_SCALE_AMP } from "./pulse";
import type { ScreenRect } from "./eventArrow";

/** Story 2.9: the teammate edge arrow's size (CSS px; HudScene's rush `ARROW_PX` 14 × 1.3) and edge margin (rush 28 + 12). */
export const MATE_ARROW_CSS_PX = 14 * 1.3;
export const MATE_ARROW_MARGIN_CSS_PX = 28 + 12;
/** Its white outline (CSS px) and the downed arrow's size (× 1.5, then the revive pulse up to × 1.25). */
export const MATE_ARROW_OUTLINE_CSS_PX = 2;
export const MATE_DOWNED_SCALE = 1.5;
/** The downed "+" icon: arm length and thickness (CSS px), and its distance inside the arrow tip (review N6: shared with HudScene). */
export const MATE_CROSS_CSS_PX = 6;
export const MATE_CROSS_THICK_CSS_PX = 2.5;
export const MATE_CROSS_INSET_CSS_PX = 20;
/** An off-screen downed teammate's red "Bo · 14 s" label: centred this far inward from the arrow (CSS px, × MATE_DOWNED_SCALE), padded 4 px. */
export const MATE_LABEL_INSET_CSS_PX = 62;
export const MATE_LABEL_PAD_CSS_PX = 4;
/** The name / label font size (CSS px). */
export const MATE_NAME_TEXT_CSS_PX = 14;

/** One teammate's HUD marker (Story 2.9). Screen coordinates are canvas pixels. */
export interface TeammateMarker {
  /** True when the teammate is off screen: draw the edge arrow at (x, y) rotated by `angle`. */
  visible: boolean;
  x: number;
  y: number;
  angle: number;
  slot: number;
  downed: boolean;
  /** Seconds left on the downed countdown (0 when not downed). */
  secs: number;
  /** The teammate's own screen position (for the name tag when on screen). */
  sx: number;
  sy: number;
}

export const createTeammateMarkers = (): TeammateMarker[] =>
  Array.from({ length: MAX_PLAYERS }, () => ({ visible: false, x: 0, y: 0, angle: 0, slot: 0, downed: false, secs: 0, sx: 0, sy: 0 }));

type MarkerModel = Pick<HudModel, "teammates" | "teammateSlot" | "teammateFlags" | "teammateSecs" | "teammateCount" | "camX" | "camY" | "camZoom">;

/**
 * Fills `out` (preallocated, ≥ MAX_PLAYERS entries) with one marker per teammate that is not out,
 * in slot order, and returns how many. World → screen is `(w − cam) × camZoom`, like the rush
 * arrows; an arrow only when `edgeArrow` says the teammate is off screen (exactly on the edge
 * counts as on screen). No allocation.
 */
export function teammateMarkers(model: MarkerModel, screenW: number, screenH: number, margin: number, out: TeammateMarker[]): number {
  const n = Math.min(model.teammateCount, MAX_PLAYERS);
  let used = 0;
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    for (let i = 0; i < n; i++) {
      if (model.teammateSlot[i] !== slot) continue;
      const flags = model.teammateFlags[i] as number;
      if (flags & TEAMMATE_OUT) break;
      const m = out[used++] as TeammateMarker;
      m.slot = slot;
      m.downed = (flags & TEAMMATE_DOWNED) !== 0;
      m.secs = m.downed ? (model.teammateSecs[i] as number) : 0;
      m.sx = ((model.teammates[i * 2] as number) - model.camX) * model.camZoom;
      m.sy = ((model.teammates[i * 2 + 1] as number) - model.camY) * model.camZoom;
      m.visible = edgeArrow(m.sx, m.sy, screenW, screenH, margin, m);
      break;
    }
  }
  return used;
}

/**
 * Story 10.2 B4 (D6) + review L3: the rect (canvas px) a teammate's edge arrow covers, into `out`. It is the bounds of
 * HudScene's triangle (tip `a` ahead, back corners 0.6 a behind and 0.7 a aside) turned to the arrow's bearing, at its
 * largest (downed: × 1.5 × the revive pulse's peak), grown on every side by the outline's mitred tip (half the stroke /
 * sin 23.6° ≈ 1.25 × the stroke). For a downed teammate it also covers the "+" drawn `MATE_CROSS_INSET_CSS_PX` (× the
 * same scale) inside the tip. `k` px per CSS px. No allocation.
 */
export function teammateArrowRect(m: Readonly<TeammateMarker>, k: number, out: ScreenRect): ScreenRect {
  const scale = (m.downed ? MATE_DOWNED_SCALE * (1 + PULSE_SCALE_AMP) : 1) * k;
  const a = MATE_ARROW_CSS_PX * scale;
  const c = Math.cos(m.angle);
  const s = Math.sin(m.angle);
  // the three corners turned by the bearing: (a, 0), (−0.6a, ±0.7a)
  const x0 = a * c;
  const y0 = a * s;
  const x1 = -0.6 * a * c - 0.7 * a * s;
  const y1 = -0.6 * a * s + 0.7 * a * c;
  const x2 = -0.6 * a * c + 0.7 * a * s;
  const y2 = -0.6 * a * s - 0.7 * a * c;
  const pad = 1.25 * MATE_ARROW_OUTLINE_CSS_PX * scale;
  let minX = Math.min(x0, x1, x2) - pad;
  let minY = Math.min(y0, y1, y2) - pad;
  let maxX = Math.max(x0, x1, x2) + pad;
  let maxY = Math.max(y0, y1, y2) + pad;
  if (m.downed) {
    // review L3: the "+" (an axis-aligned square of half the arm, at the inset behind the point)
    const cx = -c * MATE_CROSS_INSET_CSS_PX * scale;
    const cy = -s * MATE_CROSS_INSET_CSS_PX * scale;
    const arm = MATE_CROSS_CSS_PX * scale;
    minX = Math.min(minX, cx - arm);
    minY = Math.min(minY, cy - arm);
    maxX = Math.max(maxX, cx + arm);
    maxY = Math.max(maxY, cy + arm);
  }
  out.x = m.x + minX;
  out.y = m.y + minY;
  out.w = maxX - minX;
  out.h = maxY - minY;
  return out;
}

/**
 * Review L3: the downed off-screen teammate's red "Bo · 14 s" label rect (canvas px) into `out`, placed like
 * HudScene's (centred `MATE_LABEL_INSET_CSS_PX × MATE_DOWNED_SCALE` inward from the arrow, padded, kept on screen).
 * `textW` / `textH` are the label's measured size (canvas px). Returns false (nothing written) when there is no label.
 */
export function teammateLabelRect(m: Readonly<TeammateMarker>, k: number, textW: number, textH: number, screenW: number, screenH: number, out: ScreenRect): boolean {
  if (!m.visible || !m.downed) return false;
  const inset = MATE_LABEL_INSET_CSS_PX * k * MATE_DOWNED_SCALE;
  const hw = textW / 2 + MATE_LABEL_PAD_CSS_PX * k;
  const hh = textH / 2 + MATE_LABEL_PAD_CSS_PX * k;
  const lx = Math.min(screenW - hw, Math.max(hw, m.x - Math.cos(m.angle) * inset));
  const ly = Math.min(screenH - hh, Math.max(hh, m.y - Math.sin(m.angle) * inset));
  out.x = lx - hw;
  out.y = ly - hh;
  out.w = 2 * hw;
  out.h = 2 * hh;
  return true;
}

/**
 * Review L3: a generous width (canvas px) for a label not measured yet this frame ("<name> · NN s" at 14 px:
 * ≤ 0.62 em per character), so the keep-off is never smaller than the text.
 */
export function teammateLabelWidthGuess(nameLength: number, k: number): number {
  return (Math.max(8, nameLength) + 8) * 0.62 * MATE_NAME_TEXT_CSS_PX * k;
}
