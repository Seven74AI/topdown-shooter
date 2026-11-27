import { ease } from "./cameraDirector";

/**
 * Story 12.3 (AC 8): the helicopter crew member, pure (`CrewView` draws it). A placeholder look (X9: photoreal later,
 * with 9.4's characters). Once the helicopter is down and the extraction has begun, the crew member steps out of the
 * side door, reaches in ("pulls in") at every boarding (the out players and held seats board at the start), waves the
 * others in between, and climbs back aboard when everyone is in (before the lift-off beat ends).
 */
/** The side door and where the crew member stands (m from the pad centre; the nose points west, the door is south). */
export const CREW_DOOR_M = { x: -0.4, y: 0.8 } as const;
export const CREW_STAND_M = { x: -0.6, y: 2.1 } as const;
/** Stepping out / climbing back (s): the climb must end inside the lift-off beat (`evac.liftBeatS` = 0.5). */
export const CREW_STEP_S = 0.5;
export const CREW_CLIMB_S = 0.4;
/** A pull-in gesture after each boarding (s), and the wave's rate (rad/s) and swing (rad). */
export const CREW_PULL_S = 0.8;
const WAVE_RAD_S = 7;
const WAVE_SWING = 0.6;
/** The arm at rest points this way (rad, screen: 0 = east, −π/2 = north). */
const ARM_UP = -Math.PI / 2;
const ARM_TO_DOOR = -Math.PI * 0.62;

export interface CrewPose {
  visible: boolean;
  /** Offset from the pad centre (m). */
  dx: number;
  dy: number;
  alpha: number;
  /** The waving arm's angle (rad). */
  armRad: number;
  pulling: boolean;
}

export function createCrewPose(): CrewPose {
  return { visible: false, dx: 0, dy: 0, alpha: 0, armRad: ARM_UP, pulling: false };
}

/**
 * `outS` = seconds since the crew member could step out (the later of the landing and the extraction's start; < 0 =
 * not yet), `aboardS` = seconds since everyone is aboard (< 0 = not yet), `pullS` = seconds since the last boarding
 * (< 0 = none). Same inputs → same pose (every phone).
 */
export function crewPose(outS: number, aboardS: number, pullS: number, out: CrewPose): CrewPose {
  if (outS < 0 || (aboardS >= CREW_CLIMB_S)) {
    out.visible = false;
    out.alpha = 0;
    return out;
  }
  let u = ease(outS / CREW_STEP_S);
  out.alpha = Math.min(1, outS / (CREW_STEP_S * 0.4));
  if (aboardS >= 0) {
    const c = ease(aboardS / CREW_CLIMB_S);
    u = Math.min(u, 1 - c);
    out.alpha = Math.min(out.alpha, 1 - c);
  }
  out.visible = out.alpha > 0;
  out.dx = CREW_DOOR_M.x + (CREW_STAND_M.x - CREW_DOOR_M.x) * u;
  out.dy = CREW_DOOR_M.y + (CREW_STAND_M.y - CREW_DOOR_M.y) * u;
  out.pulling = pullS >= 0 && pullS < CREW_PULL_S;
  if (out.pulling) out.armRad = ARM_TO_DOOR + Math.sin((pullS / CREW_PULL_S) * Math.PI) * 0.5; // a reach into the door and back
  else out.armRad = ARM_UP + Math.sin(outS * WAVE_RAD_S) * WAVE_SWING; // waving the others in
  return out;
}
