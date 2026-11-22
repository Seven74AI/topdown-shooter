import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { PlayerState } from "./player";
import { spectateTarget } from "./spectate";

/**
 * Downed, revive, out and team wipe (Story 2.8, FR10/FR11). Every timer counts ticks.
 *
 * - Alive → downed: `downPlayer` (called by the zombie hit at 0 HP).
 * - Downed: the nearest standing teammate within `reviveRadiusM` revives; `reviveTicks` counts up
 *   while one stays in reach and resets to 0 when no one is. **The countdown pauses while a revive
 *   is in progress** (designer decision 2026-11-21) and runs when none is; at 0 the player is out.
 * - Out → alive: `returnOutPlayers`, at the first tick of a later wave (Story 3.1 moves this to the
 *   Build start).
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
const reach: { downed: PlayerState | null; r2: number; best: PlayerState | null; bestD2: number } = {
  downed: null,
  r2: 0,
  best: null,
  bestD2: Infinity,
};

function visitReviver(p: PlayerState): void {
  const d = reach.downed;
  if (!d || p === d || p.status !== "alive") return;
  const dx = p.x - d.x;
  const dy = p.y - d.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > reach.r2) return;
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
  world.events.emit({ type: "player.downed", playerId: p.id });
  checkTeamWipe(world); // solo: going down ends the run on the same tick
}

/**
 * Out players come back at the first tick of a later wave than the one they went out in, next to
 * the lowest-slot standing teammate (+x by `spawnOffsetM`, or −x near the right edge, clamped to the
 * map) with `returnHpFrac` of max HP. With no one standing nobody returns (that is a wipe).
 * Story 3.1 calls this from the Build start instead.
 */
export function returnOutPlayers(world: World): void {
  const w = world.waves;
  if (w.phase !== "active") return;
  collectInIdOrder(world);
  const stats = world.balance.player;
  const { widthM, heightM } = world.map;
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i] as PlayerState;
    if (p.status !== "out" || w.number <= p.outSinceWave) continue;
    const t = spectateTarget(world, p.id);
    if (!t) continue;
    const r = p.radiusM;
    let x = t.x + stats.spawnOffsetM;
    if (x > widthM - r) x = t.x - stats.spawnOffsetM;
    x = Math.min(widthM - r, Math.max(r, x));
    const y = Math.min(heightM - r, Math.max(r, t.y));
    p.x = x;
    p.y = y;
    p.prevX = x;
    p.prevY = y;
    p.hp = Math.ceil(p.maxHp * stats.returnHpFrac);
    p.status = "alive";
    p.downedTicksLeft = 0;
    p.reviveTicks = 0;
    p.reviverId = null;
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
 * Downed countdowns and revives (players in id order), then returns, then the wipe check. Runs at
 * the end of the player system every tick, so the order inside a tick stays fixed. Does nothing
 * after a wipe: the run is over.
 */
export function updateDowned(world: World): void {
  if (world.teamWiped) return;
  const stats = world.balance.player;
  const reviveTicks = ticksFor(stats.reviveS);
  collectInIdOrder(world);
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i] as PlayerState;
    if (p.status !== "downed") continue;
    const reviver = findReviver(world, p);
    if (reviver) {
      p.reviveTicks++;
      p.reviverId = reviver.id;
      if (p.reviveTicks >= reviveTicks) {
        p.status = "alive";
        p.hp = Math.ceil(p.maxHp * stats.reviveHpFrac);
        p.downedTicksLeft = 0;
        p.reviveTicks = 0;
        p.reviverId = null;
        world.events.emit({ type: "player.revived", playerId: p.id, reviverId: reviver.id });
      }
      continue; // the countdown pauses while a revive is in progress
    }
    p.reviveTicks = 0; // moving away resets the revive
    p.reviverId = null;
    p.downedTicksLeft--;
    if (p.downedTicksLeft <= 0) {
      p.downedTicksLeft = 0;
      p.status = "out";
      p.outSinceWave = world.waves.number;
      world.events.emit({ type: "player.out", playerId: p.id });
    }
  }
  returnOutPlayers(world);
  checkTeamWipe(world);
}
