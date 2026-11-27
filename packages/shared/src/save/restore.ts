/**
 * Stories 8.4–8.6 (AC 13, architecture › decay line 459): THE restore of a run save. One path, used by the resume and
 * by the round-trip tests (never a second "load"). `restoreRunSave` builds a World exactly as it was at capture (its
 * `saveDigest` is checked against the save's), `resumeSavedRun` then opens tonight's calm phase on it (a fresh timer).
 */
import { createWorld, type World } from "../core/world";
import type { Systems } from "../core/systems";
import type { Balance } from "../config/balance";
import type { DistrictMap } from "../map/placeholderMap";
import type { PlayerState } from "../player/player";
import { applyDecayStage } from "../decay/applyDecayStage";
import { updateLightState } from "../decay/lightState";
import { createRngFromState, type RngState } from "../core/rng";
import { MAX_DAMAGERS } from "../economy/economy";
import { createSlot, STARTING_WEAPON } from "../combat/loadout";
import { resetBuildSpend } from "../buildings/buildings";
import { ticksFor } from "../core/time";
import { VOTE_NONE } from "../run/runStateMachine";
import { clonePlain, hydrate, type Plain } from "./plain";
import { SHOT_FIELDS, saveDigest, type RunSave, type SavedSeat } from "./runSave";
import { MAX_PIERCE } from "../combat/projectilePool";

export interface RestoreOptions {
  readonly balance: Balance;
  readonly map: DistrictMap;
  /** Tests only: replace systems by name. */
  readonly systems?: Partial<Systems>;
  /** Seats that come into the World now (by player id); every other saved seat is returned in `away`. Default: all. */
  readonly present?: (seat: SavedSeat) => boolean;
  /**
   * Decision 8.6-B8: the restoring code's version (default "dev"). The digest is checked only when it equals the save's
   * `codeVersion` and the balance is the same; otherwise the restore is best-effort (the caller logs it).
   */
  readonly codeVersion?: string;
  /** Logs what E8-S9 dropped (an id the current balance no longer knows). */
  readonly onDropped?: (what: { kind: "building" | "weapon" | "consumable"; id: string; owner: string | null; refund: number }) => void;
}

export interface RestoredSeat {
  readonly seat: SavedSeat;
  readonly player: PlayerState;
}

export interface Restored {
  readonly world: World;
  /** Seats in the World now. */
  readonly present: RestoredSeat[];
  /** Saved seats not in the World (their owner isn't here yet): the room keeps them as remembered seats (E8-R2). */
  readonly away: RestoredSeat[];
  /** False when the save's balance differs (E8-S9 may have changed it: no digest check). */
  readonly digestChecked: boolean;
}

/** A save that can't be restored (map mismatch, digest mismatch): the room refuses the resume, never throws into a tick. */
export class SaveRestoreError extends Error {
  constructor(readonly why: "map" | "map_version" | "digest" | "shape") {
    super(`restoreRunSave: ${why}`);
    this.name = "SaveRestoreError";
  }
}

/** The saved shots back into the pool at their own ids, in alive order, with the same free-id stack. */
function restoreShots(world: World, saved: RunSave["world"]["projectiles"] | undefined): void {
  if (!saved) return;
  const p = world.projectiles;
  p.alivePos.fill(-1);
  p.aliveCount = 0;
  for (const s of saved.alive) {
    const id = s.id;
    if (!Number.isInteger(id) || id < 0 || id >= p.capacity) continue;
    SHOT_FIELDS.forEach((name, i) => {
      p[name][id] = s.f[i] ?? 0;
    });
    p.owner[id] = s.owner;
    const n = Math.min(MAX_PIERCE, s.hits.length);
    for (let k = 0; k < n; k++) p.hitIds[id * MAX_PIERCE + k] = s.hits[k] as number;
    p.hitCount[id] = n;
    p.alivePos[id] = p.aliveCount;
    p.aliveIds[p.aliveCount++] = id;
  }
  const free = saved.free.slice(0, p.capacity);
  p.freeIds.set(free);
  p.freeCount = free.length;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** E8-S9: what the current balance no longer knows is dropped (a building's `paid` back to its owner's wallet). */
function fitToBalance(balance: Balance, players: Map<string, PlayerState>, buildings: Record<string, unknown>[], onDropped: RestoreOptions["onDropped"]): Record<string, unknown>[] {
  const kept: Record<string, unknown>[] = [];
  for (const b of buildings) {
    const type = String(b.type);
    if (Object.prototype.hasOwnProperty.call(balance.buildings.types, type)) {
      kept.push(b);
      continue;
    }
    const owner = typeof b.ownerId === "string" && b.ownerId !== "" ? b.ownerId : null;
    const refund = typeof b.paid === "number" && b.paid > 0 ? Math.floor(b.paid) : 0;
    const p = owner === null ? undefined : players.get(owner);
    if (p && refund > 0) p.wallet += refund;
    onDropped?.({ kind: "building", id: type, owner, refund: p ? refund : 0 });
  }
  for (const p of players.values()) {
    const slots = p.loadout.slots as (PlayerState["loadout"]["slots"][number] | null)[];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s || Object.prototype.hasOwnProperty.call(balance.weapons, s.weapon)) continue;
      onDropped?.({ kind: "weapon", id: s.weapon, owner: p.id, refund: 0 });
      slots[i] = i === 0 ? createSlot(balance, STARTING_WEAPON) : null;
      if (p.loadout.active === i && i > 0) p.loadout.active = 0;
    }
    if (p.consumable !== null && !Object.prototype.hasOwnProperty.call(balance.consumables.items, p.consumable)) {
      onDropped?.({ kind: "consumable", id: p.consumable, owner: p.id, refund: 0 });
      p.consumable = null;
      p.consumableCount = 0;
    }
  }
  return kept;
}

/**
 * Builds the World a save describes: `createWorld` with the save's seed, the decay stage applied through the
 * mutation-only path (`applyDecayStage`: no destruction, refunds, banners or events), the car fires' clocks, then the
 * buildings, the economy / shop / boss / special / run / light / stream states and the seats. Flow fields rebuild on
 * the first pathing tick. Nothing is emitted. Throws `SaveRestoreError` for another map or a digest that doesn't match.
 */
export function restoreRunSave(save: RunSave, opts: RestoreOptions): Restored {
  if (save.mapName !== opts.map.name) throw new SaveRestoreError("map");
  // Review M3 (8.6-B8): never restore onto other map geometry (buildings, fires and spawns would not fit).
  if (save.mapVersion !== opts.map.version) throw new SaveRestoreError("map_version");
  const sw = save.world;
  if (!sw || !Array.isArray(save.seats)) throw new SaveRestoreError("shape");
  const world = createWorld({ balance: opts.balance, seed: save.seed, map: opts.map, ...(opts.systems ? { systems: opts.systems } : {}), loot: { off: true } });
  const w = world as Mutable<World>;
  w.tick = sw.tick;
  // Decay: the mutation-only apply (idempotent, from scratch), then the fire clocks and the obstacle rebuild count.
  applyDecayStage(world, sw.decay.stage, sw.decay.variants, sw.decay.firesOut);
  world.decay.fireEndWave.set(sw.decay.fireEndWave.slice(0, world.decay.fireEndWave.length));
  world.decay.burnTicks = sw.decay.burnTicks;
  world.obstacles.version = sw.obstaclesVersion;
  // Streams (every named stream and each shop stream's build key).
  const st = sw.streams as unknown as { decay: RngState; events: RngState; spawns: RngState; combat: RngState; loot: RngState; shop: { buildPhaseIndex: number; state: RngState }[] };
  const streams = world.streams as Mutable<World["streams"]>;
  streams.decay = createRngFromState(st.decay);
  streams.events = createRngFromState(st.events);
  streams.spawns = createRngFromState(st.spawns);
  streams.combat = createRngFromState(st.combat);
  streams.loot = createRngFromState(st.loot);
  streams.shop = st.shop.map((s) => ({ buildPhaseIndex: s.buildPhaseIndex, rng: createRngFromState(s.state) }));
  // Pools: only counters (they are empty in a calm phase).
  const z = world.zombies;
  z.nextUnused = sw.zombies.nextUnused;
  z.freedIds.set(sw.zombies.freedIds.slice(0, z.capacity));
  z.freedAtTick.set(sw.zombies.freedAtTick.slice(0, z.capacity));
  z.freedHead = sw.zombies.freedHead;
  z.freedCount = sw.zombies.freedCount;
  z.generation.set(sw.zombies.generation.slice(0, z.capacity));
  world.projectiles.lastShotId = sw.counters.lastShotId;
  restoreShots(world, sw.projectiles);
  world.spits.nextId = sw.counters.spitsNextId;
  world.grenades.nextId = sw.counters.grenadesNextId;
  world.molotovs.nextId = sw.counters.molotovsNextId;
  // Plain state, hydrated into the fresh structures.
  hydrate(world.waves, sw.waves);
  hydrate(world.run, sw.run);
  hydrate(world.debug, sw.debug);
  w.teamWiped = sw.teamWiped;
  for (const row of sw.damagers) {
    const id = row[0] as number;
    const ids = row.slice(1) as (string | null)[];
    if (!Number.isInteger(id) || id < 0 || id >= world.economy.damagerCount.length) continue;
    const n = Math.min(MAX_DAMAGERS, ids.length);
    for (let k = 0; k < n; k++) world.economy.damagers[id * MAX_DAMAGERS + k] = ids[k] ?? null;
    world.economy.damagerCount[id] = n;
  }
  hydrate(world.shop, sw.shop);
  hydrate(world.boss, sw.boss);
  hydrate(world.special, sw.special);
  hydrate(world.loot, sw.loot);
  const l = world.lights;
  l.blackoutPct = sw.lights.blackoutPct;
  l.halfDark = sw.lights.halfDark;
  l.powerFailure = sw.lights.powerFailure;
  l.forcedPct = sw.lights.forcedPct;
  // Seats: every saved survivor, then the buildings (E8-S9 may refund a dropped one to its owner).
  const all = new Map<string, PlayerState>();
  const bySeat: RestoredSeat[] = [];
  for (const seat of save.seats) {
    const p = clonePlain<PlayerState>(seat.player);
    all.set(p.id, p);
    bySeat.push({ seat, player: p });
  }
  const sameBalance = save.balanceVersion === opts.balance.version;
  const bPlain = sw.buildings as { list: Plain[]; nextId: number; version: number; wallVersion: number };
  let list = bPlain.list.map((b) => clonePlain<Record<string, unknown>>(b));
  if (!sameBalance) list = fitToBalance(opts.balance, all, list, opts.onDropped);
  const bs = world.buildings as Mutable<World["buildings"]>;
  bs.list.length = 0;
  for (const b of list) bs.list.push(b as unknown as World["buildings"]["list"][number]);
  bs.nextId = bPlain.nextId;
  bs.version = bPlain.version;
  bs.wallVersion = bPlain.wallVersion;
  updateLightState(world); // the derived light list (floodlights + fires)
  // Who is in the World now; flame slots as saved, minus seats that are away.
  const isPresent = opts.present ?? (() => true);
  const present: RestoredSeat[] = [];
  const away: RestoredSeat[] = [];
  for (const r of bySeat) (isPresent(r.seat) ? present : away).push(r);
  for (const r of present) world.players.set(r.player.id, r.player);
  const flame = world.flameSlots as (string | null)[];
  for (let i = 0; i < flame.length; i++) flame[i] = sw.flameSlots[i] ?? null;
  // The digest of the World exactly as saved (every seat's flame slot still claimed), then the away seats' slots free.
  const sameCode = (save.codeVersion ?? "dev") === (opts.codeVersion ?? "dev");
  const checked = sameBalance && sameCode;
  if (checked && saveDigest(world, away.map((r) => r.player)) !== save.digest) throw new SaveRestoreError("digest");
  for (let i = 0; i < flame.length; i++) if (flame[i] !== null && !world.players.has(flame[i] as string)) flame[i] = null;
  // Story 10.7 (save v2): a version-1 seat has no `weaponsBought` (its digest was taken without it): an empty list,
  // filled AFTER the digest check so a v1 save still checks against its own digest.
  for (const r of bySeat) if (!Array.isArray(r.player.weaponsBought)) r.player.weaponsBought = [];
  return { world, present, away, digestChecked: checked };
}

/**
 * Tonight's calm phase on a restored World (E8-R4, E8-S12): a fresh build timer (or vote timer), every Ready and vote
 * cleared, no late-join extension used yet, and every building counts as placed in an earlier phase (5.20: no
 * take-back on resume). No `build.started` heal and no offer redraw: the saved offer stays.
 */
export function resumeSavedRun(world: World, away: readonly PlayerState[] = []): void {
  const run = world.run;
  run.joinExtendedBuild = false;
  run.joinPending = false;
  if (run.phase === "vote") {
    run.buildTicksLeft = 0;
    run.voteTicksLeft = ticksFor(world.balance.waves.evac.voteS);
  } else {
    run.phase = "build";
    run.voteTicksLeft = 0;
    run.buildTicksLeft = ticksFor(world.balance.waves.buildPhaseS);
  }
  // Review L: the away seats too (a remembered seat that comes back tonight is not Ready / voted from the last night).
  for (const p of [...world.players.values(), ...away]) {
    p.buildReady = false;
    p.vote = VOTE_NONE;
  }
  resetBuildSpend(world);
}
