/**
 * Story 5.19 (ux-spec §6.2): the right-thumb drag while holding a building. Phaser-free, so it is
 * unit-tested. HudScene hands it the one pointer it claimed while holding (a right-half touch, or a
 * mouse press, that missed every HUD button: 5.15's `placePointer`), and — review M1 — a touch that
 * starts on the item chip (`onChip`): the chip is not a HudButton (those press on touch-down), so a
 * drag may start on it. The touch becomes a drag once it has travelled more than `startPx` canvas
 * px from where it went down; from that moment (D1: not before, so the ghost never jumps at the
 * crossing) its movement piles up until the HUD takes it. A chip touch that lifts without becoming
 * a drag is a chip tap (`up` returns true). Canvas px in, canvas px out; no allocation.
 */
export class ThumbDrag {
  /** The claimed pointer, or -1. */
  pointerId = -1;
  /** The claimed pointer has crossed the start distance (it is a drag, not a tap). */
  dragging = false;
  /** The claimed pointer went down on the item chip. */
  onChip = false;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  /** Movement since the crossing that the HUD hasn't taken yet (canvas px). */
  private dx = 0;
  private dy = 0;
  /** A drag started since the last `take` (it pins the ghost even when the finger then holds still). */
  private startedEdge = false;

  /** A new pointer claimed for the drag; ignored while another one is held (B8: one thumb drags). */
  down(pointerId: number, x: number, y: number, onChip = false): void {
    if (this.pointerId !== -1) return;
    this.pointerId = pointerId;
    this.dragging = false;
    this.onChip = onChip;
    this.downX = this.lastX = x;
    this.downY = this.lastY = y;
  }

  /** The claimed pointer moved to (x, y); `startPx` = the start distance in canvas px (CSS px × dpr). */
  move(pointerId: number, x: number, y: number, startPx: number): void {
    if (pointerId !== this.pointerId) return;
    if (!this.dragging) {
      const ox = x - this.downX;
      const oy = y - this.downY;
      if (ox * ox + oy * oy <= startPx * startPx) return; // exactly the start distance is still a tap
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

  /** The pointer lifted (or was cancelled). Returns true for a chip tap (went down on the chip, never became a drag). */
  up(pointerId: number): boolean {
    if (pointerId !== this.pointerId) return false;
    const tap = this.onChip && !this.dragging;
    this.pointerId = -1;
    this.dragging = false;
    this.onChip = false;
    return tap;
  }

  /**
   * Writes the movement since the last call into `out` (canvas px) and whether a drag gesture began
   * since then (`began`: review M2 resets the gesture's net displacement); returns whether there is
   * anything to apply. Clears all three. The HUD calls it right after every `move`.
   */
  take(out: { dx: number; dy: number; began: boolean }): boolean {
    out.dx = this.dx;
    out.dy = this.dy;
    out.began = this.startedEdge;
    const any = this.startedEdge || this.dx !== 0 || this.dy !== 0;
    this.dx = 0;
    this.dy = 0;
    this.startedEdge = false;
    return any;
  }

  /** Holding ended / the HUD reset: forget the pointer and any movement (no tap). */
  reset(): void {
    this.pointerId = -1;
    this.dragging = false;
    this.onChip = false;
    this.dx = 0;
    this.dy = 0;
    this.startedEdge = false;
  }
}

/** Review M1: a point (canvas px) on the chip's rect, with the HUD buttons' fat-finger tolerance. */
export function onChipRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }, tolerance: number): boolean {
  return r.w > 0 && x >= r.x - tolerance && x <= r.x + r.w + tolerance && y >= r.y - tolerance && y <= r.y + r.h + tolerance;
}
