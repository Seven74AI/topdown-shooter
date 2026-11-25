import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { queryRadius } from "../core/spatialGrid";
import { ticksFor } from "../core/time";
import { step, type World } from "../core/world";
import { isZombieAlive } from "./zombiePool";
import { ZOMBIE_STATE, ZOMBIE_TYPES, isWindupState, zombieTypeIndex } from "./zombieTypes";
import { STILL_M, STILL_S, insideBox } from "./wideBody.testkit";

/**
 * Fix bloater-car-corner (2026-11-25): a crowd of zombies (wide bodies included) run against a concave
 * corner made by two solids, checked every tick (shared by `carCorner.test.ts` and `wideBody.fuzz.test.ts`;
 * test-only).
 */
const balance = loadBalance();
const BLOATER = zombieTypeIndex("bloater");

export interface CrowdResult {
  /** "id@tick (x, y) in <box>" for every body that ended a tick inside a solid (from the end of tick 1 on). */
  inside: string[];
  /** Ticks the longest-standing body stood still (< `STILL_M`) while not attacking, and which body. */
  longestStill: number;
  longestStillId: number;
  /** Bodies still alive at the bound (counted only when `untilGone`). */
  left: number;
  /** Bloaters among `ids` still alive at the bound (whatever `untilGone`). */
  bloatersLeft: number;
  /** Alive body-ticks, and how many of them were exempt from the still rule as crowd-held (the check's reach). */
  bodyTicks: number;
  heldTicks: number;
  /** The largest, over the bodies, of each body's closest approach to a standing player (m): every body came this near. */
  farthestApproach: number;
  ticks: number;
}

/**
 * Steps the World until every zombie in `ids` is gone (`untilGone`) or `boundTicks`. Every tick (after
 * the first: a dev spawn may have put a centre inside a solid, and the first push-out must take it
 * out), no alive zombie may overlap a map solid or a wall building. Each zombie's still stretch counts
 * up while it moves less than `STILL_M` from its anchor and is not attacking (swelling, winding up, or
 * touching a standing player); it resets when it moves on.
 */
export function runCrowd(world: World, ids: readonly number[], boundTicks: number, untilGone: boolean): CrowdResult {
  const z = world.zombies;
  const gen = ids.map((id) => z.generation[id] as number);
  const ax = ids.map((id) => z.x[id] as number);
  const ay = ids.map((id) => z.y[id] as number);
  const still = ids.map(() => 0);
  const approach = ids.map(() => Infinity);
  let bodyTicks = 0;
  let heldTicks = 0;
  const inside: string[] = [];
  let longestStill = 0;
  let longestStillId = -1;
  let ticks = 0;
  for (let tick = 1; tick <= boundTicks; tick++) {
    step(world, TICK_DT_S);
    ticks = tick;
    let alive = 0;
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k] as number;
      if (!isZombieAlive(z, id) || z.generation[id] !== gen[k]) continue;
      alive++;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      const r = balance.zombies.types[ZOMBIE_TYPES[z.type[id] as number] as string]?.radiusM ?? 0;
      const box = insideBox(world, x, y, r);
      if (box && inside.length < 20) inside.push(`${id}@${tick} (${x.toFixed(2)}, ${y.toFixed(2)}) in ${box}`);
      bodyTicks++;
      approach[k] = Math.min(approach[k] as number, playerDistance(world, x, y));
      let attacking = z.state[id] === ZOMBIE_STATE.SWELL || isWindupState(z.state[id] as number) || touchingPlayer(world, x, y, r);
      if (!attacking && heldByCrowd(world, id, x, y, r)) {
        attacking = true;
        heldTicks++;
      }
      if (attacking || Math.hypot(x - (ax[k] as number), y - (ay[k] as number)) >= STILL_M) {
        ax[k] = x;
        ay[k] = y;
        still[k] = 0;
      } else {
        still[k] = (still[k] as number) + 1;
        if ((still[k] as number) > longestStill) {
          longestStill = still[k] as number;
          longestStillId = id;
        }
      }
    }
    if (untilGone && alive === 0) return { inside, longestStill, longestStillId, left: 0, bloatersLeft: 0, bodyTicks, heldTicks, farthestApproach: farthest(approach), ticks };
  }
  let left = 0;
  let bloatersLeft = 0;
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k] as number;
    if (!isZombieAlive(z, id) || z.generation[id] !== gen[k]) continue;
    left++;
    if (z.type[id] === BLOATER) bloatersLeft++;
  }
  return { inside, longestStill, longestStillId, left: untilGone ? left : 0, bloatersLeft, bodyTicks, heldTicks, farthestApproach: farthest(approach), ticks };
}

const near = new Int32Array(512);
/** A queued body keeps this much space to the one ahead (the soft separation's push leaves a gap). */
const QUEUE_SLACK_M = 0.25;
/**
 * Crowd-held: another alive zombie is within `QUEUE_SLACK_M` of touching this one: it queues behind the
 * crowd, or the crowd behind it presses it on a wall (Story 6.13 AC 3: a body held back by a crowd is not a
 * stall; crowds jamming on a car face for over 4 s happen on master too, legal spawns only). The grid is
 * from the start of the tick: 0.3 m of query margin. A body with no zombie that near counts.
 */
function heldByCrowd(world: World, id: number, x: number, y: number, r: number): boolean {
  const z = world.zombies;
  const n = queryRadius(world.zombieGrid, z.x, z.y, x, y, r + MAX_R + 0.3, near);
  for (let k = 0; k < n; k++) {
    const j = near[k] as number;
    if (j === id || !isZombieAlive(z, j)) continue;
    const rj = balance.zombies.types[ZOMBIE_TYPES[z.type[j] as number] as string]?.radiusM ?? 0;
    if (Math.hypot((z.x[j] as number) - x, (z.y[j] as number) - y) <= r + rj + QUEUE_SLACK_M) return true;
  }
  return false;
}
const MAX_R = Math.max(...Object.values(balance.zombies.types).map((t) => t?.radiusM ?? 0));

function farthest(a: readonly number[]): number {
  let m = 0;
  for (const v of a) m = Math.max(m, v);
  return m;
}

function playerDistance(world: World, x: number, y: number): number {
  let best = Infinity;
  for (const p of world.players.values()) if (p.status === "alive") best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
}

function touchingPlayer(world: World, x: number, y: number, r: number): boolean {
  for (const p of world.players.values()) {
    if (p.status !== "alive") continue;
    if (Math.hypot(p.x - x, p.y - y) <= r + p.radiusM + 0.05) return true;
  }
  return false;
}

/** The fairness rule's bound in ticks (`STILL_S`). */
export const STILL_TICKS = ticksFor(STILL_S);
