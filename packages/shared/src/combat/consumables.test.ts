import { beforeEach, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, MUZZLE_OFFSET_M, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { DistrictMap } from "../map/districtMap";
import { applyDecayStage } from "../decay/applyDecayStage";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer, removePlayer, type PlayerState } from "../player/player";
import { downPlayer } from "../player/downed";
import { startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie, isZombieAlive } from "../zombies/zombiePool";
import { addBuildingAt, type Building } from "../buildings/buildings";
import { setLoadout } from "./loadout";
import { buyGear } from "../economy/gear";
import { consumableCounters, throwAimLength } from "./consumables";
import { grenadeCounters } from "./grenades";
import { explosionCounters } from "./explosion";
import { igniteMolotov, molotovStats, molotovZoneAt } from "../hazards/molotov";
import { sdConeFull } from "../hazards/molotovCone";
import { firePulse } from "../decay/fire";
import { molotovConeAt, throwStatsOf } from "../economy/consumables";
import type { FireRecord } from "../decay/decayState";

/**
 * Story 5.12: the quick-use slot (AC 3–6, 11). One mechanic per test: zombies stand still (no AI),
 * no wave director. Liveness: every test that expects a blast / burn asserts it happened.
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const R = balance.player.radiusM;
const OFFSET = R + MUZZLE_OFFSET_M;
const GREN = throwStatsOf(balance, "grenades")!;
const ZR = balance.zombies.types.walker!.radiusM;
const MOL_PULSE = Math.round(0.5 / TICK_DT_S);

function setup(opts: { map?: DistrictMap; players?: number; wave?: boolean } = {}) {
  const world = createWorld({ balance, seed: 7, systems: STILL, ...(opts.map ? { map: opts.map } : {}) });
  if (opts.map) applyDecayStage(world, 1, 0);
  const n = opts.players ?? 1;
  for (let i = 0; i < n; i++) addPlayer(world, `p${i}`, 10, 10 + i * 6);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  if (opts.wave !== false) startWave(world);
  return { world, events, p: world.players.get("p0") as PlayerState };
}
const give = (p: PlayerState, item: string, count: number): void => {
  p.consumable = item;
  p.consumableCount = count;
};
let seq = 100;
/** A fresh input (new seq) aiming +x with aim length `len`; `consumable` = the tap. */
const input = (tap: boolean, len = 1, extra: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq: ++seq, aimX: len, aimY: 0, isMouse: true, consumable: tap, ...extra });
const run = (world: World, ticks: number, next?: () => PlayerInput, id = "p0"): void => {
  for (let i = 0; i < ticks; i++) {
    if (next) setInput(world, id, next());
    step(world, TICK_DT_S);
  }
};
const of = <T extends SimEvent["type"]>(events: SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
/** A sturdy still zombie (hp 1000) at (x, y). */
function tank(world: World, x: number, y: number, hp = 1000): number {
  const id = spawnZombie(world, "walker", x, y);
  world.zombies.hp[id] = hp;
  return id;
}

beforeEach(() => {
  for (const k of Object.keys(consumableCounters) as (keyof typeof consumableCounters)[]) consumableCounters[k] = 0;
  for (const k of Object.keys(molotovStats) as (keyof typeof molotovStats)[]) molotovStats[k] = 0;
  grenadeCounters.thrown = grenadeCounters.handBlasts = grenadeCounters.molotovsLanded = 0;
  explosionCounters.happened = 0;
});

describe("C-A one tap = at most one use (AC 3)", () => {
  it("one tap → exactly one use; the same seq applied again uses nothing", () => {
    const { world, events, p } = setup();
    give(p, "grenades", 3);
    setInput(world, "p0", input(true));
    run(world, 1);
    expect(p.consumableCount).toBe(2);
    run(world, 30); // the same input (same seq) keeps being applied: the edge flag is cleared
    expect(p.consumableCount).toBe(2);
    expect(of(events, "consumable.used")).toEqual([{ type: "consumable.used", playerId: "p0", item: 1 }]);
    expect(of(events, "grenade.launched")).toHaveLength(1);
  });

  it("C-B: two taps 5 ticks apart → one use; 10 ticks apart → two (cooldown in ticks)", () => {
    const { world, p } = setup();
    give(p, "grenades", 3);
    setInput(world, "p0", input(true));
    run(world, 1);
    run(world, 4, () => input(false));
    setInput(world, "p0", input(true)); // 5 ticks after the use
    run(world, 1);
    expect(p.consumableCount).toBe(2);
    expect(consumableCounters.refusedCooldown).toBe(1);
    run(world, 4, () => input(false));
    setInput(world, "p0", input(true)); // 10 ticks after the use
    run(world, 1);
    expect(p.consumableCount).toBe(1);
  });

  it("D7: a starved tick (weapons paused) doesn't count down the cooldown", () => {
    const { world, p } = setup();
    give(p, "medkit", 1);
    p.hp = 10;
    p.consumableCooldownTicks = 3;
    p.weaponsPaused = true;
    run(world, 5);
    expect(p.consumableCooldownTicks).toBe(3);
    p.weaponsPaused = false;
    run(world, 3, () => input(false));
    expect(p.consumableCooldownTicks).toBe(0);
  });

  it("downed / out / empty: nothing consumed, no cooldown, no event", () => {
    const { world, events, p } = setup();
    give(p, "grenades", 2);
    downPlayer(world, p);
    setInput(world, "p0", input(true));
    run(world, 1);
    expect([p.consumableCount, p.consumableCooldownTicks]).toEqual([2, 0]);
    p.status = "out";
    setInput(world, "p0", input(true));
    run(world, 1);
    expect(p.consumableCount).toBe(2);
    p.status = "alive";
    p.hp = p.maxHp;
    give(p, "grenades", 0);
    p.consumable = null;
    setInput(world, "p0", input(true));
    run(world, 1);
    expect(of(events, "consumable.used")).toHaveLength(0);
    expect(of(events, "grenade.launched")).toHaveLength(0);
  });

  it("the last item empties the slot (null, 0)", () => {
    const { world, p } = setup();
    give(p, "molotovs", 1);
    setInput(world, "p0", input(true));
    run(world, 1);
    expect([p.consumable, p.consumableCount]).toEqual([null, 0]);
  });

  it("C-E (D6): a use never touches the weapon's cooldown, reload or swap", () => {
    const { world, p } = setup();
    setLoadout(balance, p.loadout, ["pistol", "smg"]);
    give(p, "grenades", 3);
    setInput(world, "p0", input(false, 1, { swap: true }));
    run(world, 1);
    const swap = p.loadout.swapTicks;
    expect(swap).toBeGreaterThan(0);
    setInput(world, "p0", input(true));
    run(world, 1);
    expect(p.consumableCount).toBe(2);
    expect(p.loadout.swapTicks).toBe(swap - 1); // the swap kept counting
  });
});

describe("C-C medkit (AC 4)", () => {
  it("30 → 80; 90 → 100 (a cap, not a refund); full HP → not used; with armor I 90 → 125", () => {
    const { world, p } = setup();
    give(p, "medkit", 1);
    p.hp = 30;
    setInput(world, "p0", input(true));
    run(world, 1);
    expect([p.hp, p.consumableCount]).toEqual([80, 0]);
    give(p, "medkit", 1);
    p.hp = 90;
    p.consumableCooldownTicks = 0;
    setInput(world, "p0", input(true));
    run(world, 1);
    expect(p.hp).toBe(100);
    give(p, "medkit", 1);
    p.consumableCooldownTicks = 0;
    setInput(world, "p0", input(true));
    run(world, 1);
    expect(p.consumableCount).toBe(1); // full HP: not used
    expect(consumableCounters.refusedRule).toBe(1);
  });

  it("armor I raises the cap (5.11); usable in the build phase, throwables are not (D3)", () => {
    const { world, p } = setup({ wave: false });
    p.wallet = 1000;
    expect(buyGear(world, "p0", "body_armor_1").ok).toBe(true);
    p.hp = 90;
    give(p, "medkit", 1);
    setInput(world, "p0", input(true));
    run(world, 1);
    expect(p.hp).toBe(125);
    give(p, "grenades", 3);
    p.consumableCooldownTicks = 0;
    setInput(world, "p0", input(true));
    run(world, 1);
    expect(p.consumableCount).toBe(3);
    give(p, "molotovs", 2);
    setInput(world, "p0", input(true));
    run(world, 1);
    expect(p.consumableCount).toBe(2);
    expect(grenadeCounters.thrown).toBe(0);
  });
});

describe("C-D grenades (AC 5)", () => {
  it("aim length 1 lands 8 m out; 0.0625 (0.5 m) lands at the 2 m minimum", () => {
    const { world, events, p } = setup();
    give(p, "grenades", 3);
    setInput(world, "p0", input(true, 1));
    run(world, 1);
    expect(of(events, "grenade.launched")[0]?.tx).toBeCloseTo(10 + OFFSET + 8, 9);
    run(world, 10, () => input(false));
    setInput(world, "p0", input(true, 0.5 / 8));
    run(world, 1);
    const l = of(events, "grenade.launched")[1];
    expect(l?.tx).toBeCloseTo(10 + OFFSET + 2, 9);
    expect(l?.item).toBe(2);
  });

  it("review M1: no aim → the last aim direction (kept 1.5 s, never the move), then the nearest zombie in reach, then facing", () => {
    const { world, events, p } = setup();
    const MEM = Math.round(balance.consumables.aimMemoryS / TICK_DT_S);
    const noAim = (tap: boolean, moveY = 0): PlayerInput => ({ ...input(tap), aimX: 0, aimY: 0, moveY });
    give(p, "grenades", 3);
    // aim up-left at 6 m, then release the stick and walk DOWN (facing turns down)
    setInput(world, "p0", { ...input(false), aimX: -0.6 * (6 / 8), aimY: -0.8 * (6 / 8) });
    run(world, 1);
    run(world, 5, () => noAim(false, 1));
    expect(p.facingY).toBeGreaterThan(0.99); // the move turned the facing
    setInput(world, "p0", noAim(true, 1));
    run(world, 1);
    const a = of(events, "grenade.launched")[0]!;
    expect(Math.atan2(a.ty - a.y, a.tx - a.x)).toBeCloseTo(Math.atan2(-0.8, -0.6), 9); // the remembered aim, not the escape route
    expect(Math.hypot(a.tx - a.x, a.ty - a.y)).toBeCloseTo(6, 6);
    // memory expires after aimMemoryS: the nearest zombie within reach is the target (at its distance)
    run(world, MEM + 2, () => noAim(false, 0));
    const z = tank(world, p.x + 3, p.y - 4); // 5 m away
    tank(world, p.x - 9, p.y); // 9 m: out of reach (muzzle 0.65 m + 8 m)
    setInput(world, "p0", noAim(true));
    run(world, 1);
    const b = of(events, "grenade.launched")[1]!;
    expect(Math.atan2(b.ty - p.y, b.tx - p.x)).toBeCloseTo(Math.atan2(-4, 3), 6);
    expect(Math.hypot(b.tx - p.x, b.ty - p.y)).toBeCloseTo(5, 6);
    // no zombie in reach: facing at 8 m
    world.zombies.x[z] = p.x + 30;
    run(world, 12, () => noAim(false));
    p.facingX = 0;
    p.facingY = 1;
    setInput(world, "p0", noAim(true));
    run(world, 1);
    const c = of(events, "grenade.launched")[2]!;
    expect(c.tx).toBeCloseTo(p.x, 9);
    expect(c.ty).toBeCloseTo(p.y + OFFSET + 8, 9);
  });

  it("review L5: with the launcher in hand the flagged input still carries the throw's own range; the client ring converts the launcher's encoding", () => {
    const GL = balance.weapons.grenade_launcher as { lobRangeM: number };
    expect(throwAimLength(GREN, 6 / GL.lobRangeM, GL.lobRangeM)).toBeCloseTo(6 / 8, 12);
    expect(throwAimLength(GREN, 0.5, 0)).toBe(0.5);
    expect(throwAimLength(GREN, 0, 12)).toBe(1);
    const { world, events, p } = setup();
    setLoadout(balance, p.loadout, ["grenade_launcher", "pistol"]);
    give(p, "grenades", 3);
    setInput(world, "p0", input(true, 6 / 8));
    run(world, 1);
    expect(of(events, "grenade.launched")[0]?.tx).toBeCloseTo(10 + OFFSET + 6, 9);
  });

  it("re-review L: the remembered aim keeps metres — aimed 6 m with the launcher in hand (its encoding), released, tapped: lands 6 m out", () => {
    const GL = balance.weapons.grenade_launcher as { lobRangeM: number };
    const { world, events, p } = setup();
    setLoadout(balance, p.loadout, ["grenade_launcher", "pistol"]);
    give(p, "grenades", 3);
    setInput(world, "p0", input(false, 6 / GL.lobRangeM)); // the launcher's encoding of 6 m
    run(world, 1);
    setInput(world, "p0", { ...input(true), aimX: 0, aimY: 0 }); // stick released, tap
    run(world, 1);
    const a = of(events, "grenade.launched")[0]!;
    expect(Math.hypot(a.tx - a.x, a.ty - a.y)).toBeCloseTo(6, 6);
    expect(a.tx).toBeCloseTo(10 + OFFSET + 6, 6);
  });

  it("re-review NIT: no aim, no memory — a visible zombie wins over a nearer one behind a building", () => {
    const bld: DistrictMap = { ...PLACEHOLDER_MAP, name: "c-wall", solids: [{ name: "apartments", building: true, minX: 11.5, minY: 8, maxX: 12.5, maxY: 12 }] };
    const { world, events, p } = setup({ map: bld });
    give(p, "grenades", 3);
    tank(world, 13.5, 10); // 3.5 m, behind the wall
    tank(world, 10, 15); // 5 m, in the open
    setInput(world, "p0", { ...input(true), aimX: 0, aimY: 0 });
    run(world, 1);
    const a = of(events, "grenade.launched")[0]!;
    expect(a.tx).toBeCloseTo(10, 6);
    expect(a.ty).toBeCloseTo(15, 6);
  });

  it("PR #5 lob rule: flies over a car 1 m ahead (aimed past it); a car-roof aim lands at its near face; a building stops it at its face", () => {
    const car: DistrictMap = { ...PLACEHOLDER_MAP, name: "c-car", cover: [{ name: "test_car", kind: "car", minStage: 1, minX: 11.2, minY: 8, maxX: 13.2, maxY: 12 }] };
    const a = setup({ map: car });
    give(a.p, "grenades", 3);
    setInput(a.world, "p0", input(true, 1));
    run(a.world, 1);
    expect(of(a.events, "grenade.launched")[0]?.tx).toBeCloseTo(10 + OFFSET + 8, 9);
    run(a.world, 10, () => input(false));
    setInput(a.world, "p0", input(true, (12 - 10 - OFFSET) / 8)); // onto the roof
    run(a.world, 1);
    const roof = of(a.events, "grenade.launched")[1];
    expect(roof?.tx).toBeLessThanOrEqual(11.2);
    expect(roof?.tx).toBeGreaterThan(11.2 - 0.1);
    const bld: DistrictMap = { ...PLACEHOLDER_MAP, name: "c-bld", solids: [{ name: "apartments", building: true, minX: 12, minY: 6, maxX: 16, maxY: 14 }] };
    const b = setup({ map: bld });
    give(b.p, "grenades", 3);
    setInput(b.world, "p0", input(true, 1));
    run(b.world, 1);
    const l = of(b.events, "grenade.launched")[0];
    expect(l?.tx).toBeLessThan(12);
    expect(l?.tx).toBeGreaterThan(12 - 0.1);
    run(b.world, 30, () => input(false));
    expect(of(b.events, "explosion.happened")).toHaveLength(1); // liveness: it burst at the face
  });

  it("40 to zombies within 2.5 m, 20 (50 %) to the thrower and a teammate in it, 0 beyond; no building damage", () => {
    const { world, events, p } = setup({ players: 2 });
    give(p, "grenades", 3);
    const tx = 10 + OFFSET + 2; // a 2 m throw: the thrower stands 2 + OFFSET from the blast
    const mate = world.players.get("p1") as PlayerState;
    mate.x = tx + 1;
    mate.y = 10;
    const near = tank(world, tx + 2.5 + ZR - 0.01, 10);
    const far = tank(world, tx + 2.5 + ZR + 0.01, 10);
    const wall = addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: Math.round((tx - 1) / BUILD_GRID_M), gy: 13 / BUILD_GRID_M, rot: 0, hp: 100 }) as Building;
    setInput(world, "p0", input(true, 2 / 8));
    run(world, 1);
    run(world, 20, () => input(false));
    const ex = of(events, "explosion.happened");
    expect(ex).toHaveLength(1);
    expect(ex[0]?.kind).toBe(3); // hand_grenade: the EX2 look
    expect(ex[0]?.radiusM).toBe(2.5);
    expect(world.zombies.hp[near]).toBe(960);
    expect(world.zombies.hp[far]).toBe(1000);
    expect(p.hp).toBe(80);
    expect(mate.hp).toBe(80);
    expect(wall.hp).toBe(100);
    const dmg = of(events, "player.damaged");
    expect(dmg.map((d) => [d.playerId, d.amount, d.tag, d.sourcePlayerId])).toEqual([
      ["p0", 20, "explosion", "p0"],
      ["p1", 20, "explosion", "p0"],
    ]);
  });

  it("a bus between the blast and a zombie shields it; sandbags don't; ≥ 1 kill (liveness), credited to the thrower", () => {
    const map: DistrictMap = {
      ...PLACEHOLDER_MAP,
      name: "c-cover",
      cover: [
        { name: "test_bus", kind: "bus", minStage: 1, minX: 18.6, minY: 7, maxX: 19.4, maxY: 9.6 },
        { name: "test_bags", kind: "sandbags", minStage: 1, minX: 18.6, minY: 10.4, maxX: 19.4, maxY: 13 },
      ],
    };
    const { world, events, p } = setup({ map });
    give(p, "grenades", 3);
    const tx = 10 + OFFSET + 8;
    const shielded = tank(world, tx + 1.4, 8.4); // behind the bus
    const open = spawnZombie(world, "walker", tx + 1.4, 11.6); // behind the sandbags (10 HP: dies)
    setInput(world, "p0", input(true, 1));
    run(world, 1);
    run(world, 20, () => input(false));
    expect(of(events, "explosion.happened")).toHaveLength(1);
    expect(world.zombies.hp[shielded]).toBe(1000);
    expect(isZombieAlive(world.zombies, open)).toBe(false);
    const kill = of(events, "zombie.killed")[0];
    expect(kill?.killerId).toBe("p0");
    expect(kill?.weapon).toBe("grenades");
    expect(of(events, "money.earned").some((m) => m.playerId === "p0" && m.reason === "kill")).toBe(true);
  });

  it("a full round pool spends nothing", () => {
    const { world, p } = setup();
    give(p, "grenades", 3);
    world.grenades.count = world.grenades.capacity;
    setInput(world, "p0", input(true));
    run(world, 1);
    expect([p.consumableCount, p.consumableCooldownTicks]).toEqual([3, 0]);
  });

  it("a thrower who left: the round still bursts, no credit, players take the friendly-fire share", () => {
    const { world, events, p } = setup({ players: 2 });
    give(p, "grenades", 3);
    const mate = world.players.get("p1") as PlayerState;
    mate.x = 10 + OFFSET + 8;
    mate.y = 10.5;
    setInput(world, "p0", input(true));
    run(world, 1);
    removePlayer(world, "p0");
    run(world, 20);
    expect(of(events, "explosion.happened")[0]?.sourcePlayerId).toBeNull();
    expect(mate.hp).toBe(80);
  });
});

/** Throws a molotov from p0 at aim length 1 (+x); the landing point and the ticks until it lands. */
function molotovAt(world: World, p: PlayerState, events: SimEvent[]) {
  give(p, "molotovs", 2);
  setInput(world, "p0", input(true, 1));
  run(world, 1);
  const l = of(events, "grenade.launched")[0]!;
  const flight = l.landTick - world.tick + 1;
  return { tx: l.tx, ty: l.ty, flight };
}

describe("Molotovs (AC 6; M-A … M-C)", () => {

  it("Story 9.18: the teardrop, strict; 80 ticks; a zombie inside for the whole 4 s takes 32 (8 pulses × 4); a player behind the impact 16 (50 %)", () => {
    const { world, events, p } = setup({ players: 2 });
    const { tx, ty, flight } = molotovAt(world, p, events);
    const inside = tank(world, tx + 1, ty);
    // behind the impact: the back is 0.8 m at full size (0.36 m at landing): just outside it never burns
    const outside = tank(world, tx - (0.8 + ZR + 0.01), ty);
    // ahead, past the tip (4.5 m at full size)
    const ahead = tank(world, tx + 4.5 + ZR + 0.01, ty);
    // to the side of the impact, outside the 35° cone (the old 3 m circle burnt it)
    const side = tank(world, tx, ty + 2.5);
    const mate = world.players.get("p1") as PlayerState;
    mate.x = tx - 0.5;
    mate.y = ty;
    run(world, flight - 1, () => input(false));
    expect(of(events, "molotov.ignited")).toHaveLength(0);
    run(world, 1, () => input(false)); // the landing tick: lit, and its first damage-eligible tick
    const ig = of(events, "molotov.ignited");
    expect(ig).toHaveLength(1);
    expect(ig[0]).toMatchObject({ item: 2, playerId: "p0", dirX: 1, dirY: 0, clipM: 4.5 });
    expect(world.molotovs.areas.count).toBe(1);
    run(world, 78, () => input(false));
    expect(world.molotovs.areas.count).toBe(1);
    run(world, 1, () => input(false));
    expect(world.molotovs.areas.count).toBe(0); // exactly 80 damage-eligible ticks
    run(world, 40, () => input(false));
    expect(world.zombies.hp[inside]).toBe(1000 - 32);
    expect(world.zombies.hp[outside]).toBe(1000);
    expect(world.zombies.hp[ahead]).toBe(1000);
    expect(world.zombies.hp[side]).toBe(1000);
    expect(mate.hp).toBe(100 - 16);
    expect(molotovStats.zombieHits).toBe(8); // liveness
  });

  it("M-B per-body clock: stepping out on the pulse tick still burns on the next tick inside", () => {
    const { world, events, p } = setup();
    const { tx, ty, flight } = molotovAt(world, p, events);
    const z = tank(world, tx, ty);
    run(world, flight - 1, () => input(false)); // landed: the zone is lit this tick (no damage pass yet... the fire pass is later in the same tick)
    const clock = (): number => world.zombies.fireTicks[z] as number;
    while (clock() < MOL_PULSE - 1) run(world, 1, () => input(false));
    expect(world.zombies.hp[z]).toBe(1000);
    world.zombies.x[z] = tx + 10; // step out on the pulse tick
    run(world, 5, () => input(false));
    expect(world.zombies.hp[z]).toBe(1000);
    world.zombies.x[z] = tx;
    run(world, 1, () => input(false)); // one tick back in → the pulse
    expect(world.zombies.hp[z]).toBe(996);
  });

  it("no stacking: two molotov zones + a car fire on one body = one fire hit per pulse (the stronger: the car's 5)", () => {
    const { world, events, p } = setup();
    const { tx, ty, flight } = molotovAt(world, p, events);
    run(world, 10, () => input(false));
    setInput(world, "p0", input(true, 1));
    run(world, 1);
    const z = tank(world, tx, ty);
    (world.decay.fires as FireRecord[]).push({ name: "test_fire", target: "test_car", x: tx, y: ty, radiusM: 2, stage: 3, index: 0 });
    run(world, flight + 2, () => input(false));
    expect(world.molotovs.areas.count).toBe(2);
    const hp0 = world.zombies.hp[z] as number;
    const hits0 = firePulse.zombies;
    run(world, MOL_PULSE * 4, () => input(false));
    expect(firePulse.zombies - hits0).toBe(4);
    expect(hp0 - (world.zombies.hp[z] as number)).toBe(4 * 5);
  });

  it("M-D cover (acid rule) + 9.18 clip: a zone lit at a car's face burns its back part only, never behind the car; sandbags don't shield", () => {
    const map: DistrictMap = {
      ...PLACEHOLDER_MAP,
      name: "c-fire-cover",
      cover: [{ name: "test_car", kind: "car", minStage: 1, minX: 15, minY: 6, maxX: 17, maxY: 10 }],
    };
    const { world, events, p } = setup({ map });
    give(p, "molotovs", 2);
    // aimed onto the car roof: it lands at the car's near face (x ≈ 14.95), centre y 8
    p.x = 9;
    p.y = 8;
    setInput(world, "p0", input(true, (16 - 9 - OFFSET) / 8));
    run(world, 1);
    const l = of(events, "grenade.launched")[0]!;
    expect(l.tx).toBeLessThan(15);
    expect(l.tx).toBeGreaterThan(14.9);
    const behind = tank(world, 17.6, 8); // behind the car, inside the uncut teardrop
    const aside = tank(world, 15.5, 11.2); // past the car's face, beside the car: cut by the clip (the line to the centre is clear)
    const back = tank(world, 14.6, 8.2); // in the round back from landing: burns
    run(world, 120, () => input(false));
    expect(molotovStats.ignited).toBe(1);
    const ig = of(events, "molotov.ignited")[0]!;
    expect(ig.clipM).toBeLessThanOrEqual(15 - l.tx + 1e-9); // the clip stops at the face
    expect(ig.clipM).toBeGreaterThanOrEqual(0);
    expect(world.zombies.hp[behind]).toBe(1000);
    expect(world.zombies.hp[aside]).toBe(1000);
    expect(world.zombies.hp[back]).toBe(1000 - 32);
  });

  it("M-D: sandbags across the throw don't shield (and don't clip); a car beside the cone shields what's behind it", () => {
    const map: DistrictMap = {
      ...PLACEHOLDER_MAP,
      name: "c-fire-bags",
      cover: [
        { name: "test_bags", kind: "sandbags", minStage: 1, minX: 21.6, minY: 7, maxX: 22.2, maxY: 9 },
        { name: "test_car", kind: "car", minStage: 1, minX: 21, minY: 9.2, maxX: 23, maxY: 9.6 },
      ],
    };
    const { world, events } = setup({ map });
    const item = 2;
    // lit by hand at (20, 8) pointing +x
    const pastBags = tank(world, 22.9, 8); // 2.9 m ahead, the line to the centre crosses the sandbags
    const behindCar = tank(world, 22.2, 9.95); // inside the teardrop, the car between it and the centre
    expect(igniteMolotov(world, item, 20, 8, "p0", 1, 0)).toBeGreaterThanOrEqual(0);
    run(world, 60, () => input(false));
    expect(of(events, "molotov.ignited")[0]?.clipM).toBe(4.5);
    expect(world.zombies.hp[pastBags]).toBeLessThan(1000);
    expect(world.zombies.hp[behindCar]).toBe(1000);
    // control: both are inside the full-size teardrop (only cover decides)
    expect(refSd(2.9, 0)).toBeLessThan(-ZR);
    expect(refSd(2.2, 1.95)).toBeLessThan(ZR);
  });

  it("molotov fire doesn't hurt buildings (D4) and doesn't rebuild the nav grid", () => {
    const { world, events, p } = setup();
    const { tx, ty, flight } = molotovAt(world, p, events);
    const b = addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: Math.round((tx - 0.5) / BUILD_GRID_M), gy: Math.round(ty / BUILD_GRID_M), rot: 0, hp: 100 }) as Building;
    run(world, 1, () => input(false)); // the barricade is rasterized (before the zone lands)
    const navVersion = world.pathing.nav.version;
    const fireCost = world.pathing.nav.fireCost.reduce((a, v) => a + v, 0);
    const hp = b.hp;
    run(world, flight + 80, () => input(false));
    expect(molotovStats.ignited).toBe(1); // liveness
    expect(molotovStats.zombieHits + molotovStats.playerHits).toBe(0);
    expect(b.hp).toBe(hp);
    expect(world.pathing.nav.version).toBe(navVersion);
    expect(world.pathing.nav.fireCost.reduce((a, v) => a + v, 0)).toBe(fireCost); // never a nav cost (D4)
  });

  it("D9: a molotov kill pays the thrower (weapon id = the consumable)", () => {
    const { world, events, p } = setup();
    const { tx, ty, flight } = molotovAt(world, p, events);
    spawnZombie(world, "walker", tx + 1, ty); // 10 HP: three pulses
    const wallet = p.wallet;
    run(world, flight + 40, () => input(false));
    const k = of(events, "zombie.killed")[0];
    expect(k).toMatchObject({ killerId: "p0", weapon: "molotovs" });
    expect(p.wallet).toBeGreaterThan(wallet);
    expect(molotovStats.kills).toBe(1);
  });

  it("the 9th live zone replaces the oldest (cap 8)", () => {
    const { world, p } = setup();
    const m = world.molotovs;
    for (let i = 0; i < 9; i++) {
      give(p, "molotovs", 2);
      p.consumableCooldownTicks = 0;
      p.facingX = Math.cos(i);
      p.facingY = Math.sin(i);
      setInput(world, "p0", { ...input(true), aimX: 0, aimY: 0 });
      run(world, 2);
    }
    run(world, 20, () => input(false));
    expect(molotovStats.ignited).toBe(9);
    expect(molotovStats.replaced).toBe(1);
    expect(m.areas.count).toBe(8);
    let ids: number[] = [];
    for (let i = 0; i < m.areas.capacity; i++) if (m.areas.active[i] === 1) ids.push(m.areas.id[i] as number);
    ids = ids.sort((a, b) => a - b);
    expect(ids).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("a build start clears the zones (waves only)", () => {
    const { world, events, p } = setup();
    const { flight } = molotovAt(world, p, events);
    run(world, flight + 2, () => input(false));
    expect(world.molotovs.areas.count).toBe(1);
    startBuild(world);
    expect(world.molotovs.areas.count).toBe(0);
  });
});

/**
 * Story 9.18: an INDEPENDENT copy of MO-R's `sdCone` (docs/art/photoreal-5/src/fire-r2.ts, with Math.hypot)
 * from the designer's numbers, not from balance plumbing: 2 → 4.5 m over 1.0 s, 35°, back 0.8 m.
 */
const MO = { reach0: 2, reach1: 4.5, growS: 1.0, halfDeg: 35, back1: 0.8 };
const SIN_A = Math.sin((MO.halfDeg * Math.PI) / 180);
const SH_D = (MO.reach1 - MO.back1) / (1 + SIN_A);
const SH_R1 = MO.back1 + SH_D * SIN_A;
const SB = (MO.back1 - SH_R1) / SH_D;
const SA = Math.sqrt(1 - SB * SB);
function refSd(x: number, y: number): number {
  const px = Math.abs(y);
  const py = x;
  const k = -SB * px + SA * py;
  if (k < 0) return Math.hypot(px, py) - MO.back1;
  if (k > SA * SH_D) return Math.hypot(px, py - SH_D) - SH_R1;
  return SA * px + SB * py - MO.back1;
}
const refEase = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const refK = (ageS: number): number => (MO.reach0 + (MO.reach1 - MO.reach0) * refEase(ageS / MO.growS)) / MO.reach1;

describe("Story 9.18: the Molotov cone (AC 2–6, 16)", () => {
  const MOL = 2;
  /** An open-ground world (no cover) with one zone lit at (cx, cy) pointing (dx, dy); `world.tick` is then set by hand. */
  function lit(dx = 1, dy = 0, map?: DistrictMap) {
    const { world, events } = setup(map ? { map } : {});
    const slot = igniteMolotov(world, MOL, 24, 16, "p0", dx, dy);
    expect(slot).toBeGreaterThanOrEqual(0);
    return { world, events, slot, born: world.tick };
  }

  it("the shape constants are the card's: d 2.35 m, r1 2.15 m, bounding circle", () => {
    const c = molotovConeAt(balance, MOL)!;
    expect(c.d).toBeCloseTo(2.35, 2);
    expect(c.r1).toBeCloseTo(2.15, 2);
    expect(c.r0).toBe(0.8);
    expect(c.growTicks).toBe(20);
    expect(throwStatsOf(balance, "molotovs")?.cone).toBe(c);
    // the bounding circle holds the whole full-size teardrop
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      for (let rr = 0; rr < 5; rr += 0.01) {
        const u = Math.cos(a) * rr;
        const v = Math.sin(a) * rr;
        if (sdConeFull(c, u, v) < 0) expect(Math.hypot(u - c.boundU, v)).toBeLessThan(c.boundR + 1e-9);
      }
    }
  });

  it("M-A at 0.01 m sweeps along and across the edge at ages 0, 0.25, 0.5, 1.0, 3.9 s: burns iff the reference sd·k < r (strict); the back is 0.36 m at landing, 0.8 m only at full size", () => {
    const { world, born } = lit();
    const c = molotovConeAt(balance, MOL)!;
    let ins = 0;
    let outs = 0;
    let flips = 0;
    for (const ageS of [0, 0.25, 0.5, 1.0, 3.9]) {
      world.tick = born + Math.round(ageS / TICK_DT_S);
      const k = refK(ageS);
      for (const r of [0, ZR, R]) {
        // lines along the throw (v fixed) and across it (u fixed), stepped 0.01 m with state carried over
        for (const v of [0, 0.5, 1.2, 1.9]) {
          let prev: boolean | null = null;
          for (let u = -2; u <= 6; u += 0.01) {
            const burns = molotovZoneAt(world, 24 + u, 16 + v, r) >= 0;
            const ref = refSd(u / k, v / k) * k < r;
            if (Math.abs(refSd(u / k, v / k) * k - r) > 1e-9) expect(burns, `age ${ageS} r ${r} u ${u.toFixed(2)} v ${v}`).toBe(ref);
            if (prev !== null && prev !== burns) flips++;
            prev = burns;
            if (burns) ins++;
            else outs++;
          }
        }
        for (const u of [-0.5, 0, 1, c.d * k, 3.5]) {
          for (let v = -3; v <= 3; v += 0.01) {
            const burns = molotovZoneAt(world, 24 + u, 16 + v, r) >= 0;
            if (Math.abs(refSd(u / k, v / k) * k - r) > 1e-9) expect(burns, `age ${ageS} r ${r} u ${u} v ${v.toFixed(2)}`).toBe(refSd(u / k, v / k) * k < r);
          }
        }
      }
      // the back along the axis (r = 0): 0.8·k
      const back = MO.back1 * k;
      expect(molotovZoneAt(world, 24 - back + 0.005, 16, 0)).toBeGreaterThanOrEqual(0);
      expect(molotovZoneAt(world, 24 - back - 0.005, 16, 0)).toBe(-1);
      // the tip: 4.5·k
      expect(molotovZoneAt(world, 24 + MO.reach1 * k - 0.005, 16, 0)).toBeGreaterThanOrEqual(0);
      expect(molotovZoneAt(world, 24 + MO.reach1 * k + 0.005, 16, 0)).toBe(-1);
    }
    expect(MO.back1 * refK(0)).toBeCloseTo(0.356, 3);
    expect(ins).toBeGreaterThan(1000);
    expect(outs).toBeGreaterThan(1000);
    expect(flips).toBeGreaterThan(40); // the sweeps really crossed the edge
  });

  it("oscillation at the edge: a body stepping ±0.005 m across the tip flips every step, never sticks", () => {
    const { world, born } = lit();
    world.tick = born + 30;
    const edge = 24 + 4.5 + ZR;
    for (let i = 0; i < 200; i++) {
      const x = edge + (i % 2 === 0 ? -0.005 : 0.005);
      expect(molotovZoneAt(world, x, 16, ZR) >= 0).toBe(i % 2 === 0);
    }
  });

  it("growth tick by tick: reach 2.0 m on the ignite tick, 4.5 m from +20 ticks, the ease-out between (strictly rising)", () => {
    const { world, born } = lit();
    let last = 0;
    for (let t = 0; t <= 80; t++) {
      world.tick = born + t;
      // the tip found by bisection on the sim's own test (r = 0, on the axis)
      let lo = 0;
      let hi = 6;
      for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2;
        if (molotovZoneAt(world, 24 + m, 16, 0) >= 0) lo = m;
        else hi = m;
      }
      const want = MO.reach0 + (MO.reach1 - MO.reach0) * refEase((t * TICK_DT_S) / MO.growS);
      expect(lo).toBeCloseTo(want, 6);
      if (t === 0) expect(lo).toBeCloseTo(2, 6);
      if (t >= 20) expect(lo).toBeCloseTo(4.5, 6);
      if (t > 0 && t <= 20) expect(lo).toBeGreaterThan(last);
      last = lo;
    }
  });

  it("direction: any throw direction, the cone is rotated with it (u8 heading, ≤ 0.71° off); a zero-length throw points +x", () => {
    let checked = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.137) {
      const { world, born, slot } = lit(Math.cos(a), Math.sin(a));
      world.tick = born + 25;
      const ux = world.molotovs.dirX[slot] as number;
      const uy = world.molotovs.dirY[slot] as number;
      expect(Math.hypot(ux, uy)).toBeCloseTo(1, 12);
      const off = Math.abs(Math.atan2(Math.sin(a) * ux - Math.cos(a) * uy, Math.cos(a) * ux + Math.sin(a) * uy));
      expect(off).toBeLessThanOrEqual(Math.PI / 256 + 1e-9);
      // 4 m ahead burns, 1.2 m behind doesn't, 2.4 m to the side of the impact doesn't
      expect(molotovZoneAt(world, 24 + ux * 4, 16 + uy * 4, 0)).toBeGreaterThanOrEqual(0);
      expect(molotovZoneAt(world, 24 - ux * 1.2, 16 - uy * 1.2, 0)).toBe(-1);
      expect(molotovZoneAt(world, 24 - uy * 2.4, 16 + ux * 2.4, 0)).toBe(-1);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
    const zero = lit(0, 0);
    expect(zero.world.molotovs.dirX[zero.slot]).toBe(1);
    expect(zero.world.molotovs.dirY[zero.slot]).toBe(0);
  });

  it("clip: a car 3 m ahead along the throw → nothing burns past its face (0.01 m sweep), the cone in front of it burns", () => {
    const map: DistrictMap = { ...PLACEHOLDER_MAP, name: "c-cone-clip", cover: [{ name: "test_car", kind: "car", minStage: 1, minX: 27, minY: 15.5, maxX: 29, maxY: 16.5 }] };
    const { world, born, slot } = lit(1, 0, map);
    expect(world.molotovs.clipM[slot]).toBeCloseTo(3, 2);
    expect(world.molotovs.clipM[slot]).toBeLessThanOrEqual(3);
    world.tick = born + 30;
    let burnt = 0;
    for (let u = 0; u <= 5; u += 0.01) {
      for (const v of [-1.8, -1, 1, 1.8]) {
        const b = molotovZoneAt(world, 24 + u, 16 + v, 0) >= 0;
        if (u > 3 + 1e-9) expect(b, `u ${u.toFixed(2)} v ${v}`).toBe(false);
        if (b) burnt++;
      }
    }
    expect(burnt).toBeGreaterThan(400);
    // a body of radius r touching the face from in front still burns (its edge is in the fire)
    expect(molotovZoneAt(world, 27 - ZR - 0.01, 17, ZR)).toBeGreaterThanOrEqual(0);
    // control: without the car the same side point past the face burns
    const open = lit(1, 0);
    open.world.tick = open.born + 30;
    expect(molotovZoneAt(open.world, 24 + 3.5, 16 + 1.5, 0)).toBeGreaterThanOrEqual(0);
    expect(molotovZoneAt(world, 24 + 3.5, 16 + 1.5, 0)).toBe(-1);
  });

  it("a zone lit against a wall face burns its back part and almost nothing forward", () => {
    const map: DistrictMap = { ...PLACEHOLDER_MAP, name: "c-cone-face", cover: [{ name: "test_car", kind: "car", minStage: 1, minX: 24.05, minY: 12, maxX: 27, maxY: 20 }] };
    const { world, born, slot } = lit(1, 0, map);
    expect(world.molotovs.clipM[slot]).toBeLessThanOrEqual(0.05);
    world.tick = born + 30;
    expect(molotovZoneAt(world, 23.5, 16, 0)).toBeGreaterThanOrEqual(0);
    expect(molotovZoneAt(world, 24.04, 16.5, 0)).toBeGreaterThanOrEqual(0);
    expect(molotovZoneAt(world, 24.1, 16, 0)).toBe(-1);
  });

  it("lane scenario: 20 Walkers in a lane along the throw, one Molotov → many burn, some die; the same pack off to the side → none", () => {
    for (const offside of [false, true]) {
      for (const k of Object.keys(molotovStats) as (keyof typeof molotovStats)[]) molotovStats[k] = 0;
      const { world, events, p } = setup();
      const { tx, ty, flight } = molotovAt(world, p, events);
      const ids: number[] = [];
      for (let i = 0; i < 20; i++) {
        const u = 0.3 + (i >> 1) * 0.4; // 0.3 … 3.9 m ahead, two files
        const v = (i & 1 ? 0.45 : -0.45) + (offside ? 3.2 : 0);
        ids.push(spawnZombie(world, "walker", tx + u, ty + v));
      }
      run(world, flight + 90, () => input(false));
      const burnt = ids.filter((id) => (world.zombies.hp[id] as number) < 10 || !isZombieAlive(world.zombies, id)).length;
      if (!offside) {
        expect(molotovStats.zombieHits).toBeGreaterThan(20);
        expect(molotovStats.kills).toBeGreaterThan(0);
        expect(burnt).toBeGreaterThanOrEqual(16);
      } else {
        expect(molotovStats.ignited).toBe(1); // liveness: the throw happened
        expect(molotovStats.zombieHits).toBe(0);
        expect(burnt).toBe(0);
      }
    }
  });

  it("walking lane: Walkers walking down the throw line into the cone burn (zombie AI on)", () => {
    for (const k of Object.keys(molotovStats) as (keyof typeof molotovStats)[]) molotovStats[k] = 0;
    const world = createWorld({ balance, seed: 7, systems: { waves: noop } });
    addPlayer(world, "p0", 6, 16);
    world.debug.godMode = true;
    startBuild(world);
    startWave(world);
    const p = world.players.get("p0") as PlayerState;
    for (let i = 0; i < 20; i++) spawnZombie(world, "walker", 19 + (i >> 1) * 0.9, 16 + (i & 1 ? 0.5 : -0.5));
    give(p, "molotovs", 2);
    setInput(world, "p0", input(true, 1));
    run(world, 1);
    run(world, 100, () => input(false));
    expect(molotovStats.ignited).toBe(1);
    expect(molotovStats.zombieHits).toBeGreaterThan(10);
    expect(molotovStats.kills).toBeGreaterThan(0);
  });
});

describe("determinism (brief 8)", () => {
  it("same seed + inputs → same digest; the digest sees the slot, the cooldown and the zones", () => {
    const go = (): World => {
      const { world, p } = setup();
      give(p, "molotovs", 2);
      tank(world, 18, 10);
      seq = 500;
      setInput(world, "p0", input(true));
      run(world, 1);
      run(world, 30, () => input(false));
      return world;
    };
    const a = go();
    const b = go();
    expect(worldDigest(a)).toBe(worldDigest(b));
    const d = worldDigest(a);
    (a.players.get("p0") as PlayerState).consumableCooldownTicks = 3;
    expect(worldDigest(a)).not.toBe(d);
    (a.players.get("p0") as PlayerState).consumableCooldownTicks = 0;
    expect(worldDigest(a)).toBe(d);
    expect(a.molotovs.areas.active[0]).toBe(1);
    a.molotovs.areas.ticksLeft[0] = (a.molotovs.areas.ticksLeft[0] as number) + 1;
    expect(worldDigest(a)).not.toBe(d);
  });
});
