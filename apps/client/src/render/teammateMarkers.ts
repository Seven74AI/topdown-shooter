import { MAX_PLAYERS } from "@topdown/shared";
import { edgeArrow } from "./edgeArrow";
import { TEAMMATE_DOWNED, TEAMMATE_OUT, type HudModel } from "../scenes/hudModel";

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
