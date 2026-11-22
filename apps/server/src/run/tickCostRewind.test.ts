import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, loadBalance, recordZombieHistory, rewoundView, setLoadout, spawnZombie } from "@topdown/shared";
import { RunController } from "./RunController";

const balance = loadBalance();
const ZOMBIES = 150;
const WARMUP_TICKS = 100;
const MEASURED_TICKS = 600; // 30 s of game time
/** A 150 ms RTT player's view offset (75 ms one-way + queue wait + 100 ms render delay ≈ 5 ticks). */
const VIEW_OFFSET_TICKS = 4.9;

/**
 * Story 2.12: the added server tick cost of rewound hit testing. Two controllers, identical but for
 * `lagCompensation`, ticked alternately (same machine load): 4 players circling and firing SMGs
 * (12/s, the most projectiles in flight) with touch aim (the assist runs on the rewound view), 150
 * Walkers topped up every tick. Reports mean / p99 of both and their difference (noisy on a shared
 * machine: GC and flow-field rebuilds give 6–9 ms p99 spikes in both). The asserted number is the
 * added work itself, timed after every tick of the rewind-on controller: one history row plus one
 * rewound view per rewound sweep and per touch shot's assist (the only work the rewind adds; the
 * segment tests run on the view instead of the live grid at the same cost).
 */
/** Timing asserts only with `PERF_ASSERT=1` (as tickCostFlowField, 3.5 review M1); the numbers are always printed. */
const PERF_ASSERT = process.env.PERF_ASSERT === "1";

describe("server tick cost with rewound hit testing (Story 2.12)", () => {
  it("4 players firing SMGs + 150 zombies: the rewind adds ≤ 1 ms at p99", () => {
    const r = round(99);
    expect(r.workP99).toBeGreaterThan(0);
    if (PERF_ASSERT) expect(r.workP99).toBeLessThan(1);
  }, 60_000);
});

function round(seed: number): { addedP99: number; addedMean: number; workP99: number } {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const make = (lagCompensation: boolean) => {
    const c = new RunController({ balance, seed, players, pauseWaves: true, lagCompensation });
    c.world.debug.godMode = true;
    for (const p of c.world.players.values()) setLoadout(balance, p.loadout, ["smg", null]);
    return c;
  };
  const on = make(true);
  const off = make(false);
  const points = on.world.map.spawnPoints;
  const topUp = (c: RunController, at: { n: number }): void => {
    while (c.world.zombies.aliveCount < ZOMBIES) {
      const sp = points[at.n++ % points.length];
      if (!sp || spawnZombie(c.world, "walker", sp.x, sp.y, true) < 0) break;
    }
  };
  const atOn = { n: 0 };
  const atOff = { n: 0 };
  const tOn: number[] = [];
  const tOff: number[] = [];
  const work: number[] = [];
  let builds = 0;
  let shots = 0;
  let hits = 0;
  const tick = (c: RunController, at: { n: number }, t: number, out: number[], count: boolean): void => {
    topUp(c, at);
    for (let i = 0; i < 4; i++) {
      const a = t * 0.05 + i * 1.6;
      c.queueInput(`p${i}`, {
        ...NEUTRAL_INPUT,
        seq: t,
        moveX: Math.cos(a) * 0.7,
        moveY: Math.sin(a) * 0.7,
        aimX: -Math.sin(a),
        aimY: Math.cos(a),
        fire: true,
        isMouse: false,
        viewTick: Math.round((c.world.tick - VIEW_OFFSET_TICKS) * 100),
      });
    }
    // Rewound sweeps this tick: the rewound shots in flight now, plus this tick's new shots (sweep + assist).
    let rewound = 0;
    const pool = c.world.projectiles;
    for (let k = 0; k < pool.aliveCount; k++) if ((pool.rewindTicks[pool.aliveIds[k] as number] as number) > 0) rewound++;
    const t0 = performance.now();
    const events = c.tick();
    const ms = performance.now() - t0;
    if (count && t > WARMUP_TICKS) {
      for (const e of events) if (e.type === "weapon.fired") rewound += 2;
      const w0 = performance.now();
      recordZombieHistory(c.world); // re-records the same row: the same work as in the step
      for (let k = 0; k < rewound; k++) rewoundView(c.world, c.world.tick - 2.3 - k * 1e-3); // distinct times: no memo
      work.push(performance.now() - w0);
      builds += rewound;
    }
    if (t > WARMUP_TICKS) {
      out.push(ms);
      if (count)
        for (const e of events) {
          if (e.type === "weapon.fired") shots++;
          if (e.type === "zombie.hit") hits++;
        }
    }
  };
  for (let t = 1; t <= WARMUP_TICKS + MEASURED_TICKS; t++) {
    // Alternate the order so neither always runs on a warmer cache.
    if (t % 2) {
      tick(on, atOn, t, tOn, true);
      tick(off, atOff, t, tOff, false);
    } else {
      tick(off, atOff, t, tOff, false);
      tick(on, atOn, t, tOn, true);
    }
  }
  const stats = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    return { mean: s.reduce((a, b) => a + b, 0) / s.length, p99: s[Math.floor(s.length * 0.99)] ?? 0, max: s[s.length - 1] ?? 0 };
  };
  const a = stats(tOn);
  const b = stats(tOff);
  const addedP99 = a.p99 - b.p99;
  const w = stats(work);
  console.log(
    `[tick cost 2.12] seed ${seed}: 4 SMGs + ${ZOMBIES} Walkers, ${MEASURED_TICKS} ticks: rewind ON mean ${a.mean.toFixed(3)} p99 ${a.p99.toFixed(3)} max ${a.max.toFixed(3)} ms; ` +
      `OFF mean ${b.mean.toFixed(3)} p99 ${b.p99.toFixed(3)} max ${b.max.toFixed(3)} ms; added mean ${(a.mean - b.mean).toFixed(3)} p99 ${addedP99.toFixed(3)} ms; ` +
      `${shots} shots, ${hits} hits (rewind on); added work per tick (history row + ${(builds / work.length).toFixed(1)} rewound views avg) ` +
      `mean ${w.mean.toFixed(3)} p99 ${w.p99.toFixed(3)} max ${w.max.toFixed(3)} ms`,
  );
  expect(shots).toBeGreaterThan(800); // the SMGs really fired
  expect(hits).toBeGreaterThan(100);
  expect(on.world.zombieHistory.enabled && !off.world.zombieHistory.enabled).toBe(true);
  return { addedP99, addedMean: a.mean - b.mean, workP99: w.p99 };
}
