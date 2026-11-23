import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import type { FlameStats } from "../config/balanceSchema";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { ticksFor } from "../core/time";
import { createWorld, setInput, step, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { DEG_TO_RAD } from "../math/vec";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { encodeNetEvent } from "../net/netEvents";
import { addPlayer, type PlayerState } from "../player/player";
import { isZombieAlive, spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt } from "../buildings/buildings";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { CoverKind, DistrictMap } from "../map/districtMap";
import { activeSlot, setLoadout } from "./loadout";
import { fuelTicksOf, weaponStats } from "./weapons";
import { resetFlameClocks } from "./flame";
import { resetBurnClocks } from "../decay/fire";
import { setZombieHistoryEnabled } from "./rewind";
import { REWIND_MAX_TICKS } from "../config/constants";

/**
 * Story 5.4: the Flamethrower (FT1 fuel jet, 6 m × 20°) and the Gas torch (FT2, 3 m × 60°): the
 * fairness rules FR-A…FR-H, one mechanic per test (no wave director; zombies stand still).
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const FT = weaponStats(balance, "flamethrower") as FlameStats;
const GT = weaponStats(balance, "gas_torch") as FlameStats;
const R = balance.zombies.types.walker?.radiusM ?? 0;
const PX = 10;
const PY = 16;
/** The cone's origin: the muzzle (player radius + 0.1 m along the aim). */
const MX = PX + 0.4 + 0.1;
const PULSE = ticksFor(FT.pulseS); // 5
const PPULSE = ticksFor(FT.playerPulseS); // 10
const ZDMG = FT.damage * FT.pulseS; // 5
const PDMG = (FT.damage * FT.playerPulseS * balance.combat.friendlyFire.pct) / 100; // 5
const FUEL = fuelTicksOf(FT); // 120
const BIG = 1e6;

function setup(weapon = "flamethrower", map: DistrictMap = PLACEHOLDER_MAP, second: string | null = "pistol") {
  const world = createWorld({ balance, seed: 1, map, systems: STILL });
  const p = addPlayer(world, "p0", PX, PY);
  p.hp = BIG;
  setLoadout(balance, p.loadout, [weapon, second]);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  const seqs = new Map<string, number>();
  const input = (id: string, extra: Partial<PlayerInput>) => {
    const seq = (seqs.get(id) ?? 0) + 1;
    seqs.set(id, seq);
    setInput(world, id, { ...NEUTRAL_INPUT, seq, ...extra });
  };
  /** One tick; p0 flames along +x unless told otherwise; other players listed in `others` flame too. */
  const tick = (extra: Partial<PlayerInput> = {}, others: Record<string, Partial<PlayerInput>> = {}) => {
    input("p0", { aimX: 1, aimY: 0, fire: true, ...extra });
    for (const [id, e] of Object.entries(others)) input(id, e);
    step(world, TICK_DT_S);
  };
  return { world, p, events, tick, input };
}
/** A Walker at `dist` m from the MUZZLE along angle `deg` (centre). */
const at = (world: World, deg: number, dist: number, hp = BIG) => {
  const id = spawnZombie(world, "walker", MX + Math.cos(deg * DEG_TO_RAD) * dist, PY + Math.sin(deg * DEG_TO_RAD) * dist);
  world.zombies.hp[id] = hp;
  return id;
};
const lost = (world: World, id: number) => BIG - (world.zombies.hp[id] as number);
const of = <T extends SimEvent["type"]>(events: SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const coverMap = (kind: CoverKind, box: { minX: number; minY: number; maxX: number; maxY: number }): DistrictMap => ({ ...PLACEHOLDER_MAP, name: "flame-cover", cover: [{ name: `t_${kind}`, kind, minStage: 1, ...box }] });
const mate = (world: World, id: string, x: number, y = PY): PlayerState => {
  const q = addPlayer(world, id, x, y);
  q.hp = 100;
  return q;
};

describe("FR-A: flames hurt what the cone touches, and only that", () => {
  for (const [name, w] of [["flamethrower", FT], ["gas_torch", GT]] as const) {
    it(`${name}: ${w.rangeM} m × ${w.coneDeg}° from the muzzle to the body's edge: inside, on the edge, outside`, () => {
      const s = setup(name);
      const half = w.coneDeg / 2;
      const inside = [at(s.world, 0, w.rangeM + R - 0.01), at(s.world, half - 1, w.rangeM * 0.6), at(s.world, -(half - 1), w.rangeM * 0.6)];
      // centre outside the angle, body edge across the cone's side line: in the flame
      const d = w.rangeM * 0.6;
      const edgeDeg = half + ((Math.asin((R * 0.8) / d) / DEG_TO_RAD) | 0);
      const edge = at(s.world, edgeDeg, d);
      const outside = [at(s.world, 0, w.rangeM + R + 0.02), at(s.world, half + 30, 1.5), at(s.world, 180, 0.4 + R + 0.1)];
      s.tick();
      for (const id of [...inside, edge]) expect(lost(s.world, id), `${name} in ${id}`).toBe(ZDMG);
      for (const id of outside) expect(lost(s.world, id), `${name} out ${id}`).toBe(0);
    });
  }

  it("the cone points along the RAW aim (no aim assist): a zombie just off a narrow jet is missed with touch aim", () => {
    const s = setup();
    const id = at(s.world, FT.coneDeg / 2 + 12, 3);
    s.tick({ isMouse: false });
    expect(lost(s.world, id)).toBe(0);
  });

  it("the flamer's own body is never in the cone (BtR 7: no self-damage, even aiming at your feet)", () => {
    const s = setup();
    s.p.hp = 100;
    for (let i = 0; i < 40; i++) s.tick({ aimX: Math.cos(i), aimY: Math.sin(i) });
    expect(s.p.hp).toBe(100);
    expect(of(s.events, "player.damaged")).toEqual([]);
  });
});

describe("FR-B: cars, the bus and buildings stop flames; barriers, sandbags and barricades don't", () => {
  const run = (map: DistrictMap, zx: number, prepare?: (w: World) => void, zy = PY) => {
    const s = setup("flamethrower", map);
    prepare?.(s.world);
    const id = spawnZombie(s.world, "walker", zx, zy);
    s.world.zombies.hp[id] = BIG;
    for (let i = 0; i < 20; i++) s.tick();
    return lost(s.world, id);
  };
  // 20 ticks in the flame: 4 pulses + the burn's pulses at ticks 10 and 20
  const exposed = Math.ceil(20 / PULSE) * ZDMG + 2 * FT.igniteDamagePerS * FT.ignitePulseS;
  it("a car between the muzzle and the zombie: no damage, ever; without the car: damage", () => {
    expect(run(coverMap("car", { minX: 12, minY: 14, maxX: 13.5, maxY: 18 }), 14.5)).toBe(0);
    expect(run(PLACEHOLDER_MAP, 14.5)).toBe(exposed);
  });
  it("the car's corner: the muzzle-to-centre line decides (a body poking out past the face is not reached through it)", () => {
    // car y 14–16.05: the zombie at y 16.4 has its centre line clear just below the corner → hit;
    // at y 16.0 the centre line enters the car → no hit, though its body sticks out below it.
    const car = coverMap("car", { minX: 12, minY: 14, maxX: 13.5, maxY: 16.05 });
    expect(run(car, 14.5, undefined, 16.0)).toBe(0);
    expect(run(car, 14.5, undefined, 16.45)).toBe(exposed);
  });
  it("the nozzle inside a car (pressed against it): nothing behind it burns", () => {
    expect(run(coverMap("car", { minX: 10.45, minY: 15, maxX: 11.5, maxY: 17 }), 12)).toBe(0);
  });
  it("sandbags, a police barrier and a wood/metal barricade don't stop the flame (the choke-point play, D7)", () => {
    expect(run(coverMap("sandbags", { minX: 12, minY: 15, maxX: 12.3, maxY: 17 }), 13.5)).toBe(exposed);
    expect(run(coverMap("barrier", { minX: 12, minY: 15, maxX: 12.2, maxY: 17 }), 13.5)).toBe(exposed);
    for (const type of ["wood_barricade", "metal_barricade"]) {
      const hp = balance.buildings.types[type]?.hp ?? 1;
      expect(run(PLACEHOLDER_MAP, 13.5, (w) => addBuildingAt(w, { id: 1, type, ownerId: "p0", gx: 24, gy: 30, rot: 1, hp }), PY), type).toBe(exposed); // x 12–12.5
    }
  });
  it("D7: flames don't damage buildings (barricades, turrets)", () => {
    const s = setup();
    const hp = balance.buildings.types.wood_barricade?.hp ?? 1;
    addBuildingAt(s.world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 24, gy: 30, rot: 1, hp });
    for (let i = 0; i < 60; i++) s.tick();
    expect(s.world.buildings.list[0]?.hp).toBe(hp);
  });
  it("a teammate behind a car is safe; behind sandbags is not", () => {
    for (const [kind, safe] of [["car", true], ["sandbags", false]] as const) {
      const s = setup("flamethrower", coverMap(kind, { minX: 12, minY: 15, maxX: 12.6, maxY: 17 }));
      const q = mate(s.world, "p1", 14);
      for (let i = 0; i < 40; i++) s.tick();
      expect(q.hp, kind).toBe(safe ? 100 : 100 - 4 * PDMG);
    }
  });
});

describe("FR-C: exposure is per body and cannot be dodged", () => {
  it("a zombie's first pulse lands on its FIRST tick in the cone, then every pulseS of exposure", () => {
    const s = setup();
    const id = at(s.world, 0, 2);
    s.tick();
    expect(lost(s.world, id)).toBe(ZDMG);
    for (let i = 1; i < PULSE; i++) s.tick();
    expect(lost(s.world, id)).toBe(ZDMG);
    s.tick();
    expect(lost(s.world, id)).toBe(2 * ZDMG);
  });

  it("stepping in and out on any pattern deals exactly ceil(exposure / pulse) zombie pulses and floor(exposure / pulse) player pulses", () => {
    const patterns = [
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      [1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    ];
    for (const pat of patterns) {
      const s = setup();
      const id = at(s.world, 0, 2);
      const q = mate(s.world, "p1", MX + 3);
      let exposure = 0;
      for (let rep = 0; rep < 3; rep++) {
        for (const inCone of pat) {
          // in: on the axis; out: 6 m to the side (the cone is 20° wide)
          s.world.zombies.y[id] = inCone ? PY : PY + 6;
          q.y = inCone ? PY : PY + 6;
          exposure += inCone;
          s.tick();
          s.world.zombies.igniteTicks[id] = 0; // this test isolates the flame clock (the burn has its own tests)
          activeSlot(s.p.loadout).ammo = FUEL; // and an endless tank
        }
      }
      expect(lost(s.world, id)).toBe(Math.ceil(exposure / PULSE) * ZDMG);
      expect(100 - q.hp).toBe(Math.floor(exposure / PPULSE) * PDMG);
    }
  });

  it("a teammate's first pulse lands one full playerPulseS after entering (brushing a friend for a tick does nothing)", () => {
    const s = setup();
    const q = mate(s.world, "p1", MX + 2);
    for (let i = 0; i < PPULSE - 1; i++) s.tick();
    expect(q.hp).toBe(100);
    s.tick();
    expect(q.hp).toBe(100 - PDMG);
  });

  it("the clocks restart at every build start (4.8 D3/D19): exposure never carries across waves", () => {
    const s = setup();
    const id = at(s.world, 0, 2);
    const q = mate(s.world, "p1", MX + 3);
    for (let i = 0; i < PPULSE - 1; i++) s.tick(); // 9 ticks: the mate's clock at 9
    s.world.zombies.y[id] = PY + 6;
    resetBurnClocks(s.world); // what decayMutate does at a build start
    expect(q.flameClock[0]).toBe(0);
    expect(s.world.zombies.igniteTicks[id]).toBe(0);
    s.tick();
    expect(q.hp).toBe(100); // one tick after the reset: no pulse (it would have been the 10th)
    resetFlameClocks(s.world);
  });

  it("BtR 6: two flamers stack on one zombie and on one teammate (separate clocks, both credited)", () => {
    const s = setup();
    const p1 = addPlayer(s.world, "p1", PX, PY + 1.0);
    p1.hp = BIG;
    setLoadout(balance, p1.loadout, ["gas_torch", null]);
    const id = at(s.world, 0, 1.5);
    s.world.zombies.y[id] = PY + 0.5;
    const victim = mate(s.world, "p2", MX + 3, PY);
    for (let i = 0; i < 20; i++) s.tick({ aimX: 1, aimY: 0 }, { p1: { aimX: 1, aimY: -0.3, fire: true } });
    const pulses = 2 * Math.ceil(20 / PULSE);
    // + the one burn (refreshed by both, never doubled): a pulse at ticks 10 and 20
    expect(lost(s.world, id)).toBeCloseTo(pulses * ZDMG + 2 * FT.igniteDamagePerS * FT.ignitePulseS, 6);
    // two flamers' friendly fire: 2 × 5 every 0.5 s
    expect(100 - victim.hp).toBe(2 * Math.floor(20 / PPULSE) * PDMG);
    const ff = of(s.events, "player.damaged").filter((e) => e.playerId === "p2");
    expect(new Set(ff.map((e) => e.sourcePlayerId))).toEqual(new Set(["p0", "p1"]));
    expect(s.world.economy.damagerCount[id]).toBe(2); // both credited (assists)
  });
});

describe("FR-D/FR-E: friendly fire at 50 %, it can down a teammate, downed/out are spared", () => {
  it("BtR 1 (griefing): holding fire on a teammate deals 10 HP/s and downs them in ~10 s; every hit names the flamer", () => {
    const s = setup();
    const q = mate(s.world, "p1", MX + 2);
    let downedAt = -1;
    for (let t = 1; t <= 260 && downedAt < 0; t++) {
      s.tick();
      if (q.status === "downed") downedAt = t;
      if (activeSlot(s.p.loadout).ammo === 0 || activeSlot(s.p.loadout).reloadTicks > 0) activeSlot(s.p.loadout).ammo = FUEL; // endless tank for the test
      activeSlot(s.p.loadout).reloadTicks = 0;
    }
    expect(downedAt).toBe((100 / PDMG) * PPULSE); // 200 ticks = 10 s
    const hits = of(s.events, "player.damaged").filter((e) => e.playerId === "p1");
    expect(hits).toHaveLength(100 / PDMG);
    expect(hits.every((e) => e.tag === "fire" && e.sourcePlayerId === "p0" && e.sourceZombieId === -1 && e.amount === PDMG)).toBe(true);
    const hpBefore = q.hp;
    for (let i = 0; i < 40; i++) s.tick();
    expect(q.hp).toBe(hpBefore); // a downed teammate takes nothing more
  });

  it("players are tested at their LIVE positions (no rewind for players, BtR 9)", () => {
    const s = setup();
    setZombieHistoryEnabled(s.world, true);
    s.p.rewindMaxTicks = REWIND_MAX_TICKS;
    const q = mate(s.world, "p1", MX + 2);
    for (let i = 0; i < PPULSE - 1; i++) s.tick({ viewTick: (s.world.tick - 6) * 100 });
    q.y = PY + 5; // ran away: "where they were 300 ms ago" is not hit
    for (let i = 0; i < 30; i++) s.tick({ viewTick: (s.world.tick - 6) * 100 });
    expect(q.hp).toBe(100);
  });
});

describe("FR-G: ignite", () => {
  it("a pulse ignites for igniteS: 1.5 every 0.5 s, 6 pulses (9) in 3 s; a kill by the burn credits the igniter with weapon flamethrower", () => {
    const s = setup();
    const id = at(s.world, 0, 2, 1000);
    s.tick({ fire: true });
    s.tick({ fire: false });
    const afterFlame = lost(s.world, id) - (BIG - 1000);
    expect(afterFlame).toBe(ZDMG);
    for (let i = 0; i < 100; i++) s.tick({ fire: false });
    const ign = FT.igniteDamagePerS * FT.ignitePulseS;
    expect(1000 - (s.world.zombies.hp[id] as number)).toBeCloseTo(ZDMG + (FT.igniteS / FT.ignitePulseS) * ign, 6);
    expect(s.world.zombies.igniteTicks[id]).toBe(0);
    // a burn kill
    const id2 = at(s.world, 0, 2, ZDMG + ign * 2);
    s.tick({ fire: true });
    s.tick({ fire: false, swap: true }); // swap to the Pistol: the burn still credits me (BtR 8)
    for (let i = 0; i < 30; i++) s.tick({ fire: false });
    expect(isZombieAlive(s.world.zombies, id2)).toBe(false);
    expect(of(s.events, "zombie.killed").find((e) => e.zombieId === id2)).toMatchObject({ killerId: "p0", weapon: "flamethrower" });
  });

  it("a new pulse refreshes the burn to the full igniteS (never stacks); the burn's pulse clock keeps running", () => {
    const s = setup();
    const id = at(s.world, 0, 2);
    for (let i = 0; i < 40; i++) {
      s.tick();
      expect(s.world.zombies.igniteTicks[id]).toBeLessThanOrEqual(ticksFor(FT.igniteS));
    }
    // 40 ticks in the cone: 8 flame pulses + one ignite pulse every 10 ticks (4), never more
    const ign = FT.igniteDamagePerS * FT.ignitePulseS;
    expect(lost(s.world, id)).toBeCloseTo(8 * ZDMG + 4 * ign, 6);
  });

  it("the burn credits the LAST igniter; it never spreads; players are never ignited", () => {
    const s = setup();
    const p1 = addPlayer(s.world, "p1", PX, PY + 3);
    p1.hp = BIG;
    setLoadout(balance, p1.loadout, ["flamethrower", null]);
    const id = at(s.world, 0, 2);
    const next = at(s.world, 0, 2 + 2 * R + 0.05); // touching it, behind it
    s.world.zombies.y[next] = PY + 8;
    s.tick();
    expect(s.world.zombies.igniterSlot[id]).toBe(0);
    // p1 flames it from below (aim up toward it), p0 stops
    const dx = (s.world.zombies.x[id] as number) - PX;
    const dy = (s.world.zombies.y[id] as number) - (PY + 3);
    s.tick({ fire: false }, { p1: { aimX: dx, aimY: dy, fire: true } });
    expect(s.world.zombies.igniterSlot[id]).toBe(1);
    for (let i = 0; i < 80; i++) s.tick({ fire: false });
    expect(s.world.zombies.igniteTicks[next]).toBe(0);
    expect(lost(s.world, next)).toBe(0);
    expect(s.p.flameClock.length).toBe(4);
  });
});

describe("FR-H: fuel, reload, swap", () => {
  it("fuel = 120 ticks of held fire, then the 3.0 s reload starts on its own; one start/stop event per burst", () => {
    const s = setup();
    for (let i = 0; i < FUEL - 1; i++) s.tick();
    expect(activeSlot(s.p.loadout).ammo).toBe(1);
    s.tick();
    expect(activeSlot(s.p.loadout).ammo).toBe(0);
    expect(activeSlot(s.p.loadout).reloadTicks).toBe(ticksFor(FT.reloadS));
    expect(of(s.events, "weapon.reload_started")).toEqual([{ type: "weapon.reload_started", playerId: "p0", weapon: "flamethrower", reloadS: 3 }]);
    expect(of(s.events, "weapon.flame_started")).toHaveLength(1);
    expect(of(s.events, "weapon.flame_stopped")).toHaveLength(0);
    s.tick();
    expect(of(s.events, "weapon.flame_stopped")).toHaveLength(1); // the reload ends the burst
    for (let i = 0; i < ticksFor(FT.reloadS) - 1; i++) s.tick();
    expect(activeSlot(s.p.loadout).ammo).toBe(FUEL);
    expect(of(s.events, "weapon.reloaded")).toHaveLength(1);
    expect(of(s.events, "weapon.flame_started")).toHaveLength(1); // nothing during the reload
    s.tick();
    expect(of(s.events, "weapon.flame_started")).toHaveLength(2);
  });

  it("no fuel is used without the trigger, with a dead-zone aim, while swapping, reloading or downed", () => {
    const s = setup();
    s.tick({ fire: false });
    s.tick({ aimX: 0, aimY: 0 });
    expect(activeSlot(s.p.loadout).ammo).toBe(FUEL);
    s.tick({ swap: true });
    for (let i = 0; i < ticksFor(balance.player.swapS) + 2; i++) s.tick({ fire: true });
    expect(s.p.loadout.active).toBe(1);
    expect(s.p.loadout.slots[0]?.ammo).toBe(FUEL);
    s.tick({ swap: true });
    for (let i = 0; i < ticksFor(balance.player.swapS); i++) s.tick();
    const before = activeSlot(s.p.loadout).ammo;
    s.p.status = "downed";
    for (let i = 0; i < 10; i++) s.tick();
    expect(activeSlot(s.p.loadout).ammo).toBe(before);
  });

  it("BtR 5: swap to dodge the reload → the reload restarts from 3.0 s when you come back (no fuel gain); a mid-burst swap keeps the fuel", () => {
    const s = setup();
    for (let i = 0; i < 30; i++) s.tick();
    s.tick({ swap: true });
    for (let i = 0; i < ticksFor(balance.player.swapS); i++) s.tick();
    expect(s.p.loadout.slots[0]?.ammo).toBe(FUEL - 30); // kept
    s.tick({ swap: true });
    for (let i = 0; i < ticksFor(balance.player.swapS); i++) s.tick();
    for (let i = 0; i < FUEL - 30; i++) s.tick();
    expect(activeSlot(s.p.loadout).ammo).toBe(0);
    for (let i = 0; i < 30; i++) s.tick(); // half the reload
    s.tick({ swap: true }); // swap away: cancels it
    for (let i = 0; i < ticksFor(balance.player.swapS); i++) s.tick();
    s.tick({ swap: true });
    for (let i = 0; i < ticksFor(balance.player.swapS); i++) s.tick();
    expect(s.p.loadout.slots[0]?.reloadTicks).toBe(ticksFor(FT.reloadS)); // from the start
    expect(s.p.loadout.slots[0]?.ammo).toBe(0);
  });
});

describe("upgrades (5.1), rewind (2.12), the wire and determinism", () => {
  it("level IV: pulse = weaponDamage × pulseS (8.75, exact), ignite × 1.75, friendly fire rounds per pulse", () => {
    const s = setup();
    activeSlot(s.p.loadout).level = 4;
    const id = at(s.world, 0, 2);
    const q = mate(s.world, "p1", MX + 3);
    for (let i = 0; i < PPULSE; i++) s.tick();
    expect(lost(s.world, id)).toBeCloseTo(2 * 8.75 + 1.75 * FT.igniteDamagePerS * FT.ignitePulseS, 6);
    expect(100 - q.hp).toBe(Math.round((20 * 1.75 * 0.5 * 50) / 100)); // 8.75 → 9
  });

  it("online the cone tests the zombies the flamer saw (rewound); offline the live pool", () => {
    for (const online of [true, false]) {
      const s = setup();
      setZombieHistoryEnabled(s.world, online);
      s.p.rewindMaxTicks = online ? REWIND_MAX_TICKS : 0;
      const id = at(s.world, 0, 2);
      for (let i = 0; i < 4; i++) s.tick({ fire: false });
      s.world.zombies.x[id] = s.world.zombies.prevX[id] = PX + 9; // it moved out of reach
      s.tick({ fire: false });
      s.tick({ viewTick: (s.world.tick - 2) * 100 });
      expect(lost(s.world, id) > 0, `online ${online}`).toBe(online);
    }
  });

  it("no zombie.hit per pulse (quiet hits); the burst edges are 2-3 field tuples; kills still send zombie.killed", () => {
    const s = setup();
    const ids = [at(s.world, 0, 1.5, 10), at(s.world, 5, 2.5, 10), at(s.world, -5, 3.5, 1e3)];
    for (let i = 0; i < 40; i++) s.tick();
    s.tick({ fire: false });
    expect(of(s.events, "zombie.hit")).toEqual([]);
    expect(of(s.events, "zombie.killed").map((e) => e.zombieId).sort()).toEqual([ids[0], ids[1]].sort());
    const started = of(s.events, "weapon.flame_started");
    expect(started).toEqual([{ type: "weapon.flame_started", playerId: "p0", weapon: "flamethrower" }]);
    expect(encodeNetEvent(started[0] as SimEvent, { balance })).toHaveLength(3);
    expect(encodeNetEvent(of(s.events, "weapon.flame_stopped")[0] as SimEvent, { balance })).toHaveLength(2);
  });

  it("same seed + input log → same snapshotWorld digest with flamers, burns and friendly fire", () => {
    const run = () => {
      const s = setup();
      const p1 = addPlayer(s.world, "p1", PX + 1, PY + 2);
      setLoadout(balance, p1.loadout, ["gas_torch", null]);
      for (let k = 0; k < 12; k++) at(s.world, k * 9 - 50, 1 + (k % 5), 30);
      for (let i = 0; i < 200; i++) s.tick({ aimX: Math.cos(i / 20), aimY: Math.sin(i / 20), fire: i % 37 !== 0 }, { p1: { aimX: 1, aimY: Math.sin(i / 9), fire: i % 23 > 3 } });
      expect(of(s.events, "zombie.killed").length).toBeGreaterThan(0); // liveness: it did something
      return worldDigest(s.world);
    };
    expect(run()).toBe(run());
  });
});

describe("liveness (brief line 9): a flamer holds the line for a whole wave", () => {
  it("Downtown wave 3: the wave ends, ≥ 30 flamethrower kills, ≥ 1 ignite kill, ≥ 1 friendly-fire pulse on the teammate standing in the cone", async () => {
    const { DOWNTOWN_MAP } = await import("../map/downtown");
    const { startBuild, startWave } = await import("../run/runStateMachine");
    const { teamSpawnPoint } = await import("../player/spawn");
    const { flameStats } = await import("./flame");
    const world = createWorld({ balance, seed: 21, map: DOWNTOWN_MAP });
    const sp = teamSpawnPoint(world, 0, { x: 0, y: 0 });
    const p = addPlayer(world, "p0", sp.x, sp.y);
    setLoadout(balance, p.loadout, ["flamethrower", null]);
    const q = addPlayer(world, "p1", sp.x + 1.2, sp.y);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    startBuild(world);
    world.waves.number = 2;
    startWave(world);
    const ignite0 = flameStats.igniteKills;
    const z = world.zombies;
    let ended = false;
    for (let t = 0; t < 20 * 240 && !ended; t++) {
      p.hp = 100;
      q.hp = 100;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < z.aliveCount; i++) {
        const id = z.aliveIds[i] as number;
        const d = Math.hypot((z.x[id] as number) - p.x, (z.y[id] as number) - p.y);
        if (d < bestD) [best, bestD] = [id, d];
      }
      // the teammate wanders into the cone now and then (they stand 1.2 m to the right)
      const aimAtMate = t % 200 < 15;
      const ax = aimAtMate ? q.x - p.x : best >= 0 ? (z.x[best] as number) - p.x : 1;
      const ay = aimAtMate ? q.y - p.y : best >= 0 ? (z.y[best] as number) - p.y : 0;
      setInput(world, "p0", { ...NEUTRAL_INPUT, seq: t + 1, aimX: ax, aimY: ay, fire: aimAtMate || (best >= 0 && bestD < 7), isMouse: true });
      setInput(world, "p1", { ...NEUTRAL_INPUT, seq: t + 1 });
      step(world, TICK_DT_S);
      ended = events.some((e) => e.type === "wave.ended");
    }
    expect(ended).toBe(true);
    expect(of(events, "zombie.killed").filter((e) => e.weapon === "flamethrower").length).toBeGreaterThanOrEqual(30);
    expect(flameStats.igniteKills - ignite0).toBeGreaterThanOrEqual(1);
    expect(of(events, "player.damaged").filter((e) => e.playerId === "p1" && e.sourcePlayerId === "p0").length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
