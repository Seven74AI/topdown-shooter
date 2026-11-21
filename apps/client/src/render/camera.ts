import { VIEW_HEIGHT_M, VIEW_WIDTH_M } from "@topdown/shared";

/**
 * Pixels per meter so the view is never larger than 24 × 13.5 m: a 16:9 screen shows exactly that,
 * a wider phone shows 24 m wide and less height, a 4:3 tablet shows 13.5 m tall and less width.
 */
export function pixelsPerMeter(canvasWidth: number, canvasHeight: number): number {
  return Math.max(canvasWidth / VIEW_WIDTH_M, canvasHeight / VIEW_HEIGHT_M);
}
