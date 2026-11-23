import type { Balance } from "../config/balance";
import type { World } from "../core/world";
import { activeSlot } from "../combat/loadout";
import type { PlayerInput } from "../net/input";
import type { PlayerState, PlayerStatus } from "../player/player";
import { MAX_PLAYERS } from "../net/messages";
import { MUZZLE_OFFSET_M } from "../config/constants";
import { zombieTypeOf } from "../zombies/zombiePool";
import { isRushState } from "../zombies/zombieTypes";

/**
 * A simple bot (Story 2.10, AC 5) for load tests (2.10), economy runs (3.10, 6.1) and balance
 * sweeps (10.8). Pure and deterministic: the same view gives the same input (no RNG, no clock),
 * and nothing is allocated per call. A view is built from a World (`botViewFromWorld`, headless
 * runs) or from net state (`tools/bots`, a real room).
 *
 * Decision order (the first that applies):
 * 1. a downed teammate within `reviveSearchM`: move to them, stop within `reviveStopM` (standing
 *    there revives them, Story 2.8);
 * 2. a zombie closer than `keepDistanceM`: back away from it;
 * 2b. (Story 5.6) the nearest zombie is a Spitter holding its spot just beyond my weapon's range (≤ `closeInExtraM` more): step toward it;
 * 3. farther than `regroupDistM` from the centre of the alive team: move toward it;
 * 4. otherwise stand still.
 *
 * Always: aim at the nearest zombie and fire while it is within the weapon's range. `isMouse` is
 * false, so the bot gets aim assist like a phone player. It never swaps. Ready is tapped by the
 * client (`lobby.set_ready`), not here. Story 3.10: `shoppingList` is bought in each build phase
 * by `bots/botShop.ts` (headless `botBuildPhase`, and `tools/bots` over the wire), not here.
 */

export interface BotSelf {
  x: number;
  y: number;
  status: PlayerStatus;
  /** Range of the active weapon (m). */
  rangeM: number;
  /**
   * Story 5.5: with a launcher in hand, its lob range and shortest lob (m) and the muzzle offset
   * (body radius + muzzle): the aim's length then carries the target's distance (FR-A). 0 = not a launcher.
   */
  lobRangeM: number;
  minLobM: number;
  muzzleM: number;
}

export interface BotMate {
  x: number;
  y: number;
  status: PlayerStatus;
}

export interface BotZombie {
  x: number;
  y: number;
  distM: number;
  /** Story 5.6 review M2: a stand-off zombie holding its spot (a Spitter, not rushing); false otherwise / unknown. */
  holdsSpot?: boolean;
}

/** What a bot can know. Preallocated by `createBotView`; filled in place each tick. */
export interface BotView {
  readonly self: BotSelf;
  /** Teammates `[0, teammateCount)`; the array keeps MAX_PLAYERS − 1 reusable entries. */
  readonly teammates: readonly BotMate[];
  teammateCount: number;
  /** Points at `zombie` when there is one, else null. */
  nearestZombie: BotZombie | null;
  /** Storage for the nearest zombie. */
  readonly zombie: BotZombie;
}

export interface BotConfig {
  keepDistanceM: number;
  /** Story 5.6: close in on a nearest zombie up to this far beyond my range (0: never). */
  closeInExtraM?: number;
  regroupDistM: number;
  reviveSearchM: number;
  reviveStopM: number;
  /** Story 3.10: shop item ids bought in this order in each build phase (`bots/botShop.ts`). */
  shoppingList?: readonly string[];
}

/** The bot numbers from `config/balance/bots.json`. */
export const botConfigOf = (balance: Balance): BotConfig => balance.bots;

export function createBotView(): BotView {
  const teammates: BotMate[] = [];
  for (let i = 0; i < MAX_PLAYERS - 1; i++) teammates.push({ x: 0, y: 0, status: "alive" });
  return {
    self: { x: 0, y: 0, status: "alive", rangeM: 0, lobRangeM: 0, minLobM: 0, muzzleM: 0 },
    teammates,
    teammateCount: 0,
    nearestZombie: null,
    zombie: { x: 0, y: 0, distM: 0, holdsSpot: false },
  };
}

/** Writes the move (a unit vector toward (dx, dy), or still) into `out`. */
function moveToward(out: PlayerInput, dx: number, dy: number): void {
  const d = Math.hypot(dx, dy);
  if (d === 0) {
    out.moveX = 0;
    out.moveY = 0;
    return;
  }
  out.moveX = dx / d;
  out.moveY = dy / d;
}

/** One tick's input for a bot. `seq` is the input's sequence number (one higher per tick). */
export function botInput(view: BotView, cfg: BotConfig, seq: number, out: PlayerInput): void {
  out.seq = seq;
  out.moveX = 0;
  out.moveY = 0;
  out.aimX = 0;
  out.aimY = 0;
  out.fire = false;
  out.swap = false;
  out.consumable = false;
  out.isMouse = false;
  const me = view.self;
  if (me.status !== "alive") return; // downed or out: nothing to do

  const z = view.nearestZombie;
  if (z) {
    const dx = z.x - me.x;
    const dy = z.y - me.y;
    const d = Math.hypot(dx, dy);
    if (d > 0) {
      // Story 5.5: a launcher lobs to the target's distance (from the muzzle, clamped to its lob range).
      const len = me.lobRangeM > 0 ? Math.min(1, Math.max(me.minLobM / me.lobRangeM, (d - me.muzzleM) / me.lobRangeM)) : 1;
      out.aimX = (dx / d) * len;
      out.aimY = (dy / d) * len;
      out.fire = z.distM <= me.rangeM;
    }
  }

  // 1. Revive the nearest downed teammate in reach.
  let best = -1;
  let bestD2 = cfg.reviveSearchM * cfg.reviveSearchM;
  let cx = me.x;
  let cy = me.y;
  let alive = 1;
  for (let i = 0; i < view.teammateCount; i++) {
    const m = view.teammates[i] as BotMate;
    if (m.status === "alive") {
      cx += m.x;
      cy += m.y;
      alive++;
      continue;
    }
    if (m.status !== "downed") continue;
    const dx = m.x - me.x;
    const dy = m.y - me.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  if (best >= 0) {
    const m = view.teammates[best] as BotMate;
    if (bestD2 > cfg.reviveStopM * cfg.reviveStopM) moveToward(out, m.x - me.x, m.y - me.y);
    return;
  }

  // 2. Back away from a zombie that is too close.
  if (z && z.distM < cfg.keepDistanceM) {
    moveToward(out, me.x - z.x, me.y - z.y);
    return;
  }

  // 2b. Story 5.6 (review M2): the nearest zombie is a Spitter holding its spot just out of my range
  // (6 m vs the 5 m Shotgun): step toward it so I can shoot back. Never for walking zombies.
  const extra = cfg.closeInExtraM ?? 0;
  if (z && z.holdsSpot === true && extra > 0 && z.distM > me.rangeM && z.distM <= me.rangeM + extra) {
    moveToward(out, z.x - me.x, z.y - me.y);
    return;
  }

  // 3. Regroup toward the centre of the alive team (me included).
  cx /= alive;
  cy /= alive;
  const gx = cx - me.x;
  const gy = cy - me.y;
  if (gx * gx + gy * gy > cfg.regroupDistM * cfg.regroupDistM) moveToward(out, gx, gy);
  // 4. Otherwise stand still.
}

/** The fill in progress (synchronous, so one shared record is enough: no closure per call). */
const fill: { view: BotView | null; selfId: string } = { view: null, selfId: "" };

function visitMate(p: PlayerState): void {
  const v = fill.view;
  if (!v || p.id === fill.selfId || v.teammateCount >= v.teammates.length) return;
  const m = v.teammates[v.teammateCount++] as BotMate;
  m.x = p.x;
  m.y = p.y;
  m.status = p.status;
}

/** Fills `out` from a World (headless bots). A missing player reads as "out" with no zombie. */
export function botViewFromWorld(world: World, playerId: string, out: BotView): void {
  out.teammateCount = 0;
  out.nearestZombie = null;
  const p = world.players.get(playerId);
  const self = out.self;
  if (!p) {
    self.status = "out";
    return;
  }
  self.x = p.x;
  self.y = p.y;
  self.status = p.status;
  const stats = world.balance.weapons[activeSlot(p.loadout).weapon];
  self.rangeM = stats?.rangeM ?? 0;
  self.lobRangeM = stats?.kind === "launcher" ? stats.lobRangeM : 0; // Story 5.5
  self.minLobM = stats?.kind === "launcher" ? stats.minLobM : 0;
  self.muzzleM = p.radiusM + MUZZLE_OFFSET_M;
  fill.view = out;
  fill.selfId = playerId;
  world.players.forEach(visitMate);
  fill.view = null;
  const zs = world.zombies;
  let bestD2 = Infinity;
  let bx = 0;
  let by = 0;
  let bid = -1;
  for (let i = 0; i < zs.aliveCount; i++) {
    const id = zs.aliveIds[i] as number;
    const dx = (zs.x[id] as number) - p.x;
    const dy = (zs.y[id] as number) - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bx = zs.x[id] as number;
      by = zs.y[id] as number;
      bid = id;
    }
  }
  if (bestD2 < Infinity) {
    out.zombie.x = bx;
    out.zombie.y = by;
    out.zombie.distM = Math.sqrt(bestD2);
    // Review M2: a Spitter holds its spot unless it rushes (FR30: then it walks in between spits).
    out.zombie.holdsSpot = world.balance.zombies.types[zombieTypeOf(zs, bid)]?.spit !== undefined && !isRushState(zs.state[bid] as number);
    out.nearestZombie = out.zombie;
  }
}
