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
 */
import {
  MUZZLE_OFFSET_M,
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  TICK_DT_S,
  ZOMBIE_STATE,
  assistAim,
  boxBlocked,
  createRng,
  distanceToBox,
  createWorld,
  encodeNetEvent,
  loadBalance,
  NO_SYSTEMS,
  PLACEHOLDER_MAP,
  packTypeState,
  rotateBySeqSpread,
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
  zombieTypeIndex,
} from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";
import { LocalFireClock, type FireGateView } from "../../apps/client/src/net/localFire";
import { CosmeticProjectiles } from "../../apps/client/src/net/cosmeticProjectiles";
import { EARLY_HIT_SLACK_MS, ReversedHits, REVERSED_HIT_SLACK_MS } from "../../apps/client/src/debug/reversedHits";
import { ServerClock } from "../../apps/client/src/net/serverClock";
import { AdaptiveDelay } from "../../apps/client/src/net/adaptiveDelay";
import { HordeSample } from "../../apps/client/src/net/hordeBuffer";
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
const WALKER_TYPE_STATE = packTypeState(0, ZOMBIE_STATE.CHASE);

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
}

/** Ordered FIFO with `dueMs`. */
class Link<T> {
  private readonly items: { due: number; v: T }[] = [];
  private lastDue = -Infinity;
  constructor(
    private readonly oneWayMs: number,
    private readonly jitterHalfMs: number,
    private readonly rng: { range(a: number, b: number): number },
  ) {}
  send(now: number, v: T, notBefore = -Infinity): void {
    const due = Math.max(this.lastDue, notBefore, now + this.oneWayMs + this.rng.range(-this.jitterHalfMs, this.jitterHalfMs));
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
  me: FireGateView & { x: number; y: number };
  zombies: { netId: number; x: number; y: number }[];
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
  const typeState = o.zombieType ? packTypeState(zombieTypeIndex(o.zombieType), ZOMBIE_STATE.CHASE) : WALKER_TYPE_STATE;
  for (let i = 0; i < walkers; i++) spawnRingWalker();

  const up = new Link<PlayerInput>(o.oneWayMs, o.jitterHalfMs, rng);
  const down = new Link<Down>(o.oneWayMs, o.jitterHalfMs, rng);

  // Client.
  const mirror = createWorld({ balance, seed: 0, map: clientMap, systems: NO_SYSTEMS });
  const predictor = new Predictor(balance, clientMap, ID);
  const clock = new LocalFireClock(balance);
  const hits = new ReversedHits();
  const serverClock = new ServerClock();
  const delay = new AdaptiveDelay();
  const sample = new HordeSample();
  const snaps: Down[] = [];
  const kills: { tick: number; netId: number }[] = [];
  const hidden = new Set<number>();
  let latest: Down | null = null;
  let viewTick = -1;
  const viewOffsets: number[] = [];
  const viewTickBySeq = new Map<number, number>();
  let nowMs = 0;
  const windowMs = () => 2 * o.oneWayMs + delay.delayMs + REVERSED_HIT_SLACK_MS;
  const cosmetics = new CosmeticProjectiles(mirror, ID, (netId) => hits.apparent(netId, nowMs, windowMs()));
  const dir = { x: 1, y: 0 };
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

  const sampleHorde = (rt: number): void => {
    let a: Down | null = null;
    let b: Down | null = null;
    for (const s of snaps) {
      if (s.tick <= rt) a = s;
      else {
        b = s;
        break;
      }
    }
    while (kills.length > 0 && (kills[0] as { tick: number }).tick <= rt) hidden.add((kills.shift() as { netId: number }).netId);
    sample.count = 0;
    const base = a ?? b;
    if (!base) return;
    const f = a && b ? (rt - a.tick) / (b.tick - a.tick) : 0;
    for (const zb of (b ?? base).zombies) {
      if (hidden.has(zb.netId)) continue;
      const za = a?.zombies.find((q) => q.netId === zb.netId);
      const k = sample.count++;
      sample.netId[k] = zb.netId;
      sample.x[k] = za ? za.x + (zb.x - za.x) * f : zb.x;
      sample.y[k] = za ? za.y + (zb.y - za.y) * f : zb.y;
      sample.typeState[k] = typeState;
      sample.heading[k] = 0;
    }
    while (snaps.length > 2 && (snaps[1] as Down).tick <= rt) snaps.shift();
  };

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
          // Combat ran at world.tick − 1 (the tick is counted at the end of the step).
          const vt = viewTickBySeq.get(ctrl.ackSeq(ID)) ?? -1;
          if (vt >= 0) viewOffsets.push(ctrl.world.tick - 1 - vt / VIEW_TICK_SCALE);
        }
        if (e.type === "zombie.killed") killCount++;
      }
      while (z.aliveCount < walkers) spawnRingWalker();
      const [s0] = sp.loadout.slots;
      const zombies: Down["zombies"] = [];
      for (let i = 0; i < z.aliveCount; i++) {
        const id = z.aliveIds[i] as number;
        zombies.push({ netId: ctx.zombieNetId(id), x: Math.fround(z.x[id] as number), y: Math.fround(z.y[id] as number) });
      }
      down.send(t, {
        tick: ctrl.world.tick,
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
        zombies,
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
      snaps.push(d);
      serverClock.sample(t, d.tick);
      delay.snapshot(t, d.tick);
      predictor.reconcile(d.me.ackSeq, d.me.x, d.me.y, d.me.status);
      for (const e of d.events) {
        if (e[0] === NET_EVENT_KIND.ZOMBIE_HIT && e[7] === 0) hits.serverHit(e[1] as number, t, o.oneWayMs + delay.delayMs + EARLY_HIT_SLACK_MS);
        if (e[0] === NET_EVENT_KIND.ZOMBIE_KILLED) {
          hits.serverKilled(e[1] as number);
          kills.push({ tick: d.tick, netId: e[1] as number });
        }
      }
    }
    // The frame, in NetSimHost.update order.
    delay.frame(dtMs / 1000);
    if (serverClock.ready) {
      const rt = delay.renderTick(serverClock.estimateTick(t));
      viewTick = viewTickOf(rt);
      sampleHorde(rt);
      mirrorZombies(sample, mirror.zombies);
      cosmetics.zombiesMoved();
    }
    cosmetics.update(dtMs / 1000);
    accMs += dtMs;
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
        assistAim(mirror, mx, my, a.dirX, a.dirY, stats.rangeM, dir);
        if (stats.spreadDeg > 0) rotateBySeqSpread(dir.x, dir.y, ID, input.seq, stats.spreadDeg, dir); // 2.12: the shared helper, as NetSimHost
        cosmetics.spawn(ID, a.weapon, mx, my, dir.x, dir.y);
      }
      accMs -= TICK_MS;
      steps++;
    }
    predictor.frame(dtMs / 1000);
    hits.update(t);
  }
  return { ...hits.counts, serverHitsByMe, kills: killCount, shots, localShotSeqs, serverShotSeqs, viewOffsets, drops: ctrl.drops(ID), serverCoverStops, clientCoverStops: cosmetics.coverStops };
}

