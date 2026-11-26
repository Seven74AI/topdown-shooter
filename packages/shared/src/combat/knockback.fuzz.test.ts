import { beforeAll, describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { applyDecayStage } from "../decay/applyDecayStage";
import { gameplayDecayMasks } from "../decay/decayState";
import { createRng, type Rng } from "../core/rng";
import { createWorld, setInput, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { startBuild, startWave } from "../run/runStateMachine";
import { isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { segmentBoxEntryT } from "./cover";
import { knockbackTrace } from "./damage";
import { knockbacks, updateCombat } from "./firing";
import type { SystemFn } from "../core/systems";
import { setLoadout } from "./loadout";

/**
 * Story 5.3 (brief line 7): knockback is spatial, so it gets a fuzz. Downtown, random legal decay
 * layouts (stage 1–3 × every legal variant mask, round robin) × random placement-validated barricade
 * and turret layouts (half of them hugging a map box or cover face, half round the player) × 2,000
 * ticks of a solo god-mode Shotgun player blasting the nearest zombie while real waves run (from
 * wave 4, the wave director and the run's build timer on).
 *
 * Every tick: no zombie body overlaps a map solid (car, bus, building box, barrier, sandbags) or a
 * player building (beyond Float32 noise); no zombie centre crossed into or through any box this tick
 * (its centre segment never enters a box: the side test before/after); none left the map. The
 * flow field is rasterized only when the buildings changed (`nav.version` follows
 * `buildings.version`, i.e. a barricade broken or a build start). Zombies still reach the player
 * (≥ 1 contact in every layout whose zombies can't die; the others must clear waves). Liveness: ≥ 500 knockbacks in total, ≥ 20 stopped early at a face,
 * ≥ 100 shotgun kills.
 */
// More waves than a real run, so the 2,000 ticks never end in the results screen.
const balance = loadBalance(withOverrides(bundledBalanceFiles(), [["waves", "runWaves", 20]]));
const map = DOWNTOWN_MAP;
const MASKS = gameplayDecayMasks(map);
const LAYOUTS = 16;
/** Story 5.2: four players per layout cost about four times the swings: fewer layouts. */
const AXE_LAYOUTS = 10;
const TICKS = 2000;
const ZOMBIE_EPS_M = 1e-5;
/**
 * Right after the combat system (before the zombie system's push-out could hide a bad knockback), a
 * body may overlap a box only by the turrets' unswept 0.05 m hit pushback (pre-existing, Story 3.6).
 */
const AFTER_COMBAT_EPS_M = (balance.buildings.types.auto_turret?.turret?.hitPushbackM ?? 0) + ZOMBIE_EPS_M;
const TYPES = ["wood_barricade", "wood_barricade", "auto_turret"] as const;
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function placeRandom(world: World, rng: Rng, px: number, py: number): number {
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 6; tries++) {
    const type = TYPES[rng.int(0, TYPES.length - 1)] as string;
    const stats = buildingStats(balance, type);
    if (!stats) throw new Error(type);
    const rot = rng.int(0, 3) as BuildingRotation;
    let gx: number;
    let gy: number;
    if (rng.next() < 0.5) {
      // round the player, 1.5–6 m out: the crowd gets knocked into them
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(1.5, 6);
      gx = Math.round((px + Math.cos(a) * d) / BUILD_GRID_M);
      gy = Math.round((py + Math.sin(a) * d) / BUILD_GRID_M);
    } else {
      const solids = world.obstacles.solids;
      const s = solids[rng.int(0, solids.length - 1)] as MapBox;
      gx = Math.round(rng.range(s.minX - 2, s.maxX + 1) / BUILD_GRID_M);
      gy = Math.round(rng.range(s.minY - 2, s.maxY + 1) / BUILD_GRID_M);
    }
    footprint(stats, gx, gy, rot, box);
    if (footprintBlocked(world, box)) continue;
    addBuildingAt(world, { id: world.buildings.nextId, type, ownerId: "p0", gx, gy, rot, hp: stats.hp });
    placed++;
  }
  return placed;
}

/** First box the zombie body overlaps (r − eps), or null. */
function overlapping(world: World, x: number, y: number, r: number, eps = ZOMBIE_EPS_M): string | null {
  for (const s of world.obstacles.solids) if (circleOverlapsBox(x, y, r - eps, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (circleOverlapsBox(x, y, r - eps, b.minX, b.minY, b.maxX, b.maxY)) return `building ${b.id}`;
  return null;
}

/** The body touches (within 1 mm) a map solid. */
function touchesMapBox(world: World, x: number, y: number, r: number): boolean {
  for (const s of world.obstacles.solids) if (circleOverlapsBox(x, y, r + 1e-3, s.minX, s.minY, s.maxX, s.maxY)) return true;
  return false;
}

/** The centre's move this tick entered a box (crossed a face into or through it). */
function crossed(world: World, x0: number, y0: number, x1: number, y1: number): string | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0 && dy === 0) return null;
  for (const s of world.obstacles.solids) if (segmentBoxEntryT(x0, y0, dx, dy, s.minX, s.minY, s.maxX, s.maxY) >= 0) return s.name;
  for (const b of world.buildings.list) if (segmentBoxEntryT(x0, y0, dx, dy, b.minX, b.minY, b.maxX, b.maxY) >= 0) return `building ${b.id}`;
  return null;
}

interface FuzzCase {
  /** One loadout per player (p0, p1, …), god mode, standing at the team spawn points. */
  loadouts: readonly (readonly [string, string | null])[];
  layouts: number;
  /** Kills credited to these weapons count for the liveness check. */
  weapons: readonly string[];
  minApplied: number;
  minStopped: number;
  minKills: number;
  /** A killable layout that didn't finish wave 4 must still have this many kills (no stall). */
  minLayoutKills: number;
  /** Story 5.2: stand the players 1–2.5 m off a random map box's faces (crowds get knocked into cover), not at the team spawn. */
  nearCover?: boolean;
}

/** A spot 1–2.5 m off a face of a random map box, clear of every box and building (or the team spawn after 60 tries). */
function nearCoverSpot(world: World, rng: Rng, slot: number): { x: number; y: number } {
  const solids = world.obstacles.solids;
  const r = balance.player.radiusM;
  for (let k = 0; k < 60; k++) {
    const s = solids[rng.int(0, solids.length - 1)] as MapBox;
    const side = rng.int(0, 3);
    const off = rng.range(1, 2.5);
    const x = side === 0 ? s.minX - off : side === 1 ? s.maxX + off : rng.range(s.minX, s.maxX);
    const y = side === 2 ? s.minY - off : side === 3 ? s.maxY + off : rng.range(s.minY, s.maxY);
    if (x < r + 1 || y < r + 1 || x > map.widthM - r - 1 || y > map.heightM - r - 1) continue;
    if (overlapping(world, x, y, r + 0.2, 0) === null) return { x, y };
  }
  return teamSpawnPoint(world, slot, { x: 0, y: 0 });
}

/**
 * The fuzz (Story 5.3; Story 5.2 runs it again with four Fire Axe players), one test per layout + the totals: every player aims
 * at its nearest zombie with fire held.
 */
function fuzzSuite(label: string, c: FuzzCase): void {
  // E8-A8 (no test over 30 s): one test per layout, then the totals over all of them. Same seeds, order and assertions
  // as the old single test (57 s / 61 s in CI); the layouts share the counters below, so the totals need every layout
  // test above to have run (a -t filter on one layout fails them).
  let applied0 = 0;
  let stopped0 = 0;
  beforeAll(() => {
    applied0 = knockbacks.applied;
    stopped0 = knockbacks.stopped;
  });
  let kills = 0;
  let buildingsPlaced = 0;
  let navRebuildsOutsideBuildChanges = 0;
  let legs = 0;
  let stoppedByMap = 0;
  const prevX = new Float32Array(512);
  const prevY = new Float32Array(512);
  const prevGen = new Int16Array(512).fill(-1);
  /** Positions right after combat (the start of the zombie system's leg). */
  const midX = new Float32Array(512);
  const midY = new Float32Array(512);
  const ids = c.loadouts.map((_, i) => `p${i}`);
  let layoutsRun = 0;
  it.each(Array.from({ length: c.layouts }, (_, i) => i + 1))(`layout %i of ${c.layouts}`, (seed) => {
    const rng = createRng(seed * 7717);
    const killsBefore = kills;
    let afterCombatChecks = 0;
    // The real combat system, then the check on every body it may have moved.
    const combatChecked: SystemFn = (w, dt) => {
      knockbackTrace.fn = (id, x0, y0, x1, y1) => {
        // Story 5.2: each knockback leg on its own: its centre never enters a box (into or through it).
        const through = crossed(w, x0, y0, x1, y1);
        if (through) throw new Error(`${label} seed ${seed} tick ${w.tick} zombie ${id}: knocked through ${through}`);
        legs++;
        const rz = balance.zombies.types[zombieTypeOf(w.zombies, id)]?.radiusM ?? 0;
        if (Math.hypot(x1 - x0, y1 - y0) < 1.5 * 0.999 && touchesMapBox(w, x1, y1, rz)) stoppedByMap++;
      };
      updateCombat(w, dt);
      knockbackTrace.fn = null;
      const zp = w.zombies;
      for (let i = 0; i < zp.aliveCount; i++) {
        const id = zp.aliveIds[i] as number;
        const r = balance.zombies.types[zombieTypeOf(zp, id)]?.radiusM ?? 0;
        const x = zp.x[id] as number;
        const y = zp.y[id] as number;
        const hit = overlapping(w, x, y, r, AFTER_COMBAT_EPS_M);
        if (hit) throw new Error(`${label} seed ${seed} tick ${w.tick} zombie ${id}: knocked into ${hit} (after combat)`);
        // Story 5.2: the zombie system's leg starts here (a 1.5 m knock and a slide round a corner
        // after it can make a whole-tick chord across a corner that neither leg crosses).
        midX[id] = x;
        midY[id] = y;
      }
      afterCombatChecks++;
    };
    const world = createWorld({ balance, seed, map, systems: { combat: combatChecked } });
    world.debug.godMode = true;
    world.decay.variants = MASKS[seed % MASKS.length] as number;
    applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
    const players = c.loadouts.map((lo, i) => {
      const at = c.nearCover ? nearCoverSpot(world, rng, i) : teamSpawnPoint(world, i, { x: 0, y: 0 });
      const pl = addPlayer(world, ids[i] as string, at.x, at.y);
      setLoadout(balance, pl.loadout, lo);
      return pl;
    });
    const p = players[0] as (typeof players)[number];
    startBuild(world);
    buildingsPlaced += placeRandom(world, rng, p.x, p.y);
    world.waves.number = 3; // wave 4: a real crowd
    startWave(world);
    world.events.subscribe((e) => {
      if (e.type === "zombie.killed" && c.weapons.includes(e.weapon)) kills++;
    });
    // Even layouts: unkillable zombies (the stun-lock question: do they still get to us?).
    const tough = seed % 2 === 0;
    let contacts = 0;
    let seq = 0;
    prevGen.fill(-1);
    const z = world.zombies;
    for (let t = 0; t < TICKS; t++) {
      seq++;
      for (const pl of players) {
        // aim at the nearest zombie (mouse aim: no assist), fire held
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < z.aliveCount; i++) {
          const id = z.aliveIds[i] as number;
          const d = Math.hypot((z.x[id] as number) - pl.x, (z.y[id] as number) - pl.y);
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
        const ax = best >= 0 ? (z.x[best] as number) - pl.x : 1;
        const ay = best >= 0 ? (z.y[best] as number) - pl.y : 0;
        const al = Math.hypot(ax, ay) || 1;
        setInput(world, pl.id, { ...NEUTRAL_INPUT, seq, aimX: ax / al, aimY: ay / al, fire: best >= 0, isMouse: true });
      }
      for (let i = 0; i < z.aliveCount; i++) {
        const id = z.aliveIds[i] as number;
        if (tough) z.hp[id] = 1e6;
        prevX[id] = z.x[id] as number;
        prevY[id] = z.y[id] as number;
        prevGen[id] = z.generation[id] as number;
      }
      const buildingsBefore = world.buildings.version;
      const navBefore = world.pathing.nav.version;
      step(world, TICK_DT_S);
      // the nav grid is re-rasterized only to catch up with a building change (never by a knockback)
      if (world.pathing.nav.version !== navBefore && navBefore === buildingsBefore && world.buildings.version === buildingsBefore) navRebuildsOutsideBuildChanges++;
      for (let i = 0; i < z.aliveCount; i++) {
        const id = z.aliveIds[i] as number;
        const x = z.x[id] as number;
        const y = z.y[id] as number;
        const r = balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
        const where = `${label} seed ${seed} tick ${t} zombie ${id} at (${x.toFixed(3)}, ${y.toFixed(3)})`;
        expect(overlapping(world, x, y, r), `${where}: body in a box`).toBeNull();
        expect(x >= r - ZOMBIE_EPS_M && y >= r - ZOMBIE_EPS_M && x <= map.widthM - r + ZOMBIE_EPS_M && y <= map.heightM - r + ZOMBIE_EPS_M, `${where}: off the map`).toBe(true);
        if (prevGen[id] === z.generation[id] && isZombieAlive(z, id)) expect(crossed(world, midX[id] as number, midY[id] as number, x, y), `${where}: crossed a box (zombie system leg)`).toBeNull();
        for (const pl of players) if (Math.hypot(x - pl.x, y - pl.y) <= r + pl.radiusM + 0.1) contacts++;
      }
    }
    expect(afterCombatChecks).toBe(TICKS); // the check really ran every tick
    if (tough) expect(contacts, `${label} seed ${seed}: no zombie ever reached a player`).toBeGreaterThan(0);
    // Killable layouts: the waves move on, or (four slow axes vs a four-player wave) the kills keep coming.
    else expect(world.waves.number > 4 || kills - killsBefore >= c.minLayoutKills, `${label} seed ${seed}: the waves stalled (wave ${world.waves.number}, ${kills - killsBefore} kills)`).toBe(true);
    layoutsRun++;
  }, 120_000);

  it(`the ${c.layouts} layouts together: enough knockback legs, knockbacks, stops at a face, buildings and kills; no nav rebuild`, () => {
    expect(layoutsRun, "every layout test above ran and passed").toBe(c.layouts);
    const applied = knockbacks.applied - applied0;
    const stopped = knockbacks.stopped - stopped0;
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`${label}: ${c.layouts} layouts, ${buildingsPlaced} buildings, ${applied} knockbacks, ${stopped} stopped at a face (${stoppedByMap} by a map box), ${kills} kills by ${c.weapons.join("/")}`);
    expect(legs).toBeGreaterThanOrEqual(c.minApplied); // the per-leg check really ran
    expect(navRebuildsOutsideBuildChanges, `${label}: nav rebuilt without a building change`).toBe(0);
    expect(buildingsPlaced).toBeGreaterThan(c.layouts * 2);
    expect(applied).toBeGreaterThanOrEqual(c.minApplied);
    expect(stopped).toBeGreaterThanOrEqual(c.minStopped);
    if (c.nearCover) expect(stoppedByMap, `${label}: knockbacks really met map boxes (cars, bus, buildings, barriers)`).toBeGreaterThanOrEqual(c.minStopped);
    expect(kills).toBeGreaterThanOrEqual(c.minKills);
  });
}

describe("Shotgun knockback fuzz (Story 5.3, brief line 7)", () => {
  describe("random decay × building layouts × 2,000 ticks: no body in a box, none through one, none off the map, zombies reach the player", () =>
    fuzzSuite("shotgun knockback fuzz", { loadouts: [["shotgun", null]], layouts: LAYOUTS, weapons: ["shotgun"], minApplied: 500, minStopped: 20, minKills: 100, minLayoutKills: Infinity }),
  );
});

describe("Fire Axe knockback fuzz (Story 5.2, brief line 7)", () => {
  describe(
    "4 axe players × random decay × building layouts × 2,000 ticks: no body in a box, none through a barricade, none off the map, zombies reach a player, no nav rebuild from knockback",
    () =>
      fuzzSuite("axe knockback fuzz", {
        loadouts: [["fire_axe", null], ["fire_axe", null], ["fire_axe", null], ["fire_axe", null]],
        layouts: AXE_LAYOUTS,
        weapons: ["fire_axe"],
        minApplied: 100,
        minStopped: 20,
        minKills: 50,
        minLayoutKills: 60,
        nearCover: true,
      }),
  );
});
