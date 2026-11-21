import type { World } from "./world";
import { MAX_PIERCE } from "../combat/projectilePool";

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
    pierceLeft: p.pierceLeft[id],
    weapon: p.weapon[id],
    owner: p.owner[id],
    hits: Array.from(p.hitIds.subarray(id * MAX_PIERCE, id * MAX_PIERCE + (p.hitCount[id] ?? 0))),
  }));
}

export function snapshotWorld(world: World) {
  return {
    tick: world.tick,
    seed: world.seed,
    balanceVersion: world.balance.version,
    rngState: world.rng.getState(),
    pendingInputs: sortedEntries(world.pendingInputs),
    inputs: sortedEntries(world.inputs),
    lastAppliedSeq: sortedEntries(world.lastAppliedSeq),
    map: { ...world.map },
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
  };
}

export type WorldSnapshot = ReturnType<typeof snapshotWorld>;
