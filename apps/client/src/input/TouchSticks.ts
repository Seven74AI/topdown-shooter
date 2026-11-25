import { stickDeflection, stickVector, type StickVector } from "./stick";
import { getSettings } from "../settings/settings";

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
 * stick, one on the right half owns the aim stick, each until it lifts (even if it slides across
 * the middle). Coordinates are canvas pixels.
 */
/** Aim deflection below this counts as "thumb resting": no aim direction at all. */
const AIM_MIN_DEFLECTION = 0.05;

export interface AimState {
  /** Unit aim direction, or (0, 0) when the thumb rests at the center or there is no aim touch. */
  x: number;
  y: number;
  /** Past the aim dead zone: the weapon fires (GDD: fires automatically while aiming). */
  fire: boolean;
  /** Story 5.5: the raw deflection (0–1; the launcher's lob distance, D1). */
  deflection: number;
}

export class TouchSticks {
  move: StickTouch | null = null;
  aim: StickTouch | null = null;
  private readonly moveVec: StickVector = { x: 0, y: 0, magnitude: 0 };
  private readonly aimState: AimState = { x: 0, y: 0, fire: false, deflection: 0 };

  constructor(
    private radiusPx: number,
    private moveDeadZone: number,
    private aimDeadZone = 0.3,
  ) {}

  setRadius(radiusPx: number): void {
    this.radiusPx = radiusPx;
  }

  get radius(): number {
    return this.radiusPx;
  }

  /** Story 5.5: the aim stick's fire dead zone (fraction of the radius). */
  get aimDeadZoneFrac(): number {
    return this.aimDeadZone;
  }

  pointerDown(pointerId: number, x: number, y: number, screenWidth: number): void {
    if (x < screenWidth / 2) {
      if (this.move) return; // the move stick already has a thumb
      this.move = { pointerId, originX: x, originY: y, x, y };
    } else {
      if (this.aim) return;
      this.aim = { pointerId, originX: x, originY: y, x, y };
    }
  }

  pointerMove(pointerId: number, x: number, y: number): void {
    if (this.move?.pointerId === pointerId) {
      this.move.x = x;
      this.move.y = y;
    } else if (this.aim?.pointerId === pointerId) {
      this.aim.x = x;
      this.aim.y = y;
    }
  }

  pointerUp(pointerId: number): void {
    if (this.move?.pointerId === pointerId) this.move = null;
    if (this.aim?.pointerId === pointerId) this.aim = null;
  }

  /** Story 5.15: lets go of the aim stick only (holding a building starts: the move thumb keeps steering). */
  releaseAim(): void {
    this.aim = null;
  }

  /** Releases every stick (window blur, scene shutdown). */
  reset(): void {
    this.move = null;
    this.aim = null;
  }

  /** Aim direction and whether the deflection is past the aim dead zone. */
  aimVector(): AimState {
    const a = this.aim;
    const out = this.aimState;
    out.x = 0;
    out.y = 0;
    out.fire = false;
    out.deflection = 0;
    if (!a) return out;
    const deflection = stickDeflection(a.originX, a.originY, a.x, a.y, this.radiusPx);
    out.deflection = deflection;
    if (deflection < AIM_MIN_DEFLECTION) return out;
    const dx = a.x - a.originX;
    const dy = a.y - a.originY;
    const d = Math.sqrt(dx * dx + dy * dy);
    out.x = dx / d;
    out.y = dy / d;
    out.fire = deflection >= this.aimDeadZone;
    return out;
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
    return stickVector(m.originX, m.originY, m.x, m.y, this.radiusPx, this.moveDeadZone, this.moveVec, getSettings().alwaysFullSpeed === true);
  }
}
