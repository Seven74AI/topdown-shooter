import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, type Building, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { segmentBoxEntryT } from "../combat/cover";
import { applyKnockback, applyZombieDamage } from "../combat/damage";
import type { SimEvent } from "../core/simEvents";
import { ticksFor } from "../core/time";
import { createWorld, setInput, step, type World } from "../core/world";
import { applyDecayStage } from "../decay/applyDecayStage";
import { circleInFire } from "../decay/decayState";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { knockPlayer } from "../player/knockback";
import { addPlayer } from "../player/player";
import { spawnProjectile } from "../combat/projectilePool";
import { NEUTRAL_INPUT } from "../net/input";
import { bruteStats } from "./zombieAi";
import { spawnZombie } from "./zombiePool";
import { ZOMBIE_STATE, isWindupState } from "./zombieTypes";
import { bruteLookIndex, BRUTE_LOOKS } from "./brute";
import { wideGapRing } from "./flowField";
import { meleeLineClear } from "../combat/cover";

/**
 * Story 5.7: the Brute (fairness rules F1–F5, F7 of the story file). One mechanic per test: no wave
 * director (the wave rules are in `waveDirector.test.ts`), plain map unless the rule is about cover.
 */
const NO_WAVES = { waves: () => {} };
const balance = loadBalance();
const B = balance.zombies.types.brute as NonNullable<(typeof balance.zombies.types)["brute"]>;
const PR = balance.player.radiusM;
const CONTACT = B.radiusM + PR; // 1.0 m centre to centre
const WINDUP = ticksFor(B.windupS); // 10
const KNOCK = ticksFor(B.knockbackS); // 4
const INTERVAL = ticksFor(B.attackIntervalS); // 30

function setup(opts: { map?: typeof DOWNTOWN_MAP; seed?: number } = {}) {
  const world = createWorld({ balance, seed: opts.seed ?? 1, systems: NO_WAVES, ...(opts.map ? { map: opts.map } : {}) });
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, events };
}

const tick = (w: World, n = 1) => {
  for (let i = 0; i < n; i++) step(w, TICK_DT_S);
};

const hitsOn = (events: SimEvent[], pid: string) => events.filter((e) => e.type === "player.damaged" && e.playerId === pid && e.sourceZombieId >= 0);

/** Steps until zombie `id` is in its windup (returns the tick count stepped; -1 if it never was). */
function untilWindup(w: World, id: number, max = 200): number {
  for (let t = 1; t <= max; t++) {
    tick(w);
    if (isWindupState(w.zombies.state[id] as number)) return t;
  }
  return -1;
}

describe("Story 5.7 Brute: stats (AC 1, F8)", () => {
  it("120 HP, 35 damage, 1.0 m/s, 0.6 m body; a kill pays 25", () => {
    expect(B).toMatchObject({ hp: 120, damage: 35, speedMps: 1, radiusM: 0.6, reward: 25, attackIntervalS: 1.5 });
    const { world } = setup();
    const p = addPlayer(world, "p0", 10, 10);
    const id = spawnZombie(world, "brute", 30, 20);
    expect(world.zombies.hp[id]).toBe(120);
    const w0 = p.wallet;
    expect(applyZombieDamage(world, id, 119, 1, 0, 0, "p0", "pistol")).toBe(false);
    expect(applyZombieDamage(world, id, 1, 1, 0, 0, "p0", "pistol")).toBe(true);
    tick(world);
    expect(p.wallet - w0).toBe(25);
  });

  it("five looks, picked from the named stream look:brute:<netId> (same seed → same look; all five appear)", () => {
    const seen = new Set<number>();
    for (let netId = 0; netId < 200; netId++) {
      const k = bruteLookIndex(1234, netId);
      expect(k).toBe(bruteLookIndex(1234, netId));
      expect(k >= 0 && k < BRUTE_LOOKS).toBe(true);
      seen.add(k);
    }
    expect(seen.size).toBe(5);
    let differ = 0;
    for (let netId = 0; netId < 50; netId++) if (bruteLookIndex(1, netId) !== bruteLookIndex(2, netId)) differ++;
    expect(differ).toBeGreaterThan(20); // another run seed, other looks
  });
});

describe("Story 5.7 F1: you always see the Brute's hit coming", () => {
  it("touch → it stands still in WINDUP for 10 ticks (0.5 s), then hits for 35", () => {
    const { world, events } = setup();
    const p = addPlayer(world, "p0", 24, 16);
    const id = spawnZombie(world, "brute", 24 + CONTACT, 16);
    const startedAfter = untilWindup(world, id);
    expect(startedAfter).toBe(1);
    expect(world.zombies.state[id]).toBe(ZOMBIE_STATE.WINDUP);
    const x0 = world.zombies.x[id] as number;
    let hitAt = -1;
    for (let t = 1; t <= 20 && hitAt < 0; t++) {
      tick(world);
      if (hitsOn(events, "p0").length > 0) hitAt = t;
      else expect(world.zombies.x[id], `still at windup tick ${t}`).toBeCloseTo(x0, 6);
    }
    expect(hitAt).toBe(WINDUP);
    expect(hitsOn(events, "p0")).toEqual([{ type: "player.damaged", playerId: "p0", amount: 35, sourceZombieId: id, tag: "zombie", sourcePlayerId: null }]);
    expect(p.hp).toBe(65);
    expect(world.zombies.state[id]).toBe(ZOMBIE_STATE.CHASE);
    expect(world.zombies.attackCooldownTicks[id]).toBe(INTERVAL);
  });

  it("stepping 0.3 m (or anything ≥ 0.29 m: the 1 cm swingToleranceM) out of contact on the last tick dodges it; 0.285 m does not (review L1: deterministic)", () => {
    for (const [gap, hit] of [
      [0.3, false],
      [0.292, false],
      [0.285, true],
      [0.2, true],
    ] as const) {
      const { world, events } = setup();
      const p = addPlayer(world, "p0", 24, 16);
      const id = spawnZombie(world, "brute", 24 + CONTACT, 16);
      untilWindup(world, id);
      tick(world, WINDUP - 1);
      expect(hitsOn(events, "p0"), `gap ${gap}`).toHaveLength(0);
      const bx = world.zombies.x[id] as number;
      p.x = p.prevX = bx - CONTACT - gap; // the player stepped back
      tick(world);
      expect(hitsOn(events, "p0").length > 0, `gap ${gap}`).toBe(hit);
      expect(p.knockTicks > 0, `gap ${gap}: knocked`).toBe(hit);
      expect(world.zombies.attackCooldownTicks[id], `gap ${gap}: the interval runs either way`).toBe(INTERVAL);
    }
  });

  it("walking away (4.5 m/s) during the windup always dodges; standing still never does (liveness)", () => {
    for (const walk of [true, false]) {
      const { world, events } = setup();
      addPlayer(world, "p0", 24, 16);
      const id = spawnZombie(world, "brute", 24 + CONTACT, 16);
      untilWindup(world, id);
      for (let t = 0; t < WINDUP; t++) {
        setInput(world, "p0", { ...NEUTRAL_INPUT, seq: t + 1, moveX: walk ? -1 : 0 });
        tick(world);
      }
      expect(hitsOn(events, "p0").length, walk ? "walked away" : "stood").toBe(walk ? 0 : 1);
    }
  });

  it("per body: two Brutes on two players wind up and hit on their own clocks (3 ticks apart)", () => {
    const { world, events } = setup();
    addPlayer(world, "p0", 8, 16);
    addPlayer(world, "p1", 40, 16);
    spawnZombie(world, "brute", 8 + CONTACT, 16);
    tick(world, 3);
    spawnZombie(world, "brute", 40 - CONTACT, 16);
    const at: Record<string, number> = {};
    for (let t = 4; t < 40; t++) {
      tick(world);
      for (const pid of ["p0", "p1"]) if (at[pid] === undefined && hitsOn(events, pid).length > 0) at[pid] = t;
    }
    expect(at.p0).toBe(1 + WINDUP);
    expect(at.p1).toBe(4 + WINDUP);
  });

  it("other types keep their instant hit (no windup: Walker bites on the contact tick)", () => {
    const { world, events } = setup();
    addPlayer(world, "p0", 24, 16);
    const id = spawnZombie(world, "walker", 24 + 0.75, 16);
    tick(world);
    expect(hitsOn(events, "p0")).toHaveLength(1);
    expect(isWindupState(world.zombies.state[id] as number)).toBe(false);
  });
});

describe("Story 5.7 F2: the hit pushes you 1.5 m straight away, never into or through anything", () => {
  it("open ground, every angle 0–345° step 15°: 1.5 m away from the Brute in 4 ticks of 0.375 m; no steering, then control is back", () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const { world, events } = setup();
      const p = addPlayer(world, "p0", 24, 16);
      const id = spawnZombie(world, "brute", 24 - ux * CONTACT, 16 - uy * CONTACT);
      let seq = 0;
      // The player pushes TOWARD the Brute the whole time: the knock ignores it (no steering).
      const push = () => setInput(world, "p0", { ...NEUTRAL_INPUT, seq: ++seq, moveX: -ux * 0.001, moveY: -uy * 0.001 });
      for (let t = 0; t < 30 && hitsOn(events, "p0").length === 0; t++) {
        push();
        tick(world);
      }
      expect(hitsOn(events, "p0"), `${deg}°`).toHaveLength(1);
      expect(p.knockTicks).toBe(KNOCK);
      const x0 = p.x;
      const y0 = p.y;
      for (let k = 1; k <= KNOCK; k++) {
        setInput(world, "p0", { ...NEUTRAL_INPUT, seq: ++seq, moveX: -ux, moveY: -uy });
        tick(world);
        expect(Math.hypot(p.x - x0, p.y - y0), `${deg}° tick ${k}`).toBeCloseTo(0.375 * k, 2);
      }
      expect((p.x - x0) * ux + (p.y - y0) * uy, `${deg}°: along the push`).toBeCloseTo(1.5, 2);
      expect(Math.abs(-(p.x - x0) * uy + (p.y - y0) * ux), `${deg}°: straight`).toBeLessThan(0.01);
      expect(p.knockTicks).toBe(0);
      const xs = p.x;
      const ys = p.y;
      setInput(world, "p0", { ...NEUTRAL_INPUT, seq: ++seq, moveX: -ux, moveY: -uy });
      tick(world);
      expect((p.x - xs) * -ux + (p.y - ys) * -uy, `${deg}°: steering is back`).toBeCloseTo(balance.player.speedMps * TICK_DT_S, 3);
      void id;
    }
  });

  /** Every map solid and solid building's box. */
  const boxesOf = (w: World): MapBox[] => [...w.obstacles.solids, ...w.buildings.list.filter((b) => b.solid).map((b) => ({ name: b.type, minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY }) as MapBox)];

  /**
   * Knocks a player standing 5 cm off `target` straight at it from every angle (0–345° step 15°)
   * and checks every tick: never inside a box, never through `target`, always inside the map.
   * Returns [cases, cases stopped short].
   */
  function knockAt(build: () => { world: World; target: MapBox }): [number, number] {
    let cases = 0;
    let stopped = 0;
    for (let deg = 0; deg < 360; deg += 15) {
      const { world, target } = build();
      const a = (deg * Math.PI) / 180;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const cx = (target.minX + target.maxX) / 2;
      const cy = (target.minY + target.maxY) / 2;
      let t = 0;
      while (circleOverlapsBox(cx - ux * t, cy - uy * t, PR + 0.05, target.minX, target.minY, target.maxX, target.maxY)) t += 0.01;
      const px = cx - ux * t;
      const py = cy - uy * t;
      const boxes = boxesOf(world);
      const inside = (x: number, y: number, r: number) => boxes.some((b) => circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY));
      if (inside(px, py, PR) || px < PR || py < PR || px > world.map.widthM - PR || py > world.map.heightM - PR) continue; // no room to stand there
      cases++;
      const p = addPlayer(world, "p0", px, py);
      knockPlayer(p, px - ux * CONTACT, py - uy * CONTACT, B);
      for (let k = 0; k < KNOCK; k++) {
        tick(world);
        expect(inside(p.x, p.y, PR - 1e-6), `${target.name} ${deg}° tick ${k}: inside a box`).toBe(false);
        expect(p.x >= PR - 1e-9 && p.y >= PR - 1e-9 && p.x <= world.map.widthM - PR + 1e-9 && p.y <= world.map.heightM - PR + 1e-9).toBe(true);
      }
      expect(segmentBoxEntryT(px, py, p.x - px, p.y - py, target.minX, target.minY, target.maxX, target.maxY), `${target.name} ${deg}°: through it`).toBeLessThan(0);
      if (Math.hypot(p.x - px, p.y - py) < 1.5 - 0.01) stopped++;
    }
    return [cases, stopped];
  }

  const downtown = () => {
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { ...NO_WAVES, zombies: () => {}, buildings: () => {} } });
    return world;
  };
  const named = (w: World, name: string) => w.obstacles.solids.find((s) => s.name === name) as MapBox;
  let nextId = 1;
  const building = (w: World, type: string, x: number, y: number, rot: BuildingRotation = 0) => {
    const b = addBuildingAt(w, { id: nextId++, type, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot, hp: 1000 }) as Building;
    return { name: type, minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY } as MapBox;
  };

  for (const [kind, build] of [
    ["a car", () => { const world = downtown(); return { world, target: named(world, "parked_car_1") }; }],
    ["the bus", () => { const world = downtown(); return { world, target: named(world, "city_bus") }; }],
    ["a building", () => { const world = downtown(); return { world, target: named(world, "se_offices") }; }],
    ["a thin wall (parking_wall)", () => { const world = downtown(); return { world, target: named(world, "parking_wall") }; }],
    ["a wood barricade", () => { const world = downtown(); return { world, target: building(world, "wood_barricade", 23, 20) }; }],
    ["a turret", () => { const world = downtown(); return { world, target: building(world, "auto_turret", 23, 20) }; }],
  ] as const) {
    it(`stops at ${kind} from every angle (never inside, never through)`, () => {
      const [cases, stopped] = knockAt(build as () => { world: World; target: MapBox });
      expect(cases).toBeGreaterThanOrEqual(12); // liveness: most angles have room to stand
      expect(stopped).toBeGreaterThanOrEqual(cases / 2); // and the knock really hit the box
    });
  }

  it("stops at the map edge (left, top, right, bottom)", () => {
    for (const [x, y, ux, uy] of [
      [PR + 0.3, 16, -1, 0],
      [24, PR + 0.3, 0, -1],
      [48 - PR - 0.3, 16, 1, 0],
      [24, 32 - PR - 0.3, 0, 1],
    ] as const) {
      const { world } = setup();
      const p = addPlayer(world, "p0", x, y);
      knockPlayer(p, x - ux, y - uy, B);
      tick(world, KNOCK);
      expect(p.x).toBeGreaterThanOrEqual(PR - 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(PR - 1e-9);
      expect(p.x).toBeLessThanOrEqual(48 - PR + 1e-9);
      expect(p.y).toBeLessThanOrEqual(32 - PR + 1e-9);
      expect(Math.hypot(p.x - x, p.y - y)).toBeCloseTo(0.3, 6);
    }
  });

  it("stops at the edge of a burning fire (never pushed into fire), from every angle", () => {
    let cases = 0;
    let stopped = 0;
    for (const fi of [0, 1]) for (let deg = 0; deg < 360; deg += 15) {
      const world = createWorld({ balance, seed: 4, map: DOWNTOWN_MAP, systems: { ...NO_WAVES, zombies: () => {}, buildings: () => {} } });
      applyDecayStage(world, 3, world.decay.variants);
      const f = world.decay.fires[fi];
      if (!f) throw new Error("no fire at stage 3");
      const a = (deg * Math.PI) / 180;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const px = f.x - ux * (f.radiusM + PR + 0.1);
      const py = f.y - uy * (f.radiusM + PR + 0.1);
      const boxes = [...world.obstacles.solids];
      if (boxes.some((b) => circleOverlapsBox(px, py, PR, b.minX, b.minY, b.maxX, b.maxY)) || px < PR || py < PR) continue;
      cases++;
      const p = addPlayer(world, "p0", px, py);
      knockPlayer(p, px - ux, py - uy, B);
      for (let k = 0; k < KNOCK; k++) {
        tick(world);
        expect(circleInFire(world.decay.fires, p.x, p.y, PR), `${deg}° tick ${k}`).toBe(false);
      }
      if (Math.hypot(p.x - px, p.y - py) < 1.5 - 0.01) stopped++;
    }
    expect(cases).toBeGreaterThanOrEqual(12);
    expect(stopped).toBe(cases); // 0.1 m from the fire's edge, every knock stops short
  });
});

describe("Story 5.7 F3: a downed player is never pushed", () => {
  it("the hit that downs (35 ≥ HP) knocks nothing; a downed body is never knocked later", () => {
    const { world, events } = setup();
    const p = addPlayer(world, "p0", 24, 16);
    p.hp = 35;
    spawnZombie(world, "brute", 24 + CONTACT, 16);
    tick(world, 1 + WINDUP);
    expect(hitsOn(events, "p0")).toHaveLength(1);
    expect(p.status).toBe("downed");
    expect(p.knockTicks).toBe(0);
    expect([p.x, p.y]).toEqual([24, 16]);
    knockPlayer(p, 25, 16, B); // even a direct call
    expect(p.knockTicks).toBe(0);
    tick(world, 60);
    expect(p.x).toBe(24);
    expect(hitsOn(events, "p0")).toHaveLength(1); // and never hit again (zombies ignore the downed)
  });
});

describe("Story 5.7 F4: your weapons barely move a Brute", () => {
  it("knockback (axe 1.5 m → 0.3, shotgun 0.5 → 0.1) and pushback (× 0.2) on a Brute; a Walker takes the full distance", () => {
    const { world } = setup();
    const b = spawnZombie(world, "brute", 20, 16);
    const w = spawnZombie(world, "walker", 30, 16);
    expect(applyKnockback(world, b, 1, 0, 1.5)).toBeCloseTo(0.3, 9);
    expect(world.zombies.x[b]).toBeCloseTo(20.3, 5);
    expect(applyKnockback(world, b, 0, 1, 0.5)).toBeCloseTo(0.1, 9);
    expect(applyKnockback(world, w, 1, 0, 1.5)).toBeCloseTo(1.5, 9);
    const x0 = world.zombies.x[b] as number;
    applyZombieDamage(world, b, 1, 1, 0, 0.15, "p0", "assault_rifle");
    expect((world.zombies.x[b] as number) - x0).toBeCloseTo(0.03, 5);
  });

  it("crowd overlap is split by body area: a Walker moves the Brute ~25 %, two Walkers still ½ each", () => {
    const files = withOverrides(bundledBalanceFiles(), [["zombies", "crowd.separationStrength", 0]]);
    const b2 = loadBalance(files);
    for (const [a, c, share] of [
      ["brute", "walker", (0.35 * 0.35) / (0.35 * 0.35 + 0.6 * 0.6)],
      ["walker", "brute", (0.6 * 0.6) / (0.35 * 0.35 + 0.6 * 0.6)],
      ["walker", "walker", 0.5],
    ] as const) {
      const world = createWorld({ balance: b2, seed: 1, systems: NO_WAVES });
      const ra = b2.zombies.types[a]?.radiusM ?? 0;
      const rc = b2.zombies.types[c]?.radiusM ?? 0;
      const ia = spawnZombie(world, a, 20, 16);
      const ic = spawnZombie(world, c, 20 + ra + rc - 0.1, 16);
      tick(world);
      const da = 20 - (world.zombies.x[ia] as number);
      const dc = (world.zombies.x[ic] as number) - (20 + ra + rc - 0.1);
      expect(da + dc, `${a}/${c}`).toBeCloseTo(0.1, 5);
      expect(da / 0.1, `${a} moved`).toBeCloseTo(share, 4);
    }
  });
});

describe("Story 5.7 F5: a Brute hurts buildings 3× as much (105 a hit)", () => {
  /** Player locked in a ring of `type` (closed: the Brute must break one), Brute outside to the east. */
  function siege(type: string, ring: (add: (x: number, y: number, rot?: BuildingRotation) => void) => void) {
    const { world, events } = setup();
    let id = 1;
    const add = (x: number, y: number, rot: BuildingRotation = 0) => {
      addBuildingAt(world, { id: id++, type, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot, hp: balance.buildings.types[type]?.hp ?? 0 });
    };
    ring(add);
    const p = addPlayer(world, "p0", 24, 16);
    p.hp = 1e9;
    const z = spawnZombie(world, "brute", 32, 16);
    world.zombies.hp[z] = 1e9; // turrets shoot back
    const hp = new Map(world.buildings.list.map((b) => [b.id, b.hp]));
    const drops: number[] = [];
    let destroyedAfter = -1;
    let hitTicks: number[] = [];
    for (let t = 0; t < 20 * 60 && destroyedAfter < 0; t++) {
      tick(world);
      for (const b of world.buildings.list) {
        const before = hp.get(b.id) as number;
        if (b.hp < before) {
          drops.push(before - b.hp);
          hitTicks.push(t);
          hp.set(b.id, b.hp);
        }
      }
      if (events.some((e) => e.type === "building.destroyed")) destroyedAfter = drops.length + 1;
    }
    hitTicks = hitTicks.map((t, i) => (i === 0 ? 0 : t - (hitTicks[i - 1] as number)));
    return { drops, destroyedAfter, hitTicks, events };
  }

  it("wood barricade (200 HP): 105, then destroyed by the 2nd hit, one interval apart", () => {
    const r = siege("wood_barricade", (add) => {
      add(23, 14.5);
      add(23, 17);
      add(22.5, 15, 1);
      add(25, 15, 1);
    });
    expect(r.drops).toEqual([105]);
    expect(r.destroyedAfter).toBe(2);
    expect(r.hitTicks).toEqual([0]);
  });

  it("auto-turret (300 HP): 105, 105, then destroyed by the 3rd hit", () => {
    const r = siege("auto_turret", (add) => {
      for (let x = 22; x <= 25; x++) {
        add(x, 14);
        add(x, 17);
      }
      add(22, 15);
      add(22, 16);
      add(25, 15);
      add(25, 16);
    });
    expect(r.drops.slice(0, 2)).toEqual([105, 105]);
    expect(r.destroyedAfter).toBe(3);
    expect(r.hitTicks[1]).toBe(INTERVAL); // no windup on buildings: one hit per interval
    expect(bruteStats.buildingHits).toBeGreaterThan(0);
  });

  it("with an open way round it never touches the barricade (the 3.5 rule)", () => {
    const { world } = setup();
    addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 46, gy: 30, rot: 1, hp: 200 }); // x 23–23.5, y 15–17
    addPlayer(world, "p0", 20, 16).hp = 1e9;
    spawnZombie(world, "brute", 28, 16);
    tick(world, 20 * 20);
    expect(world.buildings.list[0]?.hp).toBe(200);
  });
});

describe("Story 5.7 F7: its body is what you shoot", () => {
  it("a bullet hits it at its 0.6 m edge, misses 1 cm outside it", () => {
    for (const [off, hit] of [
      [0.59, true],
      [0.61, false],
    ] as const) {
      const { world, events } = setup();
      spawnZombie(world, "brute", 20, 16 + off);
      spawnProjectile(world.projectiles, { x: 10, y: 16, dirX: 1, dirY: 0, speedMps: 60, rangeM: 20, damage: 1, pierce: 1, weaponIndex: 0, owner: "p0", advanceM: 0 });
      tick(world, 12);
      expect(events.some((e) => e.type === "zombie.hit"), `offset ${off}`).toBe(hit);
    }
  });
});

describe("Story 5.7 review M1 (designer): long reach into gaps", () => {
  const SLOT_BALANCE = balance;
  const GAP = B.gapReachM;
  /** The five Downtown slots narrower than a Brute: [a, b, stage, mask, slot centre line, mouth point, inward unit, Brute start]. */
  type Slot = { name: string; stage: number; mask: number | null; mouth: [number, number]; inward: [number, number]; start: [number, number] };
  const SLOTS: Slot[] = [
    { name: "parking_wall ↔ parked_car_1", stage: 1, mask: null, mouth: [11, 26], inward: [0, 1], start: [4, 22] },
    { name: "parked_car_1 ↔ parked_car_2", stage: 1, mask: null, mouth: [14, 26], inward: [0, 1], start: [20, 21] },
    { name: "parked_car_2 ↔ parked_car_3", stage: 1, mask: null, mouth: [17, 26], inward: [0, 1], start: [23, 21] },
    { name: "curb_car_south_in_road ↔ se_offices", stage: 2, mask: 215, mouth: [29.5, 25.5], inward: [0, 1], start: [24, 20] },
    { name: "street_car_west ↔ curb_car_west_far_in_road", stage: 2, mask: 207, mouth: [7, 15.5], inward: [-1, 0], start: [12, 22] },
  ];
  function slotWorld(s: Slot, depth: number) {
    const world = createWorld({ balance: SLOT_BALANCE, seed: 3, map: DOWNTOWN_MAP, systems: NO_WAVES });
    applyDecayStage(world, s.stage, s.mask ?? world.decay.variants);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    const p = addPlayer(world, "p0", s.mouth[0] + s.inward[0] * depth, s.mouth[1] + s.inward[1] * depth);
    p.hp = 1e9;
    p.maxHp = 1e9;
    const id = spawnZombie(world, "brute", s.start[0], s.start[1]);
    world.zombies.hp[id] = 1e9;
    return { world, events, p, id };
  }

  it("a player 0.5 m and 1 m deep in each of the five slots is hit (from the mouth, with a clear line)", () => {
    expect(GAP).toBe(1.8);
    for (const s of SLOTS) {
      for (const depth of [0.5, 1]) {
        const { world, events, p, id } = slotWorld(s, depth);
        expect(wideGapRing(world, p.x, p.y), `${s.name} ${depth}: a slot the Brute can't enter`).toBeGreaterThanOrEqual(2);
        let hitAt = -1;
        let clear = true;
        for (let t = 0; t < 20 * 40 && hitAt < 0; t++) {
          const n = events.length;
          step(world, TICK_DT_S);
          for (let k = n; k < events.length; k++) {
            const e = events[k] as SimEvent;
            if (e.type === "player.damaged" && e.sourceZombieId === id) {
              hitAt = t;
              clear = meleeLineClear(world, world.zombies.x[id] as number, world.zombies.y[id] as number, p.prevX, p.prevY);
            }
          }
        }
        expect(hitAt, `${s.name} ${depth} m deep`).toBeGreaterThan(0);
        expect(clear, `${s.name}: hit with a clear line`).toBe(true);
      }
    }
  });

  it("the long swing needs a clear line: never through the parking wall (a Brute 1.55 m away behind it misses; at the mouth it hits)", () => {
    for (const [bx, by, hit] of [
      [9.4, 27, false], // west of the 0.5 m wall, inside 1.8 m
      [11, 25.4, true], // at the slot's mouth
    ] as const) {
      const world = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: { ...NO_WAVES, player: () => {} } });
      applyDecayStage(world, 1, world.decay.variants);
      const events: SimEvent[] = [];
      world.events.subscribe((e) => events.push(e));
      const p = addPlayer(world, "p0", 11, 26.9);
      p.hp = 1e9;
      const id = spawnZombie(world, "brute", bx, by);
      expect(Math.hypot(p.x - bx, p.y - by)).toBeLessThan(GAP - B.swingToleranceM);
      world.zombies.state[id] = ZOMBIE_STATE.WINDUP; // its windup ends this tick
      world.zombies.spitTicks[id] = 1;
      tick(world);
      expect(hitsOn(events, "p0").length > 0, `Brute at ${bx},${by}`).toBe(hit);
    }
  });

  it("a player 2.25 m deep in a long slot is out of reach (> 1.8 m from every cell a Brute can stand on)", () => {
    for (const s of SLOTS.slice(0, 3)) {
      const { world, events, id } = slotWorld(s, 2.25);
      for (let t = 0; t < 20 * 40; t++) step(world, TICK_DT_S);
      expect(events.filter((e) => e.type === "player.damaged" && e.sourceZombieId === id), s.name).toHaveLength(0);
    }
  });

  it("the long reach only into a gap: a player pressed against a car in the open is reached at contact + 0.3 m as always", () => {
    const world = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: NO_WAVES });
    applyDecayStage(world, 1, world.decay.variants);
    const car = world.obstacles.solids.find((b) => b.name === "street_car_west") as MapBox; // [4, 13, 8.5, 15]
    const p = addPlayer(world, "p0", 6, car.minY - PR - 0.05);
    expect(wideGapRing(world, p.x, p.y)).toBeLessThanOrEqual(1);
    const id = spawnZombie(world, "brute", 6 - CONTACT, p.y - 0.3);
    untilWindup(world, id);
    tick(world, WINDUP - 1);
    const bx = world.zombies.x[id] as number;
    const by = world.zombies.y[id] as number;
    // Stepped along the car's face (still pressed against it) to 1.4 m: inside 1.8, outside 1.3.
    const dy = p.y - by;
    p.x = p.prevX = bx + Math.sqrt((CONTACT + 0.4) ** 2 - dy * dy);
    expect(wideGapRing(world, p.x, p.y)).toBeLessThanOrEqual(1);
    const hp = p.hp;
    tick(world);
    expect(Math.hypot(p.x - bx, p.y - by)).toBeGreaterThan(CONTACT + B.swingReachM);
    expect(p.hp).toBe(hp); // dodged: no 1.8 m reach in the open
  });
});

describe("Story 5.7 review L1: a knock during the windup is decided deterministically", () => {
  it("the axe's 0.3 m knock (1.5 m × 20 %) during the windup always makes it miss; a 0.25 m one never does (24 angles)", () => {
    for (const [knock, hit] of [
      [1.5, false],
      [1.25, true],
    ] as const) {
      let hits = 0;
      for (let deg = 0; deg < 360; deg += 15) {
        const a = (deg * Math.PI) / 180;
        const { world, events } = setup();
        addPlayer(world, "p0", 24, 16).hp = 1e9;
        const id = spawnZombie(world, "brute", 24 + Math.cos(a) * CONTACT, 16 + Math.sin(a) * CONTACT);
        untilWindup(world, id);
        tick(world, 3);
        expect(applyKnockback(world, id, Math.cos(a), Math.sin(a), knock)).toBeCloseTo((knock * B.knockbackTakenPct) / 100, 6);
        tick(world, WINDUP);
        if (hitsOn(events, "p0").length > 0) hits++;
      }
      expect(hits, `knock ${knock}`).toBe(hit ? 24 : 0);
    }
  });
});
