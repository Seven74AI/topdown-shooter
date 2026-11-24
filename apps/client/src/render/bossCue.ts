import type { SimEvent } from "@topdown/shared";

/**
 * Story 6.5 (AC 13–14, brief 14): what a boss event plays on this device. A woken tab's backlog
 * (`ageS` past `BOSS_STALE_S`) plays no banner and no sound; the state (bar, telegraph, marker) shows
 * the truth anyway. Pure (tested).
 */
export const BOSS_WARNING_BANNER = "Something big is coming";
export const BOSS_ARRIVED_BANNER = "THE BEHEMOTH";
export const BOSS_STALE_S = 1.0;
/** The slam shakes the camera of a survivor within this distance of it (m). */
export const BOSS_SLAM_SHAKE_M = 12;
/** D10: the new target's buzz (3 × 40 ms). */
export const BOSS_TARGET_BUZZ: readonly number[] = [40, 60, 40, 60, 40];

export interface BossCue {
  banner: string;
  sound: "" | "boss_rumble" | "boss_roar" | "boss_slam";
  shake: boolean;
  buzz: boolean;
  music: "" | "start";
}

export function bossCue(e: SimEvent, localId: string, meX: number, meY: number, out: BossCue): BossCue {
  out.banner = "";
  out.sound = "";
  out.shake = false;
  out.buzz = false;
  out.music = "";
  const stale = "ageS" in e && (e.ageS ?? 0) > BOSS_STALE_S;
  switch (e.type) {
    case "boss.warning":
      if (stale) break;
      out.banner = BOSS_WARNING_BANNER;
      out.sound = "boss_rumble";
      break;
    case "boss.arrived":
      out.music = "start"; // the loop follows the state: a late tab still hears the fight
      if (stale) break;
      out.banner = BOSS_ARRIVED_BANNER;
      out.sound = "boss_roar";
      break;
    case "boss.slammed":
      if (stale) break;
      out.sound = "boss_slam";
      out.shake = Math.hypot(meX - e.x, meY - e.y) <= BOSS_SLAM_SHAKE_M;
      break;
    case "boss.target_changed":
      out.buzz = e.playerId === localId;
      break;
    default:
      break;
  }
  return out;
}
