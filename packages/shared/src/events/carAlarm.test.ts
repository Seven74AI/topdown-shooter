import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { setInput, type World } from "../core/world";
import { setLoadout } from "../combat/loadout";
import { spawnProjectile } from "../combat/projectilePool";
import { bulletBlockT, segmentBoxEntryT } from "../combat/cover";
import { spawnZombie } from "../zombies/zombiePool";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";
import { requestLureFields } from "../zombies/flowField";
import { DOWNTOWN_MAP } from "../map/downtown";
import { segmentHitsBox } from "../buildings/collision";
import { addPlayer } from "../player/player";
import { EVENT_PHASE } from "./eventState";
import { balance, eventWorld, ofType, startNext, tickN } from "./testEvents";

const noZombies = { zombies: () => {} };
const ticks = (s: number): number => Math.round(s * 20);

function armedWorld(seed = 11, systems = noZombies as object) {
  const t = eventWorld({ seed, players: [[24, 16]], systems });
  startNext(t.world, "car_alarm");
  tickN(t.world, 1);
  expect(t.world.special.active.phase).toBe(EVENT_PHASE.ARMED);
  return t;
}

function carCentre(world: World): { x: number; y: number } {
  const c = world.special.carAlarm;
  return { x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2 };
}

/** A spot `r` m from the armed car, outside every box, whose first shot blocker towards the car is the car. */
function clearSpot(world: World, r: number): { x: number; y: number } {
  const c = world.special.carAlarm;
  const { x: cx, y: cy } = carCentre(world);
  for (let a = 0; a < 64; a++) {
    const ang = (a / 64) * Math.PI * 2;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    if (x < 1 || y < 1 || x > 47 || y > 31) continue;
    if (world.obstacles.solids.some((b) => x > b.minX - 0.6 && x < b.maxX + 0.6 && y > b.minY - 0.6 && y < b.maxY + 0.6)) continue;
    const tc = segmentBoxEntryT(x, y, cx - x, cy - y, c.minX, c.minY, c.maxX, c.maxY);
    if (Math.abs(bulletBlockT(world, x, y, cx, cy) - tc) < 1e-9) return { x, y };
  }
  throw new Error("no clear spot");
}

const aimAt = (from: { x: number; y: number }, to: { x: number; y: number }, extra: Partial<PlayerInput> = {}): PlayerInput => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return { ...NEUTRAL_INPUT, aimX: dx / d, aimY: dy / d, fire: true, seq: 1, ...extra };
};

describe("Story 6.8 D1: which car", () => {
  it("over 200 seeds the armed car is a candidate whose centre is 8–25 m from the team (Downtown always has one in range at stage 1)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { world, events } = armedWorld(seed);
      const { x, y } = carCentre(world);
      const d = Math.hypot(x - 24, y - 16);
      expect(d).toBeGreaterThanOrEqual(8);
      expect(d).toBeLessThanOrEqual(25);
      expect(DOWNTOWN_MAP.cover.some((c) => c.name === world.special.carAlarm.car && c.kind === "car")).toBe(true);
      // F1: the start event carries the marker position (the car's centre) and the first phase.
      const tr = ofType(events, "event.triggered");
      expect(tr).toHaveLength(1);
      expect(tr[0]).toMatchObject({ kind: "car_alarm", x, y, phase: EVENT_PHASE.ARMED, startTick: 0 });
    }
  });
});

describe("Story 6.8 F4: shooting the armed car", () => {
  for (const weapon of ["pistol", "shotgun", "assault_rifle"] as const) {
    it(`a ${weapon} bullet that reaches the car starts the alarm at once and credits the shooter`, () => {
      const { world, players, events } = armedWorld();
      const p = players[0]!;
      const spot = clearSpot(world, 4);
      p.x = spot.x;
      p.y = spot.y;
      setLoadout(balance, p.loadout, [weapon, null]);
      setInput(world, "p0", aimAt(spot, carCentre(world)));
      for (let i = 0; i < 10 && world.special.active.phase === EVENT_PHASE.ARMED; i++) tickN(world, 1);
      expect(world.special.active.phase).toBe(EVENT_PHASE.ALARM);
      expect(world.special.log.alarmShotBy).toBe("p0");
      const ch = ofType(events, "event.phase_changed");
      expect(ch).toHaveLength(1); // one alarm, however many pellets reached it
      expect(ch[0]).toMatchObject({ kind: "car_alarm", phase: EVENT_PHASE.ALARM, playerId: "p0" });
    });
  }

  it("two players shooting it on the same tick: one alarm, one credit (the first bullet)", () => {
    const { world, players, events } = armedWorld();
    const p1 = addPlayer(world, "p1", 0, 0);
    const s1 = clearSpot(world, 4);
    for (const p of [players[0]!, p1]) {
      p.x = s1.x;
      p.y = s1.y;
      setLoadout(balance, p.loadout, ["pistol", null]);
      setInput(world, p.id, aimAt(s1, carCentre(world)));
    }
    tickN(world, 5);
    const ch = ofType(events, "event.phase_changed");
    expect(ch).toHaveLength(1);
    expect(["p0", "p1"]).toContain(ch[0]!.playerId);
    expect(world.special.log.alarmShotBy).toBe(ch[0]!.playerId);
  });

  it("a turret's shot, a melee swing, a flame and a grenade don't set it off; the 20 s timer does (credit: nobody)", () => {
    const { world, players, events } = armedWorld();
    const p = players[0]!;
    const c = carCentre(world);
    const near = clearSpot(world, 2.2);
    // turret: a building's projectile flying into the car
    const dx = c.x - near.x;
    const dy = c.y - near.y;
    const d = Math.hypot(dx, dy);
    spawnProjectile(world.projectiles, { x: near.x, y: near.y, dirX: dx / d, dirY: dy / d, speedMps: 60, rangeM: 10, damage: 10, pierce: 1, weaponIndex: 0, owner: "p0", building: 1, advanceM: 0 });
    tickN(world, 3);
    expect(world.special.active.phase).toBe(EVENT_PHASE.ARMED);
    p.x = near.x;
    p.y = near.y;
    for (const w of ["machete", "fire_axe", "flamethrower", "grenade_launcher"] as const) {
      setLoadout(balance, p.loadout, [w, null]);
      setInput(world, "p0", aimAt(near, c, { seq: (world.lastAppliedSeq.get("p0") ?? 0) + 1 }));
      tickN(world, 30);
      expect(world.special.active.phase).toBe(EVENT_PHASE.ARMED);
    }
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 999 });
    const start = world.special.active.phaseTick;
    tickN(world, ticks(20) - (world.tick - start));
    expect(world.special.active.phase).toBe(EVENT_PHASE.ARMED);
    tickN(world, 1);
    expect(world.special.active.phase).toBe(EVENT_PHASE.ALARM);
    expect(world.special.log.alarmShotBy).toBe(null);
    expect(ofType(events, "event.phase_changed")[0]).toMatchObject({ playerId: null, tick: start + ticks(20) });
  });

  it("a bullet stopped by a zombie before the car doesn't count", () => {
    const { world, players } = armedWorld();
    const p = players[0]!;
    const spot = clearSpot(world, 5);
    const c = carCentre(world);
    p.x = spot.x;
    p.y = spot.y;
    const zid = spawnZombie(world, "walker", spot.x + (c.x - spot.x) * 0.35, spot.y + (c.y - spot.y) * 0.35, true);
    world.zombies.hp[zid] = 1e9;
    setLoadout(balance, p.loadout, ["pistol", null]);
    setInput(world, "p0", aimAt(spot, c));
    tickN(world, 20);
    expect(world.special.active.phase).toBe(EVENT_PHASE.ARMED);
  });
});

describe("Story 6.8 F5: the alarm pulls, it doesn't teleport or trap", () => {
  /** The alarm on `street_car_east` (east of the bus), sounding now; the team far west. */
  function sounding(seed = 3) {
    const t = eventWorld({ seed, players: [[4, 26.5]] });
    startNext(t.world, "car_alarm");
    tickN(t.world, 1);
    const car = DOWNTOWN_MAP.cover.find((c) => c.name === "street_car_east")!;
    Object.assign(t.world.special.carAlarm, { car: car.name, minX: car.minX, minY: car.minY, maxX: car.maxX, maxY: car.maxY });
    requestLureFields(t.world, car);
    tickN(t.world, 40); // the lure fields build in the round-robin
    expect(t.world.pathing.lureBuild).toBe(3);
    t.world.special.active.phaseTick = t.world.tick - ticks(20); // the timer runs out this tick
    tickN(t.world, 1);
    expect(t.world.special.active.phase).toBe(2);
    return { ...t, car };
  }
  const distToCar = (world: World, id: number, car: { minX: number; minY: number; maxX: number; maxY: number }): number => {
    const x = world.zombies.x[id]!;
    const y = world.zombies.y[id]!;
    return Math.hypot(Math.max(car.minX - x, 0, x - car.maxX), Math.max(car.minY - y, 0, y - car.maxY));
  };

  it("zombies within 15 m walk round the bus to the car (never through it) and crowd round it; one 15.5 m out ignores it", () => {
    const { world, car } = sounding();
    const near = spawnZombie(world, "walker", 33, 12.5, true); // its straight line to the car crosses the bus
    const brute = spawnZombie(world, "brute", 34, 20.5, true);
    const far = spawnZombie(world, "walker", 44.25 - 15.6, 18.5 + 0.5, true);
    const bus = DOWNTOWN_MAP.solids.find((b) => b.name === "city_bus")!;
    expect(segmentHitsBox(33, 12.5, 44.25 - 33, 18.5 - 12.5, bus.minX, bus.minY, bus.maxX, bus.maxY)).toBe(true);
    let farLured = false;
    for (let i = 0; i < ticks(12); i++) {
      tickN(world, 1);
      for (const id of [near, brute]) {
        const x = world.zombies.x[id]!;
        const y = world.zombies.y[id]!;
        expect(x > bus.minX && x < bus.maxX && y > bus.minY && y < bus.maxY).toBe(false);
      }
      if (world.zombies.lureTicks[far]! > 0) farLured = true;
    }
    expect(distToCar(world, near, car)).toBeLessThan(1.2);
    expect(distToCar(world, brute, car)).toBeLessThan(1.5);
    expect(farLured).toBe(false);
  });

  it("a lured zombie still bites a standing player who comes within 2 m; one 3 m away is not chased", () => {
    const { world, players } = sounding();
    const p = players[0]!;
    const hp0 = p.hp;
    const id = spawnZombie(world, "walker", 38, 21, true);
    tickN(world, 2);
    expect(world.zombies.lureTicks[id]).toBeGreaterThan(0);
    p.x = world.zombies.x[id]! - 1.5;
    p.y = world.zombies.y[id]!;
    tickN(world, ticks(2));
    expect(p.hp).toBeLessThan(hp0);
  });

  it("rushing zombies ignore the alarm (the wave always ends); stampede Runners too", () => {
    const { world } = sounding();
    const id = spawnZombie(world, "walker", 40, 21, true);
    world.zombies.state[id] = ZOMBIE_STATE.RUSH;
    tickN(world, 5);
    expect(world.zombies.lureTicks[id]).toBe(0);
    expect(world.zombies.x[id]!).toBeLessThan(40); // heading west to the team
  });

  it("the pull ends after 15 s: event.ended, every lure cleared, the fields idle", () => {
    const { world, events } = sounding();
    const id = spawnZombie(world, "walker", 40, 21, true);
    tickN(world, ticks(15) - 2);
    expect(world.special.active.kind).toBe(0);
    expect(world.zombies.lureTicks[id]).toBeGreaterThan(0);
    tickN(world, 2);
    expect(world.special.active.kind).toBe(-1);
    expect(world.zombies.lureTicks[id]).toBe(0);
    expect(world.pathing.lureBuild).toBe(0);
    expect(ofType(events, "event.ended")).toEqual([{ type: "event.ended", kind: "car_alarm", outcome: "done" }]);
  });
});

describe("Story 6.8 review L5/L6: the 8 m minimum; once lured, lured for the alarm", () => {
  it("a candidate car ≤ 8 m from the team is never armed while another is in range (200 seeds)", () => {
    const car = DOWNTOWN_MAP.cover.find((c) => c.name === "parked_car_1")!;
    const cx = (car.minX + car.maxX) / 2;
    for (let seed = 1; seed <= 200; seed++) {
      const t = eventWorld({ seed, players: [[cx, 24]], systems: noZombies });
      startNext(t.world, "car_alarm");
      tickN(t.world, 1);
      expect(t.world.special.carAlarm.car).not.toBe("parked_car_1");
      const c = t.world.special.carAlarm;
      expect(Math.hypot((c.minX + c.maxX) / 2 - cx, (c.minY + c.maxY) / 2 - 24)).toBeGreaterThanOrEqual(8);
    }
  });

  it("a zombie lured inside 15 m stays lured when pushed out of it (until the alarm ends)", () => {
    const t = eventWorld({ seed: 3, players: [[4, 26.5]], systems: noZombies });
    startNext(t.world, "car_alarm");
    tickN(t.world, 1);
    t.world.special.active.phaseTick = t.world.tick - ticks(20);
    tickN(t.world, 1);
    const c = carCentre(t.world);
    const id = spawnZombie(t.world, "walker", c.x + 3, c.y, true);
    tickN(t.world, 2);
    expect(t.world.zombies.lureTicks[id]).toBeGreaterThan(0);
    t.world.zombies.x[id] = Math.min(47, c.x + 18);
    tickN(t.world, 5);
    expect(t.world.zombies.lureTicks[id]).toBeGreaterThan(0);
  });
});
