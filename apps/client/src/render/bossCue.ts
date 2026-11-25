import type { SimEvent } from "@topdown/shared";

/**
 * Story 6.5 (AC 13–14, brief 14): what a boss event plays on this device. A woken tab's backlog
 * (`ageS` past `BOSS_STALE_S`) plays no banner and no sound; the state (bar, telegraph, marker) shows
 * the truth anyway. Pure (tested).
 */
/**
 * Asset fixes round 5 (P1): the warning and the arrival show the HUD's THE BEHEMOTH warning banner
 * (`BossHud`, from the boss state: a woken tab shows the truth too), so neither plays a text banner any more.
 */
export const BOSS_WARNING_BANNER = "";
export const BOSS_ARRIVED_BANNER = "";
export const BOSS_STALE_S = 1.0;
/** Story 6.6 (D6): the crash banner (amber: the stun is your window), 1.2 s. */
export const BOSS_CRASH_BANNER = "CRASH!";
export const BOSS_CRASH_BANNER_MS = 1200;
/** Story 6.7: the roar (red: boss danger) and the death (amber: something good coming). */
export const BOSS_ENRAGED_BANNER = "ENRAGED\nfaster, shorter gaps\nCrawlers off its back"; // short lines: 568 px wide phones
export const BOSS_EVAC_BANNER = "EVAC INBOUND";
export const BOSS_AMBER = "#ffb52e";
export const BOSS_RED = "#ff4a3a";
/** Story 6.6: the throw's impact shakes the camera within this distance (m). */
export const BOSS_THROW_SHAKE_M = 8;
/** The slam shakes the camera of a survivor within this distance of it (m). */
export const BOSS_SLAM_SHAKE_M = 12;
/** D10: the new target's buzz (3 × 40 ms). */
export const BOSS_TARGET_BUZZ: readonly number[] = [40, 60, 40, 60, 40];

export type BossSound =
  | ""
  | "boss_rumble"
  | "boss_roar"
  | "boss_slam"
  | "boss_charge_scrape"
  | "boss_charge_rush"
  | "boss_crash"
  | "boss_throw_lift"
  | "boss_throw_impact"
  | "boss_roar_enrage"
  | "boss_crawler_drop"
  | "boss_death";

export interface BossCue {
  banner: string;
  /** Stories 6.6 / 6.7: the banner's colour ("" white) and duration (ms; 0 default). */
  bannerColor: string;
  bannerMs: number;
  sound: BossSound;
  shake: boolean;
  buzz: boolean;
  music: "" | "start";
}

/** Story 6.7 (D5): the death banner's subtitle — who finished it (when known) and the team pay. */
export function evacSubtitle(killerName: string, pay: number): string {
  return killerName ? `+${pay} to everyone\n${killerName} finished it` : `+${pay} to everyone`;
}

export function bossCue(e: SimEvent, localId: string, meX: number, meY: number, out: BossCue, killerName = "", killPay = 150): BossCue {
  out.banner = "";
  out.bannerColor = "";
  out.bannerMs = 0;
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
    case "boss.telegraph": // Story 6.6: the charge's scrape, the throw's lift
      if (stale) break;
      out.sound = e.kind === 2 ? "boss_charge_scrape" : e.kind === 3 ? "boss_throw_lift" : "";
      break;
    case "boss.crashed":
      if (stale) break;
      out.banner = BOSS_CRASH_BANNER;
      out.bannerColor = BOSS_AMBER;
      out.bannerMs = BOSS_CRASH_BANNER_MS;
      out.sound = "boss_crash";
      out.shake = Math.hypot(meX - e.x, meY - e.y) <= BOSS_SLAM_SHAKE_M;
      break;
    case "boss.thrown_impact":
      if (stale) break;
      out.sound = "boss_throw_impact";
      out.shake = Math.hypot(meX - e.x, meY - e.y) <= BOSS_THROW_SHAKE_M;
      break;
    case "boss.enraged": // Story 6.7: a woken tab never shows a late ENRAGED (the red bar shows it anyway)
      if (stale) break;
      out.banner = BOSS_ENRAGED_BANNER;
      out.bannerColor = BOSS_RED;
      out.sound = "boss_roar_enrage";
      out.shake = Math.hypot(meX - e.x, meY - e.y) <= BOSS_SLAM_SHAKE_M;
      break;
    case "boss.crawler_dropped":
      if (!stale) out.sound = "boss_crawler_drop";
      break;
    case "boss.killed":
      // Story 6.7: EVAC INBOUND shows once even for a woken tab (the caller shows it once per Behemoth); the sound only when fresh.
      out.banner = `${BOSS_EVAC_BANNER}\n${evacSubtitle(killerName, killPay)}`;
      out.bannerColor = BOSS_AMBER;
      if (!stale) out.sound = "boss_death";
      break;
    case "boss.target_changed":
      out.buzz = !stale && e.playerId === localId; // review L5: a woken tab's backlog doesn't buzz
      break;
    default:
      break;
  }
  return out;
}
