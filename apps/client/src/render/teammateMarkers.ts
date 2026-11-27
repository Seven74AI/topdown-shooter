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
 * Story 10.2 B4 (D6): the rect (canvas px) a teammate's edge arrow covers, into `out`: the bounds of HudScene's triangle
 * (tip `a` ahead, back corners 0.6 a behind and 0.7 a aside) turned to the arrow's bearing, at its largest (downed:
 * × 1.5 × the revive pulse's peak), grown on every side by the outline's mitred tip (half the stroke / sin 23.6° ≈
 * 1.25 × the stroke). The pulse never makes it bigger than this; `k` px per CSS px. No allocation.
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
  const minX = Math.min(x0, x1, x2) - pad;
  const minY = Math.min(y0, y1, y2) - pad;
  out.x = m.x + minX;
  out.y = m.y + minY;
  out.w = Math.max(x0, x1, x2) + pad - minX;
  out.h = Math.max(y0, y1, y2) + pad - minY;
  return out;
}
