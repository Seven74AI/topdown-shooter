import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox, distanceToBox, segmentHitsBuildings } from "../buildings/collision";
import { applyDecayStage } from "../decay/applyDecayStage";
import { changeDecayStage } from "../decay/decaySystem";
import { circleInFire } from "../decay/decayState";
import { legalDecayMasks } from "../decay/decayState";
import { createRng, type Rng } from "../core/rng";
import { createWorld, setInput, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer, type PlayerState } from "../player/player";
import { spotBlocked } from "../player/freeSpot";
import { teamSpawnPoint } from "../player/spawn";
import { jitteredSpawn, spawnJitterFor } from "../waves/waveDirector";
import { SPAWN_STATE, spawnPointStates } from "../waves/spawnPick";
import { bruteStats } from "./zombieAi";
import { applyZombieDamage } from "../combat/damage";
import { spawnZombie } from "./zombiePool";
import { zombieTypeIndex, type ZombieTypeId } from "./zombieTypes";

/**
 * Story 5.7 (brief line 7): Brutes in random Downtown layouts × decay stages (fires at stage 3) ×
 * thousands of ticks. Each layout: 1–3 players (1e9 HP, not god mode: the Brutes really hit and
 * knock them) standing pressed against cover (a car, the bus, a building, the parking wall) or
 * next to a fire, barricades (wood, metal) and turrets round them (both rotations, legal placement
 * only), 2–3 Brutes from the open spawns (the wave director's jitter rule) and a crowd of Walkers
 * and Crawlers. Players hold still most of the time and sometimes walk into the cover.
 *
 * Every tick: no Brute centre … body inside a real box (map solids + active cover + wall buildings),
 * no player inside a box or a burning fire (knockbacks included), every body in the map. Per layout:
 * ≥ 1 knockback; every Brute reaches a player (hits one) or hits a building it is blocked by within
 * the limit (no stall); both grids' wall cells are untouched except by the one stage change (a build
 * start's path). Liveness over all layouts: Brute building hits, knockbacks that stopped at a box.
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const LAYOUTS = 16;
const TICKS = 3000;
const MASKS = legalDecayMasks(map);
const BRUTE = zombieTypeIndex("brute");
const EPS = 1e-5;
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function insideBox(world: World, x: number, y: number, r: number): string | null {
  for (const s of world.obstacles.solids) if (circleOverlapsBox(x, y, r - EPS, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (b.solid && circleOverlapsBox(x, y, r - EPS, b.minX, b.minY, b.maxX, b.maxY)) return `${b.type} ${b.id}`;
  return null;
}

/** A free spot pressed against a random face of a random solid (or next to a fire when `fire`). */
function spotAtCover(world: World, rng: Rng, r: number, fire: boolean): { x: number; y: number } | null {
  for (let tries = 0; tries < 400; tries++) {
    let x: number;
    let y: number;
    if (fire && world.decay.fires.length > 0) {
      const f = world.decay.fires[rng.int(0, world.decay.fires.length - 1)] as { x: number; y: number; radiusM: number };
      const a = rng.range(0, Math.PI * 2);
      x = f.x + Math.cos(a) * (f.radiusM + r + rng.range(0.05, 0.5));
      y = f.y + Math.sin(a) * (f.radiusM + r + rng.range(0.05, 0.5));
    } else {
      const s = world.obstacles.solids[rng.int(0, world.obstacles.solids.length - 1)] as MapBox;
      const gap = r + rng.range(0.02, 0.3);
      switch (rng.int(0, 3)) {
        case 0:
          x = s.minX - gap;
          y = rng.range(s.minY, s.maxY);
          break;
        case 1:
          x = s.maxX + gap;
          y = rng.range(s.minY, s.maxY);
          break;
        case 2:
          x = rng.range(s.minX, s.maxX);
          y = s.minY - gap;
          break;
        default:
          x = rng.range(s.minX, s.maxX);
          y = s.maxY + gap;
      }
    }
    if (x < r + 0.1 || y < r + 0.1 || x > map.widthM - r - 0.1 || y > map.heightM - r - 0.1) continue;
    if (spotBlocked(world, x, y, r, null)) continue;
    if (world.decay.fires.length > 0 && circleInFire(world.decay.fires, x, y, r)) continue;
    return { x, y };
  }
  return null;
}

function layout(seed: number) {
  const rng = createRng(seed * 7919 + 13);
  const world = createWorld({ balance, seed, map, systems: { waves: () => {} } });
  const stage = 1 + (seed % 3);
  world.decay.variants = MASKS[(seed * 5) % MASKS.length] as number;
  applyDecayStage(world, stage, world.decay.variants);
  const players: PlayerState[] = [];
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const at = spotAtCover(world, rng, balance.player.radiusM, stage === 3 && i === 0);
    if (!at) continue;
    const p = addPlayer(world, `p${i}`, at.x, at.y);
    p.hp = 1e9;
    p.maxHp = 1e9;
    players.push(p);
  }
  // Barricades and turrets: half round the players (a partial ring), half anywhere legal.
  let id = 1;
  const want = rng.int(4, 18);
  const types = ["wood_barricade", "metal_barricade", "auto_turret"] as const;
  for (let tries = 0; tries < 3000 && world.buildings.list.length < want; tries++) {
    const type = types[rng.int(0, 2)] as string;
    const stats = buildingStats(balance, type);
    if (!stats) continue;
    const rot = rng.int(0, 3) as BuildingRotation;
    const p = players[rng.int(0, Math.max(0, players.length - 1))];
    const near = p && rng.int(0, 1) === 0;
    const gx = near ? Math.round((p.x + rng.range(-3, 3)) / BUILD_GRID_M) : rng.int(0, map.widthM / BUILD_GRID_M);
    const gy = near ? Math.round((p.y + rng.range(-3, 3)) / BUILD_GRID_M) : rng.int(0, map.heightM / BUILD_GRID_M);
    if (footprintBlocked(world, footprint(stats, gx, gy, rot, box))) continue;
    addBuildingAt(world, { id: id++, type, ownerId: "p0", gx, gy, rot, hp: stats.hp });
  }
  // Brutes and a crowd from the open spawns.
  const states = spawnPointStates(world, new Uint8Array(map.spawnPoints.length));
  const open = map.spawnPoints.filter((_, i) => states[i] !== SPAWN_STATE.CLOSED && states[i] !== SPAWN_STATE.BLOCKED);
  const at = { x: 0, y: 0 };
  const brutes: number[] = [];
  const spawn = (type: ZombieTypeId): number => {
    const sp = open[rng.int(0, open.length - 1)] as { x: number; y: number };
    const r = balance.zombies.types[type]?.radiusM ?? 0;
    const j = spawnJitterFor(balance, r);
    jitteredSpawn(world, sp, rng.range(-j, j), r, at);
    return spawnZombie(world, type, at.x, at.y);
  };
  const nb = rng.int(2, 3);
  for (let i = 0; i < nb; i++) brutes.push(spawn("brute"));
  for (let i = 0; i < 20; i++) spawn(rng.int(0, 3) === 0 ? "crawler" : "walker");
  return { world, rng, players, brutes, stage };
}

/** Review M1: no cell a Brute can stand on is within `gapReachM` of p (+ half a cell's diagonal: it may stand anywhere in it). */
function safeFromBrutes(world: World, p: PlayerState): boolean {
  const nav = world.pathing.wide;
  const reach = (balance.zombies.types.brute?.gapReachM ?? 0) + nav.cellM * Math.SQRT1_2;
  for (let c = 0; c < nav.cells; c++) {
    if (nav.wallAt[c] !== 0) continue;
    const cx = ((c % nav.cols) + 0.5) * nav.cellM;
    const cy = (Math.floor(c / nav.cols) + 0.5) * nav.cellM;
    if (Math.hypot(cx - p.x, cy - p.y) <= reach) return false;
  }
  return true;
}

function killNearestCrowd(world: World, p: PlayerState): void {
  const z = world.zombies;
  let best = -1;
  let bestD = 6;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    if (z.type[id] === BRUTE) continue;
    const d = Math.hypot((z.x[id] as number) - p.x, (z.y[id] as number) - p.y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  if (best >= 0) applyZombieDamage(world, best, 1e6, 1, 0, 0, p.id, "pistol");
}

function run(seed: number) {
  const { world, rng, players, brutes, stage } = layout(seed);
  const violations: string[] = [];
  const knocks0 = bruteStats.knocks;
  const hitPlayer = new Set<number>();
  const hitBuilding = new Set<number>();
  const reached = new Set<number>();
  world.events.subscribe((e) => {
    if (e.type === "player.damaged" && e.sourceZombieId >= 0 && world.zombies.type[e.sourceZombieId] === BRUTE) hitPlayer.add(e.sourceZombieId);
  });
  const hp = new Map<number, number>();
  for (const b of world.buildings.list) hp.set(b.id, b.hp);
  const navWalls = Array.from(world.pathing.nav.wallAt);
  const wideWalls = Array.from(world.pathing.wide.wallAt);
  let stoppedKnocks = 0;
  let seq = 0;
  const changeAt = stage < 3 ? TICKS / 2 : -1;
  for (let t = 0; t < TICKS; t++) {
    if (t === changeAt) changeDecayStage(world, stage + 1); // the build start's path (walls rewritten here only)
    for (const p of players) {
      // Mostly still; sometimes press into the nearest solid (the knock then slides along it).
      const walk = rng.int(0, 9) === 0;
      setInput(world, p.id, { ...NEUTRAL_INPUT, seq: ++seq, moveX: walk ? rng.range(-1, 1) : 0, moveY: walk ? rng.range(-1, 1) : 0 });
    }
    // The team thins the crowd (one kill per player per second, never a Brute): crowds come and go
    // round the players instead of jamming a lane for good.
    if (t % 20 === 0) for (const p of players) killNearestCrowd(world, p);
    const before = players.map((p) => [p.x, p.y, p.knockTicks] as const);
    step(world, TICK_DT_S);
    const z = world.zombies;
    for (const id of brutes) {
      if (z.alivePos[id] === -1) continue;
      const where = insideBox(world, z.x[id] as number, z.y[id] as number, 0.6);
      if (where) violations.push(`seed ${seed} t ${t}: Brute ${id} inside ${where}`);
    }
    players.forEach((p, i) => {
      const where = insideBox(world, p.x, p.y, p.radiusM);
      if (where) violations.push(`seed ${seed} t ${t}: ${p.id} inside ${where}${p.knockTicks > 0 ? " (knocked)" : ""}`);
      const [bx, by, bk] = before[i] as readonly [number, number, number];
      // A knock tick (no steering: the player's own walk may enter fire, the knock never does).
      if (bk > 0 && world.decay.fires.length > 0 && circleInFire(world.decay.fires, p.x, p.y, p.radiusM) && !circleInFire(world.decay.fires, bx, by, p.radiusM)) violations.push(`seed ${seed} t ${t}: ${p.id} knocked into fire`);
      if (bk > 0 && Math.hypot(p.x - bx, p.y - by) < 0.37) stoppedKnocks++; // a knock tick that slid or stopped at something
    });
    // Review M1 (tightened): a Brute counts only by landing a hit (player or building); the one
    // excuse is that every standing player is out of its reach: deeper than `gapReachM` (+ half a
    // cell) from every free wide-grid cell it could stand on (`safeFromBrutes`).
    if (players.every((p) => p.status !== "alive" || safeFromBrutes(world, p))) for (const id of brutes) reached.add(id);
    // … or another Brute that is landing hits holds it off (two 1.2 m bodies round one cornered player).
    for (const id of brutes) {
      if (z.alivePos[id] === -1 || reached.has(id) || hitPlayer.has(id)) continue;
      for (const o of brutes) {
        if (o !== id && hitPlayer.has(o) && z.alivePos[o] !== -1 && Math.hypot((z.x[o] as number) - (z.x[id] as number), (z.y[o] as number) - (z.y[id] as number)) <= 1.3) reached.add(id);
      }
    }
    for (const b of world.buildings.list) {
      const was = hp.get(b.id);
      if (was !== undefined && b.hp < was) {
        for (const id of brutes) if (z.alivePos[id] !== -1 && distanceToBox(z.x[id] as number, z.y[id] as number, b.minX, b.minY, b.maxX, b.maxY) <= 0.65) hitBuilding.add(id);
      }
      hp.set(b.id, b.hp);
    }
    if (t < changeAt || changeAt < 0) {
      if (world.pathing.nav.wallAt.some((v, i) => v !== navWalls[i]) || world.pathing.wide.wallAt.some((v, i) => v !== wideWalls[i])) violations.push(`seed ${seed} t ${t}: walls rewritten outside a build start`);
    }
  }
  const z = world.zombies;
  const stalled = brutes
    .filter((id) => !hitPlayer.has(id) && !hitBuilding.has(id) && !reached.has(id))
    .map((id) => `${id}${z.alivePos[id] === -1 ? " dead" : ""} @${(z.x[id] as number).toFixed(2)},${(z.y[id] as number).toFixed(2)} st ${z.state[id]} | players ${players.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)} ${p.status}`).join(" ")} stage ${world.decay.stage} | near ${[...world.buildings.list, ...world.obstacles.solids].filter((b) => players.some((p) => distanceToBox(p.x, p.y, b.minX, b.minY, b.maxX, b.maxY) < 4)).map((b) => `${"type" in b ? b.type : b.name}[${b.minX},${b.minY},${b.maxX},${b.maxY}]`).join(" ")} | wide ${world.pathing.wideChase.front[Math.floor((z.y[id] as number) / 0.5) * 96 + Math.floor((z.x[id] as number) / 0.5)]} src ${world.pathing.wideChase.sourceTick}`);
  return { violations, knocks: bruteStats.knocks - knocks0, stalled, players: players.length, stoppedKnocks, buildingHits: hitBuilding.size, hitPlayers: hitPlayer.size, brutes: brutes.length };
}

describe("Brute fuzz (Story 5.7, brief line 7): random layouts × stages × 3,000 ticks", () => {
  it(`${LAYOUTS} layouts: no Brute or player in a box, nobody knocked into fire, no stall, walls only at the stage change`, () => {
    const all: string[] = [];
    let knocks = 0;
    let stopped = 0;
    let buildingHits = 0;
    let hitters = 0;
    let total = 0;
    const b0 = bruteStats.buildingHits;
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const r = run(seed);
      all.push(...r.violations.slice(0, 3));
      if (r.players > 0) expect(r.knocks, `seed ${seed}: liveness, a knockback (${JSON.stringify({ ...r, violations: r.violations.length })})`).toBeGreaterThanOrEqual(1);
      expect(r.stalled, `seed ${seed}: Brutes that never hit a player or a building`).toEqual([]);
      knocks += r.knocks;
      stopped += r.stoppedKnocks;
      buildingHits += r.buildingHits;
      hitters += r.hitPlayers;
      total += r.brutes;
    }
    expect(hitters / total).toBeGreaterThan(0.5); // most Brutes really landed a hit
    expect(all).toEqual([]);
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[brute fuzz] ${LAYOUTS} layouts: ${knocks} knockbacks, ${stopped} knock ticks stopped short, Brute building hits ${bruteStats.buildingHits - b0}, Brutes that broke in ${buildingHits}, Brutes that hit a player ${hitters}/${total}`);
    expect(knocks).toBeGreaterThan(LAYOUTS);
    expect(stopped).toBeGreaterThan(0); // knocks really met cover
    expect(bruteStats.buildingHits - b0).toBeGreaterThan(0);
  }, 600_000);
});

describe("Brute reachability (Story 5.7, the 4.5 pattern with the wide field)", () => {
  it("a lone Brute from every open spawn × every stage (1–3) × a spread of variant masks reaches the team start", () => {
    let total = 0;
    for (const stage of [1, 2, 3]) {
      for (let k = 0; k < MASKS.length; k += stage === 1 ? MASKS.length : 4) {
        const w = createWorld({ balance, seed: 4, map, systems: { waves: () => {} } });
        w.debug.godMode = true;
        w.decay.variants = MASKS[k] as number;
        applyDecayStage(w, stage, w.decay.variants);
        const at = { x: 0, y: 0 };
        for (let slot = 0; slot < 2; slot++) {
          teamSpawnPoint(w, slot, at);
          addPlayer(w, `p${slot}`, at.x, at.y);
        }
        const states = spawnPointStates(w, new Uint8Array(map.spawnPoints.length));
        const ids: [number, string][] = [];
        map.spawnPoints.forEach((sp, i) => {
          if (states[i] === SPAWN_STATE.CLOSED) return;
          jitteredSpawn(w, sp, 0, 0.6, at);
          ids.push([spawnZombie(w, "brute", at.x, at.y), sp.name]);
        });
        const reached = new Set<number>();
        for (let t = 0; t < 20 * 120 && reached.size < ids.length; t++) {
          step(w, TICK_DT_S);
          const z = w.zombies;
          for (const [id] of ids) {
            if (reached.has(id)) continue;
            const x = z.x[id] as number;
            const y = z.y[id] as number;
            for (const p of w.players.values()) if (Math.hypot(p.x - x, p.y - y) <= 3 && !segmentHitsBuildings(w, x, y, p.x, p.y, 0)) reached.add(id);
          }
        }
        const missed = ids.filter(([id]) => !reached.has(id)).map(([, n]) => n);
        expect(missed, `stage ${stage} mask ${MASKS[k]}`).toEqual([]);
        total += ids.length;
      }
    }
    expect(total).toBeGreaterThan(100); // liveness
  }, 600_000);
});
