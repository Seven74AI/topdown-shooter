import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, REWIND_MAX_TICKS, TICK_DT_S } from "../config/constants";
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
import { rewindTicksFor, setZombieHistoryEnabled } from "./rewind";
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
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: ++seq, aimX, aimY, fire: true, isMouse: !touch, viewTick });
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

const input = (viewTick: number): PlayerInput => ({ ...NEUTRAL_INPUT, viewTick });

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
    idle(10); // world.tick 10, rows 3–10
    expect(rewindTicksFor(world, p, input(7.5))).toBeCloseTo(2.5, 6);
    expect(rewindTicksFor(world, p, input(1))).toBe(REWIND_MAX_TICKS);
    expect(rewindTicksFor(world, p, input(12))).toBe(0);
    expect(rewindTicksFor(world, p, input(-1))).toBe(0);
    p.rewindMaxTicks = 2;
    expect(rewindTicksFor(world, p, input(1))).toBe(2);
    setZombieHistoryEnabled(world, false);
    setZombieHistoryEnabled(world, true); // a fresh history: nothing to rewind into yet
    p.rewindMaxTicks = REWIND_MAX_TICKS;
    expect(rewindTicksFor(world, p, input(7.5))).toBe(0);
  });

  it("past the cap, the rest of the view offset is the 2.7 shot advance (never more than the shooter's)", () => {
    const { world, p, idle, fire } = setup("hunting_rifle");
    p.shotAdvanceS = 0.15;
    idle(10);
    fire(10 - REWIND_MAX_TICKS - 2); // 2 ticks past the cap → 0.1 s of advance
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
        setInput(world, "p0", { ...NEUTRAL_INPUT, seq: t, aimX: 1, aimY: Math.sin(t / 9) * 0.5, fire: true, isMouse: t % 2 === 0, viewTick: world.tick - 4.37 });
        step(world, TICK_DT_S);
      }
      return snapshotWorld(world);
    };
    const a = runOnce();
    expect(a.zombieHistory.enabled).toBe(true);
    expect(a.zombieHistory.tickOf.filter((t) => t >= 0).length).toBe(8);
    expect(runOnce()).toEqual(a);
  });
});
