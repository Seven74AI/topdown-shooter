import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import type { Building } from "./buildings";

/**
 * Story 5.10: med stations (FR52; fairness ACs 5–8). Runs in the `buildings` slot after the turrets
 * and traps (server and solo; never predicted: the client shows `player.hp` from state).
 *
 * - Who: a player whose body circle overlaps a station's heal circle (centre distance strictly below
 *   `heal.radiusM + p.radiusM`, the 4.8 D7 "touch the ring" rule), with status "alive", in a build or
 *   wave phase, before a team wipe. Downed and out players are never healed (their timers untouched).
 * - How much: `hpPerS × dtS` per tick (0.25 HP at 5/s), capped at the player's own `maxHp`. Continuous
 *   per-body accrual: no pulse, no clock (nothing to dodge, nothing to farm, nothing to snapshot).
 * - No stacking: one heal per player per tick, at the highest rate among the stations in reach.
 * - No line of sight: an aura (walls, cars and barricades don't block it). Players only.
 *
 * No allocation per tick (players by `forEach` with a module-level pass record), no event.
 */

const pass = { world: null as World | null, dtS: 0 };

function healPlayer(p: PlayerState): void {
  const world = pass.world as World;
  if (p.status !== "alive" || p.hp >= p.maxHp) return;
  const types = world.balance.buildings.types;
  const list = world.buildings.list;
  let best = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    const heal = Object.prototype.hasOwnProperty.call(types, b.type) ? types[b.type]?.heal : undefined;
    if (!heal || heal.hpPerS <= best) continue;
    const dx = p.x - (b.minX + b.maxX) / 2;
    const dy = p.y - (b.minY + b.maxY) / 2;
    const reach = heal.radiusM + p.radiusM;
    if (dx * dx + dy * dy < reach * reach) best = heal.hpPerS;
  }
  if (best > 0) p.hp = Math.min(p.maxHp, p.hp + best * pass.dtS);
}

export function updateMedStations(world: World, dtS: number): void {
  if (world.teamWiped) return;
  const phase = world.run.phase;
  if (phase !== "build" && phase !== "wave") return;
  pass.world = world;
  pass.dtS = dtS;
  world.players.forEach(healPlayer);
  pass.world = null;
}

/** Story 5.10: the player overlaps some med station's heal circle (the client's heal cue reads it). */
export function inHealReach(world: Readonly<World>, x: number, y: number, bodyRadiusM: number): boolean {
  const types = world.balance.buildings.types;
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    const heal = Object.prototype.hasOwnProperty.call(types, b.type) ? types[b.type]?.heal : undefined;
    if (!heal) continue;
    const dx = x - (b.minX + b.maxX) / 2;
    const dy = y - (b.minY + b.maxY) / 2;
    const reach = heal.radiusM + bodyRadiusM;
    if (dx * dx + dy * dy < reach * reach) return true;
  }
  return false;
}
