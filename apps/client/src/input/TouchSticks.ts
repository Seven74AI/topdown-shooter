import { stickVector, type StickVector } from "./stick";

/** Stick sizes in CSS px; multiplied by dpr() into canvas pixels. */
export const STICK_RADIUS_CSS_PX = 60;
export const KNOB_RADIUS_CSS_PX = 24;

export interface StickTouch {
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

/**
 * Floating twin-stick state (no Phaser): a pointer that goes down on the left half owns the move
 * stick until it lifts, even if it slides across the middle. The right half is reserved for the
 * aim stick (Story 1.5). Coordinates are canvas pixels.
 */
export class TouchSticks {
  move: StickTouch | null = null;
  private readonly moveVec: StickVector = { x: 0, y: 0, magnitude: 0 };

  constructor(
    private radiusPx: number,
    private moveDeadZone: number,
  ) {}

  setRadius(radiusPx: number): void {
    this.radiusPx = radiusPx;
  }

  get radius(): number {
    return this.radiusPx;
  }

  pointerDown(pointerId: number, x: number, y: number, screenWidth: number): void {
    if (x < screenWidth / 2) {
      if (this.move) return; // the move stick already has a thumb
      this.move = { pointerId, originX: x, originY: y, x, y };
    }
    // Right half: aim stick (Story 1.5).
  }

  pointerMove(pointerId: number, x: number, y: number): void {
    if (this.move?.pointerId === pointerId) {
      this.move.x = x;
      this.move.y = y;
    }
  }

  pointerUp(pointerId: number): void {
    if (this.move?.pointerId === pointerId) this.move = null;
  }

  /** Releases every stick (window blur, scene shutdown). */
  reset(): void {
    this.move = null;
  }

  /** Move vector with the dead zone applied; length ≤ 1. */
  moveVector(): StickVector {
    const m = this.move;
    if (!m) {
      this.moveVec.x = 0;
      this.moveVec.y = 0;
      this.moveVec.magnitude = 0;
      return this.moveVec;
    }
    return stickVector(m.originX, m.originY, m.x, m.y, this.radiusPx, this.moveDeadZone, this.moveVec);
  }
}
