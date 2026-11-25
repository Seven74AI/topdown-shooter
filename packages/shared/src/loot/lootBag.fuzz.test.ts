import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { applyDecayStage } from "../decay/applyDecayStage";
import { gameplayDecayMasks } from "../decay/decayState";
import { createRng, type Rng } from "../core/rng";
import { createWorld, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { lootSpot } from "./lootBag";

/**
 * Story 7.12 (AC 3, AC 13, brief 7): the bag never lands in a solid. Downtown × every decay stage
 * (1–5) × legal variant masks × random barricades / turrets × random death spots — inside cars, the
 * bus, buildings, rubble and barricades, on their faces, at the map edge, anywhere — over many seeds:
 * the spot's 0.25 m circle overlaps no active solid and no solid building and stays on the map; a
 * spot that was already clear is kept as is (D4: fire doesn't move it). Independent overlap test
 * (`circleOverlapsBox` per box), not `boxBlocked`.
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const MASKS = gameplayDecayMasks(map);
const R = balance.loot.bagRadiusM;
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function inSolid(world: World, x: number, y: number, r: number): string | null {
  if (x < r - 1e-9 || y < r - 1e-9 || x > map.widthM - r + 1e-9 || y > map.heightM - r + 1e-9) return "edge";
  for (const s of world.obstacles.solids) if (circleOverlapsBox(x, y, r, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (b.solid && circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) return `building ${b.type}`;
  return null;
}

function placeBuildings(world: World, rng: Rng, n: number): void {
  let placed = 0;
  for (let tries = 0; tries < 300 && placed < n; tries++) {
    const type = rng.next() < 0.7 ? "wood_barricade" : "auto_turret";
    const stats = buildingStats(balance, type);
    if (!stats) continue;
    const s = world.obstacles.solids[rng.int(0, world.obstacles.solids.length - 1)] as MapBox;
    const gx = Math.round(rng.range(s.minX - 2, s.maxX + 1) / BUILD_GRID_M);
    const gy = Math.round(rng.range(s.minY - 2, s.maxY + 1) / BUILD_GRID_M);
    const rot = rng.int(0, 3) as BuildingRotation;
    footprint(stats, gx, gy, rot, box);
    if (footprintBlocked(world, box)) continue;
    addBuildingAt(world, { id: world.buildings.nextId, type, ownerId: "p0", gx, gy, rot, hp: stats.hp });
    placed++;
  }
}

function deathSpot(world: World, rng: Rng, out: { x: number; y: number }): string {
  const k = rng.int(0, 4);
  const solids = world.obstacles.solids;
  if (k <= 1 && solids.length > 0) {
    const b = solids[rng.int(0, solids.length - 1)] as MapBox;
    out.x = rng.range(b.minX, b.maxX);
    out.y = rng.range(b.minY, b.maxY);
    return `inside ${b.name.replace(/[-_\d]+$/, "")}`;
  }
  if (k === 2 && world.buildings.list.length > 0) {
    const b = world.buildings.list[rng.int(0, world.buildings.list.length - 1)];
    if (b) {
      out.x = rng.range(b.minX - 0.2, b.maxX + 0.2);
      out.y = rng.range(b.minY - 0.2, b.maxY + 0.2);
      return "barricade";
    }
  }
  if (k === 3) {
    out.x = rng.next() < 0.5 ? rng.range(0, 0.3) : map.widthM - rng.range(0, 0.3);
    out.y = rng.range(0, map.heightM);
    return "edge";
  }
  out.x = rng.range(0, map.widthM);
  out.y = rng.range(0, map.heightM);
  return "open";
}

describe("Story 7.12: the bag never spawns inside a solid (fuzz)", () => {
  it("every stage × masks × buildings × 40 seeds × 60 death spots", () => {
    const out = { x: 0, y: 0 };
    const kinds = new Map<string, number>();
    let moved = 0;
    let kept = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed * 7121);
      const world = createWorld({ balance, seed, map, loot: { off: true } });
      world.decay.variants = MASKS[seed % MASKS.length] as number;
      const stage = 1 + (seed % 5);
      if (stage > 1) applyDecayStage(world, stage, world.decay.variants);
      for (let i = 0; i < 2; i++) {
        const at = teamSpawnPoint(world, i, { x: 0, y: 0 });
        addPlayer(world, `p${i}`, at.x, at.y);
      }
      placeBuildings(world, rng, 6);
      for (let d = 0; d < 60; d++) {
        const kind = deathSpot(world, rng, out);
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
        const x0 = out.x;
        const y0 = out.y;
        const blockedBefore = inSolid(world, x0, y0, R) !== null;
        lootSpot(world, x0, y0, out);
        const hit = inSolid(world, out.x, out.y, R);
        expect(hit, `seed ${seed} stage ${stage} ${kind} (${x0.toFixed(2)}, ${y0.toFixed(2)}) → (${out.x.toFixed(2)}, ${out.y.toFixed(2)})`).toBeNull();
        if (blockedBefore) {
          moved++;
          expect(Math.hypot(out.x - x0, out.y - y0)).toBeLessThanOrEqual(balance.loot.spotStepM * balance.loot.spotRings + 1e-9);
        } else {
          kept++;
          expect([out.x, out.y]).toEqual([x0, y0]);
        }
      }
    }
    // liveness: the interesting spots really came up and really moved
    expect(moved).toBeGreaterThan(400);
    expect(kept).toBeGreaterThan(250);
    const names = [...kinds.keys()].join(",");
    for (const k of ["barricade", "edge", "open"]) expect(names).toContain(k);
    expect(names).toMatch(/inside [a-z_]*car/); // cars (burning ones too: fire doesn't count, D4)
    expect(names).toContain("inside city_bus");
    expect(names).toMatch(/inside rubble/); // the decay's rubble (6.2/6.4)
    expect(names).toMatch(/inside [a-z]+_(offices|apartments|warehouse|diner)/); // buildings
  });
});
