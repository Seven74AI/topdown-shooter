/** Values the GameScene publishes each frame for the HUD to draw (the HUD never reads the World). */
export interface HudModel {
  hp: number;
  maxHp: number;
  /** Active weapon's display name. */
  weaponName: string;
  /** Rounds in the magazine; -1 for melee (no magazine). */
  ammo: number;
  magazine: number;
  /** Reload progress 0..1 while reloading, otherwise -1. */
  reloadFrac: number;
  /** The other (inactive) slot: name ("" when empty), ammo (-1 for melee) and magazine. */
  otherWeaponName: string;
  otherAmmo: number;
  otherMag: number;
  /** Swap progress 0..1 while swapping, otherwise -1. */
  swapFrac: number;
  /** Set by the HUD when the swap button is pressed; the GameScene consumes it. */
  swapPressed: boolean;
  /** Current wave number (0 before wave 1) and zombies remaining (alive + queued). */
  wave: number;
  remaining: number;
  /** Centered banner text and the scene time (ms) it was shown; empty when none. */
  bannerText: string;
  bannerAtMs: number;
  /** World positions of rushing zombies (x0, y0, x1, y1, …) and how many are valid. */
  readonly rushers: Float32Array;
  rusherCount: number;
  /** Main camera's visible world rectangle and zoom, to turn world positions into screen positions. */
  camX: number;
  camY: number;
  camZoom: number;
}

/** Most rush markers shown (the last-5 rule marks 5). */
export const MAX_RUSH_MARKERS = 8;

export const createHudModel = (): HudModel => ({
  hp: 0,
  maxHp: 1,
  weaponName: "",
  ammo: 0,
  magazine: 0,
  reloadFrac: -1,
  otherWeaponName: "",
  otherAmmo: 0,
  otherMag: 0,
  swapFrac: -1,
  swapPressed: false,
  wave: 0,
  remaining: 0,
  bannerText: "",
  bannerAtMs: 0,
  rushers: new Float32Array(MAX_RUSH_MARKERS * 2),
  rusherCount: 0,
  camX: 0,
  camY: 0,
  camZoom: 1,
});
