import { describe, expect, it } from "vitest";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { killZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE, isRushState } from "../zombies/zombieTypes";
import { skipWave, startBuild } from "../run/runStateMachine";
import { snapshotWorld } from "../core/worldSnapshot";
import { EVENT_PHASE } from "./eventState";
import { forceEvent } from "./specialEvents";
import { balance, ofType } from "./testEvents";


/** A real Downtown run (build → waves), the players Ready at once, god mode; `dev` = DEV_EVENTS. */
function run(dev: { kind: string; wave: number }[] | null, opts: { seed?: number; frozen?: boolean } = {}) {
  const world = createWorld({ balance, seed: opts.seed ?? 3, map: DOWNTOWN_MAP, systems: opts.frozen ? { zombies: () => {} } : {} });
  addPlayer(world, "p0", 24, 16);
  world.debug.godMode = true;
  world.debug.events = dev;
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  return { world, events };
}
/** One tick; `clear`: once a wave has spawned everything, its zombies die (god-mode players kill nothing). */
const tick = (w: World, clear = false): void => {
  for (const p of w.players.values()) p.buildReady = w.run.phase === "build";
  if (clear && w.run.phase === "wave" && w.waves.queued === 0) killWave(w);
  step(w, TICK_DT_S);
};
const until = (w: World, cond: () => boolean, max = 20_000, clear = false): void => {
  for (let i = 0; i < max && !cond(); i++) tick(w, clear);
  expect(cond()).toBe(true);
};
function killWave(w: World): void {
  const z = w.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i]!;
    if (z.waveZombie[id] === 1) killZombie(w, id, null, "cheat");
  }
}

describe("Story 6.8 F3: an event starts mid-fight", () => {
  it("never in a build phase; on the first tick its wave has spawned round(size × startFraction)", () => {
    const { world, events } = run([{ kind: "car_alarm", wave: 2 }]);
    let spawnedAtTrigger = -1;
    let prevSpawned = -1;
    world.events.subscribe((e) => {
      if (e.type === "event.triggered") {
        expect(world.run.phase).toBe("wave");
        spawnedAtTrigger = world.waves.size - world.waves.queued;
      }
    });
    until(world, () => world.waves.number === 1 && world.run.phase === "wave");
    skipWave(world);
    until(world, () => {
      if (spawnedAtTrigger < 0) prevSpawned = world.waves.number === 2 && world.run.phase === "wave" ? world.waves.size - world.waves.queued : -1;
      return spawnedAtTrigger >= 0;
    });
    const need = Math.round(world.waves.size * balance.events.startFractionMin);
    expect(world.waves.number).toBe(2);
    expect(spawnedAtTrigger).toBeGreaterThanOrEqual(need);
    expect(prevSpawned).toBeLessThan(need);
    expect(ofType(events, "event.triggered")).toHaveLength(1);
  });

  it("an entry whose wave ends before its trigger point is skipped (event.skipped), never carried over", () => {
    const { world, events } = run([{ kind: "stampede", wave: 1 }]);
    until(world, () => world.run.phase === "wave");
    skipWave(world); // the wave ends at once (0 % spawned)
    tick(world);
    expect(ofType(events, "event.skipped")).toEqual([{ type: "event.skipped", kind: "stampede", wave: 1 }]);
    until(world, () => world.waves.number === 2 && world.run.phase === "wave");
    for (let i = 0; i < 400; i++) tick(world);
    expect(ofType(events, "event.triggered")).toHaveLength(0);
  });
});

describe("Story 6.8 D6/F8: an event holds the wave, never forever", () => {
  it("a wave whose last normal zombie dies mid-crossing waits; the converted Runners count in remaining and rush in the last 5; then it ends", () => {
    const { world, events } = run([{ kind: "stampede", wave: 1 }], { frozen: true });
    until(world, () => world.special.active.kind !== -1);
    until(world, () => world.waves.queued === 0);
    until(world, () => world.special.active.phase === EVENT_PHASE.RUNNING);
    tick(world);
    killWave(world);
    for (let i = 0; i < 5; i++) tick(world);
    expect(world.run.phase).toBe("wave"); // held: the crossing runs
    expect(ofType(events, "wave.ended")).toHaveLength(0);
    until(world, () => world.special.active.kind === -1);
    tick(world);
    // frozen Runners all converted (stuck) — they are the wave now
    expect(world.waves.remaining).toBeGreaterThan(0);
    expect(world.special.log.stampedeConverted).toBeGreaterThan(0);
    const z = world.zombies;
    let rushing = 0;
    for (let i = 0; i < z.aliveCount; i++) if (isRushState(z.state[z.aliveIds[i]!]!)) rushing++;
    if (world.waves.remaining <= 5) expect(rushing).toBe(world.waves.remaining);
    killWave(world);
    tick(world);
    tick(world);
    expect(ofType(events, "wave.ended")).toEqual([{ type: "wave.ended", number: 1 }]);
  });

  it("skipWave ends the active event first (wave_end) and takes its Runners with it", () => {
    const { world, events } = run([{ kind: "stampede", wave: 1 }], { frozen: true });
    until(world, () => world.special.active.phase === EVENT_PHASE.RUNNING);
    tick(world);
    expect(world.special.stampede.alive).toBeGreaterThan(0);
    skipWave(world);
    expect(world.run.phase).toBe("build");
    let left = 0;
    for (let i = 0; i < world.zombies.aliveCount; i++) if (world.zombies.state[world.zombies.aliveIds[i]!] === ZOMBIE_STATE.STAMPEDE) left++;
    expect(left).toBe(0);
    step(world, TICK_DT_S); // the bus delivers on flush
    expect(ofType(events, "event.ended")).toEqual([{ type: "event.ended", kind: "stampede", outcome: "wave_end" }]);
  });

  it("the car alarm never holds a wave: the wave's end ends it (wave_end) and clears the lure", () => {
    const { world, events } = run([{ kind: "car_alarm", wave: 1 }], { frozen: true });
    until(world, () => world.special.active.kind !== -1);
    skipWave(world);
    tick(world);
    expect(ofType(events, "event.ended")).toEqual([{ type: "event.ended", kind: "car_alarm", outcome: "wave_end" }]);
    expect(world.pathing.lureBuild).toBe(0);
  });
});

describe("Story 6.8: one event at a time, dev force, replay", () => {
  it("forceEvent puts the kind in the coming wave at 20 %; one active event at a time", () => {
    const { world, events } = run(null);
    forceEvent(world, "car_alarm");
    until(world, () => world.special.active.kind !== -1);
    expect(world.waves.number).toBe(1);
    const k = world.special.active.kind;
    for (let i = 0; i < 300; i++) {
      tick(world);
      if (world.special.active.kind !== -1) expect(world.special.active.kind).toBe(k);
    }
    expect(ofType(events, "event.triggered")).toHaveLength(1);
  });

  it("same seed + no input → the same digest through a stampede and a car alarm (events stream only)", () => {
    const go = () => {
      const { world } = run([{ kind: "stampede", wave: 1 }, { kind: "car_alarm", wave: 3 }], { seed: 21 });
      until(world, () => world.waves.number === 3 && world.special.active.kind === -1 && (world.special.done & 2) !== 0, 40_000, true);
      return { world, d: JSON.stringify(snapshotWorld(world)) };
    };
    const a = go();
    const b = go();
    expect(a.d).toBe(b.d);
    expect(a.world.special.log.byKind[0]).toBe(1); // liveness: both really ran
    expect(a.world.special.log.byKind[1]).toBe(1);
  });
});

describe("Story 6.8 review (API for 6.9/6.10): update returns the outcome", () => {
  it("a module returning \"failed\" ends with event.ended { outcome: \"failed\" } (no re-entrant endSpecialEvent)", async () => {
    const { eventModule } = await import("./registry");
    const m = eventModule(1)!;
    const real = m.update;
    try {
      m.update = () => "failed";
      const { world, events } = run([{ kind: "stampede", wave: 1 }], { frozen: true });
      until(world, () => ofType(events, "event.ended").length > 0);
      expect(ofType(events, "event.ended")).toEqual([{ type: "event.ended", kind: "stampede", outcome: "failed" }]);
      expect(world.special.active.kind).toBe(-1);
    } finally {
      m.update = real;
    }
  });
});

describe("Story 6.8 review L1 (DD7): nobody standing at the trigger point", () => {
  it("no trigger and NOT skipped while everyone is down; it starts once one stands up", async () => {
    const { eventWorld, startNext, tickN } = await import("./testEvents");
    // (a real run turns "nobody standing" into a wipe in the player system before this one runs; the
    // guard is the safety net — the player system is off here so the downed state lasts)
    const { world, players, events } = eventWorld({ players: [[24, 16], [25, 16]], systems: { player: () => {} } });
    for (const p of players) p.status = "downed";
    startNext(world, "car_alarm");
    tickN(world, 40);
    expect(world.special.active.kind).toBe(-1);
    expect(ofType(events, "event.skipped")).toHaveLength(0);
    expect(world.special.log.skipped).toBe(0);
    players[1]!.status = "alive";
    tickN(world, 2);
    expect(ofType(events, "event.triggered")).toHaveLength(1);
  });
});

describe("Story 6.8 review L4 (D6): the WARNING holds the wave too", () => {
  it("the last normal zombie dies during the 3 s warning: the wave waits for the stampede", () => {
    const { world, events } = run([{ kind: "stampede", wave: 1 }], { frozen: true });
    until(world, () => world.special.active.kind !== -1);
    expect(world.special.active.phase).toBe(EVENT_PHASE.WARNING);
    world.waves.queued = 0; // everything spawned…
    killWave(world); // …and dead, in the warning
    for (let i = 0; i < 20; i++) {
      tick(world);
      expect(world.special.active.phase).toBe(EVENT_PHASE.WARNING);
    }
    expect(world.run.phase).toBe("wave");
    expect(ofType(events, "wave.ended")).toHaveLength(0);
  });
});
