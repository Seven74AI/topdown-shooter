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
}

export const createHudModel = (): HudModel => ({ hp: 0, maxHp: 1, weaponName: "", ammo: 0, magazine: 0, reloadFrac: -1 });
