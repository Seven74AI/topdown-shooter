import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { applyDecayStage } from "../decay/applyDecayStage";
import { legalDecayMasks } from "../decay/decayState";
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
const MASKS = legalDecayMasks(map);
const LAYOUTS = 16;
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

/** The centre's move this tick entered a box (crossed a face into or through it). */
function crossed(world: World, x0: number, y0: number, x1: number, y1: number): string | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0 && dy === 0) return null;
  for (const s of world.obstacles.solids) if (segmentBoxEntryT(x0, y0, dx, dy, s.minX, s.minY, s.maxX, s.maxY) >= 0) return s.name;
  for (const b of world.buildings.list) if (segmentBoxEntryT(x0, y0, dx, dy, b.minX, b.minY, b.maxX, b.maxY) >= 0) return `building ${b.id}`;
  return null;
}

describe("Shotgun knockback fuzz (Story 5.3, brief line 7)", () => {
  it(
    "random decay × building layouts × 2,000 ticks: no body in a box, none through one, none off the map, zombies reach the player",
    () => {
      const applied0 = knockbacks.applied;
      const stopped0 = knockbacks.stopped;
      let kills = 0;
      let buildingsPlaced = 0;
      const prevX = new Float32Array(512);
      const prevY = new Float32Array(512);
      const prevGen = new Int16Array(512).fill(-1);
      for (let seed = 1; seed <= LAYOUTS; seed++) {
        const rng = createRng(seed * 7717);
        let afterCombatChecks = 0;
        // The real combat system, then the check on every body it may have moved.
        const combatChecked: SystemFn = (w, dt) => {
          updateCombat(w, dt);
          const zp = w.zombies;
          for (let i = 0; i < zp.aliveCount; i++) {
            const id = zp.aliveIds[i] as number;
            const r = balance.zombies.types[zombieTypeOf(zp, id)]?.radiusM ?? 0;
            const hit = overlapping(w, zp.x[id] as number, zp.y[id] as number, r, AFTER_COMBAT_EPS_M);
            if (hit) throw new Error(`seed ${seed} tick ${w.tick} zombie ${id}: knocked into ${hit} (after combat)`);
          }
          afterCombatChecks++;
        };
        const world = createWorld({ balance, seed, map, systems: { combat: combatChecked } });
        world.debug.godMode = true;
        world.decay.variants = MASKS[seed % MASKS.length] as number;
        applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
        const at = teamSpawnPoint(world, 0, { x: 0, y: 0 });
        const p = addPlayer(world, "p0", at.x, at.y);
        setLoadout(balance, p.loadout, ["shotgun", null]);
        startBuild(world);
        buildingsPlaced += placeRandom(world, rng, p.x, p.y);
        world.waves.number = 3; // wave 4: a real crowd for one player
        startWave(world);
        world.events.subscribe((e) => {
          if (e.type === "zombie.killed" && e.weapon === "shotgun") kills++;
        });
        // Even layouts: unkillable zombies (the 4-Shotgun stun-lock question: do they still get to me?).
        const tough = seed % 2 === 0;
        let contacts = 0;
        let seq = 0;
        prevGen.fill(-1);
        const z = world.zombies;
        for (let t = 0; t < TICKS; t++) {
          // aim at the nearest zombie (mouse aim: no assist), fire held
          let best = -1;
          let bestD = Infinity;
          for (let i = 0; i < z.aliveCount; i++) {
            const id = z.aliveIds[i] as number;
            const d = Math.hypot((z.x[id] as number) - p.x, (z.y[id] as number) - p.y);
            if (d < bestD) {
              bestD = d;
              best = id;
            }
          }
          const ax = best >= 0 ? (z.x[best] as number) - p.x : 1;
          const ay = best >= 0 ? (z.y[best] as number) - p.y : 0;
          const al = Math.hypot(ax, ay) || 1;
          setInput(world, "p0", { ...NEUTRAL_INPUT, seq: ++seq, aimX: ax / al, aimY: ay / al, fire: best >= 0, isMouse: true });
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
          if (world.pathing.nav.version !== navBefore) expect(navBefore !== buildingsBefore || world.buildings.version !== buildingsBefore, `seed ${seed} tick ${t}: nav rebuilt without a building change`).toBe(true);
          for (let i = 0; i < z.aliveCount; i++) {
            const id = z.aliveIds[i] as number;
            const x = z.x[id] as number;
            const y = z.y[id] as number;
            const r = balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
            const where = `seed ${seed} tick ${t} zombie ${id} at (${x.toFixed(3)}, ${y.toFixed(3)})`;
            expect(overlapping(world, x, y, r), `${where}: body in a box`).toBeNull();
            expect(x >= r - ZOMBIE_EPS_M && y >= r - ZOMBIE_EPS_M && x <= map.widthM - r + ZOMBIE_EPS_M && y <= map.heightM - r + ZOMBIE_EPS_M, `${where}: off the map`).toBe(true);
            if (prevGen[id] === z.generation[id] && isZombieAlive(z, id)) expect(crossed(world, prevX[id] as number, prevY[id] as number, x, y), `${where}: crossed a box`).toBeNull();
            if (Math.hypot(x - p.x, y - p.y) <= r + p.radiusM + 0.1) contacts++;
          }
        }
        expect(afterCombatChecks).toBe(TICKS); // the check really ran every tick
        if (tough) expect(contacts, `seed ${seed}: no zombie ever reached the player`).toBeGreaterThan(0);
        else expect(world.waves.number, `seed ${seed}: the waves stalled`).toBeGreaterThan(4);
      }
      const applied = knockbacks.applied - applied0;
      const stopped = knockbacks.stopped - stopped0;
      (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`knockback fuzz: ${LAYOUTS} layouts, ${buildingsPlaced} buildings, ${applied} knockbacks, ${stopped} stopped at a face, ${kills} shotgun kills`);
      expect(buildingsPlaced).toBeGreaterThan(LAYOUTS * 2);
      expect(applied).toBeGreaterThanOrEqual(500);
      expect(stopped).toBeGreaterThanOrEqual(20);
      expect(kills).toBeGreaterThanOrEqual(100);
    },
    240_000,
  );
});
