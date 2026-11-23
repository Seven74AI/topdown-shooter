import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { REWIND_MAX_TICKS, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { addBuildingAt } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { CoverObject, DistrictMap } from "../map/districtMap";
import { DEG_TO_RAD } from "../math/vec";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer, type PlayerState } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { applyKnockback } from "./damage";
import { knockbacks, skippedInputWeaponTick } from "./firing";
import { activeSlot, setLoadout } from "./loadout";
import { pelletDirection, seqPelletRoll } from "./spread";

/**
 * Story 5.3: the Shotgun (8 pellets × 4, 30° stratified fan, 5 m, knockback 0.5 m once per shot)
 * and the Assault Rifle (through the plain gun path). One mechanic per test: no wave director and,
 * where a zombie must stand still, no zombie system.
 */
const noop: SystemFn = () => {};
const NO_WAVES = { waves: noop };
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const SG = balance.weapons.shotgun as { damage: number; pellets: number; rangeM: number; knockbackM: number; spreadDeg: number };
/** Player centre to muzzle (player radius 0.4 + MUZZLE_OFFSET_M 0.1). */
const MUZZLE = 0.5;

const fire = (seq: number, extra: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq, aimX: 1, aimY: 0, fire: true, isMouse: true, ...extra });
const idle = (seq: number): PlayerInput => ({ ...NEUTRAL_INPUT, seq });

interface Setup {
  world: World;
  p: PlayerState;
  events: SimEvent[];
}

function setup(weapon: string, opts: { map?: DistrictMap; systems?: typeof STILL | typeof NO_WAVES; seed?: number } = {}): Setup {
  const world = createWorld({ balance, seed: opts.seed ?? 1, map: opts.map ?? PLACEHOLDER_MAP, systems: opts.systems ?? STILL });
  const p = addPlayer(world, "p0", 10, 16);
  p.hp = 1e9;
  setLoadout(balance, p.loadout, [weapon, "pistol"]);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, p, events };
}

const run = (world: World, ticks: number, input?: (t: number) => PlayerInput) => {
  for (let i = 0; i < ticks; i++) {
    if (input) setInput(world, "p0", input(i));
    step(world, TICK_DT_S);
  }
};
const count = (events: SimEvent[], type: SimEvent["type"]) => events.filter((e) => e.type === type).length;
const damageTo = (events: SimEvent[], zid: number) => events.reduce((s, e) => (e.type === "zombie.hit" && e.zombieId === zid ? s + e.damage : s), 0);

/** One pull at tick 0, then idle until every pellet is gone. */
function onePull(s: Setup, extra: Partial<PlayerInput> = {}): void {
  setInput(s.world, "p0", fire(1, extra));
  step(s.world, TICK_DT_S);
  for (let t = 0; t < 20 && s.world.projectiles.aliveCount > 0; t++) {
    setInput(s.world, "p0", idle(2 + t));
    step(s.world, TICK_DT_S);
  }
}

describe("Shotgun fire (Story 5.3 AC 2)", () => {
  it("one pull = 8 pellets, 1 shell, one weapon.fired (with the 16-bit seq)", () => {
    const s = setup("shotgun");
    setInput(s.world, "p0", fire(70_001));
    step(s.world, TICK_DT_S);
    expect(s.world.projectiles.aliveCount).toBe(8);
    expect(activeSlot(s.p.loadout).ammo).toBe(5);
    expect(count(s.events, "weapon.fired")).toBe(1);
    const fired = s.events.find((e) => e.type === "weapon.fired");
    expect(fired).toMatchObject({ weapon: "shotgun", seq: 70_001 & 0xffff, dirX: 1, dirY: 0 });
  });

  it("the Assault Rifle's weapon.fired has no seq (single-pellet guns keep the 6-field event)", () => {
    const s = setup("assault_rifle");
    setInput(s.world, "p0", fire(5));
    step(s.world, TICK_DT_S);
    expect(s.world.projectiles.aliveCount).toBe(1);
    const fired = s.events.find((e) => e.type === "weapon.fired");
    expect(fired && "seq" in fired).toBe(false);
  });

  it("12 shots in 10 s at 1.2/s (cooldown rule), a 2.5 s reload after the 6th shell", () => {
    const s = setup("shotgun");
    let seq = 0;
    run(s.world, 200, () => fire(++seq));
    // 6 shots (0 … 4.17 s), reload starts after the 6th and lasts 50 ticks, then 6 more by 10 s.
    const reloadAt = s.events.findIndex((e) => e.type === "weapon.reload_started");
    expect(s.events.slice(0, reloadAt).filter((e) => e.type === "weapon.fired").length).toBe(6);
    expect(s.events.find((e) => e.type === "weapon.reload_started")).toMatchObject({ reloadS: 2.5 });
    expect(count(s.events, "weapon.fired")).toBe(10); // 6 + reload 2.5 s eats ~3 shots of the 12 a 10 s window could hold
    const s2 = setup("shotgun");
    activeSlot(s2.p.loadout).ammo = 1000;
    let seq2 = 0;
    run(s2.world, 200, () => fire(++seq2));
    expect(count(s2.events, "weapon.fired")).toBe(12); // exact 1.2/s with no reload
  });

  it("Assault Rifle: 8 shots/s, 30 rounds, 2.0 s reload, pellets 1; 1 bullet kills a Runner, 2 a Walker", () => {
    const s = setup("assault_rifle");
    activeSlot(s.p.loadout).ammo = 1000;
    let seq = 0;
    run(s.world, 200, () => fire(++seq));
    expect(count(s.events, "weapon.fired")).toBe(80);
    const r = setup("assault_rifle");
    let seqR = 0;
    run(r.world, 120, () => fire(++seqR));
    expect(r.events.find((e) => e.type === "weapon.reload_started")).toMatchObject({ reloadS: 2 });
    expect(r.events.slice(0, r.events.findIndex((e) => e.type === "weapon.reload_started")).filter((e) => e.type === "weapon.fired").length).toBe(30);
    for (const [type, shots] of [["runner", 1], ["walker", 2]] as const) {
      const k = setup("assault_rifle", { seed: 3 });
      const zid = spawnZombie(k.world, type, 13, 16);
      let sq = 0;
      run(k.world, 20, (t) => (t < shots * 3 ? fire(++sq) : idle(++sq)));
      expect(k.events.filter((e) => e.type === "zombie.hit" && e.zombieId === zid).length).toBe(shots);
      expect(k.events.some((e) => e.type === "zombie.killed" && e.zombieId === zid && e.weapon === "assault_rifle")).toBe(true);
    }
  });

  it("point-blank Walker takes all 8 pellets (32) and dies, for 1,000 seeds offline and 1,000 seqs online (F1)", () => {
    let shots = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const online = seed % 2 === 0;
      const s = setup("shotgun", { seed });
      if (online) s.p.rewindMaxTicks = REWIND_MAX_TICKS;
      // within walkerRadius / sin(15°) = 1.35 m of the muzzle every slice's pellet meets the body
      const d = 0.4 + (seed % 10) * 0.1;
      const zid = spawnZombie(s.world, "walker", 10 + MUZZLE + d, 16);
      s.world.zombies.hp[zid] = 1000;
      setInput(s.world, "p0", fire(seed * 7919));
      step(s.world, TICK_DT_S);
      expect(damageTo(s.events, zid)).toBe(SG.damage * SG.pellets);
      shots++;
    }
    expect(shots).toBe(1000);
    const k = setup("shotgun");
    const zid = spawnZombie(k.world, "walker", 11.5, 16);
    onePull(k);
    expect(k.events.some((e) => e.type === "zombie.killed" && e.zombieId === zid && e.weapon === "shotgun")).toBe(true);
  });

  it("a Walker at 4.9 m takes 1–4 pellets (~2.2 on average: damage falls off by geometry); nothing hits past 5 m (F2)", () => {
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = setup("shotgun", { seed });
      const near = spawnZombie(s.world, "walker", 10 + MUZZLE + 4.9, 16);
      const far = spawnZombie(s.world, "walker", 10 + MUZZLE + 5 + 0.36, 20); // its body starts just past 5 m (off the line of near)
      s.world.zombies.hp[near] = 1000;
      onePull(s, { aimX: 1, aimY: 0 });
      const pellets = damageTo(s.events, near) / SG.damage;
      // the body spans ±asin(0.35 / 4.9) = 8.2° of the 30° fan: 2.19 slices, touching at most 4
      expect(pellets).toBeLessThanOrEqual(4);
      expect(pellets).toBeGreaterThanOrEqual(1);
      expect(damageTo(s.events, far)).toBe(0);
      total += pellets;
    }
    expect(total / 200).toBeGreaterThan(1.9);
    expect(total / 200).toBeLessThan(2.5);
    // straight down the barrel: a Walker whose near edge is 5.05 m away is never touched
    const s = setup("shotgun");
    const z = spawnZombie(s.world, "walker", 10 + MUZZLE + 5.05 + 0.35, 16);
    onePull(s);
    expect(damageTo(s.events, z)).toBe(0);
  });

  it("same seed → same pellets (combat stream), different seed → different", () => {
    const fan = (seed: number) => {
      const s = setup("shotgun", { seed });
      setInput(s.world, "p0", fire(1));
      step(s.world, TICK_DT_S);
      return { digest: worldDigest(s.world), dirs: Array.from(s.world.projectiles.dirY.subarray(0, 8)) };
    };
    expect(fan(42)).toEqual(fan(42));
    expect(fan(42).dirs).not.toEqual(fan(43).dirs);
  });

  it("online pellets follow seqPelletRoll(player, seq & 0xffff, k) through pelletDirection", () => {
    const s = setup("shotgun");
    s.p.rewindMaxTicks = REWIND_MAX_TICKS;
    const seq = 123_456;
    setInput(s.world, "p0", fire(seq, { aimX: 0.6, aimY: 0.8 }));
    step(s.world, TICK_DT_S);
    const pool = s.world.projectiles;
    const out = { x: 0, y: 0 };
    for (let k = 0; k < 8; k++) {
      const id = pool.aliveIds[k] as number;
      pelletDirection(0.6, 0.8, SG.spreadDeg, SG.pellets, k, seqPelletRoll("p0", seq & 0xffff, k), out);
      expect(pool.dirX[id]).toBeCloseTo(out.x, 6);
      expect(pool.dirY[id]).toBeCloseTo(out.y, 6);
    }
  });

  it("the fan covers the 30° cone, one pellet per 3.75° slice", () => {
    const s = setup("shotgun", { seed: 9 });
    setInput(s.world, "p0", fire(1));
    step(s.world, TICK_DT_S);
    const pool = s.world.projectiles;
    const offs = Array.from({ length: 8 }, (_, k) => Math.atan2(pool.dirY[pool.aliveIds[k] as number] as number, pool.dirX[pool.aliveIds[k] as number] as number) / DEG_TO_RAD).sort((a, b) => a - b);
    offs.forEach((o, k) => {
      expect(o).toBeGreaterThanOrEqual(-15 + k * 3.75 - 1e-4);
      expect(o).toBeLessThanOrEqual(-15 + (k + 1) * 3.75 + 1e-4);
    });
  });

  it("dry fire (a skipped input) spends one shell and spawns no pellets (F7)", () => {
    const s = setup("shotgun");
    skippedInputWeaponTick(s.world, "p0", fire(1));
    expect(activeSlot(s.p.loadout).ammo).toBe(5);
    expect(s.world.projectiles.aliveCount).toBe(0);
    s.world.events.flush();
    expect(count(s.events, "weapon.fired")).toBe(0);
  });

  it("swapping away cancels the reload and swapping back does not refill the magazine (F7)", () => {
    const s = setup("shotgun");
    const slot = activeSlot(s.p.loadout);
    slot.ammo = 1;
    let seq = 0;
    run(s.world, 1, () => fire(++seq)); // last shell: reload starts
    expect(slot.ammo).toBe(0);
    expect(slot.reloadTicks).toBeGreaterThan(0);
    run(s.world, 10, () => idle(++seq));
    run(s.world, 1, () => ({ ...idle(++seq), swap: true }));
    expect(slot.reloadTicks).toBe(0);
    run(s.world, 10, () => idle(++seq)); // on the pistol now
    run(s.world, 1, () => ({ ...idle(++seq), swap: true }));
    run(s.world, 6, () => idle(++seq)); // back on the shotgun: an empty magazine starts a FULL reload
    expect(s.p.loadout.active).toBe(0);
    expect(slot.ammo).toBe(0);
    expect(slot.reloadTicks).toBeGreaterThan(40);
  });

  it("pellets never hurt players (a teammate in the fan takes nothing)", () => {
    const s = setup("shotgun");
    const mate = addPlayer(s.world, "p1", 11.5, 16);
    const hp = mate.hp;
    onePull(s);
    expect(mate.hp).toBe(hp);
    expect(count(s.events, "player.damaged")).toBe(0);
  });
});

/** The open street with one cover object (a car by default) on the line of fire. */
function mapWithCover(box: { minX: number; minY: number; maxX: number; maxY: number }, kind: CoverObject["kind"] = "car"): DistrictMap {
  return { ...PLACEHOLDER_MAP, name: "sg-cover", cover: [{ name: `t_${kind}`, kind, minStage: 1, ...box }] };
}

describe("Shotgun cover (F3)", () => {
  it("a Walker behind a car is never hit by a pellet the car stopped", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = setup("shotgun", { seed, map: mapWithCover({ minX: 12, minY: 14, maxX: 13, maxY: 18 }) });
      const z = spawnZombie(s.world, "walker", 13.6, 16);
      onePull(s);
      expect(damageTo(s.events, z)).toBe(0);
    }
  });

  /** Damage to a Walker at (12.2, 16) from one pull with seed `seed`, with `prepare` adding cover. */
  const behind = (seed: number, map: DistrictMap = PLACEHOLDER_MAP, barricade = false) => {
    const s = setup("shotgun", { seed, map });
    if (barricade) addBuildingAt(s.world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 22, gy: 30, rot: 1, hp: 200 }); // x 11–11.5, y 15–17
    const z = spawnZombie(s.world, "walker", 12.2, 16);
    s.world.zombies.hp[z] = 1000;
    onePull(s);
    return damageTo(s.events, z);
  };

  it("pellets pass over sandbags and barriers (they stop bodies only); a car and a player barricade stop them", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const open = behind(seed);
      expect(open).toBeGreaterThan(0);
      for (const kind of ["sandbags", "barrier"] as const) expect(behind(seed, mapWithCover({ minX: 11, minY: 15, maxX: 11.5, maxY: 17 }, kind))).toBe(open);
      expect(behind(seed, undefined, true)).toBe(0); // designer 2026-11-23: barricades stop bullets
      expect(behind(seed, mapWithCover({ minX: 11, minY: 15, maxX: 11.5, maxY: 17 }, "car"))).toBe(0);
    }
  });
});

describe("Shotgun knockback (F4, F5)", () => {
  it("8 pellets on one Walker push it 0.5 m, not 4 m (once per shot, F5)", () => {
    const s = setup("shotgun");
    const z = spawnZombie(s.world, "walker", 11.5, 16);
    s.world.zombies.hp[z] = 1000;
    const before = knockbacks.applied;
    onePull(s);
    expect(damageTo(s.events, z)).toBe(32); // all 8 hit…
    // …one 0.5 m push along the first pellet (away from the muzzle, inside the fan)
    expect(Math.hypot((s.world.zombies.x[z] as number) - 11.5, (s.world.zombies.y[z] as number) - 16)).toBeCloseTo(0.5, 4);
    expect(s.world.zombies.x[z]).toBeGreaterThan(11.5 + 0.5 * Math.cos(15 * DEG_TO_RAD) - 1e-4);
    expect(knockbacks.applied - before).toBe(1);
  });

  it("two pulls push twice", () => {
    const s = setup("shotgun");
    const z = spawnZombie(s.world, "walker", 11.5, 16);
    s.world.zombies.hp[z] = 1000;
    let seq = 0;
    run(s.world, 18, () => fire(++seq)); // 1.2/s: shots at ticks 0 and 17
    expect(count(s.events, "weapon.fired")).toBe(2);
    expect(Math.hypot((s.world.zombies.x[z] as number) - 11.5, (s.world.zombies.y[z] as number) - 16)).toBeGreaterThan(0.95);
    expect(Math.hypot((s.world.zombies.x[z] as number) - 11.5, (s.world.zombies.y[z] as number) - 16)).toBeLessThanOrEqual(1 + 1e-4);
  });

  it("the Assault Rifle does not knock back (pushback 0.15 per bullet only)", () => {
    const s = setup("assault_rifle");
    const z = spawnZombie(s.world, "walker", 12, 16);
    s.world.zombies.hp[z] = 1000;
    onePull(s);
    expect(s.world.zombies.x[z]).toBeCloseTo(12.15, 3);
  });

  it("a Walker against a barricade face is not pushed into or through it (F4)", () => {
    // barricade x 13–13.5; Walker touching its near face (centre 12.65) and the reverse: one 0.1 m short
    for (const zx of [13 - 0.35, 13 - 0.45, 13 - 0.35 - 1e-6]) {
      const s = setup("shotgun");
      s.p.x = 11.6; // muzzle at 12.1: point blank
      addBuildingAt(s.world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 26, gy: 30, rot: 1, hp: 200 });
      const z = spawnZombie(s.world, "walker", zx, 16);
      s.world.zombies.hp[z] = 1000;
      onePull(s);
      expect(damageTo(s.events, z)).toBe(32);
      const x = s.world.zombies.x[z] as number;
      expect(x).toBeLessThanOrEqual(13 - 0.35 + 1e-5);
      expect(x).toBeGreaterThanOrEqual(zx - 1e-5);
    }
  });

  it("a Walker beside a car stops at the car (pushed sideways into it)", () => {
    const s = setup("shotgun", { map: mapWithCover({ minX: 9, minY: 18, maxX: 13, maxY: 20 }) });
    const z = spawnZombie(s.world, "walker", 10, 17.4); // 0.25 m from the car's face, south of the player
    s.world.zombies.hp[z] = 1000;
    onePull(s, { aimX: 0, aimY: 1 });
    expect(damageTo(s.events, z)).toBeGreaterThan(0);
    expect(s.world.zombies.y[z]).toBeLessThanOrEqual(18 - 0.35 + 1e-5);
    expect(s.world.zombies.y[z]).toBeGreaterThan(17.6);
  });

  it("review M1: two co-op Shotguns firing at one Walker in the same tick knock it twice, not 4 times (F5)", () => {
    let seen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const d of [2.6, 3.1, 3.6, 4.1]) {
        const s = setup("shotgun", { seed });
        const b = addPlayer(s.world, "p1", 10, 17.2);
        b.hp = 1e9;
        setLoadout(balance, b.loadout, ["shotgun", null]);
        const zx = 10.5 + d;
        const z = spawnZombie(s.world, "walker", zx, 16.6);
        s.world.zombies.hp[z] = 1e6;
        const before = knockbacks.applied;
        const aimAt = (p: PlayerState) => {
          const l = Math.hypot(zx - p.x, 16.6 - p.y);
          return { aimX: (zx - p.x) / l, aimY: (16.6 - p.y) / l };
        };
        setInput(s.world, "p0", fire(1, aimAt(s.p)));
        setInput(s.world, "p1", fire(1, aimAt(b)));
        step(s.world, TICK_DT_S);
        for (let t = 0; t < 6; t++) {
          setInput(s.world, "p0", idle(2 + t));
          setInput(s.world, "p1", idle(2 + t));
          step(s.world, TICK_DT_S);
        }
        const n = knockbacks.applied - before;
        expect(n, `seed ${seed} d ${d}`).toBeLessThanOrEqual(2);
        expect(Math.hypot((s.world.zombies.x[z] as number) - zx, (s.world.zombies.y[z] as number) - 16.6)).toBeLessThanOrEqual(1 + 1e-4);
        if (n === 2) seen++;
      }
    }
    expect(seen).toBeGreaterThan(50); // liveness: both shots really knocked in many cases
  });

  it("review M2: a 1.5 m knock (Fire Axe / Brute range) of a body pressed into a barricade never crosses it", () => {
    for (const press of [1e-5, 1e-3, 0.05, 0.2]) {
      const s = setup("shotgun");
      addBuildingAt(s.world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 26, gy: 30, rot: 1, hp: 200 }); // x 13–13.5, y 15–17
      const zx = 13 - 0.35 + press;
      const z = spawnZombie(s.world, "walker", zx, 16);
      applyKnockback(s.world, z, 1, 0, 1.5);
      expect(s.world.zombies.x[z], `press ${press}`).toBeLessThanOrEqual(zx + 1e-6);
      for (const [dx, dy] of [[0.8, 0.6], [0.6, -0.8], [1, 0.1]] as const) {
        const l = Math.hypot(dx, dy);
        const z2 = spawnZombie(s.world, "walker", zx, 16);
        applyKnockback(s.world, z2, dx / l, dy / l, 1.5);
        expect(s.world.zombies.x[z2] as number, `press ${press} dir ${dx},${dy}`).toBeLessThan(13.5); // never past the far side
      }
      // away from it is free
      const z3 = spawnZombie(s.world, "walker", zx, 16);
      expect(applyKnockback(s.world, z3, -1, 0, 1.5)).toBeCloseTo(1.5, 6);
    }
  });

  it("review L4: a diagonal knock at the map edge stops at the edge, never sliding along it into a box", () => {
    // a car against the east edge (x 46–48, y 12–14.3); the Walker below it, the knock heads mostly east
    const s = setup("shotgun", { map: mapWithCover({ minX: 46, minY: 12, maxX: 48, maxY: 14.3 }) });
    const z = spawnZombie(s.world, "walker", 47.3, 15);
    const l = Math.hypot(0.95, -0.312);
    applyKnockback(s.world, z, 0.95 / l, -0.312 / l, 1.5);
    const x = s.world.zombies.x[z] as number;
    const y = s.world.zombies.y[z] as number;
    expect(x).toBeLessThanOrEqual(48 - 0.35 + 1e-5);
    expect(circleOverlapsBox(x, y, 0.35 - 1e-5, 46, 12, 48, 14.3)).toBe(false);
    expect(y).toBeLessThan(15); // it did move
  });

  it("never off the map", () => {
    const s = setup("shotgun");
    s.p.x = 46;
    const z = spawnZombie(s.world, "walker", 47.5, 16);
    s.world.zombies.hp[z] = 1000;
    onePull(s);
    expect(s.world.zombies.x[z]).toBeLessThanOrEqual(48 - 0.35 + 1e-5);
    expect(s.world.zombies.x[z]).toBeGreaterThan(47.6);
  });

  it("applyKnockback: a body pressed into a face may move away but never deeper", () => {
    const s = setup("shotgun");
    addBuildingAt(s.world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 26, gy: 30, rot: 1, hp: 200 });
    const z = spawnZombie(s.world, "walker", 12.7, 16); // overlapping the face by 0.05
    expect(applyKnockback(s.world, z, 1, 0, 0.5)).toBe(0);
    expect(s.world.zombies.x[z]).toBeCloseTo(12.7, 6);
    expect(applyKnockback(s.world, z, -1, 0, 0.5)).toBeCloseTo(0.5, 6);
    const b = s.world.buildings.list[0];
    if (!b) throw new Error("no building");
    expect(circleOverlapsBox(s.world.zombies.x[z] as number, 16, 0.35, b.minX, b.minY, b.maxX, b.maxY)).toBe(false);
  });

  it("live crowd of tough Walkers: they still reach and bite the shooter (knockback is no stun-lock)", () => {
    const s = setup("shotgun", { systems: NO_WAVES });
    for (let i = 0; i < 12; i++) s.world.zombies.hp[spawnZombie(s.world, "walker", 18 + (i % 4), 14 + Math.floor(i / 4) * 2)] = 1e6;
    s.p.hp = 1e9;
    let seq = 0;
    run(s.world, 400, () => fire(++seq));
    expect(count(s.events, "weapon.fired")).toBeGreaterThanOrEqual(18); // 6 shells per 6.7 s cycle
    expect(count(s.events, "player.damaged")).toBeGreaterThan(0);
  });
});
