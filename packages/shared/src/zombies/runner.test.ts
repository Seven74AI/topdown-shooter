import { describe, expect, it } from "vitest";
import { BalanceError, bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { createRng } from "../core/rng";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer, type PlayerState } from "../player/player";
import { FLOW_UNITS_PER_M, flowCellAt, flowFieldMaxAgeTicks, flowRefreshTicks, flowSharedMaxAgeTicks } from "./flowField";
import { killZombie, spawnZombie } from "./zombiePool";
import { ZOMBIE_STATE, ZOMBIE_TYPES, zombieTypeIndex, type ZombieTypeId } from "./zombieTypes";

/** Report lines (the shared package has no DOM/Node typings). */
const log = (m: string): void => (globalThis as unknown as { console: { info(m: string): void } }).console.info(m);
/** One mechanic per test: no wave director. */
const NO_WAVES = { waves: () => {} };
const balance = loadBalance();
const runner = balance.zombies.types.runner;
const flank = balance.zombies.flank;
const PENALTY_UNITS = Math.round(flank.penaltyM * FLOW_UNITS_PER_M);
const P = flowRefreshTicks(createWorld({ balance, seed: 1, systems: NO_WAVES }));

const aimAt = (world: World, id: string, seq: number, aimX: number, aimY: number) =>
  setInput(world, id, { ...NEUTRAL_INPUT, seq, aimX, aimY });

/** Penalty the flank field's rebuild in progress uses at (x, y). */
const penaltyAt = (world: World, x: number, y: number): number => world.pathing.flank.penalty[flowCellAt(world.pathing.nav, x, y)] as number;

/** A player at (x, y) facing (fx, fy) (set directly: one mechanic per test). */
function facing(world: World, id: string, x: number, y: number, fx: number, fy: number): PlayerState {
  const p = addPlayer(world, id, x, y);
  p.facingX = fx;
  p.facingY = fy;
  return p;
}

/** Angle in degrees between p's aim and the direction from p to (x, y). */
function angleFromAim(p: PlayerState, x: number, y: number): number {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const c = (dx * p.facingX + dy * p.facingY) / d;
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

describe("Runner balance (Story 3.8, FR21)", () => {
  it("has the GDD numbers and flanks; Walkers and Crawlers don't", () => {
    expect(runner).toMatchObject({ hp: 6, speedMps: 4, damage: 8, attackIntervalS: 1, reward: 3, flanks: true });
    expect(balance.zombies.types.walker?.flanks).toBe(false);
    expect(balance.zombies.types.crawler?.flanks).toBe(false);
    expect(ZOMBIE_TYPES.indexOf("runner")).toBe(2); // after "crawler": the index is on the wire
    expect(flank).toEqual({ coneHalfAngleDeg: 45, coneRadiusM: 10, coneApexBackM: 0.5, penaltyM: 1, directWithinM: 1 });
  });

  it("the flank block is validated", () => {
    expect(() => loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", "flank.coneHalfAngleDeg", 120]]))).toThrow(BalanceError);
    expect(() => loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", "flank.penaltyM", -1]]))).toThrow(BalanceError);
  });
});

describe("flank penalty layer (Story 3.8)", () => {
  it("marks the ±45° × 10 m cone in front of the aim only (apex 0.5 m behind the player); the player's own cell and behind stay free", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    facing(w, "a", 20.25, 16.25, 1, 0);
    spawnZombie(w, "runner", 45, 2);
    step(w, TICK_DT_S); // tick 0 is even (chase); tick 1 starts the flank rebuild
    step(w, TICK_DT_S);
    const at = (deg: number, r: number) => penaltyAt(w, 20.25 + Math.cos((deg * Math.PI) / 180) * r, 16.25 + Math.sin((deg * Math.PI) / 180) * r);
    expect(at(0, 5)).toBe(PENALTY_UNITS);
    expect(at(40, 6)).toBe(PENALTY_UNITS);
    expect(at(-40, 6)).toBe(PENALTY_UNITS);
    expect(at(50, 6)).toBe(0);
    expect(at(-50, 6)).toBe(0);
    expect(at(0, 9.7)).toBe(PENALTY_UNITS);
    expect(at(0, 10.5)).toBe(0);
    expect(at(180, 3)).toBe(0); // behind
    expect(at(90, 3)).toBe(0); // beside
    expect(penaltyAt(w, 20.25, 16.25)).toBe(0); // the player's cell
    expect(penaltyAt(w, 20.75, 16.25)).toBe(PENALTY_UNITS); // the next cell in front: the cone is body-wide where it starts
    expect(penaltyAt(w, 19.75, 16.25)).toBe(0); // the cell behind
    expect(penaltyAt(w, 20.75, 16.75)).toBe(PENALTY_UNITS); // front-diagonal neighbour: in
    expect(penaltyAt(w, 19.75, 16.75)).toBe(0); // behind-beside: out
  });

  it("several players: the union of their cones (max, not sum); downed players have no cone", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    facing(w, "a", 15.25, 16.25, 1, 0);
    facing(w, "b", 25.25, 16.25, -1, 0); // facing each other: the cones overlap between them
    const c = facing(w, "c", 20.25, 6.25, 0, 1);
    c.status = "downed";
    spawnZombie(w, "runner", 45, 2);
    step(w, TICK_DT_S);
    step(w, TICK_DT_S);
    expect(penaltyAt(w, 20.25, 16.25)).toBe(PENALTY_UNITS); // in both cones: counted once
    expect(penaltyAt(w, 27, 16.25)).toBe(0); // behind b
    expect(penaltyAt(w, 20.25, 9)).toBe(0); // in front of the downed c
  });
});

describe("flank field cadence (Story 3.8, brief line 10)", () => {
  it("with no flanker alive the chase field gets every tick and the flank field pauses", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 20, 16);
    spawnZombie(w, "walker", 40, 16);
    for (let t = 0; t < 60; t++) step(w, TICK_DT_S);
    expect(w.pathing.flankActive).toBe(false);
    expect(w.pathing.flank.rebuilds).toBe(0);
    expect(w.tick - w.pathing.chase.sourceTick).toBeLessThanOrEqual(flowFieldMaxAgeTicks(w));
    expect(w.pathing.chase.rebuilds).toBeGreaterThanOrEqual(Math.floor(60 / P) - 1);
  });

  it("with a Runner alive the fields alternate ticks (same budget per tick), each refreshed every 2P ticks", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 20, 16);
    spawnZombie(w, "runner", 45, 2);
    const { chase, flank: f } = w.pathing;
    let lastChase = chase.rebuilds;
    let lastFlank = f.rebuilds;
    for (let t = 0; t < 120; t++) {
      step(w, TICK_DT_S);
      const dc = chase.rebuilds - lastChase;
      const df = f.rebuilds - lastFlank;
      expect(dc + df).toBeLessThanOrEqual(1); // one field per tick
      lastChase = chase.rebuilds;
      lastFlank = f.rebuilds;
    }
    expect(w.pathing.flankActive).toBe(true);
    expect(f.rebuilds).toBeGreaterThanOrEqual(Math.floor(120 / (2 * P)) - 1);
    expect(chase.rebuilds).toBeGreaterThanOrEqual(Math.floor(120 / (2 * P)) - 1);
  });

  it("STALE TEST: aim spinning every tick and the player moving: the flank field is never older than 4P and carries the aim of its source tick", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const a = addPlayer(w, "a", 10, 16);
    // A far Runner keeps the flank field active; it never reaches the player in this test.
    w.debug.godMode = true;
    const maxAge = flowSharedMaxAgeTicks(w);
    expect(maxAge).toBe(4 * P);
    const aimAngle = (t: number) => t * 0.15; // a full turn every ~2 s
    const xAt = (t: number) => 10 + 28 * Math.abs(Math.sin(t / 70));
    const f = w.pathing.flank;
    for (let t = 0; t < 400; t++) {
      if (w.zombies.aliveCount === 0) spawnZombie(w, "runner", 46, 2);
      w.zombies.x[w.zombies.aliveIds[0] as number] = 46; // pinned far away (one mechanic)
      w.zombies.y[w.zombies.aliveIds[0] as number] = 2;
      a.x = xAt(w.tick);
      aimAt(w, "a", t + 1, Math.cos(aimAngle(w.tick)), Math.sin(aimAngle(w.tick)));
      step(w, TICK_DT_S); // movement sets the facing from the aim before the buildings system seeds
      if (t < 2 * maxAge) continue;
      expect(w.tick - f.sourceTick).toBeLessThanOrEqual(maxAge);
      expect(w.tick - w.pathing.chase.sourceTick).toBeLessThanOrEqual(maxAge);
      // The front field's zero is where the player stood at its source tick, its penalty that tick's cone.
      const st = f.sourceTick;
      const sx = xAt(st);
      expect(f.front[flowCellAt(w.pathing.nav, sx, 16)]).toBe(0);
      const ahead = (r: number) => flowCellAt(w.pathing.nav, sx + Math.cos(aimAngle(st)) * r, 16 + Math.sin(aimAngle(st)) * r);
      const behind = (r: number) => flowCellAt(w.pathing.nav, sx - Math.cos(aimAngle(st)) * r, 16 - Math.sin(aimAngle(st)) * r);
      expect(f.frontPenalty[ahead(4)]).toBe(PENALTY_UNITS);
      expect(f.frontPenalty[behind(4)]).toBe(0);
    }
  });

  it("when Runners come back after a pause the flank rebuild restarts with fresh aims", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 20, 16);
    const id = spawnZombie(w, "runner", 45, 2);
    for (let t = 0; t < 3; t++) step(w, TICK_DT_S); // a flank rebuild is in progress
    expect(w.pathing.flank.building).toBe(true);
    killZombie(w, id, null, "test");
    for (let t = 0; t < 50; t++) step(w, TICK_DT_S);
    expect(w.pathing.flankActive).toBe(false);
    const comeback = w.tick;
    spawnZombie(w, "runner", 45, 2);
    for (let t = 0; t < 4 * P; t++) step(w, TICK_DT_S);
    expect(w.pathing.flank.sourceTick).toBeGreaterThanOrEqual(comeback);
  });
});

describe("Runner steering (Story 3.8)", () => {
  it("runs at 4.0 m/s straight at a player who isn't facing it", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    facing(w, "a", 10, 16, -1, 0); // facing away
    const id = spawnZombie(w, "runner", 30, 16);
    for (let t = 0; t < 20; t++) step(w, TICK_DT_S);
    expect(w.zombies.x[id]).toBeCloseTo(30 - 4.0 * 20 * TICK_DT_S, 4); // Float32 pool
    expect(w.zombies.y[id]).toBeCloseTo(16, 4);
  });

  it("swings wide of a player facing it instead of running into the aim (a Walker comes straight)", () => {
    const track = (type: ZombieTypeId) => {
      const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
      w.debug.godMode = true;
      const a = facing(w, "a", 10, 16, 1, 0);
      const id = spawnZombie(w, type, 30, 16.3);
      let maxOff = 0;
      for (let t = 0; t < 400; t++) {
        aimAt(w, "a", t + 1, 1, 0);
        step(w, TICK_DT_S);
        maxOff = Math.max(maxOff, Math.abs((w.zombies.y[id] as number) - a.y));
        const dx = (w.zombies.x[id] as number) - a.x;
        const dy = (w.zombies.y[id] as number) - a.y;
        if (Math.sqrt(dx * dx + dy * dy) <= runner!.radiusM + a.radiusM + 0.05) break;
      }
      return { maxOff, angle: angleFromAim(a, w.zombies.x[id] as number, w.zombies.y[id] as number) };
    };
    const r = track("runner");
    const wk = track("walker");
    expect(r.maxOff).toBeGreaterThan(4); // went round the cone's edge
    expect(r.angle).toBeGreaterThan(45);
    expect(wk.maxOff).toBeLessThan(0.5);
    expect(wk.angle).toBeLessThan(10);
  });

  it("a rushing Runner (FR30) heads straight in like a Walker", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    w.debug.godMode = true;
    facing(w, "a", 10, 16, 1, 0);
    const id = spawnZombie(w, "runner", 30, 16);
    w.zombies.state[id] = ZOMBIE_STATE.RUSH;
    for (let t = 0; t < 40; t++) {
      aimAt(w, "a", t + 1, 1, 0);
      step(w, TICK_DT_S);
      expect(w.zombies.y[id]).toBeCloseTo(16, 4);
    }
  });

  it("with buildings in the way it routes round them and never stands inside one", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    w.debug.godMode = true;
    const a = facing(w, "a", 10, 16, -1, 0); // facing away: only the wall stands in the way
    for (let k = 0; k < 4; k++) addBuildingAt(w, { id: k + 1, type: "wood_barricade", ownerId: "a", gx: 14 / BUILD_GRID_M, gy: (13 + k * 2) / BUILD_GRID_M, rot: 1, hp: 200 }); // wall x 14–14.5, y 13–21
    const id = spawnZombie(w, "runner", 24, 16);
    let reached = false;
    for (let t = 0; t < 300 && !reached; t++) {
      aimAt(w, "a", t + 1, -1, 0);
      step(w, TICK_DT_S);
      const x = w.zombies.x[id] as number;
      const y = w.zombies.y[id] as number;
      expect(x > 14 - 0.3 && x < 14.5 + 0.3 && y > 13 - 0.3 && y < 21 + 0.3).toBe(false);
      const dx = x - a.x;
      const dy = y - a.y;
      reached = Math.sqrt(dx * dx + dy * dy) <= 0.75;
    }
    expect(reached).toBe(true);
    expect(w.buildings.list.every((b) => b.hp === 200)).toBe(true); // went round, didn't break through
  });
});

/**
 * Epics AC 3: the same setup with Walkers and with Runners (fixed seed). A zombie "reaches the
 * flank" when, at its first contact with a player, it is more than 45° off that player's aim.
 */
function flankShare(type: ZombieTypeId, players: readonly { x: number; y: number }[], seed: number, zombies: number, together: boolean): { flanked: number; arrived: number; meanDeg: number } {
  const rng = createRng(seed);
  const spawns: { x: number; y: number }[] = [];
  for (let i = 0; i < zombies; i++) {
    const deg = rng.range(-40, 40); // in front of the line, within its aim
    const r = rng.range(13, 16);
    spawns.push({ x: 10 + Math.cos((deg * Math.PI) / 180) * r, y: 16 + Math.sin((deg * Math.PI) / 180) * r });
  }
  let flanked = 0;
  let arrived = 0;
  let sumDeg = 0;
  const runOnce = (batch: readonly { x: number; y: number }[]) => {
    const w = createWorld({ balance, seed, systems: NO_WAVES });
    w.debug.godMode = true;
    const ps = players.map((p, i) => facing(w, `p${i}`, p.x, p.y, 1, 0));
    const ids = batch.map((s) => spawnZombie(w, type, s.x, s.y));
    const done = new Set<number>();
    const speed = balance.zombies.types[type]?.speedMps ?? 1;
    const maxTicks = Math.ceil((30 / speed) / TICK_DT_S);
    for (let t = 0; t < maxTicks && done.size < ids.length; t++) {
      for (let i = 0; i < ps.length; i++) aimAt(w, `p${i}`, t + 1, 1, 0);
      step(w, TICK_DT_S);
      for (const id of ids) {
        if (done.has(id)) continue;
        const x = w.zombies.x[id] as number;
        const y = w.zombies.y[id] as number;
        for (const p of ps) {
          const dx = x - p.x;
          const dy = y - p.y;
          if (Math.sqrt(dx * dx + dy * dy) > 0.35 + p.radiusM + 0.05) continue;
          done.add(id);
          arrived++;
          const deg = angleFromAim(p, x, y);
          sumDeg += deg;
          if (deg > 45) flanked++;
          break;
        }
      }
    }
  };
  if (together) runOnce(spawns);
  else for (const s of spawns) runOnce([s]);
  return { flanked, arrived, meanDeg: arrived > 0 ? sumDeg / arrived : 0 };
}

describe("Runners flank (Story 3.8, epics AC 3, fixed seed)", () => {
  const ONE = [{ x: 10, y: 16 }];
  const LINE = [
    { x: 10, y: 14.5 },
    { x: 10, y: 17.5 },
  ];
  type Share = ReturnType<typeof flankShare>;
  const report = (name: string, r: Share, wk: Share) =>
    log(
      `[flank] ${name}: Runners ${r.flanked}/${r.arrived} from the flank (mean ${r.meanDeg.toFixed(0)}° off the aim), ` +
        `Walkers ${wk.flanked}/${wk.arrived} (mean ${wk.meanDeg.toFixed(0)}°)`,
    );

  it("one player, 12 zombies one at a time from in front: Runners reach the flank far more often than Walkers", () => {
    const r = flankShare("runner", ONE, 38, 12, false);
    const wk = flankShare("walker", ONE, 38, 12, false);
    report("one player, one at a time", r, wk);
    expect(r.arrived).toBe(12);
    expect(wk.arrived).toBe(12);
    expect(r.flanked).toBeGreaterThan(wk.flanked);
    expect(r.flanked).toBeGreaterThanOrEqual(10);
    expect(wk.flanked).toBeLessThanOrEqual(2);
  });

  it("one player, 12 at once (a crowd): still more Runners on the flank", () => {
    const r = flankShare("runner", ONE, 38, 12, true);
    const wk = flankShare("walker", ONE, 38, 12, true);
    report("one player, crowd of 12", r, wk);
    expect(r.flanked).toBeGreaterThan(wk.flanked);
    expect(r.flanked / Math.max(1, r.arrived)).toBeGreaterThan(0.6);
  });

  it("a two-player front line facing the zombies: Runners go round its ends or behind", () => {
    const r = flankShare("runner", LINE, 5, 12, false);
    const wk = flankShare("walker", LINE, 5, 12, false);
    report("two-player line, one at a time", r, wk);
    expect(r.flanked).toBeGreaterThan(wk.flanked);
    expect(r.flanked).toBeGreaterThanOrEqual(9);
  });
});

describe("determinism with Runners (Story 3.8)", () => {
  it("the same seed with Runners, Walkers and buildings gives identical snapshots (both fields included)", () => {
    const sim = () => {
      const w = createWorld({ balance, seed: 42, systems: NO_WAVES });
      w.debug.godMode = true;
      addPlayer(w, "p0", 20, 16);
      addPlayer(w, "p1", 26, 18);
      addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 30 / BUILD_GRID_M, gy: 14 / BUILD_GRID_M, rot: 1, hp: 200 });
      for (let k = 0; k < 8; k++) spawnZombie(w, k % 2 === 0 ? "runner" : "walker", 40 + (k % 3), 4 + k * 3);
      for (let i = 0; i < 300; i++) {
        const a = i * 0.07;
        setInput(w, "p0", { ...NEUTRAL_INPUT, seq: i + 1, moveX: Math.cos(a) * 0.4, aimX: Math.cos(a), aimY: Math.sin(a) });
        setInput(w, "p1", { ...NEUTRAL_INPUT, seq: i + 1, aimX: -1, aimY: Math.sin(a) });
        step(w, TICK_DT_S);
      }
      return w;
    };
    const a = sim();
    const b = sim();
    expect(a.pathing.flank.rebuilds).toBeGreaterThan(10);
    expect(a.zombies.type.includes(zombieTypeIndex("runner"))).toBe(true);
    expect(snapshotWorld(a)).toEqual(snapshotWorld(b));
  });
});
