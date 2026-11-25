import type { World } from "../core/world";
import { queryRadius } from "../core/spatialGrid";
import { distanceToBox } from "../buildings/collision";
import { applyZombieDamage, damagePlayerBy } from "../combat/damage";
import { zombieCandidates as candidates } from "../combat/scratch";
import type { MapBox } from "../map/districtMap";
import type { PlayerState } from "../player/player";
import { FLOW_UNREACHED, flowCellAt } from "../zombies/flowField";
import { isZombieAlive } from "../zombies/zombiePool";
import { BOSS_ATTACK, BOSS_THROW_SRC } from "./bossState";
import { bossStats } from "./telegraph";

/**
 * Story 6.6 (F7, F8, D5, D7, DD4, DD5): the Behemoth's throw.
 *
 * - Target: the farthest standing player more than `throw.minM` (8 m) from its centre, or more than
 *   `unreachableMinM` (4.5 m) when it cannot walk to them (D5: their spot is a wall on the boss grid
 *   — an alley narrower than its body — or they are its target and its field doesn't reach them).
 * - The landing spot is that player's position at the start (F7: no lead, never follows).
 * - Lift `liftS` (TELEGRAPH), then the chunk flies `flightS` while the boss recovers; the attack stays
 *   live until the impact (DD4: one attack at a time includes a chunk in flight).
 * - Impact: standing players whose centre is inside `radiusM − edgeGraceM` take `damage` through
 *   cover (Q8); zombie centres inside `radiusM` take `zombieDamage` (no pay). No collision, building
 *   or nav change (F8): only `boss.thrown_impact` (crater decal on the client).
 */

/** The boss can't walk to `p` (D5). */
export function bossCantReach(world: Readonly<World>, p: Readonly<PlayerState>): boolean {
  const nav = world.pathing.boss;
  if (nav.cells <= 1) return false;
  if ((nav.wallAt[flowCellAt(nav, p.x, p.y)] as number) !== 0) return true; // its body can't stand there
  const f = world.pathing.bossChase;
  if (f.seedOnly !== p.id || f.sourceTick < 0) return false;
  if (f.frontFar) return true; // the fallback field is up: the normal one didn't reach it
  const c = flowCellAt(nav, world.boss.x, world.boss.y);
  return (f.front[c] as number) >= FLOW_UNREACHED;
}

/** `pickThrowTarget` pass (review N1: a module callback, no iterator allocated per WALK tick). */
const pick = { world: null as Readonly<World> | null, best: null as PlayerState | null, bestD2: -1 };
const pickOne = (p: PlayerState): void => {
  const world = pick.world as Readonly<World>;
  if (p.status !== "alive") return; // F10
  const b = world.boss;
  const t = world.balance.boss.throw;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const d2 = dx * dx + dy * dy;
  const ok = d2 > t.minM * t.minM || (d2 > t.unreachableMinM * t.unreachableMinM && bossCantReach(world, p));
  if (!ok || d2 <= pick.bestD2) return;
  pick.bestD2 = d2;
  pick.best = p;
};

/** AC 5: the throw's target (null: nobody qualifies). Ties: the first in `world.players` order. */
export function pickThrowTarget(world: Readonly<World>): PlayerState | null {
  pick.world = world;
  pick.best = null;
  pick.bestD2 = -1;
  world.players.forEach(pickOne);
  const best = pick.best;
  pick.world = null;
  pick.best = null;
  return best;
}

/** `throwSource` result (reused). */
export const throwSrc = { src: 0, x: 0, y: 0 };

/** Map boxes that are rubble (Story 6.2 names its boxes `rubble_*`): looks only. */
const isRubble = (b: MapBox): boolean => b.name.startsWith("rubble");

/**
 * D7 (visual only): the nearest rubble box or burnt car (a `decay.fireSlots` record that is burning
 * or burned out) within `sourceRangeM` of its body edge; else the road under it.
 */
export function throwSource(world: Readonly<World>): typeof throwSrc {
  const b = world.boss;
  const R = world.balance.boss.radiusM;
  const range = world.balance.boss.throw.sourceRangeM;
  throwSrc.src = BOSS_THROW_SRC.ROAD;
  throwSrc.x = b.x;
  throwSrc.y = b.y;
  let best = range;
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i] as MapBox;
    if (!isRubble(s)) continue;
    const d = distanceToBox(b.x, b.y, s.minX, s.minY, s.maxX, s.maxY) - R;
    if (d <= best) {
      best = d;
      throwSrc.src = BOSS_THROW_SRC.RUBBLE;
      throwSrc.x = Math.min(s.maxX, Math.max(s.minX, b.x));
      throwSrc.y = Math.min(s.maxY, Math.max(s.minY, b.y));
    }
  }
  const slots = world.decay.fireSlots;
  const fires = world.decay.fires;
  for (let i = 0; i < slots.length; i++) {
    const f = slots[i] as (typeof slots)[number];
    const lit = fires.includes(f) || (world.decay.firesOut & (1 << i)) !== 0;
    if (!lit) continue;
    const d = Math.sqrt((f.x - b.x) ** 2 + (f.y - b.y) ** 2) - R;
    if (d <= best) {
      best = d;
      throwSrc.src = BOSS_THROW_SRC.CAR;
      throwSrc.x = f.x;
      throwSrc.y = f.y;
    }
  }
  return throwSrc;
}

/** The lift is over: the chunk leaves its hands (lands at `hitTick`). */
export function releaseThrow(world: World): void {
  world.boss.attack.travelled = 1;
  bossStats.throws++;
}

const impact = { world: null as World | null };
const impactPlayer = (p: PlayerState): void => {
  const world = impact.world as World;
  if (p.status !== "alive") return; // F10
  const a = world.boss.attack;
  const r = a.radiusM - world.balance.boss.edgeGraceM;
  if (r <= 0) return;
  const dx = p.x - a.cx;
  const dy = p.y - a.cy;
  if (dx * dx + dy * dy > r * r) return; // F7: 2.75 m, the newest position (F4), through cover (Q8)
  if (damagePlayerBy(world, p, world.balance.boss.throw.damage, "boss", null) > 0) bossStats.throwPlayerHits++;
};

/** A chunk in flight lands on its `hitTick` (any boss state; 6.7: never after its death). */
export function updateThrowFlight(world: World): void {
  const a = world.boss.attack;
  if (!a.live || a.kind !== BOSS_ATTACK.THROW || a.travelled !== 1 || world.tick < a.hitTick) return;
  a.live = false;
  impact.world = world;
  world.players.forEach(impactPlayer);
  impact.world = null;
  const dmg = world.balance.boss.throw.zombieDamage;
  if (dmg > 0) {
    const z = world.zombies;
    const n = queryRadius(world.zombieGrid, z.x, z.y, a.cx, a.cy, a.radiusM, candidates);
    for (let k = 0; k < n; k++) {
      const id = candidates[k] as number;
      if (!isZombieAlive(z, id)) continue;
      const dx = (z.x[id] as number) - a.cx;
      const dy = (z.y[id] as number) - a.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > a.radiusM * a.radiusM) continue;
      const d = Math.sqrt(d2);
      bossStats.throwZombieHits++;
      applyZombieDamage(world, id, dmg, d > 1e-6 ? dx / d : 1, d > 1e-6 ? dy / d : 0, 0, null, "boss"); // D4: no pay
    }
  }
  world.events.emit({ type: "boss.thrown_impact", attackId: a.id, x: a.cx, y: a.cy });
}
