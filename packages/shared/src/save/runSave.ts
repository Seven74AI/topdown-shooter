/**
 * Stories 8.4–8.6 (Epic 8 D10, decision E8-S1): THE run save. A separate, versioned, plain-JSON format (not
 * `snapshotWorld`, which hashes evolved buffers): `captureRunSave` takes it in a calm phase (a build phase or the
 * evacuation vote, E8-S12), `restoreRunSave` (`restore.ts`) builds a World from it. Every World / PlayerState field is
 * either saved here or on the written exclusion list below (`runSave.coverage.test.ts` enforces it, brief 2).
 *
 * Pure (no Node): the server stores the JSON (`saved_runs.snapshot`), it is never sent to a client.
 */
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { buildStartIndex } from "../player/hold";
import { snapshotWorld } from "../core/worldSnapshot";
import { canonicalJson, fnv1a32 } from "../core/hash";
import { snapshotSeedStreams } from "../core/seedStreams";
import { toPlain, type Plain } from "./plain";
import { MAX_DAMAGERS } from "../economy/economy";
import { MAX_PIERCE } from "../combat/projectilePool";

/** Bump with a step in `SAVE_MIGRATIONS` (`migrations.ts`) whenever the saved shape changes (a test checks both). */
export const SAVE_SCHEMA_VERSION = 2;

/** D10 "about 50 KB": a 4-player wave-10 build with 60 buildings stays under this (test). */
export const SAVE_MAX_BYTES = 64 * 1024;

export type SavePhase = "build" | "vote";

/** One seat of the run: present, held (8.1) or remembered (a hold that ran out, or a resumed seat still missing). */
export interface SavedSeat {
  /** `acct:<accountId>` or `guest:<hash>` (7.1): who may take this seat on a resume. */
  readonly seatKey: string;
  /** The seat's account (null: a guest seat; it is saved but no account lists the run). */
  readonly accountId: string | null;
  readonly name: string;
  readonly slot: number;
  readonly playerId: string;
  /** Story 8.3 review H1: the seat's generation (its bank key `playerId#gen`). */
  readonly seatGen: number;
  /** Story 7.9: the seat's look code. */
  readonly look: string;
  /** The survivor (every PlayerState field, plain). */
  readonly player: Plain;
  /** Results kills (the room's count, not a World field). */
  readonly kills: number;
  /** `buildStartIndex` the seat was last in the World at (a remembered seat's catch-up heal, 8.1 review H2). */
  readonly buildIdx: number;
}

/** A seat the host removed (8.3, E8-S10): matched like `sameSeat`. */
export interface SavedBan {
  readonly seatKey: string;
  readonly guestTokenHash: string;
}

/** One projectile in flight (every per-slot field of `ProjectilePool`). */
export interface SavedShot {
  id: number;
  f: number[];
  owner: string | null;
  hits: number[];
}

/** `ProjectilePool` per-slot number fields, in the order of `SavedShot.f`. */
export const SHOT_FIELDS = ["x", "y", "prevX", "prevY", "dirX", "dirY", "speedMps", "rangeLeftM", "advanceM", "rewindTicks", "damage", "pierceLeft", "weapon", "building", "pushbackM", "shotId"] as const;

/** The World part of a save (see `WORLD_SAVE_PLAN` for what each key is). */
export interface SavedWorld {
  tick: number;
  streams: Plain;
  decay: { stage: number; variants: number; firesOut: number; fireEndWave: number[]; burnTicks: number };
  obstaclesVersion: number;
  zombies: { nextUnused: number; freedIds: number[]; freedAtTick: number[]; freedHead: number; freedCount: number; generation: number[] };
  counters: { lastShotId: number; spitsNextId: number; grenadesNextId: number; molotovsNextId: number };
  /** Shots still flying (a turret's last round at a wave's end; frozen through a vote), in alive order, and the free-id stack. */
  projectiles: { alive: SavedShot[]; free: number[] };
  waves: Plain;
  run: Plain;
  debug: Plain;
  teamWiped: boolean;
  /** Sparse `[slot, ...playerIds]` per zombie slot with damagers (as `snapshotWorld`). */
  damagers: (number | string | null)[][];
  buildings: Plain;
  flameSlots: (string | null)[];
  lights: { blackoutPct: number; halfDark: boolean; powerFailure: boolean; forcedPct: number };
  shop: Plain;
  boss: Plain;
  special: Plain;
  loot: Plain;
}

export interface RunSave {
  schemaVersion: number;
  /** The balance the save was taken with (a different one never blocks a resume: E8-S9 drops what it no longer knows). */
  balanceVersion: string;
  mapName: string;
  mapVersion: string;
  /** Story 7.2's run id = the save id, kept across resumes (E8-S3). */
  runId: string;
  seed: number;
  district: string;
  /** Waves cleared so far (`waves.number`). */
  wave: number;
  phase: SavePhase;
  /** `saveDigest` of the World at capture: a restore must reproduce it (else the save is refused as corrupt). */
  digest: number;
  world: SavedWorld;
  seats: SavedSeat[];
  bannedSeats: SavedBan[];
  /**
   * Review M3 (decision 8.6-B8): the code that wrote the save (the server's build, e.g. its git sha). The digest is
   * checked only when the restoring code is the same; another build restores best-effort (never blocks: D14).
   */
  codeVersion: string;
  /** Review H1: the SEAT that found the loot bag (`playerId#gen`), so a reused player id is never taken for it; null none. */
  lootFinderSeat: string | null;
  /** Review L: the room's seat counter (a resumed room never hands out a generation twice). */
  seatCounter: number;
}

/** What the room knows about a seat beyond the World (a remembered seat brings its own PlayerState). */
export interface SeatMeta {
  readonly seatKey: string;
  readonly accountId: string | null;
  readonly name: string;
  readonly slot: number;
  readonly playerId: string;
  readonly seatGen?: number;
  readonly look?: string;
  readonly kills: number;
  /** A remembered seat's state (not in the World); absent → `world.players` / `world.heldPlayers`. */
  readonly player?: PlayerState;
  readonly buildIdx?: number;
}

export interface SaveMeta {
  readonly runId: string;
  readonly district: string;
  readonly bannedSeats?: readonly SavedBan[];
  /** Decision 8.6-B8: the writing code's version (default "dev"). */
  readonly codeVersion?: string;
  /** Review H1: the finding seat (`playerId#gen`) the room's bank noted. */
  readonly lootFinderSeat?: string | null;
  readonly seatCounter?: number;
}

/**
 * Brief 2: what every World key is in the save. "saved": in `SavedWorld` (all of it); "derived": rebuilt by the restore
 * from saved state; "counter": only its id counters are saved — its live content is empty in a calm phase
 * (`saveBlocker` refuses a capture otherwise); "excluded": not saved, with the reason.
 */
export const WORLD_SAVE_PLAN = {
  tick: "saved",
  balance: "excluded: the server's own balance; its version is saved (E8-S9)",
  seed: "saved",
  streams: "saved",
  events: "excluded: the event bus is wiring (subscribers), no state",
  pendingInputs: "excluded: connection runtime (a resumed seat starts a new input stream)",
  inputs: "excluded: connection runtime",
  lastAppliedSeq: "excluded: connection runtime (seqs restart with the new socket)",
  map: "saved: name and version (static frozen data)",
  obstacles: "derived: applyDecayStage(stage, variants, firesOut); its rebuild count is saved",
  decay: "saved: stage, variants, firesOut, fireEndWave, burnTicks (fires derived from them)",
  players: "saved: as seats",
  heldPlayers: "saved: as seats (every seat is out of the World on a resume until its owner is back)",
  zombies: "counter: nextUnused, the freed-slot ring and the generations (no zombie lives in a calm phase)",
  zombieGrid: "excluded: rebuilt every tick by the zombie system",
  projectiles: "saved: shots in flight (sparse), the free-id stack and lastShotId",
  waves: "saved",
  run: "saved",
  debug: "saved: dev switches",
  teamWiped: "saved",
  economy: "saved: damagers (sparse)",
  buildings: "saved",
  pathing: "excluded: nav grids and flow fields are rebuilt from the obstacles, fires and buildings",
  zombieHistory: "excluded: rewind rows (no zombies); the switch is the room's lag compensation",
  rewoundView: "excluded: scratch",
  spits: "counter: nextId (cleared at every build start / vote)",
  areas: "excluded: acid puddles are cleared at every build start / vote",
  flameSlots: "saved",
  grenades: "counter: nextId (cleared at every build start / vote)",
  blasts: "excluded: cleared at every build start / vote",
  gas: "excluded: cleared at every build start / vote",
  molotovs: "counter: nextId (cleared at every build start / vote)",
  lights: "saved: the four flags (the list is derived from buildings and fires)",
  shop: "saved",
  boss: "saved",
  special: "saved",
  loot: "saved",
  godPlayers: "excluded: an admin cheat (Story 10.12 B6): a resume starts without it",
  extract: "excluded: phase extract is never saved (Story 12.2; a save in the vote resumes with the helicopter landed)",
} as const satisfies Record<keyof World, string>;

/** Brief 2: PlayerState is saved whole (every field). */
export const PLAYER_SAVE_PLAN = "saved: every field (toPlain)";

/** `snapshotWorld` keys the save digest leaves out (each is "excluded" or "derived without a hash" above). */
export const DIGEST_EXCLUDED_KEYS = ["pendingInputs", "inputs", "lastAppliedSeq", "pathing", "zombieHistory", "balanceVersion", "players", "heldPlayers"] as const;

/** Why the World can't be saved right now (null: it can). Calm phases only, and nothing live in the pools. */
export function saveBlocker(world: Readonly<World>): string | null {
  const phase = world.run.phase;
  if (phase !== "build" && phase !== "vote") return `phase_${phase}`;
  if (world.teamWiped) return "wiped";
  if (world.zombies.aliveCount > 0) return "zombies";
  if (world.spits.count > 0 || world.areas.count > 0) return "acid";
  if (world.grenades.count > 0) return "grenades";
  if (world.blasts.count > 0 || world.gas.count > 0) return "blasts";
  if (world.molotovs.areas.count > 0) return "molotovs";
  return null;
}

/** Thrown by `captureRunSave` when `saveBlocker` says no (the room logs it and skips: play goes on). */
export class SaveBlockedError extends Error {
  constructor(readonly why: string) {
    super(`captureRunSave: ${why}`);
    this.name = "SaveBlockedError";
  }
}

/**
 * The digest a save must reproduce: `snapshotWorld` minus `DIGEST_EXCLUDED_KEYS`, plus every seat's PlayerState (in the
 * World, held, or `away`) by player id — on a resume a seat may be in or out of the World, its state is the same.
 */
export function saveDigest(world: Readonly<World>, away: readonly PlayerState[] = []): number {
  const snap = snapshotWorld(world as World) as Record<string, unknown>;
  for (const k of DIGEST_EXCLUDED_KEYS) delete snap[k];
  const seats = new Map<string, Plain>();
  for (const [id, p] of world.players) seats.set(id, toPlain(p));
  for (const [id, h] of world.heldPlayers) seats.set(id, toPlain(h.player));
  for (const p of away) seats.set(p.id, toPlain(p));
  snap.seats = [...seats.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return fnv1a32(canonicalJson(snap));
}

function captureShots(world: Readonly<World>): SavedWorld["projectiles"] {
  const p = world.projectiles;
  const alive: SavedShot[] = [];
  for (let k = 0; k < p.aliveCount; k++) {
    const id = p.aliveIds[k] as number;
    const f = SHOT_FIELDS.map((name) => p[name][id] as number);
    alive.push({ id, f, owner: p.owner[id] ?? null, hits: Array.from(p.hitIds.subarray(id * MAX_PIERCE, id * MAX_PIERCE + (p.hitCount[id] as number))) });
  }
  return { alive, free: Array.from(p.freeIds.subarray(0, p.freeCount)) };
}

/** The World part of a save (copies only: nothing references the World). */
function captureWorld(world: Readonly<World>): SavedWorld {
  const z = world.zombies;
  const e = world.economy;
  const damagers: (number | string | null)[][] = [];
  for (let id = 0; id < e.damagerCount.length; id++) {
    const n = e.damagerCount[id] as number;
    if (n > 0) damagers.push([id, ...e.damagers.slice(id * MAX_DAMAGERS, id * MAX_DAMAGERS + n)]);
  }
  return {
    tick: world.tick,
    streams: toPlain(snapshotSeedStreams(world.streams)),
    decay: { stage: world.decay.stage, variants: world.decay.variants, firesOut: world.decay.firesOut, fireEndWave: Array.from(world.decay.fireEndWave), burnTicks: world.decay.burnTicks },
    obstaclesVersion: world.obstacles.version,
    zombies: { nextUnused: z.nextUnused, freedIds: Array.from(z.freedIds), freedAtTick: Array.from(z.freedAtTick), freedHead: z.freedHead, freedCount: z.freedCount, generation: Array.from(z.generation) },
    projectiles: captureShots(world),
    counters: { lastShotId: world.projectiles.lastShotId, spitsNextId: world.spits.nextId, grenadesNextId: world.grenades.nextId, molotovsNextId: world.molotovs.nextId },
    waves: toPlain(world.waves),
    run: toPlain(world.run),
    debug: toPlain(world.debug),
    teamWiped: world.teamWiped,
    damagers,
    buildings: toPlain({ list: world.buildings.list, nextId: world.buildings.nextId, version: world.buildings.version, wallVersion: world.buildings.wallVersion }),
    flameSlots: [...world.flameSlots],
    lights: { blackoutPct: world.lights.blackoutPct, halfDark: world.lights.halfDark, powerFailure: world.lights.powerFailure, forcedPct: world.lights.forcedPct },
    shop: toPlain(world.shop),
    boss: toPlain(world.boss),
    special: toPlain(world.special),
    loot: toPlain(world.loot),
  };
}

/**
 * Takes the save (between ticks or right after a tick's events, never mid-system). `seats`: every seat of the run the
 * room knows (members in the World or held, remembered seats with their `player`). A World seat the room didn't list is
 * a bug (thrown). Throws `SaveBlockedError` outside a calm phase or with live zombies / shots / hazards.
 */
export function captureRunSave(world: Readonly<World>, seats: readonly SeatMeta[], meta: SaveMeta): RunSave {
  const why = saveBlocker(world);
  if (why !== null) throw new SaveBlockedError(why);
  const listed = new Set(seats.map((s) => s.playerId));
  for (const id of world.players.keys()) if (!listed.has(id)) throw new Error(`captureRunSave: player ${id} has no seat`);
  for (const id of world.heldPlayers.keys()) if (!listed.has(id)) throw new Error(`captureRunSave: held player ${id} has no seat`);
  const nowIdx = buildStartIndex(world);
  const away: PlayerState[] = [];
  const saved: SavedSeat[] = [];
  for (const s of [...seats].sort((a, b) => a.slot - b.slot)) {
    const inWorld = world.players.get(s.playerId);
    const held = world.heldPlayers.get(s.playerId);
    const p = inWorld ?? held?.player ?? s.player;
    if (!p) throw new Error(`captureRunSave: seat ${s.playerId} has no state`);
    if (!inWorld && !held) away.push(p);
    saved.push({
      seatKey: s.seatKey,
      accountId: s.accountId,
      name: s.name,
      slot: s.slot,
      playerId: s.playerId,
      seatGen: s.seatGen ?? 0,
      look: s.look ?? "",
      player: toPlain(p),
      kills: s.kills,
      buildIdx: inWorld ? nowIdx : held ? held.buildIdx : (s.buildIdx ?? nowIdx),
    });
  }
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    balanceVersion: world.balance.version,
    mapName: world.map.name,
    mapVersion: world.map.version,
    runId: meta.runId,
    seed: world.seed,
    district: meta.district,
    wave: world.waves.number,
    phase: world.run.phase as SavePhase,
    digest: saveDigest(world, away),
    world: captureWorld(world),
    seats: saved,
    bannedSeats: (meta.bannedSeats ?? []).map((b) => ({ seatKey: b.seatKey, guestTokenHash: b.guestTokenHash })),
    codeVersion: meta.codeVersion ?? "dev",
    lootFinderSeat: meta.lootFinderSeat ?? null,
    seatCounter: meta.seatCounter ?? Math.max(0, ...saved.map((x) => x.seatGen)),
  };
}
