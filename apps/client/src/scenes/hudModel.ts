/** Values the GameScene publishes each frame for the HUD to draw (the HUD never reads the World). */
export interface HudModel {
  hp: number;
  maxHp: number;
}

export const createHudModel = (): HudModel => ({ hp: 0, maxHp: 1 });
