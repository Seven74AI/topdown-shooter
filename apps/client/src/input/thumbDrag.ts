/**
 * Story 5.19 (ux-spec §6.2): the right-thumb drag while holding a building. Phaser-free, so it is
 * unit-tested. HudScene hands it the one pointer it claimed while holding (a right-half touch, or a
 * mouse press, that missed every HUD button: 5.15's `placePointer`); a pointer that started on a
 * button never comes here. The touch becomes a drag once it has travelled more than `startPx`
 * canvas px from where it went down; from that moment (D1: not before, so the ghost never jumps at
 * the crossing) its movement piles up until the game scene takes it once per frame. Canvas px in,
 * canvas px out; no allocation.
 */
export class ThumbDrag {
  /** The claimed pointer, or -1. */
  pointerId = -1;
  /** The claimed pointer has crossed the start distance (it is a drag, not a tap). */
  dragging = false;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  /** Movement since the crossing that the scene hasn't taken yet (canvas px). */
  private dx = 0;
  private dy = 0;
  /** A drag started since the last `take` (it pins the ghost even when the finger then holds still). */
  private startedEdge = false;

  /** A new pointer claimed for the drag; ignored while another one is held (B8: one thumb drags). */
  down(pointerId: number, x: number, y: number): void {
    if (this.pointerId !== -1) return;
    this.pointerId = pointerId;
    this.dragging = false;
    this.downX = this.lastX = x;
    this.downY = this.lastY = y;
  }

  /** The claimed pointer moved to (x, y); `startPx` = the start distance in canvas px (CSS px × dpr). */
  move(pointerId: number, x: number, y: number, startPx: number): void {
    if (pointerId !== this.pointerId) return;
    if (!this.dragging) {
      const ox = x - this.downX;
      const oy = y - this.downY;
      if (ox * ox + oy * oy <= startPx * startPx) return;
      this.dragging = true;
      this.startedEdge = true;
      this.lastX = x; // D1: counted from the crossing
      this.lastY = y;
      return;
    }
    this.dx += x - this.lastX;
    this.dy += y - this.lastY;
    this.lastX = x;
    this.lastY = y;
  }

  /** The pointer lifted (or was cancelled). Movement not yet taken is kept for the next `take`. */
  up(pointerId: number): void {
    if (pointerId !== this.pointerId) return;
    this.pointerId = -1;
    this.dragging = false;
  }

  /**
   * Once per frame: writes the movement since the last call into `out` (canvas px) and returns
   * whether there is anything to apply (a drag started, or it moved). Clears both.
   */
  take(out: { dx: number; dy: number }): boolean {
    out.dx = this.dx;
    out.dy = this.dy;
    const any = this.startedEdge || this.dx !== 0 || this.dy !== 0;
    this.dx = 0;
    this.dy = 0;
    this.startedEdge = false;
    return any;
  }

  /** Holding ended / the HUD reset: forget the pointer and any movement. */
  reset(): void {
    this.pointerId = -1;
    this.dragging = false;
    this.dx = 0;
    this.dy = 0;
    this.startedEdge = false;
  }
}
