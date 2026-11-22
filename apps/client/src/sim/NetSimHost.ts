import {
  C2S,
  NEUTRAL_INPUT,
  NO_SYSTEMS,
  TICK_DT_S,
  addPlayer,
  createSlot,
  createWorld,
  decodeNetEvent,
  headingToRad,
  removePlayer,
  type Balance,
  type NetEventContext,
  type PlayerInput,
  type PlayerState,
  type PlayerStateView,
  type RunStateView,
  type SimEvent,
  type SimEventsFlushed,
  type WeaponSlot,
  type World,
} from "@topdown/shared";
import type { SimHost } from "./SimHost";
import { MAX_CATCHUP_STEPS, type SimStepStats } from "./LocalSimHost";
import type { NetSession } from "../net/session";
import { ServerClock } from "../net/serverClock";
import { SnapshotRing, type SampledPose } from "../net/snapshots";
import { EventQueue } from "../net/eventQueue";

/** Everyone, you included, is drawn this many ticks (100 ms) behind the server. Story 2.6 makes it adaptive. */
export const RENDER_DELAY_TICKS = 2;
/** Sent inputs kept for Story 2.6's replay. */
export const INPUT_HISTORY_SIZE = 64;

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
};

export interface NetSimHostOptions {
  balance: Balance;
  session: NetSession;
  /** Client clock in ms (tests inject one). */
  now?: () => number;
}

/**
 * The networked host (Story 2.4). The server runs the World; this host keeps a mirror World that
 * is never stepped (all systems no-ops) and writes into it every frame from room state:
 *
 * - players added/removed as the schema's `players` map changes; position and facing from the
 *   interpolated snapshot at the render tick (`prevX = x`, so any `alpha` draws the same point);
 *   HP, status and loadout from the latest state (the HUD works unchanged);
 * - waves from the latest state. Zombies stay empty until Story 2.5, projectiles until 2.7.
 *
 * Inputs: one `input.send` per 50 ms step with seq + 1, edge flags latched until a step takes
 * them, at most 5 steps per frame (the backlog after a hidden tab is dropped, never burst).
 * Events: queued by server tick and handed out once the render tick reaches them.
 */
export class NetSimHost implements SimHost {
  readonly world: World;
  readonly localPlayerId: string;
  readonly online = true;
  /** Positions are written already interpolated: alpha never matters. */
  readonly alpha = 0;
  readonly stats: SimStepStats = { lastUpdateSteps: 0, stepMs: new Float64Array(MAX_CATCHUP_STEPS), totalSteps: 0 };
  /** Sent inputs, oldest first from `historyHead` (Story 2.6 replays `seq > ackSeq`). */
  readonly history: readonly PlayerInput[];
  private readonly historyRing: MutableInput[];
  private historyHead = 0;
  private historyCount = 0;

  private readonly session: NetSession;
  private readonly now: () => number;
  private readonly clock = new ServerClock();
  private readonly snapshots = new SnapshotRing();
  private readonly queue = new EventQueue();
  private readonly ctx: NetEventContext;
  private readonly offs: (() => void)[] = [];
  private readonly onState = (state: RunStateView): void => this.receiveState(state);

  private accumulatorS = 0;
  private input: PlayerInput = NEUTRAL_INPUT;
  private latchedSwap = false;
  private latchedConsumable = false;
  private seq = 0;
  private readonly sendBuf: MutableInput = { ...NEUTRAL_INPUT };
  private drained: SimEvent[] = [];
  private renderTickNow = Number.NaN;
  private disposed = false;
  private readonly pose: SampledPose = { x: 0, y: 0, heading: 0 };
  private latest: RunStateView | null = null;
  private readonly dropMissing = (_p: PlayerState, id: string): void => {
    if (!this.latest?.players.has(id)) removePlayer(this.world, id);
  };
  private readonly addMissing = (p: PlayerStateView, id: string): void => {
    if (!this.world.players.has(id)) addPlayer(this.world, id, p.x, p.y);
  };
  private readonly writePlayer = (p: PlayerState): void => this.applyPlayer(p);

  constructor(opts: NetSimHostOptions) {
    this.session = opts.session;
    this.localPlayerId = opts.session.playerId;
    this.now = opts.now ?? (() => performance.now());
    this.world = createWorld({ balance: opts.balance, seed: 0, systems: NO_SYSTEMS });
    this.ctx = { balance: opts.balance };
    this.historyRing = Array.from({ length: INPUT_HISTORY_SIZE }, () => ({ ...NEUTRAL_INPUT }));
    this.history = this.historyRing;
    const room = opts.session.room;
    // Batches that came while the scene was not built yet (hidden tab at Start) arrive first.
    this.offs.push(opts.session.onEvents((m) => this.receiveEvents(m)));
    room.onStateChange(this.onState);
    // The start patch (phase "wave", spawn positions) may already have arrived.
    if (room.state?.players) this.snapshots.push(room.state);
  }

  /** Latest RTT the server measured for this client (2.10 overlay); the session answers the pings. */
  get rttMs(): number {
    return this.session.rttMs;
  }

  /** The (fractional) tick being drawn: server estimate − 100 ms. NaN before the first snapshot. */
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
    if (frameDtS > 0) this.stepInputs(frameDtS);
    this.renderTickNow = this.clock.ready ? this.clock.estimateTick(t0) - RENDER_DELAY_TICKS : Number.NaN;
    this.applyState();
    this.stats.stepMs[0] = this.now() - t0;
  }

  setLocalInput(input: PlayerInput): void {
    this.input = input;
    if (input.swap) this.latchedSwap = true;
    if (input.consumable) this.latchedConsumable = true;
  }

  drainEvents(): readonly SimEvent[] {
    const out = this.drained;
    out.length = 0;
    if (!Number.isNaN(this.renderTickNow)) this.queue.drain(this.renderTickNow, out);
    return out;
  }

  /** Stops listening and leaves the room (the online run ends with the scene). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.session.room.onStateChange.remove(this.onState);
    this.queue.clear();
    this.drained.length = 0;
    this.session.leave();
  }

  /** One input per 50 ms step, like LocalSimHost; at most 5 per frame, the rest dropped. */
  private stepInputs(frameDtS: number): void {
    this.accumulatorS += frameDtS;
    let steps = 0;
    const room = this.session.room;
    while (this.accumulatorS >= TICK_DT_S && steps < MAX_CATCHUP_STEPS) {
      const buf = this.sendBuf;
      copyInput(buf, this.input);
      buf.seq = ++this.seq;
      buf.swap = this.latchedSwap;
      buf.consumable = this.latchedConsumable;
      this.latchedSwap = false; // consumed by exactly one step
      this.latchedConsumable = false;
      room.send(C2S.INPUT_SEND, buf); // encoded synchronously: the buffer can be reused
      const slot = (this.historyHead + this.historyCount) % INPUT_HISTORY_SIZE;
      copyInput(this.historyRing[slot] as MutableInput, buf);
      if (this.historyCount < INPUT_HISTORY_SIZE) this.historyCount++;
      else this.historyHead = (this.historyHead + 1) % INPUT_HISTORY_SIZE;
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
    if (!state?.players) return;
    this.latest = state;
    this.world.players.forEach(this.dropMissing);
    state.players.forEach(this.addMissing);
    this.world.players.forEach(this.writePlayer);
    this.latest = null;
    this.world.tick = state.tick;
    this.world.waves.number = state.wave;
    this.world.waves.remaining = state.remaining;
  }

  private applyPlayer(p: PlayerState): void {
    const s = this.session.room.state.players.get(p.id);
    if (!s) return;
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
    p.hp = s.hp;
    p.maxHp = s.maxHp;
    p.status = s.status;
    const lo = p.loadout;
    lo.active = s.active === 1 ? 1 : 0;
    lo.swapTicks = s.swapTicks;
    lo.slots[0] = this.syncSlot(lo.slots[0], s.weapon0, s.ammo0, s.reloadTicks0) ?? lo.slots[0];
    lo.slots[1] = this.syncSlot(lo.slots[1], s.weapon1, s.ammo1, s.reloadTicks1);
  }

  /** Reuses the slot object unless the weapon changed ("" = empty). */
  private syncSlot(slot: WeaponSlot | null, weapon: string, ammo: number, reloadTicks: number): WeaponSlot | null {
    if (weapon === "" || !this.world.balance.weapons[weapon]) return null;
    const out = slot && slot.weapon === weapon ? slot : createSlot(this.world.balance, weapon);
    out.ammo = ammo;
    out.reloadTicks = reloadTicks;
    return out;
  }

  private receiveState(state: RunStateView): void {
    if (this.disposed || !state?.players) return;
    if (this.snapshots.size > 0 && state.tick <= this.snapshots.latestTick) return; // nothing new this patch
    this.snapshots.push(state);
    this.clock.sample(this.now(), state.tick);
  }

  private receiveEvents(m: SimEventsFlushed): void {
    if (this.disposed || !m || !Array.isArray(m.events) || typeof m.tick !== "number") return;
    for (const t of m.events) {
      if (!Array.isArray(t)) continue;
      const e = decodeNetEvent(t, this.ctx);
      if (e) this.queue.push(m.tick, e);
    }
  }
}
