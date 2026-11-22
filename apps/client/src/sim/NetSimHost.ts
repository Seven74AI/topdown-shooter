import {
  C2S,
  NET_EVENT_KIND,
  NEUTRAL_INPUT,
  NET_NONE,
  NO_SYSTEMS,
  TICK_DT_S,
  addPlayer,
  assistAim,
  createRng,
  createSlot,
  createWorld,
  decodeNetEvent,
  findReviver,
  headingToRad,
  playerSlotOf,
  removePlayer,
  rotate,
  ticksFor,
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
import type { PlayerInfo, SimHost } from "./SimHost";
import { MAX_CATCHUP_STEPS, type SimStepStats } from "./LocalSimHost";
import type { NetSession } from "../net/session";
import { ServerClock } from "../net/serverClock";
import { SnapshotRing, type SampledPose } from "../net/snapshots";
import { EventQueue } from "../net/eventQueue";
import { HordeBuffer, HordeSample } from "../net/hordeBuffer";
import { HordeDecoder } from "../net/hordeDecoder";
import { mirrorZombies } from "../net/mirrorZombies";
import { Predictor } from "../net/prediction";
import { AdaptiveDelay } from "../net/adaptiveDelay";
import { RENDER_DELAY_MIN_MS } from "../net/netConfig";
import { LocalFireClock } from "../net/localFire";
import { CosmeticProjectiles } from "../net/cosmeticProjectiles";
import { REVERSED_HIT_SLACK_MS, ReversedHits } from "../debug/reversedHits";

/** Starting interpolation delay in ticks (100 ms); `AdaptiveDelay` then moves it within 100–150 ms. */
export const RENDER_DELAY_TICKS = RENDER_DELAY_MIN_MS / (TICK_DT_S * 1000);

/** Netcode numbers for the 2.10 overlay (Story 2.6), updated every frame (one object, reused). */
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

/** Projectiles leave just outside the shooter's body (the server's `firing.ts` muzzle offset). */
const MUZZLE_OFFSET_M = 0.1;
/** Local cosmetic events (own shots and swings) handed out per frame at most; a ring of reused objects. */
const LOCAL_EVENT_RING = 8;
/** Own weapon-state events held for the next drain (arrive between frames). */
const ARRIVAL_EVENTS_MAX = 64;

type FiredEvent = Extract<SimEvent, { type: "weapon.fired" }>;
type SwungEvent = Extract<SimEvent, { type: "melee.swung" }>;

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
  /**
   * Story 2.7: whether the reversed-hit counter runs (dev builds, or the perf overlay on in a
   * release build). Default: always.
   */
  measureHits?: () => boolean;
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
export class NetSimHost implements SimHost {
  readonly world: World;
  readonly localPlayerId: string;
  readonly online = true;
  /** Positions are written already interpolated: alpha never matters. */
  readonly alpha = 0;
  readonly stats: SimStepStats = { lastUpdateSteps: 0, stepMs: new Float64Array(MAX_CATCHUP_STEPS), totalSteps: 0 };
  /** The local survivor's prediction (Story 2.6); it keeps the sent inputs for replay. */
  readonly predictor: Predictor;
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
  private readonly localSlot: number;
  /** Client-side spread for my cosmetic shots (the server rolls its own: never the same). */
  private readonly spreadRng = createRng(0x2e7);
  private readonly aimDir = { x: 1, y: 0 };
  private readonly localFired: FiredEvent[] = [];
  private readonly localSwung: SwungEvent[] = [];
  private localNext = 0;
  private readonly immediate: SimEvent[] = [];
  private readonly arrival: SimEvent[] = [];
  private readonly delay = new AdaptiveDelay();
  private loggedWave = 0;

  private readonly session: NetSession;
  private readonly now: () => number;
  private readonly clock = new ServerClock();
  private readonly snapshots = new SnapshotRing();
  private readonly queue = new EventQueue();
  private readonly ctx: NetEventContext;
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
  private seq = 0;
  private readonly sendBuf: MutableInput = { ...NEUTRAL_INPUT };
  private drained: SimEvent[] = [];
  private renderTickNow = Number.NaN;
  private disposed = false;
  private readonly pose: SampledPose = { x: 0, y: 0, heading: 0 };
  /** Story 2.9: reused `playerInfo` answer. */
  private readonly info: { slot: number; name: string } = { slot: 0, name: "" };
  private latest: RunStateView | null = null;
  private readonly dropMissing = (_p: PlayerState, id: string): void => {
    if (!this.latest?.players.has(id)) removePlayer(this.world, id);
  };
  private readonly addMissing = (p: PlayerStateView, id: string): void => {
    if (!this.world.players.has(id)) addPlayer(this.world, id, p.x, p.y);
  };
  private readonly writePlayer = (p: PlayerState): void => this.applyPlayer(p);
  // Story 2.8: downed fields from state; the reviver is found from the mirrored positions.
  private readonly reviveTicksTotal: number;
  private readonly writeReviver = (p: PlayerState): void => {
    p.reviverId = p.status === "downed" && p.reviveTicks > 0 ? (findReviver(this.world, p)?.id ?? null) : null;
  };

  constructor(opts: NetSimHostOptions) {
    this.session = opts.session;
    this.localPlayerId = opts.session.playerId;
    this.now = opts.now ?? (() => performance.now());
    this.world = createWorld({ balance: opts.balance, seed: 0, systems: NO_SYSTEMS });
    this.ctx = { balance: opts.balance };
    this.predictor = new Predictor(opts.balance, this.world.map, this.localPlayerId);
    this.measureHits = opts.measureHits ?? (() => true);
    this.localSlot = playerSlotOf(this.localPlayerId);
    this.fireClock = new LocalFireClock(opts.balance);
    this.cosmetics = new CosmeticProjectiles(this.world, this.localPlayerId, (netId) => this.onApparentHit(netId));
    for (let i = 0; i < LOCAL_EVENT_RING; i++) {
      const id = this.localPlayerId;
      this.localFired.push({ type: "weapon.fired", playerId: id, weapon: "", x: 0, y: 0, dirX: 1, dirY: 0 });
      this.localSwung.push({ type: "melee.swung", playerId: id, weapon: "", x: 0, y: 0, dirX: 1, dirY: 0, arcDeg: 0, rangeM: 0 });
    }
    this.reviveTicksTotal = ticksFor(opts.balance.player.reviveS);
    const room = opts.session.room;
    // Batches that came while the scene was not built yet (hidden tab at Start) arrive first.
    this.offs.push(opts.session.onEvents((m) => this.receiveEvents(m)));
    this.offs.push(opts.session.onHorde((b) => this.hordeStats.receive(b)));
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

  /** The (fractional) tick others are drawn at: server estimate − adaptive delay. NaN before the first snapshot. */
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
    this.renderTickNow = this.clock.ready ? this.delay.renderTick(this.clock.estimateTick(t0)) : Number.NaN;
    // Story 2.7: the horde first, so my shots this frame assist toward and stop at what is drawn.
    this.applyHorde(this.renderTickNow);
    this.cosmetics.update(frameDtS);
    if (frameDtS > 0) this.stepInputs(frameDtS);
    this.predictor.frame(frameDtS);
    this.applyState();
    if (this.measureHits()) this.hits.update(t0);
    this.updateNetStats();
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
    for (let i = 0; i < this.immediate.length; i++) out.push(this.immediate[i] as SimEvent);
    this.immediate.length = 0;
    for (let i = 0; i < this.arrival.length; i++) out.push(this.arrival[i] as SimEvent);
    this.arrival.length = 0;
    const from = out.length;
    if (!Number.isNaN(this.renderTickNow)) this.queue.drain(this.renderTickNow, out);
    // Others' shots fly from their server muzzle, in step with the interpolated shooter.
    for (let i = from; i < out.length; i++) {
      const e = out[i] as SimEvent;
      if (e.type === "weapon.fired") this.cosmetics.spawn(e.playerId, e.weapon, e.x, e.y, e.dirX, e.dirY);
    }
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
    this.horde.clear();
    this.cosmetics.clear();
    this.drained.length = 0;
    this.immediate.length = 0;
    this.arrival.length = 0;
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
      this.predictor.applyLocal(buf); // Story 2.6: my survivor moves now, not a round trip later
      // Story 2.7: my weapon fires now too (cosmetic; the server fires its own shot from this input).
      if (this.fireClock.step(buf, room.state?.players?.get(this.localPlayerId))) this.localAttack(buf.isMouse);
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
    this.world.tick = state.tick;
    this.world.waves.number = state.wave;
    this.world.waves.remaining = state.remaining;
    if (import.meta.env.DEV && import.meta.env.MODE !== "test" && state.wave !== this.loggedWave) {
      this.loggedWave = state.wave; // dev builds: once per wave, until the 2.10 overlay shows them
      console.info("net_stats", { wave: state.wave, ...this.netStats });
    }
  }

  /**
   * My local attack on this step (Story 2.7): from the predicted position (where the server will
   * fire from for this input), an immediate event for the muzzle flash or swing and sound, and for
   * guns a cosmetic projectile. Touch aim bends with `assistAim` on the mirror's drawn zombies;
   * spread is rolled locally.
   */
  private localAttack(isMouse: boolean): void {
    if (this.immediate.length >= LOCAL_EVENT_RING) return; // not drained for a while: skip the cosmetics
    const a = this.fireClock.attack;
    const balance = this.world.balance;
    const stats = balance.weapons[a.weapon];
    if (!stats) return;
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
    const dir = this.aimDir;
    dir.x = a.dirX;
    dir.y = a.dirY;
    if (!isMouse) {
      this.cosmetics.ensureGrid();
      assistAim(this.world, mx, my, a.dirX, a.dirY, stats.rangeM, dir);
    }
    if (stats.spreadDeg > 0) {
      const half = (stats.spreadDeg / 2) * (Math.PI / 180);
      rotate(dir.x, dir.y, this.spreadRng.range(-half, half), dir);
    }
    const e = this.localFired[k] as FiredEvent;
    e.weapon = a.weapon;
    e.x = mx;
    e.y = my;
    e.dirX = dir.x;
    e.dirY = dir.y;
    this.immediate.push(e);
    this.cosmetics.spawn(this.localPlayerId, a.weapon, mx, my, dir.x, dir.y);
  }

  /** Expectation window of an apparent hit: RTT + render delay + slack (Story 2.7). */
  private hitWindowMs(): number {
    return this.session.rttMs + this.delay.delayMs + REVERSED_HIT_SLACK_MS;
  }

  private onApparentHit(netId: number): void {
    if (this.measureHits()) this.hits.apparent(netId, this.now(), this.hitWindowMs());
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
    p.status = s.status;
    this.applyDowned(p, s);
    const lo = p.loadout;
    lo.active = s.active === 1 ? 1 : 0;
    lo.swapTicks = s.swapTicks;
    lo.slots[0] = this.syncSlot(lo.slots[0], s.weapon0, s.ammo0, s.reloadTicks0) ?? lo.slots[0];
    lo.slots[1] = this.syncSlot(lo.slots[1], s.weapon1, s.ammo1, s.reloadTicks1);
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
    p.reviveTicks = Math.round((s.reviveProgress / 255) * this.reviveTicksTotal);
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
    const me = state.players.get(this.localPlayerId);
    if (me) this.predictor.reconcile(me.ackSeq, me.x, me.y, me.status);
  }

  private receiveEvents(m: SimEventsFlushed): void {
    if (this.disposed || !m || !Array.isArray(m.events) || typeof m.tick !== "number") return;
    const measure = this.measureHits();
    const now = measure ? this.now() : 0;
    for (const t of m.events) {
      if (!Array.isArray(t)) continue;
      const kind = t[0];
      // Story 2.7, on arrival: my own server hits confirm my apparent ones (full net id, index 1).
      if (measure && kind === NET_EVENT_KIND.ZOMBIE_HIT && typeof t[1] === "number" && this.isMine(t[7])) {
        this.hits.serverHit(t[1], now, this.hitWindowMs());
      } else if (measure && kind === NET_EVENT_KIND.ZOMBIE_KILLED && typeof t[1] === "number") {
        this.hits.serverKilled(t[1]);
      }
      // My own shot and swing already played locally.
      if ((kind === NET_EVENT_KIND.WEAPON_FIRED || kind === NET_EVENT_KIND.MELEE_SWUNG) && this.isMine(t[1])) continue;
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
