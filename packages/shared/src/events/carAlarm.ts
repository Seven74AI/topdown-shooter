import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { CoverObject, DistrictMap } from "../map/districtMap";
import { mutationApplies } from "../map/obstacles";
import { stageForWave } from "../decay/decayState";
import { requestLureFields, dropLureFields } from "../zombies/flowField";
import { ZOMBIE_STATE, isRushState } from "../zombies/zombieTypes";
import { segmentBoxEntryT } from "../combat/cover";
import { EVENT_PHASE, EVENT_KINDS } from "./eventState";
import { centre, setEventPhase, teamCentre, type EventModule } from "./common";

/**
 * Story 6.8 (FR38, D1–D3, CA3): the car alarm.
 *
 * - Candidates (F9): map `cover` cars active at the stage, still at their curb / lot spot (no
 *   `remove` mutation applied to them: a car moved into the road is a decay `add`, not a candidate)
 *   and never the target of an applied `ignite` (burning, or a burnt-out wreck).
 * - Pick (D1, stream `events`): among those whose centre is 8–25 m from the team centre; none →
 *   the nearest beyond 8 m; none → the farthest.
 * - ARMED 20 s: the first player bullet that reaches the car's body (`onSpecialShot`, F4) or the
 *   timer → ALARM 15 s: every zombie whose centre is within 15 m of the car at any tick is lured
 *   (`pool.lureTicks`) and walks to it by the lure fields (built during ARMED, DD3). Rushing zombies
 *   and stampede Runners are never lured (F5).
 */

/** Is cover object `c` a car-alarm candidate at (stage, variants)? No allocation. */
export function isAlarmCandidate(map: DistrictMap, c: CoverObject, stage: number, variants: number): boolean {
  if (c.kind !== "car" || c.minStage > stage) return false;
  const decay = map.decay;
  for (let i = 0; i < decay.length; i++) {
    const m = decay[i] as (typeof decay)[number];
    if ((m.action === "remove" || m.action === "ignite") && m.target === c.name && mutationApplies(m, stage, variants)) return false;
  }
  return true;
}

/** Candidates at (stage, variants) (tests; the module counts without allocating). */
export function alarmCandidates(map: DistrictMap, stage: number, variants: number): CoverObject[] {
  return map.cover.filter((c) => isAlarmCandidate(map, c, stage, variants));
}

function countCandidates(map: DistrictMap, stage: number, variants: number): number {
  let n = 0;
  for (let i = 0; i < map.cover.length; i++) if (isAlarmCandidate(map, map.cover[i] as CoverObject, stage, variants)) n++;
  return n;
}

const cx = (c: CoverObject): number => (c.minX + c.maxX) / 2;
const cy = (c: CoverObject): number => (c.minY + c.maxY) / 2;

/** D1: the car to arm (stream `events`), or null. Reads `centre` (the team centre). */
function pickCar(world: World): CoverObject | null {
  const map = world.map;
  const cfg = world.balance.events.carAlarm;
  const stage = world.decay.stage;
  const variants = world.decay.variants;
  const min2 = cfg.pickMinM * cfg.pickMinM;
  const max2 = cfg.pickMaxM * cfg.pickMaxM;
  let inRange = 0;
  let nearest: CoverObject | null = null;
  let nearestD2 = Infinity;
  let farthest: CoverObject | null = null;
  let farthestD2 = -1;
  for (let i = 0; i < map.cover.length; i++) {
    const c = map.cover[i] as CoverObject;
    if (!isAlarmCandidate(map, c, stage, variants)) continue;
    const dx = cx(c) - centre.x;
    const dy = cy(c) - centre.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min2 && d2 <= max2) inRange++;
    if (d2 >= min2 && d2 < nearestD2) {
      nearestD2 = d2;
      nearest = c;
    }
    if (d2 > farthestD2) {
      farthestD2 = d2;
      farthest = c;
    }
  }
  if (inRange === 0) return nearest ?? farthest;
  let k = world.streams.events.int(0, inRange - 1);
  for (let i = 0; i < map.cover.length; i++) {
    const c = map.cover[i] as CoverObject;
    if (!isAlarmCandidate(map, c, stage, variants)) continue;
    const dx = cx(c) - centre.x;
    const dy = cy(c) - centre.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < min2 || d2 > max2) continue;
    if (k-- === 0) return c;
  }
  return null; // unreachable
}

/**
 * F4 (shot hook, `combat/firing.ts`): the armed car's box for a player projectile's step, or false.
 * `specialShotBox` holds the box while it returns true.
 */
export function armedCarBox(world: Readonly<World>): boolean {
  const a = world.special.active;
  return a.kind === CAR_ALARM && a.phase === EVENT_PHASE.ARMED;
}

/**
 * F4: a player's projectile step (x0, y0) → (x1, y1) that stops at `stopT` (−1: it flies on) reaches
 * the armed car when it enters the car's box no later than where it stops (the car is a shot blocker,
 * so a bullet that hits the car stops exactly there). Sets the alarm off at once, credited to `ownerId`.
 */
export function carAlarmShot(world: World, x0: number, y0: number, x1: number, y1: number, stopT: number, ownerId: string | null): void {
  const car = world.special.carAlarm;
  const t = segmentBoxEntryT(x0, y0, x1 - x0, y1 - y0, car.minX, car.minY, car.maxX, car.maxY);
  if (t < 0 || (stopT >= 0 && t > stopT + 1e-9)) return;
  if (ownerId === null) return;
  car.shotBy = ownerId;
  world.special.log.alarmShotBy = ownerId;
  setEventPhase(world, EVENT_PHASE.ALARM, ownerId);
}

const CAR_ALARM = EVENT_KINDS.indexOf("car_alarm");

/** F5: marks every zombie within the pull radius (not rushing, not a stampede Runner) for the rest of the alarm. */
function lureNearby(world: World, ticksLeft: number): void {
  const z = world.zombies;
  const car = world.special.carAlarm;
  const ccx = (car.minX + car.maxX) / 2;
  const ccy = (car.minY + car.maxY) / 2;
  const r = world.balance.events.carAlarm.pullRadiusM;
  const r2 = r * r;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    const st = z.state[id] as number;
    if (isRushState(st) || st === ZOMBIE_STATE.STAMPEDE) {
      z.lureTicks[id] = 0;
      continue;
    }
    if ((z.lureTicks[id] as number) > 0) {
      z.lureTicks[id] = ticksLeft;
      continue;
    }
    const dx = (z.x[id] as number) - ccx;
    const dy = (z.y[id] as number) - ccy;
    if (dx * dx + dy * dy <= r2) z.lureTicks[id] = ticksLeft;
  }
}

function clearLure(world: World): void {
  const z = world.zombies;
  for (let i = 0; i < z.aliveCount; i++) z.lureTicks[z.aliveIds[i] as number] = 0;
}

export const carAlarmModule: EventModule = {
  kind: "car_alarm",
  fits(world, wave) {
    const stage = world.run.phase === "wave" && world.waves.number === wave ? world.decay.stage : stageForWave(world.balance, wave, world.debug.decayStageByWave);
    return countCandidates(world.map, stage, world.decay.variants) > 0;
  },
  start(world) {
    if (!teamCentre(world)) return false;
    const c = pickCar(world);
    if (!c) return false;
    const car = world.special.carAlarm;
    car.car = c.name;
    car.minX = c.minX;
    car.minY = c.minY;
    car.maxX = c.maxX;
    car.maxY = c.maxY;
    car.shotBy = null;
    const a = world.special.active;
    a.x = cx(c);
    a.y = cy(c);
    a.phase = EVENT_PHASE.ARMED;
    requestLureFields(world, c); // DD3: built inside the round-robin budget during the armed phase
    return true;
  },
  update(world) {
    const a = world.special.active;
    const cfg = world.balance.events.carAlarm;
    if (a.phase === EVENT_PHASE.ARMED) {
      if (world.tick - a.phaseTick >= ticksFor(cfg.armedS)) setEventPhase(world, EVENT_PHASE.ALARM, null);
      else return null;
    }
    const left = ticksFor(cfg.alarmS) - (world.tick - a.phaseTick);
    if (left <= 0) return "done";
    lureNearby(world, left);
    return null;
  },
  end(world) {
    clearLure(world);
    dropLureFields(world);
    const car = world.special.carAlarm;
    car.car = "";
    car.shotBy = null;
  },
  holdsWave() {
    return false; // D6: the alarm never holds a wave (it ends with it)
  },
};
