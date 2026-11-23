import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { ticksFor } from "../core/time";
import { createWorld, step, type World } from "../core/world";
import type { SimEvent } from "../core/simEvents";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { circleInAcid, spawnSpit } from "../zombies/spit";
import { startBuild } from "../run/runStateMachine";
import { AREA_KIND, spawnArea } from "./areaPool";

/**
 * Story 5.6: acid puddles (AC 4, F4, F5, AC 15, DD4). One mechanic per test: no wave director;
 * puddles are placed straight into the pool (the spit tests cover how they get there).
 */
const NO_WAVES = { waves: () => {} };
const balance = loadBalance();
const spit = balance.zombies.types.spitter?.spit;
if (!spit) throw new Error("no spit");
const PULSE = ticksFor(spit.puddlePulseS); // 8
const PER_PULSE = spit.puddleDamagePerS * spit.puddlePulseS; // 2
const R = spit.puddleRadiusM;

function puddle(w: World, x: number, y: number, id = 1): number {
  return spawnArea(w.areas, balance.zombies.spitCaps.maxLivePuddles, AREA_KIND.ACID, id, x, y, R, 10_000, w.tick);
}

function acidHits(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  w.events.subscribe((e) => {
    if (e.type === "player.damaged" && e.sourceZombieId === -3) out.push(e);
  });
  return out;
}

const tick = (w: World, n = 1) => {
  for (let i = 0; i < n; i++) step(w, TICK_DT_S);
};

describe("acid puddles (Story 5.6 F4: standing in acid always hurts at 5/s)", () => {
  it("5 damage per second of exposure (2 every 0.4 s)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const p = addPlayer(w, "p0", 20, 16);
    puddle(w, 20, 16);
    const hits = acidHits(w);
    tick(w, 20 * 4); // 4 s
    expect(PULSE).toBe(8);
    expect(hits).toHaveLength(10);
    expect(hits.every((e) => e.type === "player.damaged" && e.amount === PER_PULSE)).toBe(true);
    expect(p.hp).toBe(balance.player.maxHp - 20);
  });

  it("in 7 ticks, out 1, repeat: still 5/s of exposure (F4: stepping out dodges nothing)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const p = addPlayer(w, "p0", 20, 16);
    puddle(w, 20, 16);
    const hits = acidHits(w);
    let inside = 0;
    for (let t = 0; t < 20 * 8; t++) {
      const out = t % 8 === 7;
      p.x = out ? 25 : 20;
      if (!out) inside++;
      tick(w);
    }
    expect(hits).toHaveLength(Math.floor(inside / PULSE)); // 140 ticks inside → 17 hits
    expect(hits.length).toBe(17);
  });

  it("two overlapping puddles don't stack", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "p0", 20, 16);
    puddle(w, 20, 16, 1);
    puddle(w, 20.3, 16, 2);
    const hits = acidHits(w);
    tick(w, 40);
    expect(hits).toHaveLength(5);
  });

  it("touching the edge ring counts, 1 cm outside doesn't (strict overlap, the ring the client draws)", () => {
    const pr = balance.player.radiusM;
    for (const [gap, hurt] of [
      [-0.001, true],
      [0.01, false],
    ] as const) {
      const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
      addPlayer(w, "p0", 20 + R + pr + gap, 16);
      puddle(w, 20, 16);
      const hits = acidHits(w);
      tick(w, PULSE);
      expect(hits.length > 0, `gap ${gap}`).toBe(hurt);
      expect(circleInAcid(w, 20 + R + pr + gap, 16, pr)).toBe(hurt);
    }
  });

  it("downed and out players are untouched (F5); a reviver standing in acid is hurt", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const d = addPlayer(w, "down", 20, 16);
    d.status = "downed";
    d.downedTicksLeft = 10_000;
    d.hp = 0;
    const o = addPlayer(w, "out", 20.2, 16);
    o.status = "out";
    const r = addPlayer(w, "reviver", 21, 16);
    puddle(w, 20, 16);
    const hits = acidHits(w);
    tick(w, 40);
    expect(hits.length).toBeGreaterThanOrEqual(5);
    expect(hits.every((e) => e.type === "player.damaged" && e.playerId === "reviver")).toBe(true);
    expect(r.hp).toBeLessThan(balance.player.maxHp);
    // The spit flies over the downed player too.
    const w2 = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const d2 = addPlayer(w2, "down", 22, 16);
    d2.status = "downed";
    d2.downedTicksLeft = 10_000;
    const hits2 = acidHits(w2);
    spawnSpit(w2, 0, 18, 16, 26, 16, 0.35, spit);
    tick(w2, 30);
    expect(hits2).toHaveLength(0);
  });

  it("zombies, buildings and turrets take no acid", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "p0", 40, 30).hp = 1e9;
    const z = spawnZombie(w, "walker", 20, 16);
    addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 38, gy: 32, rot: 0, hp: 200 });
    addBuildingAt(w, { id: 2, type: "auto_turret", ownerId: "p0", gx: 41, gy: 30, rot: 0, hp: 300 });
    puddle(w, 20, 16, 1);
    puddle(w, 19.5, 16.2, 2);
    puddle(w, 21, 15.5, 3);
    const hp0 = w.zombies.hp[z];
    for (let i = 0; i < 40; i++) {
      w.zombies.x[z] = 20;
      w.zombies.y[z] = 16;
      tick(w);
    }
    expect(w.zombies.hp[z]).toBe(hp0);
    expect(w.buildings.list.map((b) => b.hp)).toEqual([200, 300]);
  });

  it("a puddle ends after 3 s (60 ticks)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "p0", 40, 16).hp = 1e9;
    const ev: SimEvent[] = [];
    w.events.subscribe((e) => ev.push(e));
    spawnSpit(w, 0, 10, 16, 12, 16, 0.35, spit); // lands at once-ish (1.55 m)
    let born = -1;
    let gone = -1;
    for (let t = 0; t < 200; t++) {
      tick(w);
      if (born < 0 && w.areas.count > 0) born = w.tick;
      if (born >= 0 && gone < 0 && w.areas.count === 0) gone = w.tick;
    }
    expect(gone - born).toBe(ticksFor(spit.puddleS));
  });

  it("a build start clears puddles and spits and resets every acid clock (DD4)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const p = addPlayer(w, "p0", 20, 16);
    puddle(w, 20, 16);
    spawnSpit(w, 0, 5, 5, 5, 10, 0.35, spit);
    tick(w, 5);
    expect(p.acidTicks).toBe(5);
    startBuild(w);
    expect([w.areas.count, w.spits.count, p.acidTicks]).toEqual([0, 0, 0]);
  });

  it("cap replaces the oldest puddle (32 live at most)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    for (let i = 0; i < 32; i++) {
      w.tick = i;
      puddle(w, 1 + i, 1, 100 + i);
    }
    w.tick = 40;
    puddle(w, 30, 30, 999);
    expect(w.areas.count).toBe(32);
    const ids = Array.from(w.areas.id).sort((a, b) => a - b);
    expect(ids).not.toContain(100); // the oldest went
    expect(ids).toContain(999);
    expect(ids).toContain(101);
  });
});
