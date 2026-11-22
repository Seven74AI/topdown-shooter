import { MAX_PLAYERS } from "../net/messages";
import { fnv1a32 } from "./hash";
import { createRng, type Rng, type RngState } from "./rng";

/**
 * Story 4.4 (FR65, NFR10): every random choice of a run comes from a named sub-stream of the one run
 * seed, so drawing from one stream never changes another's sequence and a run replays exactly from
 * its seed and input log. Never draw from anything else in the simulation.
 *
 * - `decay`: the decay timeline's variations (Story 4.5: which cars burn, which alley collapses).
 * - `events`: random events (Epic 5).
 * - `spawns`: wave spawn-point picks and edge jitter; dev-cheat spawns.
 * - `combat`: offline (solo) weapon spread. Online spread is `seqSpreadRoll(playerId, seq)` (Story
 *   2.12, a pure function the shooter's client computes) and uses no stream.
 * - `shop:<playerSlot>:<buildPhaseIndex>`: one player's shop draws in one build phase (`shopStream`).
 */
export const STREAM_NAMES = ["decay", "events", "spawns", "combat"] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

/** murmur3's 32-bit finaliser (a bijection on uint32). */
function fmix32(x: number): number {
  let h = x | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The seed of stream `key` of run `runSeed` (uint32). XOR with an odd multiple of the key's FNV-1a
 * hash, then a bijective finaliser: within one run, keys with different hashes never share a seed.
 */
export function streamSeed(runSeed: number, key: string): number {
  return fmix32((runSeed >>> 0) ^ Math.imul(fnv1a32(key), 0x9e3779b1));
}

/** The key of one player's shop stream in one build phase. */
export function shopStreamKey(playerSlot: number, buildPhaseIndex: number): string {
  return `shop:${playerSlot}:${buildPhaseIndex}`;
}

/** One player slot's shop stream, rekeyed in place for each build phase. */
export interface ShopStream {
  /** Build phase index the stream is keyed for (-1: never used yet). */
  buildPhaseIndex: number;
  readonly rng: Rng;
}

export interface SeedStreams {
  readonly decay: Rng;
  readonly events: Rng;
  readonly spawns: Rng;
  readonly combat: Rng;
  /** Indexed by player slot (0 … MAX_PLAYERS − 1; solo is slot 0). Preallocated. */
  readonly shop: readonly ShopStream[];
}

export function createSeedStreams(runSeed: number): SeedStreams {
  const seed = runSeed >>> 0;
  return {
    decay: createRng(streamSeed(seed, "decay")),
    events: createRng(streamSeed(seed, "events")),
    spawns: createRng(streamSeed(seed, "spawns")),
    combat: createRng(streamSeed(seed, "combat")),
    shop: Array.from({ length: MAX_PLAYERS }, (_, slot) => ({ buildPhaseIndex: -1, rng: createRng(streamSeed(seed, shopStreamKey(slot, 0))) })),
  };
}

/**
 * Index of the current (or coming) build phase: 0 before wave 1, n before wave n + 1. It is the wave
 * director's number, so no extra run state exists and a mid-run joiner lands on the same key.
 */
export function buildPhaseIndex(world: { readonly waves: { readonly number: number } }): number {
  return world.waves.number;
}

/**
 * The shop stream `shop:<playerSlot>:<buildPhaseIndex>` for this build phase. The slot's
 * preallocated stream is reseeded in place the first time it is used in a build phase, so rerolls
 * inside one build advance it and the next build starts its own sequence. Throws for a slot outside
 * 0 … MAX_PLAYERS − 1 (a bug).
 */
export function shopStream(world: { readonly seed: number; readonly streams: SeedStreams; readonly waves: { readonly number: number } }, playerSlot: number): Rng {
  const s = world.streams.shop[playerSlot];
  if (!s) throw new Error(`shopStream: no slot ${playerSlot}`);
  const build = buildPhaseIndex(world);
  if (s.buildPhaseIndex !== build) {
    s.rng.reseed(streamSeed(world.seed, shopStreamKey(playerSlot, build)));
    s.buildPhaseIndex = build;
  }
  return s.rng;
}

/** Plain-data state of every stream, for `snapshotWorld`. */
export function snapshotSeedStreams(s: SeedStreams): {
  decay: RngState;
  events: RngState;
  spawns: RngState;
  combat: RngState;
  shop: { buildPhaseIndex: number; state: RngState }[];
} {
  return {
    decay: s.decay.getState(),
    events: s.events.getState(),
    spawns: s.spawns.getState(),
    combat: s.combat.getState(),
    shop: s.shop.map((x) => ({ buildPhaseIndex: x.buildPhaseIndex, state: x.rng.getState() })),
  };
}

const MAX_UINT32 = 0xffffffff;

/** A typed run seed (dev cheat, `?seed=`): decimal or 0x-hex uint32, or null when invalid. */
export function parseRunSeed(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const t = text.trim();
  if (!/^(\d+|0x[0-9a-f]+)$/i.test(t)) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= MAX_UINT32 ? n : null;
}
