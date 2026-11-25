import { snapshotSpecial } from "../events/eventState";
import type { World } from "./world";
import { snapshotShop } from "../economy/shopCards";
import { snapshotBoss } from "../boss/bossState";
import { MAX_PIERCE } from "../combat/projectilePool";
import { MAX_DAMAGERS } from "../economy/economy";
import { snapshotPathing } from "../zombies/flowField";
import { snapshotZombieHistory } from "../combat/rewind";
import { snapshotSeedStreams } from "./seedStreams";
import { canonicalJson, fnv1a32 } from "./hash";
import { FLAME_SLOTS, KNOCK_MEMORY } from "../zombies/zombiePool";

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
      fireTicks: z.fireTicks[id], // Story 4.8 review L4
      spitTicks: z.spitTicks[id], // Story 5.6
      spitTarget: z.spitTarget[id] ?? null,
      swellTicks: z.swellTicks[id], // Story 5.8
      trapTicks: z.trapTicks[id], // Story 5.9
      slowPct: z.slowPct[id],
      holdTicks: z.holdTicks[id], // Story 5.14
      lureTicks: z.lureTicks[id], // Story 6.8
      stampedeHit: z.stampedeHit[id],
      stampedeAnchor: z.stampedeAnchor[id],
      stampedeTick: z.stampedeTick[id],
      knockShot: Array.from(z.knockShot.subarray(id * KNOCK_MEMORY, id * KNOCK_MEMORY + KNOCK_MEMORY)), // Story 5.3
      knockHead: z.knockHead[id],
      // Story 5.4: flame clocks per flamer slot and the burn
      flameClock: Array.from(z.flameClock.subarray(id * FLAME_SLOTS, id * FLAME_SLOTS + FLAME_SLOTS)),
      igniteTicks: z.igniteTicks[id],
      igniteClock: z.igniteClock[id],
      igniterSlot: z.igniterSlot[id],
      igniteWeapon: z.igniteWeapon[id],
      igniteDamage: z.igniteDamage[id],
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
    shotId: p.shotId[id], // Story 5.3
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

function snapshotSpits(world: World) {
  const s = world.spits;
  const out = [];
  for (let i = 0; i < s.count; i++) {
    out.push({ id: s.id[i], x: s.x[i], y: s.y[i], dirX: s.dirX[i], dirY: s.dirY[i], rangeLeftM: s.rangeLeftM[i], damage: s.damage[i], owner: s.owner[i] });
  }
  return { list: out, nextId: s.nextId };
}

/** Story 5.5: rounds in flight (dense order) and the id counter. */
function snapshotGrenades(world: World) {
  const g = world.grenades;
  const out = [];
  for (let i = 0; i < g.count; i++) {
    out.push({ id: g.id[i], x0: g.x0[i], y0: g.y0[i], tx: g.tx[i], ty: g.ty[i], landTick: g.landTick[i], owner: g.owner[i] ?? null, weapon: g.weapon[i], level: g.level[i], item: g.item[i] }); // Story 5.12: item
  }
  return { list: out, nextId: g.nextId };
}

function snapshotAreas(world: World) {
  const a = world.areas;
  const out = [];
  for (let i = 0; i < a.capacity; i++) {
    if (a.active[i] === 1) out.push({ slot: i, id: a.id[i], kind: a.kind[i], x: a.x[i], y: a.y[i], radiusM: a.radiusM[i], ticksLeft: a.ticksLeft[i], bornTick: a.bornTick[i] });
  }
  return out;
}

/** Story 5.12: the molotov fire zones (live slots, with thrower and item) and the id counter. */
function snapshotMolotovs(world: World) {
  const m = world.molotovs;
  const a = m.areas;
  const out = [];
  for (let i = 0; i < a.capacity; i++) {
    if (a.active[i] === 1) out.push({ slot: i, id: a.id[i], x: a.x[i], y: a.y[i], radiusM: a.radiusM[i], ticksLeft: a.ticksLeft[i], bornTick: a.bornTick[i], owner: m.owner[i] ?? null, item: m.item[i] });
  }
  return { list: out, nextId: m.nextId };
}

/** Story 5.8: the queued Bloater blasts (oldest first) and the gas clouds (live slots). */
function snapshotBlasts(world: World) {
  const q = world.blasts;
  const queue = [];
  for (let k = 0; k < q.count; k++) {
    const i = (q.head + k) % q.capacity;
    queue.push({ x: q.x[i], y: q.y[i], type: q.type[i], credit: q.credit[i] ?? null, creditBuilding: q.creditBuilding[i], chain: q.chain[i], swell: q.swell[i] });
  }
  const g = world.gas;
  const gas = [];
  for (let i = 0; i < g.capacity; i++) if (g.active[i] === 1) gas.push({ slot: i, x: g.x[i], y: g.y[i], radiusM: g.radiusM[i], ticksLeft: g.ticksLeft[i], bornTick: g.bornTick[i] });
  return { queue, gas };
}

// Story 5.10: `world.lights.list` is not here on purpose: it is derived from the buildings and
// `decay.fires` (both snapshotted), never simulation state of its own; med stations have no clock.
// Story 6.3: the four light FLAGS are state (brief 26) and are here (`lights`); the list stays out.
export function snapshotWorld(world: World) {
  return {
    tick: world.tick,
    seed: world.seed,
    balanceVersion: world.balance.version,
    // Story 4.4: every named stream's state (and each shop stream's build key).
    streams: snapshotSeedStreams(world.streams),
    // Story 5.13: every slot's stored card offer (build, rev, cards, sold).
    shop: snapshotShop(world),
    pendingInputs: sortedEntries(world.pendingInputs),
    inputs: sortedEntries(world.inputs),
    lastAppliedSeq: sortedEntries(world.lastAppliedSeq),
    // Story 4.1: the map is static frozen data; its name and content hash identify it.
    map: { name: world.map.name, version: world.map.version },
    // Story 4.2: the active obstacles follow from the map + stage; the stage and rebuild count identify them.
    obstacles: {
      stage: world.obstacles.stage,
      variants: world.obstacles.variants,
      version: world.obstacles.version,
      // Story 4.5: the boxes themselves (names in order): a mutation that changes the lists changes the digest.
      solids: world.obstacles.solids.map((b) => b.name),
      shotBlockers: world.obstacles.shotBlockers.map((b) => b.name),
    },
    // Story 4.5: the decay stage, the run's variation choices and the fire records; Story 4.8: which
    // fires burned out, when each goes out, and the damage pulse clock.
    decay: {
      stage: world.decay.stage,
      variants: world.decay.variants,
      fires: world.decay.fires.map((f) => ({ ...f })),
      firesOut: world.decay.firesOut,
      fireEndWave: Array.from(world.decay.fireEndWave),
      burnTicks: world.decay.burnTicks,
    },
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
    // Story 8.1: players on hold (same fields as `players`) and when each hold began. Only when someone is held, so
    // a run without holds keeps its digest.
    ...(world.heldPlayers.size > 0
      ? {
          heldPlayers: sortedEntries(world.heldPlayers).map(
            ([id, h]) =>
              [
                id,
                {
                  buildIdx: h.buildIdx,
                  atTick: h.atTick,
                  player: {
                    ...h.player,
                    loadout: { active: h.player.loadout.active, swapTicks: h.player.loadout.swapTicks, slots: h.player.loadout.slots.map((s) => (s ? { ...s } : null)) },
                  },
                },
              ] as const,
          ),
        }
      : {}),
    projectiles: snapshotProjectiles(world),
    lastShotId: world.projectiles.lastShotId, // Story 5.3: the shot counter
    zombies: snapshotZombies(world),
    waves: {
      ...world.waves,
      typeTarget: Array.from(world.waves.typeTarget),
      typeSpawned: Array.from(world.waves.typeSpawned),
      fixedTarget: Array.from(world.waves.fixedTarget), // Story 6.1: the fixed zombies and their spawn points
      fixedSpawned: Array.from(world.waves.fixedSpawned),
      fixedAtList: Array.from(world.waves.fixedAtList),
      recentSpawns: Array.from(world.waves.recentSpawns), // Story 4.3: the spawn pick's memory
    },
    run: { ...world.run },
    // Story 6.3: the light state (blackout level, half dark, power failure, dev force); the list stays out.
    lights: { blackoutPct: world.lights.blackoutPct, halfDark: world.lights.halfDark, powerFailure: world.lights.powerFailure, forcedPct: world.lights.forcedPct },
    debug: { ...world.debug },
    teamWiped: world.teamWiped,
    economy: snapshotEconomy(world),
    // Story 3.4: buildings in id order (plain copies) and the counters. Story 3.6: the copies
    // include each turret's fire cooldown and aim.
    buildings: {
      list: world.buildings.list.map((b) => ({ ...b })),
      nextId: world.buildings.nextId,
      version: world.buildings.version,
      wallVersion: world.buildings.wallVersion, // Story 5.9
    },
    // Story 3.5: the flow field's counters and hashes of its buffers (it is evolved state, not synced).
    pathing: snapshotPathing(world.pathing),
    // Story 5.6: globs in flight (dense order) and the acid puddles (live slots). Players' `acidTicks` ride in `players`.
    spits: snapshotSpits(world),
    areas: snapshotAreas(world),
    grenades: snapshotGrenades(world), // Story 5.5
    // Story 5.12: molotov zones (players' consumable slot, count and cooldown ride in `players`).
    molotovs: snapshotMolotovs(world),
    // Story 5.8: queued Bloater blasts and gas clouds (each zombie's `swellTicks` rides in `zombies`).
    bloater: snapshotBlasts(world),
    // Story 2.12: the zombie position history (evolved state: switch, row labels, hash of the rows).
    zombieHistory: snapshotZombieHistory(world.zombieHistory),
    // Story 5.4: the flame slot table (players' `flameSlot`, `flaming` and `flameClock` ride in `players`).
    flameSlots: [...world.flameSlots],
    // Story 6.5: the Behemoth (all of it, incl. threat, attack and history; its grid/field ride in `pathing`).
    boss: snapshotBoss(world.boss),
    special: snapshotSpecial(world.special), // Story 6.8
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
