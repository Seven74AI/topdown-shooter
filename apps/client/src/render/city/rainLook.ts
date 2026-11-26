import { isBlackout, type World } from "@topdown/shared";

/**
 * Story 6.3 (D7): the normal rain's alpha this frame: `base`, × `decay.json › blackout.rainK` (35 %)
 * in a blackout (faint over the dark; the beams sparkle instead). Pure (tested without Phaser).
 */
export function rainAlphaFor(world: World, base: number): number {
  return isBlackout(world) ? base * world.balance.decay.blackout.rainK : base;
}

/** Story 6.3 (designer B3): the hazard ghosts' share of their look this frame (0 = no blackout). */
export function hazardGhostFor(world: World): number {
  return isBlackout(world) ? world.balance.decay.blackout.hazardAboveDarkPct / 100 : 0;
}

/**
 * Story 10.1 (B3): this frame's weather drop count from the stage's rain level, the Rain setting's multiplier
 * (`RAIN_LEVEL_K`: 1 / 0.5 / 0) and the view. Ash (CO3) uses the same pool at half density (`?fx=low`: half again).
 * Pure; `CityView.update` calls it every frame with the live setting.
 */
export function weatherDropCount(ash: boolean, level: number, rainK: number, viewW: number, viewH: number, perM2: number, pool: number, ashCap: number, lowFx: boolean): number {
  if (ash) return Math.round(rainK * (lowFx ? 0.5 : 1) * Math.min(ashCap, viewW * viewH * perM2 * 0.5));
  return Math.min(pool, Math.round(viewW * viewH * perM2 * level * rainK));
}
