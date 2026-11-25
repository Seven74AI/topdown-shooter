/**
 * Stories 8.4–8.6 test helpers (tests and tools only): a real run played to a build phase — N players, W cleared waves,
 * up to B buildings — for the save round trip, the size limit and the measurements (`docs/perf/epic-8-saves.md`).
 */
import { createWorld, step, type World } from "../core/world";
import { loadBalance, type Balance } from "../config/balance";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { placeBuilding, buildingTypeIds } from "../buildings/buildings";
import { skipWave, startBuild } from "../run/runStateMachine";
import { TICK_DT_S } from "../config/constants";
import type { SeatMeta } from "./runSave";

export interface PlayedRun {
  readonly world: World;
  readonly seats: SeatMeta[];
}

/** A small deterministic LCG for spot picks (tests only; the World's own streams stay untouched). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Plays a run to the build phase after `waves` cleared waves, placing buildings in every build up to `buildings`. */
export function playToBuild(opts: { players: number; waves: number; buildings: number; seed?: number; balance?: Balance }): PlayedRun {
  const balance = opts.balance ?? loadBalance();
  const world = createWorld({ balance, seed: opts.seed ?? 0x5eed, map: DOWNTOWN_MAP, loot: { salt: 77 } });
  world.debug.godMode = true;
  const at = { x: 0, y: 0 };
  const seats: SeatMeta[] = [];
  for (let slot = 0; slot < opts.players; slot++) {
    teamSpawnPoint(world, slot, at);
    const id = `p${slot}`;
    addPlayer(world, id, at.x, at.y);
    seats.push({ seatKey: `acct:00000000-0000-4000-8000-00000000000${slot}`, accountId: `00000000-0000-4000-8000-00000000000${slot}`, name: `Player ${slot}`, slot, playerId: id, kills: slot * 3 });
  }
  startBuild(world);
  const rand = lcg(opts.seed ?? 0x5eed);
  const types = buildingTypeIds(balance).filter((t) => balance.buildings.types[t]?.inShop !== false);
  const place = (target: number): void => {
    for (let tries = 0; tries < 4000 && world.buildings.list.length < target; tries++) {
      const owner = `p${Math.floor(rand() * opts.players)}`;
      const p = world.players.get(owner);
      if (!p) continue;
      p.wallet = 100_000;
      const type = types[Math.floor(rand() * types.length)] as string;
      const gx = Math.floor(rand() * (DOWNTOWN_MAP.widthM * 2 - 4)) + 2;
      const gy = Math.floor(rand() * (DOWNTOWN_MAP.heightM * 2 - 4)) + 2;
      placeBuilding(world, owner, { type, gx, gy, rot: Math.floor(rand() * 4) });
    }
  };
  for (let w = 0; w < opts.waves; w++) {
    place(Math.round((opts.buildings * (w + 1)) / Math.max(1, opts.waves)));
    for (const p of world.players.values()) p.buildReady = true;
    for (let t = 0; t < 2000 && world.run.phase === "build"; t++) step(world, TICK_DT_S);
    for (let t = 0; t < 60 && world.run.phase === "wave"; t++) step(world, TICK_DT_S);
    if (world.run.phase === "wave") skipWave(world);
    for (let t = 0; t < 400 && world.run.phase === "build" && (world.projectiles.aliveCount > 0 || world.zombies.aliveCount > 0); t++) step(world, TICK_DT_S);
    for (let t = 0; t < 3 && world.run.phase === "build"; t++) step(world, TICK_DT_S);
  }
  place(opts.buildings);
  for (const p of world.players.values()) p.wallet = 1234;
  return { world, seats };
}
