/**
 * Story 5.6 netsim (brief lines 5, 14; F2, F7, AC 18): Spitters under `?lag=150&jitter=20` (75 ± 10
 * ms one way), in virtual time. The real server `RunController` on the open street, the real wire
 * (`encodeNetEvent` → `decodeNetEvent`), the client's cosmetic `AcidFx`, joined by a simulated
 * network. Each snapshot carries my HP and whether the Spitter is winding up (the horde stream's
 * state nibble); each tick's events travel with it.
 *
 * - The client's puddles land where the server's do (≤ 1 cm: the wire's cm grid), and it shows the
 *   server's HP, never its own.
 * - F2 under lag: the survivor starts sidestepping the moment the CLIENT sees the windup (so the
 *   server gets the first move ≥ 150 ms after the windup started) — over 20 seeds × ranges 2–6 m,
 *   the server never hits them.
 * - A hidden tab asleep across a spit and a build start wakes with no stale glob or puddle.
 */
import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  PLACEHOLDER_MAP,
  TICK_DT_S,
  createRng,
  decodeNetEvent,
  encodeNetEvent,
  isWindupState,
  loadBalance,
  skipWave,
  spawnZombie,
  startWave,
  type NetEvent,
  type PlayerInput,
  type SimEvent,
} from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { AcidFx } from "../../apps/client/src/render/acidFx";

const balance = loadBalance();
const spitOrNull = balance.zombies.types.spitter?.spit;
if (!spitOrNull) throw new Error("no spit");
const spit = spitOrNull;
const TICK_MS = TICK_DT_S * 1000;
const FRAME_MS = 1000 / 60;
const ID = "p0";

interface Snap {
  hp: number;
  windup: boolean;
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
  rangeM: number;
  angle: number;
  /** Sidestep when the client first sees a windup (+1 / −1 side); 0 = stand still. */
  dodge: number;
  seconds: number;
  /** Tab asleep in [from, to) ms; the server ends the wave (→ build start) at `buildAtMs`. */
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
  const zid = spawnZombie(world, "spitter", 24 - Math.cos(o.angle) * o.rangeM, 16 - Math.sin(o.angle) * o.rangeM, true);
  const ctx = { balance, zombieNetId: (id: number) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  const up = new Link<PlayerInput>(75, 10, rng);
  const down = new Link<Snap>(75, 10, rng);
  const fx = new AcidFx(balance.zombies.spitCaps.maxLiveSpits, balance.zombies.spitCaps.maxLivePuddles, spit.speedMps, spit.puddleS);
  const inputs: PlayerInput[] = [];
  const snaps: Snap[] = [];
  const serverSplash: { x: number; y: number }[] = [];
  const clientSplash: { x: number; y: number }[] = [];
  let nextServerMs = Math.floor(rng.range(0, TICK_MS));
  let nextFrameMs = 0;
  let accMs = 0;
  let lastFrameMs = 0;
  let seq = 0;
  let clientHp = -1;
  let serverSpits = 0;
  let serverHitsOnMe = 0;
  let dodging = false;
  let built = false;
  let fxAtWake = { globs: -1, puddles: -1 };
  for (let t = 0; t <= o.seconds * 1000; t++) {
    if (o.buildAtMs !== undefined && !built && t >= o.buildAtMs) {
      skipWave(world); // the wave ends → a build start (puddles and spits cleared on the server)
      built = true;
    }
    if (t >= nextServerMs) {
      nextServerMs += TICK_MS;
      up.take(t, inputs);
      for (const input of inputs) ctrl.queueInput(ID, input);
      const evs = ctrl.tick() as readonly SimEvent[];
      const tuples: NetEvent[] = [];
      for (const e of evs) {
        if (e.type === "spitter.spat") serverSpits++;
        if (e.type === "acid.splashed") serverSplash.push({ x: e.x, y: e.y });
        if (e.type === "player.damaged" && e.playerId === ID && e.sourceZombieId === -2) serverHitsOnMe++;
        const tu = encodeNetEvent(e, ctx);
        if (tu) tuples.push(tu);
      }
      down.send(t, { hp: me.hp, windup: world.zombies.alivePos[zid] !== -1 && isWindupState(world.zombies.state[zid] as number), events: tuples });
    }
    const asleep = o.sleep !== undefined && t >= o.sleep.from && t < o.sleep.to;
    if (t >= nextFrameMs && !asleep) {
      nextFrameMs += FRAME_MS;
      const dtMs = Math.min(t - lastFrameMs, 1000);
      lastFrameMs = t;
      if (o.sleep && fxAtWake.globs < 0 && t >= o.sleep.to) fxAtWake = { globs: -2, puddles: -2 }; // first frame after waking: measured below
      down.take(t, snaps);
      for (const s of snaps) {
        clientHp = s.hp;
        if (s.windup && o.dodge !== 0) dodging = true;
        for (const tu of s.events) {
          const e = decodeNetEvent(tu, { balance });
          if (!e) continue;
          fx.handle(e, t / 1000);
          if (e.type === "acid.splashed") clientSplash.push({ x: e.x, y: e.y });
        }
      }
      fx.update(t / 1000);
      if (fxAtWake.globs === -2) fxAtWake = { globs: fx.globCount, puddles: fx.puddleCount };
      accMs += dtMs;
      while (accMs >= TICK_MS) {
        // Perpendicular to the Spitter's line, once the client has seen a windup.
        const mx = dodging ? -Math.sin(o.angle) * o.dodge : 0;
        const my = dodging ? Math.cos(o.angle) * o.dodge : 0;
        up.send(t, { ...NEUTRAL_INPUT, seq: ++seq, moveX: mx, moveY: my, aimX: 1, aimY: 0 });
        accMs -= TICK_MS;
      }
    } else if (asleep) {
      nextFrameMs = t + FRAME_MS;
    }
  }
  return { serverSpits, serverHitsOnMe, serverHp: me.hp, clientHp, serverSplash, clientSplash, fxAtWake, fxNow: { globs: fx.globCount, puddles: fx.puddleCount } };
}

describe("Story 5.6 netsim: Spitters under lag (?lag=150&jitter=20)", () => {
  it("the client's puddles land where the server's do (≤ 1 cm) and it shows the server's HP", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const r = simulate(seed, { rangeM: 4 + seed * 0.4, angle: seed * 1.1, dodge: 0, seconds: 8 });
      expect(r.serverSpits, `seed ${seed}`).toBeGreaterThanOrEqual(2); // liveness
      expect(r.serverHitsOnMe).toBeGreaterThanOrEqual(2);
      expect(r.clientSplash.length).toBe(r.serverSplash.length);
      r.serverSplash.forEach((s, i) => {
        const c = r.clientSplash[i] as { x: number; y: number };
        expect(Math.hypot(c.x - s.x, c.y - s.y)).toBeLessThanOrEqual(0.01);
      });
      expect(r.clientHp).toBe(r.serverHp);
      expect(r.serverHp).toBeLessThan(balance.player.maxHp);
    }
  });

  it("F2 under lag: sidestepping when the client sees the windup is never hit, ranges 2–6 m × 20 seeds", () => {
    let spits = 0;
    let cases = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const rangeM of [2, 3, 4, 5, 5.8]) {
        const r = simulate(seed, { rangeM, angle: seed * 0.7 + rangeM, dodge: seed % 2 === 0 ? 1 : -1, seconds: 2 });
        cases++;
        spits += r.serverSpits;
        expect(r.serverHitsOnMe, `seed ${seed}, ${rangeM} m`).toBe(0);
        expect(r.serverHp).toBe(balance.player.maxHp);
      }
    }
    console.log(`[spit netsim F2] ${cases} lagged sidesteps, ${spits} spits released, 0 hits`);
    expect(spits).toBeGreaterThanOrEqual(cases / 2); // liveness: the windups really ended in spits
  }, 120_000);

  it("a tab asleep across a spit and a build start wakes with no stale glob or puddle", () => {
    const r = simulate(3, { rangeM: 5, angle: 0.5, dodge: 0, seconds: 6, sleep: { from: 400, to: 4000 }, buildAtMs: 2500 });
    expect(r.serverSpits).toBeGreaterThanOrEqual(1); // a spit happened while the tab slept
    expect(r.fxAtWake).toEqual({ globs: 0, puddles: 0 });
    expect(r.clientHp).toBe(r.serverHp);
  });
});
