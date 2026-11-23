import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { PlayerState } from "./player";
import { spectateTarget } from "./spectate";
import { findFreeSpotNear, spotBlocked } from "./freeSpot";
import { teamSpawnPoint } from "./spawn";
import { reviveTicksFor } from "../economy/gear";

/**
 * Downed, revive, out and team wipe (Story 2.8, FR10/FR11). Every timer counts ticks.
 *
 * - Alive → downed: `downPlayer` (called by the zombie hit at 0 HP).
 * - Downed: the nearest standing teammate within `reviveRadiusM` revives; `reviveTicks` counts up
 *   while one stays in reach and resets to 0 when no one is. **The countdown pauses while a revive
 *   is in progress** (designer decision 2026-11-21) and runs when none is; at 0 the player is out.
 * - Downed / out → alive: `returnOutPlayers`, at the start of every build phase (Story 3.1, called by
 *   the run state machine's `startBuild`), with the build heal for everyone.
 * - Team wipe: no one standing → `team.wiped` once (`world.teamWiped`); nothing changes after that.
 */

/** Players in id order this tick (reused: ≤ 4 players, insertion sort, no allocation). */
const ordered: PlayerState[] = [];
const pushPlayer = (p: PlayerState): void => {
  ordered.push(p);
};

function collectInIdOrder(world: Readonly<World>): void {
  ordered.length = 0;
  world.players.forEach(pushPlayer);
  for (let i = 1; i < ordered.length; i++) {
    const p = ordered[i] as PlayerState;
    let j = i - 1;
    while (j >= 0 && (ordered[j] as PlayerState).id > p.id) {
      ordered[j + 1] = ordered[j] as PlayerState;
      j--;
    }
    ordered[j + 1] = p;
  }
}

/** The search in progress (synchronous, so one shared record is enough: no closure per call). */
const reach: { downed: PlayerState | null; r2: number; best: PlayerState | null; bestD2: number; gear: number } = {
  downed: null,
  r2: 0,
  best: null,
  bestD2: Infinity,
  gear: 0,
};

function visitReviver(p: PlayerState): void {
  const d = reach.downed;
  if (!d || p === d || p.status !== "alive") return;
  const dx = p.x - d.x;
  const dy = p.y - d.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > reach.r2) return;
  reach.gear |= p.gear; // Story 5.11 review L1: every reviver's kit counts (the fastest wins)
  // Nearest wins; on a tie the lower id (= lower slot), so the result never depends on Map order.
  if (d2 < reach.bestD2 || (d2 === reach.bestD2 && reach.best !== null && p.id < reach.best.id)) {
    reach.best = p;
    reach.bestD2 = d2;
  }
}

/**
 * The nearest standing teammate whose centre is within `reviveRadiusM` of the downed player's
 * centre, or null. Two revivers count as one. The client mirror uses it too (the "Reviving…" line).
 */
export function findReviver(world: Readonly<World>, downed: PlayerState): PlayerState | null {
  const r = world.balance.player.reviveRadiusM;
  reach.downed = downed;
  reach.r2 = r * r;
  reach.best = null;
  reach.bestD2 = Infinity;
  reach.gear = 0;
  world.players.forEach(visitReviver);
  const best = reach.best;
  reach.downed = null;
  reach.best = null;
  return best;
}

/** Alive → downed at 0 HP: starts the countdown, emits `player.downed`, and checks for a wipe. */
export function downPlayer(world: World, p: PlayerState): void {
  if (p.status !== "alive") return;
  p.status = "downed";
  p.hp = 0;
  p.downedTicksLeft = ticksFor(world.balance.player.downedS);
  p.reviveTicks = 0;
  p.reviverId = null;
  p.reviveNeedTicks = 0;
  world.events.emit({ type: "player.downed", playerId: p.id });
  checkTeamWipe(world); // solo: going down ends the run on the same tick
}

/** The return spot (reused). */
const spot = { x: 0, y: 0 };

/** Heals a standing player by `amount`, capped at max HP (module-level: no closure per call). */
let healAmountFrac = 0;
const healStanding = (p: PlayerState): void => {
  if (p.status === "alive") p.hp = Math.min(p.maxHp, p.hp + p.maxHp * healAmountFrac);
};

/**
 * Story 3.1, at the start of every build phase (FR9, FR10): every standing player is healed by
 * `buildHealFrac` of max HP (capped at max); then each downed or out player, in id order, returns
 * standing next to the lowest-slot standing teammate on the first free spot (`findFreeSpotNear`,
 * retro A12: no map edge, player or zombie overlap; buildings from Story 3.4; map boxes from 4.1),
 * or, if every spot is taken, `returnSpot`'s wider fallbacks (never inside a box: 4.1 review L4),
 * with `buildHealFrac` of max HP, and `player.returned` is emitted. With no one standing nobody returns (that is a wipe,
 * and no build phase starts).
 */
/**
 * Story 4.1 review L4: where a returning player goes, into `spot`, in this order: the first free spot
 * in `returnSearchRings` rings round the teammate; in `returnWideSearchRings` rings; the team starts
 * (slots 0–3); the first spot in the wide rings clear of the map edge, map boxes and buildings
 * (overlapping bodies, which the push-outs separate); and, as a last resort, the teammate's own
 * spot (a standing body is outside every box). Never inside a map box or a building. Story 4.8
 * re-review H1: every step but the last also stays out of every burning fire zone (`spotBlocked` /
 * `findFreeSpotNear` are fire-aware), so a player returned beside a teammate M1 pushed to a fire's
 * ring is not put back into the fire.
 */
function returnSpot(world: World, p: PlayerState, tx: number, ty: number): void {
  const stats = world.balance.player;
  if (findFreeSpotNear(world, tx, ty, p, spot)) return;
  if (findFreeSpotNear(world, tx, ty, p, spot, stats.returnWideSearchRings)) return;
  for (let slot = 0; slot < 4; slot++) {
    teamSpawnPoint(world, slot, spot);
    if (!spotBlocked(world, spot.x, spot.y, p.radiusM, p)) return;
  }
  if (findFreeSpotNear(world, tx, ty, p, spot, stats.returnWideSearchRings, true)) return;
  spot.x = tx;
  spot.y = ty;
}

export function returnOutPlayers(world: World): void {
  const stats = world.balance.player;
  healAmountFrac = stats.buildHealFrac;
  world.players.forEach(healStanding);
  collectInIdOrder(world);
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i] as PlayerState;
    if (p.status !== "out" && p.status !== "downed") continue;
    const t = spectateTarget(world, p.id);
    if (!t) continue;
    returnSpot(world, p, t.x, t.y);
    const x = spot.x;
    const y = spot.y;
    p.x = x;
    p.y = y;
    p.prevX = x;
    p.prevY = y;
    p.hp = Math.min(p.maxHp, p.maxHp * stats.buildHealFrac);
    p.status = "alive";
    p.downedTicksLeft = 0;
    p.reviveTicks = 0;
    p.reviverId = null;
    p.reviveNeedTicks = 0;
    world.events.emit({ type: "player.returned", playerId: p.id, x, y });
  }
}

/** Alive count via a module-level callback (no iterator per tick). */
let aliveCount = 0;
const countAlive = (p: PlayerState): void => {
  if (p.status === "alive") aliveCount++;
};

/** No one standing (everyone downed or out): `team.wiped` exactly once. */
export function checkTeamWipe(world: World): void {
  if (world.teamWiped || world.players.size === 0) return;
  aliveCount = 0;
  world.players.forEach(countAlive);
  if (aliveCount > 0) return;
  world.teamWiped = true;
  world.events.emit({ type: "team.wiped", wave: world.waves.number });
}

/**
 * Downed countdowns and revives (players in id order), then the wipe check. Runs at
 * the end of the player system every tick, so the order inside a tick stays fixed. Does nothing
 * after a wipe: the run is over.
 */
export function updateDowned(world: World): void {
  if (world.teamWiped) return;
  const stats = world.balance.player;
  collectInIdOrder(world);
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i] as PlayerState;
    if (p.status !== "downed") continue;
    const reviver = findReviver(world, p);
    if (reviver) {
      p.reviveTicks++;
      p.reviverId = reviver.id;
      // Story 5.11 (D1, review L1): the time needed is the fastest kit among ALL revivers in reach
      // (still one revive, no stacking: two kits = 30 ticks); progress is kept when revivers
      // change, so a kit owner stepping in finishes a half-done revive.
      p.reviveNeedTicks = reviveTicksFor(world.balance, reach.gear);
      if (p.reviveTicks >= p.reviveNeedTicks) {
        p.status = "alive";
        p.hp = Math.ceil(p.maxHp * stats.reviveHpFrac);
        p.downedTicksLeft = 0;
        p.reviveTicks = 0;
        p.reviverId = null;
        p.reviveNeedTicks = 0;
        world.events.emit({ type: "player.revived", playerId: p.id, reviverId: reviver.id });
      }
      continue; // the countdown pauses while a revive is in progress
    }
    p.reviveTicks = 0; // moving away resets the revive
    p.reviverId = null;
    p.reviveNeedTicks = 0;
    p.downedTicksLeft--;
    if (p.downedTicksLeft <= 0) {
      p.downedTicksLeft = 0;
      p.status = "out";
      world.events.emit({ type: "player.out", playerId: p.id });
    }
  }
  checkTeamWipe(world);
}
