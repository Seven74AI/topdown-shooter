import { beforeEach, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { shotLineClear } from "../combat/cover";
import { applyZombieDamage } from "../combat/damage";
import { createExplosionSpec, explode } from "../combat/explosion";
import { createRng, type Rng } from "../core/rng";
import { DAMAGE_SOURCE_EXPLOSION, type SimEvent } from "../core/simEvents";
import { ticksFor } from "../core/time";
import { createWorld, step, type World } from "../core/world";
import { applyDecayStage } from "../decay/applyDecayStage";
import { circleInFire, legalDecayMasks } from "../decay/decayState";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { spotBlocked } from "../player/freeSpot";
import { addPlayer, type PlayerState } from "../player/player";
import { jitteredSpawn, spawnJitterFor } from "../waves/waveDirector";
import { SPAWN_STATE, spawnPointStates } from "../waves/spawnPick";
import { BLOATER_BLAST_WEAPON, blastTrace, bloaterStats, resetBloaterStats } from "./bloater";
import { isZombieAlive, killZombie, spawnZombie } from "./zombiePool";
import { ZOMBIE_TYPES, zombieTypeIndex, type ZombieTypeId } from "./zombieTypes";

/**
 * Story 5.8 (AC 9, brief line 7): Bloaters in random Downtown layouts × decay stages 1–3 (car fires
 * at stage 3) × 4 players (1e9 HP: the blasts really hit them) pressed against cover, barricades and
 * turrets round them, ~40 Bloaters and a Walker crowd from the open spawns, killed at random by
 * bullets (credited), grenade-like blasts, fire (nobody) and removed by dev cheats, for thousands of
 * ticks. Checks:
 *
 * (i) every Bloater that died bursts exactly once, none that was removed does; (ii) every swell
 * ends in a blast (or a kill) within `swellTicks` (+ 1 queued tick); (iii) every blast's player and
 * zombie hits equal an independent rewrite of overlap + line of sight (`shotLineClear`); (iv) no
 * body inside a box (map solids, active cover, wall buildings) after any push; (v) no stall: swells
 * happen and zombies reach players; (vii) the queue never overflowed; (viii) the gas slows only
 * players with a line of sight to a live cloud. (vi, no flow-field rebuild outside a build start,
 * is covered by the existing `downtown.fuzz.test.ts`, which now spawns Bloaters too.)
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const LAYOUTS = 8;
const TICKS = 4000;
const MASKS = legalDecayMasks(map);
const BLOATER = zombieTypeIndex("bloater");
const EX = balance.zombies.types.bloater?.explodes as NonNullable<NonNullable<typeof balance.zombies.types.bloater>["explodes"]>;
const SWELL = ticksFor(EX.swellS);
const LINGER = ticksFor(EX.gasLingerS);
const GAS = ticksFor(EX.gasS);
const EPS = 1e-5;
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function insideBox(world: World, x: number, y: number, r: number): string | null {
  for (const s of world.obstacles.solids) if (circleOverlapsBox(x, y, r - EPS, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (b.solid && circleOverlapsBox(x, y, r - EPS, b.minX, b.minY, b.maxX, b.maxY)) return `${b.type} ${b.id}`;
  return null;
}

function spotAtCover(world: World, rng: Rng, r: number): { x: number; y: number } | null {
  for (let tries = 0; tries < 400; tries++) {
    const s = world.obstacles.solids[rng.int(0, world.obstacles.solids.length - 1)] as MapBox;
    const gap = r + rng.range(0.02, 0.6);
    const side = rng.int(0, 3);
    const x = side === 0 ? s.minX - gap : side === 1 ? s.maxX + gap : rng.range(s.minX, s.maxX);
    const y = side === 2 ? s.minY - gap : side === 3 ? s.maxY + gap : rng.range(s.minY, s.maxY);
    if (x < r + 0.1 || y < r + 0.1 || x > map.widthM - r - 0.1 || y > map.heightM - r - 0.1) continue;
    if (spotBlocked(world, x, y, r, null)) continue;
    if (world.decay.fires.length > 0 && circleInFire(world.decay.fires, x, y, r)) continue;
    return { x, y };
  }
  return null;
}

function layout(seed: number) {
  const rng = createRng(seed * 4219 + 7);
  const world = createWorld({ balance, seed, map, systems: { waves: () => {} } });
  const stage = 1 + (seed % 3);
  world.decay.variants = MASKS[(seed * 3) % MASKS.length] as number;
  applyDecayStage(world, stage, world.decay.variants);
  const players: PlayerState[] = [];
  for (let i = 0; i < 4; i++) {
    const at = spotAtCover(world, rng, balance.player.radiusM);
    if (!at) continue;
    const p = addPlayer(world, `p${i}`, at.x, at.y);
    p.hp = 1e9;
    p.maxHp = 1e9;
    players.push(p);
  }
  let id = 1;
  const want = rng.int(4, 14);
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
  const states = spawnPointStates(world, new Uint8Array(map.spawnPoints.length));
  const open = map.spawnPoints.filter((_, i) => states[i] !== SPAWN_STATE.CLOSED && states[i] !== SPAWN_STATE.BLOCKED);
  const at = { x: 0, y: 0 };
  const spawn = (type: ZombieTypeId): number => {
    const sp = open[rng.int(0, open.length - 1)] as { x: number; y: number };
    const r = balance.zombies.types[type]?.radiusM ?? 0;
    const j = spawnJitterFor(balance, r);
    jitteredSpawn(world, sp, rng.range(-j, j), r, at);
    return spawnZombie(world, type, at.x, at.y);
  };
  return { world, rng, players, spawn, stage };
}

/** The independent rewrite of FR-C/D: who a blast at (x, y) hits right now. */
function expectedHits(world: World, x: number, y: number): { players: string[]; zombies: number } {
  const players: string[] = [];
  world.players.forEach((p) => {
    if (p.status !== "alive") return;
    if (Math.hypot(p.x - x, p.y - y) < EX.blastRadiusM + p.radiusM && shotLineClear(world, x, y, p.x, p.y)) players.push(p.id);
  });
  let zombies = 0;
  const z = world.zombies;
  for (let k = 0; k < z.aliveCount; k++) {
    const id = z.aliveIds[k] as number;
    const r = balance.zombies.types[ZOMBIE_TYPES[z.type[id] as number] as string]?.radiusM ?? 0;
    if (Math.hypot((z.x[id] as number) - x, (z.y[id] as number) - y) < EX.blastRadiusM + r && shotLineClear(world, x, y, z.x[id] as number, z.y[id] as number)) zombies++;
  }
  return { players, zombies };
}

beforeEach(() => {
  resetBloaterStats();
  blastTrace.fn = null;
});

describe("Story 5.8 Bloater fuzz (AC 9): random Downtown layouts × stages × 4 players × ~40 Bloaters", () => {
  it("every death bursts once, every swell ends, hits match the rule, no body in a box, no overflow, gas only with a line of sight", () => {
    let totalBursts = 0;
    let totalSwells = 0;
    let totalChains = 0;
    let totalPlayerHits = 0;
    let totalProbes = 0;
    const lines: string[] = [];
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const { world, rng, players, spawn, stage } = layout(seed);
      expect(players.length).toBeGreaterThan(0);
      const events: SimEvent[] = [];
      world.events.subscribe((e) => events.push(e));
      const bloaters = new Set<number>();
      for (let i = 0; i < 40; i++) bloaters.add(spawn("bloater"));
      for (let i = 0; i < 25; i++) spawn("walker");
      bloaters.delete(-1);
      const died = new Map<number, number>(); // Bloater slot → tick it died (not removed)
      const removed = new Set<number>();
      const swellAt = new Map<number, number>();
      let expectedPlayers = new Set<string>();
      let expectedZombieHits = 0;
      let blastsThisTick = 0;
      blastTrace.fn = (x, y) => {
        blastsThisTick++;
        const e = expectedHits(world, x, y);
        for (const p of e.players) expectedPlayers.add(p);
        expectedZombieHits += e.zombies;
      };
      let bursts = 0;
      let coverProbes = 0;
      for (let t = 0; t < TICKS; t++) {
        // Random deaths between ticks (as the combat system would cause them).
        if (rng.int(0, 49) === 0) {
          const z = world.zombies;
          if (z.aliveCount > 0) {
            const id = z.aliveIds[rng.int(0, z.aliveCount - 1)] as number;
            const how = rng.int(0, 9);
            if (how < 4) applyZombieDamage(world, id, 1000, 1, 0, 0, `p${rng.int(0, 3)}`, "pistol");
            else if (how < 6) explode(world, { ...createExplosionSpec(), x: z.x[id] as number, y: z.y[id] as number, radiusM: 1.5, zombieDamage: 100, playerDamage: 0, sourcePlayerId: "p0", weapon: "grenade_launcher", buildingId: 0, kind: "grenade" });
            else if (how < 8) killZombie(world, id, null, "fire");
            else {
              if (z.type[id] === BLOATER) removed.add(id | ((z.generation[id] as number) << 16));
              killZombie(world, id, null, "cheat");
            }
          }
        }
        // Review L3: a cover probe every 100 ticks: a Bloater lit right behind cover from a player (a
        // car, the bus, a building between them, within the blast's reach), so the cover rule is exercised.
        if (t % 100 === 50) {
          const p = players[rng.int(0, players.length - 1)] as PlayerState;
          for (let tries = 0; tries < 60; tries++) {
            const a = rng.range(0, Math.PI * 2);
            const d = rng.range(1.2, EX.blastRadiusM + p.radiusM - 0.1);
            const bx = p.x + Math.cos(a) * d;
            const by = p.y + Math.sin(a) * d;
            if (bx < 1 || by < 1 || bx > map.widthM - 1 || by > map.heightM - 1) continue;
            if (insideBox(world, bx, by, 0.5) !== null || shotLineClear(world, bx, by, p.x, p.y)) continue;
            const id = spawnZombie(world, "bloater", bx, by);
            if (id < 0) break;
            bloaters.add(id);
            world.zombies.state[id] = 5; // SWELL, fuse almost out: it bursts in pass 4 of the next tick
            world.zombies.swellTicks[id] = 1;
            coverProbes++;
            break;
          }
        }
        // Death bookkeeping for (i)/(ii): everything emitted so far (between ticks and the last tick).
        expectedPlayers = new Set();
        expectedZombieHits = 0;
        blastsThisTick = 0;
        events.length = 0;
        step(world, TICK_DT_S);
        for (const e of events) {
          if (e.type === "zombie.killed" && world.zombies.type[e.zombieId] === BLOATER && e.weapon !== "cheat" && e.weapon !== "decay") {
            const key = e.zombieId | ((world.zombies.generation[e.zombieId] as number) << 16);
            expect(died.has(key), `slot ${e.zombieId} died twice`).toBe(false);
            died.set(key, world.tick);
          }
          if (e.type === "bloater.swell_started") {
            swellAt.set(e.zombieId | ((world.zombies.generation[e.zombieId] as number) << 16), world.tick);
            totalSwells++;
          }
          if (e.type === "bloater.burst") bursts++;
        }
        // (iii) the blasts of this tick hit exactly the bodies the rule says.
        const hitPlayers = new Set(events.filter((e) => e.type === "player.damaged" && e.sourceZombieId === DAMAGE_SOURCE_EXPLOSION).map((e) => (e as { playerId: string }).playerId));
        const hitZombies = events.filter((e) => e.type === "zombie.hit" && e.weapon === BLOATER_BLAST_WEAPON).length;
        // Review L3: compare on every tick a Bloater blast fired (the test grenades between ticks have no player damage).
        if (blastsThisTick > 0) {
          expect([...hitPlayers].sort(), `seed ${seed} tick ${t}`).toEqual([...expectedPlayers].sort());
          expect(hitZombies, `seed ${seed} tick ${t}`).toBe(expectedZombieHits);
        }
        totalPlayerHits += hitPlayers.size;
        // (ii) a swell ends in a blast within swellTicks + 1.
        for (const [key, at] of swellAt) {
          const zid = key & 0xffff;
          const same = isZombieAlive(world.zombies, zid) && world.zombies.generation[zid] === key >>> 16;
          if (world.tick - at > SWELL + 1) expect(same, `seed ${seed}: the swell of ${zid} never ended`).toBe(false);
          if (!same) swellAt.delete(key);
        }
        // (iv) no body inside a box.
        const z = world.zombies;
        for (let k = 0; k < z.aliveCount; k++) {
          const id = z.aliveIds[k] as number;
          const r = balance.zombies.types[ZOMBIE_TYPES[z.type[id] as number] as string]?.radiusM ?? 0;
          const inBox = insideBox(world, z.x[id] as number, z.y[id] as number, r);
          expect(inBox, `seed ${seed} tick ${t}: zombie ${id} inside ${inBox}`).toBeNull();
        }
        // (viii) a player slowed this tick (only the gas slows here: no Crawlers) sees a cloud of this tick.
        for (const p of world.players.values()) {
          if (p.slowTicksLeft !== LINGER) continue;
          let seen = false;
          const g = world.gas;
          for (let i = 0; i < g.capacity && !seen; i++) {
            if ((g.bornTick[i] as number) < world.tick - GAS - 1) continue;
            if (Math.hypot(p.x - (g.x[i] as number), p.y - (g.y[i] as number)) < (g.radiusM[i] as number) + p.radiusM && shotLineClear(world, g.x[i] as number, g.y[i] as number, p.x, p.y)) seen = true;
          }
          expect(seen, `seed ${seed} tick ${t}: ${p.id} slowed without a cloud in sight`).toBe(true);
        }
      }
      // Drain: let every queued blast and swell finish (no new deaths).
      for (let t = 0; t < SWELL + 5; t++) {
        events.length = 0;
        expectedPlayers = new Set();
        expectedZombieHits = 0;
        step(world, TICK_DT_S);
        for (const e of events) {
          if (e.type === "zombie.killed" && world.zombies.type[e.zombieId] === BLOATER && e.weapon !== "cheat" && e.weapon !== "decay") died.set(e.zombieId | ((world.zombies.generation[e.zombieId] as number) << 16), world.tick);
          if (e.type === "bloater.burst") bursts++;
        }
      }
      // (i) bursts = deaths (keyed by slot and generation: the cover probes reuse slots).
      expect(world.blasts.count).toBe(0);
      const deaths = [...died.keys()].length;
      expect(bursts, `seed ${seed}`).toBe(deaths);
      for (const id of removed) expect(died.has(id), `removed ${id} burst`).toBe(false);
      expect(bloaterStats.overflow).toBe(0); // (vii)
      totalBursts += bursts;
      totalProbes += coverProbes;
      totalChains = bloaterStats.chainBlasts;
      lines.push(`seed ${seed} stage ${stage}: ${players.length} players, ${bursts} bursts, ${deaths} Bloater deaths, ${removed.size} removed, swells so far ${totalSwells}`);
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[fuzz] Story 5.8 Bloaters:\n${lines.join("\n")}\nchains ${totalChains}, blast hits on players ${totalPlayerHits}`);
    // (v) liveness: Bloaters reached players and swelled; blasts happened, chained and hit players.
    expect(totalSwells).toBeGreaterThan(0);
    expect(totalBursts).toBeGreaterThan(LAYOUTS * 10);
    expect(totalChains).toBeGreaterThan(0);
    expect(totalPlayerHits).toBeGreaterThan(0);
    expect(totalProbes).toBeGreaterThan(LAYOUTS * 5); // review L3: blasts behind cover really happened
  }, 600_000);
});
