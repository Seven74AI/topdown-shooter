/**
 * Story 5.8 netsim (brief line 14, AC 13): Bloaters under `?lag=150&jitter=20` (75 ± 10 ms one
 * way), in virtual time: the real server `RunController` on the open street, the real wire
 * (`encodeNetEvent` → `decodeNetEvent`), the client's cosmetic `BloaterFx`, joined by a simulated
 * network. Each snapshot carries my HP, my synced slow and whether the Bloater swells (the horde
 * stream's state nibble).
 *
 * - Outrun under lag (Beat the rule 1): running straight away the moment the CLIENT sees the swell
 *   (≥ 150 ms after it started) always clears the blast (over seeds × approach angles).
 * - Standing still: the client shows the server's HP after the blast and draws its cloud at the
 *   server's point (≤ 1 cm); the gas slow reaches the client one trip late (the 3.9 Crawler latency:
 *   the late ticks are counted and reported).
 * - A tab asleep across a burst and a build start wakes with no ghost cloud.
 */
import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, PLACEHOLDER_MAP, TICK_DT_S, ZOMBIE_STATE, createRng, decodeNetEvent, encodeNetEvent, loadBalance, skipWave, spawnZombie, startWave, type NetEvent, type PlayerInput, type SimEvent } from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { BloaterFx } from "../../apps/client/src/render/bloaterFx";

const balance = loadBalance();
const EX = balance.zombies.types.bloater?.explodes;
if (!EX) throw new Error("no bloater");
const ex = EX;
const TICK_MS = TICK_DT_S * 1000;
const FRAME_MS = 1000 / 60;
const ID = "p0";

interface Snap {
  hp: number;
  slowPct: number;
  swelling: boolean;
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
  angle: number;
  run: boolean;
  seconds: number;
  sleep?: { from: number; to: number };
  buildAtMs?: number;
}

function simulate(seed: number, o: Opts) {
  const rng = createRng(seed);
  const ctrl = new RunController({ balance, seed, players: [{ playerId: ID, slot: 0 }], systems: { waves: () => {} }, map: PLACEHOLDER_MAP });
  const world = ctrl.world;
  const me = world.players.get(ID);
  if (!me) throw new Error("no player");
  me.x = me.prevX = 24;
  me.y = me.prevY = 16;
  startWave(world);
  const zid = spawnZombie(world, "bloater", 24 - Math.cos(o.angle) * 2, 16 - Math.sin(o.angle) * 2, true);
  const ctx = { balance, zombieNetId: (id: number) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  const up = new Link<PlayerInput>(75, 10, rng);
  const down = new Link<Snap>(75, 10, rng);
  const fx = new BloaterFx(balance.zombies.blasts.maxGasClouds, balance.controls.fx.maxBloaterParticles, ex.gasRadiusM, ex.gasS);
  const inputs: PlayerInput[] = [];
  const snaps: Snap[] = [];
  const serverBursts: { x: number; y: number }[] = [];
  const clientBursts: { x: number; y: number }[] = [];
  let nextServerMs = Math.floor(rng.range(0, TICK_MS));
  let nextFrameMs = 0;
  let accMs = 0;
  let lastFrameMs = 0;
  let seq = 0;
  let clientHp = -1;
  let clientSlow = 0;
  let blastHitsOnMe = 0;
  let running = false;
  let built = false;
  let lateSlowTicks = 0;
  let cloudsAtWake = -1;
  for (let t = 0; t <= o.seconds * 1000; t++) {
    if (o.buildAtMs !== undefined && !built && t >= o.buildAtMs) {
      skipWave(world);
      built = true;
    }
    if (t >= nextServerMs) {
      nextServerMs += TICK_MS;
      up.take(t, inputs);
      for (const input of inputs) ctrl.queueInput(ID, input);
      const evs = ctrl.tick() as readonly SimEvent[];
      const tuples: NetEvent[] = [];
      for (const e of evs) {
        if (e.type === "bloater.burst") serverBursts.push({ x: e.x, y: e.y });
        if (e.type === "player.damaged" && e.playerId === ID && e.sourceZombieId === -2) blastHitsOnMe++;
        const tu = encodeNetEvent(e, ctx);
        if (tu) tuples.push(tu);
      }
      // the client's movement speed for this tick lags the server's slow by a trip (D7: the synced slow)
      if ((me.slowTicksLeft > 0 ? me.slowPct : 0) !== clientSlow) lateSlowTicks++;
      down.send(t, { hp: me.hp, slowPct: me.slowTicksLeft > 0 ? me.slowPct : 0, swelling: world.zombies.alivePos[zid] !== -1 && world.zombies.state[zid] === ZOMBIE_STATE.SWELL, events: tuples });
    }
    const asleep = o.sleep !== undefined && t >= o.sleep.from && t < o.sleep.to;
    if (t >= nextFrameMs && !asleep) {
      nextFrameMs += FRAME_MS;
      const dtMs = Math.min(t - lastFrameMs, 1000);
      lastFrameMs = t;
      const waking = o.sleep !== undefined && cloudsAtWake < 0 && t >= o.sleep.to;
      down.take(t, snaps);
      for (const s of snaps) {
        clientHp = s.hp;
        clientSlow = s.slowPct;
        if (s.swelling && o.run) running = true;
        for (const tu of s.events) {
          const e = decodeNetEvent(tu, { balance });
          if (!e) continue;
          if (waking && e.type === "bloater.burst") e.ageS = (t - (o.sleep?.from ?? t)) / 1000; // NetSimHost ages a backlog
          fx.handle(e, t / 1000);
          if (e.type === "bloater.burst") clientBursts.push({ x: e.x, y: e.y });
        }
      }
      fx.update(t / 1000);
      if (waking) cloudsAtWake = fx.cloudCount;
      accMs += dtMs;
      while (accMs >= TICK_MS) {
        // straight away from the Bloater, once the client has seen it swell
        up.send(t, { ...NEUTRAL_INPUT, seq: ++seq, moveX: running ? Math.cos(o.angle) : 0, moveY: running ? Math.sin(o.angle) : 0, aimX: 1, aimY: 0 });
        accMs -= TICK_MS;
      }
    } else if (asleep) {
      nextFrameMs = t + FRAME_MS;
    }
  }
  return { serverBursts, clientBursts, blastHitsOnMe, serverHp: me.hp, clientHp, lateSlowTicks, cloudsAtWake, cloudsNow: fx.cloudCount };
}

describe("Story 5.8 netsim: Bloaters under lag (?lag=150&jitter=20)", () => {
  it("outrun under lag: running when the client sees the swell always clears the blast (12 seeds × angles)", () => {
    let bursts = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = simulate(seed, { angle: seed * 0.53, run: true, seconds: 4 });
      bursts += r.serverBursts.length;
      expect(r.blastHitsOnMe, `seed ${seed}`).toBe(0);
      expect(r.serverHp).toBe(balance.player.maxHp);
    }
    expect(bursts).toBe(12); // liveness: every swell burst
  });

  it("standing still: the client shows the server's HP and draws the cloud at the server's point; the gas slow's late ticks are counted", () => {
    const late: number[] = [];
    for (let seed = 1; seed <= 4; seed++) {
      const r = simulate(seed, { angle: seed, run: false, seconds: 4 });
      expect(r.blastHitsOnMe, `seed ${seed}`).toBe(1);
      expect(r.clientHp).toBe(r.serverHp);
      expect(r.serverHp).toBe(balance.player.maxHp - ex.playerDamage);
      expect(r.clientBursts.length).toBe(r.serverBursts.length);
      r.serverBursts.forEach((s, i) => {
        const c = r.clientBursts[i] as { x: number; y: number };
        expect(Math.hypot(c.x - s.x, c.y - s.y)).toBeLessThanOrEqual(0.01);
      });
      late.push(r.lateSlowTicks);
    }
    console.log(`[bloater netsim] gas slow seen late by the client: ${late.join(", ")} server ticks per run (onset + end: ~2 trips of 75 ms)`);
    for (const n of late) expect(n).toBeLessThanOrEqual(8);
  });

  it("a tab asleep across a burst and a build start wakes with no ghost cloud", () => {
    const r = simulate(3, { angle: 0.5, run: false, seconds: 7, sleep: { from: 300, to: 6000 }, buildAtMs: 3000 });
    expect(r.serverBursts.length).toBe(1); // it burst while the tab slept
    expect(r.cloudsAtWake).toBe(0);
    expect(r.clientHp).toBe(r.serverHp);
  });
});
