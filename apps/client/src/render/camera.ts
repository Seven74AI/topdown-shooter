import { VIEW_HEIGHT_M, VIEW_WIDTH_M } from "@topdown/shared";

/**
 * Pixels per meter so the view is never larger than 24 × 13.5 m: a 16:9 screen shows exactly that,
 * a wider phone shows 24 m wide and less height, a 4:3 tablet shows 13.5 m tall and less width.
 */
export function pixelsPerMeter(canvasWidth: number, canvasHeight: number): number {
  return Math.max(canvasWidth / VIEW_WIDTH_M, canvasHeight / VIEW_HEIGHT_M);
}

/**
 * The intensity to pass to Phaser's `camera.shake` so the screen moves by `fraction` of the view.
 * Phaser 4.2.1's Shake multiplies its offset by `zoom` and then translates `camera.matrix`, which
 * already carries the zoom, so the screen moved `fraction × zoom²` views: at 40 px/m a blast's
 * 0.012 threw the camera ~290 m off the map and the screen went black for the whole shake.
 */
export function shakeIntensityFor(fraction: number, zoom: number): number {
  return zoom > 0 ? fraction / (zoom * zoom) : 0;
}
