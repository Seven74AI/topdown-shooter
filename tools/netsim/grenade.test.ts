/**
 * Story 5.5 netsim (AC 15; brief lines 5, 14; FR-E, FR-F): the Grenade Launcher under
 * `?lag=150&jitter=20` (75 ± 10 ms one way), in virtual time. The real server `RunController` on a
 * street with one car, the real wire (`encodeNetEvent` → `decodeNetEvent` with the flush tick), the
 * client's cosmetic `GrenadeFlights` and `Explosions`, joined by a simulated network. Each snapshot
 * carries my HP; each tick's events travel with it.
 *
 * - Every server explosion is shown once (never twice, never one the server didn't have), at the
 *   server's point; the client's HP equals the server's after self-hits (it never decides damage).
 * - Explosion events dropped on the way: no round stays on screen (the lost timer).
 * - A hidden tab asleep across a launch and a build start: no ghost round, no blast on waking.
 * - A late Game scene start (events only from mid-flight on): no crash, no stuck round.
 */
import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  PLACEHOLDER_MAP,
  TICK_DT_S,
  applyDecayStage,
  createRng,
  decodeNetEvent,
  encodeNetEvent,
  loadBalance,
  lobAimLength,
  setLoadout,
  skipWave,
  spawnZombie,
  startWave,
  type DistrictMap,
  type LauncherStats,
  type NetEvent,
  type PlayerInput,
  type SimEvent,
} from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { Explosions, GrenadeFlights } from "../../apps/client/src/render/grenadeFx";

const balance = loadBalance();
const GL = balance.weapons.grenade_launcher as LauncherStats;
const TICK_MS = TICK_DT_S * 1000;
const FRAME_MS = 1000 / 60;
const ID = "p0";
const lostS = balance.combat.explosion.fx.lostEventTicks * TICK_DT_S;
/** A car east of the shooter, its face 2 m from the body's centre: rounds aimed onto its roof land at that face (FR-B2), a self-hit at every shot. */
const MAP: DistrictMap = { ...PLACEHOLDER_MAP, name: "grenade-netsim", cover: [{ name: "car", kind: "car", minStage: 1, minX: 26.4, minY: 14, maxX: 28.4, maxY: 18 }] };

interface Snap {
  tick: number;
  hp: number;
  events: NetEvent[];
}

class Link<T> {
  private readonly items: { due: number; v: T }[] = [];
  private lastDue = -Infinity;
  constructor(
    private readonly oneWayMs: number,
    private readonly jitterHalfMs: number,
    private readonly rng: { range(a: number, b: number): number },
  ) {}
  send(now: number, v: T): void {
    const due = Math.max(this.lastDue, now + this.oneWayMs + this.rng.range(-this.jitterHalfMs, this.jitterHalfMs));
    this.lastDue = due;
    this.items.push({ due, v });
  }
  take(now: number, out: T[]): void {
    out.length = 0;
    while (this.items.length > 0 && (this.items[0] as { due: number }).due <= now) out.push((this.items.shift() as { v: T }).v);
  }
}

interface Opts {
  seconds: number;
  /** Aim west into the crowd (false: east onto the car's roof, self-hits). */
  crowd: boolean;
  /** Drop each explosion event with this probability on the way down. */
  dropExplosions?: number;
  sleep?: { from: number; to: number };
  buildAtMs?: number;
  /** The client starts reading events only from here (a late Game scene start). */
  lateStartMs?: number;
}

function simulate(seed: number, o: Opts) {
  const rng = createRng(seed);
  const ctrl = new RunController({ balance, seed, players: [{ playerId: ID, slot: 0 }, { playerId: "p1", slot: 1 }], systems: { waves: () => {} }, map: MAP });
  const world = ctrl.world;
  applyDecayStage(world, 1, 0);
  const me = world.players.get(ID);
  const mate = world.players.get("p1");
  if (!me || !mate) throw new Error("players");
  me.x = me.prevX = 24;
  me.y = me.prevY = 16;
  me.maxHp = me.hp = 1000;
  mate.x = mate.prevX = 17;
  mate.y = mate.prevY = 17;
  mate.maxHp = mate.hp = 1000;
  setLoadout(balance, me.loadout, ["grenade_launcher", null]);
  if (world.run.phase !== "wave") startWave(world);
  for (let k = 0; k < 30; k++) spawnZombie(world, "walker", 14 + (k % 6) * 0.6, 14 + Math.floor(k / 6) * 0.8, true);
  const ctx = { balance, zombieNetId: (id: number) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  const up = new Link<PlayerInput>(75, 10, rng);
  const down = new Link<Snap>(75, 10, rng);
  const flights = new GrenadeFlights(balance.combat.explosion.maxLiveRounds, ID, lostS);
  const blasts = new Explosions(balance.combat.explosion.fx.maxLiveExplosions, balance.combat.explosion.fx.maxScorchDecals);
  const inputs: PlayerInput[] = [];
  const snaps: Snap[] = [];
  const serverBlasts: { x: number; y: number }[] = [];
  const clientBlasts: { x: number; y: number }[] = [];
  let nextServerMs = Math.floor(rng.range(0, TICK_MS));
  let nextFrameMs = 0;
  let accMs = 0;
  let lastFrameMs = 0;
  let seq = 0;
  let clientHp = -1;
  let selfHits = 0;
  let built = false;
  let afterBuildServerBlasts = 0;
  let wake = { flights: -1, blasts: -1 };
  let maxFlights = 0;
  const dk = { balance, tick: 0 };
  for (let t = 0; t <= o.seconds * 1000; t++) {
    if (o.buildAtMs !== undefined && !built && t >= o.buildAtMs) {
      skipWave(world); // the wave ends → a build start (the server clears its rounds)
      built = true;
    }
    if (t >= nextServerMs) {
      nextServerMs += TICK_MS;
      up.take(t, inputs);
      for (const input of inputs) ctrl.queueInput(ID, input);
      const evs = ctrl.tick() as readonly SimEvent[];
      const tuples: NetEvent[] = [];
      for (const e of evs) {
        if (e.type === "explosion.happened") {
          serverBlasts.push({ x: e.x, y: e.y });
          if (built) afterBuildServerBlasts++;
        }
        if (e.type === "player.damaged" && e.playerId === ID) selfHits++;
        const tu = encodeNetEvent(e, ctx);
        if (!tu) continue;
        if (e.type === "explosion.happened" && o.dropExplosions && rng.next() < o.dropExplosions) continue;
        tuples.push(tu);
      }
      down.send(t, { tick: world.tick, hp: me.hp, events: tuples });
    }
    const asleep = o.sleep !== undefined && t >= o.sleep.from && t < o.sleep.to;
    if (t >= nextFrameMs && !asleep) {
      nextFrameMs += FRAME_MS;
      const dtMs = Math.min(t - lastFrameMs, 1000);
      lastFrameMs = t;
      const nowS = t / 1000;
      down.take(t, snaps);
      const reading = o.lateStartMs === undefined || t >= o.lateStartMs;
      for (const s of snaps) {
        clientHp = s.hp;
        if (!reading) continue;
        dk.tick = s.tick;
        for (const tu of s.events) {
          const e = decodeNetEvent(tu, dk);
          if (!e) continue;
          flights.handle(e, nowS);
          if (e.type === "explosion.happened") {
            blasts.start("fireball", e.x, e.y, e.radiusM, nowS);
            clientBlasts.push({ x: e.x, y: e.y });
          }
        }
      }
      flights.update(nowS);
      blasts.update(nowS);
      maxFlights = Math.max(maxFlights, flights.count);
      if (o.sleep && wake.flights < 0 && t >= o.sleep.to) wake = { flights: flights.count, blasts: clientBlasts.length };
      accMs += dtMs;
      while (accMs >= TICK_MS) {
        accMs -= TICK_MS;
        seq++;
        const ax = o.crowd ? -1 : 1;
        up.send(t, { ...NEUTRAL_INPUT, seq, aimX: ax * lobAimLength(GL, o.crowd ? 6 : 3), aimY: 0, fire: !built, isMouse: true });
      }
    }
  }
  return { serverBlasts, clientBlasts, clientHp, serverHp: me.hp, selfHits, flightsLeft: flights.count, maxFlights, wake, afterBuildServerBlasts, shown: blasts.started };
}

describe("Grenade Launcher netsim (Story 5.5, ?lag=150&jitter=20)", () => {
  it("each server explosion is shown once, at the server's point; client HP = server HP after self-hits at a car", () => {
    for (const seed of [1, 2, 3]) {
      const r = simulate(seed, { seconds: 8, crowd: false });
      expect(r.serverBlasts.length).toBeGreaterThanOrEqual(4); // liveness
      expect(r.selfHits).toBeGreaterThanOrEqual(4); // every round aimed onto the car lands at its face 2 m out: 20 to me each time
      expect(r.shown).toBe(r.clientBlasts.length); // one explosion drawn per arrived event
      expect(r.clientBlasts.length).toBeLessThanOrEqual(r.serverBlasts.length); // never one the server didn't have
      // all but the last ~2 ticks' explosions have arrived by the end
      expect(r.clientBlasts.length).toBeGreaterThanOrEqual(r.serverBlasts.length - 1);
      r.clientBlasts.forEach((c, i) => {
        expect(Math.abs(c.x - (r.serverBlasts[i] as { x: number }).x)).toBeLessThanOrEqual(0.006);
        expect(Math.abs(c.y - (r.serverBlasts[i] as { y: number }).y)).toBeLessThanOrEqual(0.006);
      });
      expect(r.clientHp).toBe(r.serverHp); // after the last snapshot arrived: server truth
      expect(r.serverHp).toBe(1000 - 20 * r.selfHits);
    }
  });

  it("explosion events dropped: no round stuck on screen, and nothing shown that didn't arrive", () => {
    const r = simulate(4, { seconds: 8, crowd: true, dropExplosions: 0.5 });
    expect(r.serverBlasts.length).toBeGreaterThanOrEqual(4);
    expect(r.clientBlasts.length).toBeLessThan(r.serverBlasts.length);
    expect(r.maxFlights).toBeGreaterThanOrEqual(1);
    expect(r.flightsLeft).toBe(0); // after the lost timer, every round is gone
  });

  it("a hidden tab asleep across a launch and a build start: no ghost round or blast on waking", () => {
    const r = simulate(5, { seconds: 6, crowd: true, sleep: { from: 1500, to: 4000 }, buildAtMs: 1700 });
    expect(r.afterBuildServerBlasts).toBe(0); // the server cleared its rounds at the build start
    expect(r.wake.flights).toBe(0);
    expect(r.flightsLeft).toBe(0);
    expect(r.clientBlasts.length).toBe(r.serverBlasts.length); // each one once (the backlog included), none extra
  });

  it("a late Game scene start (events from mid-flight on): no stuck round, only arrived blasts shown", () => {
    const r = simulate(6, { seconds: 6, crowd: true, lateStartMs: 1530 });
    expect(r.serverBlasts.length).toBeGreaterThanOrEqual(3);
    expect(r.flightsLeft).toBe(0);
    expect(r.clientBlasts.length).toBeLessThanOrEqual(r.serverBlasts.length);
  });
});
