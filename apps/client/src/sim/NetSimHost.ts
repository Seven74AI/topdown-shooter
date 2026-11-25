import { mirrorSpecialEvent } from "../net/mirrorEvent";
import { FlameCues } from "../render/flameCues";
import {
  C2S,
  NET_EVENT_KIND,
  NEUTRAL_INPUT,
  MUZZLE_OFFSET_M,
  createLobTarget,
  lobFlightTicks,
  lobTarget,
  NET_NONE,
  NO_SYSTEMS,
  TICK_DT_S,
  acidSpitOf,
  consumableAt,
  addPlayer,
  assistAim,
  buildingById,
  buildingCentreX,
  buildingCentreY,
  turretStats,
  weaponIds,
  createSlot,
  createWorld,
  DOWNTOWN_MAP,
  decodeNetEvent,
  findReviver,
  headingToRad,
  playerSlotOf,
  removePlayer,
  rotateBySeqSpread,
  ticksFor,
  type Balance,
  type DistrictMap,
  type PlaceError,
  type PlaceRequest,
  type RepairError,
  type UpgradeError,
  type SellError,
  type MoveRequest,
  type PlayerInput,
  type PlayerState,
  type PlayerStateView,
  type RunStateView,
  type ShopOfferView,
  type SimEvent,
  type SimEventsFlushed,
  type WeaponSlot,
  type World,
  type EvacChoice,
} from "@topdown/shared";
import { viewTickOf } from "../net/viewTick";
import { MOVE_REFUSALS_MAX, type PlayerInfo, type ShopAnswer, type SimHost } from "./SimHost";
import { MAX_CATCHUP_STEPS, type SimStepStats } from "./LocalSimHost";
import type { MoveRefusal, NetSession } from "../net/session";
import type { TeammateGhosts } from "../net/teammateGhosts";
import { ServerClock } from "../net/serverClock";
import { SnapshotRing, type SampledPose } from "../net/snapshots";
import { EventQueue } from "../net/eventQueue";
import { HordeBuffer, HordeSample } from "../net/hordeBuffer";
import { HordeDecoder } from "../net/hordeDecoder";
import { mirrorZombies } from "../net/mirrorZombies";
import { mirrorBuildings } from "../net/mirrorBuildings";
import { mirrorDecay } from "../net/mirrorDecay";
import { bossDrawAt, bossRenderPos, createBossTrack, mirrorBoss, trackBoss, type BossTrack } from "../net/mirrorBoss";
import { Predictor } from "../net/prediction";
import { AdaptiveDelay } from "../net/adaptiveDelay";
import { endingOf } from "../net/onlineFlow";
import { RENDER_DELAY_MIN_MS, STALE_COSMETIC_TICKS } from "../net/netConfig";
import { LocalFireClock } from "../net/localFire";
import { CosmeticProjectiles } from "../net/cosmeticProjectiles";
import { EARLY_HIT_SLACK_MS, REVERSED_HIT_SLACK_MS, ReversedHits } from "../debug/reversedHits";

/** Starting interpolation delay in ticks (100 ms); `AdaptiveDelay` then moves it within 100–150 ms. */
export const RENDER_DELAY_TICKS = RENDER_DELAY_MIN_MS / (TICK_DT_S * 1000);

/** Netcode numbers for the perf overlay (Stories 2.6, 2.7, 2.10), updated every frame (one object, reused). */
export interface NetStats {
  rttMs: number;
  /** Interpolation delay of others (ms) and the jitter it follows. */
  delayMs: number;
  jitterMs: number;
  /** `Predictor.stats` of the local survivor. */
  corrections: number;
  snaps: number;
  maxErrorM: number;
  unackedInputs: number;
  /** Story 2.7 reversed-hit counter (`ReversedHits.counts`). */
  apparentHits: number;
  confirmed: number;
  reversed: number;
}

/** Local cosmetic events (own shots and swings) handed out per frame at most; a ring of reused objects. */
const LOCAL_EVENT_RING = 8;
/** Own weapon-state events held for the next drain (arrive between frames). */
const ARRIVAL_EVENTS_MAX = 64;

type FiredEvent = Extract<SimEvent, { type: "weapon.fired" }>;
type SwungEvent = Extract<SimEvent, { type: "melee.swung" }>;
type LaunchedEvent = Extract<SimEvent, { type: "grenade.launched" }>;

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
  to.viewTick = from.viewTick;
};

export interface NetSimHostOptions {
  balance: Balance;
  session: NetSession;
  /** Client clock in ms (tests inject one). */
  now?: () => number;
  /**
   * Story 2.7: whether the reversed-hit counter runs (dev builds, or the perf overlay on in a
   * release build). Default: always.
   */
  measureHits?: () => boolean;
  /** Story 4.1: the district (default `DOWNTOWN_MAP`, the server's; tests may pass `PLACEHOLDER_MAP`). */
  map?: DistrictMap;
  /**
   * Story 8.1 (AC 4, F7): false while the link is down (dropped, reconnecting, seat kept): no input
   * is sent or predicted then (nothing pressed offline happens late). Default: always up.
   */
  linkUp?: () => boolean;
}

/**
 * The networked host (Story 2.4). The server runs the World; this host keeps a mirror World that
 * is never stepped (all systems no-ops) and writes into it every frame from room state:
 *
 * - players added/removed as the schema's `players` map changes; position and facing from the
 *   interpolated snapshot at the render tick (`prevX = x`, so any `alpha` draws the same point);
 *   HP, status and loadout from the latest state (the HUD works unchanged);
 * - except the local survivor (Story 2.6): drawn from the `Predictor`, which applies each sent
 *   input at once and reconciles on every snapshot's `ackSeq`;
 * - the render tick is `estimate − AdaptiveDelay` (100–150 ms from jitter), one value per frame;
 * - waves from the latest state;
 * - projectiles (Story 2.7) are cosmetic only: my own shots spawn at once from the local fire
 *   clock (with the muzzle flash and sound as an immediate local `weapon.fired`), others' from the
 *   server's `weapon.fired` at the render tick. Hits, pushback and deaths come only from server
 *   events: the client never removes a zombie on its own;
 * - zombies (Story 2.5) from the horde stream: frames into a `HordeBuffer`, sampled at the same
 *   render tick as players, written into `world.zombies` by `mirrorZombies`. A `zombie.killed`
 *   hides its net id when the render tick reaches it (the death FX plays in the same frame).
 *
 * Inputs: one `input.send` per 50 ms step with seq + 1, edge flags latched until a step takes
 * them, at most 5 steps per frame (the backlog after a hidden tab is dropped, never burst).
 * Events (`drainEvents`, Story 2.7 routing): 1. my local cosmetic events (shots, swings);
 * 2. my own server weapon-state events (reload, swap) on arrival, so my reload sound isn't late;
 * 3. every other server event once the render tick reaches its tick. My own server
 * `weapon.fired` / `melee.swung` are dropped: the local ones already played.
 */
/** Story 5.18: refusals waiting for their next patch (≥ the placements one client has in flight: 6). */
const REFUSAL_RING = 8;

export class NetSimHost implements SimHost {
  readonly world: World;
  readonly localPlayerId: string;
  readonly online = true;
  /** Story 5.4: the cones (my predicted one, the others' from events + the patch fallback). */
  readonly flames = new FlameCues();
  private readonly patchFlame = (s: PlayerStateView, id: string): void => {
    const ammo = s.active === 1 ? s.ammo1 : s.ammo0;
    this.flames.patch(id, ammo, s.status === "alive");
  };
  /** Positions are written already interpolated: alpha never matters. */
  readonly alpha = 0;
  readonly stats: SimStepStats = { lastUpdateSteps: 0, stepMs: new Float64Array(MAX_CATCHUP_STEPS), totalSteps: 0 };
  /** The local survivor's prediction (Story 2.6); it keeps the sent inputs for replay. */
  readonly predictor: Predictor;
  /** Story 6.5: the boss's last two server positions (`bossRenderPos` draws it at the render tick). */
  readonly bossTrack: BossTrack = createBossTrack();
  readonly netStats: NetStats = {
    rttMs: 0,
    delayMs: 0,
    jitterMs: 0,
    corrections: 0,
    snaps: 0,
    maxErrorM: 0,
    unackedInputs: 0,
    apparentHits: 0,
    confirmed: 0,
    reversed: 0,
  };
  /** Story 2.7: the local fire clock, the cosmetic projectiles and the reversed-hit counter. */
  readonly fireClock: LocalFireClock;
  readonly cosmetics: CosmeticProjectiles;
  readonly hits = new ReversedHits();
  private readonly measureHits: () => boolean;
  /** Whether the counter ran last frame: turning it on again starts from a clean slate. */
  private measuring = false;
  /** My own server `weapon.fired` seen, and how many of them were drawn as unpredicted. */
  private serverOwnShots = 0;
  private unpredictedShots = 0;
  /**
   * Predicted shots the server never fired (dry shots on skipped seqs, shots refused while downed),
   * counted once their seqs are acked, so they don't blind the safety net for good (re-review LOW-A).
   */
  private forgivenShots = 0;
  private readonly localSlot: number;
  private readonly aimDir = { x: 1, y: 0 };
  /** Story 6.4 (F4): the aim-assist fog filter's shooter (my predicted position, my gear). */
  private readonly aimShooter = { x: 0, y: 0, gear: 0 };
  private readonly localFired: FiredEvent[] = [];
  private readonly localSwung: SwungEvent[] = [];
  /** Story 5.5: my instant launches (id 0: the server's echo replaces them in the view). */
  private readonly localLaunched: LaunchedEvent[] = [];
  private readonly lobOut = createLobTarget();
  private localNext = 0;
  private readonly immediate: SimEvent[] = [];
  private readonly arrival: SimEvent[] = [];
  private readonly delay = new AdaptiveDelay();

  private readonly session: NetSession;
  private readonly now: () => number;
  private readonly clock = new ServerClock();
  private readonly snapshots = new SnapshotRing();
  private readonly queue = new EventQueue();
  /** Story 5.5: `tick` is set to each flush's tick before decoding (grenade landing ticks). */
  private readonly ctx: { balance: Balance; tick: number };
  private readonly offs: (() => void)[] = [];
  private readonly onState = (state: RunStateView): void => this.receiveState(state);
  /** Horde stream (Story 2.5); `hordeStats` counts frames and decode errors for the 2.10 overlay. */
  private readonly horde = new HordeBuffer();
  readonly hordeStats = new HordeDecoder(this.horde);
  private readonly hordeSample = new HordeSample();

  private accumulatorS = 0;
  private input: PlayerInput = NEUTRAL_INPUT;
  private latchedSwap = false;
  private latchedConsumable = false;
  /** Re-review M: the tap frame's throw-encoded aim, sent (fire off) on the step that takes the flag (LocalSimHost). */
  private latchedThrowAimX = 0;
  private latchedThrowAimY = 0;
  /** Re-review L: the tap frame's own fire (off for a throwable, kept for a medkit). */
  private latchedTapFire = false;
  private seq = 0;
  private readonly sendBuf: MutableInput = { ...NEUTRAL_INPUT };
  private drained: SimEvent[] = [];
  /** Server tick of each event drained from the queue this frame (review L1; reused). */
  private readonly drainedTicks: number[] = [];
  private renderTickNow = Number.NaN;
  /** Story 6.5: `clock.estimateTick` this frame (the telegraph fill). */
  private serverTickNow = Number.NaN;
  private disposed = false;
  private readonly pose: SampledPose = { x: 0, y: 0, heading: 0 };
  /** Story 2.9: reused `playerInfo` answer. */
  private readonly info: { slot: number; name: string } = { slot: 0, name: "" };
  private latest: RunStateView | null = null;
  /**
   * Story 3.4: `building.refused` answers, until the scene takes them. Story 5.18 (AC 8): a ring in
   * arrival order, each with the room state's tick when it came; one is handed on only once the
   * mirror World shows a newer patch, so every building the server accepted before it is drawn
   * (the scene matches its pending boxes in that order: refusals carry no request id).
   */
  private readonly refusals: (PlaceError | null)[] = new Array<PlaceError | null>(REFUSAL_RING).fill(null);
  private readonly refusalTicks = new Float64Array(REFUSAL_RING);
  private refusalHead = 0;
  private refusalCount = 0;
  /** Story 5.18 (review L1): refusals the full ring had to drop. */
  placeRefusalsDropped = 0;
  /** Story 3.7: the latest `building.repair_refused`, until the scene takes it. */
  private repairRefusal: RepairError | null = null;
  /** Story 5.9: the last upgrade refusal, until the scene takes it. */
  private upgradeRefusal: UpgradeError | null = null;
  /** Story 5.20: the last sell refusal, until the scene takes it. */
  private sellRefusal: SellError | null = null;
  /** Story 5.22: move refusals until the scene takes them (oldest first; a few at most). */
  private readonly moveRefusals: MoveRefusal[] = [];
  // Story 8.1 (AC 1): a held teammate (`heldUntilTick > 0`) has no body on the map: out of the mirror
  // World like on the server (no ring, no arrow, no aim-assist target); it comes back when the hold ends.
  private readonly dropMissing = (_p: PlayerState, id: string): void => {
    const s = this.latest?.players.get(id);
    if (!s || (s.heldUntilTick > 0 && id !== this.localPlayerId)) removePlayer(this.world, id);
  };
  private readonly addMissing = (p: PlayerStateView, id: string): void => {
    if (p.heldUntilTick > 0 && id !== this.localPlayerId) return;
    if (!this.world.players.has(id)) addPlayer(this.world, id, p.x, p.y);
  };
  private readonly writePlayer = (p: PlayerState): void => this.applyPlayer(p);
  // Story 2.8: downed fields from state; the reviver is found from the mirrored positions.
  private readonly reviveTicksTotal: number;
  private readonly writeReviver = (p: PlayerState): void => {
    p.reviverId = p.status === "downed" && p.reviveTicks > 0 ? (findReviver(this.world, p)?.id ?? null) : null;
  };

  /** Story 5.6 review M1: an acid puddle's life (s); older splashes in a drained backlog are dropped. */
  private readonly puddleS: number;

  /** Story 8.1: the link is up (see `NetSimHostOptions.linkUp`). */
  private readonly linkUp: () => boolean;

  constructor(opts: NetSimHostOptions) {
    this.session = opts.session;
    this.linkUp = opts.linkUp ?? (() => true);
    this.localPlayerId = opts.session.playerId;
    this.flames.predictLocal(this.localPlayerId); // Story 5.4
    this.now = opts.now ?? (() => performance.now());
    // Story 4.1: the mirror and the Predictor use the server's map (same bundled data; the join sends `mapVersion`).
    this.world = createWorld({ balance: opts.balance, seed: 0, map: opts.map ?? DOWNTOWN_MAP, systems: NO_SYSTEMS });
    this.ctx = { balance: opts.balance, tick: 0 };
    this.puddleS = acidSpitOf(opts.balance)?.puddleS ?? 0; // Story 5.6 review M1
    this.predictor = new Predictor(opts.balance, this.world.map, this.localPlayerId);
    this.measureHits = opts.measureHits ?? (() => true);
    this.localSlot = playerSlotOf(this.localPlayerId);
    this.fireClock = new LocalFireClock(opts.balance);
    this.cosmetics = new CosmeticProjectiles(this.world, this.localPlayerId, (netId) => this.onApparentHit(netId));
    for (let i = 0; i < LOCAL_EVENT_RING; i++) {
      const id = this.localPlayerId;
      this.localFired.push({ type: "weapon.fired", playerId: id, weapon: "", x: 0, y: 0, dirX: 1, dirY: 0 });
      this.localSwung.push({ type: "melee.swung", playerId: id, weapon: "", x: 0, y: 0, dirX: 1, dirY: 0, arcDeg: 0, rangeM: 0 });
      this.localLaunched.push({ type: "grenade.launched", playerId: id, grenadeId: 0, x: 0, y: 0, tx: 0, ty: 0, landTick: 0, flightTicks: 1, seq: 0 });
    }
    this.reviveTicksTotal = ticksFor(opts.balance.player.reviveS);
    const room = opts.session.room;
    // Batches that came while the scene was not built yet (hidden tab at Start) arrive first.
    this.offs.push(opts.session.onEvents((m) => this.receiveEvents(m)));
    this.offs.push(opts.session.onHorde((b) => this.hordeStats.receive(b)));
    this.offs.push(
      opts.session.onBuildingRefused((reason) => this.queueRefusal(reason)),
    );
    this.offs.push(opts.session.onShopAnswer((a) => this.shopAnswers.push(a)));
    this.offs.push(
      opts.session.onRepairRefused((reason) => {
        this.repairRefusal = reason;
      }),
    );
    this.offs.push(
      opts.session.onUpgradeRefused((reason) => {
        this.upgradeRefusal = reason;
      }),
    );
    this.offs.push(
      opts.session.onSellRefused((reason) => {
        this.sellRefusal = reason;
      }),
    );
    this.offs.push(
      opts.session.onMoveRefused((r) => {
        if (this.moveRefusals.length < MOVE_REFUSALS_MAX) this.moveRefusals.push(r);
      }),
    );
    room.onStateChange(this.onState);
    // The start patch (phase "wave", spawn positions) may already have arrived.
    if (room.state?.players && room.state.phase !== "lobby") this.takeSnapshot(room.state);
  }

  /** Story 2.9: slot and name from the room's schema copy (the slot from the id until it arrives). */
  playerInfo(id: string): PlayerInfo {
    const s = this.session.room.state?.players?.get(id);
    const slot = s?.slot ?? playerSlotOf(id);
    this.info.slot = slot === NET_NONE ? 0 : slot;
    this.info.name = s?.name ?? "";
    return this.info;
  }

  /** Latest RTT the server measured for this client (2.10 overlay); the session answers the pings. */
  get rttMs(): number {
    return this.session.rttMs;
  }

  /** Story 2.10: the test scenario the server runs for this room ("" = a normal game). */
  get scenario(): string {
    return this.session.room.state?.scenario ?? "";
  }

  /**
   * Story 4.4: the server's run seed (room state `runSeed`, 0 before the first patch). The mirror
   * World keeps seed 0: it never draws from a stream.
   */
  get runSeed(): number {
    return this.session.room.state?.runSeed ?? 0;
  }

  /**
   * Story 4.9 review (late join): the mirror World carries the server's decay stage (the first patch
   * with it was applied), so the city can bake once, straight at the right stage.
   */
  get decaySynced(): boolean {
    const st = this.session.room.state?.decayStage ?? 0;
    return st >= 1 && this.world.decay.stage === st;
  }

  /** Story 2.10: this device holds the room's host slot. */
  get isHost(): boolean {
    const state = this.session.room.state;
    return state !== undefined && state !== null && state.hostSlot === this.session.slot;
  }

  /** The (fractional) tick others are drawn at: server estimate − adaptive delay. NaN before the first snapshot. */
  /** Story 6.5 (F3): the estimated server tick of this frame (NaN before the clock is ready). */
  get serverTick(): number {
    return this.serverTickNow;
  }

  /** Story 6.5: the boss at the render tick, between its last two patches. */
  bossDrawPos(out: { x: number; y: number }): void {
    if (Number.isNaN(this.renderTickNow)) {
      out.x = this.world.boss.x;
      out.y = this.world.boss.y;
      return;
    }
    bossRenderPos(this.bossTrack, this.renderTickNow);
    out.x = bossDrawAt.x;
    out.y = bossDrawAt.y;
  }

  get renderTick(): number {
    return this.renderTickNow;
  }

  /** Inputs sent so far (= the last seq). */
  get sentSeq(): number {
    return this.seq;
  }

  update(frameDtS: number): void {
    const t0 = this.now();
    this.stats.lastUpdateSteps = 0;
    if (this.disposed) return;
    // Story 2.6: ONE render tick per frame, read by players, events and the horde (2.5) alike.
    this.delay.frame(frameDtS);
    this.serverTickNow = this.clock.ready ? this.clock.estimateTick(t0) : Number.NaN;
    this.renderTickNow = this.clock.ready ? this.delay.renderTick(this.serverTickNow) : Number.NaN;
    // Story 2.7: the horde first, so my shots this frame assist toward and stop at what is drawn.
    this.applyHorde(this.renderTickNow);
    this.cosmetics.update(frameDtS);
    if (frameDtS > 0) this.stepInputs(frameDtS);
    this.predictor.frame(frameDtS);
    this.applyState();
    const measure = this.measureHits();
    if (measure && !this.measuring) this.hits.reset(); // nothing pending from before it was off
    this.measuring = measure;
    if (measure) this.hits.update(t0);
    this.updateNetStats();
    this.stats.stepMs[0] = this.now() - t0;
  }

  clearEdges(): void {
    this.latchedSwap = false;
    this.latchedConsumable = false;
  }

  setLocalInput(input: PlayerInput): void {
    this.input = input;
    if (input.swap) this.latchedSwap = true;
    if (input.consumable) {
      this.latchedConsumable = true;
      this.latchedThrowAimX = input.aimX;
      this.latchedThrowAimY = input.aimY;
      this.latchedTapFire = input.fire;
    }
  }

  /** Story 3.1: `build.set_ready` (the server ignores it outside a build); the flag comes back in the state. */
  setBuildReady(ready: boolean): void {
    if (!this.disposed) this.session.room.send(C2S.BUILD_SET_READY, { ready });
  }

  /** Story 6.11: `evac.vote` (the server ignores it outside the vote); my `vote` comes back in the state. */
  castVote(choice: EvacChoice): void {
    if (!this.disposed) this.session.room.send(C2S.EVAC_VOTE, { choice });
  }

  /** Story 3.4: `building.place`; the building comes back in the state, a refusal as `building.refused`. */
  placeBuilding(req: PlaceRequest): void {
    if (!this.disposed) this.session.room.send(C2S.BUILDING_PLACE, { type: req.type, gx: req.gx, gy: req.gy, rot: req.rot });
  }

  /** Story 5.18: the oldest refusal once the mirror World holds a patch newer than the one it came after (AC 8), else null. */
  takePlaceRefusal(): PlaceError | null {
    if (this.refusalCount === 0 || !(this.world.tick > (this.refusalTicks[this.refusalHead] as number))) return null;
    const r = this.refusals[this.refusalHead] ?? null;
    this.refusals[this.refusalHead] = null;
    this.refusalHead = (this.refusalHead + 1) % REFUSAL_RING;
    this.refusalCount--;
    return r;
  }

  private queueRefusal(reason: PlaceError): void {
    if (this.disposed) return;
    if (this.refusalCount === REFUSAL_RING) {
      // full (≤ 4 sends/s make this a broken link): the oldest goes; its box times out instead
      this.refusalHead = (this.refusalHead + 1) % REFUSAL_RING;
      this.refusalCount--;
      this.placeRefusalsDropped++;
    }
    const i = (this.refusalHead + this.refusalCount) % REFUSAL_RING;
    this.refusals[i] = reason;
    this.refusalTicks[i] = this.session.room.state?.tick ?? 0;
    this.refusalCount++;
  }

  /** Story 3.7: `building.repair`; HP and wallet come back in the state, a refusal as `building.repair_refused`. */
  repairBuilding(id: number): void {
    if (!this.disposed) this.session.room.send(C2S.BUILDING_REPAIR, { id });
  }

  /** Story 5.9: `building.upgrade`; the new type, HP and wallet come back in the state, a refusal as `building.upgrade_refused`. */
  upgradeBuilding(id: number): void {
    if (!this.disposed) this.session.room.send(C2S.BUILDING_UPGRADE, { id });
  }

  takeUpgradeRefusal(): UpgradeError | null {
    const r = this.upgradeRefusal;
    this.upgradeRefusal = null;
    return r;
  }

  /** Story 5.20: `building.sell`; the removal and refund come back in the state, a refusal as `building.sell_refused`. */
  sellBuilding(id: number): void {
    if (!this.disposed) this.session.room.send(C2S.BUILDING_SELL, { id });
  }

  takeSellRefusal(): SellError | null {
    const r = this.sellRefusal;
    this.sellRefusal = null;
    return r;
  }

  /** Story 5.22: `building.move`; the new spot comes back in the state, a refusal as `building.move_refused`. */
  moveBuilding(req: MoveRequest, seq: number): void {
    if (!this.disposed) this.session.room.send(C2S.BUILDING_MOVE, { id: req.id, gx: req.gx, gy: req.gy, rot: req.rot, seq });
  }

  takeMoveRefusal(): MoveRefusal | null {
    return this.moveRefusals.shift() ?? null;
  }

  /** Story 5.24: reused (the SDK encodes synchronously; the dev throttle clones). */
  private readonly ghostMsg = { type: "", gx: 0, gy: 0, rot: 0 };

  /** Story 5.24: `building.ghost` (paced by the scene's `GhostSender`); relayed to the others, never answered. */
  sendGhost(type: string, gx: number, gy: number, rot: number): void {
    if (this.disposed) return;
    const m = this.ghostMsg;
    m.type = type;
    m.gx = gx;
    m.gy = gy;
    m.rot = rot;
    this.session.room.send(C2S.BUILDING_GHOST, m);
  }

  /** Story 5.24: the inbox's store (listened since the join). */
  get teammateGhosts(): TeammateGhosts {
    return this.session.inbox.ghosts;
  }

  takeRepairRefusal(): RepairError | null {
    const r = this.repairRefusal;
    this.repairRefusal = null;
    return r;
  }

  /** Story 3.3: answers of `shop.buy`, oldest first (a tap sends one at a time: at most a few). */
  private readonly shopAnswers: ShopAnswer[] = [];

  /**
   * Story 5.13: `shop.buy` for card `card` of my latest offer (its build and rev); the server
   * decides, answers this client and sends the new offer; the state brings wallet and loadout.
   */
  buyCard(card: number, item: string, slot: 0 | 1 | null): void {
    const o = this.session.latestOffer();
    if (this.disposed || !o) return;
    this.session.room.send(C2S.SHOP_BUY, slot === null ? { build: o.build, rev: o.rev, card, item } : { build: o.build, rev: o.rev, card, item, slot });
  }

  /** Story 5.13: `shop.reroll` of my latest offer; the new offer (or a refusal) comes back. */
  reroll(): void {
    const o = this.session.latestOffer();
    if (this.disposed || !o) return;
    this.session.room.send(C2S.SHOP_REROLL, { build: o.build, rev: o.rev });
  }

  /** Story 5.13: the latest `shop.offered` (kept by the session's inbox from the join). */
  shopOffer(): ShopOfferView | null {
    return this.session.latestOffer();
  }

  /** Story 5.1: `shop.upgrade`; the server decides and answers this client; the state brings the level and wallet. */
  upgradeWeapon(weapon: string): void {
    if (this.disposed) return;
    this.session.room.send(C2S.SHOP_UPGRADE, { weapon });
  }

  /** Story 5.11: `shop.buy_item`; the server decides and answers this client; the state brings gear, max HP and wallet. */
  buyItem(item: string): void {
    if (this.disposed) return;
    this.session.room.send(C2S.SHOP_BUY_ITEM, { item });
  }

  takeShopAnswer(): ShopAnswer | null {
    return this.shopAnswers.shift() ?? null;
  }

  drainEvents(): readonly SimEvent[] {
    const out = this.drained;
    out.length = 0;
    for (let i = 0; i < this.immediate.length; i++) out.push(this.immediate[i] as SimEvent);
    this.immediate.length = 0;
    for (let i = 0; i < this.arrival.length; i++) out.push(this.arrival[i] as SimEvent);
    this.arrival.length = 0;
    const from = out.length;
    const ticks = this.drainedTicks;
    ticks.length = 0;
    if (!Number.isNaN(this.renderTickNow)) this.queue.drain(this.renderTickNow, out, ticks);
    // Others' shots fly from their server muzzle, in step with the interpolated shooter. Review L1:
    // shots older than the render tick − STALE_COSMETIC_TICKS (a drained backlog) are dropped.
    const staleBefore = this.renderTickNow - STALE_COSMETIC_TICKS;
    let w = from;
    for (let i = from; i < out.length; i++) {
      const e = out[i] as SimEvent;
      const stale = (ticks[i - from] as number) < staleBefore;
      if (e.type === "weapon.fired") {
        if (stale) continue;
        this.cosmetics.spawn(e.playerId, e.weapon, e.x, e.y, e.dirX, e.dirY, e.seq ?? -1); // Story 5.3: a pellet gun's seq
      } else if (e.type === "turret.fired") {
        if (stale) {
          this.turretAim(e);
          continue;
        }
        this.turretShot(e);
      } else if (e.type === "spitter.spat" || e.type === "acid.splashed") {
        // Story 5.6 review M1: a woken tab's backlog. A stale glob is dropped (it landed long ago); a
        // puddle is back-dated by its age (`ageS`: AcidFx starts it that much earlier, no sound) and
        // dropped once older than its life, so the client shows exactly the server's live puddles.
        const ageS = Math.max(0, this.renderTickNow - (ticks[i - from] as number)) * TICK_DT_S;
        if (e.type === "spitter.spat" && stale) continue;
        if (e.type === "acid.splashed" && ageS >= this.puddleS) continue;
        e.ageS = ageS;
      } else if (
        e.type === "boss.warning" ||
        e.type === "boss.arrived" ||
        e.type === "boss.telegraph" ||
        e.type === "boss.slammed" ||
        e.type === "boss.target_changed" ||
        e.type === "boss.crashed" ||
        e.type === "boss.thrown_impact" ||
        e.type === "boss.enraged" ||
        e.type === "boss.killed"
      ) {
        // Story 6.5 (brief 14): a woken tab's backlog plays no late banner or sound (the telegraph draws from its own ticks).
        // Stories 6.6 / 6.7: the crash, the impact, the roar and the death too (EVAC INBOUND still shows once: bossCue).
        e.ageS = Math.max(0, this.renderTickNow - (ticks[i - from] as number)) * TICK_DT_S;
      } else if (e.type === "molotov.ignited") {
        // Story 5.12: back-dated by its age (MolotovFires starts it that much earlier and drops one
        // older than its life): a woken tab shows exactly the server's live zones, no ghost fire.
        e.ageS = Math.max(0, this.renderTickNow - (ticks[i - from] as number)) * TICK_DT_S;
      } else if (e.type === "grenade.launched" || e.type === "explosion.happened") {
        // Story 5.5: its age (a woken tab's backlog): a round starts that far into its flight (one
        // long landed is dropped by the view's lost timer), a stale blast shows nothing (no double
        // or ghost blasts on wake: the build start in the same backlog clears the rounds).
        e.ageS = Math.max(0, this.renderTickNow - (ticks[i - from] as number)) * TICK_DT_S;
      } else if (e.type === "zombie.brute_spawned") {
        // Story 5.7 (Beat the rule 9): its age, so a woken tab's backlog neither roars nor shows the banner late.
        e.ageS = Math.max(0, this.renderTickNow - (ticks[i - from] as number)) * TICK_DT_S;
      } else if (e.type === "building.placed") {
        // Story 5.23 (AC 6): its age, so a woken tab's backlog plays no thunk, haptic or dust.
        e.ageS = Math.max(0, this.renderTickNow - (ticks[i - from] as number)) * TICK_DT_S;
      } else if (e.type === "event.triggered" || e.type === "event.phase_changed") {
        // Story 6.8 (brief 14): its age, so a woken tab's backlog shows no late banner or sound (the marker follows the room state).
        e.ageS = Math.max(0, this.renderTickNow - (ticks[i - from] as number)) * TICK_DT_S;
      } else if (e.type === "bloater.burst" || e.type === "bloater.swell_started") {
        // Story 5.8: its age: BloaterFx back-dates a burst's cloud (and drops one older than gasS: no
        // ghost cloud after a woken tab), GameScene plays no burst sound for a stale one.
        e.ageS = Math.max(0, this.renderTickNow - (ticks[i - from] as number)) * TICK_DT_S;
      }
      out[w++] = e;
    }
    out.length = w;
    return out;
  }

  /**
   * Story 3.6: a turret's shot at the render tick. Only the id and heading came over the wire: the
   * muzzle is put at the mirror building (centre + aim × `muzzleM`), the building's aim is turned
   * (the view draws it; never synced per tick) and a cosmetic projectile flies. A building the
   * mirror doesn't have (removed meanwhile) leaves x/y NaN and draws nothing.
   */
  /** Review L1: a stale turret shot only turns the mirror turret (no projectile, no FX). */
  private turretAim(e: Extract<SimEvent, { type: "turret.fired" }>): void {
    const b = buildingById(this.world, e.buildingId);
    if (!b) return;
    b.aimX = e.dirX;
    b.aimY = e.dirY;
  }

  private turretShot(e: Extract<SimEvent, { type: "turret.fired" }>): void {
    const b = buildingById(this.world, e.buildingId);
    const t = b ? turretStats(this.world.balance, b.type) : undefined;
    if (!b || !t) return;
    b.aimX = e.dirX;
    b.aimY = e.dirY;
    e.x = buildingCentreX(b) + e.dirX * t.muzzleM;
    e.y = buildingCentreY(b) + e.dirY * t.muzzleM;
    this.cosmetics.spawnShot(b.id, b.type, e.x, e.y, e.dirX, e.dirY, t.projectileSpeedMps, t.projectileRangeM);
  }

  /** Stops listening and leaves the room (the online run ends with the scene). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.session.room.onStateChange.remove(this.onState);
    this.queue.clear();
    this.horde.clear();
    this.cosmetics.clear();
    this.drained.length = 0;
    this.immediate.length = 0;
    this.arrival.length = 0;
    this.session.leave();
  }

  /** One input per 50 ms step, like LocalSimHost; at most 5 per frame, the rest dropped. */
  private stepInputs(frameDtS: number): void {
    if (!this.linkUp()) {
      // Story 8.1 (F7): offline steps are never sent or predicted (and never sent late as a burst).
      this.accumulatorS = 0;
      this.latchedSwap = false;
      this.latchedConsumable = false;
      return;
    }
    this.accumulatorS += frameDtS;
    let steps = 0;
    const room = this.session.room;
    while (this.accumulatorS >= TICK_DT_S && steps < MAX_CATCHUP_STEPS) {
      const buf = this.sendBuf;
      copyInput(buf, this.input);
      buf.seq = ++this.seq;
      buf.swap = this.latchedSwap;
      buf.consumable = this.latchedConsumable;
      if (buf.consumable) {
        // Re-review M: the tap frame's aim and fire (off for a throw); before the send, the predictor and the fire clock.
        buf.aimX = this.latchedThrowAimX;
        buf.aimY = this.latchedThrowAimY;
        buf.fire = this.latchedTapFire;
      }
      // Story 2.12: the tick the horde is drawn at this frame; the server tests this input's shots there.
      buf.viewTick = viewTickOf(this.renderTickNow);
      this.latchedSwap = false; // consumed by exactly one step
      this.latchedConsumable = false;
      room.send(C2S.INPUT_SEND, buf); // encoded synchronously: the buffer can be reused
      // Story 2.6: my survivor moves now, not a round trip later. Story 5.2: with the weapon state the
      // server's movement sees on this seq (the fire clock's, from the seq before: the Chainsaw slow).
      this.predictor.applyLocal(buf, this.fireClock.moveWeapon, this.fireClock.moveSwapping);
      // Story 2.7: my weapon fires now too (cosmetic; the server fires its own shot from this input).
      const attacked = this.fireClock.step(buf, room.state?.players?.get(this.localPlayerId));
      if (attacked) this.localAttack(buf.isMouse, buf.seq);
      // Story 5.4: my cone shows at once (2.7), from the fire clock's fuel prediction.
      const a = this.fireClock.attack;
      this.flames.setLocal(attacked && a.flame, a.weapon, a.dirX, a.dirY);
      this.accumulatorS -= TICK_DT_S;
      steps++;
    }
    this.stats.lastUpdateSteps = steps;
    this.stats.totalSteps += steps;
    if (this.accumulatorS >= TICK_DT_S) this.accumulatorS %= TICK_DT_S; // hidden tab: never burst
  }

  /** Writes the latest room state (and the interpolated poses) into the mirror World. */
  private applyState(): void {
    const state = this.session.room.state;
    if (!state?.players || state.phase === "lobby") return; // a throttled room may still show the lobby
    this.latest = state;
    this.world.players.forEach(this.dropMissing);
    state.players.forEach(this.addMissing);
    this.world.players.forEach(this.writePlayer);
    this.world.players.forEach(this.writeReviver);
    this.world.teamWiped = state.phase === "results";
    this.latest = null;
    // Story 3.1: the run state machine's phase and build timer (the mirror never steps it).
    this.world.run.phase = state.phase;
    this.world.run.buildTicksLeft = state.buildTicksLeft;
    // Story 6.11 / 6.12: the vote's ticks, the ending and endless (server truth; the Results come from the room state).
    this.world.run.voteTicksLeft = state.voteTicksLeft ?? 0;
    this.world.run.ending = state.phase === "results" ? endingOf(state.resultEnding) : "none";
    this.world.run.endless = state.endless === true;
    this.world.tick = state.tick;
    this.world.waves.number = state.wave;
    this.world.waves.remaining = state.remaining;
    mirrorBuildings(state.buildings, this.world); // Story 3.4: drawn, and the placement preview's check
    mirrorDecay(this.world, state.decayStage, state.decayVariants, state.decayFiresOut); // Story 4.5: drawn, the preview's check, cosmetic shots
    // Story 6.3 (F1): the server's light state as is (no fade, no local guess); `?? ` for an older server.
    this.world.lights.blackoutPct = state.blackoutPct ?? 0;
    this.world.lights.halfDark = state.halfDark === true;
    // Story 6.5: the Behemoth (server truth) and its last two positions (drawn at the render tick).
    mirrorBoss(this.world, state.boss);
    if (state.boss) trackBoss(this.bossTrack, state.boss.x, state.boss.y, state.tick);
    mirrorSpecialEvent(this.world, state); // Story 6.8: the active event (EventView reads one source in solo and online)
  }

  /**
   * My local attack on this step (Story 2.7): from the predicted position (where the server will
   * fire from for this input), an immediate event for the muzzle flash or swing and sound, and for
   * guns a cosmetic projectile. Touch aim bends with `assistAim` on the mirror's drawn zombies;
   * spread is the seq's roll (`seqSpreadRoll`, Story 2.12), the server's too.
   */
  private localAttack(isMouse: boolean, seq: number): void {
    if (this.immediate.length >= LOCAL_EVENT_RING) return; // not drained for a while: skip the cosmetics
    const a = this.fireClock.attack;
    const balance = this.world.balance;
    const stats = balance.weapons[a.weapon];
    if (!stats || stats.kind === "flame") return; // Story 5.4: a flame has no shot (its cone is the flame cues')
    const px = this.predictor.x;
    const py = this.predictor.y;
    const k = this.localNext;
    this.localNext = (k + 1) % LOCAL_EVENT_RING;
    if (stats.kind === "melee") {
      const e = this.localSwung[k] as SwungEvent;
      e.weapon = a.weapon;
      e.x = px;
      e.y = py;
      e.dirX = a.dirX;
      e.dirY = a.dirY;
      e.arcDeg = stats.arcDeg;
      e.rangeM = stats.rangeM;
      this.immediate.push(e);
      return;
    }
    const offset = balance.player.radiusM + MUZZLE_OFFSET_M;
    const mx = px + a.dirX * offset;
    const my = py + a.dirY * offset;
    if (stats.kind === "launcher") {
      // Story 5.5 (2.7): my round flies now, to the landing point the sim's own rule gives from my
      // predicted position on the mirror's cover; the server's `grenade.launched` replaces it.
      const fired = this.localFired[k] as FiredEvent;
      fired.weapon = a.weapon;
      fired.x = mx;
      fired.y = my;
      fired.dirX = a.dirX;
      fired.dirY = a.dirY;
      this.immediate.push(fired);
      const t = lobTarget(this.world, stats, px, py, balance.player.radiusM, a.dirX, a.dirY, a.aimLen, this.lobOut);
      const l = this.localLaunched[k] as LaunchedEvent;
      l.x = t.x0;
      l.y = t.y0;
      l.tx = t.x;
      l.ty = t.y;
      l.flightTicks = lobFlightTicks(stats, t.distM);
      l.landTick = Number.NaN;
      l.seq = seq & 0xffff; // review L1: the server echo of this shot carries the same seq
      l.ageS = 0;
      this.immediate.push(l);
      return;
    }
    const dir = this.aimDir;
    dir.x = a.dirX;
    dir.y = a.dirY;
    if (!isMouse) {
      this.cosmetics.ensureGrid();
      // Story 6.4 (F4): the same fog filter as the server (my own beam along the aim, from my centre).
      const me = this.world.players.get(this.localPlayerId);
      this.aimShooter.x = px;
      this.aimShooter.y = py;
      this.aimShooter.gear = me ? me.gear : 0;
      assistAim(this.world, mx, my, a.dirX, a.dirY, stats.rangeM, dir, null, this.aimShooter);
    }
    // Story 2.12: the seq's roll, the one the server (with lag compensation) gives its shot too.
    // Story 5.3: a pellet gun's centre aim has no roll (its fan does: `cosmetics.spawn` with the seq).
    if (stats.spreadDeg > 0 && stats.pellets === 1) rotateBySeqSpread(dir.x, dir.y, this.localPlayerId, seq, stats.spreadDeg, dir);
    const e = this.localFired[k] as FiredEvent;
    e.weapon = a.weapon;
    e.x = mx;
    e.y = my;
    e.dirX = dir.x;
    e.dirY = dir.y;
    this.immediate.push(e);
    this.cosmetics.spawn(this.localPlayerId, a.weapon, mx, my, dir.x, dir.y, seq & 0xffff);
  }

  /** Expectation window of an apparent hit: RTT + render delay + slack (Story 2.7). */
  private hitWindowMs(): number {
    return this.session.rttMs + this.delay.delayMs + REVERSED_HIT_SLACK_MS;
  }

  /**
   * How long a server hit that beat my bullet to the drawn zombie waits for it: one-way delay +
   * render delay + slack (the drawn zombie is that far behind), so it can't confirm a later shot.
   */
  private earlyHitWindowMs(): number {
    return this.session.rttMs / 2 + this.delay.delayMs + EARLY_HIT_SLACK_MS;
  }

  private onApparentHit(netId: number): void {
    if (this.measuring) this.hits.apparent(netId, this.now(), this.hitWindowMs());
  }

  /** True for a gun (melee hits have no cosmetic bullet to confirm). */
  private isGunIndex(weaponIndex: number | undefined): boolean {
    const id = weaponIds(this.world.balance)[weaponIndex ?? -1];
    return id !== undefined && this.world.balance.weapons[id]?.kind === "gun";
  }

  private updateNetStats(): void {
    const n = this.netStats;
    const s = this.predictor.stats;
    n.rttMs = this.session.rttMs;
    n.delayMs = this.delay.delayMs;
    n.jitterMs = this.delay.jitterMs;
    n.corrections = s.corrections;
    n.snaps = s.snaps;
    n.maxErrorM = s.maxErrorM;
    n.unackedInputs = s.unackedInputs;
    n.apparentHits = this.hits.counts.apparentHits;
    n.confirmed = this.hits.counts.confirmed;
    n.reversed = this.hits.counts.reversed;
  }

  /** Story 2.5: the horde at one render tick (Story 2.6's adaptive delay passes its own) into the mirror. */
  private applyHorde(renderTick: number): void {
    if (Number.isNaN(renderTick)) return;
    this.horde.sample(renderTick, this.hordeSample);
    mirrorZombies(this.hordeSample, this.world.zombies);
    this.cosmetics.zombiesMoved();
  }

  private applyPlayer(p: PlayerState): void {
    const s = this.session.room.state.players.get(p.id);
    if (!s) return;
    if (p.id === this.localPlayerId && this.predictor.ready) this.writePredicted(p);
    else this.writeInterpolated(p, s);
    p.hp = s.hp;
    p.maxHp = s.maxHp;
    p.gear = s.gear; // Story 5.11: HUD icons, shop "Owned", the reviver's kit (the predictor has its own copy)
    p.protectTicks = s.protectTicks; // Story 8.1 (D3): the renderer blinks a spawn-protected body
    p.consumable = consumableAt(this.world.balance, s.consumable); // Story 5.12: the slot is server truth (never predicted)
    p.consumableCount = p.consumable === null ? 0 : s.consumableCount;
    p.status = s.status;
    p.buildReady = s.buildReady;
    p.vote = s.vote ?? 0; // Story 6.11
    p.slowTicksLeft = s.slowTicks; // Story 3.9: the slowed look (the predictor has its own copy)
    p.slowPct = s.slowPct;
    p.knockTicks = s.knockTicks; // Story 5.7: mirrored for the look (the predictor has its own copy)
    p.knockDx = s.knockDx;
    p.knockDy = s.knockDy;
    p.knockStepMm = s.knockStepMm;
    this.applyDowned(p, s);
    // Story 3.2: money is server truth (schema), never predicted.
    p.wallet = s.wallet;
    p.earned = s.earned;
    const lo = p.loadout;
    lo.active = s.active === 1 ? 1 : 0;
    lo.swapTicks = s.swapTicks;
    lo.slots[0] = this.syncSlot(lo.slots[0], s.weapon0, s.ammo0, s.reloadTicks0, s.level0) ?? lo.slots[0];
    lo.slots[1] = this.syncSlot(lo.slots[1], s.weapon1, s.ammo1, s.reloadTicks1, s.level1);
    if (p.id === this.localPlayerId) this.predictAmmo(lo.slots[0], s, 0).predictAmmo(lo.slots[1], s, 1);
  }

  /**
   * Story 2.7 review: my HUD ammo and reload bar follow the local fire clock (the server's lag an
   * RTT behind the instant muzzle flashes).
   */
  private predictAmmo(slot: WeaponSlot | null, s: PlayerStateView, i: 0 | 1): this {
    const kind = slot ? this.world.balance.weapons[slot.weapon]?.kind : undefined;
    if (slot && (kind === "gun" || kind === "launcher" || kind === "flame")) { // Story 5.4: my fuel follows the fire clock too
      slot.ammo = Math.max(0, this.fireClock.predictedAmmo(s, i));
      slot.reloadTicks = this.fireClock.predictedReloadTicks(s, i);
    }
    return this;
  }

  /** Story 2.6: the local survivor at its predicted, smoothed position (alpha = step fraction). */
  private writePredicted(p: PlayerState): void {
    const alpha = this.accumulatorS / TICK_DT_S;
    p.x = p.prevX = this.predictor.renderX(alpha);
    p.y = p.prevY = this.predictor.renderY(alpha);
    p.facingX = this.predictor.facingX;
    p.facingY = this.predictor.facingY;
  }

  /** Others: the interpolated snapshot at the render tick (the latest state before the first). */
  private writeInterpolated(p: PlayerState, s: PlayerStateView): void {
    const pose = this.pose;
    if (Number.isNaN(this.renderTickNow) || !this.snapshots.sample(s.slot, this.renderTickNow, pose)) {
      pose.x = s.x;
      pose.y = s.y;
      pose.heading = s.heading;
    }
    p.x = pose.x;
    p.y = pose.y;
    p.prevX = pose.x;
    p.prevY = pose.y;
    const a = headingToRad(pose.heading);
    p.facingX = Math.cos(a);
    p.facingY = Math.sin(a);
  }

  /** Story 2.8: countdown and revive progress (0–255 → ticks) from the latest state. */
  private applyDowned(p: PlayerState, s: PlayerStateView): void {
    p.downedTicksLeft = s.downedTicksLeft;
    // Story 5.11 review L2: progress is of the server's synced need (fastest kit in reach), never re-derived here.
    p.reviveNeedTicks = s.reviveNeed;
    p.reviveTicks = Math.round((s.reviveProgress / 255) * (s.reviveNeed > 0 ? s.reviveNeed : this.reviveTicksTotal));
  }

  /** Reuses the slot object unless the weapon changed ("" = empty). */
  private syncSlot(slot: WeaponSlot | null, weapon: string, ammo: number, reloadTicks: number, level: number): WeaponSlot | null {
    if (weapon === "" || !this.world.balance.weapons[weapon]) return null;
    const out = slot && slot.weapon === weapon ? slot : createSlot(this.world.balance, weapon);
    out.ammo = ammo;
    out.reloadTicks = reloadTicks;
    out.level = level > 0 ? level : 1; // Story 5.1: server truth (0 only for an empty slot); HUD and shop read it
    return out;
  }

  private receiveState(state: RunStateView): void {
    if (this.disposed || !state?.players) return;
    if (state.phase === "lobby") return; // a throttled room delivers the lobby's last patches late
    if (this.snapshots.size > 0 && state.tick <= this.snapshots.latestTick) return; // nothing new this patch
    const now = this.now();
    this.takeSnapshot(state);
    this.clock.sample(now, state.tick);
    this.delay.snapshot(now, state.tick); // arrival after the dev throttle, if on
  }

  /** Others go into the interpolation ring; my own player reconciles the prediction (Story 2.6). */
  private takeSnapshot(state: RunStateView): void {
    this.snapshots.push(state);
    state.players.forEach(this.patchFlame); // Story 5.4: the lost-flame_stopped fallback (fuel stopped falling)
    // Story 3.4: the buildings of this very patch, before the replay (the server moved me with them).
    this.predictor.syncBuildings(state.buildings);
    this.predictor.syncDecay(state.decayStage, state.decayVariants, state.decayFiresOut); // Story 4.5: the same patch's map
    this.predictor.syncBoss(state.boss); // Story 6.5 (DD6): the boss's body for the push-out
    const me = state.players.get(this.localPlayerId);
    if (!me) return;
    this.predictor.reconcile(me.ackSeq, me.x, me.y, me.status, me.slowTicks, me.slowPct, me.knockTicks, me.knockDx, me.knockDy, me.knockStepMm, me.gear);
    // Events go out at the tick, patches later on one socket: every server shot for seqs ≤ ack is
    // already counted. Local shots there beyond them were never fired by the server.
    this.fireClock.ack(me.ackSeq);
    const missing = this.fireClock.shotsAcked + this.unpredictedShots - this.serverOwnShots - this.forgivenShots;
    if (missing > 0) this.forgivenShots += missing;
  }

  private receiveEvents(m: SimEventsFlushed): void {
    if (this.disposed || !m || !Array.isArray(m.events) || typeof m.tick !== "number") return;
    this.ctx.tick = m.tick; // Story 5.5: a round's landing tick is relative to its flush
    const measure = this.measuring;
    const now = measure ? this.now() : 0;
    for (const t of m.events) {
      if (!Array.isArray(t)) continue;
      const kind = t[0];
      // Story 2.7, on arrival: my own server hits confirm my apparent ones (full net id, index 1).
      if (measure && kind === NET_EVENT_KIND.ZOMBIE_HIT && typeof t[1] === "number" && this.isMine(t[7]) && this.isGunIndex(t[6])) {
        this.hits.serverHit(t[1], now, this.earlyHitWindowMs());
      } else if (measure && kind === NET_EVENT_KIND.ZOMBIE_KILLED && typeof t[1] === "number") {
        this.hits.serverKilled(t[1]);
      }
      // My own shot and swing already played locally. Safety net: a server shot beyond every shot
      // my fire clock made was not predicted, so it is drawn (at the render tick, like others').
      if (kind === NET_EVENT_KIND.MELEE_SWUNG && this.isMine(t[1])) continue;
      if (kind === NET_EVENT_KIND.WEAPON_FIRED && this.isMine(t[1])) {
        this.serverOwnShots++;
        if (this.serverOwnShots + this.forgivenShots <= this.fireClock.shotsFired + this.unpredictedShots) continue;
        this.unpredictedShots++;
      }
      const e = decodeNetEvent(t, this.ctx);
      if (!e) continue;
      if (this.isOwnWeaponState(kind, t[1])) {
        if (this.arrival.length < ARRIVAL_EVENTS_MAX) this.arrival.push(e); // my reload sound on time
        continue;
      }
      this.queue.push(m.tick, e);
      // Story 2.5: the full net id (tuple index 1) hides that zombie at the same render tick.
      if (kind === NET_EVENT_KIND.ZOMBIE_KILLED && typeof t[1] === "number") this.horde.killAt(m.tick, t[1]);
    }
  }

  private isMine(slot: number | undefined): boolean {
    return slot !== undefined && slot !== NET_NONE && slot === this.localSlot;
  }

  private isOwnWeaponState(kind: number | undefined, slot: number | undefined): boolean {
    const K = NET_EVENT_KIND;
    return (
      (kind === K.WEAPON_RELOAD_STARTED || kind === K.WEAPON_RELOADED || kind === K.WEAPON_SWAP_STARTED || kind === K.WEAPON_SWAPPED) &&
      this.isMine(slot)
    );
  }
}
