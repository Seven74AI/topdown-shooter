import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, REWIND_MAX_TICKS, TICK_DT_S, ZOMBIE_HISTORY_TICKS } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer, type PlayerState } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt } from "../buildings/buildings";
import { setLoadout } from "./loadout";
import { placeBoss } from "../boss/testBoss";
import { rewindTicksFor, rewoundView, setZombieHistoryEnabled } from "./rewind";
import type { WeaponId } from "./weapons";

/** Story 2.12: rewound hit testing. One mechanic per test: no waves, zombies only move when a test moves them. */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const Y = 16;

type Hit = Extract<SimEvent, { type: "zombie.hit" }>;

function setup(weapon: WeaponId, opts: { lagComp?: boolean } = {}) {
  const world = createWorld({ balance, seed: 1, systems: STILL });
  const on = opts.lagComp !== false;
  setZombieHistoryEnabled(world, on);
  const p = addPlayer(world, "p0", 5, Y);
  p.hp = 1e9;
  p.rewindMaxTicks = on ? REWIND_MAX_TICKS : 0;
  setLoadout(balance, p.loadout, [weapon, null]);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  let seq = 0;
  const idle = (n: number): void => {
    for (let i = 0; i < n; i++) {
      setInput(world, "p0", { ...NEUTRAL_INPUT, seq: ++seq });
      step(world, TICK_DT_S);
    }
  };
  /** One step firing along (aimX, aimY) with the given view tick (mouse aim: no assist unless `touch`). */
  const fire = (viewTick: number, aimX = 1, aimY = 0, touch = false): void => {
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: ++seq, aimX, aimY, fire: true, isMouse: !touch, viewTick: wire(viewTick) });
    step(world, TICK_DT_S);
  };
  const muzzleX = p.x + p.radiusM + 0.1;
  const hits = (): Hit[] => events.filter((e): e is Hit => e.type === "zombie.hit");
  const move = (id: number, x: number, y: number): void => {
    world.zombies.x[id] = world.zombies.prevX[id] = x;
    world.zombies.y[id] = world.zombies.prevY[id] = y;
  };
  return { world, p, events, idle, fire, muzzleX, hits, move };
}

/** A view tick in ticks → the wire's hundredths (review L5). */
const wire = (viewTick: number): number => (viewTick < 0 ? -1 : Math.round(viewTick * 100));
const input = (viewTick: number): PlayerInput => ({ ...NEUTRAL_INPUT, viewTick: wire(viewTick) });

describe("rewound hit testing (Story 2.12)", () => {
  it("a shot is tested where the zombie was at the shooter's view tick: hit with the rewind, miss without", () => {
    for (const mode of ["rewind", "no view tick", "lag comp off"] as const) {
      const { world, idle, fire, muzzleX, hits, move } = setup("hunting_rifle", { lagComp: mode !== "lag comp off" });
      const id = spawnZombie(world, "walker", muzzleX + 2, Y);
      idle(3); // rows 1–3: on the line
      move(id, muzzleX + 2, Y + 2); // then 2 m to the side (rows 4, 5 and now)
      idle(2);
      fire(mode === "no view tick" ? -1 : 2); // the shooter drew tick 2
      expect(hits().length, mode).toBe(mode === "rewind" ? 1 : 0);
    }
  });

  it("damage, pushback and the hit event apply to the present zombie", () => {
    const { world, idle, fire, muzzleX, hits, move } = setup("hunting_rifle");
    const id = spawnZombie(world, "walker", muzzleX + 2, Y);
    world.zombies.hp[id] = 100;
    idle(3);
    move(id, muzzleX + 2.5, Y + 2);
    idle(2);
    fire(2);
    const [h] = hits();
    expect(h?.zombieId).toBe(id);
    expect(h?.x).toBeCloseTo(muzzleX + 2.5 + (balance.weapons.hunting_rifle?.hitPushbackM ?? 0), 4); // pushed along the shot from where it is now
    expect(h?.y).toBeCloseTo(Y + 2, 4);
    expect(world.zombies.hp[id]).toBe(100 - (balance.weapons.hunting_rifle?.damage ?? 0));
  });

  it("the rewind is clamped to the cap; a future view tick, none, or a history that doesn't reach back give 0", () => {
    const { world, p, idle } = setup("pistol");
    idle(15); // world.tick 15, rows 4–15 (Story 8.8: 12 rows; was idle(10) for the 6-tick window)
    expect(rewindTicksFor(world, p, input(12.5))).toBeCloseTo(2.5, 6);
    expect(rewindTicksFor(world, p, input(1))).toBe(REWIND_MAX_TICKS);
    expect(rewindTicksFor(world, p, input(17))).toBe(0);
    expect(rewindTicksFor(world, p, input(-1))).toBe(0);
    p.rewindMaxTicks = 2;
    expect(rewindTicksFor(world, p, input(1))).toBe(2);
    setZombieHistoryEnabled(world, false);
    setZombieHistoryEnabled(world, true); // a fresh history: nothing to rewind into yet
    p.rewindMaxTicks = REWIND_MAX_TICKS;
    expect(rewindTicksFor(world, p, input(12.5))).toBe(0);
  });

  it("past the cap, the rest of the view offset is the 2.7 shot advance (never more than the shooter's)", () => {
    const { world, p, idle, fire } = setup("hunting_rifle");
    p.shotAdvanceS = 0.15;
    idle(15); // Story 8.8: enough ticks for the 10-tick window + 2 (was idle(10))
    fire(15 - REWIND_MAX_TICKS - 2); // 2 ticks past the cap → 0.1 s of advance
    const pool = world.projectiles;
    const pid = pool.aliveIds[0] as number;
    expect(pool.rewindTicks[pid]).toBe(REWIND_MAX_TICKS);
    expect(pool.x[pid]).toBeCloseTo(p.x + p.radiusM + 0.1 + 60 * TICK_DT_S + 60 * 0.1, 3);
    // Within the cap: no advance at all.
    const { world: w2, p: p2, idle: idle2, fire: fire2 } = setup("hunting_rifle");
    p2.shotAdvanceS = 0.15;
    idle2(10);
    fire2(7);
    const id2 = w2.projectiles.aliveIds[0] as number;
    expect(w2.projectiles.advanceM[id2]).toBe(0);
    expect(w2.projectiles.x[id2]).toBeCloseTo(p2.x + p2.radiusM + 0.1 + 60 * TICK_DT_S, 3);
  });

  it("a zombie dead now is not hit: the bullet flies on to the one behind it", () => {
    const { world, idle, fire, muzzleX, hits } = setup("pistol"); // pierce 1
    const front = spawnZombie(world, "walker", muzzleX + 1.5, Y);
    const back = spawnZombie(world, "walker", muzzleX + 2.5, Y);
    idle(4);
    killZombie(world, front, "p1", "pistol"); // a teammate killed it after the shooter's view tick
    idle(1);
    fire(2);
    expect(hits().map((h) => h.zombieId)).toEqual([back]);
  });

  it("a slot reused since the view tick is not hit (generation check)", () => {
    const { world, idle, fire, muzzleX, hits, move } = setup("hunting_rifle");
    const id = spawnZombie(world, "walker", muzzleX + 2, Y);
    idle(3);
    move(id, muzzleX + 2, Y + 2);
    world.zombies.generation[id] = ((world.zombies.generation[id] as number) + 1) & 0xff; // as if freed and respawned
    idle(2);
    fire(2);
    expect(hits()).toEqual([]);
  });

  it("a zombie that did not exist at the view tick is not hit by the rewound sweep", () => {
    const { world, idle, fire, muzzleX, hits } = setup("hunting_rifle");
    idle(3);
    spawnZombie(world, "walker", muzzleX + 2, Y); // spawned on the line after tick 2
    idle(1);
    fire(1);
    expect(hits()).toEqual([]);
  });

  it("every sweep keeps the shooter's offset: a far zombie is met where it was when the cosmetic bullet got there", () => {
    const { world, idle, fire, muzzleX, hits, move } = setup("hunting_rifle");
    const id = spawnZombie(world, "walker", muzzleX + 7.5, Y); // reached in the 3rd sweep (3 m each)
    idle(6); // rows 1–6 on the line
    move(id, muzzleX + 7.5, Y + 2); // now, and from row 7 on, beside it
    idle(1); // tick 7
    fire(2); // rewind 5: sweeps at 2.5, 3.5, 4.5 (all on the line)
    idle(3);
    expect(hits().map((h) => h.zombieId)).toEqual([id]);
  });

  it("melee swings at the rewound position; the hit lands on the present zombie", () => {
    const { world, p, idle, fire, hits, move } = setup("machete");
    const id = spawnZombie(world, "walker", p.x + 1.2, Y);
    world.zombies.hp[id] = 100;
    idle(3);
    move(id, p.x + 4, Y); // now out of reach
    idle(2);
    fire(2);
    expect(hits().map((h) => h.zombieId)).toEqual([id]);
    expect(hits()[0]?.x).toBeCloseTo(p.x + 4 + (balance.weapons.machete?.hitPushbackM ?? 0), 4);
    // Without the rewind the same swing misses.
    const s = setup("machete");
    const id2 = spawnZombie(s.world, "walker", s.p.x + 1.2, Y);
    s.idle(3);
    s.move(id2, s.p.x + 4, Y);
    s.idle(2);
    s.fire(-1);
    expect(s.hits()).toEqual([]);
  });

  it("server touch aim assist bends toward the rewound position", () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    for (const viewTick of [1, -1]) {
      const { world, p, idle, fire, hits, move } = setup("hunting_rifle");
      const ox = p.x + p.radiusM + 0.1;
      const id = spawnZombie(world, "walker", ox + 6 * Math.cos(deg(5)), Y + 6 * Math.sin(deg(5))); // 5° off the aim
      idle(4);
      move(id, ox + 6 * Math.cos(deg(30)), Y + 6 * Math.sin(deg(30))); // now 30°: outside the 8° cone
      idle(2);
      fire(viewTick, 1, 0, true);
      idle(3);
      expect(hits().length, `viewTick ${viewTick}`).toBe(viewTick >= 0 ? 1 : 0);
    }
  });

  it("turret shots are never rewound", () => {
    const world = createWorld({ balance, seed: 1, systems: STILL });
    setZombieHistoryEnabled(world, true);
    const p: PlayerState = addPlayer(world, "p0", 5, 5);
    p.rewindMaxTicks = REWIND_MAX_TICKS;
    startBuild(world);
    startWave(world);
    addBuildingAt(world, { id: 1, type: "auto_turret", ownerId: "p0", gx: 10 / BUILD_GRID_M, gy: 10 / BUILD_GRID_M, rot: 0, hp: 100 });
    const z = spawnZombie(world, "walker", 14, 11);
    world.zombies.hp[z] = 1e6;
    let seen = 0;
    for (let t = 0; t < 40; t++) {
      step(world, TICK_DT_S);
      const pool = world.projectiles;
      for (let i = 0; i < pool.aliveCount; i++) {
        const id = pool.aliveIds[i] as number;
        expect(pool.building[id]).toBeGreaterThan(0);
        expect(pool.rewindTicks[id]).toBe(0);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("two shooters at different view ticks in the same tick each hit what they saw (review L2: the memo is keyed by time)", () => {
    const { world, idle, fire, muzzleX, hits, move } = setup("hunting_rifle");
    const p1 = addPlayer(world, "p1", 5, Y + 8);
    p1.hp = 1e9;
    p1.rewindMaxTicks = REWIND_MAX_TICKS;
    setLoadout(balance, p1.loadout, ["hunting_rifle", null]);
    const a = spawnZombie(world, "walker", muzzleX + 2, Y); // on p0's line at rows 1–3
    const b = spawnZombie(world, "walker", muzzleX + 2, Y + 8 + 3); // off p1's line until row 5
    idle(3);
    move(a, muzzleX + 2, Y + 3);
    idle(1);
    move(b, muzzleX + 2, Y + 8); // on p1's line from row 5 on
    idle(1);
    move(b, muzzleX + 2, Y + 8 + 3); // and off again from row 7 on
    idle(2); // tick 7
    setInput(world, "p1", { ...NEUTRAL_INPUT, seq: 1, aimX: 1, aimY: 0, fire: true, isMouse: true, viewTick: wire(4.5) }); // sweeps at 5.0
    fire(2); // p0 sweeps at 2.5
    expect(hits().map((h) => h.zombieId).sort()).toEqual([a, b].sort());
  });

  it("the rewound view lerps between rows, keys its memo by time, and reads live positions (this tick's pushback) above the newest row", () => {
    const { world, idle } = setup("pistol");
    const z = spawnZombie(world, "walker", 10, Y);
    for (let t = 1; t <= 8; t++) {
      world.zombies.x[z] = 10 + t; // row t: x = 10 + t
      idle(1);
    }
    const at = (tick: number): number => rewoundView(world, tick)?.x[z] ?? Number.NaN;
    expect(at(3)).toBeCloseTo(13, 5);
    expect(at(5)).toBeCloseTo(15, 5); // same tick, other time: not the memo of 3
    expect(at(3.25)).toBeCloseTo(13.25, 5); // interpolated
    world.zombies.x[z] = 30; // pushed back earlier this tick
    expect(at(7.5)).toBeCloseTo(17 + (30 - 17) * 0.5, 4); // row 7 (17) → live (30), not row 8 (18)
    world.zombies.x[z] = 32; // another hit this tick: a view reading live positions is never memoised
    expect(at(7.5)).toBeCloseTo(17 + (32 - 17) * 0.5, 4);
    expect(rewoundView(world, 8)).toBeNull(); // now: the caller tests the live pool
  });

  it("solo records nothing: the history stays empty and the snapshot equals a fresh World's", () => {
    const world = createWorld({ balance, seed: 3, systems: { waves: noop } });
    const fresh = createWorld({ balance, seed: 3, systems: { waves: noop } });
    addPlayer(world, "p0", 5, Y);
    spawnZombie(world, "walker", 12, Y);
    for (let t = 0; t < 20; t++) step(world, TICK_DT_S);
    expect(snapshotWorld(world).zombieHistory).toEqual(snapshotWorld(fresh).zombieHistory);
    expect(world.zombieHistory.tickOf.every((t) => t === -1)).toBe(true);
  });

  it("is deterministic with the real zombie AI: two seeded runs give the same World (history included)", () => {
    const runOnce = (): ReturnType<typeof snapshotWorld> => {
      const world = createWorld({ balance, seed: 7, systems: { waves: noop } });
      setZombieHistoryEnabled(world, true);
      const p = addPlayer(world, "p0", 5, Y);
      p.hp = 1e9;
      p.rewindMaxTicks = REWIND_MAX_TICKS;
      setLoadout(balance, p.loadout, ["smg", null]);
      for (let i = 0; i < 12; i++) spawnZombie(world, i % 2 ? "runner" : "walker", 15 + i, 8 + i);
      for (let t = 1; t <= 120; t++) {
        setInput(world, "p0", { ...NEUTRAL_INPUT, seq: t, aimX: 1, aimY: Math.sin(t / 9) * 0.5, fire: true, isMouse: t % 2 === 0, viewTick: wire(world.tick - 4.37) });
        step(world, TICK_DT_S);
      }
      return snapshotWorld(world);
    };
    const a = runOnce();
    expect(a.zombieHistory.enabled).toBe(true);
    expect(a.zombieHistory.tickOf.filter((t) => t >= 0).length).toBe(ZOMBIE_HISTORY_TICKS); // Story 8.8: every row filled (14 rows since the 600 ms window, Story 8.9 T10; 12 at 500 ms, 8 before)
    expect(runOnce()).toEqual(a);
  });
});

/**
 * Story 8.8 (F2–F4, T5; network audit §3.5): the 500 ms window (600 ms since Story 8.9 T10, 8.9 B8). Only zombies (and the Behemoth) are
 * rewound; cover and barricades are tested where they are now; a dead zombie or a reused slot is
 * never hit; an older claimed view is clamped to the cap.
 */
describe("Story 8.8: the 500 ms (8.9: 600 ms) rewind window is fair", () => {
  it("the window is 12 ticks (600 ms, Story 8.9 T10); a view 14 ticks old (or tick 0) is clamped to 12, never more", () => {
    expect(REWIND_MAX_TICKS).toBe(12);
    expect(ZOMBIE_HISTORY_TICKS).toBe(14);
    const { world, p, idle } = setup("pistol");
    idle(20);
    expect(rewindTicksFor(world, p, input(world.tick - 8))).toBe(8); // inside the window: as asked
    expect(rewindTicksFor(world, p, input(world.tick - 14))).toBe(12);
    expect(rewindTicksFor(world, p, input(0))).toBe(12); // a modified client's "tick 0" buys nothing extra
    expect(rewindTicksFor(world, p, input(world.tick + 50))).toBe(0); // a future view: no rewind
  });

  /** A zombie on the shooter's line for rows 1..`onRows`, then 2 m to the side; returns its id. */
  const onLineThenAside = (s: ReturnType<typeof setup>, distM: number, onRows: number, asideRows: number): number => {
    const id = spawnZombie(s.world, "walker", s.muzzleX + distM, Y);
    s.world.zombies.hp[id] = 1e6;
    s.idle(onRows);
    s.move(id, s.muzzleX + distM, Y + 2);
    s.idle(asideRows);
    return id;
  };

  it("an 8-tick-old view hits the zombie where it was; a teammate standing on that spot now is not hurt", () => {
    const s = setup("hunting_rifle");
    const mate = addPlayer(s.world, "p1", s.muzzleX + 2, Y); // stands where the zombie was
    mate.hp = 100;
    const id = onLineThenAside(s, 2, 5, 7); // tick 12; on the line through row 5 (the sweep is tested at 4.5)
    s.fire(s.world.tick - 8); // the shooter drew tick 4
    expect(s.hits().map((h) => h.zombieId)).toEqual([id]); // the rewound zombie, damage to the present one
    // Review N1: documentation, not a guard — bullets have no player-hit path at all, so this cannot
    // fail; it records that the rewound shot hurts no teammate standing on the old spot.
    expect(mate.hp).toBe(100);
    expect(s.events.some((e) => e.type === "player.damaged" || e.type === "player.downed")).toBe(false);
    // Control: the same shot with no view tick hits nothing (the zombie is beside the line now).
    const c = setup("hunting_rifle");
    onLineThenAside(c, 2, 5, 7);
    c.fire(-1);
    expect(c.hits()).toEqual([]);
  });

  it("a zombie killed 3 ticks ago is not hit at its 8-ticks-ago spot; a slot reused since is not hit either", () => {
    const s = setup("hunting_rifle");
    const id = spawnZombie(s.world, "walker", s.muzzleX + 2, Y);
    s.idle(9);
    killZombie(s.world, id, "p1", "pistol");
    s.idle(3); // tick 12: dead for 3 ticks, on the line in every row
    s.fire(s.world.tick - 8);
    s.idle(2);
    expect(s.hits()).toEqual([]);
    // Reused slot (generation bumped, as a respawn would): an old-view shot does not hit the new zombie.
    const r = setup("hunting_rifle");
    const rid = spawnZombie(r.world, "walker", r.muzzleX + 2, Y);
    r.idle(4);
    r.move(rid, r.muzzleX + 2, Y + 2);
    r.world.zombies.generation[rid] = ((r.world.zombies.generation[rid] as number) + 1) & 0xff;
    r.idle(8);
    r.fire(r.world.tick - 8);
    r.idle(2);
    expect(r.hits()).toEqual([]);
  });

  it("a shot rewound 9 ticks still stops at a barricade standing there now (buildings are never rewound)", () => {
    for (const withBarricade of [false, true]) {
      const s = setup("hunting_rifle");
      const id = onLineThenAside(s, 2.5, 5, 8); // tick 13: on the line through row 5 (sweep at 4.5)
      if (withBarricade) {
        // A metal barricade across the line, between the muzzle and where the zombie was. Cover is
        // tested as it is NOW (review R4): a barricade standing now blocks; one that broke mid-wave in
        // the last 500 ms no longer blocks a rewound shot (decision 8.8 B1, accepted: team-only gain).
        addBuildingAt(s.world, { id: 1, type: "metal_barricade", ownerId: "p0", gx: Math.round((s.muzzleX + 1) / BUILD_GRID_M), gy: Math.round((Y - 1) / BUILD_GRID_M), rot: 1, hp: 600 });
        expect(s.world.buildings.list.length).toBe(1);
      }
      s.fire(s.world.tick - 9);
      s.idle(2);
      expect(s.hits().map((h) => h.zombieId), `barricade ${withBarricade}`).toEqual(withBarricade ? [] : [id]);
    }
  });

  it("the Behemoth is hit where it was 8 ticks ago (its own 12-row history); without a view tick it is missed", () => {
    for (const viewed of [true, false]) {
      const s = setup("hunting_rifle");
      placeBoss(s.world, s.muzzleX + 5, Y);
      s.world.boss.gapTicks = 1e9; // no attacks during this test
      s.world.boss.cooldown.slam = 1e9;
      s.world.boss.cooldown.charge = 1e9;
      s.world.boss.cooldown.throw = 1e9;
      expect(s.world.boss.histTick.length).toBe(ZOMBIE_HISTORY_TICKS);
      s.idle(14); // on the line through row 14
      for (let t = 0; t < 6; t++) {
        s.world.boss.y = Y + 8; // then far to the side (rows 15–20)
        s.idle(1);
      }
      const hp = s.world.boss.hp;
      s.fire(viewed ? s.world.tick - 8 : -1); // the shooter drew tick 12
      s.idle(3);
      if (viewed) expect(s.world.boss.hp, "rewound").toBeLessThan(hp);
      else expect(s.world.boss.hp, "live").toBe(hp);
    }
  });
});
