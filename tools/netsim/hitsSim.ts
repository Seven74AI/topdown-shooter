/**
 * Network harness for server-confirmed hits (Story 2.7, AC 4; an early read on NFR5 before the
 * Story 2.10 phone test). The real server `RunController` and the real client parts (Predictor,
 * LocalFireClock, CosmeticProjectiles on a mirror World, aim assist on the mirror, ReversedHits,
 * ServerClock, AdaptiveDelay, mirrorZombies), joined by a simulated network in virtual ms time.
 *
 * - 20 Walkers walk at the player (god mode); each kill is replaced by a new Walker on a
 *   ring 9–11 m out, so 20 are always coming.
 * - Standing (Walkers end up crowding the player) or kiting (walking a 10 m circle at full speed).
 * - The client draws the horde at the render tick (server estimate − adaptive delay), lerped
 *   between per-tick server snapshots; a kill hides its zombie once the render tick reaches it.
 * - Every 50 ms step the client aims (touch, so the assist runs on both sides) at the nearest
 *   drawn zombie and holds fire while one is within range.
 * - One-way delay `oneWayMs ± jitterHalfMs`, ordered; the server's shot advance = half the RTT.
 *
 * It counts my apparent hits (my cosmetic bullet crossed a drawn zombie) and how many the server
 * did not confirm in time (reversed).
 *
 * Story 8.8: `loss` (TCP loss as head-of-line stalls both ways). Story 8.9: `latencyStep` (a lasting latency rise: a cell handover),
 * the real clock / delay / step pacing (brief 20), and the smoothness counters in `Result.smooth`.
 */
import {
  HordeStreamDecoder,
  MUZZLE_OFFSET_M,
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  TICK_DT_S,
  assistAim,
  boxBlocked,
  createRng,
  distanceToBox,
  createWorld,
  encodeNetEvent,
  loadBalance,
  NO_SYSTEMS,
  PLACEHOLDER_MAP,
  pelletDirection,
  rotateBySeqSpread,
  seqPelletRoll,
  VIEW_TICK_SCALE,
  setLoadout,
  spawnZombie,
  zombieNetId,
  type Balance,
  type DistrictMap,
  type NetEvent,
  type PlayerInput,
  type WeaponId,
  type ZombieTypeId,
} from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";
import { LocalFireClock, type FireGateView } from "../../apps/client/src/net/localFire";
import { CosmeticProjectiles } from "../../apps/client/src/net/cosmeticProjectiles";
import { EARLY_HIT_SLACK_MS, ReversedHits, REVERSED_HIT_SLACK_MS } from "../../apps/client/src/debug/reversedHits";
import { ServerClock } from "../../apps/client/src/net/serverClock";
import { AdaptiveDelay } from "../../apps/client/src/net/adaptiveDelay";
import { HordeBuffer, HordeSample } from "../../apps/client/src/net/hordeBuffer";
import { HordeDecoder } from "../../apps/client/src/net/hordeDecoder";
import { HordeEncoder, newHordeStats } from "../../apps/server/src/net/hordeEncoder";
import { StepPacing } from "../../apps/client/src/net/stepPacing";
import { mirrorZombies } from "../../apps/client/src/net/mirrorZombies";
import { viewTickOf } from "../../apps/client/src/net/viewTick";

const DEFAULT_BALANCE = loadBalance();
const TICK_MS = TICK_DT_S * 1000;
const FRAME_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;
const ID = "p0";
const WALKERS = 20;
const KITE_RADIUS_M = 10;
const SPAWN_MARGIN_M = 1;

export interface Options {
  seconds: number;
  oneWayMs: number;
  jitterHalfMs: number;
  seed: number;
  weapon: WeaponId;
  /** The player kites: walks a 10 m circle around the map centre at full speed (one lap ≈ 14 s). */
  kite: boolean;
  /** Client → server inputs sent during [fromMs, toMs) are held and arrive in one burst at toMs + one-way. */
  stall?: { fromMs: number; toMs: number };
  /** Story 2.10: Walkers kept coming (default 20; 150 = the net150 crowd). */
  walkers?: number;
  /** Story 3.8: the type of the zombies kept coming (default Walker; "runner": 4 m/s, flanking). */
  zombieType?: ZombieTypeId;
  /** Story 2.12: the server's lag compensation (default on); false = Story 2.7's shot advance only (control). */
  rewind?: boolean;
  /** Story 2.12: another balance (e.g. a weapon without spread, to separate spread from timing). */
  balance?: Balance;
  /** Story 4.2: the server's map (default the open street) and the client's (mirror + Predictor; default the same). */
  map?: DistrictMap;
  clientMap?: DistrictMap;
  /** Story 4.2: where the survivor stands (standing runs; default the team start). */
  start?: { x: number; y: number };
  /**
   * Story 8.8 (network audit §3.5): TCP loss as ordered head-of-line stalls, both directions. With
   * probability `pct` / 100 per message, that message (and, the link being ordered, everything
   * behind it) waits an extra `stallMs` (a lost segment waiting for its retransmit). Never a
   * reorder, never a lost message. Absent = no extra rng draw (the clean line is bit for bit today's).
   */
  loss?: { pct: number; stallMs: number };
  /** Story 8.9: from `atMs` on, both directions take `addMs` longer for good (a cell handover; ordered, so nothing overtakes). */
  latencyStep?: { atMs: number; addMs: number };
  /** Story 8.9: the client follows the server's queue depth (default true; false = a modified client that never slows). */
  pacing?: boolean;
  /** Story 8.9 (beat the rule 4): a fixed step rate instead of the pacing rule (e.g. 0.5 = a client slowing on purpose). */
  stepRate?: number;
  /**
   * Story 8.10: the near radius of the real horde stream (default HORDE_NEAR_M; Infinity = every
   * zombie at 20 Hz, the control run that isolates the 10 Hz far rule from the harness switch).
   */
  hordeNearM?: number;
}

/** Story 8.9: smoothness counters (brief 13 before/after). */
export interface Smooth {
  /** Episodes of the render tick past the newest snapshot that arrived (others held still), after the first 2 s. */
  freezes: number;
  /** Frames inside a freeze. */
  freezeFrames: number;
  /** Frames where the render tick / the server-tick estimate went down. */
  renderBackSteps: number;
  estimateBackSteps: number;
  /** Render delay (estimate − render tick, ms) per frame after the first 2 s: p50 / p95 / max. */
  delayP50: number;
  delayP95: number;
  delayMax: number;
  /** Render clock speed per frame (render ticks per real tick): min / max after the first 2 s. */
  rateMin: number;
  rateMax: number;
  /** Server ticks that found my queue empty after I had started sending (the survivor held still). */
  starvedTicks: number;
  /** Predicted (local) shots on seqs the server applied without firing or skipped: `localOnly`, and all local shots. */
  neverFired: number;
  localShots: number;
  /** Frames my steps ran at the slowed rate. */
  slowFrames: number;
  frames: number;
  /** Times `inputQueued` changed on the server (each change is ~2 B in the next patch: bandwidth). */
  queuedChanges: number;
}

export interface Result {
  /** Story 2.12: per server shot, the view offset its input asked for (server tick − viewTick, ticks; unclamped). */
  viewOffsets: number[];
  /** Seqs on which the client's fire clock shot, and on which the server's weapon fired. */
  localShotSeqs: number[];
  serverShotSeqs: number[];
  drops: { overflow: number; stale: number; drained: number; jumped: number; resyncs: number; rate: number };
  apparentHits: number;
  confirmed: number;
  reversed: number;
  serverHitsByMe: number;
  kills: number;
  shots: number;
  /** Story 4.2: shots that ended on a shot blocker (car, bus, map box): the server's, and my cosmetic ones. */
  serverCoverStops: number;
  clientCoverStops: number;
  /**
   * Story 5.3 (F6): pellet-gun shots fired on both sides (same seq), and how many of them had any
   * pellet whose cosmetic direction differs from the server's by more than `FAN_EPS_RAD`. Both
   * fans come from the same `pelletDirection` + `seqPelletRoll`, so this measures the centre aim
   * (aim assist on the mirror vs the server's rewound view) and the seq the server's event carried.
   */
  fanShots: number;
  fanMismatches: number;
  /** The largest pellet direction difference seen (radians). */
  fanMaxDiffRad: number;
  /** Story 8.8: stalls injected by `Options.loss`, per direction (liveness). */
  stalls: { up: number; down: number };
  /** Story 8.9. */
  smooth: Smooth;
  /** Story 8.10: the real horde stream (server encoder → client stream decoder → HordeBuffer). */
  horde: { bytes: number; frames: number; keyframes: number; decodeErrors: number; decoded: number };
}

/** Story 8.9: zeroed smoothness counters. */
export const emptySmooth = (): Smooth => ({ freezes: 0, freezeFrames: 0, renderBackSteps: 0, estimateBackSteps: 0, delayP50: 0, delayP95: 0, delayMax: 0, rateMin: 0, rateMax: 0, starvedTicks: 0, neverFired: 0, localShots: 0, slowFrames: 0, frames: 0, queuedChanges: 0 });

/** Story 5.3: two pellet directions this close (radians) are the same (Float32 noise). */
export const FAN_EPS_RAD = 1e-4;

/** Ordered FIFO with `dueMs`. Loss: a held message and everything behind it wait (TCP head-of-line). */
class Link<T> {
  private readonly items: { due: number; v: T }[] = [];
  private lastDue = -Infinity;
  /** Story 8.8: stalls injected on this link. */
  stalls = 0;
  constructor(
    private readonly oneWayMs: number,
    private readonly jitterHalfMs: number,
    private readonly rng: { range(a: number, b: number): number },
    private readonly loss?: { pct: number; stallMs: number },
    private readonly latencyStep?: { atMs: number; addMs: number },
  ) {}
  send(now: number, v: T, notBefore = -Infinity): void {
    const stall = this.loss && this.rng.range(0, 100) < this.loss.pct ? this.loss.stallMs : 0;
    if (stall > 0) this.stalls++;
    const step = this.latencyStep && now >= this.latencyStep.atMs ? this.latencyStep.addMs : 0; // Story 8.9
    const due = Math.max(this.lastDue, notBefore, now + stall + step + this.oneWayMs + this.rng.range(-this.jitterHalfMs, this.jitterHalfMs));
    this.lastDue = due;
    this.items.push({ due, v });
  }
  take(now: number, out: T[]): void {
    out.length = 0;
    while (this.items.length > 0 && (this.items[0] as { due: number }).due <= now) out.push((this.items.shift() as { v: T }).v);
  }
}

interface Down {
  tick: number;
  /** Story 8.9: `PlayerState.inputQueued` (my inputs queued when this tick started). */
  queued: number;
  me: FireGateView & { x: number; y: number };
  /** Story 8.10: the real horde frame of this tick (key or delta, view + margin + rushers). */
  horde: Uint8Array;
  events: NetEvent[];
}

export function simulate(o: Options): Result {
  const balance = o.balance ?? DEFAULT_BALANCE;
  const rng = createRng(o.seed);
  const map = o.map ?? PLACEHOLDER_MAP; // the open street: kiting circles
  const clientMap = o.clientMap ?? map;
  const ctrl = new RunController({ balance, seed: o.seed, players: [{ playerId: ID, slot: 0 }], systems: { waves: () => {} }, map, lagCompensation: o.rewind !== false });
  const sp = ctrl.world.players.get(ID);
  if (!sp) throw new Error("no player");
  setLoadout(balance, sp.loadout, [o.weapon, null]);
  const cx = ctrl.world.map.widthM / 2;
  const cy = ctrl.world.map.heightM / 2;
  if (o.kite) {
    sp.x = sp.prevX = cx + KITE_RADIUS_M;
    sp.y = sp.prevY = cy;
  } else if (o.start) {
    sp.x = sp.prevX = o.start.x;
    sp.y = sp.prevY = o.start.y;
  }
  ctrl.setRtt(ID, 2 * o.oneWayMs);
  const z = ctrl.world.zombies;
  const ctx = { balance, zombieNetId: (id: number) => zombieNetId(id, z.generation[id] ?? 0) };
  const spawnRadius = balance.zombies.types[o.zombieType ?? "walker"]?.radiusM ?? 0;
  const spawnRingWalker = () => {
    const { widthM, heightM } = ctrl.world.map;
    let x = 0;
    let y = 0;
    // Story 4.2: re-draw a spot inside a map box or cover (never on the open street: same draws as before).
    for (let tries = 0; tries < 50; tries++) {
      const a = rng.range(0, 2 * Math.PI);
      const d = rng.range(9, 11);
      x = Math.min(widthM - SPAWN_MARGIN_M, Math.max(SPAWN_MARGIN_M, sp.x + Math.cos(a) * d));
      y = Math.min(heightM - SPAWN_MARGIN_M, Math.max(SPAWN_MARGIN_M, sp.y + Math.sin(a) * d));
      if (!boxBlocked(ctrl.world, x, y, spawnRadius)) break;
    }
    spawnZombie(ctrl.world, o.zombieType ?? "walker", x, y);
  };
  const walkers = o.walkers ?? WALKERS;
  // Story 8.10 (brief 20): the real horde stream, as RunRoom sends it to this one client.
  const hordeEnc = new HordeEncoder(undefined, o.hordeNearM);
  const hordeStats = newHordeStats();
  let hordeOut = new Uint8Array(0);
  const hordeClient = { state: 1 /* ClientState.JOINED */, ref: { bufferedAmount: 0 }, sendBytes: (_t: number, b: Uint8Array) => void (hordeOut = b.slice()) };
  for (let i = 0; i < walkers; i++) spawnRingWalker();

  const up = new Link<PlayerInput>(o.oneWayMs, o.jitterHalfMs, rng, o.loss, o.latencyStep);
  const down = new Link<Down>(o.oneWayMs, o.jitterHalfMs, rng, o.loss, o.latencyStep);

  // Client.
  const mirror = createWorld({ balance, seed: 0, map: clientMap, systems: NO_SYSTEMS });
  const predictor = new Predictor(balance, clientMap, ID);
  const clock = new LocalFireClock(balance);
  const hits = new ReversedHits();
  const serverClock = new ServerClock();
  const delay = new AdaptiveDelay();
  const pacing = new StepPacing();
  const sample = new HordeSample();
  const hordeBuffer = new HordeBuffer();
  const hordeStream = new HordeStreamDecoder();
  const hordeSink = new HordeDecoder(hordeBuffer, hordeStream);
  // Story 8.9: smoothness counters.
  const sm = emptySmooth();
  sm.rateMin = Infinity;
  const delays: number[] = [];
  let frozen = false;
  let lastQueued = 0;
  let prevRt = Number.NaN;
  let prevEst = Number.NaN;
  let latest: Down | null = null;
  let viewTick = -1;
  const viewOffsets: number[] = [];
  const viewTickBySeq = new Map<number, number>();
  let nowMs = 0;
  const windowMs = () => 2 * o.oneWayMs + delay.delayMs + REVERSED_HIT_SLACK_MS;
  const cosmetics = new CosmeticProjectiles(mirror, ID, (netId) => hits.apparent(netId, nowMs, windowMs()));
  const dir = { x: 1, y: 0 };
  const aimShooter = { x: 0, y: 0, gear: 0 }; // Story 6.4: the aim-assist fog filter's shooter
  let serverHitsByMe = 0;
  let killCount = 0;
  let shots = 0;
  const localShotSeqs: number[] = [];
  const serverShotSeqs: number[] = [];
  // Story 4.2: every slot's position before a tick; a slot that is free after it, moved, and lies on a
  // blocker's face was stopped by cover this tick (also a shot fired and stopped in the same tick).
  const pool = ctrl.world.projectiles;
  const xBefore = new Float32Array(pool.capacity);
  const yBefore = new Float32Array(pool.capacity);
  let serverCoverStops = 0;
  // Story 5.3: each pellet-gun shot's centre aim by 16-bit seq, server side and client side.
  const serverFan = new Map<number, { x: number; y: number; seq: number }>();
  const clientFan = new Map<number, { x: number; y: number }>();

  /** Story 8.10: the real client path (HordeBuffer.sample: own-refresh lerp, kills at the render tick). */
  const sampleHorde = (rt: number): void => hordeBuffer.sample(rt, sample);

  const phaseMs = Math.floor(rng.range(0, TICK_MS));
  const endMs = o.seconds * 1000;
  const arrivedInputs: PlayerInput[] = [];
  const arrivedDown: Down[] = [];
  let nextServerMs = phaseMs;
  let nextFrameMs = 0;
  let lastFrameMs = 0;
  let accMs = 0;
  let seq = 0;

  for (let t = 0; t <= endMs; t++) {
    nowMs = t;
    if (t >= nextServerMs) {
      nextServerMs += TICK_MS;
      up.take(t, arrivedInputs);
      for (const input of arrivedInputs) ctrl.queueInput(ID, input);
      if (seq > 0 && ctrl.ackSeq(ID) > 0 && ctrl.queued(ID) === 0) sm.starvedTicks++;
      sp.hp = 1e9;
      xBefore.set(pool.x);
      yBefore.set(pool.y);
      const evs = ctrl.tick();
      for (let id = 0; id < pool.capacity; id++) {
        if ((pool.alivePos[id] as number) >= 0) continue;
        const px = pool.x[id] as number;
        const py = pool.y[id] as number;
        if (px === xBefore[id] && py === yBefore[id]) continue; // untouched this tick
        if (ctrl.world.obstacles.shotBlockers.some((b) => distanceToBox(px, py, b.minX, b.minY, b.maxX, b.maxY) <= 1e-4)) serverCoverStops++;
      }
      const events: NetEvent[] = [];
      for (const e of evs) {
        const enc = encodeNetEvent(e, ctx);
        if (enc) events.push(enc);
        if (e.type === "zombie.hit" && e.sourceId === ID) serverHitsByMe++;
        if (e.type === "weapon.fired" && e.playerId === ID) {
          serverShotSeqs.push(ctrl.ackSeq(ID));
          if (e.seq !== undefined) serverFan.set(ctrl.ackSeq(ID) & 0xffff, { x: e.dirX, y: e.dirY, seq: e.seq });
          // Combat ran at world.tick − 1 (the tick is counted at the end of the step).
          const vt = viewTickBySeq.get(ctrl.ackSeq(ID)) ?? -1;
          if (vt >= 0) viewOffsets.push(ctrl.world.tick - 1 - vt / VIEW_TICK_SCALE);
        }
        if (e.type === "zombie.killed") killCount++;
      }
      while (z.aliveCount < walkers) spawnRingWalker();
      const [s0] = sp.loadout.slots;
      hordeEnc.prepare(ctrl.world);
      hordeEnc.send(ctrl.world, hordeClient, hordeStats, sp.x, sp.y);
      if (ctrl.queuedAtTick(ID) !== lastQueued) {
        lastQueued = ctrl.queuedAtTick(ID);
        sm.queuedChanges++;
      }
      down.send(t, {
        tick: ctrl.world.tick,
        queued: ctrl.queuedAtTick(ID),
        me: {
          x: Math.fround(sp.x),
          y: Math.fround(sp.y),
          status: sp.status,
          active: sp.loadout.active,
          swapTicks: sp.loadout.swapTicks,
          ackSeq: ctrl.ackSeq(ID),
          weapon0: s0.weapon,
          weapon1: "",
          ammo0: s0.ammo,
          ammo1: 0,
          reloadTicks0: s0.reloadTicks,
          reloadTicks1: 0,
        },
        horde: hordeOut,
        events,
      });
    }
    if (t < nextFrameMs) continue;
    nextFrameMs += FRAME_MS;
    const dtMs = t - lastFrameMs;
    lastFrameMs = t;
    // Arrivals (socket callbacks between frames).
    down.take(t, arrivedDown);
    for (const d of arrivedDown) {
      latest = d;
      hordeStream.decode(d.horde, hordeSink); // Story 8.10: in arrival order, like RunInbox
      // Story 8.9: one sample per arrival (patch and horde frame are one message here).
      serverClock.sample(t, d.tick);
      delay.sample(t, d.tick, serverClock.rawOffsetMs);
      if (o.pacing !== false) pacing.onPatch(d.queued);
      predictor.reconcile(d.me.ackSeq, d.me.x, d.me.y, d.me.status);
      for (const e of d.events) {
        if (e[0] === NET_EVENT_KIND.ZOMBIE_HIT && e[7] === 0) hits.serverHit(e[1] as number, t, o.oneWayMs + delay.delayMs + EARLY_HIT_SLACK_MS);
        if (e[0] === NET_EVENT_KIND.ZOMBIE_KILLED) {
          hits.serverKilled(e[1] as number);
          hordeBuffer.killAt(d.tick, e[1] as number);
        }
      }
    }
    // The frame, in NetSimHost.update order.
    if (serverClock.ready) {
      const est = serverClock.estimateTick(t);
      const rt = delay.advance(t, est, latest ? latest.tick : -1);
      if (t > 2000) {
        sm.frames++;
        if (rt < prevRt) sm.renderBackSteps++;
        if (est < prevEst) sm.estimateBackSteps++;
        const f = latest !== null && rt > latest.tick;
        if (f) sm.freezeFrames++;
        if (f && !frozen) sm.freezes++;
        frozen = f;
        delays.push(delay.delayMs);
        if (dtMs > 0 && !Number.isNaN(prevRt)) {
          const r = (rt - prevRt) / (dtMs / TICK_MS);
          sm.rateMin = Math.min(sm.rateMin, r);
          sm.rateMax = Math.max(sm.rateMax, r);
        }
      }
      prevRt = rt;
      prevEst = est;
      viewTick = viewTickOf(rt);
      sampleHorde(rt);
      mirrorZombies(sample, mirror.zombies);
      cosmetics.zombiesMoved();
    }
    cosmetics.update(dtMs / 1000);
    // Story 8.9 (D5): the same step pacing rule as NetSimHost.
    const stepRate = o.stepRate ?? pacing.frame();
    if (stepRate < 1 && t > 2000) sm.slowFrames++;
    accMs += dtMs * stepRate;
    let steps = 0;
    while (accMs >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
      // Aim at the nearest drawn zombie from my predicted position.
      const px = predictor.x;
      const py = predictor.y;
      const mz = mirror.zombies;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < mz.aliveCount; i++) {
        const id = mz.aliveIds[i] as number;
        const d = Math.hypot((mz.x[id] as number) - px, (mz.y[id] as number) - py);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      const stats = balance.weapons[o.weapon];
      const range = stats?.kind === "gun" ? stats.rangeM : 0;
      // Kiting: tangent of the circle through my position (counter-clockwise), with a pull back onto it.
      let moveX = 0;
      let moveY = 0;
      if (o.kite) {
        const rx = px - cx;
        const ry = py - cy;
        const r = Math.hypot(rx, ry) || 1;
        const pull = (KITE_RADIUS_M - r) / KITE_RADIUS_M;
        moveX = -ry / r + (rx / r) * pull;
        moveY = rx / r + (ry / r) * pull;
        const m = Math.hypot(moveX, moveY);
        moveX /= m;
        moveY /= m;
      }
      const input: PlayerInput = {
        ...NEUTRAL_INPUT,
        seq: ++seq,
        moveX,
        moveY,
        aimX: best >= 0 ? (mz.x[best] as number) - px : 1,
        aimY: best >= 0 ? (mz.y[best] as number) - py : 0,
        fire: best >= 0 && bestD < range + 0.5,
        isMouse: false,
        viewTick,
      };
      viewTickBySeq.set(input.seq, viewTick);
      const stalled = o.stall !== undefined && t >= o.stall.fromMs && t < o.stall.toMs;
      up.send(t, input, stalled && o.stall ? o.stall.toMs + o.oneWayMs : -Infinity);
      predictor.applyLocal(input);
      if (clock.step(input, latest?.me) && stats?.kind === "gun") {
        shots++;
        localShotSeqs.push(input.seq);
        const a = clock.attack;
        const off = balance.player.radiusM + MUZZLE_OFFSET_M;
        const mx = predictor.x + a.dirX * off;
        const my = predictor.y + a.dirY * off;
        cosmetics.ensureGrid();
        // Story 6.4 (F4): the same fog filter as NetSimHost (my predicted centre, my gear, own beam).
        aimShooter.x = predictor.x;
        aimShooter.y = predictor.y;
        aimShooter.gear = mirror.players.get(ID)?.gear ?? 0;
        assistAim(mirror, mx, my, a.dirX, a.dirY, stats.rangeM, dir, null, aimShooter);
        if (stats.spreadDeg > 0 && stats.pellets === 1) rotateBySeqSpread(dir.x, dir.y, ID, input.seq, stats.spreadDeg, dir); // 2.12: the shared helper, as NetSimHost
        cosmetics.spawn(ID, a.weapon, mx, my, dir.x, dir.y, input.seq & 0xffff); // Story 5.3: a pellet fan from the seq, as NetSimHost
        if (stats.pellets > 1) clientFan.set(input.seq & 0xffff, { x: dir.x, y: dir.y });
      }
      accMs -= TICK_MS;
      steps++;
    }
    predictor.frame(dtMs / 1000);
    hits.update(t);
  }
  // Story 5.3: rebuild both fans with the shared functions and compare pellet by pellet.
  let fanShots = 0;
  let fanMismatches = 0;
  let fanMaxDiffRad = 0;
  const wStats = balance.weapons[o.weapon];
  if (wStats?.kind === "gun" && wStats.pellets > 1) {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    for (const [seq16, sv] of serverFan) {
      const cl = clientFan.get(seq16);
      if (!cl) continue;
      fanShots++;
      let worst = 0;
      for (let k = 0; k < wStats.pellets; k++) {
        pelletDirection(sv.x, sv.y, wStats.spreadDeg, wStats.pellets, k, seqPelletRoll(ID, sv.seq, k), a);
        pelletDirection(cl.x, cl.y, wStats.spreadDeg, wStats.pellets, k, seqPelletRoll(ID, seq16, k), b);
        worst = Math.max(worst, Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)));
      }
      fanMaxDiffRad = Math.max(fanMaxDiffRad, worst);
      if (worst > FAN_EPS_RAD) fanMismatches++;
    }
  }
  delays.sort((a, b) => a - b);
  sm.delayP50 = delays[Math.floor(delays.length * 0.5)] ?? 0;
  sm.delayP95 = delays[Math.floor(delays.length * 0.95)] ?? 0;
  sm.delayMax = delays.at(-1) ?? 0;
  if (sm.rateMin === Infinity) sm.rateMin = 0;
  const serverSet = new Set(serverShotSeqs);
  const lastServerSeq = ctrl.ackSeq(ID);
  sm.localShots = localShotSeqs.length;
  sm.neverFired = localShotSeqs.filter((s) => !serverSet.has(s) && s <= lastServerSeq).length;
  return {
    ...hits.counts,
    smooth: sm,
    serverHitsByMe,
    kills: killCount,
    shots,
    localShotSeqs,
    serverShotSeqs,
    viewOffsets,
    drops: ctrl.drops(ID),
    serverCoverStops,
    clientCoverStops: cosmetics.coverStops,
    fanShots,
    fanMismatches,
    fanMaxDiffRad,
    stalls: { up: up.stalls, down: down.stalls },
    horde: { bytes: hordeStats.bytesSent, frames: hordeStats.framesSent, keyframes: hordeStats.keyframes, decodeErrors: hordeStream.decodeErrors + hordeStream.brokenChain, decoded: hordeSink.framesReceived },
  };
}

