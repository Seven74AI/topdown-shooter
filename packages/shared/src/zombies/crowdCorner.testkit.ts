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
  /** "id@tick (x, y) in <box>" for every body that ended a tick inside a solid (from the end of tick 1 on; first 20). */
  inside: string[];
  /** Ticks the longest-standing body stood still (< `STILL_M`) while neither attacking nor held, and which body. */
  longestStill: number;
  longestStillId: number;
  /** Bodies still alive at the bound (counted only when `untilGone`). */
  left: number;
  /** Bloaters among `ids` still alive at the bound (whatever `untilGone`). */
  bloatersLeft: number;
  /** Alive body-ticks, and how many were exempt from the still rule as crowd-held (the check's reach). */
  bodyTicks: number;
  heldTicks: number;
  /** The longest run of consecutive held ticks of any one body. */
  longestHeld: number;
  /** Bodies that never reached a standing player (touched one, wound up on one or swelled) before the bound. */
  notReached: number;
  /** Bodies alive at the bound whose closest approach to a standing player broke `approachOk` (first 10: "id start→closest"). */
  farFrom: string[];
  ticks: number;
}

export interface CrowdOptions {
  /** Stop when every body in `ids` is gone. */
  untilGone?: boolean;
  /** A body's progress rule from its start and closest distance to a standing player (default: none). */
  approachOk?: (startM: number, closestM: number) => boolean;
}

/**
 * Steps the World until every zombie in `ids` is gone (`untilGone`) or `boundTicks`. Every tick (after
 * the first: a dev spawn may have put a centre inside a solid, and the first push-out must take it
 * out), no alive zombie may overlap a map solid or a wall building.
 *
 * The still rule: a body's stretch counts up while it moves less than `STILL_M` from its anchor, is not
 * attacking (swelling, winding up, touching a standing player) and is not held by the crowd. Held means
 * linked, through bodies within `QUEUE_SLACK_M` of touching each other, to a FREE body: one that is
 * attacking or moved on this tick. So two wedged bodies can't vouch for each other: a jam with nothing
 * free in it counts (Story 6.13 AC 3: a body held back by a crowd that is getting somewhere is not a
 * stall). The result also reports held ticks, the longest held run, reach and approach.
 */
export function runCrowd(world: World, ids: readonly number[], boundTicks: number, opts: CrowdOptions = {}): CrowdResult {
  const z = world.zombies;
  const n = ids.length;
  const gen = ids.map((id) => z.generation[id] as number);
  const ax = ids.map((id) => z.x[id] as number);
  const ay = ids.map((id) => z.y[id] as number);
  const start = ids.map((id) => playerDistance(world, z.x[id] as number, z.y[id] as number));
  const closest = start.slice();
  const still = new Int32Array(n);
  const heldRun = new Int32Array(n);
  const reached = new Uint8Array(n);
  const alive = new Uint8Array(n);
  const free = new Uint8Array(n);
  const held = new Uint8Array(n);
  const moved = new Uint8Array(n);
  const slotOf = new Map<number, number>(ids.map((id, k) => [id, k]));
  const queue = new Int32Array(n);
  const inside: string[] = [];
  let longestStill = 0;
  let longestStillId = -1;
  let longestHeld = 0;
  let bodyTicks = 0;
  let heldTicks = 0;
  let ticks = 0;
  for (let tick = 1; tick <= boundTicks; tick++) {
    step(world, TICK_DT_S);
    ticks = tick;
    let aliveCount = 0;
    // Pass 1: alive, inside, attacking / moved (the free bodies), reach and approach.
    for (let k = 0; k < n; k++) {
      const id = ids[k] as number;
      alive[k] = isZombieAlive(z, id) && z.generation[id] === gen[k] ? 1 : 0;
      free[k] = 0;
      held[k] = 0;
      moved[k] = 0;
      if (alive[k] === 0) continue;
      aliveCount++;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      const r = radiusOf(world, id);
      const box = insideBox(world, x, y, r);
      if (box && inside.length < 20) inside.push(`${id}@${tick} (${x.toFixed(2)}, ${y.toFixed(2)}) in ${box}`);
      const attacking = z.state[id] === ZOMBIE_STATE.SWELL || isWindupState(z.state[id] as number) || touchingPlayer(world, x, y, r);
      if (attacking) reached[k] = 1;
      closest[k] = Math.min(closest[k] as number, playerDistance(world, x, y));
      moved[k] = Math.hypot(x - (ax[k] as number), y - (ay[k] as number)) >= STILL_M ? 1 : 0;
      free[k] = attacking || moved[k] === 1 ? 1 : 0;
    }
    // Pass 2: held = linked to a free body through touching bodies (breadth-first from the free ones).
    let qh = 0;
    let qt = 0;
    for (let k = 0; k < n; k++) if (free[k] === 1) queue[qt++] = k;
    while (qh < qt) {
      const k = queue[qh++] as number;
      const id = ids[k] as number;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      const r = radiusOf(world, id);
      const m = queryRadius(world.zombieGrid, z.x, z.y, x, y, r + MAX_R + 0.3 + QUEUE_SLACK_M, near);
      for (let q = 0; q < m; q++) {
        const j = near[q] as number;
        const kj = slotOf.get(j);
        if (kj === undefined || alive[kj] === 0 || free[kj] === 1 || held[kj] === 1) continue;
        if (Math.hypot((z.x[j] as number) - x, (z.y[j] as number) - y) > r + radiusOf(world, j) + QUEUE_SLACK_M) continue;
        held[kj] = 1;
        queue[qt++] = kj;
      }
    }
    // Pass 3: the still and held counters.
    for (let k = 0; k < n; k++) {
      if (alive[k] === 0) continue;
      const id = ids[k] as number;
      bodyTicks++;
      if (held[k] === 1) {
        heldTicks++;
        heldRun[k] = (heldRun[k] as number) + 1;
        longestHeld = Math.max(longestHeld, heldRun[k] as number);
      } else {
        heldRun[k] = 0;
      }
      if (free[k] === 1 || held[k] === 1) {
        if (moved[k] === 1 || free[k] === 1 || held[k] === 1) {
          ax[k] = z.x[id] as number;
          ay[k] = z.y[id] as number;
        }
        still[k] = 0;
      } else {
        still[k] = (still[k] as number) + 1;
        if ((still[k] as number) > longestStill) {
          longestStill = still[k] as number;
          longestStillId = id;
        }
      }
    }
    if (opts.untilGone && aliveCount === 0) break;
  }
  let left = 0;
  let bloatersLeft = 0;
  let notReached = 0;
  const farFrom: string[] = [];
  for (let k = 0; k < n; k++) {
    const id = ids[k] as number;
    if (reached[k] === 0) notReached++;
    if (!isZombieAlive(z, id) || z.generation[id] !== gen[k]) continue; // gone (burst, or killed by a blast): no progress to judge
    if (opts.approachOk && !opts.approachOk(start[k] as number, closest[k] as number) && farFrom.length < 10) farFrom.push(`${id} ${(start[k] as number).toFixed(2)}→${(closest[k] as number).toFixed(2)}`);
    left++;
    if (z.type[id] === BLOATER) bloatersLeft++;
  }
  return { inside, longestStill, longestStillId, left: opts.untilGone ? left : 0, bloatersLeft, bodyTicks, heldTicks, longestHeld, notReached, farFrom, ticks };
}

const near = new Int32Array(512);
/** A queued body keeps this much space to the one ahead (the soft separation's push leaves a gap). */
const QUEUE_SLACK_M = 0.25;
const MAX_R = Math.max(...Object.values(balance.zombies.types).map((t) => t?.radiusM ?? 0));

function radiusOf(world: World, id: number): number {
  return world.balance.zombies.types[ZOMBIE_TYPES[world.zombies.type[id] as number] as string]?.radiusM ?? 0;
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
