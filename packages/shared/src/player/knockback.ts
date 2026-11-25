import type { ZombieTypeStats } from "../config/balanceSchema";
import type { Balance } from "../config/balance";
import { ticksFor } from "../core/time";
import { circleInFire } from "../decay/decayState";
import type { World } from "../core/world";
import { hasObstacles, pushOutOfBuildings, pushed } from "../buildings/collision";
import type { PlayerState } from "./player";

/**
 * Story 5.7 (F2, F3, D3, D4): a Brute's hit knocks the player `hitKnockbackM` straight away from it
 * over `knockbackS`. The state is four integers on the player (all on the wire, so the client's
 * prediction slides exactly like the server, the 3.9 slow pattern):
 *
 * - `knockTicks`: movement ticks left in the knock (0 = none);
 * - `knockDx`, `knockDy`: the unit direction × 127, rounded (int8; never a heading: movement code
 *   uses no sin/cos);
 * - `knockStepMm`: the distance per tick in integer millimetres (1.5 m / 4 ticks = 375).
 *
 * Set in the zombie system of tick T; `movePlayers` of ticks T+1 … T+knockTicks slides the body
 * (no steering; aim and fire still work) through the normal push-out (cars, bus, buildings,
 * barricades, turrets, map boxes, the map edge: the body slides along or stops), and a step that
 * would put the body into a burning fire zone (`circleInFire`) is not taken: the knock ends there.
 * Like the slow, it counts applied input seqs only (a starved server tick neither moves nor counts).
 */
export const KNOCK_DIR_SCALE = 127;

/** Knocks standing player `p` away from (fromX, fromY) with the hitting type's stats. Never a downed or out player (F3). */
export function knockPlayer(p: PlayerState, fromX: number, fromY: number, stats: Readonly<ZombieTypeStats>): void {
  knockPlayerBy(p, fromX, fromY, stats.hitKnockbackM, stats.knockbackS);
}

/**
 * Story 6.5 (DD5): the knock generalised — `distM` straight away from (fromX, fromY) over `durS`
 * (whole ticks). The Brute calls it with its stats, the Behemoth's slam with `slam.pushM / pushS`
 * (2 m / 4 ticks = 500 mm per tick). Never a downed or out player.
 */
export function knockPlayerBy(p: PlayerState, fromX: number, fromY: number, distM: number, durS: number): void {
  if (p.status !== "alive" || distM <= 0) return;
  const ticks = ticksFor(durS);
  if (ticks <= 0) return;
  let dx = p.x - fromX;
  let dy = p.y - fromY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) {
    dx = 1; // coincident (cannot happen after the contact push-out): a fixed axis
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  p.knockTicks = ticks;
  p.knockDx = Math.round(dx * KNOCK_DIR_SCALE);
  p.knockDy = Math.round(dy * KNOCK_DIR_SCALE);
  p.knockStepMm = Math.round((distM * 1000) / ticks);
}

/** Story 6.6 review L2: a knock's mm per tick (the wire's `knockStepMm`) for `distM` over `durS`. */
export function knockStepMmOf(distM: number, durS: number): number {
  const ticks = ticksFor(durS);
  return ticks > 0 ? Math.round((distM * 1000) / ticks) : 0;
}

/** Story 6.6 review L2: the charge shove's mm per tick — the Predictor tells a charge knock by it (`crossCheckBoss` keeps it unique). */
export function chargeKnockStepMm(balance: Readonly<Balance>): number {
  return knockStepMmOf(balance.boss.charge.shoveM, balance.boss.charge.shoveS);
}

/**
 * Story 6.6 (DD2): the knock along a given direction (dx, dy) — the charge's sideways shove, never
 * along the lane. Same fields and rules as `knockPlayerBy`. Never a downed or out player.
 */
export function knockPlayerDir(p: PlayerState, dx: number, dy: number, distM: number, durS: number): void {
  if (p.status !== "alive" || distM <= 0) return;
  const ticks = ticksFor(durS);
  if (ticks <= 0) return;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-9) return;
  p.knockTicks = ticks;
  p.knockDx = Math.round((dx / d) * KNOCK_DIR_SCALE) + 0; // + 0: never −0 on the wire
  p.knockDy = Math.round((dy / d) * KNOCK_DIR_SCALE) + 0;
  p.knockStepMm = Math.round((distM * 1000) / ticks);
}

/**
 * One tick of the knock for an alive player (`movePlayers`, shared with the Predictor). Returns
 * true when the knock moved the body this tick (the input move is then ignored).
 */
export function stepKnock(world: World, p: PlayerState): boolean {
  if (p.knockTicks <= 0) return false;
  p.knockTicks--;
  const dx = p.knockDx;
  const dy = p.knockDy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= 0 || p.knockStepMm <= 0) return true;
  const step = p.knockStepMm / 1000;
  const nx = p.x + (dx / len) * step;
  const ny = p.y + (dy / len) * step;
  const r = p.radiusM;
  let tx: number;
  let ty: number;
  if (hasObstacles(world)) {
    pushOutOfBuildings(world, nx, ny, r, p.x, p.y);
    tx = pushed.x;
    ty = pushed.y;
  } else {
    const { widthM, heightM } = world.map;
    tx = Math.min(widthM - r, Math.max(r, nx));
    ty = Math.min(heightM - r, Math.max(r, ny));
  }
  const fires = world.decay.fires;
  if (fires.length > 0 && circleInFire(fires, tx, ty, r) && !circleInFire(fires, p.x, p.y, r)) {
    p.knockTicks = 0; // F2: never pushed into fire: it stops at the edge
    return true;
  }
  p.x = tx;
  p.y = ty;
  return true;
}
