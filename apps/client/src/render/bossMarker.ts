import { BOSS_ATTACK, BOSS_STATE } from "@topdown/shared";
import { edgeArrow } from "./edgeArrow";

/**
 * Story 6.5 (F1, AC 13): the boss's edge marker. While the boss (or the warning's entry point) is off
 * screen, a red disc with a skull sits at the screen edge on the line from the centre, pulsing during
 * the WARNING and a TELEGRAPH, with an icon for the coming attack (rings = slam, arrow = charge, rock =
 * throw). Pure (tested); the view draws it with `ABOVE_DARK.marker`.
 */
export interface BossMarker {
  visible: boolean;
  x: number;
  y: number;
  angle: number;
  pulse: boolean;
  /** `BOSS_ATTACK` kind of the icon (0: none). */
  icon: number;
}

const arrow = { x: 0, y: 0, angle: 0 };

/** (sx, sy): the boss's screen position; w × h the screen; margin keeps the disc inside. */
export function bossMarker(state: number, attackKind: number, sx: number, sy: number, w: number, h: number, margin: number, out: BossMarker): BossMarker {
  out.visible = false;
  out.pulse = false;
  out.icon = 0;
  const on = state >= BOSS_STATE.WARNING && state <= BOSS_STATE.ROAR;
  if (!on || !edgeArrow(sx, sy, w, h, margin, arrow)) return out;
  out.visible = true;
  out.x = arrow.x;
  out.y = arrow.y;
  out.angle = arrow.angle;
  out.pulse = state === BOSS_STATE.WARNING || state === BOSS_STATE.TELEGRAPH;
  out.icon = state === BOSS_STATE.TELEGRAPH && attackKind >= BOSS_ATTACK.SLAM && attackKind <= BOSS_ATTACK.THROW ? attackKind : 0;
  return out;
}
