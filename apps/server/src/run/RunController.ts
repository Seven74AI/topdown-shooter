import {
  NEUTRAL_INPUT,
  REWIND_MAX_TICKS,
  TICK_DT_S,
  addPlayer,
  applyTestScenario,
  placeBuilding,
  repairBuilding,
  buyWeapon,
  createWorld,
  removePlayer,
  setBuildReady,
  setZombieHistoryEnabled,
  setInput,
  skippedInputWeaponTick,
  startBuild,
  tickSlow,
  step,
  teamSpawnPoint,
  type Balance,
  type Building,
  type PlaceError,
  type PlaceRequest,
  type RepairError,
  type Repaired,
  type Bought,
  type PlayerInput,
  type Result,
  type ShopError,
  type SimEvent,
  type Systems,
  type TestScenario,
  type World,
  type ZombieTypeId,
} from "@topdown/shared";
import { REWIND_CAP_MS, SHOT_ADVANCE_CAP_MS } from "../net/limits";

/** Story 2.12: the rewind cap in ticks (REWIND_CAP_MS, never more than the shared history holds). */
export const REWIND_CAP_TICKS = Math.min(REWIND_MAX_TICKS, Math.floor(REWIND_CAP_MS / (TICK_DT_S * 1000)));

/** Inputs kept per player: 6 steps = 300 ms of jitter (Story 2.4 › Input queue). */
export const INPUT_QUEUE_MAX = 6;
/** Backlog the queue should settle at: 2 inputs = 100 ms of jitter cover (Story 2.4 review). */
export const INPUT_QUEUE_TARGET = 2;
/**
 * Ticks in a row above the target before the server starts skipping (40 = 2 s). Long on purpose:
 * after a 4G spike the burst refills the queue, and draining it too soon removes the cover for
 * the next spike (starve → drain → starve; review sim: 0.5 s added ~35 % more starved ticks).
 */
export const INPUT_DRAIN_AFTER_TICKS = 40;
/** While draining, skip one input every this many ticks (2 → a 6-input backlog is gone ~2.4 s after the stall). */
export const INPUT_DRAIN_EVERY_TICKS = 2;

type MutableInput = { -readonly [K in keyof PlayerInput]: PlayerInput[K] };

const copyInput = (to: MutableInput, from: PlayerInput): void => {
  to.seq = from.seq;
  to.moveX = from.moveX;
  to.moveY = from.moveY;
  to.aimX = from.aimX;
  to.aimY = from.aimY;
  to.fire = from.fire;
  to.swap = from.swap;
  to.consumable = from.consumable;
  to.isMouse = from.isMouse;
  to.viewTick = from.viewTick; // Story 2.12
};

/** Per-player input ring and ack. Preallocated: queueing and ticking never allocate. */
class PlayerSlot {
  constructor(readonly playerId: string) {}
  readonly ring: MutableInput[] = Array.from({ length: INPUT_QUEUE_MAX }, () => ({ ...NEUTRAL_INPUT }));
  head = 0;
  count = 0;
  /** Highest seq queued so far; anything ≤ it is a duplicate or arrived late. */
  lastQueuedSeq = 0;
  /** Seq of the input applied on the last tick (a starved tick keeps it). */
  ackSeq = 0;
  /** The input handed to the World this tick (one object per player, copied into). */
  readonly current: MutableInput = { ...NEUTRAL_INPUT };
  rttMs = 0;
  /** Inputs dropped because the ring was full (oldest first). */
  overflowDrops = 0;
  /** Inputs ignored because their seq was not newer. */
  staleDrops = 0;
  /** Inputs skipped to drain a lasting backlog (their edge flags carried forward). */
  drainSkips = 0;
  /** Ticks in a row that started with more than INPUT_QUEUE_TARGET inputs queued. */
  overTargetTicks = 0;
  /** Zombies this player killed this run (Story 2.8 Results). */
  kills = 0;
  /**
   * Story 2.7 review: inputs dropped since the last tick (overflow or drain), oldest first (copies).
   * Each gets a weapon-only tick before the next step, so weapon timing follows seqs.
   */
  readonly skipped: MutableInput[] = Array.from({ length: SKIPPED_MAX }, () => ({ ...NEUTRAL_INPUT }));
  skippedCount = 0;
  /**
   * Weapon ticks owed (re-review MED-A): +1 per starved (paused) tick, at most SKIPPED_MAX. A
   * dropped input gets its dry weapon tick only against this debt, so it only gives back weapon time
   * a stall took. Sending inputs faster than 20/s (the bucket allows 25) gains nothing: without
   * debt a dropped input has no weapon tick and its swap moves to the next input, as before 2.7.
   */
  weaponDebt = 0;
}

/** Dropped inputs remembered for their weapon-only tick (more in one tick is a client flood: dropped). */
const SKIPPED_MAX = 16;

/**
 * Drops the oldest queued input but keeps its one-shot flags: a swap or consumable press must
 * never be lost (Epic 1 lesson). The swap is kept at its own seq (Story 2.7 review): the dropped
 * input gets a dry weapon tick (`skippedInputWeaponTick`) before the next step, so the swap, the
 * cooldown and the ammo follow exactly what the client's fire clock predicted for that seq. A consumable moves to the first later
 * input that doesn't have it yet (two presses on consecutive seqs stay two presses). Callers keep
 * at least one input queued after the drop.
 */
const dropOldest = (s: PlayerSlot): void => {
  const dropped = s.ring[s.head] as MutableInput;
  s.head = (s.head + 1) % INPUT_QUEUE_MAX;
  s.count--;
  let swap = false;
  if (s.weaponDebt > 0 && s.skippedCount < SKIPPED_MAX) {
    s.weaponDebt--;
    copyInput(s.skipped[s.skippedCount++] as MutableInput, dropped);
  } else {
    swap = dropped.swap; // no weapon tick for it: the swap moves on, like the consumable
  }
  let consumable = dropped.consumable;
  for (let i = 0; i < s.count && (consumable || swap); i++) {
    const next = s.ring[(s.head + i) % INPUT_QUEUE_MAX] as MutableInput;
    if (consumable && !next.consumable) {
      next.consumable = true;
      consumable = false;
    }
    if (swap && !next.swap) {
      next.swap = true;
      swap = false;
    }
  }
};

/** Story 3.7: a dev HP share from text ("0.5"), in (0, 1], or null when absent or invalid (full HP). */
export function parseDevHpFraction(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || !/^\d+(\.\d+)?$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n > 0 && n <= 1 ? n : null;
}

export interface RunControllerOptions {
  balance: Balance;
  seed: number;
  /** In join order; each gets `teamSpawnPoint(slot)`. */
  players: readonly { playerId: string; slot: number }[];
  /** Dev (`DEV_NO_WAVES=1`): waves don't advance (the Story 1.7 cheat flag). */
  pauseWaves?: boolean;
  /** Dev (`DEV_WAVE_MIX=walker,crawler`, Story 3.9; 3.10 keeps it as an override of `waves.json › mix`): wave zombies cycle through these types. */
  waveMix?: readonly ZombieTypeId[] | null;
  /** Tests only: replace systems by name (Epic 1 lesson: isolate mechanics). */
  systems?: Partial<Systems>;
  /** Story 2.10: a fixed test scenario (the room passes it only with `ALLOW_TEST_SCENARIOS=1`). */
  scenario?: TestScenario | null;
  /**
   * Dev (`DEV_PLACED_BUILDING_HP=0.5`, Story 3.7): every newly placed building starts at this share
   * of its HP, so repairs can be checked before Story 3.5's zombies damage buildings. null = full HP.
   */
  devPlacedHpFraction?: number | null;
  /**
   * Story 2.12: lag compensation (default on): the World records zombie history and each player's
   * shots are tested at their input's view tick, at most REWIND_CAP_TICKS back. Off (`DEV_NO_REWIND=1`,
   * harness control): Story 2.7's shot advance only.
   */
  lagCompensation?: boolean;
}

/**
 * One run on the server, without Colyseus (Story 2.4): owns the World, the per-player input
 * queues and this tick's events. The room is its only caller; Story 2.10 bots and headless replay
 * reuse it. The run's phases (Story 3.1) are the shared run state machine's (`world.run.phase`): a new
 * controller starts in the first build phase (Lobby → Build).
 *
 * Input rule: each tick a player with queued input applies the oldest one (`ackSeq` = its seq);
 * a starved player holds still with the same seq, keeping aim and fire. So the server's movement
 * for acked inputs equals the client's prediction exactly (Story 2.6).
 *
 * Backlog drain: after a stall the client's burst sits in the queue as permanent lag, since the
 * client sends one input per tick and the server applies one. When a player's queue starts more
 * than INPUT_QUEUE_TARGET deep for INPUT_DRAIN_AFTER_TICKS ticks in a row, the oldest input is
 * skipped every INPUT_DRAIN_EVERY_TICKS ticks until it is back at the target. A skipped input's
 * movement is never applied (`ackSeq` jumps past it; Story 2.6 reconciles from the server state);
 * its swap/consumable flags are carried into the next input. `drops().drained` counts skips.
 */
export class RunController {
  readonly world: World;
  private readonly slots = new Map<string, PlayerSlot>();
  /** The same slots in join order, for iteration without an iterator per tick. */
  private readonly order: PlayerSlot[] = [];
  private readonly events: SimEvent[] = [];
  private readonly devPlacedHpFraction: number | null;

  constructor(opts: RunControllerOptions) {
    this.devPlacedHpFraction = opts.devPlacedHpFraction ?? null;
    this.world = createWorld({ balance: opts.balance, seed: opts.seed, ...(opts.systems ? { systems: opts.systems } : {}) });
    this.world.waves.paused = opts.pauseWaves === true;
    this.world.debug.waveMix = opts.waveMix ?? null;
    if (opts.scenario) applyTestScenario(this.world, opts.scenario);
    const lagComp = opts.lagCompensation !== false;
    setZombieHistoryEnabled(this.world, lagComp);
    const at = { x: 0, y: 0 };
    for (const { playerId, slot } of opts.players) {
      teamSpawnPoint(this.world, slot, at);
      addPlayer(this.world, playerId, at.x, at.y).rewindMaxTicks = lagComp ? REWIND_CAP_TICKS : 0;
      const s = new PlayerSlot(playerId);
      this.slots.set(playerId, s);
      this.order.push(s);
    }
    this.world.events.subscribe((e) => this.events.push(e));
    startBuild(this.world); // Story 3.1: Lobby → Build; `build.started` goes out with the first tick
  }

  /** Story 3.1: a player's build-phase Ready (ignored outside a build or for an unknown player). */
  setBuildReady(playerId: string, ready: boolean): void {
    setBuildReady(this.world, playerId, ready);
  }

  /**
   * Story 3.4: `building.place`, between ticks (the building blocks from the next tick on, and its
   * `building.placed` goes out with that tick's events). Every rule is the shared `placeBuilding`'s.
   */
  placeBuilding(playerId: string, req: PlaceRequest): Result<Building, PlaceError> {
    const r = placeBuilding(this.world, playerId, req);
    const f = this.devPlacedHpFraction;
    if (r.ok && f !== null) r.value.hp = Math.max(1, Math.floor(r.value.maxHp * f)); // Story 3.7 dev switch
    return r;
  }

  /**
   * Story 3.7: `building.repair`, between ticks (full HP from the next patch on; `building.repaired`
   * goes out with the next tick's events). Every rule is the shared `repairBuilding`'s.
   */
  repairBuilding(playerId: string, buildingId: number): Result<Repaired, RepairError> {
    return repairBuilding(this.world, playerId, buildingId);
  }

  /**
   * Story 3.3: buys a weapon of the fixed shop for a player (the shared rules: build phase, price,
   * wallet, slot). Applied at once, between ticks, like Ready; the next `syncState` sends the
   * wallet and weapons. On an error nothing changed.
   */
  buyWeapon(playerId: string, weapon: string, slot: 0 | 1 | null): Result<Bought, ShopError> {
    return buyWeapon(this.world, playerId, weapon, slot);
  }

  /** Queues one input (already validated). Old or duplicate seqs are ignored; a full ring drops its oldest. */
  queueInput(playerId: string, input: PlayerInput): void {
    const s = this.slots.get(playerId);
    if (!s) return;
    if (input.seq <= s.lastQueuedSeq) {
      s.staleDrops++;
      return;
    }
    const full = s.count === INPUT_QUEUE_MAX;
    if (full) {
      dropOldest(s);
      s.overflowDrops++;
    }
    copyInput(s.ring[(s.head + s.count) % INPUT_QUEUE_MAX] as MutableInput, input);
    s.count++;
    s.lastQueuedSeq = input.seq;
  }

  /**
   * Stores the player's round-trip time and turns it into the shot advance (Story 2.7): half the
   * RTT, capped at SHOT_ADVANCE_CAP_MS. Melee has no advance (resolved at once on server positions).
   */
  setRtt(playerId: string, rttMs: number): void {
    const s = this.slots.get(playerId);
    if (s) s.rttMs = rttMs;
    const p = this.world.players.get(playerId);
    if (p) p.shotAdvanceS = Math.min(Math.max(0, rttMs) / 2, SHOT_ADVANCE_CAP_MS) / 1000;
  }

  rttMs(playerId: string): number {
    return this.slots.get(playerId)?.rttMs ?? 0;
  }

  /** Seq of the last input applied for this player (0 before the first). */
  ackSeq(playerId: string): number {
    return this.slots.get(playerId)?.ackSeq ?? 0;
  }

  /** Inputs waiting in this player's queue. */
  queued(playerId: string): number {
    return this.slots.get(playerId)?.count ?? 0;
  }

  /** Dropped inputs so far: `overflow` (ring full), `stale` (seq not newer), `drained` (backlog skips). */
  drops(playerId: string): { overflow: number; stale: number; drained: number } {
    const s = this.slots.get(playerId);
    return { overflow: s?.overflowDrops ?? 0, stale: s?.staleDrops ?? 0, drained: s?.drainSkips ?? 0 };
  }

  /** Zombies this player killed this run (Story 2.8): counted from `zombie.killed` by `killerId`. */
  kills(playerId: string): number {
    return this.slots.get(playerId)?.kills ?? 0;
  }

  /** Removes a player who left mid-run; zombies pick the next-nearest player on the next tick. */
  removePlayer(playerId: string): void {
    const s = this.slots.get(playerId);
    if (s) this.order.splice(this.order.indexOf(s), 1);
    this.slots.delete(playerId);
    removePlayer(this.world, playerId);
  }

  /** One fixed step. Returns this tick's events (a reused array, valid until the next tick). */
  tick(): readonly SimEvent[] {
    this.events.length = 0;
    for (let i = 0; i < this.order.length; i++) {
      const s = this.order[i] as PlayerSlot;
      const cur = s.current;
      if (s.count > INPUT_QUEUE_TARGET) {
        s.overTargetTicks++;
        if (s.overTargetTicks >= INPUT_DRAIN_AFTER_TICKS) {
          dropOldest(s);
          s.drainSkips++;
          s.overTargetTicks = INPUT_DRAIN_AFTER_TICKS - INPUT_DRAIN_EVERY_TICKS;
        }
      } else {
        s.overTargetTicks = 0;
      }
      // Skipped inputs (overflow, drain): their weapon tick, a dry one (Story 2.7 review).
      const sp = s.skippedCount > 0 ? this.world.players.get(s.playerId) : undefined;
      for (let k = 0; k < s.skippedCount; k++) {
        skippedInputWeaponTick(this.world, s.playerId, s.skipped[k] as MutableInput);
        if (sp) tickSlow(sp); // the skipped seq's slow tick, as the client predicted it (3.9 review)
      }
      s.skippedCount = 0;
      const p = this.world.players.get(s.playerId);
      if (p) p.weaponsPaused = s.count === 0; // starved: the weapon waits for the next seq too
      if (s.count === 0 && s.ackSeq > 0 && s.weaponDebt < SKIPPED_MAX) s.weaponDebt++;
      if (s.count > 0) {
        copyInput(cur, s.ring[s.head] as MutableInput);
        s.head = (s.head + 1) % INPUT_QUEUE_MAX;
        s.count--;
        s.ackSeq = cur.seq;
      } else {
        // Starved: hold still, keep aim and fire, same seq (edge flags already spent on it). The
        // weapon is paused above: it never fires a shot the client's fire clock didn't predict.
        cur.moveX = 0;
        cur.moveY = 0;
        cur.swap = false;
        cur.consumable = false;
      }
      setInput(this.world, s.playerId, cur);
    }
    step(this.world, TICK_DT_S);
    const events = this.events;
    for (let i = 0; i < events.length; i++) {
      const e = events[i] as SimEvent;
      // Story 3.6: a turret's kill pays its owner but is not their kill.
      if (e.type !== "zombie.killed" || e.killerId === null || e.buildingId !== undefined) continue;
      const killer = this.slots.get(e.killerId);
      if (killer) killer.kills++;
    }
    return events;
  }
}
