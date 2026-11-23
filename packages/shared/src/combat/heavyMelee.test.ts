import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import type { MeleeStats } from "../config/balanceSchema";
import { TICK_DT_S, ZOMBIE_POOL_CAPACITY } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createSpatialGrid, rebuildGrid } from "../core/spatialGrid";
import { createWorld, setInput, step, type World } from "../core/world";
import { DEG_TO_RAD } from "../math/vec";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { decodeNetEvent, encodeNetEvent } from "../net/netEvents";
import { addPlayer, type PlayerState } from "../player/player";
import { isZombieAlive, spawnZombie } from "../zombies/zombiePool";
import { knockbacks } from "./damage";
import { setLoadout } from "./loadout";
import { swingMelee } from "./melee";
import { weaponStats } from "./weapons";

/**
 * Story 5.2: the Fire Axe (30 dmg, 1.1/s, 2.2 m, 140°, knockback 1.5 m) and the Chainsaw (6 dmg,
 * 10/s, 1.5 m, 60°, quiet hits). One mechanic per test: no wave director; zombies stand still.
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const AXE = weaponStats(balance, "fire_axe") as MeleeStats;
const SAW = weaponStats(balance, "chainsaw") as MeleeStats;
const R = balance.zombies.types.walker?.radiusM ?? 0;
const PX = 10;
const PY = 16;

function setup(weapon: string) {
  const world = createWorld({ balance, seed: 1, systems: STILL });
  const p = addPlayer(world, "p0", PX, PY);
  p.hp = 1e9;
  setLoadout(balance, p.loadout, [weapon, "pistol"]);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  let seq = 0;
  const tick = (extra: Partial<PlayerInput> = {}) => {
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: ++seq, aimX: 1, aimY: 0, fire: true, ...extra });
    step(world, TICK_DT_S);
  };
  return { world, p, events, tick };
}
const at = (world: World, deg: number, dist: number, hp = 1e6) => {
  const id = spawnZombie(world, "walker", PX + Math.cos(deg * DEG_TO_RAD) * dist, PY + Math.sin(deg * DEG_TO_RAD) * dist);
  world.zombies.hp[id] = hp;
  return id;
};
const of = <T extends SimEvent["type"]>(events: SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const hpLost = (world: World, id: number) => 1e6 - (world.zombies.hp[id] as number);

describe("Arcs: what the arc shows is what gets hit (F1)", () => {
  for (const [name, w] of [["fire_axe", AXE], ["chainsaw", SAW]] as const) {
    it(`${name}: ${w.arcDeg}° / ${w.rangeM} m to the zombie's edge: inside, on the edge, outside`, () => {
      const s = setup(name);
      const half = w.arcDeg / 2;
      const inside = [at(s.world, 0, w.rangeM + R - 0.01), at(s.world, half - 1, 1.0), at(s.world, -(half - 1), 1.0)];
      // Body centre just outside the angle but its edge across the arc's side line: hit.
      const edge = at(s.world, half + 5, 1.0);
      const outside = [at(s.world, 0, w.rangeM + R + 0.02), at(s.world, half + 30, 1.0), at(s.world, 180, 1.0)];
      s.tick();
      for (const id of [...inside, edge]) expect(hpLost(s.world, id), `${name} ${id}`).toBe(w.damage);
      for (const id of outside) expect(hpLost(s.world, id), `${name} out ${id}`).toBe(0);
      // the drawn arc is the sim's sector: the swing event carries exactly these numbers
      const sw = of(s.events, "melee.swung")[0];
      expect(sw).toMatchObject({ weapon: name, arcDeg: w.arcDeg, rangeM: w.rangeM, dirX: 1, dirY: 0 });
    });
  }
});

describe("Chainsaw (F4)", () => {
  it("chainsaw ticks 10 times in 20 ticks, on every 2nd tick", () => {
    const s = setup("chainsaw");
    const swungAt: number[] = [];
    for (let t = 0; t < 200; t++) {
      const before = of(s.events, "melee.swung").length;
      s.tick();
      if (of(s.events, "melee.swung").length > before) swungAt.push(t);
    }
    expect(swungAt.length).toBe(100);
    expect(swungAt.slice(0, 10)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    for (let i = 1; i < swungAt.length; i++) expect((swungAt[i] as number) - (swungAt[i - 1] as number)).toBe(2);
  });

  it("60 damage per second per zombie in the arc at level I", () => {
    const s = setup("chainsaw");
    const ids = [at(s.world, 0, 1.0), at(s.world, 20, 1.2), at(s.world, -20, 0.8)];
    for (let t = 0; t < 20; t++) s.tick();
    for (const id of ids) expect(hpLost(s.world, id)).toBeCloseTo(60, 9);
  });

  it("chainsaw is continuous: a zombie walking in is hit on the next chainsaw tick", () => {
    const s = setup("chainsaw");
    const z = at(s.world, 0, 3);
    for (let t = 0; t < 6; t++) s.tick(); // swings on 0, 2, 4 hit nothing
    expect(hpLost(s.world, z)).toBe(0);
    s.world.zombies.x[z] = PX + 1.2; // walks into the arc between ticks 5 and 6
    s.tick(); // tick 6: a chainsaw tick
    expect(hpLost(s.world, z)).toBe(6);
  });

  it("quiet hits: no zombie.hit per zombie per tick, one melee.swung with the hit count; kills and credit as usual", () => {
    const s = setup("chainsaw");
    const p1 = addPlayer(s.world, "p1", PX, PY + 5);
    void p1;
    const ids = [at(s.world, 0, 1.0, 12), at(s.world, 15, 1.2, 1e6), at(s.world, -15, 1.2, 1e6)];
    for (let t = 0; t < 4; t++) s.tick(); // 2 chainsaw ticks: 12 damage each → the first dies
    expect(of(s.events, "zombie.hit")).toHaveLength(0);
    const swings = of(s.events, "melee.swung");
    expect(swings.map((e) => e.hits)).toEqual([3, 3]);
    const kills = of(s.events, "zombie.killed");
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({ zombieId: ids[0], killerId: "p0", weapon: "chainsaw" });
    expect(isZombieAlive(s.world.zombies, ids[0] as number)).toBe(false);
    const earned = of(s.events, "money.earned");
    expect(earned.some((e) => e.playerId === "p0" && e.reason === "kill")).toBe(true);
    // the assist credit is recorded without the event: a pistol kill after a chainsaw cut pays p0 an assist
    const z = ids[1] as number;
    s.world.zombies.hp[z] = 1;
    s.p.loadout.active = 1; // p0 holds the pistol now (no more cuts)
    s.world.players.get("p1")!.x = PX + 1.2 + 3;
    s.world.players.get("p1")!.y = PY + Math.sin(15 * DEG_TO_RAD) * 1.2;
    setLoadout(balance, s.world.players.get("p1")!.loadout, ["hunting_rifle", null]);
    s.events.length = 0;
    for (let t = 0; t < 10 && isZombieAlive(s.world.zombies, z); t++) {
      setInput(s.world, "p0", { ...NEUTRAL_INPUT, seq: 100 + t });
      setInput(s.world, "p1", { ...NEUTRAL_INPUT, seq: 1 + t, aimX: -1, aimY: 0, fire: true, isMouse: true });
      step(s.world, TICK_DT_S);
    }
    expect(isZombieAlive(s.world.zombies, z)).toBe(false);
    expect(of(s.events, "money.earned").some((e) => e.playerId === "p0" && e.reason === "assist")).toBe(true);
  });

  it("the hit count travels on the wire for quiet weapons only (the machete's swing is unchanged)", () => {
    const ctx = { balance };
    const saw: SimEvent = { type: "melee.swung", playerId: "p1", weapon: "chainsaw", x: 3, y: 4, dirX: 1, dirY: 0, arcDeg: 60, rangeM: 1.5, hits: 4 };
    const enc = encodeNetEvent(saw, ctx);
    expect(enc).toHaveLength(7);
    expect(decodeNetEvent(enc as number[], ctx)).toMatchObject({ weapon: "chainsaw", hits: 4, arcDeg: 60, rangeM: 1.5 });
    const machete: SimEvent = { type: "melee.swung", playerId: "p1", weapon: "machete", x: 3, y: 4, dirX: 1, dirY: 0, arcDeg: 110, rangeM: 1.8 };
    const em = encodeNetEvent(machete, ctx);
    expect(em).toHaveLength(6);
    expect(decodeNetEvent(em as number[], ctx)).not.toHaveProperty("hits");
  });
});

describe("Fire Axe knockback in the swing (F2, F3)", () => {
  it("axe knocks back exactly 1.5 m in the open, along swinger → zombie", () => {
    const s = setup("fire_axe");
    const a = at(s.world, 0, 1.5);
    const b = at(s.world, 50, 1.2);
    s.tick();
    expect(s.world.zombies.x[a]).toBeCloseTo(PX + 3.0, 5);
    expect(s.world.zombies.y[a]).toBeCloseTo(PY, 5);
    const bx = (s.world.zombies.x[b] as number) - PX;
    const by = (s.world.zombies.y[b] as number) - PY;
    expect(Math.hypot(bx, by)).toBeCloseTo(2.7, 5);
    expect(Math.atan2(by, bx) / DEG_TO_RAD).toBeCloseTo(50, 3);
    expect(hpLost(s.world, a)).toBe(30);
  });

  it("one push per zombie per swing; the next push only on the next swing", () => {
    const s = setup("fire_axe");
    const a = at(s.world, 0, 1.0);
    const before = knockbacks.applied;
    s.tick();
    expect(knockbacks.applied - before).toBe(1);
    expect(s.world.zombies.x[a]).toBeCloseTo(PX + 2.5, 5);
    // 1.1/s: the next swing is 19 ticks later; by then the zombie is out of reach (no second push)
    s.world.zombies.x[a] = PX + 1.0;
    let ticks = 0;
    while (of(s.events, "melee.swung").length < 2 && ticks < 40) {
      s.tick();
      ticks++;
    }
    expect(knockbacks.applied - before).toBe(2);
    expect(s.world.zombies.x[a]).toBeCloseTo(PX + 2.5, 5);
  });

  it("killed zombies are not moved", () => {
    const s = setup("fire_axe");
    const a = at(s.world, 0, 1.0, 30); // dies to the 30
    const before = knockbacks.applied;
    s.tick();
    expect(isZombieAlive(s.world.zombies, a)).toBe(false);
    expect(knockbacks.applied - before).toBe(0);
    const k = of(s.events, "zombie.killed")[0];
    expect(k).toMatchObject({ weapon: "fire_axe", x: PX + 1.0, y: PY });
  });

  it("the machete keeps its small pushback and never knocks back", () => {
    const s = setup("machete");
    const a = at(s.world, 0, 1.0);
    const before = knockbacks.applied;
    s.tick();
    expect(knockbacks.applied - before).toBe(0);
    expect(s.world.zombies.x[a]).toBeCloseTo(PX + 1.25, 5);
  });

  it("rewound swing pushes the present zombie along the rewound direction", () => {
    const s = setup("fire_axe");
    const z = at(s.world, 0, 1.0);
    // The view (what the swinger saw): the zombie straight east at 1 m; the present one has moved 1 m north.
    const vx = new Float32Array(ZOMBIE_POOL_CAPACITY);
    const vy = new Float32Array(ZOMBIE_POOL_CAPACITY);
    vx[z] = PX + 1.0;
    vy[z] = PY;
    const grid = createSpatialGrid(s.world.map, 2, ZOMBIE_POOL_CAPACITY);
    rebuildGrid(grid, s.world.zombies.aliveIds, s.world.zombies.aliveCount, vx, vy);
    s.world.zombies.y[z] = PY + 1.0;
    rebuildGrid(s.world.zombieGrid, s.world.zombies.aliveIds, s.world.zombies.aliveCount, s.world.zombies.x, s.world.zombies.y);
    expect(swingMelee(s.world, s.p as PlayerState, "fire_axe", AXE, AXE.damage, 1, 0, { x: vx, y: vy, grid })).toBe(1);
    expect(s.world.zombies.x[z]).toBeCloseTo(PX + 2.5, 5); // +1.5 east (the rewound direction)
    expect(s.world.zombies.y[z]).toBeCloseTo(PY + 1.0, 5); // from the present position
  });

  it("the local player's own axe swing is a screenShake weapon (the chainsaw is not)", () => {
    expect(AXE.screenShake).toBe(true);
    expect(SAW.screenShake).toBe(false);
  });
});

describe("Story 5.1 × 5.2: axe swings and chainsaw ticks deal weaponDamage(level)", () => {
  it("Chainsaw IV cuts 10.5 per tick (a Walker dies in one tick), Fire Axe III swings 45", () => {
    const s = setup("chainsaw");
    s.p.loadout.slots[0].level = 4;
    const walker = at(s.world, 0, 1.0, 10);
    const tough = at(s.world, 15, 1.1);
    s.tick();
    expect(isZombieAlive(s.world.zombies, walker)).toBe(false);
    expect(hpLost(s.world, tough)).toBeCloseTo(10.5, 9);
    const a = setup("fire_axe");
    a.p.loadout.slots[0].level = 3;
    const z = at(a.world, 0, 1.0);
    a.tick();
    expect(hpLost(a.world, z)).toBeCloseTo(45, 9);
  });
});

