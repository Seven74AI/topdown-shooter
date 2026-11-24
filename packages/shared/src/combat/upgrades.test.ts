import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer, type PlayerState } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { snapshotWorld, worldDigest } from "../core/worldSnapshot";
import { activeSlot, setLoadout, validLevel } from "./loadout";
import { upgradePrice, weaponDamage, weaponIds, weaponStats } from "./weapons";

/**
 * Story 5.1 (F2, F5): an upgrade level only ever adds +25 % of the weapon's base damage per level,
 * through the one shared `weaponDamage`; nothing else about the weapon changes. One mechanic per
 * test: no wave director; where a zombie must stand still, no zombie system either.
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();

const fire = (seq: number): PlayerInput => ({ ...NEUTRAL_INPUT, seq, aimX: 1, aimY: 0, fire: true, isMouse: true });
const idle = (seq: number): PlayerInput => ({ ...NEUTRAL_INPUT, seq });

function setup(weapon: string, level: number, b = balance, seed = 1): { world: World; p: PlayerState; events: SimEvent[] } {
  const world = createWorld({ balance: b, seed, map: PLACEHOLDER_MAP, systems: STILL });
  const p = addPlayer(world, "p0", 10, 16);
  p.hp = 1e9;
  setLoadout(b, p.loadout, [weapon, null], [level, 1]);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, p, events };
}
const count = (events: SimEvent[], type: SimEvent["type"]) => events.filter((e) => e.type === type).length;

/** Fires once per input until `stop()` or `maxTicks`; returns the ticks run. */
function fireUntil(s: { world: World }, stop: () => boolean, maxTicks: number): number {
  let t = 0;
  for (; t < maxTicks && !stop(); t++) {
    setInput(s.world, "p0", fire(t + 1));
    step(s.world, TICK_DT_S);
  }
  return t;
}

describe("weaponDamage (Story 5.1 F2)", () => {
  it("damage per level for every weapon (I–IV exact)", () => {
    expect(weaponIds(balance).length).toBeGreaterThanOrEqual(6); // liveness: the loop really covers the weapons
    for (const id of weaponIds(balance)) {
      const base = weaponStats(balance, id).damage;
      expect([1, 2, 3, 4].map((l) => weaponDamage(balance, id, l))).toEqual([base, base * 1.25, base * 1.5, base * 1.75]);
    }
    // Spot values from the GDD table: exact, no rounding (Pistol IV = 10.5 since the Epic 5 balance pass B3).
    expect(weaponDamage(balance, "pistol", 4)).toBe(10.5);
    expect(weaponDamage(balance, "smg", 3)).toBe(6);
    expect(weaponDamage(balance, "hunting_rifle", 4)).toBe(61.25);
    expect(weaponDamage(balance, "machete", 2)).toBe(15);
    expect(weaponDamage(balance, "shotgun", 4)).toBe(8.75); // balance pass B5: 5 per pellet
    expect(weaponDamage(balance, "assault_rifle", 3)).toBe(15); // balance pass B4: base 10
  });

  it("prices per level for every weapon (Pistol 60)", () => {
    const want: Record<string, number> = { pistol: 60, machete: 90, smg: 120, shotgun: 150, hunting_rifle: 210, assault_rifle: 270, fire_axe: 180, chainsaw: 360 };
    let checked = 0;
    for (const id of weaponIds(balance)) {
      const w = weaponStats(balance, id);
      expect(upgradePrice(balance, id)).toBe(Math.round(0.6 * (w.upgradeBasePrice ?? w.price)));
      expect(upgradePrice(balance, id)).toBeGreaterThanOrEqual(1);
      if (id in want) {
        expect(upgradePrice(balance, id)).toBe(want[id]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it("validLevel keeps 1–maxLevel, anything else is 1", () => {
    expect([1, 2, 3, 4].map((l) => validLevel(balance, l))).toEqual([1, 2, 3, 4]);
    expect([0, 5, 9, 2.5, -1, Number.NaN, undefined].map((l) => validLevel(balance, l))).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("upgraded weapons in the real sim (Story 5.1 AC 4, 11)", () => {
  it("SMG level III kills a Runner with one bullet, level II needs two", () => {
    for (const [level, shots] of [
      [3, 1],
      [2, 2],
    ] as const) {
      const s = setup("smg", level);
      const z = spawnZombie(s.world, "runner", 13, 16);
      expect(z).toBeGreaterThanOrEqual(0);
      fireUntil(s, () => count(s.events, "zombie.killed") > 0, 40);
      expect(count(s.events, "zombie.killed")).toBe(1); // liveness: the Runner really died
      expect(count(s.events, "weapon.fired")).toBe(shots);
      const hits = s.events.filter((e) => e.type === "zombie.hit").map((e) => (e as { damage: number }).damage);
      expect(hits.every((d) => d === 4 * (1 + 0.25 * (level - 1)))).toBe(true);
    }
  });

  it("Hunting Rifle IV kills a 120 HP target in 2 shots (III needs 3)", () => {
    // A 120 HP Walker stands in for the Brute (5.7) until it exists.
    const b = loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", "types.walker.hp", 120]]));
    for (const [level, shots] of [
      [4, 2],
      [3, 3],
    ] as const) {
      const s = setup("hunting_rifle", level, b);
      spawnZombie(s.world, "walker", 14, 16);
      fireUntil(s, () => count(s.events, "zombie.killed") > 0, 200);
      expect(count(s.events, "zombie.killed")).toBe(1);
      expect(count(s.events, "weapon.fired")).toBe(shots);
    }
  });

  it("melee level scales the swing", () => {
    for (const level of [1, 2, 3, 4]) {
      const s = setup("machete", level);
      spawnZombie(s.world, "walker", 11, 16);
      setInput(s.world, "p0", fire(1));
      step(s.world, TICK_DT_S);
      const hit = s.events.find((e) => e.type === "zombie.hit") as { damage: number; weapon: string } | undefined;
      expect(hit?.weapon).toBe("machete");
      expect(hit?.damage).toBe(12 * (1 + 0.25 * (level - 1)));
    }
  });

  it("Shotgun pellets carry the upgraded damage", () => {
    const s = setup("shotgun", 4);
    spawnZombie(s.world, "walker", 11.5, 16);
    setInput(s.world, "p0", fire(1));
    step(s.world, TICK_DT_S);
    for (let t = 0; t < 10; t++) {
      setInput(s.world, "p0", idle(2 + t));
      step(s.world, TICK_DT_S);
    }
    const hits = s.events.filter((e) => e.type === "zombie.hit") as { damage: number }[];
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.damage).toBe(8.75); // 5 × 1.75
  });

  it("nothing but damage changes (rate, ammo, reload, cooldown, spread rolls) between I and IV over 200 ticks", () => {
    const trace = (level: number): { slots: string[]; shots: string[] } => {
      const s = setup("smg", level, balance, 42);
      // Spread rolls: no zombies, so every shot's direction is the raw spread draw.
      const slots: string[] = [];
      for (let t = 0; t < 200; t++) {
        setInput(s.world, "p0", t % 50 < 35 ? fire(t + 1) : idle(t + 1));
        step(s.world, TICK_DT_S);
        const sl = activeSlot(s.p.loadout);
        slots.push(`${sl.ammo}/${sl.reloadTicks}/${sl.cooldownS.toFixed(6)}`);
      }
      const shots = s.events.filter((e) => e.type === "weapon.fired").map((e) => `${(e as { dirX: number }).dirX.toFixed(6)},${(e as { dirY: number }).dirY.toFixed(6)}`);
      return { slots, shots };
    };
    const one = trace(1);
    const four = trace(4);
    expect(one.shots.length).toBeGreaterThan(40); // liveness: the SMG really fired and reloaded
    expect(one.slots.some((x) => x.split("/")[1] !== "0")).toBe(true); // a reload happened
    expect(four.shots).toEqual(one.shots);
    expect(four.slots).toEqual(one.slots);
  });
});

describe("snapshotWorld carries the level (Story 5.1 AC 9)", () => {
  it("the slot spread copies level; a level-only difference changes the digest", () => {
    const a = setup("smg", 1);
    const b = setup("smg", 3);
    const players = snapshotWorld(b.world).players as unknown as [string, { loadout: { slots: ({ level: number } | null)[] } }][];
    const slots = players[0]?.[1].loadout.slots;
    expect(slots?.[0]?.level).toBe(3);
    expect(worldDigest(a.world)).not.toBe(worldDigest(b.world));
    b.p.loadout.slots[0].level = 1;
    expect(worldDigest(a.world)).toBe(worldDigest(b.world));
  });
});
