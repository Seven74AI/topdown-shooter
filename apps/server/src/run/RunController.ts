import {
  INPUT_QUEUE_TARGET,
  NEUTRAL_INPUT,
  REWIND_MAX_TICKS,
  activeSlot,
  isGun,
  weaponStats,
  TICK_DT_S,
  addPlayer,
  applyTestScenario,
  applyStartWave,
  placeBuilding,
  repairBuilding,
  upgradeBuilding,
  buyCard,
  offerFor,
  reroll,
  sellBuilding,
  moveBuilding,
  upgradeWeapon,
  buyItem,
  type BoughtItem,
  createWorld,
  DOWNTOWN_MAP,
  removePlayer,
  holdPlayer,
  returnPlayer,
  releaseHeldPlayer,
  restoreSeat,
  setBuildReady,
  castVote,
  type EvacChoice,
  setZombieHistoryEnabled,
  viewTickOfInput,
  setInput,
  skippedInputWeaponTick,
  startBuild,
  tickSlow,
  step,
  teamSpawnPoint,
  type Balance,
  type Building,
  type DistrictMap,
  type PlaceError,
  type PlaceRequest,
  type PlayerState,
  type RepairError,
  type Repaired,
  type UpgradeError,
  type Upgraded,
  type CardBought,
  type Rerolled,
  type ShopOfferView,
  type SellError,
  type MoveError,
  type MoveRequest,
  type Sold,
  type PlayerInput,
  type Result,
  type ShopError,
  type WeaponUpgradeError,
  type WeaponUpgraded,
  type SimEvent,
  type Systems,
  type TestScenario,
  type World,
  type ZombieTypeId,
  setForcedBlackout,
} from "@topdown/shared";
import { INPUT_SEQ_RESYNC_AFTER, QUIET_HOLD_TICKS, REWIND_CAP_MS, SHOT_ADVANCE_CAP_MS, STALE_INPUT_TICKS } from "../net/limits";
import { SpreadCancelWatch, type SpreadCancelSuspect } from "../net/spreadCancel";

/** Story 2.12: the rewind cap in ticks (REWIND_CAP_MS, never more than the shared history holds). */
export const REWIND_CAP_TICKS = Math.min(REWIND_MAX_TICKS, Math.floor(REWIND_CAP_MS / (TICK_DT_S * 1000)));

/** Inputs kept per player: 6 steps = 300 ms of jitter (Story 2.4 › Input queue). */
export const INPUT_QUEUE_MAX = 6;
/** Backlog the queue should settle at: 2 inputs = 100 ms of jitter cover (Story 2.4 review; shared since Story 8.9). */
export { INPUT_QUEUE_TARGET };
/**
 * Ticks in a row above the target before the server starts skipping (40 = 2 s). Long on purpose:
 * after a 4G spike the burst refills the queue, and draining it too soon removes the cover for
 * the next spike (starve → drain → starve; review sim: 0.5 s added ~35 % more starved ticks).
 */
export const INPUT_DRAIN_AFTER_TICKS = 40;
/** While draining, skip one input every this many ticks (2 → a 6-input backlog is gone ~2.4 s after the stall). */
export const INPUT_DRAIN_EVERY_TICKS = 2;

type MutableInput = { -readonly [K in keyof PlayerInput]: PlayerInput[K] };

/** A wire aim component, or 0 when not a finite number in [-1, 1]. */
const validAim = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= -1 && v <= 1 ? v : 0);

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
  constructor(readonly playerId: string) {
    this.spreadWatch = new SpreadCancelWatch(playerId);
  }
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
  /** Story 2.12 review M1 / re-review M-A: inputs refused because their seq was not the next one. */
  jumpDrops = 0;
  /** Refused jumps in a row (a resync after INPUT_SEQ_RESYNC_AFTER). */
  jumpStreak = 0;
  /** Resyncs to a jumped-ahead seq (re-review M-A; telemetry `seq_gap_suspect`). */
  resyncs = 0;
  /** Wave of the last `seq_gap_suspect` report (at most one per wave). */
  resyncReportedWave = -1;
  /** Re-review M-B: in-order inputs the message rate bucket dropped (their seq counts as received). */
  rateDrops = 0;
  /** Edge flags of rate-dropped inputs, carried onto the next input queued (never lost). */
  carrySwap = false;
  carryConsumable = false;
  /** Re-review M: a rate-dropped consumable's throw aim, carried with the flag. */
  carryAimX = 0;
  carryAimY = 0;
  carryFire = false;
  /** A new input was applied this tick (the spread watch reads it after the step). */
  appliedThisTick = false;
  /** Story 2.12 review M1: spread-cancel telemetry. */
  readonly spreadWatch: SpreadCancelWatch;
  /** Inputs skipped to drain a lasting backlog (their edge flags carried forward). */
  drainSkips = 0;
  /** Ticks in a row that started with more than INPUT_QUEUE_TARGET inputs queued. */
  overTargetTicks = 0;
  /** Story 8.9: inputs queued when the last tick started (the depth the drain rule reads). */
  depthAtTick = 0;
  /** Zombies this player killed this run (Story 2.8 Results). */
  kills = 0;
  /** Story 8.1 (F7): inputs dropped because they were made while the line was down (`isStaleInput`). */
  offlineDrops = 0;
  /** Story 8.1 (D1): ticks in a row with no input queued or applied (a quiet phone); reset by every queued input. */
  quietTicks = 0;
  /** Story 8.1: on hold (dropped or quiet): out of `order`, its inputs ignored until `returnPlayer`. */
  held = false;
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

/** Story 8.1: an empty queue that accepts any next seq (a hold or a return). Kills and telemetry stay. */
const resetQueue = (s: PlayerSlot): void => {
  s.head = 0;
  s.count = 0;
  s.lastQueuedSeq = 0;
  s.ackSeq = 0;
  s.jumpStreak = 0;
  s.overTargetTicks = 0;
  s.skippedCount = 0;
  s.weaponDebt = 0;
  s.carrySwap = s.carryConsumable = s.carryFire = false;
  s.quietTicks = 0;
  s.depthAtTick = 0; // Story 8.9's synced backlog: none after a hold / return (the phone runs at 1×)
  s.spreadWatch.reset();
};

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
      // Re-review M: the flagged input's aim (a throw: the throw range's encoding) and fire (off for a
      // throwable, kept for a medkit) move with the flag. That seq's own aim/shot is lost (the prediction reconciles).
      next.consumable = true;
      next.aimX = dropped.aimX;
      next.aimY = dropped.aimY;
      next.fire = dropped.fire;
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
  /** Story 4.5 dev (`DEV_DECAY_STAGES=2,3`): the decay stage per wave instead of `decay.json`. null = the real table. */
  decayStageByWave?: readonly number[] | null;
  /** Story 5.13 dev (`DEV_SHOP_CARDS=flamethrower,revive_kit`): every build-start offer starts with these items. null = the real draw. */
  shopCards?: readonly string[] | null;
  /** Story 6.3 dev (`DEV_FORCE_BLACKOUT=5`): every phase at this blackout level. null = the real rule. */
  forceBlackoutPct?: number | null;
  /** Story 6.5 dev (`DEV_BOSS_WAVES=3`): the Behemoth's waves instead of `boss.json`. null = the real list. */
  bossWaves?: readonly number[] | null;
  /** Story 6.8 dev (`DEV_EVENTS=car_alarm@3,stampede@4`): the run's event schedule instead of the draw. null = the real draw. */
  events?: readonly { readonly kind: string; readonly wave: number }[] | null;
  /** Story 4.1: the district (default `DOWNTOWN_MAP`, the game's map; tests may pass the open `PLACEHOLDER_MAP`). */
  map?: DistrictMap;
  /** Story 2.10: a fixed test scenario (the room passes it only with `ALLOW_TEST_SCENARIOS=1`). */
  scenario?: TestScenario | null;
  /** Story 6.1 dev (`DEV_START_WAVE=7`): the first build phase leads into this wave (and applies its decay stage). null = wave 1. */
  startWave?: number | null;
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
  /**
   * Story 2.12 review M1: called (rarely: at most once per wave per player) when a player's aim looks
   * like it cancels the predictable spread. Telemetry only (the room logs `spread_cancel_suspect`).
   */
  onSpreadCancelSuspect?: (s: SpreadCancelSuspect) => void;
  /**
   * Story 8.1 (D1): called (between steps, at the start of `tick()`) when a connected player went
   * quiet for QUIET_HOLD_TICKS in a wave and was put on hold. The room logs it and sets the hold fields.
   */
  onQuietHold?: (playerId: string) => void;
  /**
   * Story 2.12 re-review M-A: called (at most once per wave per player) when a player's input seqs
   * had to be resynced (a run of non-consecutive seqs). Telemetry only (`seq_gap_suspect`).
   */
  onSeqResync?: (playerId: string, wave: number, resyncs: number) => void;
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
  private readonly onSpreadCancelSuspect: ((s: SpreadCancelSuspect) => void) | null;
  private readonly onSeqResync: ((playerId: string, wave: number, resyncs: number) => void) | null;
  private readonly onQuietHold: ((playerId: string) => void) | null;
  /** Story 8.1: slots of held players (kept so a return keeps kills and telemetry). */
  private readonly heldSlots = new Map<string, PlayerSlot>();

  constructor(opts: RunControllerOptions) {
    this.onQuietHold = opts.onQuietHold ?? null;
    this.devPlacedHpFraction = opts.devPlacedHpFraction ?? null;
    this.onSpreadCancelSuspect = opts.onSpreadCancelSuspect ?? null;
    this.onSeqResync = opts.onSeqResync ?? null;
    this.world = createWorld({ balance: opts.balance, seed: opts.seed, map: opts.map ?? DOWNTOWN_MAP, ...(opts.systems ? { systems: opts.systems } : {}) });
    this.world.waves.paused = opts.pauseWaves === true;
    this.world.debug.waveMix = opts.waveMix ?? null;
    this.world.debug.decayStageByWave = opts.decayStageByWave ?? null; // before the first build start
    this.world.debug.shopCards = opts.shopCards ?? null; // Story 5.13: before the first offers are drawn
    this.world.debug.bossWaves = opts.bossWaves ?? null; // Story 6.5
    this.world.debug.events = opts.events ?? null; // Story 6.8: before the first build start draws the schedule
    if (opts.scenario) applyTestScenario(this.world, opts.scenario);
    if (opts.startWave) applyStartWave(this.world, opts.startWave); // Story 6.1 dev switch, before the first build start
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
    if (opts.forceBlackoutPct !== undefined && opts.forceBlackoutPct !== null) setForcedBlackout(this.world, opts.forceBlackoutPct); // Story 6.3 dev
  }

  /** Story 6.11: an evacuation vote (the World ignores it outside phase "vote"). */
  castVote(playerId: string, choice: EvacChoice): void {
    castVote(this.world, playerId, choice);
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

  /** Story 5.9: `building.upgrade`, between ticks (the shared `upgradeBuilding`'s rules). */
  upgradeBuilding(playerId: string, buildingId: number): Result<Upgraded, UpgradeError> {
    return upgradeBuilding(this.world, playerId, buildingId);
  }

  /** Story 5.22: `building.move`, between ticks (the shared `moveBuilding`'s rules: owner, build phase, the new spot with itself ignored; free). */
  moveBuilding(playerId: string, req: MoveRequest): Result<Building, MoveError> {
    return moveBuilding(this.world, playerId, req);
  }

  /** Story 5.20: `building.sell`, between ticks (the shared `sellBuilding`'s rules: take back 100 %, sell 50 %). */
  sellBuilding(playerId: string, buildingId: number): Result<Sold, SellError> {
    return sellBuilding(this.world, playerId, buildingId);
  }

  /**
   * Story 5.13: `shop.buy`, between ticks: buys card `card` of the player's offer (`build`, `rev`)
   * (the shared `buyCard` rules); the next `syncState` sends the wallet, weapons and gear. On an
   * error nothing changed.
   */
  buyCard(playerId: string, build: number, rev: number, card: number, item: string, slot: 0 | 1 | null): Result<CardBought, ShopError> {
    return buyCard(this.world, playerId, build, rev, card, item, slot);
  }

  /** Story 5.13: `shop.reroll`, between ticks (the shared `reroll` rules). */
  reroll(playerId: string, build: number, rev: number): Result<Rerolled, ShopError> {
    return reroll(this.world, playerId, build, rev);
  }

  /** Story 5.13: the player's stored offer for this build (null outside a build phase); never redraws it. */
  offerFor(playerId: string): ShopOfferView | null {
    return offerFor(this.world, playerId);
  }

  /** Story 5.1: `shop.upgrade`, between ticks (the shared `upgradeWeapon`'s rules). */
  upgradeWeapon(playerId: string, weapon: string): Result<WeaponUpgraded, WeaponUpgradeError> {
    return upgradeWeapon(this.world, playerId, weapon);
  }

  /** Story 5.11: `shop.buy_item` (gear; Story 5.12 consumables), between ticks (the shared `buyItem`). */
  buyItem(playerId: string, item: string): Result<BoughtItem, ShopError> {
    return buyItem(this.world, playerId, item);
  }

  /** Queues one input (already validated). Old or duplicate seqs are ignored; a full ring drops its oldest. */
  queueInput(playerId: string, input: PlayerInput): void {
    const s = this.slots.get(playerId);
    if (!s || s.held) return; // Story 8.1 (F7): nothing a held player sent is applied
    if (input.seq <= s.lastQueuedSeq) {
      s.staleDrops++;
      return;
    }
    // Story 2.12 re-review M-A: seqs can't be picked (the spread roll is the seq's). An honest client
    // sends every seq in order (reliable WebSocket, +1 per step, no catch-up burst; rate-bucket drops
    // are reported through `rateDroppedInput`), so only the next seq is accepted. A run of
    // INPUT_SEQ_RESYNC_AFTER refusals (a client that really restarted its seqs further on) resyncs.
    if (s.lastQueuedSeq > 0 && input.seq !== s.lastQueuedSeq + 1) {
      if (s.jumpStreak < INPUT_SEQ_RESYNC_AFTER) {
        s.jumpDrops++;
        s.jumpStreak++;
        return;
      }
      s.resyncs++;
      s.spreadWatch.reset(); // the previous sample is no neighbour of this seq
      const wave = this.world.waves.number;
      if (s.resyncReportedWave !== wave) {
        s.resyncReportedWave = wave;
        this.onSeqResync?.(playerId, wave, s.resyncs);
      }
    }
    s.jumpStreak = 0;
    if (this.isStaleInput(input)) {
      // Story 8.1 (F7): made while the line was down, delivered late: the seq counts, nothing applies.
      s.lastQueuedSeq = input.seq;
      s.offlineDrops++;
      return;
    }
    s.quietTicks = 0;
    const full = s.count === INPUT_QUEUE_MAX;
    if (full) {
      dropOldest(s);
      s.overflowDrops++;
    }
    const slot = s.ring[(s.head + s.count) % INPUT_QUEUE_MAX] as MutableInput;
    copyInput(slot, input);
    // Re-review M-B: edges of rate-dropped inputs land on this one.
    if (s.carrySwap) slot.swap = true;
    if (s.carryConsumable) {
      slot.consumable = true;
      slot.aimX = s.carryAimX;
      slot.aimY = s.carryAimY;
      slot.fire = s.carryFire;
    }
    s.carrySwap = s.carryConsumable = false;
    s.count++;
    s.lastQueuedSeq = input.seq;
  }

  /**
   * Story 2.12 re-review M-B: an `input.send` the message rate bucket dropped (an honest burst after a
   * stall can exceed MAX_INPUTS_PER_S), unvalidated. Only its seq and edge flags are read (no full
   * validation: the bucket exists to spare that work). If it is the next seq, the seq counts as
   * received (no gap, so the following inputs are not refused) and its swap/consumable move to the
   * next input queued; like an overflow drop, its movement and shot are not applied (the prediction
   * reconciles). Anything else is ignored.
   */
  rateDroppedInput(playerId: string, message: unknown): void {
    const s = this.slots.get(playerId);
    if (!s || s.held || typeof message !== "object" || message === null) return;
    const m = message as { seq?: unknown; swap?: unknown; consumable?: unknown; aimX?: unknown; aimY?: unknown; fire?: unknown };
    if (typeof m.seq !== "number" || m.seq !== s.lastQueuedSeq + 1) return;
    s.lastQueuedSeq = m.seq;
    s.rateDrops++;
    if (m.swap === true) s.carrySwap = true;
    if (m.consumable === true) {
      s.carryConsumable = true;
      // Its throw aim, if valid (the schema's [-1, 1]); else none (the throw falls back: memory, zombie, facing).
      s.carryAimX = validAim(m.aimX);
      s.carryAimY = validAim(m.aimY);
      s.carryFire = m.fire === true;
    }
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

  /**
   * Story 8.9: inputs that were queued when the last tick started (before it took one): the depth
   * the drain rule compares with INPUT_QUEUE_TARGET. Synced as `PlayerState.inputQueued`.
   */
  queuedAtTick(playerId: string): number {
    return this.slots.get(playerId)?.depthAtTick ?? 0;
  }

  /** Dropped inputs so far: `overflow` (ring full), `stale` (seq not newer), `drained` (backlog skips). */
  drops(playerId: string): { overflow: number; stale: number; drained: number; jumped: number; resyncs: number; rate: number; offline: number } {
    const s = this.slots.get(playerId);
    return {
      offline: s?.offlineDrops ?? 0,
      overflow: s?.overflowDrops ?? 0,
      stale: s?.staleDrops ?? 0,
      drained: s?.drainSkips ?? 0,
      jumped: s?.jumpDrops ?? 0,
      resyncs: s?.resyncs ?? 0,
      rate: s?.rateDrops ?? 0,
    };
  }

  /** Zombies this player killed this run (Story 2.8): counted from `zombie.killed` by `killerId`. */
  kills(playerId: string): number {
    return this.slots.get(playerId)?.kills ?? 0;
  }

  /** Removes a player who left mid-run; zombies pick the next-nearest player on the next tick. */
  removePlayer(playerId: string): void {
    const s = this.slots.get(playerId);
    if (s && this.order.includes(s)) this.order.splice(this.order.indexOf(s), 1);
    this.slots.delete(playerId);
    this.heldSlots.delete(playerId);
    removePlayer(this.world, playerId);
  }

  /**
   * Story 8.1 (AC 1, 2): puts a player on hold between ticks (`holdPlayer`: out of the World, downed
   * → out, inputs dropped). Its input queue is emptied (F7) and it leaves the tick order. False if
   * unknown or already held.
   */
  holdPlayer(playerId: string): boolean {
    const s = this.slots.get(playerId);
    if (!s || s.held || !holdPlayer(this.world, playerId)) return false;
    s.held = true;
    this.order.splice(this.order.indexOf(s), 1);
    this.heldSlots.set(playerId, s);
    resetQueue(s);
    return true;
  }

  /** Story 8.1 (F7): the input's view is more than STALE_INPUT_TICKS behind the server (made while the line was down). */
  isStaleInput(input: PlayerInput): boolean {
    const view = viewTickOfInput(input);
    return view >= 0 && this.world.tick - view > STALE_INPUT_TICKS;
  }

  /** Story 8.1 (D5): a takeover by a new tab: its seqs start afresh (no seq_gap_suspect), nothing else changes. */
  resetInputs(playerId: string): void {
    const s = this.slots.get(playerId);
    if (s) resetQueue(s);
  }

  /** Story 8.1: the player is on hold. */
  isHeld(playerId: string): boolean {
    return this.slots.get(playerId)?.held === true;
  }

  /** Story 8.1: players present in the World (not held): 0 = nobody to play, the room freezes. */
  activeCount(): number {
    return this.order.length;
  }

  /**
   * Story 8.1 (AC 3): a held player comes back between ticks (`returnPlayer`: F2 as held, F4
   * placement and protection). The input queue restarts empty and accepts the client's next seq
   * whatever it is (a reconnected phone keeps counting, a reloaded one starts at 1: no
   * `seq_gap_suspect` for a legit return). False if not held.
   */
  returnPlayer(playerId: string): boolean {
    const s = this.slots.get(playerId);
    if (!s || !s.held || !returnPlayer(this.world, playerId)) return false;
    s.held = false;
    resetQueue(s);
    this.heldSlots.delete(playerId);
    this.insertInOrder(s);
    return true;
  }

  /**
   * Story 8.1 (F8): the hold ran out: the held state leaves the World and the controller and goes to
   * the room's remembered seats (with the kills). Null if not held.
   */
  releaseHeld(playerId: string): { player: PlayerState; kills: number; buildIdx: number } | null {
    const s = this.slots.get(playerId);
    if (!s || !s.held) return null;
    const held = releaseHeldPlayer(this.world, playerId);
    this.slots.delete(playerId);
    this.heldSlots.delete(playerId);
    return held ? { player: held.player, kills: s.kills, buildIdx: held.buildIdx } : null;
  }

  /**
   * Story 8.1 (F8): a remembered seat rejoins (build phase): back in the World as it was. Review H2:
   * with the build-start index it was held at, so a Leave + rejoin in the same build heals nothing.
   */
  restoreSeat(player: PlayerState, kills: number, buildIdx: number): boolean {
    if (this.slots.has(player.id) || !restoreSeat(this.world, player, buildIdx)) return false;
    const s = new PlayerSlot(player.id);
    s.kills = kills;
    this.slots.set(player.id, s);
    this.insertInOrder(s);
    return true;
  }

  /** Back into the tick order by player id (`p0` < `p1` …), so the order never depends on who dropped first. */
  private insertInOrder(s: PlayerSlot): void {
    let i = 0;
    while (i < this.order.length && (this.order[i] as PlayerSlot).playerId < s.playerId) i++;
    this.order.splice(i, 0, s);
  }

  /**
   * Story 8.1 (D1): a connected player with no input for QUIET_HOLD_TICKS in a wave (hidden tab, app
   * switch, a dead spot) goes on hold. Build and vote phases: nothing can hurt them, they just stand.
   */
  private holdQuietPlayers(): void {
    if (this.onQuietHold === null || this.world.run.phase !== "wave") return;
    for (let i = this.order.length - 1; i >= 0; i--) {
      const s = this.order[i] as PlayerSlot;
      if (s.quietTicks < QUIET_HOLD_TICKS) continue;
      if (this.holdPlayer(s.playerId)) this.onQuietHold(s.playerId);
    }
  }

  /** Story 2.12 review M1: feeds the newly applied input to the player's spread-cancel watch. */
  private watchSpread(s: PlayerSlot, p: PlayerState): void {
    const cur = s.current;
    const stats = weaponStats(this.world.balance, activeSlot(p.loadout).weapon);
    // Story 5.3: a pellet gun's stratified fan has no single roll to cancel (F1): nothing to watch.
    const spread = isGun(stats) && stats.pellets === 1 ? stats.spreadDeg : 0;
    const flagged = s.spreadWatch.observe(cur.seq, cur.aimX, cur.aimY, cur.fire, spread, this.world.waves.number);
    if (flagged) this.onSpreadCancelSuspect?.(flagged);
  }

  /** One fixed step. Returns this tick's events (a reused array, valid until the next tick). */
  tick(): readonly SimEvent[] {
    this.events.length = 0;
    this.holdQuietPlayers(); // Story 8.1 (D1), between steps: the hold is at this tick
    const wave = this.world.run.phase === "wave";
    for (let i = 0; i < this.order.length; i++) {
      const s = this.order[i] as PlayerSlot;
      const cur = s.current;
      s.depthAtTick = s.count;
      // Story 8.1 (D1): nothing queued for this wave tick (build and vote phases don't count: nothing hurts a
      // standing player there, and a tab hidden across a build start is held 3 s into the wave).
      if (s.count === 0 && wave) s.quietTicks++;
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
        if (sp) {
          tickSlow(sp); // the skipped seq's slow tick, as the client predicted it (3.9 review)
          if (sp.knockTicks > 0) sp.knockTicks--; // Story 5.7 review L2: its knock tick too (the prediction counted it; the slide itself is lost with the seq)
        }
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
        s.appliedThisTick = true;
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
    // Story 2.12 review M1 (re-review L): the spread watch reads the weapon after this tick's swap.
    for (let i = 0; i < this.order.length; i++) {
      const s = this.order[i] as PlayerSlot;
      if (!s.appliedThisTick) continue;
      s.appliedThisTick = false;
      const p = this.world.players.get(s.playerId);
      if (p && p.rewindMaxTicks > 0) this.watchSpread(s, p);
    }
    const events = this.events;
    for (let i = 0; i < events.length; i++) {
      const e = events[i] as SimEvent;
      // Story 6.7 (D5): who finished the Behemoth gets +1 kill on Results.
      if (e.type === "boss.killed" && e.killerId !== null) {
        const k = this.slots.get(e.killerId);
        if (k) k.kills++;
        continue;
      }
      // Story 3.6: a turret's kill pays its owner but is not their kill.
      if (e.type !== "zombie.killed" || e.killerId === null || e.buildingId !== undefined) continue;
      const killer = this.slots.get(e.killerId);
      if (killer) killer.kills++;
    }
    return events;
  }
}
