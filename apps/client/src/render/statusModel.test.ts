import { describe, expect, it } from "vitest";
import {
  AREA_KIND,
  BOSS_STATE,
  BUILD_GRID_M,
  NEUTRAL_INPUT,
  TICK_DT_S,
  addBuildingAt,
  addPlayer,
  createWorld,
  downPlayer,
  holdPlayer,
  loadBalance,
  returnPlayer,
  setInput,
  setLoadout,
  spawnArea,
  spawnZombie,
  startBuild,
  startWave,
  step,
  ticksFor,
  type PlayerInput,
  type SystemFn,
} from "@topdown/shared";
import { BodyStatus, STATUS, STATUS_MAX_SHOWN, StatusModel, ZOMBIE_IMPORTANCE, NO_RING, orderedIcons, ringFraction, worldStatusSources } from "./statusModel";

/**
 * Story 9.22 (AC 3, T1): the status model on the LOCAL source (solo / host World), one test per status, driven by the
 * sim's own mechanics (a real trap snap, a real flame pulse, a real Crawler bite, a real down and revive, a real
 * return from a hold, a real boss STUN clock), and the stacking rules. The online derivations are in
 * `statusModel.probe.test.ts`.
 */
const balance = loadBalance();
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };

function setup(systems: Record<string, SystemFn> = STILL) {
  const world = createWorld({ balance, seed: 1, systems });
  const p0 = addPlayer(world, "p0", 40, 28);
  startBuild(world);
  startWave(world);
  const model = new StatusModel(balance, world.zombies.capacity);
  let nextId = 1;
  const place = (x: number, y: number, type: string) =>
    addBuildingAt(world, { id: nextId++, type, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: balance.buildings.types[type]?.hp ?? 1 });
  const run = (n = 1) => {
    for (let i = 0; i < n; i++) step(world, TICK_DT_S);
    model.update(world, worldStatusSources);
  };
  return { world, p0, model, place, run };
}

const rec = (m: StatusModel, id: string): BodyStatus => {
  for (let i = 0; i < m.playerCount; i++) if (m.players[i]?.id === id) return m.players[i] as BodyStatus;
  throw new Error(`no record for ${id}`);
};
const left = (m: StatusModel, z: number, s: number) => m.zLeft[z * 8 + s] as number;
const total = (m: StatusModel, z: number, s: number) => m.zTotal[z * 8 + s] as number;

describe("status model: the set and the order (Story 9.22 AC 1, 2)", () => {
  it("eight statuses in the designer's priority, at most 3 shown, the next moves up when one ends", () => {
    expect(Object.keys(STATUS)).toEqual(["DOWNED", "BURNING", "ACID", "SLOWED", "STUNNED", "TRAPPED", "PROTECTED", "HEALING"]);
    const out = new Uint8Array(STATUS_MAX_SHOWN);
    const all = (1 << 8) - 1;
    expect(orderedIcons(all, out)).toBe(3);
    expect([...out]).toEqual([STATUS.DOWNED, STATUS.BURNING, STATUS.ACID]);
    const m = (1 << STATUS.HEALING) | (1 << STATUS.SLOWED) | (1 << STATUS.PROTECTED) | (1 << STATUS.TRAPPED);
    expect(orderedIcons(m, out)).toBe(3);
    expect([...out]).toEqual([STATUS.SLOWED, STATUS.TRAPPED, STATUS.PROTECTED]);
    expect(orderedIcons(m & ~(1 << STATUS.SLOWED), out)).toBe(3);
    expect([...out]).toEqual([STATUS.TRAPPED, STATUS.PROTECTED, STATUS.HEALING]); // re-centred row: healing moves up
    expect(orderedIcons(0, out)).toBe(0);
  });

  it("ring fractions: left over total, clamped; a zone status has none", () => {
    expect(ringFraction(30, 60)).toBe(0.5);
    expect(ringFraction(70, 60)).toBe(1);
    expect(ringFraction(NO_RING, 0)).toBe(-1);
  });

  it("importance (B5): Brute / Bloater / Spitter > Runner > Walker / Crawler", () => {
    const by = (t: string) => ZOMBIE_IMPORTANCE[["walker", "crawler", "runner", "spitter", "brute", "bloater"].indexOf(t)];
    expect([by("brute"), by("bloater"), by("spitter"), by("runner"), by("walker"), by("crawler")]).toEqual([2, 2, 2, 1, 0, 0]);
  });
});

describe("status model, local zombies (Story 9.22 AC 3)", () => {
  it("TRAPPED: a real bear-trap snap holds a Walker 60 ticks and a Brute 30; the ring counts the hold down; off on release", () => {
    const { world, model, place, run } = setup();
    place(10, 10, "bear_trap"); // centre (10.5, 10.5)
    const w = spawnZombie(world, "walker", 10.6, 10.5);
    world.zombies.hp[w] = 1000;
    run();
    expect(model.zHas(w, STATUS.TRAPPED)).toBe(true);
    expect(total(model, w, STATUS.TRAPPED)).toBe(60);
    const l0 = left(model, w, STATUS.TRAPPED);
    expect(l0).toBe(world.zombies.holdTicks[w]);
    // The zombies system counts the hold; with it parked the clock stands: run one with movement.
    const b = setup({ waves: noop });
    b.place(10, 10, "bear_trap");
    b.p0.x = 10.5;
    b.p0.y = 20;
    const brute = spawnZombie(b.world, "brute", 10.5, 10.5);
    b.world.zombies.hp[brute] = 1e6;
    b.run();
    expect(b.model.zHas(brute, STATUS.TRAPPED)).toBe(true);
    expect(b.model.zTotal[brute * 8 + STATUS.TRAPPED]).toBe(30);
    const start = b.model.zLeft[brute * 8 + STATUS.TRAPPED] as number;
    b.run(10);
    expect(b.model.zLeft[brute * 8 + STATUS.TRAPPED]).toBe(start - 10);
    let seen = 0;
    for (let i = 0; i < 40 && b.model.zHas(brute, STATUS.TRAPPED); i++) {
      b.run();
      seen++;
    }
    expect(b.model.zHas(brute, STATUS.TRAPPED), "released").toBe(false);
    expect(seen).toBeGreaterThan(0);
  });

  it("SLOWED (zone): a zombie on a spike trap, none off it", () => {
    const { world, model, place, run } = setup();
    place(10, 10, "spike_trap"); // 2 × 2 m
    const on = spawnZombie(world, "walker", 11, 11);
    const off = spawnZombie(world, "walker", 20, 20);
    world.zombies.hp[on] = 1000;
    run();
    expect(model.zHas(on, STATUS.SLOWED)).toBe(true);
    expect(left(model, on, STATUS.SLOWED)).toBe(NO_RING);
    expect(model.zHas(off, STATUS.SLOWED)).toBe(false);
  });

  it("BURNING: a real flamethrower pulse ignites a Walker for 3 s; the ring counts down after the cone stops", () => {
    const { world, p0, model, run } = setup();
    setLoadout(balance, p0.loadout, ["flamethrower", "pistol"]);
    p0.hp = 1e6;
    const z = spawnZombie(world, "walker", p0.x + 2, p0.y);
    world.zombies.hp[z] = 1e6;
    let seq = 0;
    const input = (extra: Partial<PlayerInput>) => setInput(world, "p0", { ...NEUTRAL_INPUT, seq: ++seq, ...extra });
    input({ fire: true, aimX: 1, aimY: 0 });
    run();
    expect(model.zHas(z, STATUS.BURNING)).toBe(true);
    expect(total(model, z, STATUS.BURNING)).toBe(ticksFor(3));
    expect(left(model, z, STATUS.BURNING)).toBe(world.zombies.igniteTicks[z]);
    input({ fire: false });
    run();
    const a = left(model, z, STATUS.BURNING);
    run(10);
    expect(left(model, z, STATUS.BURNING)).toBe(a - 10);
    run(60);
    expect(model.zHas(z, STATUS.BURNING)).toBe(false);
  });
});

describe("status model, local survivors (Story 9.22 AC 3)", () => {
  it("SLOWED: a real Crawler bite: 20 ticks, ring from full", () => {
    const { world, p0, model, run } = setup({ waves: noop });
    p0.hp = 1e6;
    spawnZombie(world, "crawler", p0.x + 0.6, p0.y);
    let bitten = false;
    for (let i = 0; i < 100 && !bitten; i++) {
      run();
      bitten = rec(model, "p0").has(STATUS.SLOWED);
    }
    expect(bitten, "the Crawler bit").toBe(true);
    const r = rec(model, "p0");
    expect(r.total[STATUS.SLOWED]).toBe(ticksFor(balance.zombies.types.crawler?.biteSlowS ?? 0));
    expect(r.left[STATUS.SLOWED]).toBe(p0.slowTicksLeft);
  });

  it("DOWNED: 20 s ring; a teammate reviving pauses it and fills the revive ring", () => {
    const { world, p0, model, run } = setup();
    const p1 = addPlayer(world, "p1", 60, 28);
    downPlayer(world, p0);
    run(5);
    let r = rec(model, "p0");
    expect(r.has(STATUS.DOWNED)).toBe(true);
    expect(r.total[STATUS.DOWNED]).toBe(ticksFor(20));
    expect(r.left[STATUS.DOWNED]).toBe(ticksFor(20) - 5);
    expect(r.reviveNeed).toBe(0);
    expect(r.mask, "a downed body shows DOWNED only").toBe(1 << STATUS.DOWNED);
    p1.x = p0.x + 1;
    p1.y = p0.y;
    run(10);
    r = rec(model, "p0");
    expect(r.left[STATUS.DOWNED], "paused while revived").toBe(ticksFor(20) - 5);
    expect(r.reviveTicks).toBe(10);
    expect(r.reviveNeed).toBe(ticksFor(3));
  });

  it("PROTECTED: a real return mid-wave: 40 ticks; while protected no BURNING in fire", () => {
    const { world, p0, model, run } = setup();
    addPlayer(world, "p1", 30, 28);
    holdPlayer(world, "p0");
    run(balance.player.returnMinHoldTicks + 1);
    expect(returnPlayer(world, "p0")).toBe(true);
    spawnArea(world.molotovs.areas, 8, AREA_KIND.FIRE, 1, p0.x, p0.y, 2, 1000, 0);
    model.update(world, worldStatusSources);
    const r = rec(model, "p0");
    expect(r.has(STATUS.PROTECTED)).toBe(true);
    expect(r.left[STATUS.PROTECTED]).toBe(40);
    expect(r.total[STATUS.PROTECTED]).toBe(40);
    expect(r.has(STATUS.BURNING)).toBe(false);
    run(10);
    expect(rec(model, "p0").left[STATUS.PROTECTED]).toBe(30);
    run(40);
    expect(rec(model, "p0").has(STATUS.PROTECTED)).toBe(false);
    expect(rec(model, "p0").has(STATUS.BURNING), "unprotected now: in the Molotov zone").toBe(true);
  });

  it("PROTECTED: a refresh (the extraction's calm) restarts the ring at the refreshed length", () => {
    const { world, p0, model } = setup();
    p0.protectTicks = 40;
    model.update(world, worldStatusSources);
    p0.protectTicks = 30;
    model.update(world, worldStatusSources);
    expect(ringFraction(rec(model, "p0").left[STATUS.PROTECTED] as number, rec(model, "p0").total[STATUS.PROTECTED] as number)).toBe(0.75);
    p0.protectTicks = 255; // `calm` (run/extract.ts)
    model.update(world, worldStatusSources);
    const r = rec(model, "p0");
    expect(r.total[STATUS.PROTECTED]).toBe(255);
    expect(ringFraction(r.left[STATUS.PROTECTED] as number, r.total[STATUS.PROTECTED] as number)).toBe(1);
  });

  it("zones: car fire and Molotov → BURNING, acid puddle → ACID, a med station while hurt → HEALING; off when out", () => {
    const { world, p0, model, place, run } = setup();
    (world.decay.fires as unknown as { x: number; y: number; radiusM: number; name: string; target: string }[]).push({ name: "t", target: "car", x: 40, y: 28, radiusM: 1.5 } as never);
    run();
    expect(rec(model, "p0").has(STATUS.BURNING)).toBe(true);
    expect(rec(model, "p0").left[STATUS.BURNING]).toBe(NO_RING);
    p0.x = 70;
    model.update(world, worldStatusSources);
    expect(rec(model, "p0").has(STATUS.BURNING)).toBe(false);
    spawnArea(world.areas, 8, AREA_KIND.ACID, 1, 70, 28, 1, 1000, 0);
    model.update(world, worldStatusSources);
    expect(rec(model, "p0").has(STATUS.ACID)).toBe(true);
    p0.x = 90;
    place(90, 28, "med_station");
    p0.hp = p0.maxHp;
    model.update(world, worldStatusSources);
    expect(rec(model, "p0").has(STATUS.HEALING), "full HP: no heal").toBe(false);
    p0.hp = p0.maxHp - 20;
    run();
    expect(rec(model, "p0").has(STATUS.HEALING)).toBe(true);
    expect(p0.hp, "the sim healed").toBeGreaterThan(p0.maxHp - 20);
    p0.hp = p0.maxHp - 0.5; // B6: the bar shows full (rounded up): no icon while the sim heals the last fraction
    model.update(world, worldStatusSources);
    expect(rec(model, "p0").has(STATUS.HEALING)).toBe(false);
    p0.x = 120;
    model.update(world, worldStatusSources);
    expect(rec(model, "p0").mask).toBe(0);
    p0.protectTicks = 40;
    world.extract.boarded.add("p0"); // aboard the helicopter: no body drawn, no icon
    model.update(world, worldStatusSources);
    expect(rec(model, "p0").mask).toBe(0);
  });
});

describe("status model, the Behemoth (Story 9.22 AC 3, 6)", () => {
  it("STUNNED for exactly charge.stunS (40 ticks), the ring counting the stun's own clock", () => {
    const { world, model, run } = setup({ waves: noop });
    const b = world.boss;
    b.state = BOSS_STATE.WALK;
    b.x = 20;
    b.y = 20;
    b.hp = b.maxHp = 6000;
    b.number = 1;
    b.gapTicks = 0;
    b.cooldown.slam = b.cooldown.charge = b.cooldown.throw = 1e9;
    b.state = BOSS_STATE.STUN; // what a crash leaves (telegraph.ts)
    b.stateTicks = 0;
    model.update(world, worldStatusSources);
    expect(model.boss.has(STATUS.STUNNED)).toBe(true);
    expect(model.boss.left[STATUS.STUNNED]).toBe(40);
    let ticks = 0;
    while (model.boss.has(STATUS.STUNNED) && ticks < 100) {
      run();
      ticks++;
    }
    expect(ticks, "stunned ticks after the crash tick").toBe(40);
    expect(world.boss.state).not.toBe(BOSS_STATE.STUN);
  });
});

