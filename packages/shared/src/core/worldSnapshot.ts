import type { World } from "./world";
import { MAX_PIERCE } from "../combat/projectilePool";
import { MAX_DAMAGERS } from "../economy/economy";
import { snapshotPathing } from "../zombies/flowField";
import { snapshotZombieHistory } from "../combat/rewind";
import { snapshotSeedStreams } from "./seedStreams";
import { canonicalJson, fnv1a32 } from "./hash";

const sortedEntries = <V>(map: ReadonlyMap<string, V>): [string, V][] =>
  [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Plain-data view of the World (no functions, Maps as sorted arrays), for determinism tests
 * and, later, run snapshots (Story 8.4). Every story that adds World state adds it here.
 */
function snapshotZombies(world: World) {
  const z = world.zombies;
  const alive = Array.from(z.aliveIds.subarray(0, z.aliveCount));
  return {
    alive: alive.map((id) => ({
      id,
      x: z.x[id],
      y: z.y[id],
      hp: z.hp[id],
      type: z.type[id],
      state: z.state[id],
      generation: z.generation[id],
      waveZombie: z.waveZombie[id],
      attackCooldownTicks: z.attackCooldownTicks[id],
    })),
    nextUnused: z.nextUnused,
    freed: Array.from({ length: z.freedCount }, (_, k) => {
      const i = (z.freedHead + k) % z.capacity;
      return [z.freedIds[i], z.freedAtTick[i]];
    }),
  };
}

function snapshotProjectiles(world: World) {
  const p = world.projectiles;
  return Array.from(p.aliveIds.subarray(0, p.aliveCount)).map((id) => ({
    id,
    x: p.x[id],
    y: p.y[id],
    prevX: p.prevX[id],
    prevY: p.prevY[id],
    speedMps: p.speedMps[id],
    damage: p.damage[id],
    dirX: p.dirX[id],
    dirY: p.dirY[id],
    rangeLeftM: p.rangeLeftM[id],
    advanceM: p.advanceM[id],
    rewindTicks: p.rewindTicks[id], // Story 2.12
    pierceLeft: p.pierceLeft[id],
    weapon: p.weapon[id],
    building: p.building[id], // Story 3.6
    pushbackM: p.pushbackM[id],
    owner: p.owner[id],
    hits: Array.from(p.hitIds.subarray(id * MAX_PIERCE, id * MAX_PIERCE + (p.hitCount[id] ?? 0))),
  }));
}

/** Story 3.2: damagers per zombie slot (`[slot, ...playerIds]` for each slot with any). Wallets are on the players. */
function snapshotEconomy(world: World) {
  const e = world.economy;
  const damagers: (number | string | null)[][] = [];
  for (let id = 0; id < e.damagerCount.length; id++) {
    const n = e.damagerCount[id] as number;
    if (n > 0) damagers.push([id, ...e.damagers.slice(id * MAX_DAMAGERS, id * MAX_DAMAGERS + n)]);
  }
  return { damagers };
}

export function snapshotWorld(world: World) {
  return {
    tick: world.tick,
    seed: world.seed,
    balanceVersion: world.balance.version,
    // Story 4.4: every named stream's state (and each shop stream's build key).
    streams: snapshotSeedStreams(world.streams),
    pendingInputs: sortedEntries(world.pendingInputs),
    inputs: sortedEntries(world.inputs),
    lastAppliedSeq: sortedEntries(world.lastAppliedSeq),
    // Story 4.1: the map is static frozen data; its name and content hash identify it.
    map: { name: world.map.name, version: world.map.version },
    players: sortedEntries(world.players).map(
      ([id, p]) =>
        [
          id,
          {
            ...p,
            loadout: {
              active: p.loadout.active,
              swapTicks: p.loadout.swapTicks,
              slots: p.loadout.slots.map((s) => (s ? { ...s } : null)),
            },
          },
        ] as const,
    ),
    projectiles: snapshotProjectiles(world),
    zombies: snapshotZombies(world),
    waves: {
      ...world.waves,
      typeTarget: Array.from(world.waves.typeTarget),
      typeSpawned: Array.from(world.waves.typeSpawned),
      recentSpawns: Array.from(world.waves.recentSpawns), // Story 4.3: the spawn pick's memory
    },
    run: { ...world.run },
    debug: { ...world.debug },
    teamWiped: world.teamWiped,
    economy: snapshotEconomy(world),
    // Story 3.4: buildings in id order (plain copies) and the counters. Story 3.6: the copies
    // include each turret's fire cooldown and aim.
    buildings: {
      list: world.buildings.list.map((b) => ({ ...b })),
      nextId: world.buildings.nextId,
      version: world.buildings.version,
    },
    // Story 3.5: the flow field's counters and hashes of its buffers (it is evolved state, not synced).
    pathing: snapshotPathing(world.pathing),
    // Story 2.12: the zombie position history (evolved state: switch, row labels, hash of the rows).
    zombieHistory: snapshotZombieHistory(world.zombieHistory),
  };
}

export type WorldSnapshot = ReturnType<typeof snapshotWorld>;

/**
 * Story 4.4: one number for the whole World state (FNV-1a of the snapshot's canonical JSON), for
 * replay checks ("same seed + input log → same digest"). Allocates: tests and tools only.
 */
export function worldDigest(world: World): number {
  return fnv1a32(canonicalJson(snapshotWorld(world)));
}
