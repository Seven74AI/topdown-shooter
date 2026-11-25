import { describe, expect, it } from "vitest";
import { spawnZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";
import { addBuildingAt } from "../buildings/buildings";
import { addPlayer } from "../player/player";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { World } from "../core/world";
import { EVENT_PHASE } from "./eventState";
import { eventHoldsWave } from "./specialEvents";
import { ticksFor } from "../core/time";
import { laneAlong } from "./stampede";
import { balance, eventWorld, ofType, startNext, tickN } from "./testEvents";

const T = (s: number): number => Math.round(s * 20);
const stampedeIds = (w: World): number[] => {
  const out: number[] = [];
  for (let i = 0; i < w.zombies.aliveCount; i++) {
    const id = w.zombies.aliveIds[i]!;
    if (w.zombies.state[id] === ZOMBIE_STATE.STAMPEDE) out.push(id);
  }
  return out;
};

function started(players: readonly [number, number][] = [[24, 16]], seed = 5) {
  const t = eventWorld({ seed, players });
  startNext(t.world, "stampede");
  tickN(t.world, 1);
  expect(t.world.special.active.phase).toBe(EVENT_PHASE.WARNING);
  return t;
}

describe("Story 6.8 D4: the lane", () => {
  it("is one passing within 10 m of the team (both ways of the main street or the cross street from the centre)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const { world, events } = started([[24, 16]], seed);
      const lane = DOWNTOWN_MAP.stampedeLanes[world.special.active.lane]!;
      seen.add(lane.name);
      expect(ofType(events, "event.triggered")[0]).toMatchObject({ kind: "stampede", lane: world.special.active.lane, phase: EVENT_PHASE.WARNING });
    }
    expect(seen.size).toBe(4);
    // a team in the west street: only the main street's lanes pass within 10 m
    for (let seed = 1; seed <= 30; seed++) {
      const { world } = started([[5, 16]], seed);
      expect(DOWNTOWN_MAP.stampedeLanes[world.special.active.lane]!.name).toMatch(/^lane_main_/);
    }
  });
});

describe("Story 6.8 F1/F6: the warning comes first, then they run the lane", () => {
  it("nothing spawns in the 3 s warning; then Runners at the start edge running along the lane at 5 m/s, in the lane", () => {
    const { world } = started();
    const lane = DOWNTOWN_MAP.stampedeLanes[world.special.active.lane]!;
    for (let i = 0; i < T(3) - 1; i++) {
      tickN(world, 1);
      expect(stampedeIds(world)).toHaveLength(0);
    }
    tickN(world, 1);
    expect(world.special.active.phase).toBe(EVENT_PHASE.RUNNING);
    const first = stampedeIds(world);
    expect(first.length).toBeGreaterThan(0);
    for (const id of first) expect(laneAlong(lane, world.zombies.x[id]!, world.zombies.y[id]!)).toBeLessThan(1);
    const along0 = new Map(first.map((id) => [id, laneAlong(lane, world.zombies.x[id]!, world.zombies.y[id]!)]));
    tickN(world, 20);
    let moved = 0;
    for (const id of first) {
      if (world.zombies.state[id] !== ZOMBIE_STATE.STAMPEDE) continue;
      const a = laneAlong(lane, world.zombies.x[id]!, world.zombies.y[id]!);
      const x = world.zombies.x[id]!;
      const y = world.zombies.y[id]!;
      expect(x).toBeGreaterThanOrEqual(lane.minX - 1);
      expect(x).toBeLessThanOrEqual(lane.maxX + 1);
      expect(y).toBeGreaterThanOrEqual(lane.minY - 1);
      expect(y).toBeLessThanOrEqual(lane.maxY + 1);
      if (a - along0.get(id)! > 3) moved++;
    }
    expect(moved).toBeGreaterThan(0); // ≈ 5 m in 1 s for the unhindered ones
  });

  it("sizes: 12 / 18 / 24 / 30 Runners for 1–4 players (a downed player counts, D11)", () => {
    for (const [n, want] of [[1, 12], [2, 18], [3, 24], [4, 30]] as const) {
      const pos: [number, number][] = Array.from({ length: n }, (_, i) => [3 + i, 30.5]); // out of every lane
      const t = eventWorld({ seed: 7, players: pos });
      if (n === 3) t.world.players.get("p2")!.status = "downed"; // review L2: down BEFORE the size is fixed
      startNext(t.world, "stampede");
      tickN(t.world, 1);
      const world = t.world;
      world.debug.godMode = true;
      tickN(world, T(15) + 2);
      expect(world.special.log.stampedeSpawned).toBe(want);
    }
  });
});

describe("Story 6.8 F7: a stampede Runner hurts you once", () => {
  it("8 damage per Runner per player (each Runner at most once), nothing to buildings; they run on", () => {
    const { world, events, players } = started([[24, 16]], 9);
    const lane = DOWNTOWN_MAP.stampedeLanes[world.special.active.lane]!;
    const p = players[0]!;
    p.hp = 1e6;
    p.maxHp = 1e6;
    const p2 = addPlayer(world, "p1", lane.minX + 4, lane.minY + 4);
    p2.hp = 1e6;
    p2.maxHp = 1e6;
    // a barricade in the lane: Runners deflect / stall, never damage it
    const b = addBuildingAt(world, { id: 900, type: "wood_barricade", ownerId: "p0", gx: Math.round((lane.minX + lane.maxX) / 2 / 0.5) + 6, gy: Math.round((lane.minY + 1) / 0.5), rot: 0, hp: 200 })!;
    expect(b).not.toBeNull();
    tickN(world, T(15) + 2);
    const dmg = ofType(events, "player.damaged");
    expect(dmg.length).toBeGreaterThan(0);
    const per = new Map<string, number>();
    for (const d of dmg) {
      expect(d.amount).toBe(8);
      expect(d.tag).toBe("zombie");
      const k = `${d.sourceZombieId}/${d.playerId}`;
      per.set(k, (per.get(k) ?? 0) + 1);
    }
    for (const c of per.values()) expect(c).toBe(1);
    expect(b.hp).toBe(200);
    expect(world.special.log.stampedeHits).toBe(dmg.length);
  });
});

describe("Story 6.8 F8: the stampede never makes the wave endless", () => {
  it("at the end of the 12 s (6.8 B2) every Runner left is a normal wave Runner; stuck ones convert after 1 s", () => {
    const { world, events } = started([[3, 30.5]], 2);
    const lane = DOWNTOWN_MAP.stampedeLanes[world.special.active.lane]!;
    // wall the lane off 6 m from the start: everything stalls there and converts after ~1 s
    const alongX = lane.dir === "e" || lane.dir === "w";
    for (let k = 0; k < 4; k++) {
      const gx = alongX ? Math.round((lane.dir === "e" ? lane.minX + 6 : lane.maxX - 6.5) / 0.5) : Math.round((lane.minX + 2 * k) / 0.5);
      const gy = alongX ? Math.round((lane.minY + 2 * k) / 0.5) : Math.round((lane.dir === "s" ? lane.minY + 6 : lane.maxY - 6.5) / 0.5);
      addBuildingAt(world, { id: 800 + k, type: "wood_barricade", ownerId: "p0", gx, gy, rot: alongX ? 1 : 0, hp: 200 });
    }
    tickN(world, T(3) + T(2.5));
    expect(world.special.log.stampedeConverted).toBeGreaterThan(0); // D7: converted before the 12 s
    let converted = 0;
    for (let i = 0; i < world.zombies.aliveCount; i++) {
      const id = world.zombies.aliveIds[i]!;
      if (world.zombies.waveZombie[id] === 1) converted++;
    }
    expect(converted).toBeGreaterThan(0);
    tickN(world, T(12));
    expect(world.special.active.kind).toBe(-1);
    expect(stampedeIds(world)).toHaveLength(0);
    expect(ofType(events, "event.ended")).toEqual([{ type: "event.ended", kind: "stampede", outcome: "done" }]);
    const s = world.special.log;
    expect(s.stampedeConverted + s.stampedeExited).toBeLessThanOrEqual(s.stampedeSpawned);
    expect(s.stampedeConverted).toBeGreaterThan(0);
  });

  it("never above the alive cap that applies + 30 (150 → 180), normal spawns paused while Runners run", () => {
    const { world } = started([[3, 30.5]], 4);
    world.debug.godMode = true;
    for (let i = 0; i < 150; i++) spawnZombie(world, "walker", 2 + (i % 20) * 0.8, 23 + Math.floor(i / 20) * 0.9, true);
    let most = 0;
    for (let t = 0; t < T(15); t++) {
      tickN(world, 1);
      most = Math.max(most, world.zombies.aliveCount);
    }
    expect(most).toBeLessThanOrEqual(150 + balance.events.stampede.overCap);
    expect(most).toBeGreaterThan(150);
  });
});

describe("Story 6.8 brief 22: the over-cap counts against the cap that applies", () => {
  it("170 alive: never above 150 + 30; while a Behemoth lives (cap 110): 120 alive → ≤ 140", () => {
    for (const [boss, start, cap] of [[false, 170, 180], [true, 120, 140]] as const) {
      const { world } = started([[3, 30.5], [4, 30.5], [5, 30.5], [6, 30.5]], 4); // 4 players: 30 Runners
      world.debug.godMode = true;
      if (boss) {
        world.boss.state = 2; // BOSS_STATE.WALK (alive): maxAliveNow → boss.aliveCap 110
        world.boss.x = 44;
        world.boss.y = 29;
        world.boss.hp = world.boss.maxHp = 1e9;
        world.boss.wave = world.waves.number;
      }
      for (let i = 0; i < start; i++) {
        const id = spawnZombie(world, "walker", 2 + (i % 20) * 0.8, 22.8 + Math.floor(i / 20) * 0.9, true);
        world.zombies.hp[id] = 1e9; // the Behemoth's blows must not thin them out
      }
      let most = 0;
      for (let t = 0; t < T(15); t++) {
        tickN(world, 1);
        most = Math.max(most, world.zombies.aliveCount);
      }
      expect(most, `boss ${boss}`).toBeLessThanOrEqual(cap);
      expect(most, `boss ${boss}`).toBeGreaterThan(start); // liveness: Runners really came, up to the cap (more as others leave the far edge)
    }
  });
});

describe("Story 6.8 review L3/L6: spawns pause; a held Runner never hits a barricade", () => {
  it("normal wave spawns pause while stampede Runners run (queued holds), and resume after", () => {
    const { world } = started([[3, 30.5], [4, 30.5]], 3);
    world.debug.godMode = true;
    world.waves.paused = false;
    world.waves.queued = 60;
    world.waves.spawnTimerTicks = 0;
    let pausedTicks = 0;
    let resumed = false;
    for (let t = 0; t < T(20); t++) {
      const alive = world.special.stampede.alive;
      const q = world.waves.queued;
      tickN(world, 1);
      if (alive > 0) {
        expect(world.waves.queued, `tick ${t}`).toBe(q);
        pausedTicks++;
      } else if (world.special.active.kind === -1 && world.waves.queued < q) resumed = true;
    }
    expect(pausedTicks).toBeGreaterThan(T(3)); // liveness: Runners really ran with a queue waiting
    expect(resumed).toBe(true);
  });

  it("a stampede Runner held by a bear trap next to a barricade leaves it untouched (D5)", () => {
    const { world } = started([[3, 30.5]], 3);
    tickN(world, T(3) + 2);
    const id = stampedeIds(world)[0]!;
    const b = addBuildingAt(world, { id: 950, type: "wood_barricade", ownerId: "p0", gx: 60, gy: 32, rot: 1, hp: 200 })!;
    const r = balance.zombies.types.runner!.radiusM;
    world.zombies.x[id] = b.minX - r - 0.01;
    world.zombies.y[id] = (b.minY + b.maxY) / 2;
    world.zombies.holdTicks[id] = 200;
    for (let t = 0; t < 30; t++) {
      tickN(world, 1);
      world.zombies.holdTicks[id] = 200;
      world.zombies.state[id] = ZOMBIE_STATE.STAMPEDE; // keep it a Runner of the stampede (no stuck conversion)
      world.zombies.stampedeTick[id] = world.tick;
    }
    expect(b.hp).toBe(200);
  });
});

describe("Story 6.8 re-review R4: the stampede holds the wave for exactly warning + runS (≤ 15 s)", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: held from the trigger tick for exactly ticksFor(warningS) + ticksFor(runS) ticks, then released`, () => {
      const t = eventWorld({ seed, players: [[24, 16]] });
      const world = t.world;
      startNext(world, "stampede");
      let held = 0;
      let start = -1;
      for (let i = 0; i < T(60); i++) {
        tickN(world, 1);
        if (world.special.active.kind !== -1 && start < 0) start = world.special.active.startTick;
        if (eventHoldsWave(world)) held++;
        else if (start >= 0) break;
      }
      const cfg = world.balance.events.stampede;
      expect(start).toBeGreaterThanOrEqual(0);
      expect(held).toBe(ticksFor(cfg.warningS) + ticksFor(cfg.runS));
      expect(held).toBeLessThanOrEqual(T(15));
      expect(cfg.runS).toBe(12); // 6.8 B2
    });
  }
});
