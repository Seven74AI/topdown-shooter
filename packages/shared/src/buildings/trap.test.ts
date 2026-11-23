import { beforeEach, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, step, type World } from "../core/world";
import { addPlayer } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { isZombieAlive, spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt, buildingById, type Building } from "./buildings";
import { trapCounters, updateTraps } from "./trap";

/**
 * Story 5.9: spike traps (AC 2, F2, F3). One mechanic per test (no wave director). Zombies stand
 * still (`zombies` no-op) unless a test lets them walk; the trap system runs in the buildings slot.
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const TRAP = balance.buildings.types.spike_trap?.trap as NonNullable<NonNullable<typeof balance.buildings.types.spike_trap>["trap"]>;
const PULSE_TICKS = Math.round(TRAP.pulseS / TICK_DT_S);
const HIT = TRAP.damagePerS * TRAP.pulseS;
const WALKER = balance.zombies.types.walker as NonNullable<typeof balance.zombies.types.walker>;

function setup(systems: Record<string, SystemFn> = STILL) {
  const world = createWorld({ balance, seed: 1, systems });
  addPlayer(world, "p0", 40, 28);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  startWave(world);
  let nextId = 1;
  const place = (x: number, y: number, type = "spike_trap", ownerId = "p0") =>
    addBuildingAt(world, { id: nextId++, type, ownerId, gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: balance.buildings.types[type]?.hp ?? 1 }) as Building;
  return { world, events, place };
}
const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};

beforeEach(() => {
  trapCounters.pulses = trapCounters.kills = trapCounters.wornOut = 0;
});

describe("spike trap (Story 5.9)", () => {
  it("4 dmg per second of exposure (whole pulses of 2 every 0.5 s), on a per-zombie clock", () => {
    const { world, place } = setup();
    place(10, 10);
    const z = spawnZombie(world, "walker", 11, 11);
    world.zombies.hp[z] = 1000;
    run(world, PULSE_TICKS - 1);
    expect(world.zombies.hp[z]).toBe(1000); // not yet a whole pulse
    run(world, 1);
    expect(world.zombies.hp[z]).toBe(1000 - HIT);
    run(world, 20 * 10 - PULSE_TICKS); // 10 s total
    expect(world.zombies.hp[z]).toBe(1000 - 4 * 10);
    expect(trapCounters.pulses).toBe(20); // liveness
  });

  it("in 9 ticks, out 1, repeated: still 4/s of exposure (F2: walking on and off never dodges)", () => {
    const { world, place } = setup();
    place(10, 10);
    const z = spawnZombie(world, "walker", 11, 11);
    world.zombies.hp[z] = 1000;
    let onTicks = 0;
    for (let i = 0; i < 400; i++) {
      const on = i % 10 !== 9;
      world.zombies.x[z] = on ? 11 : 20;
      if (on) onTicks++;
      step(world, TICK_DT_S);
    }
    const expected = Math.floor(onTicks / PULSE_TICKS) * HIT;
    expect(1000 - (world.zombies.hp[z] as number)).toBe(expected);
    expect(expected).toBe(4 * (onTicks / 20)); // exactly 4 per second on the trap
  });

  it("60 % speed on the trap, full speed off it; the slow is per tick", () => {
    const { world, place } = setup({ waves: noop });
    place(10, 14); // 2 × 2 at [10,12] × [14,16]
    const z = spawnZombie(world, "walker", 10.5, 15);
    world.zombies.hp[z] = 1e6;
    const p = world.players.get("p0");
    if (!p) throw new Error("p0");
    p.x = 30;
    p.y = 15;
    step(world, TICK_DT_S);
    const onStep = (world.zombies.x[z] as number) - 10.5;
    expect(world.zombies.slowPct[z]).toBe(TRAP.slowPct);
    expect(onStep).toBeCloseTo(WALKER.speedMps * 0.6 * TICK_DT_S, 5);
    world.zombies.x[z] = 20;
    step(world, TICK_DT_S);
    expect(world.zombies.slowPct[z]).toBe(0);
    expect((world.zombies.x[z] as number) - 20).toBeCloseTo(WALKER.speedMps * TICK_DT_S, 5);
  });

  it("overlapping traps: one slow, one clock (no stacking)", () => {
    const { world, place } = setup();
    const a = place(10, 10);
    const b = place(12, 10); // touching a along x = 12
    const z = spawnZombie(world, "walker", 12, 11); // body over both
    world.zombies.hp[z] = 1000;
    run(world, 20 * 5);
    expect(world.zombies.slowPct[z]).toBe(TRAP.slowPct);
    expect(1000 - (world.zombies.hp[z] as number)).toBe(4 * 5);
    expect(a.maxHp - a.hp + (b.maxHp - b.hp)).toBe(10); // 10 hits charged once each
    expect(a.maxHp - a.hp).toBe(10); // to the lowest id
  });

  it("players are unharmed and unslowed on a trap", () => {
    const { world, place } = setup({ waves: noop, zombies: noop });
    place(10, 10);
    const p = world.players.get("p0");
    if (!p) throw new Error("p0");
    p.x = p.prevX = 11;
    p.y = p.prevY = 11;
    const hp = p.hp;
    run(world, 100);
    expect(p.hp).toBe(hp);
    expect(p.x).toBe(11); // never pushed out of a floor building
  });

  it("wear: 1 HP per hit, removed at 0 with building.destroyed", () => {
    const { world, events, place } = setup();
    const t = place(10, 10);
    t.hp = 3;
    const z = spawnZombie(world, "walker", 11, 11);
    world.zombies.hp[z] = 1000;
    run(world, PULSE_TICKS);
    expect(t.hp).toBe(2);
    run(world, PULSE_TICKS * 2);
    expect(buildingById(world, t.id)).toBeUndefined();
    expect(events.some((e) => e.type === "building.destroyed" && e.buildingId === t.id)).toBe(true);
    expect(trapCounters.wornOut).toBe(1);
    const hp = world.zombies.hp[z] as number;
    run(world, PULSE_TICKS * 3);
    expect(world.zombies.hp[z]).toBe(hp); // no trap, no damage
    expect(world.zombies.slowPct[z]).toBe(0);
  });

  it("a kill pays the owner the building share; the owner's own damage makes it theirs (3.6 M1)", () => {
    const { world, events, place } = setup();
    const t = place(10, 10, "spike_trap", "p0");
    const z = spawnZombie(world, "walker", 11, 11);
    world.zombies.hp[z] = HIT; // dies on the first pulse
    run(world, PULSE_TICKS);
    expect(isZombieAlive(world.zombies, z)).toBe(false);
    const kill = events.find((e) => e.type === "zombie.killed");
    expect(kill).toMatchObject({ killerId: "p0", buildingId: t.id, weapon: "spike_trap" });
    const paid = events.filter((e) => e.type === "money.earned" && e.playerId === "p0").reduce((s, e) => s + (e.type === "money.earned" ? e.amount : 0), 0);
    expect(paid).toBe(Math.floor(WALKER.reward * balance.economy.buildingKillShare));
    expect(trapCounters.kills).toBe(1);
  });

  it("the spike clock is zeroed at a build start (4.8 D19) and on spawn", () => {
    const { world, place } = setup();
    place(10, 10);
    const z = spawnZombie(world, "walker", 11, 11);
    world.zombies.hp[z] = 1000;
    run(world, PULSE_TICKS - 1);
    expect(world.zombies.trapTicks[z]).toBe(PULSE_TICKS - 1);
    startBuild(world); // the build start (decayMutate → resetBurnClocks)
    expect(world.zombies.trapTicks[z]).toBe(0);
    expect(world.zombies.x[z]).toBe(11); // a body on a trap is not "inside a box": never relocated
    updateTraps(world);
    expect(world.zombies.trapTicks[z]).toBe(1);
    const z2 = spawnZombie(world, "walker", 30, 20);
    expect(world.zombies.trapTicks[z2]).toBe(0);
  });

  it("fire wears a trap (4.8); a mine is immune", () => {
    const { world, place } = setup({ waves: noop, zombies: noop });
    const t = place(10, 10);
    const m = place(13, 10, "mine");
    world.decay.fires.push({ name: "test_fire", target: "test_car", x: 12, y: 11, radiusM: 3, stage: 3, index: 0 }); // both footprints inside
    run(world, 40);
    expect(t.hp).toBeLessThan(t.maxHp);
    expect(buildingById(world, m.id)).toBeDefined();
    expect(m.hp).toBe(m.maxHp);
  });

  it("review L3: a trap that wears out this tick stops hurting and slowing for the rest of the tick", () => {
    const { world, place } = setup();
    const t = place(10, 10);
    t.hp = 1; // the next spike hit wears it out
    const a = spawnZombie(world, "walker", 10.6, 11);
    const b = spawnZombie(world, "walker", 11.4, 11);
    for (const z of [a, b]) {
      world.zombies.hp[z] = 1000;
      world.zombies.trapTicks[z] = PULSE_TICKS - 1; // both due a pulse this tick
    }
    updateTraps(world);
    expect(buildingById(world, t.id)).toBeUndefined();
    const hit = [a, b].filter((z) => world.zombies.hp[z] === 1000 - HIT);
    const spared = [a, b].filter((z) => world.zombies.hp[z] === 1000);
    expect(hit).toHaveLength(1); // the one processed first wore it out
    expect(spared).toHaveLength(1); // the other: no hit, no slow from a trap that is gone
    expect(world.zombies.slowPct[spared[0] as number]).toBe(0);
    expect(world.zombies.slowPct[hit[0] as number]).toBe(TRAP.slowPct);
    expect(trapCounters.wornOut).toBe(1);
  });
});
