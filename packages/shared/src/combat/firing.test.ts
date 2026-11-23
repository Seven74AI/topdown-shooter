import { describe, expect, it } from "vitest";
import { loadBalance, type RawBalanceFiles } from "../config/balance";
import weapons from "../config/balance/weapons.json" with { type: "json" };
import zombies from "../config/balance/zombies.json" with { type: "json" };
import waves from "../config/balance/waves.json" with { type: "json" };
import player from "../config/balance/player.json" with { type: "json" };
import controls from "../config/balance/controls.json" with { type: "json" };
import economy from "../config/balance/economy.json" with { type: "json" };
import bots from "../config/balance/bots.json" with { type: "json" };
import buildings from "../config/balance/buildings.json" with { type: "json" };
import shop from "../config/balance/shop.json" with { type: "json" };
import decay from "../config/balance/decay.json" with { type: "json" };
import combat from "../config/balance/combat.json" with { type: "json" };
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { activeSlot } from "./loadout";

/** These tests cover one mechanic: keep the wave director from spawning extra zombies. */
const NO_WAVES = { waves: () => {} };

/** Balance with no spread so shots are exact. */
function exactBalance() {
  const w = JSON.parse(JSON.stringify(weapons));
  for (const k of Object.keys(w)) if (w[k].kind === "gun") w[k].spreadDeg = 0;
  return loadBalance({ weapons: w, zombies, waves, player, controls, economy, bots, buildings, shop, decay, combat } as RawBalanceFiles);
}

const aimRight = (extra: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, aimX: 1, aimY: 0, fire: true, ...extra });

function setup(balance = exactBalance()) {
  const world = createWorld({ balance, seed: 1 , systems: NO_WAVES });
  const p = addPlayer(world, "local", 10, 16);
  p.hp = 1e9;
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, p, events };
}
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const count = (events: SimEvent[], type: SimEvent["type"]) => events.filter((e) => e.type === type).length;

describe("Pistol firing (FR3, FR6, FR15)", () => {
  it("starts the run with a full Pistol", () => {
    const { p } = setup();
    expect(activeSlot(p.loadout)).toMatchObject({ weapon: "pistol", ammo: 12 });
    expect(p.loadout.slots[1]).toBeNull();
  });

  it("fires 3 shots per second while aiming with fire held", () => {
    const { world, events } = setup();
    setInput(world, "local", aimRight());
    run(world, 20);
    expect(count(events, "weapon.fired")).toBe(3);
    run(world, 40);
    expect(count(events, "weapon.fired")).toBe(9); // exact average rate over 3 s
  });

  it("keeps the exact 3/s rate over a long window (30 shots in 10 s)", () => {
    const { world, p, events } = setup();
    activeSlot(p.loadout).ammo = 1000; // no reload in this window
    setInput(world, "local", aimRight());
    run(world, 200);
    expect(count(events, "weapon.fired")).toBe(30);
  });

  it("does not let an idle player save up a burst", () => {
    const { world, events } = setup();
    setInput(world, "local", aimRight({ fire: false }));
    run(world, 100);
    setInput(world, "local", aimRight());
    run(world, 7); // ticks 0..6: shots at 0 and at ~6.67 → only 2 by tick 7 at most
    expect(count(events, "weapon.fired")).toBeLessThanOrEqual(2);
  });

  it("does not fire without the fire flag (aiming below the dead zone)", () => {
    const { world, events } = setup();
    setInput(world, "local", aimRight({ fire: false }));
    run(world, 40);
    expect(count(events, "weapon.fired")).toBe(0);
  });

  it("reloads automatically after 12 shots, in 1.0 s, then resumes", () => {
    const { world, p, events } = setup();
    setInput(world, "local", aimRight());
    let tickOfReload = -1;
    let tickOfReloaded = -1;
    world.events.subscribe((e) => {
      if (e.type === "weapon.reload_started") tickOfReload = world.tick;
      if (e.type === "weapon.reloaded") tickOfReloaded = world.tick;
    });
    run(world, 80); // 12 shots take ~3.7 s
    expect(count(events, "weapon.fired")).toBe(12);
    expect(activeSlot(p.loadout).ammo).toBe(0);
    run(world, 20);
    expect(tickOfReloaded - tickOfReload).toBe(20);
    expect(activeSlot(p.loadout).ammo).toBeGreaterThanOrEqual(11);
    expect(count(events, "weapon.fired")).toBeGreaterThan(12);
  });

  it("finishes a reload even if the player stops aiming (reserve ammo is unlimited)", () => {
    const { world, p } = setup();
    activeSlot(p.loadout).ammo = 1;
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    setInput(world, "local", NEUTRAL_INPUT);
    run(world, 25);
    expect(activeSlot(p.loadout).ammo).toBe(12);
  });
});

describe("projectiles (FR14)", () => {
  it("fly at 60 m/s and vanish at 9 m", () => {
    const { world } = setup();
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    setInput(world, "local", NEUTRAL_INPUT);
    const pr = world.projectiles;
    expect(pr.aliveCount).toBe(1);
    const id = pr.aliveIds[0] as number;
    const startX = pr.prevX[id] as number;
    expect((pr.x[id] as number) - startX).toBeCloseTo(3, 4);
    expect(startX).toBeCloseTo(10 + 0.4 + 0.1, 4);
    run(world, 2);
    expect(pr.x[id]).toBeCloseTo(startX + 9, 4); // range cut exactly at 9 m
    step(world, TICK_DT_S);
    expect(pr.aliveCount).toBe(0);
  });

  it("can't tunnel: hits a Walker 5 m away although a step is 3 m long", () => {
    const { world, events } = setup();
    const id = spawnZombie(world, "walker", 15, 16);
    setInput(world, "local", aimRight());
    run(world, 2);
    expect(events.some((e) => e.type === "zombie.hit" && e.zombieId === id)).toBe(true);
  });

  it("misses a Walker standing just outside the line of fire (mouse aim: no assist)", () => {
    const { world, events } = setup();
    spawnZombie(world, "walker", 14, 16 + 0.36);
    setInput(world, "local", aimRight({ isMouse: true }));
    step(world, TICK_DT_S);
    setInput(world, "local", NEUTRAL_INPUT);
    run(world, 4);
    expect(count(events, "zombie.hit")).toBe(0);
  });

  it("stops at the first hit (pierce 1)", () => {
    const { world, events } = setup();
    spawnZombie(world, "walker", 13, 16);
    spawnZombie(world, "walker", 14, 16);
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    setInput(world, "local", NEUTRAL_INPUT);
    run(world, 3);
    const hits = events.filter((e) => e.type === "zombie.hit");
    expect(hits).toHaveLength(1);
    expect(world.projectiles.aliveCount).toBe(0);
  });

  it("applies spread from the seeded RNG, the same for the same seed", () => {
    const dirs = (seed: number) => {
      const world = createWorld({ balance: loadBalance(), seed , systems: NO_WAVES });
      addPlayer(world, "local", 10, 16);
      const out: number[] = [];
      world.events.subscribe((e) => e.type === "weapon.fired" && out.push(e.dirY));
      setInput(world, "local", aimRight());
      run(world, 40);
      return out;
    };
    const a = dirs(5);
    expect(a).toEqual(dirs(5));
    expect(a.some((y) => y !== 0)).toBe(true);
    for (const y of a) expect(Math.abs(Math.asin(y))).toBeLessThanOrEqual((1 * Math.PI) / 180 + 1e-6); // ±1° for 2° spread
  });
});

describe("projectile edge cases", () => {
  it("does not stop on a zombie that died earlier in the same tick", () => {
    const { world, events } = setup();
    const p2 = addPlayer(world, "p2", 10, 16.2);
    p2.hp = 1e9;
    const front = spawnZombie(world, "walker", 13, 16.1);
    world.zombies.hp[front] = 5; // dies to the first bullet
    const back = spawnZombie(world, "walker", 14.5, 16.1);
    setInput(world, "local", aimRight());
    setInput(world, "p2", aimRight());
    step(world, TICK_DT_S);
    setInput(world, "local", NEUTRAL_INPUT);
    setInput(world, "p2", NEUTRAL_INPUT);
    run(world, 3);
    const hitIds = events.filter((e) => e.type === "zombie.hit").map((e) => (e.type === "zombie.hit" ? e.zombieId : -1));
    expect(hitIds).toContain(front);
    expect(hitIds).toContain(back);
  });

  it("frees projectiles that leave the map", () => {
    const { world, p } = setup();
    p.x = 47;
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    setInput(world, "local", NEUTRAL_INPUT);
    run(world, 2);
    expect(world.projectiles.aliveCount).toBe(0);
  });

  it("hits a zombie the projectile spawns inside", () => {
    const { world, events } = setup();
    const id = spawnZombie(world, "walker", 10.6, 16);
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    expect(events.some((e) => e.type === "zombie.hit" && e.zombieId === id)).toBe(true);
  });
});

describe("damage and kills (FR19)", () => {
  it("kills a Walker in 2 Pistol hits, pushes it back, and credits the killer", () => {
    const { world, events } = setup();
    const id = spawnZombie(world, "walker", 13, 16);
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    const firstHit = events.find((e) => e.type === "zombie.hit");
    expect(firstHit).toMatchObject({ zombieId: id, damage: 5, weapon: "pistol" });
    run(world, 10);
    const kill = events.find((e) => e.type === "zombie.killed");
    expect(kill).toMatchObject({ zombieId: id, killerId: "local", weapon: "pistol" });
    expect(count(events, "zombie.hit")).toBe(2);
  });

  it("pushes the zombie back along the shot by hitPushbackM", () => {
    const { world } = setup();
    world.zombies.hp[spawnZombie(world, "walker", 13, 16)] = 1000;
    const before = world.zombies.x[0] as number;
    setInput(world, "local", aimRight());
    step(world, TICK_DT_S);
    // walked toward the player by 1.2 * 0.05 = 0.06 m, pushed back 0.15 m
    expect(world.zombies.x[0]).toBeCloseTo(before + 0.15 - 0.06, 3);
  });
});
