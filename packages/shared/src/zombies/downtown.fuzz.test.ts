import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox, distanceToBox, segmentHitsBuildings } from "../buildings/collision";
import { applyDecayStage } from "../decay/applyDecayStage";
import { changeDecayStage } from "../decay/decaySystem";
import { buildingInFires, circleInFire, firePulse } from "../decay/fire";
import { legalDecayMasks } from "../decay/decayState";
import type { Balance } from "../config/balance";
import { createRng, type Rng } from "../core/rng";
import { ticksFor } from "../core/time";
import { createWorld, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { addPlayer } from "../player/player";
import { spotBlocked } from "../player/freeSpot";
import { teamSpawnPoint } from "../player/spawn";
import { spawnZombie } from "./zombiePool";
import { jitteredSpawn } from "../waves/waveDirector";
import { SPAWN_STATE, spawnPointStates } from "../waves/spawnPick";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { setInput } from "../core/world";
import { ZOMBIE_TYPES, maxZombieRadius, type ZombieTypeId } from "./zombieTypes";

/**
 * Story 4.1 (brief line 3): random legal layouts on the Downtown map × many ticks.
 *
 * Each layout: 1–4 god-mode players (the team start or random free spots), then up to 24 buildings
 * (the 4 × 6 cap; barricades in both rotations and turrets, which don't fire outside a wave; every
 * fourth layout has none, so the map boxes alone must stop the players: review L3),
 * accepted only where the placement rule allows (`footprintBlocked`: map edge, map collision,
 * spawn clearance, players, zombies, other buildings). Half of the candidates hug a map box (gap 0,
 * 0.5 or 1 m) to make wall–barricade slots and pinches. Then a zombie of a random type at every
 * spawn point plus extra ones, placed with the wave director's jitter rule (`jitteredSpawn`, extremes
 * included), and the World runs (no wave director). The players walk (review L3): each heads for a
 * random point on a random map box's face (the bus included) and keeps pressing on it for a while,
 * then picks another, so they slide along walls, into corners and against barricades; after
 * `WALK_S` they hold still so the slowest zombies can arrive.
 *
 * Story 4.3: zombies appear only at the spawns open at the layout's decay stage (the same stage as its
 * cover); no spawn of any stage may be closed by a building, and every spawn's jitter area must be
 * clear of every building (review M: barricades never seal a spawn that opens later).
 *
 * Every tick: no zombie or player overlaps a map box or a building. Every zombie must reach a
 * player (`REACH_M`, clear line) within the limit (no stall: none is left wandering or wedged). Liveness: the layouts
 * really had buildings, zombies really arrived, and some layouts really made zombies break walls.
 *
 * Story 4.2: the active cover counts as solid everywhere above ("a map box" = `world.obstacles.solids`:
 * map boxes + active cars, bus, barrier, sandbags). Each layout runs at decay stage 1, 2 or 3 (the
 * barrier and the sandbags appear), buildings hug cover faces too, and the players fire at the
 * nearest zombie the whole time with a zero-damage, zero-pushback pistol (so the reach rule still
 * holds): no projectile is ever inside a shot blocker (car, bus, map box), and shots really ended on
 * cover (liveness).
 *
 * Story 4.5 (brief line 3, across stage changes): each layout starts at stage 1 or 2 and, after
 * `CHANGE_S` of walking, moves to a later stage (2 or 3) through the DecaySystem (`changeDecayStage`,
 * the build start's path): before it, a barricade is placed on every mutation box that is not there
 * yet (legal then) and a player and a zombie are put inside one, so the change must destroy and
 * refund the buildings and move the bodies out. The "map box" list is computed here from the map's
 * data and its mutations (`expectedSolids`), not read from the World. After the change every alive
 * zombie must reach a player again ("zombies still reach us after stage 2").
 */
const realBalance = loadBalance();
/** Story 4.2: the same balance with a harmless pistol (shots fly and stop, zombies keep coming). */
const balance: Balance = (() => {
  const b = JSON.parse(JSON.stringify(realBalance)) as { weapons: Record<string, { damage: number; hitPushbackM: number }> };
  const pistol = b.weapons.pistol;
  if (!pistol) throw new Error("no pistol");
  pistol.damage = 0;
  pistol.hitPushbackM = 0;
  return b as unknown as Balance;
})();
/** Story 4.2: a projectile deeper than this inside a shot blocker is a tunnelled shot (positions are Float32). */
const SHOT_EPS_M = 1e-4;
const LAYOUTS = 48; // Story 4.8: ≥ the 45 legal variant masks (C(6,4) movers × C(3,2) fires), a multiple of 4
/** Story 4.7: every legal variant mask of Downtown (one per layout, round robin). */
const MASKS = legalDecayMasks(DOWNTOWN_MAP);
const LIMIT_S = 120;
/** Players walk this long, then hold still (a 4.5 m/s survivor outruns a 0.7 m/s Crawler forever). */
const WALK_S = 30;
const EXTRA_ZOMBIES = 6;
/** Story 4.5: the stage change comes after this much walking (like a build start mid-run). */
const CHANGE_S = 6;
/**
 * Overlap tolerances. Zombie positions are Float32 (a ulp near 48 m is ~4e-6 m). Players are float64,
 * but the push-out itself accepts a leftover overlap below `STUCK_EPS_M` (1e-6 m, collision.ts) after
 * its passes (seen: 8e-7 m pressing into a corner between two boxes); anything deeper is a body inside.
 */
const ZOMBIE_EPS_M = 1e-5;
const PLAYER_EPS_M = 1e-6;
/**
 * "Reached a player": within this distance with a clear line (no map box or building between), or
 * pressed against a zombie that has reached one (the crowd round a player: only the inner ring can
 * touch, and a player in a corner pushes the crowd out past 3 m in one quadrant).
 */
const REACH_M = 3;
/** The soft separation holds crowd neighbours a little apart (seen: 0.81 m for two 0.35 m bodies). */
const CROWD_GAP_M = 0.3;
const TYPES = ["wood_barricade", "auto_turret"] as const;
const map = DOWNTOWN_MAP;

const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/**
 * Story 4.2: the boxes a body must stay out of, computed here from the map data (not read from
 * `world.obstacles`, so a World that forgot its cover can't pass by checking against the same list).
 */
function activeSolids(world: World): MapBox[] {
  return expectedSolids(world.decay.stage, world.decay.variants);
}

/**
 * Story 4.5: the solids at (stage, variants) straight from the map data (an independent rewrite of
 * the mutation rules: map boxes and cover by `minStage`, then the applied blocks/adds, minus every
 * removed name and the bus pair).
 */
function expectedSolids(stage: number, variants: number): MapBox[] {
  const applies = (m: (typeof map.decay)[number]) => m.stage <= stage && (m.variant < 0 || ((variants >>> m.variant) & 1) === 1);
  const removed = new Set(map.decay.filter((m) => m.action === "remove" && applies(m)).map((m) => m.target));
  const out: MapBox[] = [...map.solids, ...map.cover.filter((c) => c.minStage <= stage)];
  for (const m of map.decay) if ((m.action === "add" || m.action === "block") && applies(m)) out.push(m);
  return out.filter((b) => !removed.has(b.name));
}

/**
 * Story 4.8: the burning fires at (stage, variants, firesOut) straight from the map data: the applied
 * ignites (map order) whose target is still standing and whose bit is not out.
 */
function expectedFires(stage: number, variants: number, firesOut: number): string[] {
  const standing = new Set(expectedSolids(stage, variants).map((b) => b.name));
  const out: string[] = [];
  let i = 0;
  for (const m of map.decay) {
    if (m.action !== "ignite") continue;
    const bit = i++;
    if (m.stage <= stage && (m.variant < 0 || ((variants >>> m.variant) & 1) === 1) && ((firesOut >>> bit) & 1) === 0 && standing.has(m.target)) out.push(m.name);
  }
  return out;
}
/** Story 4.8: fires go out this long after the change (a later build start, in a stage-3 layout). */
const FIRE_OUT_S = 20;

function overlapsAnyBox(world: World, x: number, y: number, r: number, eps: number): string | null {
  for (const s of activeSolids(world)) if (circleOverlapsBox(x, y, r - eps, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (circleOverlapsBox(x, y, r - eps, b.minX, b.minY, b.maxX, b.maxY)) return `building ${b.id}`;
  return null;
}

/** A lattice corner next to a random face of a random map box or active cover (gap 0, 0.5 or 1 m). */
function nearSolid(world: World, rng: Rng, w: number, h: number): { gx: number; gy: number } {
  const solids = world.obstacles.solids;
  const s = solids[rng.int(0, solids.length - 1)] as MapBox;
  const gap = rng.int(0, 2) * BUILD_GRID_M;
  const along = (lo: number, hi: number, size: number) => rng.int(Math.round((lo - size) / BUILD_GRID_M), Math.round(hi / BUILD_GRID_M));
  switch (rng.int(0, 3)) {
    case 0:
      return { gx: Math.round((s.minX - gap - w) / BUILD_GRID_M), gy: along(s.minY, s.maxY, h) };
    case 1:
      return { gx: Math.round((s.maxX + gap) / BUILD_GRID_M), gy: along(s.minY, s.maxY, h) };
    case 2:
      return { gx: along(s.minX, s.maxX, w), gy: Math.round((s.minY - gap - h) / BUILD_GRID_M) };
    default:
      return { gx: along(s.minX, s.maxX, w), gy: Math.round((s.maxY + gap) / BUILD_GRID_M) };
  }
}

function layout(seed: number) {
  const rng = createRng(seed);
  const world = createWorld({ balance, seed, map, systems: { waves: () => {} } });
  world.debug.godMode = true;
  // Story 4.2: stage 1 or 2 (barrier from 2), before anything is placed; Story 4.5: the layout moves
  // on to `toStage` (2 or 3) mid-run through the DecaySystem.
  const fromStage = 1 + (seed % 2);
  const toStage = fromStage + 1 + (fromStage === 1 && seed % 3 === 0 ? 1 : 0);
  // Story 4.7: walk every variant combination a run can pick (C(6,4) movers × C(3,2) fires = 45 ≤ 48 (Story 4.8)
  // layouts), not just the ones the seeds happen to draw (a fixed list, so the test stays deterministic).
  world.decay.variants = MASKS[seed % MASKS.length] as number;
  applyDecayStage(world, fromStage, world.decay.variants);
  let damaged = 0;
  const decayLog = { changing: false, destroyed: 0, refunds: 0, refunded: 0 };
  world.events.subscribe((e) => {
    if (e.type === "building.destroyed" && !decayLog.changing) damaged++;
    if (e.type === "money.earned" && e.reason === "refund") {
      decayLog.refunds++;
      decayLog.refunded += e.amount;
    }
  });
  const players = rng.int(1, 4);
  const at = { x: 0, y: 0 };
  for (let slot = 0; slot < players; slot++) {
    if (seed % 2 === 0) teamSpawnPoint(world, slot, at);
    else {
      do {
        at.x = rng.range(1, map.widthM - 1);
        at.y = rng.range(1, map.heightM - 1);
      } while (spotBlocked(world, at.x, at.y, balance.player.radiusM, null));
    }
    addPlayer(world, `p${slot}`, at.x, at.y);
  }
  const want = seed % 4 === 0 ? 0 : rng.int(6, 24);
  let nextId = 1;
  for (let tries = 0; tries < 2000 && world.buildings.list.length < want; tries++) {
    const type = TYPES[rng.int(0, 9) === 0 ? 1 : 0] as string;
    const stats = buildingStats(balance, type);
    if (!stats) throw new Error(type);
    const rot = rng.int(0, 3) as BuildingRotation;
    const w = rot % 2 === 0 ? stats.widthM : stats.depthM;
    const h = rot % 2 === 0 ? stats.depthM : stats.widthM;
    const c = rng.int(0, 1) === 0 ? nearSolid(world, rng, w, h) : { gx: rng.int(0, map.widthM / BUILD_GRID_M), gy: rng.int(0, map.heightM / BUILD_GRID_M) };
    if (footprintBlocked(world, footprint(stats, c.gx, c.gy, rot, box))) continue;
    addBuildingAt(world, { id: nextId++, type, ownerId: "p0", gx: c.gx, gy: c.gy, rot, hp: stats.hp });
  }
  const spawned: number[] = [];
  const zombieType = (): ZombieTypeId => ZOMBIE_TYPES[rng.int(0, ZOMBIE_TYPES.length - 1)] as ZombieTypeId;
  const jitter = balance.waves.spawnJitterM;
  const at2 = { x: 0, y: 0 };
  const spawnAt = (sp: { x: number; y: number }, k: number): void => {
    const type = zombieType();
    const j = k % 3 === 0 ? -jitter : k % 3 === 1 ? jitter : rng.range(-jitter, jitter); // the extremes too
    jitteredSpawn(world, sp, j, balance.zombies.types[type]?.radiusM ?? 0, at2);
    spawned.push(spawnZombie(world, type, at2.x, at2.y));
  };
  // Story 4.3: zombies appear only at the spawns open at this layout's stage (the same stage as its
  // cover). Review M: placement keeps clear of the spawns of EVERY stage, so no spawn is ever closed
  // by a building and every spawn's jitter area (grown by the largest zombie radius) is clear of them.
  const states = spawnPointStates(world, new Uint8Array(map.spawnPoints.length));
  const usable = map.spawnPoints.filter((_, i) => states[i] !== SPAWN_STATE.CLOSED && states[i] !== SPAWN_STATE.BLOCKED);
  const blocked = states.filter((s) => s === SPAWN_STATE.BLOCKED).length;
  let jitterHits = 0;
  const lo = { x: 0, y: 0 };
  const hi = { x: 0, y: 0 };
  const rz = maxZombieRadius(balance);
  for (const sp of map.spawnPoints) {
    jitteredSpawn(world, sp, -jitter, rz, lo);
    jitteredSpawn(world, sp, jitter, rz, hi);
    for (const b of world.buildings.list) {
      if (Math.min(lo.x, hi.x) - rz < b.maxX && Math.max(lo.x, hi.x) + rz > b.minX && Math.min(lo.y, hi.y) - rz < b.maxY && Math.max(lo.y, hi.y) + rz > b.minY) jitterHits++;
    }
  }
  usable.forEach((sp, k) => spawnAt(sp, k + seed));
  for (let i = 0; i < EXTRA_ZOMBIES; i++) spawnAt(usable[rng.int(0, usable.length - 1)] as { x: number; y: number }, i + seed + 1);
  // Story 4.5: a barricade on every mutation box that the change will bring (legal now), when the
  // placement rule allows one there (not on the bare layouts: they keep no buildings).
  const future = expectedSolids(toStage, world.decay.variants).filter((b) => !expectedSolids(fromStage, world.decay.variants).includes(b));
  const wood = buildingStats(balance, "wood_barricade");
  if (!wood) throw new Error("wood_barricade");
  let onFuture = 0;
  let onMoved = 0;
  for (const f of want === 0 ? [] : future) {
    let done = false;
    for (let gy = Math.floor(f.minY / BUILD_GRID_M) - 1; gy <= Math.ceil(f.maxY / BUILD_GRID_M) && !done; gy++) {
      for (let gx = Math.floor(f.minX / BUILD_GRID_M) - 1; gx <= Math.ceil(f.maxX / BUILD_GRID_M) && !done; gx++) {
        const fp = footprint(wood, gx, gy, 0, box);
        if (!(fp.minX < f.maxX && fp.maxX > f.minX && fp.minY < f.maxY && fp.maxY > f.minY)) continue;
        if (footprintBlocked(world, fp)) continue;
        addBuildingAt(world, { id: nextId++, type: "wood_barricade", ownerId: "p0", gx, gy, rot: 0, hp: wood.hp });
        onFuture++;
        if (f.name.endsWith("_in_road") || f.name.startsWith("police_line")) onMoved++; // Story 4.7
        done = true;
      }
    }
  }
  return { world, rng, spawned, players, buildings: world.buildings.list.length, destroyed: () => damaged, blocked, jitterHits, fromStage, toStage, future, onFuture, onMoved, decayLog };
}

/** Review L3: each player's walk target (a point on a map box's face) and ticks left pressing on it. */
interface Walk {
  tx: number;
  ty: number;
  ticks: number;
}
const WALK_TICKS = [20, 80] as const;

function steer(world: World, rng: Rng, walks: Walk[], seq: number): void {
  let i = 0;
  for (const p of world.players.values()) {
    const w = (walks[i] ??= { tx: p.x, ty: p.y, ticks: 0 });
    if (w.ticks-- <= 0) {
      const solids = world.obstacles.solids; // Story 4.2: cover faces too
      const s = solids[rng.int(0, solids.length - 1)] as MapBox;
      const side = rng.int(0, 3);
      const u = rng.range(0, 1);
      w.tx = side < 2 ? s.minX + u * (s.maxX - s.minX) : side === 2 ? s.minX : s.maxX;
      w.ty = side === 0 ? s.minY : side === 1 ? s.maxY : s.minY + u * (s.maxY - s.minY);
      w.ticks = rng.int(WALK_TICKS[0], WALK_TICKS[1]);
    }
    const dx = w.tx - p.x;
    const dy = w.ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    // Story 4.2: aim at the nearest zombie and hold fire (harmless pistol; mouse aim: no assist).
    const z = world.zombies;
    let ax = dx / d;
    let ay = dy / d;
    let best = Infinity;
    for (let k = 0; k < z.aliveCount; k++) {
      const id = z.aliveIds[k] as number;
      const zd = Math.hypot((z.x[id] as number) - p.x, (z.y[id] as number) - p.y);
      if (zd > 1e-6 && zd < best) {
        best = zd;
        ax = ((z.x[id] as number) - p.x) / zd;
        ay = ((z.y[id] as number) - p.y) / zd;
      }
    }
    const input: PlayerInput = { ...NEUTRAL_INPUT, seq, moveX: dx / d, moveY: dy / d, aimX: ax, aimY: ay, fire: true, isMouse: true };
    setInput(world, p.id, input);
    i++;
  }
}

/** Runs the layout; returns the first violation (or null), and the zombies that touched a player. */
function run(seed: number) {
  const l = layout(seed);
  const { world, spawned, rng } = l;
  const walks: Walk[] = [];
  let pressed = 0;
  let coverStops = 0;
  let shotsInCover: string | null = null;
  const before = new Uint8Array(world.projectiles.capacity);
  const reached = new Set<number>();
  const limit = ticksFor(LIMIT_S);
  const walkTicks = ticksFor(WALK_S);
  let ticks = 0;
  let violation: string | null = null;
  const changeTick = ticksFor(CHANGE_S);
  let alive = spawned.length;
  let pushedOut = 0;
  // Story 4.8: fire liveness per layout (pulses that hit zombies / buildings, zombie-ticks in fire).
  const fire = { lit: 0, zombieHits: 0, buildingHits: 0, kills: 0, zombieTicksInFire: 0, wentOut: false, ignitionDestroyed: 0 };
  const outTick = changeTick + ticksFor(FIRE_OUT_S);
  const pulse0 = { ...firePulse };
  // Story 4.8: stage-3 layouts also run until their fires have gone out.
  for (; ticks < limit && (ticks <= changeTick || reached.size < alive || (fire.lit > 0 && !fire.wentOut)) && violation === null; ticks++) {
    if (ticks === changeTick) {
      // Story 4.5: a player and a zombie inside a box the change brings, then the change itself.
      const f = l.future[ticks % Math.max(1, l.future.length)];
      const p0 = world.players.get("p0");
      if (f && p0) {
        p0.x = p0.prevX = (f.minX + f.maxX) / 2;
        p0.y = p0.prevY = (f.minY + f.maxY) / 2;
      }
      const z0 = world.zombies;
      if (f && z0.aliveCount > 0) {
        const id = z0.aliveIds[0] as number;
        z0.x[id] = z0.prevX[id] = (f.minX + f.maxX) / 2 + 0.1;
        z0.y[id] = z0.prevY[id] = (f.minY + f.maxY) / 2;
      }
      const before = world.buildings.list.length;
      const beforeList = [...world.buildings.list];
      l.decayLog.changing = true;
      if (!changeDecayStage(world, l.toStage)) violation = `seed ${seed}: the stage change did nothing`;
      l.decayLog.changing = false;
      l.decayLog.destroyed = before - world.buildings.list.length;
      if (f) pushedOut++;
      for (const b of world.buildings.list) {
        for (const s2 of expectedSolids(l.toStage, world.decay.variants)) {
          if (b.minX < s2.maxX && b.maxX > s2.minX && b.minY < s2.maxY && b.maxY > s2.minY) violation = `seed ${seed}: building ${b.id} left on ${s2.name}`;
        }
      }
      reached.clear(); // every zombie must reach us again on the new map
      alive = world.zombies.aliveCount;
      // Story 4.8: the fires are the map data's (independent rewrite); stage 3 burns two cars, and
      // from now on the fight is a wave (fire burns in build and wave phases only).
      const names = world.decay.fires.map((f2) => f2.name);
      const want = expectedFires(l.toStage, world.decay.variants, world.decay.firesOut);
      if (JSON.stringify(names) !== JSON.stringify(want)) violation = `seed ${seed}: fires ${names.join(",")} ≠ map data ${want.join(",")}`;
      if (l.toStage === 3 && names.length !== 2) violation = `seed ${seed}: stage 3 burns ${names.length} cars`;
      fire.lit = names.length;
      // Story 4.8 review M2: every building a new fire overlaps went at the ignition (refunded with the rest).
      for (const b of beforeList) {
        if (!buildingInFires(world.decay.fires, b)) continue;
        if (world.buildings.list.includes(b)) violation = `seed ${seed}: building ${b.id} left in a fire lit at the build start`;
        else fire.ignitionDestroyed++;
      }
      // Story 4.8 review M1: no standing player is left in a fire lit at the build start.
      for (const p of world.players.values()) if (p.status === "alive" && circleInFire(world.decay.fires, p.x, p.y, p.radiusM)) violation = `seed ${seed}: player ${p.id} left in a fire at ignition`;
      if (l.toStage === 3) world.run.phase = "wave";
    }
    if (ticks === outTick && fire.lit > 0) {
      // Story 4.8: the build start 2 waves later (the DecaySystem's expiry; stage unchanged).
      world.waves.number = Math.max(...Array.from(world.decay.fireEndWave)) - 1;
      if (!changeDecayStage(world, l.toStage)) violation = `seed ${seed}: the fires did not go out`;
      if (world.decay.fires.length !== 0 || world.pathing.nav.fireCost.some((c) => c !== 0)) violation = `seed ${seed}: fires or fire cost left after going out`;
      const want = expectedFires(l.toStage, world.decay.variants, world.decay.firesOut);
      if (want.length !== 0) violation = `seed ${seed}: map data still burns ${want.join(",")}`;
      fire.wentOut = true;
    }
    if (ticks < walkTicks) steer(world, rng, walks, ticks + 1);
    else if (ticks === walkTicks) for (const p of world.players.values()) setInput(world, p.id, { ...NEUTRAL_INPUT, seq: ticks + 1 });
    const pool = world.projectiles;
    before.fill(0);
    for (let k = 0; k < pool.aliveCount; k++) before[pool.aliveIds[k] as number] = 1;
    step(world, TICK_DT_S);
    // Story 4.2: no live shot inside a shot blocker; count shots that ended on one (liveness).
    for (let k = 0; k < pool.aliveCount; k++) {
      const id = pool.aliveIds[k] as number;
      const x = pool.x[id] as number;
      const y = pool.y[id] as number;
      for (const b of world.obstacles.shotBlockers) {
        if (x > b.minX + SHOT_EPS_M && x < b.maxX - SHOT_EPS_M && y > b.minY + SHOT_EPS_M && y < b.maxY - SHOT_EPS_M) shotsInCover ??= `seed ${seed} tick ${ticks}: shot ${id} at (${x}, ${y}) inside ${b.name}`;
      }
    }
    for (let id = 0; id < pool.capacity; id++) {
      if (before[id] !== 1 || (pool.alivePos[id] as number) >= 0) continue;
      const x = pool.x[id] as number;
      const y = pool.y[id] as number;
      for (const b of world.obstacles.shotBlockers) {
        if (distanceToBox(x, y, b.minX, b.minY, b.maxX, b.maxY) <= SHOT_EPS_M) {
          coverStops++;
          break;
        }
      }
    }
    if (shotsInCover) violation = shotsInCover;
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const r = balance.zombies.types[ZOMBIE_TYPES[z.type[id] as number] as string]?.radiusM ?? 0;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      if (circleInFire(world.decay.fires, x, y, r)) fire.zombieTicksInFire++;
      const inBox = overlapsAnyBox(world, x, y, r, ZOMBIE_EPS_M);
      if (inBox) violation = `seed ${seed} tick ${ticks}: zombie ${id} at (${x.toFixed(3)}, ${y.toFixed(3)}) inside ${inBox}`;
      for (const p of world.players.values()) {
        if (Math.hypot(p.x - x, p.y - y) <= REACH_M && !segmentHitsBuildings(world, x, y, p.x, p.y, 0)) reached.add(id);
      }
    }
    // The crowd: a zombie pressed against a reached one has reached the player too (repeat until stable).
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = 0; i < z.aliveCount; i++) {
        const a = z.aliveIds[i] as number;
        if (reached.has(a)) continue;
        for (let k = 0; k < z.aliveCount; k++) {
          const b = z.aliveIds[k] as number;
          if (!reached.has(b)) continue;
          if (Math.hypot((z.x[a] as number) - (z.x[b] as number), (z.y[a] as number) - (z.y[b] as number)) <= 2 * maxZombieRadius(balance) + CROWD_GAP_M) {
            reached.add(a);
            grew = true;
            break;
          }
        }
      }
    }
    for (const p of world.players.values()) {
      const inBox = overlapsAnyBox(world, p.x, p.y, p.radiusM, PLAYER_EPS_M);
      if (inBox) violation = `seed ${seed} tick ${ticks}: player ${p.id} at (${p.x}, ${p.y}) from (${p.prevX}, ${p.prevY}) inside ${inBox}`;
      if (overlapsAnyBox(world, p.x, p.y, p.radiusM + 0.01, 0)) pressed++; // against a wall (liveness)
    }
  }
  const z = world.zombies;
  const missing = Array.from(z.aliveIds.subarray(0, z.aliveCount)).filter((id) => !reached.has(id));
  fire.zombieHits = firePulse.zombies - pulse0.zombies;
  fire.buildingHits = firePulse.buildings - pulse0.buildings;
  fire.kills = firePulse.zombiesKilled - pulse0.zombiesKilled;
  return { ...l, ticks, violation, missing, reached: reached.size, alive, pressed, coverStops, pushedOut, stage: world.obstacles.stage, fire };
}

describe("Downtown fuzz: random legal layouts × many ticks (Story 4.1 + 4.2 cover + 4.5 stage changes, brief line 3)", () => {
  it(`${LAYOUTS} layouts: no body inside a box, no stall, every zombie reaches a player`, () => {
    let buildings = 0;
    let reached = 0;
    let breaking = 0;
    let pressed = 0;
    let bare = 0;
    let spawnedTotal = 0;
    let blocked = 0;
    let coverStops = 0;
    let decayDestroyed = 0;
    let decayRefunded = 0;
    let onFuture = 0;
    let movedOnto = 0;
    let pushedOut = 0;
    const fires = { layouts: 0, zombieHits: 0, buildingHits: 0, kills: 0, zombieTicksInFire: 0, wentOut: 0, ignitionDestroyed: 0 };
    const variantsSeen = new Set<number>();
    const stages = new Set<number>();
    const failures: string[] = [];
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const r = run(4100 + seed);
      buildings += r.buildings;
      reached += r.reached;
      if (r.destroyed() > 0) breaking++;
      pressed += r.pressed;
      if (r.buildings === 0) bare++;
      spawnedTotal += r.spawned.length;
      blocked += r.blocked;
      coverStops += r.coverStops;
      stages.add(r.fromStage);
      stages.add(r.stage);
      decayDestroyed += r.decayLog.destroyed;
      decayRefunded += r.decayLog.refunds;
      onFuture += r.onFuture;
      movedOnto += r.onMoved;
      pushedOut += r.pushedOut;
      if (r.fire.lit > 0) fires.layouts++;
      fires.zombieHits += r.fire.zombieHits;
      fires.buildingHits += r.fire.buildingHits;
      fires.ignitionDestroyed += r.fire.ignitionDestroyed;
      fires.kills += r.fire.kills;
      fires.zombieTicksInFire += r.fire.zombieTicksInFire;
      if (r.fire.wentOut) fires.wentOut++;
      variantsSeen.add(r.world.decay.variants);
      if (r.decayLog.refunds !== r.decayLog.destroyed) failures.push(`seed ${4100 + seed}: ${r.decayLog.destroyed} buildings destroyed by the stage, ${r.decayLog.refunds} refunds`);
      if (r.stage !== r.toStage) failures.push(`seed ${4100 + seed}: ended at stage ${r.stage}, wanted ${r.toStage}`);
      if (r.jitterHits > 0) failures.push(`seed ${4100 + seed}: ${r.jitterHits} spawn jitter areas (any stage) overlap a building`);
      if (r.violation) failures.push(r.violation);
      if (r.missing.length > 0) {
        const z = r.world.zombies;
        failures.push(`seed ${4100 + seed}: ${r.missing.length} zombies never reached a player after the stage change, in ${LIMIT_S} s: ${r.missing.map((id) => `${id}@(${(z.x[id] as number).toFixed(2)}, ${(z.y[id] as number).toFixed(2)})`).join(" ")}`);
      }
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[fuzz] downtown: ${LAYOUTS} layouts, ${buildings} buildings, ${reached} zombies reached a player, ${breaking} layouts broke a building, ${bare} layouts without buildings, ${pressed} player-ticks pressed on a box, ${coverStops} shots ended on cover, stages ${[...stages].sort().join("/")}, ${spawnedTotal} zombies spawned, ${blocked} spawns closed by a building; Story 4.5: ${onFuture} barricades on coming mutation boxes (Story 4.7: ${movedOnto} on moved cars / police lines), ${decayDestroyed} destroyed + ${decayRefunded} refunds by the stage change, ${pushedOut} layouts with bodies pushed out, variant masks: ${variantsSeen.size}; Story 4.8: ${fires.layouts} layouts with 2 fires, ${fires.zombieHits} zombie pulses (${fires.kills} fire kills), ${fires.buildingHits} building pulses, ${fires.ignitionDestroyed} buildings destroyed + refunded at ignition, ${fires.zombieTicksInFire} zombie-ticks in fire, ${fires.wentOut} expiries`);
    expect(failures).toEqual([]);
    // Liveness (brief line 9): the layouts were real and the zombies really came.
    expect(buildings).toBeGreaterThan(LAYOUTS * 3);
    expect(bare).toBe(LAYOUTS / 4);
    expect(pressed).toBeGreaterThan(LAYOUTS * 20); // the players really walked into walls
    expect(reached).toBeGreaterThan(spawnedTotal / 2); // Story 4.5: every zombie alive after the change reached a player (failures above)
    // Story 4.3: stage-2/3 layouts really used their extra spawns; no building ever closed one (review M).
    expect(spawnedTotal).toBeGreaterThan(LAYOUTS * (9 + EXTRA_ZOMBIES));
    expect(blocked).toBe(0);
    expect(breaking).toBeGreaterThan(0);
    // Story 4.2 liveness: every stage ran and shots really stopped at cover.
    expect([...stages].sort()).toEqual([1, 2, 3]);
    expect(coverStops).toBeGreaterThan(LAYOUTS / 2); // Story 4.3 merge: was > LAYOUTS; the spawn set (and so the layouts) changed, 31 seen
    // Story 4.5 liveness: the changes really destroyed and refunded buildings, pushed bodies out, and
    // both candidates of the stage-2 car were used across the seeds.
    expect(decayDestroyed).toBeGreaterThan(LAYOUTS / 2);
    expect(decayRefunded).toBe(decayDestroyed);
    expect(pushedOut).toBe(LAYOUTS);
    expect(variantsSeen.size).toBeGreaterThan(1);
    // Story 4.7: every combination of moved cars ran (and so every moved car landed on a layout).
    expect([...variantsSeen].sort((a, b) => a - b)).toEqual(MASKS);
    expect(movedOnto).toBeGreaterThan(LAYOUTS / 4); // barricades placed where a moved car / police line lands
    // Story 4.8 liveness: stage-3 layouts really burned, hurt zombies and buildings, and went out —
    // and every zombie still reached a player (failures above).
    expect(fires.layouts).toBeGreaterThan(LAYOUTS / 4);
    expect(fires.wentOut).toBe(fires.layouts);
    expect(fires.zombieHits).toBeGreaterThan(0);
    expect(fires.ignitionDestroyed).toBeGreaterThan(0); // review M2: buildings under a new fire went (refunded), none burns on from the ignition
  }, 240_000);
});
