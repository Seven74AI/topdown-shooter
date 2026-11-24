import { beforeEach, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, step, type World } from "../core/world";
import { applyKnockback, applyZombieDamage, knockbacks } from "../combat/damage";
import { resetBurnClocks } from "../decay/fire";
import { downPlayer } from "../player/downed";
import { addPlayer } from "../player/player";
import { endWave, startBuild, startWave } from "../run/runStateMachine";
import { bundledBalanceFiles, withOverrides } from "../config/balance";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";
import { isZombieAlive, killZombie, spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt, BEAR_TRAP_STATE, buildingById, removeBuilding, type Building } from "./buildings";
import { bearTrapCounters, bearTrapPlateRadius, holdTicksFor, resetBearTrapCounters, updateBearTraps } from "./bearTrap";
import { createExplosionSpec, explode } from "../combat/explosion";

/**
 * Story 5.14: bear traps (ACs 2–6, F1–F9). Zombies stand still (`zombies` no-op) unless a test lets
 * them walk; the trap system runs in the buildings slot (and at the end of the zombies system).
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const BT = balance.buildings.types.bear_trap?.bearTrap as NonNullable<NonNullable<typeof balance.buildings.types.bear_trap>["bearTrap"]>;
const HOLD = Math.round(BT.holdS / TICK_DT_S); // 60
const REARM = Math.round(BT.rearmS / TICK_DT_S); // 20
const { ARMED, HOLDING, SPRUNG } = BEAR_TRAP_STATE;

function setup(systems: Record<string, SystemFn> = STILL, playerAt: [number, number] = [40, 28]) {
  const world = createWorld({ balance, seed: 1, systems });
  const p0 = addPlayer(world, "p0", playerAt[0], playerAt[1]);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  startWave(world);
  let nextId = 1;
  /** A bear trap with its min corner at (x, y): 1 × 1 m, centre (x + 0.5, y + 0.5). */
  const place = (x: number, y: number, type = "bear_trap", ownerId = "p0") =>
    addBuildingAt(world, { id: nextId++, type, ownerId, gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: balance.buildings.types[type]?.hp ?? 1 }) as Building;
  return { world, events, place, p0 };
}
const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const tough = (world: World, z: number): number => {
  world.zombies.hp[z] = 1000;
  return z;
};
const snaps = (events: SimEvent[]) => events.filter((e) => e.type === "bear_trap.snapped");

beforeEach(() => resetBearTrapCounters());

describe("bear trap balance (Story 5.14)", () => {
  it("the designer's numbers: $50, 1 × 1 m floor, 100 HP, plate 0.35 m, hold 3 s, snap 5, 25 per catch, re-arm 1 s; a Brute is held 50 %", () => {
    const t = balance.buildings.types.bear_trap;
    expect(t).toMatchObject({ price: 50, widthM: 1, depthM: 1, hp: 100, solid: false, stopsBullets: false, forSale: true, inShop: true });
    expect(BT).toEqual({ plateRadiusM: 0.35, holdS: 3, snapDamage: 5, wearPerCatch: 25, rearmS: 1 });
    expect(balance.zombies.types.brute?.trapHoldPct).toBe(50);
    expect(balance.zombies.types.bloater?.trapHoldPct).toBe(100);
    expect(balance.zombies.types.walker?.trapHoldPct).toBe(100);
  });
});

describe("bear trap catch (Story 5.14, AC 2, F2, F3)", () => {
  it("snaps on a centre strictly inside the 0.35 m plate: 5 damage, held, one event; at exactly 0.35 m nothing", () => {
    const { world, events, place } = setup();
    const t = place(10, 10); // centre (10.5, 10.5)
    const inside = spawnZombie(world, "walker", 10.5 + 0.349, 10.5);
    step(world, TICK_DT_S);
    expect(t.trapState).toBe(HOLDING);
    expect(t.heldZombie).toBe(inside);
    expect(world.zombies.hp[inside]).toBe(10 - BT.snapDamage);
    expect(world.zombies.holdTicks[inside]).toBe(HOLD);
    expect(snaps(events)).toEqual([{ type: "bear_trap.snapped", buildingId: t.id, x: 10.5, y: 10.5 }]);
    expect(bearTrapCounters.catches).toBe(1);

    const b = setup();
    const t2 = b.place(10, 10);
    const edge = spawnZombie(b.world, "walker", 10.5 + 0.35, 10.5);
    run(b.world, 5);
    expect(t2.trapState).toBe(ARMED);
    expect(b.world.zombies.holdTicks[edge]).toBe(0);
    expect(bearTrapPlateRadius(b.world, "bear_trap")).toBe(BT.plateRadiusM); // F2: the client's ring radius is the sim's
  });

  it("a walking zombie is caught on the very tick its centre first reaches the plate (end-of-zombies pass)", () => {
    const { world, place } = setup({ waves: noop }, [10.5, 20]);
    const t = place(10, 10);
    const z = tough(world, spawnZombie(world, "walker", 10.5, 8)); // walks south toward the player at (10.5, 20)
    let caughtAt = -1;
    let firstInside = -1;
    for (let i = 0; i < 100 && caughtAt < 0; i++) {
      step(world, TICK_DT_S);
      const d = Math.hypot((world.zombies.x[z] as number) - 10.5, (world.zombies.y[z] as number) - 10.5);
      if (firstInside < 0 && d < BT.plateRadiusM) firstInside = i;
      if (t.trapState === HOLDING) caughtAt = i;
    }
    expect(firstInside).toBeGreaterThan(0);
    expect(caughtAt).toBe(firstInside);
  });

  it("one zombie per trap, the lowest pool id on a tie; two adjacent traps catch two", () => {
    const { world, place } = setup();
    const t = place(10, 10);
    const a = spawnZombie(world, "walker", 10.4, 10.5);
    const b = spawnZombie(world, "walker", 10.6, 10.5);
    step(world, TICK_DT_S);
    expect(t.heldZombie).toBe(Math.min(a, b));
    expect(world.zombies.holdTicks[Math.max(a, b)]).toBe(0);
    expect(bearTrapCounters.catches).toBe(1);

    const two = setup();
    const t1 = two.place(10, 10);
    const t2 = two.place(11, 10); // touching
    const z1 = spawnZombie(two.world, "walker", 10.5, 10.5);
    const z2 = spawnZombie(two.world, "walker", 11.5, 10.5);
    step(two.world, TICK_DT_S);
    expect([t1.heldZombie, t2.heldZombie]).toEqual([z1, z2]);
  });

  it("a holding or sprung trap catches nothing", () => {
    const { world, place } = setup();
    const t = place(10, 10);
    const a = tough(world, spawnZombie(world, "walker", 10.5, 10.5));
    step(world, TICK_DT_S);
    const b = spawnZombie(world, "walker", 10.6, 10.5);
    run(world, 5);
    expect(t.heldZombie).toBe(a);
    expect(world.zombies.holdTicks[b]).toBe(0);
    world.zombies.holdTicks[a] = 0; // hold over
    world.zombies.x[a] = 20;
    world.zombies.x[b] = 20;
    step(world, TICK_DT_S);
    expect(t.trapState).toBe(SPRUNG);
    world.zombies.x[b] = 10.5;
    run(world, 5);
    expect(t.trapState).toBe(SPRUNG);
    expect(world.zombies.holdTicks[b]).toBe(0);
  });

  it("players never set it off; a build phase never catches (D7, D10)", () => {
    const { world, place } = setup(STILL, [10.5, 10.5]);
    const t = place(10, 10);
    run(world, 30);
    expect(t.trapState).toBe(ARMED);
    expect(bearTrapCounters.catches).toBe(0);

    const b = setup();
    const t2 = b.place(10, 10);
    startBuild(b.world);
    spawnZombie(b.world, "walker", 10.5, 10.5);
    run(b.world, 10);
    expect(t2.trapState).toBe(ARMED);
  });

  it("a snap kill is the trap's and its owner's (3.6 credit), and the trap is sprung and worn at once", () => {
    const { world, events, place } = setup();
    addPlayer(world, "p1", 30, 30);
    const t = place(10, 10, "bear_trap", "p1");
    const z = spawnZombie(world, "runner", 10.5, 10.5);
    world.zombies.hp[z] = 3;
    step(world, TICK_DT_S);
    expect(isZombieAlive(world.zombies, z)).toBe(false);
    expect(events.find((e) => e.type === "zombie.killed")).toMatchObject({ killerId: "p1", buildingId: t.id, weapon: "bear_trap" });
    const paid = events.filter((e) => e.type === "money.earned" && e.playerId === "p1");
    expect(paid).toHaveLength(1);
    expect(t.trapState).toBe(SPRUNG);
    expect(t.hp).toBe(100 - BT.wearPerCatch);
    expect(bearTrapCounters.kills).toBe(1);
  });
});

describe("bear trap hold (Story 5.14, AC 3, F4–F6)", () => {
  it("holds exactly 3 s (60 movement ticks) on the zombie's own clock, then lets go; a Brute 1.5 s (D3)", () => {
    for (const [type, ticks] of [
      ["walker", HOLD],
      ["bloater", HOLD], // D8: a Bloater is not heavy
      ["brute", HOLD / 2],
    ] as const) {
      const { world, place } = setup({ waves: noop }, [10.5, 30]);
      const t = place(10, 10);
      const z = tough(world, spawnZombie(world, type, 10.5, 10.5));
      expect(holdTicksFor(world, BT, z)).toBe(ticks);
      run(world, ticks);
      expect([world.zombies.x[z], world.zombies.y[z]]).toEqual([Math.fround(10.5), Math.fround(10.5)]); // not one step taken
      expect(t.trapState).toBe(HOLDING);
      step(world, TICK_DT_S);
      expect(t.trapState).toBe(SPRUNG);
      expect(world.zombies.y[z]).toBeGreaterThan(10.5); // walks on toward the player
    }
    expect(bearTrapCounters.bruteCatches).toBe(1);
  });

  it("shots, burns and slows never shorten or lengthen the hold (F4)", () => {
    const { world, place } = setup({ waves: noop }, [10.5, 30]);
    const t = place(10, 10);
    place(9, 11, "spike_trap"); // 2 × 2 at [9,11] × [11,13]: not under the held body
    const z = tough(world, spawnZombie(world, "walker", 10.5, 10.5));
    let released = -1;
    for (let i = 0; i < 80 && released < 0; i++) {
      applyZombieDamage(world, z, 1, 0, 1, 0.3, "p0", "pistol"); // a hit with pushback every tick
      step(world, TICK_DT_S);
      if (t.trapState === SPRUNG) released = i;
    }
    expect(released).toBe(HOLD);
  });

  it("the hold starts on the catch tick whatever the world tick (no shared pulse: caught at tick 7 and 13, both held exactly 60)", () => {
    for (const idle of [7, 13]) {
      const { world, place } = setup({ waves: noop }, [10.5, 30]);
      const t = place(10, 10);
      run(world, idle);
      tough(world, spawnZombie(world, "walker", 10.5, 10.5));
      step(world, TICK_DT_S); // caught (buildings slot) and the first held movement tick
      expect(t.trapState).toBe(HOLDING);
      run(world, HOLD - 1);
      expect(t.trapState).toBe(HOLDING);
      step(world, TICK_DT_S);
      expect(t.trapState).toBe(SPRUNG);
    }
  });

  it("a held zombie is never moved: crowd pressure, hard overlaps, a player's body, knockback and hit pushback (AC 3)", () => {
    const { world, place, p0 } = setup({ waves: noop }, [10.5, 14]);
    place(10, 10);
    const z = tough(world, spawnZombie(world, "brute", 10.5, 10.5));
    step(world, TICK_DT_S);
    expect(world.zombies.holdTicks[z]).toBeGreaterThan(0);
    const crowd = [];
    for (let k = 0; k < 8; k++) crowd.push(tough(world, spawnZombie(world, "walker", 10.3 + 0.05 * k, 9.9 + 0.02 * k))); // overlapping it, pushing south
    expect(applyKnockback(world, z, 1, 0, 1.5)).toBe(0);
    applyZombieDamage(world, z, 1, 1, 0, 0.5, "p0", "pistol");
    p0.x = 10.5;
    p0.y = 10.5 + 0.6 + p0.radiusM - 0.2; // the player's body inside the Brute's
    for (let i = 0; i < 20; i++) {
      step(world, TICK_DT_S);
      expect([world.zombies.x[z], world.zombies.y[z]]).toEqual([Math.fround(10.5), Math.fround(10.5)]);
    }
    expect(crowd.some((c) => (world.zombies.y[c] as number) !== Math.fround(9.9))).toBe(true); // the others did move (liveness)
  });

  it("held, not harmless: it still bites a player in reach (F6)", () => {
    const { world, place, p0 } = setup({ waves: noop }, [10.5, 10.5 + 0.35 + 0.4]);
    place(10, 10);
    tough(world, spawnZombie(world, "walker", 10.5, 10.5));
    p0.y = 10.5 + 0.35 + p0.radiusM; // touching
    const hp0 = p0.hp;
    run(world, 30);
    expect(p0.hp).toBeLessThan(hp0);
  });

  it("a held Spitter still spits; a held Bloater touching a player still swells (F6, D8)", () => {
    const s = setup({ waves: noop }, [10.5, 14]);
    s.place(10, 10);
    const sp = tough(s.world, spawnZombie(s.world, "spitter", 10.5, 10.5));
    run(s.world, 60);
    expect(s.world.zombies.x[sp]).toBe(Math.fround(10.5));
    expect(s.events.some((e) => e.type === "spitter.spat")).toBe(true);

    const b = setup({ waves: noop }, [10.5, 10.5 + 0.5 + 0.4]);
    b.place(10, 10);
    tough(b.world, spawnZombie(b.world, "bloater", 10.5, 10.5));
    b.p0.y = 10.5 + 0.5 + b.p0.radiusM;
    run(b.world, 5);
    expect(b.events.some((e) => e.type === "bloater.swell_started")).toBe(true);
  });
});

describe("bear trap release, wear, re-arm (Story 5.14, AC 4, 5, F7, F9)", () => {
  it("a held zombie that dies frees the trap at once: sprung and worn 25 (B13)", () => {
    const { world, place } = setup();
    const t = place(10, 10);
    const z = tough(world, spawnZombie(world, "walker", 10.5, 10.5));
    step(world, TICK_DT_S);
    killZombie(world, z, "p0", "pistol");
    step(world, TICK_DT_S);
    expect(t.trapState).toBe(SPRUNG);
    expect(t.hp).toBe(75);
    expect(bearTrapCounters.releases).toBe(1);
  });

  it("4 catches wear it out: removed with building.destroyed, wallVersion never moves (F1)", () => {
    const { world, events, place } = setup();
    const t = place(10, 10);
    const wall0 = world.buildings.wallVersion;
    for (let c = 0; c < 4; c++) {
      const z = tough(world, spawnZombie(world, "walker", 10.5, 10.5));
      step(world, TICK_DT_S);
      expect(t.heldZombie).toBe(z);
      killZombie(world, z, "p0", "pistol");
      step(world, TICK_DT_S);
      if (c < 3) {
        expect(t.hp).toBe(100 - 25 * (c + 1));
        t.trapState = ARMED; // stand-in for a re-arm
      }
    }
    expect(buildingById(world, t.id)).toBeUndefined();
    expect(events.filter((e) => e.type === "building.destroyed")).toHaveLength(1);
    expect(bearTrapCounters.wornOut).toBe(1);
    expect(world.buildings.wallVersion).toBe(wall0);
  });

  it("re-arms after 1 s of one standing player on the plate without a break; a break restarts it (F7)", () => {
    const { world, place, p0 } = setup(STILL, [30, 30]);
    const t = place(10, 10);
    t.trapState = SPRUNG;
    const on = () => {
      p0.x = 10.5;
      p0.y = 10.5 + BT.plateRadiusM + p0.radiusM - 0.01; // body edge just over the plate circle
    };
    const off = () => {
      p0.x = 30;
    };
    on();
    run(world, REARM - 1);
    off();
    step(world, TICK_DT_S);
    on();
    run(world, REARM - 1);
    expect(t.trapState).toBe(SPRUNG);
    step(world, TICK_DT_S);
    expect(t.trapState).toBe(ARMED);
    expect(bearTrapCounters.rearms).toBe(1);
  });

  it("at exactly the plate edge a body doesn't count; a downed player never re-arms; a build phase re-arms too", () => {
    const { world, place, p0 } = setup(STILL, [10.5, 10.5 + BT.plateRadiusM + 0.4]);
    const t = place(10, 10);
    t.trapState = SPRUNG;
    p0.y = 10.5 + BT.plateRadiusM + p0.radiusM; // touching only
    run(world, REARM * 2);
    expect(t.trapState).toBe(SPRUNG);
    p0.y = 10.5;
    addPlayer(world, "p1", 30, 30); // a teammate still standing: no team wipe (that would stop every re-arm)
    downPlayer(world, p0);
    expect(world.teamWiped).toBe(false);
    run(world, REARM * 2);
    expect(p0.status).toBe("downed");
    expect(t.trapState).toBe(SPRUNG);

    const b = setup(STILL, [10.5, 10.5]);
    const t2 = b.place(10, 10);
    startBuild(b.world);
    t2.trapState = SPRUNG;
    run(b.world, REARM);
    expect(t2.trapState).toBe(ARMED);
  });

  it("no re-arm while a zombie is held; once it lets go, a player standing there re-arms 1 s later", () => {
    const { world, place } = setup(STILL, [10.5, 10.5]);
    const t = place(10, 10);
    const z = tough(world, spawnZombie(world, "walker", 10.6, 10.5));
    step(world, TICK_DT_S);
    expect(t.trapState).toBe(HOLDING);
    run(world, 30);
    expect(t.trapState).toBe(HOLDING); // the zombies system is off: its hold never burns
    world.zombies.holdTicks[z] = 0;
    world.zombies.x[z] = 30;
    step(world, TICK_DT_S); // release; the re-arm count starts on this tick
    expect(t.trapState).toBe(SPRUNG);
    run(world, REARM - 1);
    expect(t.trapState).toBe(ARMED);
  });

  it("every trap re-arms at a build start, nothing held (D4)", () => {
    const { world, place } = setup();
    const a = place(10, 10);
    const b = place(12, 10);
    a.trapState = SPRUNG;
    const z = tough(world, spawnZombie(world, "walker", 12.5, 10.5));
    step(world, TICK_DT_S);
    expect(b.trapState).toBe(HOLDING);
    const v = world.buildings.version;
    resetBurnClocks(world); // the build-start hook (decayMutate)
    expect([a.trapState, b.trapState]).toEqual([ARMED, ARMED]);
    expect(world.zombies.holdTicks[z]).toBe(0);
    expect(world.buildings.version).toBeGreaterThan(v); // the schema sync follows
  });

  it("fire wears it (4.8); a mine blast and a Bloater blast don't (floor, as the spike trap)", () => {
    const { world, place } = setup({ waves: noop, zombies: noop });
    const t = place(10, 10);
    world.decay.fires.push({ name: "test_fire", target: "test_car", x: 10.5, y: 10.5, radiusM: 3, stage: 3, index: 0 });
    run(world, 40);
    expect(t.hp).toBeLessThan(t.maxHp);

    const b = setup();
    const t2 = b.place(10, 10);
    const spec = createExplosionSpec();
    Object.assign(spec, { x: 10.5, y: 10.5, radiusM: 2.5, zombieDamage: 40, playerDamage: 30, buildingDamage: 40, kind: "bloater" });
    explode(b.world, spec);
    expect(t2.hp).toBe(t2.maxHp);
  });

  it("buildings-slot pass alone: updateBearTraps is a no-op outside build and wave", () => {
    const { world, place } = setup();
    const t = place(10, 10);
    spawnZombie(world, "walker", 10.5, 10.5);
    world.run.phase = "lobby" as typeof world.run.phase;
    updateBearTraps(world);
    expect(t.trapState).toBe(ARMED);
  });
});

describe("Story 5.14 review fixes", () => {
  it("M1: the last catch of a wave still costs its wear (the held zombie is the last kill: the build start releases, then re-arms); at 25 HP it wears out", () => {
    for (const [hp0, expected] of [
      [100, 75],
      [25, null],
    ] as const) {
      const { world, events, place } = setup();
      const t = place(10, 10);
      t.hp = hp0;
      const z = tough(world, spawnZombie(world, "walker", 10.5, 10.5));
      step(world, TICK_DT_S);
      expect(t.trapState).toBe(HOLDING);
      killZombie(world, z, "p0", "pistol"); // the wave's last kill…
      endWave(world); // …ends it in the same tick: the build start comes before any trap pass
      expect(world.run.phase).toBe("build");
      if (expected === null) {
        expect(buildingById(world, t.id)).toBeUndefined();
        world.events.flush();
        expect(events.filter((e) => e.type === "building.destroyed")).toHaveLength(1);
      } else {
        expect(t.hp).toBe(expected);
        expect(t.trapState).toBe(ARMED);
      }
    }
  });

  it("L1: a held zombie hits a wall building it touches at its normal rate (a Brute ×3), never a floor building", () => {
    for (const type of ["walker", "brute"] as const) {
      const { world, place } = setup({ waves: noop }, [10.5, 30]);
      const t = place(10, 10); // plate centre (10.5, 10.5)
      const stats = balance.zombies.types[type] as NonNullable<typeof balance.zombies.types.walker>;
      const wall = addBuildingAt(world, { id: 99, type: "wood_barricade", ownerId: "p0", gx: 19, gy: 19, rot: 0, hp: 200 }) as Building; // y [9.5, 10]: its face touches the held body
      const z = tough(world, spawnZombie(world, type, 10.5, wall.maxY + stats.radiusM + 0.005)); // centre inside the plate
      const ticks = holdTicksFor(world, BT, z) - 2; // inside the hold (a Brute's is 1.5 s)
      run(world, ticks);
      expect(t.trapState).toBe(HOLDING);
      expect(world.zombies.holdTicks[z]).toBeGreaterThan(0);
      const every = Math.round(stats.attackIntervalS / TICK_DT_S);
      const hits = 1 + Math.floor((ticks - 1) / every); // the first lands at once
      expect(hits).toBeGreaterThanOrEqual(type === "walker" ? 3 : 1);
      expect(wall.hp).toBe(Math.max(0, 200 - hits * stats.damage * stats.buildingDamageMult));
      expect(t.hp).toBe(t.maxHp); // the trap under it is never attacked
    }
  });

  it("L2: a trap destroyed while holding lets its zombie go at once", () => {
    const { world, place } = setup({ waves: noop }, [10.5, 30]);
    const t = place(10, 10);
    const z = tough(world, spawnZombie(world, "walker", 10.5, 10.5));
    step(world, TICK_DT_S);
    expect(world.zombies.holdTicks[z]).toBeGreaterThan(0);
    removeBuilding(world, t.id); // fire / a decay solid / any destroy path ends in removeBuilding
    expect(world.zombies.holdTicks[z]).toBe(0);
    step(world, TICK_DT_S);
    expect(world.zombies.y[z]).toBeGreaterThan(10.5); // walks on at once
  });

  it("L3: two pinned bodies overlapping (a held Walker and a swelling Bloater): neither moves", () => {
    const { world, place } = setup({ waves: noop }, [10.5, 30]);
    place(10, 10);
    const w = tough(world, spawnZombie(world, "walker", 10.5, 10.5));
    step(world, TICK_DT_S);
    expect(world.zombies.holdTicks[w]).toBeGreaterThan(0);
    const b = tough(world, spawnZombie(world, "bloater", 10.5 + 0.5, 10.5)); // overlaps the Walker (0.35 + 0.5 > 0.5)
    world.zombies.state[b] = ZOMBIE_STATE.SWELL;
    world.zombies.swellTicks[b] = 200;
    const bx = world.zombies.x[b];
    step(world, TICK_DT_S);
    expect([world.zombies.x[w], world.zombies.y[w]]).toEqual([Math.fround(10.5), Math.fround(10.5)]);
    expect(world.zombies.x[b]).toBe(bx);
  });

  it("L4: the plate is strict at an exactly representable distance (plate 0.375 m: a centre at exactly 0.375 is not caught)", () => {
    const b4 = loadBalance(withOverrides(bundledBalanceFiles(), [["buildings", "types.bear_trap.bearTrap.plateRadiusM", 0.375]]));
    const caught = (d: number): boolean => {
      const world = createWorld({ balance: b4, seed: 1, systems: STILL });
      addPlayer(world, "p0", 40, 28);
      startBuild(world);
      startWave(world);
      const t = addBuildingAt(world, { id: 1, type: "bear_trap", ownerId: "p0", gx: 20, gy: 20, rot: 0, hp: 100 }) as Building; // centre (10.5, 10.5)
      const z = spawnZombie(world, "walker", 10.5 + d, 10.5);
      expect((world.zombies.x[z] as number) - 10.5).toBe(d); // exact in float32
      step(world, TICK_DT_S);
      return t.trapState === HOLDING;
    };
    expect(caught(0.375)).toBe(false);
    expect(caught(0.375 - 1 / 1024)).toBe(true);
  });

  it("N1: a blast's push on a held zombie is not counted as 'stopped at a face' (its share is 0)", () => {
    const { world, place } = setup();
    place(10, 10);
    const z = tough(world, spawnZombie(world, "walker", 10.5, 10.5));
    step(world, TICK_DT_S);
    expect(world.zombies.holdTicks[z]).toBeGreaterThan(0);
    knockbacks.applied = knockbacks.stopped = 0;
    const spec = createExplosionSpec();
    Object.assign(spec, { x: 9, y: 10.5, radiusM: 2.5, zombieDamage: 1, playerDamage: 0, pushM: 0.5, kind: "bloater" });
    explode(world, spec);
    expect(knockbacks.applied).toBe(1);
    expect(knockbacks.stopped).toBe(0);
    expect(world.zombies.x[z]).toBe(Math.fround(10.5));
  });
});
