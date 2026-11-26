/** Story 12.1 (AC 16): the browser side of `pathOpenBench.ts` (bundled by it; exposes `window.runPathOpenBench`). */
import { DOWNTOWN_MAP, PLACEHOLDER_MAP, addBuildingAt, addPlayer, buildingStats, changeDecayStage, createRng, createWorld, footprint, loadBalance, placeBuilding, placementError, stageSealsCleared, type Box, type BuildingRotation, type DecayMutation, type DistrictMap } from "@topdown/shared";
import { resetPathOpenCache, sealsPath } from "../../packages/shared/src/buildings/pathOpen";

function bench(map: DistrictMap, label: string, n: number): Record<string, number | string> {
  const balance = loadBalance();
  const world = createWorld({ balance, seed: 1, map, systems: { waves: () => {} } });
  for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 1 + i, 1).wallet = 1e6;
  world.run.phase = "build";
  const rng = createRng(5);
  const cols = Math.floor(map.widthM / 0.5);
  const rows = Math.floor(map.heightM / 0.5);
  for (let t = 0; t < 2000 && world.buildings.list.length < 24; t++) {
    const owner = `p${world.buildings.list.length % 4}`;
    const r = { type: "wood_barricade", gx: rng.int(0, cols), gy: rng.int(0, rows), rot: rng.int(0, 3) };
    if (placementError(world, owner, r) === null) placeBuilding(world, owner, r);
  }
  const stats = buildingStats(balance, "wood_barricade");
  if (!stats) throw new Error("wood");
  const boxes: Box[] = [];
  for (let k = 0; k < n; k++) boxes.push(footprint(stats, rng.int(0, cols - 4), rng.int(0, rows - 1), rng.int(0, 3), { minX: 0, minY: 0, maxX: 0, maxY: 0 }));
  const box = (k: number): Box => boxes[k % n] as Box;
  for (let k = 0; k < 50; k++) {
    resetPathOpenCache();
    sealsPath(world, box(k)); // warm-up (JIT)
  }
  const time = (f: (k: number) => void): number => {
    const t0 = performance.now();
    for (let k = 0; k < n; k++) f(k);
    return +((performance.now() - t0) / n).toFixed(4);
  };
  // Fully cold: every cache dropped (the map layer is rebuilt: once after a decay stage change).
  const coldMs = time((k) => {
    resetPathOpenCache();
    sealsPath(world, box(k));
  });
  // Server, per placement: another wall landed since the last check (walls + before-flood + after-flood).
  const placementMs = time((k) => {
    world.buildings.wallVersion++;
    sealsPath(world, box(k));
  });
  // Client, the ghost dragged to a new spot (before cached, one after-flood).
  const newSpotMs = time((k) => void sealsPath(world, box(k)));
  // The ghost held still (the last answer).
  const heldMs = time(() => void sealsPath(world, box(0)));
  return { label, vertices: (cols + 1) * (rows + 1), buildings: world.buildings.list.length, coldMs, placementMs, newSpotMs, heldMs };
}

/**
 * Story 12.1 H1 (re-review round 1): a whole build start (`changeDecayStage`) with 100 walls: a ring round
 * the pad (54 pieces; inside x [8, 40] × y [6, 26]) whose north wall has a 2 m mouth a stage-2 barrier
 * narrows to two 0.85 m gaps (a seal the re-check must undo), plus 46 walls inside. ms per build start.
 */
function benchStage(n: number): Record<string, number | string> {
  const balance = loadBalance();
  const hp = buildingStats(balance, "wood_barricade")?.hp ?? 1;
  const barrier: DecayMutation = { name: "bench_barrier", action: "add", stage: 2, variant: -1, kind: "barrier", target: "", radiusM: 0, minX: 24.85, minY: 5.5, maxX: 25.15, maxY: 6 };
  const map: DistrictMap = { ...PLACEHOLDER_MAP, decay: [barrier], eventSpots: [{ name: "evac_pad", kind: "evac_pad", x: 24, y: 16, minStage: 1 }] };
  const times: number[] = [];
  let cleared = 0;
  let walls = 0;
  for (let k = 0; k < n; k++) {
    const world = createWorld({ balance, seed: 1, map, systems: { waves: () => {} } });
    let id = 1;
    const put = (x: number, y: number, rot: BuildingRotation): void => void addBuildingAt(world, { id: id++, type: "wood_barricade", ownerId: "old", gx: x * 2, gy: y * 2, rot, hp });
    for (let x = 8; x < 40; x += 2) if (x !== 24) put(x, 5.5, 0); // north, mouth [24, 26]
    for (let x = 8; x < 40; x += 2) put(x, 26, 0); // south
    for (let y = 5.5; y < 26.5; y += 2) {
      put(7.5, y, 1);
      put(40, y, 1);
    }
    for (let j = 0; id <= 100; j++) put(10 + (j % 9) * 3, 9 + Math.floor(j / 9) * 3, 0); // inside, a lattice of walls
    walls = world.buildings.list.length;
    const c0 = stageSealsCleared.count;
    const t0 = performance.now();
    changeDecayStage(world, 2);
    times.push(performance.now() - t0);
    cleared += stageSealsCleared.count - c0;
  }
  times.sort((a, b) => a - b);
  return { label: "build start, 100 walls, ring round the pad sealed by the stage", walls, clearedPerStart: cleared / n, medianMs: +(times[Math.floor(n / 2)] as number).toFixed(3), maxMs: +(times[n - 1] as number).toFixed(3) };
}

const big: DistrictMap = { ...PLACEHOLDER_MAP, widthM: 70, heightM: 70, eventSpots: [{ name: "evac_pad", kind: "evac_pad", x: 35, y: 35, minStage: 1 }] };
(globalThis as unknown as { runPathOpenBench: () => unknown }).runPathOpenBench = () => [bench(DOWNTOWN_MAP, "Downtown 48 × 32 m", 400), bench(big, "70 × 70 m (140 × 140 cells)", 400), benchStage(30)];
