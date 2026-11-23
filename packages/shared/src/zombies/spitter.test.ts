import { describe, expect, it } from "vitest";
import { BalanceError, bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { createWorld, step, type World } from "../core/world";
import type { SimEvent } from "../core/simEvents";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { CoverKind, DistrictMap } from "../map/districtMap";
import { addPlayer } from "../player/player";
import { killZombie, spawnZombie } from "./zombiePool";
import { ZOMBIE_STATE, ZOMBIE_TYPES, isWindupState } from "./zombieTypes";

/**
 * Story 5.6: the Spitter's balance and AI (AC 1, 2, F1, F3, F5, F6). One mechanic per test: no
 * wave director (`systems: { waves }` no-op); the zombies slot flies spits and ticks puddles too.
 */
const NO_WAVES = { waves: () => {} };
const balance = loadBalance();
const spitter = balance.zombies.types.spitter;
const spit = spitter?.spit;
if (!spitter || !spit) throw new Error("no spitter in balance");

/** The open street with one cover object (car / bus / sandbags / barrier) of `box`. */
function mapWith(kind: CoverKind, box: { minX: number; minY: number; maxX: number; maxY: number }): DistrictMap {
  return { ...PLACEHOLDER_MAP, name: `spit-${kind}`, cover: [{ name: `t_${kind}`, kind, minStage: 1, ...box }] };
}

/** Every event of the run, in order. */
function record(world: World): SimEvent[] {
  const out: SimEvent[] = [];
  world.events.subscribe((e) => out.push(e));
  return out;
}

function run(world: World, ticks: number, each?: (t: number) => void): void {
  for (let t = 0; t < ticks; t++) {
    step(world, TICK_DT_S);
    each?.(t);
  }
}

const spats = (ev: SimEvent[]) => ev.filter((e) => e.type === "spitter.spat");

describe("Spitter balance (Story 5.6 AC 1, 5)", () => {
  it("spitter matches the GDD (FR23) and the designer's numbers (DD1–DD6)", () => {
    expect(spitter).toMatchObject({ hp: 12, speedMps: 1.5, damage: 5, attackIntervalS: 1, radiusM: 0.35, reward: 5 });
    expect(spit).toEqual({ rangeM: 6, windupS: 0.6, intervalS: 3, speedMps: 9, radiusM: 0.2, damage: 15, puddleRadiusM: 1, puddleS: 3, puddleDamagePerS: 5, puddlePulseS: 0.4, acidFaceToleranceM: 0.02 }); // Story 5.7 review L4: the acid-vs-cover tolerance
    expect(balance.zombies.spitCaps).toEqual({ maxLiveSpits: 24, maxLivePuddles: 32 });
    expect(ZOMBIE_TYPES.indexOf("spitter")).toBe(3); // appended: the index goes on the wire
    expect([ZOMBIE_STATE.WINDUP, ZOMBIE_STATE.RUSH_WINDUP]).toEqual([3, 4]); // fits the horde nibble
  });

  it("old types have no spit block", () => {
    for (const t of ["walker", "crawler", "runner"]) expect(balance.zombies.types[t]?.spit).toBeUndefined();
  });

  it("refuses a spit pulse that is not whole ticks / not whole damage, and a windup longer than the interval", () => {
    const bad = (path: string, v: number) => () => loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", path, v]]));
    expect(bad("types.spitter.spit.puddlePulseS", 0.43)).toThrow(BalanceError); // 8.6 ticks
    expect(bad("types.spitter.spit.puddleDamagePerS", 4)).toThrow(BalanceError); // 1.6 HP per pulse
    expect(bad("types.spitter.spit.windupS", 0.63)).toThrow(BalanceError);
    expect(bad("types.spitter.spit.intervalS", 0.5)).toThrow(BalanceError);
    expect(bad("spitCaps.maxLiveSpits", 0)).toThrow(BalanceError);
    expect(() => loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", "types.spitter.spit.puddlePulseS", 0.2]]))).not.toThrow(); // 1 HP, 4 ticks
  });
});

describe("Spitter AI (Story 5.6 AC 2, F1, F3, F5, F6)", () => {
  it("walks in until 6 m, then stops (and stays put while it cools down)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "p0", 30, 16).hp = 1e9;
    const id = spawnZombie(w, "spitter", 18, 16);
    let stopX = -1;
    run(w, 20 * 12, () => {
      if (stopX < 0 && isWindupState(w.zombies.state[id] as number)) stopX = w.zombies.x[id] as number;
    });
    expect(stopX).toBeGreaterThan(30 - spit.rangeM - 0.1);
    expect(stopX).toBeLessThanOrEqual(30 - spit.rangeM + 1e-6 + spitter.speedMps * TICK_DT_S);
    // 12 s later it is still at its spot (it never closes in while it has a line).
    expect(Math.abs((w.zombies.x[id] as number) - stopX)).toBeLessThan(0.05);
  });

  it("windup lasts exactly 12 ticks (WINDUP state each of them), then one spit", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "p0", 25, 16).hp = 1e9;
    const id = spawnZombie(w, "spitter", 20, 16); // 5 m: in range at once
    const ev = record(w);
    const states: number[] = [];
    run(w, 14, () => states.push(w.zombies.state[id] as number));
    expect(states.slice(0, 12)).toEqual(Array(12).fill(ZOMBIE_STATE.WINDUP));
    expect(states[12]).toBe(ZOMBIE_STATE.CHASE);
    const s = spats(ev);
    expect(s).toHaveLength(1);
    expect(w.tick).toBe(14);
  });

  it("3 s spit to spit (60 ticks)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "p0", 25, 16).hp = 1e9;
    spawnZombie(w, "spitter", 20, 16);
    const ticks: number[] = [];
    w.events.subscribe((e) => {
      if (e.type === "spitter.spat") ticks.push(w.tick);
    });
    run(w, 20 * 10);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ticks.length; i++) expect((ticks[i] as number) - (ticks[i - 1] as number)).toBe(60);
  });

  it("no windup behind a car or the bus (F3): it walks around instead", () => {
    for (const kind of ["car", "bus"] as const) {
      const w = createWorld({ balance, seed: 1, map: mapWith(kind, { minX: 22, minY: 14, maxX: 23, maxY: 18 }), systems: NO_WAVES });
      addPlayer(w, "p0", 25, 16).hp = 1e9;
      const id = spawnZombie(w, "spitter", 20, 16);
      let windups = 0;
      run(w, 10, () => {
        if (isWindupState(w.zombies.state[id] as number)) windups++;
      });
      expect(windups, kind).toBe(0);
      expect(Math.hypot((w.zombies.x[id] as number) - 20, (w.zombies.y[id] as number) - 16), `${kind}: it moves`).toBeGreaterThan(0.2);
    }
  });

  it("winds up behind a barricade, a turret, sandbags or a barrier and spits over them (F3: camping has a price)", () => {
    const cases: [string, (w: World) => void, DistrictMap][] = [
      ["barricade", (w) => addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 44, gy: 28, rot: 1, hp: 200 }), PLACEHOLDER_MAP],
      ["turret", (w) => addBuildingAt(w, { id: 1, type: "auto_turret", ownerId: "p0", gx: 45, gy: 31, rot: 0, hp: 300 }), PLACEHOLDER_MAP],
      ["sandbags", () => {}, mapWith("sandbags", { minX: 22, minY: 14, maxX: 23, maxY: 18 })],
      ["barrier", () => {}, mapWith("barrier", { minX: 22, minY: 14, maxX: 22.5, maxY: 18 })],
    ];
    for (const [name, place, map] of cases) {
      const w = createWorld({ balance, seed: 1, map, systems: NO_WAVES });
      place(w);
      const p = addPlayer(w, "p0", 24.5, 16);
      p.hp = 1e9;
      spawnZombie(w, "spitter", 19.5, 16);
      const ev = record(w);
      run(w, 40);
      expect(spats(ev).length, name).toBe(1);
      const hits = ev.filter((e) => e.type === "player.damaged" && e.sourceZombieId === -3);
      expect(hits.length, `${name}: the spit hits the camper`).toBeGreaterThanOrEqual(1);
      expect(ev.find((e) => e.type === "acid.splashed")).toMatchObject({ hitPlayerId: "p0" });
    }
  });

  it("target out of sight at release → no spit (F1): the windup simply ends", () => {
    const w = createWorld({ balance, seed: 1, map: mapWith("car", { minX: 22, minY: 10, maxX: 23, maxY: 15 }), systems: NO_WAVES });
    const p = addPlayer(w, "p0", 25, 16);
    p.hp = 1e9;
    const id = spawnZombie(w, "spitter", 20, 16);
    const ev = record(w);
    run(w, 6);
    expect(isWindupState(w.zombies.state[id] as number)).toBe(true);
    p.x = 25;
    p.y = 12; // ducks behind the car mid-windup
    p.prevX = p.x;
    p.prevY = p.y;
    run(w, 7);
    expect(isWindupState(w.zombies.state[id] as number)).toBe(false);
    expect(spats(ev)).toHaveLength(0);
  });

  it("target out of range at release → no spit (F1)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const p = addPlayer(w, "p0", 25, 16);
    p.hp = 1e9;
    spawnZombie(w, "spitter", 20, 16);
    const ev = record(w);
    run(w, 6);
    p.x = 32; // 12 m away
    run(w, 7);
    expect(spats(ev)).toHaveLength(0);
  });

  it("merge with 5.3: a knockback during the windup cancels nothing; the release re-checks from where it now stands", () => {
    for (const [pushM, spits] of [
      [0.5, 1], // knocked 0.5 m back: still in range → spits
      [2.5, 0], // knocked out of range (7.5 m) → no spit (F1)
    ] as const) {
      const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
      addPlayer(w, "p0", 25, 16).hp = 1e9;
      const id = spawnZombie(w, "spitter", 20, 16);
      const ev = record(w);
      run(w, 6);
      w.zombies.x[id] = 20 - pushM; // what 5.3's knockback does: it moves the body, nothing else
      w.zombies.prevX[id] = 20 - pushM;
      run(w, 1);
      expect(isWindupState(w.zombies.state[id] as number), `push ${pushM}`).toBe(true);
      run(w, 6);
      expect(spats(ev).length, `push ${pushM}`).toBe(spits);
    }
  });

  it("a Spitter killed during its windup spits nothing", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "p0", 25, 16).hp = 1e9;
    const id = spawnZombie(w, "spitter", 20, 16);
    const ev = record(w);
    run(w, 6);
    expect(isWindupState(w.zombies.state[id] as number)).toBe(true);
    killZombie(w, id, "p0", "pistol");
    run(w, 20);
    expect(spats(ev)).toHaveLength(0);
  });

  it("a downed target is never aimed at (F5); the downed player takes no spit", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const p = addPlayer(w, "p0", 25, 16);
    p.status = "downed";
    p.downedTicksLeft = 10_000;
    const id = spawnZombie(w, "spitter", 20, 16);
    const ev = record(w);
    run(w, 60);
    expect(spats(ev)).toHaveLength(0);
    expect(isWindupState(w.zombies.state[id] as number)).toBe(false);
  });

  it("aims at a standing teammate instead of the downed one next to it", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const d = addPlayer(w, "p0", 24, 16);
    d.status = "downed";
    d.downedTicksLeft = 10_000;
    addPlayer(w, "p1", 25.5, 18).hp = 1e9;
    spawnZombie(w, "spitter", 20, 16);
    const ev = record(w);
    run(w, 30);
    const s = spats(ev)[0];
    expect(s).toBeDefined();
    if (s?.type !== "spitter.spat") return;
    expect(Math.hypot(s.toX - 25.5, s.toY - 18)).toBeLessThan(1e-6);
  });

  it("rushing Spitter still winds up and stays marked (RUSH_WINDUP → RUSH)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "p0", 25, 16).hp = 1e9;
    const id = spawnZombie(w, "spitter", 20, 16, true);
    w.zombies.state[id] = ZOMBIE_STATE.RUSH;
    const states: number[] = [];
    const ev = record(w);
    run(w, 14, () => states.push(w.zombies.state[id] as number));
    expect(states[0]).toBe(ZOMBIE_STATE.RUSH_WINDUP);
    expect(states[12]).toBe(ZOMBIE_STATE.RUSH);
    expect(spats(ev)).toHaveLength(1);
    // F6 (merge with 5.3, the 5 m Shotgun): between spits a rushing Spitter walks in instead of holding its spot.
    const x0 = w.zombies.x[id] as number;
    run(w, 20);
    expect(w.zombies.x[id] as number).toBeGreaterThan(x0 + 0.5);
  });

  it("F6: a Spitter with no line keeps walking toward the players and bites up close (5 dmg)", () => {
    // A long car wall between: it must go round (field) and, once round, it spits.
    const w = createWorld({ balance, seed: 1, map: mapWith("bus", { minX: 22, minY: 8, maxX: 23, maxY: 24 }), systems: NO_WAVES });
    addPlayer(w, "p0", 26, 16).hp = 1e9;
    const id = spawnZombie(w, "spitter", 18, 16);
    const ev = record(w);
    run(w, 20 * 30);
    expect(spats(ev).length, "it got a line and spat").toBeGreaterThanOrEqual(1);
    expect(id).toBeGreaterThanOrEqual(0);
    // Up close (the player walks into it), the weak bite.
    const w2 = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w2, "p0", 20.7, 16).hp = 1e9;
    spawnZombie(w2, "spitter", 20, 16);
    const ev2 = record(w2);
    run(w2, 3);
    expect(ev2.find((e) => e.type === "player.damaged" && e.sourceZombieId >= 0)).toMatchObject({ amount: 5 });
  });
});

