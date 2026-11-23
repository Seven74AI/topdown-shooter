import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { createRng, type Rng } from "../core/rng";
import { createWorld, type World } from "../core/world";
import { applyDecayStage } from "../decay/applyDecayStage";
import { legalDecayMasks } from "../decay/decayState";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { addBuildingAt, blockReason, buildingStats, buildingTypeIds, footprint, footprintBlocked, type BlockCause, type Box, type BuildingRotation } from "./buildings";
import { circleOverlapsBox } from "./collision";

/**
 * Story 5.17 (AC 1, brief line 7): the client's explanation never disagrees with the server's check.
 * Random Downtown layouts (every legal decay variant mask, stages 1–3) × 1–4 players (some downed,
 * some out) × random buildings × random zombies, then random footprints of every type and rot over
 * the whole map AND past its edges (5.15: off-map indices are real, negative): `blockReason(...) !==
 * null ⇔ footprintBlocked(...)`, the cause is the FIRST test that holds in the AC 1 order, and its
 * culprit really overlaps the box. `exceptId` = the same check on the World without that building.
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const MASKS = legalDecayMasks(map);
const LAYOUTS = 40;
const BOXES_PER_LAYOUT = 1500;
const ORDER: readonly BlockCause[] = ["off_map", "spawn", "solid", "building", "me", "teammate", "zombie"];
const TYPES = buildingTypeIds(balance).filter((t) => buildingStats(balance, t)?.forSale !== false);
const overlaps = (a: Box, b: Box): boolean => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

function layout(seed: number): World {
  const rng = createRng(seed * 104729 + 7);
  const world = createWorld({ balance, seed, map });
  world.decay.variants = MASKS[seed % MASKS.length] as number;
  applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
  const players = 1 + (seed % 4);
  for (let slot = 0; slot < players; slot++) {
    const p = addPlayer(world, `p${slot}`, rng.range(1, map.widthM - 1), rng.range(1, map.heightM - 1));
    const roll = rng.int(0, 5);
    if (roll === 0) p.status = "downed";
    else if (roll === 1 && slot > 0) p.status = "out";
  }
  const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let id = 1;
  for (let tries = 0; tries < 200 && world.buildings.list.length < 16; tries++) {
    const type = TYPES[rng.int(0, TYPES.length - 1)] as string;
    const stats = buildingStats(balance, type);
    if (!stats) continue;
    const rot = rng.int(0, 3) as BuildingRotation;
    const gx = rng.int(0, Math.floor(map.widthM / BUILD_GRID_M));
    const gy = rng.int(0, Math.floor(map.heightM / BUILD_GRID_M));
    if (footprintBlocked(world, footprint(stats, gx, gy, rot, box))) continue;
    addBuildingAt(world, { id: id++, type, ownerId: `p${rng.int(0, 3)}`, gx, gy, rot, hp: stats.hp });
  }
  const zombies = rng.int(0, 30);
  for (let i = 0; i < zombies; i++) spawnZombie(world, "walker", rng.range(0, map.widthM), rng.range(0, map.heightM));
  return world;
}

/** Each AC 1 test on its own (written from the rule, not from either function). */
function causeHolds(world: World, ownerId: string, box: Box, cause: BlockCause): boolean {
  switch (cause) {
    case "off_map":
      return box.minX < 0 || box.minY < 0 || box.maxX > world.map.widthM || box.maxY > world.map.heightM;
    case "spawn":
      return world.map.spawnPoints.some((s) => circleOverlapsBox(s.x, s.y, balance.buildings.spawnClearM, box.minX, box.minY, box.maxX, box.maxY));
    case "solid":
      return world.obstacles.solids.some((s) => overlaps(box, s));
    case "building":
      return world.buildings.list.some((b) => overlaps(box, b));
    case "me": {
      const p = world.players.get(ownerId);
      return !!p && p.status !== "out" && circleOverlapsBox(p.x, p.y, p.radiusM, box.minX, box.minY, box.maxX, box.maxY);
    }
    case "teammate":
      return [...world.players.values()].some((p) => p.id !== ownerId && p.status !== "out" && circleOverlapsBox(p.x, p.y, p.radiusM, box.minX, box.minY, box.maxX, box.maxY));
    case "zombie": {
      const z = world.zombies;
      const r = maxZombieRadius(balance);
      for (let i = 0; i < z.aliveCount; i++) {
        const id = z.aliveIds[i] as number;
        if (circleOverlapsBox(z.x[id] as number, z.y[id] as number, r, box.minX, box.minY, box.maxX, box.maxY)) return true;
      }
      return false;
    }
  }
}

/** A random footprint: a random type/rot, its corner anywhere from 3 m past the west/north edge to 3 m past the east/south edge. */
function randomBox(rng: Rng, out: Box): Box {
  const stats = buildingStats(balance, TYPES[rng.int(0, TYPES.length - 1)] as string);
  if (!stats) throw new Error("type");
  const pad = 6;
  const gx = rng.int(-pad, Math.floor(map.widthM / BUILD_GRID_M) + pad);
  const gy = rng.int(-pad, Math.floor(map.heightM / BUILD_GRID_M) + pad);
  return footprint(stats, gx, gy, rng.int(0, 3), out);
}

describe("blockReason (Story 5.17)", () => {
  it("fuzz: blockReason !== null ⇔ footprintBlocked, first cause in the AC 1 order, culprit overlaps", () => {
    const seen = new Map<BlockCause | "clear", number>();
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let mismatches = 0;
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const world = layout(seed);
      const rng = createRng(seed * 31 + 3);
      const owner = `p${rng.int(0, world.players.size - 1)}`;
      for (let i = 0; i < BOXES_PER_LAYOUT; i++) {
        // Half the boxes near a player or a zombie, so the late causes (me, teammate, zombie) really come up.
        randomBox(rng, box);
        if (i % 2 === 0) {
          const ps = [...world.players.values()];
          const z = world.zombies;
          const pick = rng.int(0, ps.length + Math.min(z.aliveCount, 4));
          const at =
            pick < ps.length ? (ps[pick] as { x: number; y: number }) : z.aliveCount > 0 ? { x: z.x[z.aliveIds[pick % z.aliveCount] as number] as number, y: z.y[z.aliveIds[pick % z.aliveCount] as number] as number } : null;
          if (at) {
            const w = box.maxX - box.minX;
            const h = box.maxY - box.minY;
            box.minX = Math.round((at.x + rng.range(-1.5, 1.5) - w / 2) / BUILD_GRID_M) * BUILD_GRID_M;
            box.minY = Math.round((at.y + rng.range(-1.5, 1.5) - h / 2) / BUILD_GRID_M) * BUILD_GRID_M;
            box.maxX = box.minX + w;
            box.maxY = box.minY + h;
          }
        }
        const r = blockReason(world, owner, box);
        const blocked = footprintBlocked(world, box);
        if ((r !== null) !== blocked) mismatches++;
        expect(r !== null, `seed ${seed} box ${JSON.stringify(box)}`).toBe(blocked);
        seen.set(r ? r.cause : "clear", (seen.get(r ? r.cause : "clear") ?? 0) + 1);
        if (!r) continue;
        // First cause wins: every earlier test is false, this one is true.
        const k = ORDER.indexOf(r.cause);
        for (let j = 0; j < k; j++) expect(causeHolds(world, owner, box, ORDER[j] as BlockCause), `${ORDER[j]} before ${r.cause}`).toBe(false);
        expect(causeHolds(world, owner, box, r.cause)).toBe(true);
        // The culprit is the thing that overlaps.
        if (r.cause === "spawn") {
          const s = world.map.spawnPoints[r.index];
          expect(s && circleOverlapsBox(s.x, s.y, balance.buildings.spawnClearM, box.minX, box.minY, box.maxX, box.maxY)).toBe(true);
        } else if (r.cause === "solid") expect(overlaps(box, world.obstacles.solids[r.index] as Box)).toBe(true);
        else if (r.cause === "building") expect(overlaps(box, world.buildings.list.find((b) => b.id === r.id) as Box)).toBe(true);
        else if (r.cause === "me") expect(r.playerId).toBe(owner);
        else if (r.cause === "teammate") {
          const p = world.players.get(r.playerId);
          expect(r.playerId).not.toBe(owner);
          expect(p && p.status !== "out" && circleOverlapsBox(p.x, p.y, p.radiusM, box.minX, box.minY, box.maxX, box.maxY)).toBe(true);
        } else if (r.cause === "zombie") {
          const z = world.zombies;
          expect(z.aliveIds[z.alivePos[r.id] as number]).toBe(r.id);
          expect(circleOverlapsBox(z.x[r.id] as number, z.y[r.id] as number, maxZombieRadius(balance), box.minX, box.minY, box.maxX, box.maxY)).toBe(true);
        }
      }
    }
    expect(mismatches).toBe(0);
    // Liveness (brief 9): every cause and clear spots really came up, many times.
    for (const c of [...ORDER, "clear"] as const) expect(seen.get(c) ?? 0, c).toBeGreaterThan(50);
  });

  it("fuzz: exceptId leaves exactly that building out (the check on the World without it)", () => {
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let excepted = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const world = layout(seed);
      const rng = createRng(seed + 99);
      const list = world.buildings.list;
      for (let i = 0; i < 400 && list.length > 0; i++) {
        const at = rng.int(0, list.length - 1);
        const b = list[at] as (typeof list)[number];
        // A box over that building half of the time.
        if (i % 2 === 0) {
          box.minX = b.minX;
          box.minY = b.minY;
          box.maxX = b.maxX;
          box.maxY = b.maxY;
        } else randomBox(rng, box);
        const r = blockReason(world, "p0", box, b.id);
        list.splice(at, 1);
        const without = footprintBlocked(world, box);
        list.splice(at, 0, b);
        expect(r !== null).toBe(without);
        if (r?.cause === "building") expect(r.id).not.toBe(b.id);
        if (i % 2 === 0 && footprintBlocked(world, box) && !without) excepted++;
      }
    }
    expect(excepted).toBeGreaterThan(20);
  });

  it("a spot both off the map and on a spawn circle says off map (first cause wins)", () => {
    const world = createWorld({ balance, seed: 1, map });
    const sp = map.spawnPoints.reduce((a, s) => (Math.min(s.x, s.y) < Math.min(a.x, a.y) ? s : a));
    const box: Box = { minX: -1, minY: sp.y - 0.25, maxX: 0.5, maxY: sp.y + 0.25 };
    if (sp.y < sp.x) Object.assign(box, { minX: sp.x - 0.25, maxX: sp.x + 0.25, minY: -1, maxY: 0.5 });
    expect(circleOverlapsBox(sp.x, sp.y, balance.buildings.spawnClearM, box.minX, box.minY, box.maxX, box.maxY)).toBe(true);
    expect(blockReason(world, "p0", box)?.cause).toBe("off_map");
  });

  it("me before a teammate; a teammate by id; an out player blocks nothing", () => {
    const world = createWorld({ balance, seed: 1, map });
    addPlayer(world, "p0", 24, 16);
    addPlayer(world, "p1", 24.3, 16);
    const box: Box = { minX: 23.5, minY: 15.5, maxX: 24.5, maxY: 16.5 };
    expect(blockReason(world, "p0", box)?.cause).toBe("me");
    expect(blockReason(world, "p1", box)?.cause).toBe("me");
    const r = blockReason(world, "p2", box);
    expect(r?.cause).toBe("teammate");
    expect(r?.playerId).toBe("p0");
    (world.players.get("p0") as { status: string }).status = "out";
    expect(blockReason(world, "p1", box)?.cause).toBe("me");
    (world.players.get("p1") as { status: string }).status = "out";
    expect(blockReason(world, "p0", box)).toBeNull();
    expect(footprintBlocked(world, box)).toBe(false);
  });
});
