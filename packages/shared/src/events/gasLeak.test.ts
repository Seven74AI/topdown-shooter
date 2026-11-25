import { describe, expect, it } from "vitest";
import type { World } from "../core/world";
import { spawnProjectile } from "../combat/projectilePool";
import { spawnZombie, isZombieAlive } from "../zombies/zombiePool";
import { addPlayer } from "../player/player";
import { EXPLOSION_KINDS } from "../combat/explosion";
import { EVENT_KINDS, EVENT_PHASE } from "./eventState";
import { eventHoldsWave } from "./specialEvents";
import { gasTankArmed, GAS_LEAK_WEAPON } from "./gasLeak";
import { balance, eventWorld, ofType, startNext, tickN } from "./testEvents";
import { placeBoss } from "../boss/testBoss";

/**
 * Story 6.9 (G1–G4, AC 1–3): the gas leak. The tank is at the gas-station zone's centre (34, 5.75 m:
 * between pump A 32.5–34.5 × 3.5–4.5 and pump B 32.5–34.5 × 7–8).
 */
const noZombies = { zombies: () => {} };
const TANK = { x: 34, y: 5.75 };
const cfg = balance.events.gasLeak;
const ticks = (s: number): number => Math.round(s * 20);

function hissWorld(players: [number, number][] = [[24, 16]], systems: object = noZombies) {
  const t = eventWorld({ players, systems });
  t.world.decay.stage = 2; // the gas_leak zone opens at stage 2
  startNext(t.world, "gas_leak");
  tickN(t.world, 1);
  expect(t.world.special.active.kind).toBe(EVENT_KINDS.indexOf("gas_leak"));
  expect(t.world.special.active.phase).toBe(EVENT_PHASE.HISS);
  return t;
}

/** A player bullet (owner `owner`) 1 m west of the tank, flying east into it. */
function shootTank(world: World, owner: string | null, building = 0): void {
  spawnProjectile(world.projectiles, { x: TANK.x - 1, y: TANK.y, dirX: 1, dirY: 0, speedMps: 60, rangeM: 10, damage: 6, pierce: 1, weaponIndex: 0, owner, building, advanceM: 0 });
}

describe("Story 6.9 AC 1: the tank and its gate", () => {
  it("sits at the gas-station zone's centre (D1); the start event carries it; never at stage 1 (the zone opens at 2)", () => {
    const { world, events } = hissWorld();
    expect(world.special.active.x).toBeCloseTo(TANK.x, 6);
    expect(world.special.active.y).toBeCloseTo(TANK.y, 6);
    expect(ofType(events, "event.triggered")[0]).toMatchObject({ kind: "gas_leak", phase: EVENT_PHASE.HISS, x: TANK.x, y: TANK.y });
    const t1 = eventWorld({});
    t1.world.decay.stage = 1;
    startNext(t1.world, "gas_leak");
    tickN(t1.world, 1);
    expect(t1.world.special.active.kind).toBe(-1);
    expect(ofType(t1.events, "event.skipped")).toHaveLength(1);
  });
});

describe("Story 6.9 G4: the timer is honest", () => {
  it("with no shot it blows exactly hissS (200 ticks) after the start, once, credited to nobody; then the event ends", () => {
    const { world, events } = hissWorld();
    const start = world.special.active.startTick;
    tickN(world, ticks(cfg.hissS) + 5);
    expect(world.special.gasLeak.blownTick).toBe(start + ticks(cfg.hissS));
    const booms = ofType(events, "explosion.happened").filter((e) => EXPLOSION_KINDS[e.kind] === "gas_leak");
    expect(booms).toHaveLength(1);
    expect(booms[0]).toMatchObject({ x: TANK.x, y: TANK.y, radiusM: cfg.radiusM, sourcePlayerId: null });
    expect(world.special.log.gasBooms).toBe(1);
    expect(world.special.active.kind).toBe(-1);
    expect(ofType(events, "event.ended")[0]).toMatchObject({ kind: "gas_leak", outcome: "done" });
  });

  it("holds the wave while it hisses (F8), not after the boom", () => {
    const { world } = hissWorld();
    expect(eventHoldsWave(world)).toBe(true);
    tickN(world, ticks(cfg.hissS) - 2);
    expect(eventHoldsWave(world)).toBe(true);
    tickN(world, 4);
    expect(eventHoldsWave(world)).toBe(false);
  });
});

describe("Story 6.9 G3: anyone can light it, but not at once", () => {
  it("a player bullet at 2.95 s passes the tank; at 3.0 s it blows it on that tick, credited to the shooter", () => {
    const { world, events } = hissWorld();
    const phaseTick = world.special.active.phaseTick;
    tickN(world, ticks(cfg.armDelayS) - 1 - (world.tick - phaseTick)); // the next step runs at tick phaseTick + 59
    expect(world.tick - phaseTick).toBe(ticks(cfg.armDelayS) - 1);
    expect(gasTankArmed(world)).toBe(false);
    shootTank(world, "p0");
    tickN(world, 1);
    expect(ofType(events, "explosion.happened")).toHaveLength(0);
    expect(world.special.gasLeak.blownTick).toBe(-1);
    expect(gasTankArmed(world)).toBe(true); // the step at phaseTick + 60
    shootTank(world, "p0");
    const shotTick = world.tick;
    tickN(world, 1);
    expect(world.special.gasLeak.blownTick).toBe(shotTick);
    const booms = ofType(events, "explosion.happened");
    expect(booms).toHaveLength(1);
    expect(booms[0]!.sourcePlayerId).toBe("p0");
    expect(world.special.log.gasShotBy).toBe("p0");
  });

  it("a turret's shot (a building projectile) and an ownerless one never blow it; the timer still does", () => {
    const { world, events } = hissWorld();
    tickN(world, ticks(cfg.armDelayS) + 2);
    shootTank(world, "p0", 1);
    tickN(world, 1);
    shootTank(world, null);
    tickN(world, 1);
    expect(ofType(events, "explosion.happened")).toHaveLength(0);
    tickN(world, ticks(cfg.hissS));
    expect(ofType(events, "explosion.happened")).toHaveLength(1);
  });

  it("two players' bullets on the same tick: one blast, one credit", () => {
    const { world, events } = hissWorld([[24, 16], [24, 18]]);
    tickN(world, ticks(cfg.armDelayS) + 1);
    shootTank(world, "p0");
    shootTank(world, "p1");
    tickN(world, 3);
    const booms = ofType(events, "explosion.happened");
    expect(booms).toHaveLength(1);
    expect(["p0", "p1"]).toContain(booms[0]!.sourcePlayerId);
    expect(world.special.log.gasBooms).toBe(1);
  });
});

describe("Story 6.9 G1 + G2: the ring is the blast; everyone in it takes the full 60", () => {
  const r = balance.player.radiusM;
  function boomWith(spots: [number, number][], downed: number[] = []) {
    const t = hissWorld(spots);
    for (const i of downed) t.players[i]!.status = "downed";
    tickN(t.world, ticks(cfg.hissS) + 1);
    expect(t.world.special.log.gasBooms).toBe(1);
    return t;
  }

  it("a body overlapping the 6 m circle by 1 cm is hit for 60; clear by 1 cm is not (east, open forecourt)", () => {
    const { players } = boomWith([
      [TANK.x + cfg.radiusM + r - 0.01, TANK.y],
      [TANK.x - cfg.radiusM - r + 0.01, TANK.y],
    ]);
    expect(players[0]!.hp).toBe(balance.player.maxHp - cfg.playerDamage);
    expect(players[1]!.hp).toBe(balance.player.maxHp - cfg.playerDamage);
    const out = boomWith([
      [TANK.x + cfg.radiusM + r + 0.01, TANK.y],
      [TANK.x - cfg.radiusM - r - 0.01, TANK.y],
    ]);
    expect(out.players[0]!.hp).toBe(balance.player.maxHp);
    expect(out.players[1]!.hp).toBe(balance.player.maxHp);
  });

  it("the pumps shield (map boxes: the normal blast line of sight), so does the kiosk; the open forecourt doesn't", () => {
    // (33.6, 1.2): the tank → it crosses pump A; (33.6, 10.3): crosses pump B; (37, 5.75): open.
    const { players } = boomWith([
      [33.6, 1.2],
      [33.6, 10.3],
      [37, TANK.y],
    ]);
    expect(players[0]!.hp).toBe(balance.player.maxHp);
    expect(players[1]!.hp).toBe(balance.player.maxHp);
    expect(players[2]!.hp).toBe(balance.player.maxHp - cfg.playerDamage);
  });

  it("all four standing players in it take 60 when one of them shot it (no friendly-fire share); a downed one inside is unharmed", () => {
    const t = hissWorld([
      [37, TANK.y],
      [30, TANK.y],
      [36, 5.2],
      [36.5, 9.5], // downed, inside the ring, out of every teammate's revive reach
    ]);
    t.players[3]!.status = "downed";
    tickN(t.world, ticks(cfg.armDelayS) + 1);
    shootTank(t.world, "p0");
    tickN(t.world, 2);
    expect(t.world.special.log.gasBooms).toBe(1);
    for (let i = 0; i < 3; i++) expect(t.players[i]!.hp).toBe(balance.player.maxHp - cfg.playerDamage);
    expect(ofType(t.events, "player.damaged").filter((e) => e.playerId === "p3")).toHaveLength(0);
  });

  it("every zombie in it dies (a Brute too, D3), credited to the shooter with the gas-leak weapon (D4); one outside lives", () => {
    const t = eventWorld({ players: [[24, 16]], systems: noZombies });
    t.world.decay.stage = 2;
    const walker = spawnZombie(t.world, "walker", 37, TANK.y, true);
    const brute = spawnZombie(t.world, "brute", 30.5, TANK.y, true);
    const far = spawnZombie(t.world, "walker", 34, 14, true);
    startNext(t.world, "gas_leak");
    tickN(t.world, ticks(cfg.armDelayS) + 2);
    shootTank(t.world, "p0");
    tickN(t.world, 1);
    expect(isZombieAlive(t.world.zombies, walker)).toBe(false);
    expect(isZombieAlive(t.world.zombies, brute)).toBe(false);
    expect(isZombieAlive(t.world.zombies, far)).toBe(true);
    const kills = ofType(t.events, "zombie.killed");
    expect(kills.length).toBeGreaterThanOrEqual(2);
    for (const k of kills.filter((k) => k.zombieId === walker || k.zombieId === brute)) {
      expect(k.killerId).toBe("p0");
      expect(k.weapon).toBe(GAS_LEAK_WEAPON);
    }
    expect(t.world.special.log.gasKills).toBeGreaterThanOrEqual(2);
  });

  it("blown by itself: kills credit nobody", () => {
    const t = eventWorld({ players: [[24, 16]], systems: noZombies });
    t.world.decay.stage = 2;
    spawnZombie(t.world, "walker", 37, TANK.y, true);
    startNext(t.world, "gas_leak");
    tickN(t.world, ticks(cfg.hissS) + 2);
    const kills = ofType(t.events, "zombie.killed");
    expect(kills).toHaveLength(1);
    expect(kills[0]!.killerId).toBeNull();
  });

  it("a player who joins mid-hiss inside the ring is hit too (the rule is the ring, not who was there at the start)", () => {
    const t = hissWorld();
    tickN(t.world, 10);
    const late = addPlayer(t.world, "p9", 37, TANK.y);
    tickN(t.world, ticks(cfg.hissS));
    expect(late.hp).toBe(balance.player.maxHp - cfg.playerDamage);
  });
});

describe("Story 6.9 review L4 / L5", () => {
  it("L4: a Behemoth in the ring takes gasLeak.bossDamage (150), never the zombies' kill damage", () => {
    const t = eventWorld({ players: [[24, 16]], systems: noZombies });
    t.world.decay.stage = 2;
    placeBoss(t.world, 38.5, TANK.y);
    t.world.boss.gapTicks = 10_000;
    const hp0 = t.world.boss.hp;
    startNext(t.world, "gas_leak");
    tickN(t.world, ticks(cfg.armDelayS) + 2);
    shootTank(t.world, "p0");
    tickN(t.world, 1);
    expect(t.world.special.log.gasBooms).toBe(1);
    expect(hp0 - t.world.boss.hp).toBe(cfg.bossDamage);
    expect(cfg.bossDamage).toBe(150);
  });

  it("L5: the bullet that blows the tank stops at the tank (a piercing round goes no further)", () => {
    const { world } = hissWorld();
    tickN(world, ticks(cfg.armDelayS) + 1);
    spawnProjectile(world.projectiles, { x: TANK.x - 1, y: TANK.y, dirX: 1, dirY: 0, speedMps: 60, rangeM: 20, damage: 6, pierce: 5, weaponIndex: 0, owner: "p0", building: 0, advanceM: 0 });
    tickN(world, 1);
    expect(world.special.log.gasBooms).toBe(1);
    expect(world.projectiles.aliveCount).toBe(0);
  });
});
