/** Story 3.7: a tap is a pointer down → up within this time (ms) ... */
export const TAP_MAX_MS = 300;
/** ... that travelled at most this far (CSS px; multiply by dpr() for canvas px). */
export const TAP_SLOP_CSS_PX = 12;

/**
 * Story 3.7: recognises short taps on the game view (to select a building) without taking the
 * pointer from anyone: the sticks still spawn on touch-down and the mouse still fires, the detector
 * only watches. It follows one pointer (the latest touch-down); a pointer that started on a HUD button
 * is not eligible. Plain fields: no allocation per event. Phaser-free, so it is unit-tested.
 */
export class TapDetector {
  private id = -1;
  private x = 0;
  private y = 0;
  private atMs = 0;

  /** A pointer went down at canvas (x, y). `eligible` false: it pressed a HUD button. */
  down(id: number, x: number, y: number, nowMs: number, eligible: boolean): void {
    if (!eligible) {
      if (this.id === id) this.id = -1;
      return;
    }
    this.id = id;
    this.x = x;
    this.y = y;
    this.atMs = nowMs;
  }

  /** The followed pointer moved: it stops being a tap once it leaves the slop circle. */
  move(id: number, x: number, y: number, slopPx: number): void {
    if (id !== this.id) return;
    const dx = x - this.x;
    const dy = y - this.y;
    if (dx * dx + dy * dy > slopPx * slopPx) this.id = -1;
  }

  /** The pointer lifted at (x, y): true when it was a tap (then `x`/`y` hold where it went down). */
  up(id: number, x: number, y: number, nowMs: number, slopPx: number): boolean {
    if (id !== this.id) return false;
    this.id = -1;
    const dx = x - this.x;
    const dy = y - this.y;
    return nowMs - this.atMs <= TAP_MAX_MS && dx * dx + dy * dy <= slopPx * slopPx;
  }

  /** Where the last tap went down (canvas px). */
  get tapX(): number {
    return this.x;
  }
  get tapY(): number {
    return this.y;
  }

  /** Window blur, the menu opening, placement starting: forget the followed pointer. */
  reset(): void {
    this.id = -1;
  }
}
