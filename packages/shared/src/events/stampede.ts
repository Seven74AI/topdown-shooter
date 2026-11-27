import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { isGodFor } from "../core/god";
import type { MapBox, StampedeLane } from "../map/districtMap";
import { stageForWave } from "../decay/decayState";
import type { Building } from "../buildings/buildings";
import type { PlayerState } from "../player/player";
import { damagePlayerBy } from "../combat/damage";
import { maxAliveNow } from "../waves/waveDirector";
import { removeZombie, spawnZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";
import { EVENT_KINDS, EVENT_PHASE, type EventOutcome } from "./eventState";
import { centre, playerSlotIndex, playersInRun, setEventPhase, teamCentre, type EventModule } from "./common";

/**
 * Story 6.8 (FR41, D4, D5, D7, D11, ST1): the stampede.
 *
 * - Lane (D4, stream `events`): among the map's lanes open at the stage whose centre line passes
 *   within `laneNearTeamM` (10 m) of the team centre; none → the nearest lane.
 * - WARNING 3 s: rumble, dust at the start edge, amber chevrons (client). Nothing spawns (F1).
 * - RUNNING 10 s: 12 / 18 / 24 / 30 Runners (players in the run, downed too: D11) in rows of 6 every
 *   0.3 s across the lane's width at its start edge, not wave zombies, state STAMPEDE: they run along
 *   the lane at 5 m/s (`stampedeSteer`: no target, no flow field; cover in front pushes them aside),
 *   hit each standing player they touch once for 8 (`stampedeContact`, F7), never hit buildings.
 *   Normal spawns pause while any is alive; the stampede may go `overCap` (30) above the alive cap
 *   that applies (`maxAliveNow`: 150, 110 while the Behemoth lives; brief line 22).
 * - A Runner that leaves the far edge is removed (no reward); one that made < 0.5 m in 1 s, and every
 *   one left when the 10 s end, becomes a normal Runner of the wave (F8).
 * - The wave can't end while it runs (D6: `holdsWave`).
 */

const STAMPEDE = EVENT_KINDS.indexOf("stampede");
/** Geometry epsilon: spawn this far inside the start edge; a Runner this close to the far edge has left. */
const EDGE_EPS_M = 0.05;

export const laneAlongX = (l: StampedeLane): boolean => l.dir === "e" || l.dir === "w";
export const laneLength = (l: StampedeLane): number => (laneAlongX(l) ? l.maxX - l.minX : l.maxY - l.minY);
/** Progress of (x, y) along the lane from its start edge. */
export function laneAlong(l: StampedeLane, x: number, y: number): number {
  switch (l.dir) {
    case "e":
      return x - l.minX;
    case "w":
      return l.maxX - x;
    case "s":
      return y - l.minY;
    default:
      return l.maxY - y;
  }
}
const dirX = (l: StampedeLane): number => (l.dir === "e" ? 1 : l.dir === "w" ? -1 : 0);
const dirY = (l: StampedeLane): number => (l.dir === "s" ? 1 : l.dir === "n" ? -1 : 0);

export function laneOpen(l: StampedeLane, stage: number): boolean {
  return l.minStage <= stage && stage <= l.maxStage;
}

/** Distance from (x, y) to the lane's centre line. */
export function laneCentreDistance(l: StampedeLane, x: number, y: number): number {
  return laneAlongX(l) ? Math.abs(y - (l.minY + l.maxY) / 2) : Math.abs(x - (l.minX + l.maxX) / 2);
}

/** D4: the lane index to run (stream `events`), or −1. Reads `centre`. */
function pickLane(world: World): number {
  const lanes = world.map.stampedeLanes;
  const stage = world.decay.stage;
  const near = world.balance.events.stampede.laneNearTeamM;
  let inRange = 0;
  let best = Infinity;
  for (let i = 0; i < lanes.length; i++) {
    const l = lanes[i] as StampedeLane;
    if (!laneOpen(l, stage)) continue;
    const d = laneCentreDistance(l, centre.x, centre.y);
    if (d <= near) inRange++;
    if (d < best) best = d;
  }
  if (best === Infinity) return -1;
  // None near the team: the nearest (ties: one of them).
  const pool = inRange > 0 ? inRange : countAt(world, best);
  let k = world.streams.events.int(0, pool - 1);
  for (let i = 0; i < lanes.length; i++) {
    const l = lanes[i] as StampedeLane;
    if (!laneOpen(l, stage)) continue;
    const d = laneCentreDistance(l, centre.x, centre.y);
    if (inRange > 0 ? d > near : d !== best) continue;
    if (k-- === 0) return i;
  }
  return -1; // unreachable
}

function countAt(world: World, d: number): number {
  let n = 0;
  const lanes = world.map.stampedeLanes;
  for (let i = 0; i < lanes.length; i++) {
    const l = lanes[i] as StampedeLane;
    if (laneOpen(l, world.decay.stage) && laneCentreDistance(l, centre.x, centre.y) === d) n++;
  }
  return n;
}

function activeLane(world: Readonly<World>): StampedeLane | null {
  const a = world.special.active;
  if (a.kind !== STAMPEDE || a.lane < 0) return null;
  return world.map.stampedeLanes[a.lane] ?? null;
}

/** A circle of radius r at (x, y) overlaps a map solid or a wall building. */
function blockedAt(world: Readonly<World>, x: number, y: number, r: number): boolean {
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length; i++) if (circleHitsBox(x, y, r, solids[i] as MapBox)) return true;
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (b.solid && circleHitsBox(x, y, r, b)) return true;
  }
  return false;
}

function circleHitsBox(x: number, y: number, r: number, b: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dy = Math.max(b.minY - y, 0, y - b.maxY);
  return dx * dx + dy * dy < r * r;
}

/** Sends one row (up to `rowSize`) across the lane at its start edge; slots on cover are skipped this row. */
function spawnRow(world: World, l: StampedeLane): void {
  const cfg = world.balance.events.stampede;
  const s = world.special.stampede;
  const r = world.balance.zombies.types.runner?.radiusM ?? 0.35;
  const cap = maxAliveNow(world) + cfg.overCap;
  const alongX = laneAlongX(l);
  const lo = alongX ? l.minY : l.minX;
  const width = alongX ? l.maxY - l.minY : l.maxX - l.minX;
  const start = r + EDGE_EPS_M;
  for (let k = 0; k < cfg.rowSize && s.spawned < s.toSpawn; k++) {
    if (world.zombies.aliveCount >= cap) return; // brief 22: the rest wait for the next row
    const lat = lo + ((k + 0.5) * width) / cfg.rowSize;
    let x: number;
    let y: number;
    if (alongX) {
      x = l.dir === "e" ? l.minX + start : l.maxX - start;
      y = lat;
    } else {
      x = lat;
      y = l.dir === "s" ? l.minY + start : l.maxY - start;
    }
    if (blockedAt(world, x, y, r)) continue;
    const id = spawnZombie(world, "runner", x, y, false);
    if (id < 0) return;
    const z = world.zombies;
    z.state[id] = ZOMBIE_STATE.STAMPEDE;
    z.stampedeAnchor[id] = laneAlong(l, x, y);
    z.stampedeTick[id] = world.tick;
    s.spawned++;
    world.special.log.stampedeSpawned++;
  }
}

/** F8: a stampede Runner becomes a normal Runner of the wave (rushing when the last-5 rush runs). */
function convert(world: World, id: number): void {
  const z = world.zombies;
  z.waveZombie[id] = 1;
  z.state[id] = world.waves.rushing ? ZOMBIE_STATE.RUSH : ZOMBIE_STATE.CHASE;
  world.special.log.stampedeConverted++;
}

/** Runners still in STAMPEDE state: exits, stuck conversions, the alive count. Backwards (swap-remove). */
function tickRunners(world: World, l: StampedeLane, convertAll: boolean): void {
  const z = world.zombies;
  const cfg = world.balance.events.stampede;
  const len = laneLength(l);
  const stuckTicks = ticksFor(cfg.stuckS);
  let alive = 0;
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    if (z.state[id] !== ZOMBIE_STATE.STAMPEDE) continue;
    if (convertAll) {
      convert(world, id);
      continue;
    }
    const r = world.balance.zombies.types.runner?.radiusM ?? 0.35;
    const along = laneAlong(l, z.x[id] as number, z.y[id] as number);
    if (along >= len - r - EDGE_EPS_M) {
      removeZombie(world, id); // ran off the far edge: gone, no reward, never counted
      world.special.log.stampedeExited++;
      continue;
    }
    if (world.tick - (z.stampedeTick[id] as number) >= stuckTicks) {
      if (along - (z.stampedeAnchor[id] as number) < cfg.stuckProgressM) {
        convert(world, id); // D7: held up 1 s → a normal Runner now
        continue;
      }
      z.stampedeAnchor[id] = along;
      z.stampedeTick[id] = world.tick;
    }
    alive++;
  }
  world.special.stampede.alive = alive;
}

/** Removes every STAMPEDE Runner (the event ended early: wave end, skip, wipe). */
function removeAll(world: World): void {
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    if (z.state[id] === ZOMBIE_STATE.STAMPEDE) removeZombie(world, id);
  }
  world.special.stampede.alive = 0;
}

/** `stampedeSteer` result (reused). */
export const stampedeVel = { x: 0, y: 0 };

/**
 * F6 (zombieAi pass 1): a stampede Runner's desired velocity: along its lane at `speedMps`; when a box
 * (map solid or wall building) lies within `deflectLookM` ahead, sideways round it — to the nearer
 * side that stays in the lane — keeping a little push along; back into the lane when the crowd pushed
 * it out. No allocation.
 */
export function stampedeSteer(world: Readonly<World>, x: number, y: number, r: number, speed: number): void {
  const l = activeLane(world);
  if (!l) {
    stampedeVel.x = 0;
    stampedeVel.y = 0;
    return;
  }
  const dx = dirX(l);
  const dy = dirY(l);
  const look = world.balance.events.stampede.deflectLookM;
  const alongX = laneAlongX(l);
  const lat = alongX ? y : x;
  const laneLo = (alongX ? l.minY : l.minX) + r;
  const laneHi = (alongX ? l.maxY : l.maxX) - r;
  // Every box (inflated by r) in the band `deflectLookM` ahead blocks a lateral interval; touching or
  // overlapping intervals merge (a gap a body can't pass is no gap). In one: sidestep to its nearer end
  // that stays in the lane (else the other end).
  band.n = 0;
  const solids = world.obstacles.solids;
  band.latLo = laneLo - look; // review nit: only boxes that can reach the lane's width
  band.latHi = laneHi + look;
  for (let i = 0; i < solids.length; i++) bandBox(solids[i] as MapBox, x, y, dx, dy, look, r, alongX);
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) if ((list[i] as Building).solid) bandBox(list[i] as Building, x, y, dx, dy, look, r, alongX);
  let side = 0;
  let lo = lat;
  let hi = lat;
  let inside = false;
  for (let grow = true; grow; ) {
    grow = false;
    for (let k = 0; k < band.n; k++) {
      const a = band.lo[k] as number;
      const b = band.hi[k] as number;
      if (inside ? a <= hi + MERGE_GAP_M && b >= lo - MERGE_GAP_M && (a < lo || b > hi) : a < lat && b > lat) {
        if (!inside) {
          lo = a;
          hi = b;
          inside = true;
        } else {
          lo = Math.min(lo, a);
          hi = Math.max(hi, b);
        }
        grow = true;
      }
    }
  }
  if (inside) {
    const loOk = lo - MERGE_GAP_M >= laneLo;
    const hiOk = hi + MERGE_GAP_M <= laneHi;
    const toLo = lat - lo;
    const toHi = hi - lat;
    if (loOk && (!hiOk || toLo <= toHi)) side = -1;
    else if (hiOk) side = 1;
    else side = toLo <= toHi ? -1 : 1;
  } else if (lat < laneLo) side = 1;
  else if (lat > laneHi) side = -1;
  let vx: number;
  let vy: number;
  if (side === 0) {
    vx = dx;
    vy = dy;
  } else {
    // sideways (perpendicular to the lane) plus a little along it
    const px = alongX ? 0 : side;
    const py = alongX ? side : 0;
    vx = px + dx * world.balance.events.stampede.sidestepAlongFrac;
    vy = py + dy * world.balance.events.stampede.sidestepAlongFrac;
    const n = Math.sqrt(vx * vx + vy * vy);
    vx /= n;
    vy /= n;
  }
  stampedeVel.x = vx * speed;
  stampedeVel.y = vy * speed;
}

/** Lateral intervals blocked in the band ahead (module scratch: no allocation per call). */
const MAX_BAND = 64;
/** Geometry epsilon: blocked lateral intervals closer than this merge (no body passes a 5 cm gap). */
const MERGE_GAP_M = 0.05;
const band = { n: 0, latLo: 0, latHi: 0, lo: new Float64Array(MAX_BAND), hi: new Float64Array(MAX_BAND) };
function bandBox(b: { minX: number; minY: number; maxX: number; maxY: number }, x: number, y: number, dx: number, dy: number, look: number, r: number, alongX: boolean): void {
  if (band.n >= MAX_BAND) return;
  // along the lane: the box's extent vs the window [pos, pos + look] in the run direction
  const p = alongX ? x : y;
  const d = alongX ? dx : dy;
  const bLo = (alongX ? b.minX : b.minY) - r;
  const bHi = (alongX ? b.maxX : b.maxY) + r;
  const wLo = d > 0 ? p : p - look;
  const wHi = d > 0 ? p + look : p;
  if (bHi <= wLo || bLo >= wHi) return;
  const lo = (alongX ? b.minY : b.minX) - r;
  const hi = (alongX ? b.maxY : b.maxX) + r;
  if (hi <= band.latLo || lo >= band.latHi) return; // beside the lane: never in the way
  band.lo[band.n] = lo;
  band.hi[band.n] = hi;
  band.n++;
}

/**
 * F7 (zombieAi pass 4): a stampede Runner at (x, y) touching a standing player deals `contactDamage`
 * to that player once (bit = the player's slot in its own mask: never a shared pulse), then runs on.
 */
export function stampedeContact(world: World, id: number, x: number, y: number, rz: number, eps: number): void {
  touch.world = world;
  touch.id = id;
  touch.x = x;
  touch.y = y;
  touch.rz = rz;
  touch.eps = eps;
  world.players.forEach(touchPlayer); // a module-level callback: no closure, no iterator per Runner
  touch.world = null;
}

const touch = { world: null as World | null, id: 0, x: 0, y: 0, rz: 0, eps: 0 };
const touchPlayer = (p: PlayerState): void => {
  const world = touch.world as World;
  if (p.status !== "alive") return;
  const reach = touch.rz + p.radiusM + touch.eps;
  const dx = p.x - touch.x;
  const dy = p.y - touch.y;
  if (dx * dx + dy * dy > reach * reach) return;
  const z = world.zombies;
  const id = touch.id;
  const slot = playerSlotIndex(world, p.id);
  const bit = slot >= 0 ? 1 << slot : 0x10; // a slot-less player (tests): bit 4
  if (((z.stampedeHit[id] as number) & bit) !== 0) return;
  z.stampedeHit[id] = (z.stampedeHit[id] as number) | bit;
  world.special.log.stampedeHits++;
  if (isGodFor(world, p)) return;
  damagePlayerBy(world, p, world.balance.events.stampede.contactDamage, "zombie", null, id);
};

/** Normal spawns pause while stampede Runners are alive (`updateWaves`, AC 10). */
export function stampedeRunnersAlive(world: Readonly<World>): number {
  return world.special.active.kind === STAMPEDE ? world.special.stampede.alive : 0;
}

export const stampedeModule: EventModule = {
  kind: "stampede",
  fits(world, wave) {
    const stage = world.run.phase === "wave" && world.waves.number === wave ? world.decay.stage : stageForWave(world.balance, wave, world.debug.decayStageByWave);
    const lanes = world.map.stampedeLanes;
    for (let i = 0; i < lanes.length; i++) if (laneOpen(lanes[i] as StampedeLane, stage)) return true;
    return false;
  },
  start(world) {
    if (!teamCentre(world)) return false;
    const li = pickLane(world);
    if (li < 0) return false;
    const l = world.map.stampedeLanes[li] as StampedeLane;
    const cfg = world.balance.events.stampede;
    const a = world.special.active;
    a.lane = li;
    a.phase = EVENT_PHASE.WARNING;
    // The marker: the start edge's centre, 1 m in.
    const midX = (l.minX + l.maxX) / 2;
    const midY = (l.minY + l.maxY) / 2;
    a.x = l.dir === "e" ? l.minX + 1 : l.dir === "w" ? l.maxX - 1 : midX;
    a.y = l.dir === "s" ? l.minY + 1 : l.dir === "n" ? l.maxY - 1 : midY;
    const s = world.special.stampede;
    const counts = cfg.countByPlayers;
    s.toSpawn = counts[Math.min(counts.length, Math.max(1, playersInRun(world))) - 1] as number;
    s.spawned = 0;
    s.rowTimer = 0;
    s.alive = 0;
    s.dirX = dirX(l);
    s.dirY = dirY(l);
    return true;
  },
  update(world) {
    const a = world.special.active;
    const cfg = world.balance.events.stampede;
    const l = activeLane(world);
    if (!l) return "done";
    if (a.phase === EVENT_PHASE.WARNING) {
      if (world.tick - a.phaseTick < ticksFor(cfg.warningS)) return null;
      setEventPhase(world, EVENT_PHASE.RUNNING, null);
    }
    const s = world.special.stampede;
    if (world.tick - a.phaseTick >= ticksFor(cfg.runS)) {
      tickRunners(world, l, true); // F8: the crossing is over: everyone left joins the wave
      s.alive = 0;
      return "done";
    }
    if (s.rowTimer <= 0 && s.spawned < s.toSpawn) {
      spawnRow(world, l);
      s.rowTimer = ticksFor(cfg.rowGapS);
    }
    s.rowTimer--;
    tickRunners(world, l, false);
    return null;
  },
  end(world, outcome: EventOutcome) {
    if (outcome !== "done") removeAll(world);
    const s = world.special.stampede;
    s.toSpawn = 0;
    s.spawned = 0;
    s.alive = 0;
  },
  holdsWave(world) {
    return world.special.active.kind === STAMPEDE; // D6: warning and crossing both hold the wave
  },
};
