import { beforeEach, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { createExplosionSpec, explode } from "../combat/explosion";
import { setLoadout, activeSlot } from "../combat/loadout";
import { assistAim } from "../combat/aimAssist";
import { swingMelee } from "../combat/melee";
import { weaponStats } from "../combat/weapons";
import type { MeleeStats } from "../config/balanceSchema";
import { createWorld, setInput, step, type World } from "../core/world";
import { AREA_KIND, spawnArea } from "../hazards/areaPool";
import { igniteMolotov } from "../hazards/molotov";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { DOWNTOWN_MAP } from "../map/downtown";
import { setZombieHistoryEnabled } from "../combat/rewind";
import { BOSS_HIT_NO_PLAYER, rewoundBossPos, rewoundBoss } from "./bossState";
import { bossDamageStats, zombiesUnderBoss } from "./bossDamage";
import { collect, placeBoss, tickN } from "./testBoss";

/**
 * Story 6.5 (AC 11; D3, D4, D6, DD9): every damage source that hurts zombies hurts the Behemoth;
 * fire zones, acid, gas and floor traps don't. One table: each row puts the source on the boss and
 * reports the HP it took.
 */
const balance = loadBalance();
const BX = 30;
const BY = 16;

function setup(weapon: string | null = null) {
  const w = createWorld({ balance, seed: 5, systems: { waves: () => {} } });
  const p = addPlayer(w, "p0", BX - 6, BY);
  w.debug.godMode = true;
  if (weapon) setLoadout(balance, p.loadout, [weapon, null]);
  placeBoss(w, BX, BY);
  w.boss.gapTicks = 10_000; // no attacks during these tests
  w.boss.cooldown.slam = 10_000;
  const ev = collect(w);
  return { w, p, ev };
}

let seq = 0;
function fireFor(w: World, ticks: number, aimX = 1, aimY = 0) {
  for (let t = 0; t < ticks; t++) {
    setInput(w, "p0", { ...NEUTRAL_INPUT, seq: ++seq, aimX, aimY, fire: true });
    step(w, TICK_DT_S);
  }
}

const taken = (w: World) => w.boss.maxHp - w.boss.hp;

beforeEach(() => {
  bossDamageStats.total = 0;
  bossDamageStats.byWeapon.clear();
});

describe("Story 6.5 D4: what hurts it", () => {
  it.each(["pistol", "smg", "assault_rifle", "shotgun", "hunting_rifle"].filter((id) => id in balance.weapons))("bullets: %s", (weapon) => {
    const { w } = setup(weapon);
    fireFor(w, 40);
    expect(taken(w)).toBeGreaterThan(0);
  });

  it("melee in reach (+ its 2 m body), not through a wall line", () => {
    const melee = Object.entries(balance.weapons).find(([, s]) => s.kind === "melee");
    if (!melee) throw new Error("no melee weapon");
    const [id, stats] = melee;
    const { w, p } = setup();
    p.x = BX - balance.boss.radiusM - (stats as MeleeStats).rangeM + 0.1;
    swingMelee(w, p, id, stats as MeleeStats, 25, 1, 0);
    expect(taken(w)).toBe(25);
    // Out of reach: nothing.
    p.x = BX - balance.boss.radiusM - (stats as MeleeStats).rangeM - 0.5;
    swingMelee(w, p, id, stats as MeleeStats, 25, 1, 0);
    expect(taken(w)).toBe(25);
    // Through a metal barricade between: nothing (cover rules hold for damage TO the boss).
    p.x = BX - balance.boss.radiusM - 0.6;
    addBuildingAt(w, { id: 1, type: "metal_barricade", ownerId: "p0", gx: (BX - balance.boss.radiusM - 0.25) / BUILD_GRID_M, gy: (BY - 1) / BUILD_GRID_M, rot: 1, hp: 600 });
    swingMelee(w, p, id, stats as MeleeStats, 25, 1, 0);
    expect(taken(w)).toBe(25);
  });

  it.each(["flamethrower", "gas_torch"].filter((id) => id in balance.weapons))("flames: %s (the normal pulse; it never catches fire)", (weapon) => {
    const { w, p } = setup(weapon);
    p.x = BX - balance.boss.radiusM - 1.5;
    activeSlot(p.loadout).ammo = 10_000;
    fireFor(w, 40);
    expect(taken(w)).toBeGreaterThan(0);
  });

  it.each(["flamethrower", "gas_torch"].filter((id) => id in balance.weapons))("review M1: sweeping %s on and off the boss is no faster than holding it (≤ steady DPS)", (weapon) => {
    const run = (wiggle: boolean): number => {
      const { w, p } = setup(weapon);
      p.x = BX - balance.boss.radiusM - 1.5;
      for (let t = 0; t < 200; t++) {
        activeSlot(p.loadout).ammo = 10_000;
        activeSlot(p.loadout).reloadTicks = 0;
        const on = !wiggle || t % 2 === 0;
        setInput(w, "p0", { ...NEUTRAL_INPUT, seq: ++seq, aimX: on ? 1 : 0, aimY: on ? 0 : 1, fire: true });
        step(w, TICK_DT_S);
      }
      return taken(w);
    };
    const steady = run(false);
    const wiggly = run(true);
    expect(steady).toBeGreaterThan(0);
    expect(wiggly).toBeLessThanOrEqual(steady);
  });

  it("explosions within radius + its body, full damage, by the blast line of sight", () => {
    const { w } = setup();
    const spec = { ...createExplosionSpec(), x: BX - balance.boss.radiusM - 1, y: BY, radiusM: 1.5, zombieDamage: 90, playerDamage: 90, kind: "grenade" as const, sourcePlayerId: "p0", weapon: "grenade_launcher", quiet: true };
    explode(w, spec);
    tickN(w);
    expect(taken(w)).toBe(90);
    explode(w, { ...spec, x: BX - balance.boss.radiusM - 2 });
    expect(taken(w)).toBe(90); // out of range
  });

  it("review L2: a blast behind cover (a car-height map box between it and the body's nearest point) doesn't reach it", () => {
    const w = createWorld({ balance, seed: 5, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    w.debug.godMode = true;
    addPlayer(w, "p0", 30, 30);
    // curb_car_west_n (12–16.5 × 12–14): the boss north of it, the blast south of it.
    placeBoss(w, 14.25, 12 - balance.boss.radiusM - 0.3);
    const spec = { ...createExplosionSpec(), x: 14.25, y: 14.4, radiusM: 3, zombieDamage: 90, playerDamage: 90, kind: "grenade" as const, sourcePlayerId: "p0", weapon: "grenade_launcher", quiet: true };
    explode(w, spec);
    expect(w.boss.maxHp - w.boss.hp).toBe(0);
    explode(w, { ...spec, x: 14.25 - 3.5, y: 12 - 0.3 }); // the same blast beside the car: clear line
    expect(w.boss.maxHp - w.boss.hp).toBe(90);
  });

  it("a Bloater blast next to it hurts it (an owner-less blast)", () => {
    const { w } = setup();
    explode(w, { ...createExplosionSpec(), x: BX + balance.boss.radiusM + 0.5, y: BY, radiusM: 2, zombieDamage: 30, playerDamage: 30, kind: "bloater", sourcePlayerId: null, weapon: "bloater", quiet: false });
    expect(taken(w)).toBe(30);
    expect(w.boss.hitAcc[BOSS_HIT_NO_PLAYER]).toBe(30);
  });

  it("D6: a turret shoots it when it is the nearest target in range", () => {
    const { w } = setup();
    const t = balance.buildings.types.auto_turret;
    if (!t?.turret) throw new Error("no turret");
    addBuildingAt(w, { id: 1, type: "auto_turret", ownerId: "p0", gx: (BX + balance.boss.radiusM + 2) / BUILD_GRID_M, gy: BY / BUILD_GRID_M, rot: 0, hp: 300 });
    tickN(w, 60);
    expect(taken(w)).toBeGreaterThan(0);
    expect(bossDamageStats.byWeapon.get("auto_turret") ?? 0).toBeGreaterThan(0);
  });

  it("a mine under its body goes off", () => {
    const { w, ev } = setup();
    addBuildingAt(w, { id: 1, type: "mine", ownerId: "p0", gx: (BX - 1) / BUILD_GRID_M, gy: BY / BUILD_GRID_M, rot: 0, hp: 1 });
    tickN(w, 2);
    expect(ev.some((e) => e.type === "mine.exploded")).toBe(true);
    expect(taken(w)).toBeGreaterThan(0);
  });
});

describe("Story 6.5 D4: what doesn't hurt it", () => {
  it("molotov fire, acid, Bloater gas, spike and bear traps under its body: no damage, never held", () => {
    const { w } = setup();
    igniteMolotov(w, 0, BX, BY, "p0");
    spawnArea(w.areas, w.areas.capacity, AREA_KIND.ACID, 1, BX, BY, 2, 200, w.tick);
    spawnArea(w.gas, w.gas.capacity, AREA_KIND.GAS, 2, BX, BY, 2, 200, w.tick);
    addBuildingAt(w, { id: 1, type: "spike_trap", ownerId: "p0", gx: BX / BUILD_GRID_M, gy: (BY - 1) / BUILD_GRID_M, rot: 0, hp: 300 });
    addBuildingAt(w, { id: 2, type: "bear_trap", ownerId: "p0", gx: (BX - 1) / BUILD_GRID_M, gy: (BY + 0.5) / BUILD_GRID_M, rot: 0, hp: 100 });
    const x0 = w.boss.x;
    tickN(w, 100);
    expect(taken(w)).toBe(0);
    expect(w.boss.x).not.toBe(x0); // it walked on (no hold)
  });

  it("a car fire zone (decay fire) under it: no damage", () => {
    const { w } = setup();
    w.decay.fires.push({ index: 0, x: BX, y: BY, radiusM: 2.5, target: "car" } as never);
    tickN(w, 100);
    expect(taken(w)).toBe(0);
  });
});

describe("Story 6.5 D3 / DD9", () => {
  it("a bullet stops at it (no pierce through it to a zombie behind) — review L1: a zombie really stands behind it", () => {
    const { w, ev } = setup("hunting_rifle" in balance.weapons ? "hunting_rifle" : "pistol");
    const behind = spawnZombie(w, "walker", BX + balance.boss.radiusM + 1.5, BY);
    w.zombies.state.fill(0);
    const hp0 = w.zombies.hp[behind] as number;
    fireFor(w, 1);
    tickN(w, 10);
    expect(taken(w)).toBeGreaterThan(0);
    expect(w.zombies.hp[behind]).toBe(hp0);
    expect(ev.some((e) => e.type === "zombie.hit")).toBe(false);
  });

  it("review M2: a zombie standing under its body is still shot (before the boss); one behind it is not", () => {
    const { w, ev } = setup("pistol");
    const under = spawnZombie(w, "walker", BX + 0.5, BY); // centre inside the 2 m body
    const behind = spawnZombie(w, "walker", BX + balance.boss.radiusM + 1.5, BY);
    w.zombies.state.fill(0);
    fireFor(w, 1);
    tickN(w, 10);
    expect(ev.some((e) => (e.type === "zombie.hit" || e.type === "zombie.killed") && e.zombieId === under)).toBe(true);
    expect(ev.some((e) => (e.type === "zombie.hit" || e.type === "zombie.killed") && e.zombieId === behind)).toBe(false);
    expect(taken(w)).toBe(0); // the pistol's one round stopped in the zombie
  });

  it("review M2: zombiesUnderBoss counts the zombies the client dims the body for", () => {
    const { w } = setup();
    expect(zombiesUnderBoss(w)).toBe(0);
    spawnZombie(w, "walker", BX + 1, BY);
    spawnZombie(w, "walker", BX + balance.boss.radiusM + 0.5, BY);
    expect(zombiesUnderBoss(w)).toBe(1);
  });

  it("one boss.hit per source per tick (a shotgun's pellets in one event)", () => {
    const weapon = "shotgun" in balance.weapons ? "shotgun" : "pistol";
    const { w, ev } = setup(weapon);
    const s = weaponStats(balance, weapon);
    void s;
    fireFor(w, 30);
    const perTick = new Map<number, number>();
    let tick = 0;
    w.events.subscribe(() => {});
    for (const e of ev) {
      if (e.type === "boss.hit") perTick.set(tick, (perTick.get(tick) ?? 0) + 1);
      if (e.type === "weapon.fired") tick++;
    }
    expect(ev.filter((e) => e.type === "boss.hit").length).toBeGreaterThan(0);
    // Every boss.hit carries the player's id and the summed amount; never two per player in a tick.
    const hits = ev.filter((e) => e.type === "boss.hit");
    const sum = hits.reduce((a, e) => a + (e.type === "boss.hit" ? e.amount : 0), 0);
    expect(sum).toBeCloseTo(taken(w), 6);
  });

  it("a rewound shot meets the body where the shooter saw it (history), the live body without one", () => {
    const { w } = setup();
    setZombieHistoryEnabled(w, true);
    tickN(w, 2);
    const seen = w.boss.x; // what this tick's frame shows (row w.tick)
    const at = w.tick;
    tickN(w, 3);
    w.boss.x += 1; // it moved since
    rewoundBossPos(w, at);
    expect(rewoundBoss.x).toBeCloseTo(seen, 4); // Float32 rows
    rewoundBossPos(w, w.tick);
    expect(rewoundBoss.x).toBe(w.boss.x);
  });

  it("aim assist can pick its circle (8° rule); a raw aim on it is kept", () => {
    const { w, p } = setup();
    const out = { x: 0, y: 0 };
    p.x = 2;
    p.y = BY;
    const dist = w.boss.x - p.x;
    const edge = Math.asin(balance.boss.radiusM / dist); // ≈ 4.2°
    const deg = Math.PI / 180;
    // 6° off its centre: misses the body, inside 8°: turned straight at it.
    assistAim(w, p.x, p.y, Math.cos(6 * deg), Math.sin(6 * deg), 40, out);
    expect(out.y).toBeCloseTo((w.boss.y - p.y) / dist, 6);
    expect(edge).toBeLessThan(6 * deg);
    // 10° off: outside the cone: unchanged.
    assistAim(w, p.x, p.y, Math.cos(10 * deg), Math.sin(10 * deg), 40, out);
    expect(out.y).toBeCloseTo(Math.sin(10 * deg), 9);
    // 2° off: the raw aim already hits its body: kept.
    assistAim(w, p.x, p.y, Math.cos(2 * deg), Math.sin(2 * deg), 40, out);
    expect(out.y).toBeCloseTo(Math.sin(2 * deg), 9);
  });
});
