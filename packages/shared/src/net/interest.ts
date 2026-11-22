import { VIEW_HEIGHT_M, VIEW_WIDTH_M } from "../config/constants";
import type { DistrictBounds } from "../map/placeholderMap";

/** An axis-aligned rectangle in map metres. */
export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * What a player at (px, py) can see, plus `marginM` on every side (Story 2.5 › Interest). The
 * server doesn't know the phone's aspect, so the view is the widest the camera can show
 * (VIEW_WIDTH_M × VIEW_HEIGHT_M), centred like the camera: clamped inside the map, so a player
 * near a wall sees farther the other way; a map smaller than the view is centred (the same rule
 * as `GameScene.updateRushMarkers`). Writes into `out` and returns it.
 */
export function viewRect(map: DistrictBounds, px: number, py: number, marginM: number, out: Rect): Rect {
  const halfW = VIEW_WIDTH_M / 2;
  const halfH = VIEW_HEIGHT_M / 2;
  const cx = map.widthM > 2 * halfW ? Math.min(map.widthM - halfW, Math.max(halfW, px)) : map.widthM / 2;
  const cy = map.heightM > 2 * halfH ? Math.min(map.heightM - halfH, Math.max(halfH, py)) : map.heightM / 2;
  out.minX = cx - halfW - marginM;
  out.maxX = cx + halfW + marginM;
  out.minY = cy - halfH - marginM;
  out.maxY = cy + halfH + marginM;
  return out;
}

/** Point-in-rectangle, edges included. */
export const inRect = (r: Rect, x: number, y: number): boolean => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
