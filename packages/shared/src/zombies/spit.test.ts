import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { MUZZLE_OFFSET_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { createWorld, setInput, step, type World } from "../core/world";
import type { SimEvent } from "../core/simEvents";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { CoverKind, DistrictMap } from "../map/districtMap";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { spawnZombie } from "./zombiePool";
import { isWindupState } from "./zombieTypes";
import { spawnSpit, spitStats } from "./spit";

/** Story 5.6: spits in flight (AC 3, F2, F3, AC 15). One mechanic per test: no wave director. */
const NO_WAVES = { waves: () => {} };
const balance = loadBalance();
const spitter = balance.zombies.types.spitter;
const spit = spitter?.spit;
if (!spitter || !spit) throw new Error("no spitter in balance");
const log = (m: string): void => (globalThis as unknown as { console: { info(m: string): void } }).console.info(m);

function mapWith(kind: CoverKind, box: { minX: number; minY: number; maxX: number; maxY: number }): DistrictMap {
  return { ...PLACEHOLDER_MAP, name: `spit-${kind}`, cover: [{ name: `t_${kind}`, kind, minStage: 1, ...box }] };
}

function record(world: World): SimEvent[] {
  const out: SimEvent[] = [];
  world.events.subscribe((e) => out.push(e));
  return out;
}

function run(world: World, ticks: number, each?: () => void): void {
  for (let t = 0; t < ticks; t++) {
    each?.();
    step(world, TICK_DT_S);
  }
}

describe("spits (Story 5.6 AC 3)", () => {
  it("flies at 9 m/s and lands at the release-time aim point (the player stepped off it)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const p = addPlayer(w, "p0", 25, 16);
    p.hp = 1e9;
    spawnZombie(w, "spitter", 20, 16);
    const ev = record(w);
    let released = -1;
    let prev = -1;
    const xs: number[] = [];
    run(w, 40, () => {
      if (w.spits.count > 0) xs.push(w.spits.x[0] as number);
      if (released < 0 && ev.some((e) => e.type === "spitter.spat")) {
        released = w.tick;
        p.y = 19; // steps aside right after the release: the spit keeps its course
      }
      prev = w.tick;
    });
    expect(prev).toBe(39);
    const s = ev.find((e) => e.type === "spitter.spat");
    expect(s?.type).toBe("spitter.spat");
    if (s?.type === "spitter.spat") {
      expect(s.x).toBeCloseTo(20 + spitter.radiusM + MUZZLE_OFFSET_M, 6);
      expect([s.y, s.toX, s.toY]).toEqual([16, 25, 16]);
    }
    for (let i = 1; i < xs.length; i++) expect((xs[i] as number) - (xs[i - 1] as number)).toBeCloseTo(spit.speedMps * TICK_DT_S, 9);
    const splash = ev.find((e) => e.type === "acid.splashed");
    expect(splash).toMatchObject({ hitPlayerId: null });
    if (splash?.type === "acid.splashed") expect(Math.hypot(splash.x - 25, splash.y - 16)).toBeLessThan(1e-6);
    expect(ev.some((e) => e.type === "player.damaged")).toBe(false);
  });

  it("F2: a survivor who starts sidestepping (4.5 m/s) when the windup starts is never hit at any range ≥ 2 m, any angle", () => {
    let spits = 0;
    let cases = 0;
    for (let rangeDm = 20; rangeDm <= 58; rangeDm += 2) {
      for (let deg = 0; deg < 360; deg += 15) {
        for (const side of [1, -1]) {
          const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
          const a = (deg * Math.PI) / 180;
          const px = 24;
          const py = 16;
          const p = addPlayer(w, "p0", px, py);
          const zx = px - Math.cos(a) * (rangeDm / 10);
          const zy = py - Math.sin(a) * (rangeDm / 10);
          const id = spawnZombie(w, "spitter", zx, zy);
          const ev = record(w);
          // Step 1 starts the windup (in range); from then on the survivor runs perpendicular.
          step(w, TICK_DT_S);
          expect(isWindupState(w.zombies.state[id] as number)).toBe(true);
          const mx = -Math.sin(a) * side;
          const my = Math.cos(a) * side;
          for (let t = 1; t < 40; t++) {
            setInput(w, "p0", { ...NEUTRAL_INPUT, seq: t, moveX: mx, moveY: my });
            step(w, TICK_DT_S);
          }
          cases++;
          spits += ev.filter((e) => e.type === "spitter.spat").length;
          const hurt = ev.filter((e) => e.type === "player.damaged");
          expect(hurt, `range ${rangeDm / 10} m, ${deg}°, side ${side}`).toEqual([]);
          expect(p.hp).toBe(balance.player.maxHp);
        }
      }
    }
    log(`[spit F2] ${cases} sidestep cases, ${spits} spits released, 0 hits`);
    expect(spits).toBeGreaterThan(cases / 2); // liveness: most cases really spat (the far ones cancel at release: out of range)
  }, 120_000);

  it("a survivor who stands still is hit (15) — the camper always pays", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const p = addPlayer(w, "p0", 25, 16);
    spawnZombie(w, "spitter", 19.5, 16);
    const ev = record(w);
    run(w, 30);
    const hits = ev.filter((e) => e.type === "player.damaged");
    expect(hits[0]).toMatchObject({ playerId: "p0", amount: 15, sourceZombieId: -3 });
    expect(p.hp).toBeLessThanOrEqual(balance.player.maxHp - 15);
  });

  it("hits the first player on its line, not only the target", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "far", 25, 16).hp = 1e9; // the target (the only one in range at the windup start)
    const ev = record(w);
    spawnZombie(w, "spitter", 19.5, 16);
    run(w, 11);
    const near = addPlayer(w, "near", 23, 16.3); // walks into the line mid-windup
    near.hp = 1e9;
    run(w, 20);
    const s = ev.find((e) => e.type === "spitter.spat");
    expect(s).toMatchObject({ toX: 25, toY: 16 }); // aimed at the target, kept through the windup
    const splash = ev.find((e) => e.type === "acid.splashed");
    expect(splash).toMatchObject({ hitPlayerId: "near" });
  });

  it("stops at a car face (F3) and leaves its puddle there", () => {
    const w = createWorld({ balance, seed: 1, map: mapWith("car", { minX: 22, minY: 14, maxX: 23, maxY: 18 }), systems: NO_WAVES });
    const p = addPlayer(w, "p0", 25, 16);
    p.hp = 1e9;
    // Released by hand (no Spitter could wind up through the car): straight at the player.
    const ev = record(w);
    expect(spawnSpit(w, 0, 20, 16, 25, 16, spitter.radiusM, spit)).toBe(true);
    run(w, 20);
    const splash = ev.find((e) => e.type === "acid.splashed");
    expect(splash).toMatchObject({ y: 16, hitPlayerId: null });
    if (splash?.type === "acid.splashed") expect(splash.x).toBeCloseTo(22, 9);
    expect(ev.some((e) => e.type === "player.damaged")).toBe(false);
  });

  it("stops at the bus and at a building face too, but passes a barricade, a turret and sandbags (F3)", () => {
    const cases: [string, DistrictMap, (w: World) => void, boolean][] = [
      ["bus", mapWith("bus", { minX: 22, minY: 14, maxX: 23, maxY: 18 }), () => {}, false],
      ["building", { ...PLACEHOLDER_MAP, name: "spit-solid", solids: [{ name: "b", minX: 22, minY: 14, maxX: 23, maxY: 18 }] }, () => {}, false],
      ["sandbags", mapWith("sandbags", { minX: 22, minY: 14, maxX: 23, maxY: 18 }), () => {}, true],
      ["barrier", mapWith("barrier", { minX: 22, minY: 14, maxX: 22.5, maxY: 18 }), () => {}, true],
      ["barricade", PLACEHOLDER_MAP, (w) => addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 44, gy: 28, rot: 1, hp: 200 }), true],
      ["turret", PLACEHOLDER_MAP, (w) => addBuildingAt(w, { id: 1, type: "auto_turret", ownerId: "p0", gx: 44, gy: 31, rot: 0, hp: 300 }), true],
      // Merge with 5.9: floor buildings (spike trap, mine) never stop a spit either.
      ["spike trap", PLACEHOLDER_MAP, (w) => addBuildingAt(w, { id: 1, type: "spike_trap", ownerId: "p0", gx: 44, gy: 31, rot: 0, hp: 100 }), true],
      ["mine", PLACEHOLDER_MAP, (w) => addBuildingAt(w, { id: 1, type: "mine", ownerId: "p0", gx: 44, gy: 32, rot: 0, hp: 1 }), true],
    ];
    for (const [name, map, place, passes] of cases) {
      const w = createWorld({ balance, seed: 1, map, systems: NO_WAVES });
      place(w);
      addPlayer(w, "p0", 25, 16).hp = 1e9;
      const ev = record(w);
      spawnSpit(w, 0, 20, 16, 25, 16, spitter.radiusM, spit);
      run(w, 20);
      const splash = ev.find((e) => e.type === "acid.splashed");
      expect(splash, name).toMatchObject({ hitPlayerId: passes ? "p0" : null });
    }
  });

  it("cap (AC 15): the 25th spit is not spawned; a Spitter at the cap re-arms (winds up again)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "p0", 40, 16).hp = 1e9;
    for (let i = 0; i < 24; i++) expect(spawnSpit(w, 0, 1, 1 + i, 1, 30, spitter.radiusM, spit)).toBe(true);
    expect(spawnSpit(w, 0, 1, 2, 1, 30, spitter.radiusM, spit)).toBe(false);
    expect(w.spits.count).toBe(24);
    // A real Spitter whose release meets the cap: no spit event, then a fresh windup.
    const w2 = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w2, "p0", 25, 16).hp = 1e9;
    const id = spawnZombie(w2, "spitter", 20, 16);
    const ev = record(w2);
    const capped0 = spitStats.capped;
    run(w2, 11);
    for (let i = 0; i < 24; i++) spawnSpit(w2, 99, 1, 1 + i * 0.1, 1, 30, spitter.radiusM, spit); // fill the pool (far away)
    run(w2, 3); // release on the 13th step meets the cap; the 14th starts a new windup
    expect(ev.filter((e) => e.type === "spitter.spat" && e.zombieId === id)).toHaveLength(0); // no 25th
    expect(spitStats.capped).toBeGreaterThan(capped0);
    expect(isWindupState(w2.zombies.state[id] as number)).toBe(true); // re-armed
  });
});
