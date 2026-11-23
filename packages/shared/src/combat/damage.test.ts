import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import type { SimEvent } from "../core/simEvents";
import { createWorld } from "../core/world";
import { spawnZombie } from "../zombies/zombiePool";
import { applyZombieDamage, damagePlayerBy, type DamageTag } from "./damage";
import { addPlayer } from "../player/player";
import { bundledBalanceFiles, withOverrides } from "../config/balance";
import { createExplosionSpec, explode } from "./explosion";

describe("applyZombieDamage", () => {
  it("emits zombie.hit, pushes back, and kills at 0 HP once", () => {
    const world = createWorld({ balance: loadBalance(), seed: 1 });
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    const id = spawnZombie(world, "walker", 10, 10);
    expect(applyZombieDamage(world, id, 4, 1, 0, 0.5, "p", "pistol")).toBe(false);
    expect(world.zombies.hp[id]).toBe(6);
    expect(world.zombies.x[id]).toBeCloseTo(10.5, 5);
    expect(applyZombieDamage(world, id, 6, 0, 1, 0.5, "p", "pistol")).toBe(true);
    expect(applyZombieDamage(world, id, 6, 0, 1, 0.5, "p", "pistol")).toBe(false); // already dead
    world.events.flush();
    expect(events.map((e) => e.type)).toEqual(["zombie.hit", "zombie.hit", "zombie.killed"]);
  });

  it("clamps pushback to the map", () => {
    const world = createWorld({ balance: loadBalance(), seed: 1 });
    const id = spawnZombie(world, "walker", 0.4, 10);
    applyZombieDamage(world, id, 1, -1, 0, 5, null, "pistol");
    expect(world.zombies.x[id]).toBeCloseTo(0.35, 5);
  });
});

/**
 * Story 5.4 (FR18, FR-D/FR-E): the friendly-fire table. ONE rule (`damagePlayerBy`); later player
 * sources (5.5 grenades, 5.12 grenades and molotovs) add their rows here.
 */
describe("Story 5.4: friendly-fire table (damagePlayerBy)", () => {
  const balance = loadBalance();
  const PCT = balance.combat.friendlyFire.pct;
  const setup = () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    const a = addPlayer(world, "p0", 10, 10);
    const b = addPlayer(world, "p1", 12, 10);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    return { world, a, b, events };
  };
  const hits = (events: SimEvent[]) => events.filter((e) => e.type === "player.damaged");

  const rows: { name: string; tag: DamageTag; source: "teammate" | "self" | null; amount: number; expected: number }[] = [
    { name: "a teammate's bullet", tag: "bullet", source: "teammate", amount: 20, expected: 0 },
    { name: "a teammate's melee", tag: "melee", source: "teammate", amount: 30, expected: 0 },
    { name: "a teammate's fire (flame pulse)", tag: "fire", source: "teammate", amount: 10, expected: 5 },
    { name: "a teammate's explosion", tag: "explosion", source: "teammate", amount: 40, expected: 20 },
    { name: "my own fire", tag: "fire", source: "self", amount: 10, expected: 5 },
    { name: "my own explosion (grenade/mine)", tag: "explosion", source: "self", amount: 80, expected: 40 },
    { name: "a zombie bite (no source player)", tag: "zombie", source: null, amount: 10, expected: 10 },
    { name: "car fire (4.8, no source player)", tag: "fire", source: null, amount: 5, expected: 5 },
    { name: "acid (5.6, no source player)", tag: "acid", source: null, amount: 2, expected: 2 },
    { name: "an owner-less blast (5.8 Bloater)", tag: "explosion", source: null, amount: 30, expected: 30 },
  ];
  for (const r of rows) {
    it(`${r.name}: ${r.amount} → ${r.expected}`, () => {
      const { world, a, b, events } = setup();
      const src = r.source === "teammate" ? a.id : r.source === "self" ? b.id : null;
      expect(damagePlayerBy(world, b, r.amount, r.tag, src, r.tag === "fire" ? -1 : r.tag === "explosion" ? -2 : r.tag === "acid" ? -3 : 7)).toBe(r.expected);
      world.events.flush();
      expect(b.hp).toBe(100 - r.expected);
      if (r.expected === 0) expect(hits(events)).toEqual([]); // bullets and melee: nothing at all
      else expect(hits(events)).toEqual([{ type: "player.damaged", playerId: "p1", amount: r.expected, sourceZombieId: expect.any(Number), tag: r.tag, sourcePlayerId: src }]);
    });
  }

  it(`the share is combat.json friendlyFire.pct (${PCT} %) and rounds per hit`, () => {
    const { world, b } = setup();
    expect(damagePlayerBy(world, b, 8.75, "fire", "p0")).toBe(Math.round((8.75 * PCT) / 100)); // a level-IV flame pulse: 4.375 → 4
  });

  it("downed and out players take nothing; god mode spares everyone", () => {
    const { world, b, events } = setup();
    b.status = "downed";
    expect(damagePlayerBy(world, b, 50, "fire", "p0")).toBe(0);
    b.status = "out";
    expect(damagePlayerBy(world, b, 50, "zombie", null, 3)).toBe(0);
    b.status = "alive";
    world.debug.godMode = true;
    expect(damagePlayerBy(world, b, 50, "zombie", null, 3)).toBe(0);
    world.events.flush();
    expect(hits(events)).toEqual([]);
  });

  it("D1 (canDown): friendly fire downs a teammate at 0 HP (the normal 2.8 downed rules)", () => {
    const { world, b, events } = setup();
    b.hp = 5;
    expect(damagePlayerBy(world, b, 10, "fire", "p0", -1)).toBe(5);
    world.events.flush();
    expect(b.status).toBe("downed");
    expect(events.map((e) => e.type)).toContain("player.downed");
  });

  it("canDown false: friendly fire stops at 1 HP (the alternative, behind the switch)", () => {
    const b2 = loadBalance(withOverrides(bundledBalanceFiles(), [["combat", "friendlyFire.canDown", false as unknown as number]]));
    const world = createWorld({ balance: b2, seed: 1, systems: { waves: () => {} } });
    addPlayer(world, "p0", 10, 10);
    const b = addPlayer(world, "p1", 12, 10);
    b.hp = 3;
    expect(damagePlayerBy(world, b, 10, "fire", "p0")).toBe(2);
    expect(b.hp).toBe(1);
    expect(damagePlayerBy(world, b, 10, "fire", "p0")).toBe(0);
    expect(b.status).toBe("alive");
    expect(damagePlayerBy(world, b, 10, "zombie", null, 1)).toBe(1); // zombies still down them
    expect(b.status).toBe("downed");
  });

  it("5.9 row: an owned mine's blast hurts its owner and teammates through this rule (80 → 40)", () => {
    const { world, a, b } = setup();
    a.x = 20;
    a.y = 16;
    b.x = 21;
    b.y = 16;
    explode(world, { ...createExplosionSpec(), x: 20.5, y: 16, radiusM: 2.5, zombieDamage: 80, playerDamage: 80, kind: "mine", sourcePlayerId: "p0", weapon: "mine", buildingId: 1 });
    expect(a.hp).toBe(60);
    expect(b.hp).toBe(60);
  });

  it("5.8 row: friendlyFire false (the Bloater blast) bypasses the share: the full amount even when a player popped it", () => {
    const { world, a, b } = setup();
    a.x = 20;
    a.y = 16;
    b.x = 21;
    b.y = 16;
    explode(world, { ...createExplosionSpec(), x: 20.5, y: 16, radiusM: 2.5, zombieDamage: 30, playerDamage: 30, friendlyFire: false, kind: "bloater", sourcePlayerId: "p0", weapon: "bloater" });
    expect(a.hp).toBe(70);
    expect(b.hp).toBe(70);
  });
});
