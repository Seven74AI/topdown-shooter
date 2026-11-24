import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { circleOverlapsBox, segmentHitsBox } from "../buildings/collision";
import { ticksFor } from "../core/time";
import { createWorld, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import type { PlayerState } from "../player/player";
import { spawnZombie, isZombieAlive } from "../zombies/zombiePool";
import { BOSS_ATTACK, BOSS_STATE } from "./bossState";
import { bossGapTicks, inSlamZone, startBossAttack, telegraphTicks } from "./telegraph";
import { collect, placeBoss, tickN } from "./testBoss";

/**
 * Story 6.5: the slam and the telegraph framework (F2, F4, F5, F6, F8, F9; DD3, DD5). The boss is
 * placed walking with no gap; a player inside `slam.triggerM` makes it slam on the next tick.
 */
const balance = loadBalance();
const S = balance.boss.slam;
const GRACE = balance.boss.edgeGraceM;
const NO_WAVES = { waves: () => {} };
const TELE = ticksFor(S.telegraphS);

function setup(map?: typeof DOWNTOWN_MAP) {
  const w = createWorld({ balance, seed: 3, systems: NO_WAVES, ...(map ? { map } : {}) });
  const ev = collect(w);
  return { w, ev };
}

/** Starts a slam centred on the boss at (bx, by) by a trigger player; returns the start tick. */
function slamAt(w: World, bx: number, by: number): number {
  placeBoss(w, bx, by);
  tickN(w); // the trigger player is within 4 m: the telegraph starts this tick
  expect(w.boss.state).toBe(BOSS_STATE.TELEGRAPH);
  return w.boss.attack.startTick;
}

/** A player held at a fixed spot (no input: it only moves when pushed). */
function stand(w: World, id: string, x: number, y: number): PlayerState {
  return addPlayer(w, id, x, y);
}

describe("Story 6.5 slam (FR34, FR84; F2)", () => {
  it("telegraph 1.2 s = 24 ticks, ring 4.5 m, fixed at the start; the boss stands still", () => {
    const { w, ev } = setup();
    stand(w, "p0", 24 + 3, 16);
    const start = slamAt(w, 24, 16);
    expect(TELE).toBe(24);
    const tele = ev.find((e) => e.type === "boss.telegraph");
    expect(tele).toMatchObject({ kind: BOSS_ATTACK.SLAM, startTick: start, hitTick: start + 24, cx: 24, cy: 16, radiusM: 4.5 });
    for (let t = 0; t < TELE - 1; t++) {
      tickN(w);
      expect(w.boss.x).toBe(24);
      expect(w.boss.y).toBe(16);
      expect(ev.some((e) => e.type === "boss.slammed")).toBe(false);
    }
    tickN(w);
    const slammed = ev.filter((e) => e.type === "boss.slammed");
    expect(slammed).toHaveLength(1); // resolves once, on the tick the telegraph ends
    expect(w.tick - 1).toBe(start + 24);
  });

  it("edge grace: 4.24 m hit, 4.26 m never (360° in 5° steps)", () => {
    for (let deg = 0; deg < 360; deg += 5) {
      for (const [dist, hit] of [
        [S.radiusM - GRACE - 0.01, true],
        [S.radiusM - GRACE + 0.01, false],
      ] as const) {
        const { w, ev } = setup();
        const a = (deg * Math.PI) / 180;
        stand(w, "trigger", 24 + 0.5, 16 + 3.0); // within 4 m: starts it (and is hit; not the subject)
        const p = stand(w, "p0", 24 + Math.cos(a) * dist, 16 + Math.sin(a) * dist);
        slamAt(w, 24, 16);
        // Move the subject back to its spot every tick (the trigger's body push is not under test).
        for (let t = 0; t < TELE; t++) {
          p.x = 24 + Math.cos(a) * dist;
          p.y = 16 + Math.sin(a) * dist;
          tickN(w);
        }
        const got = ev.some((e) => e.type === "player.damaged" && e.playerId === "p0" && e.tag === "boss");
        expect(got, `${deg}° ${dist}`).toBe(hit);
      }
    }
  });

  it("inSlamZone reads the attack's fixed zone, never the boss's live position (DD3)", () => {
    const { w } = setup();
    stand(w, "p0", 26, 16);
    slamAt(w, 24, 16);
    w.boss.x = 40; // can't happen (it stands still), but the zone must not follow
    expect(inSlamZone(w, 26, 16)).toBe(true);
    expect(inSlamZone(w, 40, 16)).toBe(false);
  });

  it("F2/F4: who stands inside on the hit tick by the newest server position; stepping out on the last tick is safe", () => {
    const { w, ev } = setup();
    const p = stand(w, "p0", 26, 16);
    slamAt(w, 24, 16);
    tickN(w, TELE - 1);
    p.x = 24 + S.radiusM - GRACE + 0.02; // the last tick before the hit: just out
    tickN(w);
    expect(ev.some((e) => e.type === "player.damaged" && e.playerId === "p0")).toBe(false);
  });

  it("40 damage, pushed 2 m straight out over 4 ticks", () => {
    const { w, ev } = setup();
    const p = stand(w, "p0", 26, 16);
    slamAt(w, 24, 16);
    tickN(w, TELE);
    expect(ev.filter((e) => e.type === "player.damaged" && e.playerId === "p0").map((e) => (e.type === "player.damaged" ? e.amount : 0))).toEqual([40]);
    expect(p.hp).toBe(balance.player.maxHp - 40);
    const x0 = p.x;
    tickN(w, ticksFor(S.pushS));
    expect(p.x - x0).toBeCloseTo(S.pushM, 2);
    expect(p.y).toBeCloseTo(16, 3);
    expect(p.knockStepMm).toBe(500);
  });

  it("F8: walls, cars, barricades and turrets inside the ring shield no one", () => {
    // A metal barricade between the boss and the player.
    const { w, ev } = setup();
    addBuildingAt(w, { id: 1, type: "metal_barricade", ownerId: "p0", gx: 26 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 1, hp: 600 });
    stand(w, "p0", 27.5, 16);
    slamAt(w, 24, 16);
    tickN(w, TELE);
    expect(ev.some((e) => e.type === "player.damaged" && e.playerId === "p0" && e.tag === "boss")).toBe(true);
    // Downtown: a player behind a parked car (shot cover) from the boss.
    const d = setup(DOWNTOWN_MAP);
    const car = d.w.obstacles.shotBlockers.find((s) => s.name === "curb_car_west_n"); // 12–16.5 × 12–14, open street round it
    if (!car) throw new Error("no car");
    // The boss west of the car's top half, the player south of it: the line crosses the car's west face.
    const R = balance.boss.radiusM;
    const bx = car.minX - R - 0.05;
    const by = car.minY + 0.3;
    const q = stand(d.w, "p0", car.minX + 1.0, car.maxY + 0.45);
    expect(segmentHitsBox(bx, by, q.x - bx, q.y - by, car.minX, car.minY, car.maxX, car.maxY)).toBe(true); // the car is between them
    expect(Math.hypot(q.x - bx, q.y - by)).toBeLessThan(S.radiusM - GRACE);
    slamAt(d.w, bx, by);
    tickN(d.w, TELE);
    expect(d.ev.some((e) => e.type === "player.damaged" && e.playerId === "p0" && e.tag === "boss")).toBe(true);
  });

  it("the push stops at a barricade face and the map edge (never inside a box)", () => {
    const { w } = setup();
    addBuildingAt(w, { id: 1, type: "metal_barricade", ownerId: "p0", gx: 27.5 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 1, hp: 600 });
    const p = stand(w, "p0", 26.5, 16);
    slamAt(w, 24, 16);
    tickN(w, TELE + ticksFor(S.pushS) + 2);
    const b = w.buildings.list[0];
    if (!b) throw new Error("no barricade");
    expect(circleOverlapsBox(p.x, p.y, p.radiusM - 1e-6, b.minX, b.minY, b.maxX, b.maxY)).toBe(false);
    expect(p.x).toBeLessThanOrEqual(27.5 - p.radiusM + 1e-6);
    // Map edge.
    const e = setup();
    const q = stand(e.w, "p0", 47 - 0.6, 16);
    slamAt(e.w, 44.5, 16);
    tickN(e.w, TELE + ticksFor(S.pushS) + 2);
    expect(q.x).toBeLessThanOrEqual(48 - q.radiusM + 1e-9);
  });

  it("F9: a downed player inside the ring is never hit (nor pushed); a player downed by the hit is not hit again", () => {
    const { w, ev } = setup();
    stand(w, "trigger", 24, 19); // starts it
    const d = stand(w, "p0", 26, 16);
    d.status = "downed";
    slamAt(w, 24, 16);
    tickN(w, TELE + 5);
    expect(ev.some((e) => e.type === "player.damaged" && e.playerId === "p0")).toBe(false);
    expect(d.x).toBe(26);
    const low = setup();
    const p = stand(low.w, "p0", 26, 16);
    p.hp = 10;
    slamAt(low.w, 24, 16);
    tickN(low.w, TELE + ticksFor(S.recoverS) + bossGapTicks(low.w) + 4 * 20);
    expect(p.status).not.toBe("alive");
    expect(low.ev.filter((e) => e.type === "player.damaged" && e.playerId === "p0")).toHaveLength(1);
  });

  it("D5: zombies whose centre is inside the ring take 40 (no money); a Bloater bursts", () => {
    const { w, ev } = setup();
    const p = stand(w, "p0", 26, 16);
    const walker = spawnZombie(w, "walker", 24, 19.5);
    const far = spawnZombie(w, "walker", 24, 23.5);
    w.zombies.state.fill(0);
    const wallet = p.wallet;
    slamAt(w, 24, 16);
    tickN(w, TELE);
    expect(isZombieAlive(w.zombies, walker)).toBe(false);
    expect(isZombieAlive(w.zombies, far)).toBe(true);
    const kill = ev.find((e) => e.type === "zombie.killed" && e.zombieId === walker);
    expect(kill).toMatchObject({ killerId: null, weapon: "boss" });
    tickN(w, 2);
    expect(p.wallet).toBe(wallet);
  });
});

describe("Story 6.5 F5 / F6: one thing at a time; the warning never gets shorter", () => {
  it("one attack at a time, then recovery 0.8 s, then the gap by player count", () => {
    for (const players of [1, 2, 3, 4]) {
      const { w, ev } = setup();
      for (let i = 0; i < players; i++) stand(w, `p${i}`, 26 + i * 0.01, 16 + (i % 2) * 0.5);
      w.debug.godMode = true;
      const start = slamAt(w, 24, 16);
      expect(startBossAttack(w, BOSS_ATTACK.SLAM, { cx: 0, cy: 0, radiusM: 1 })).toBe(false); // one at a time
      let next = -1;
      for (let t = 0; t < 400 && next < 0; t++) {
        tickN(w);
        expect(w.boss.state === BOSS_STATE.TELEGRAPH ? w.boss.attack.startTick : start).toBe(start === w.boss.attack.startTick ? start : w.boss.attack.startTick);
        const teles = ev.filter((e) => e.type === "boss.telegraph");
        if (teles.length > 1) next = (teles[1] as { startTick: number }).startTick;
      }
      const recover = ticksFor(S.recoverS);
      const gap = ticksFor(balance.boss.gapS[players - 1] as number);
      const cooldown = ticksFor(S.cooldownS);
      // The next slam waits for the hit + recovery + gap, and for the slam's own 4 s cooldown from the hit.
      expect(next - (start + TELE)).toBe(Math.max(recover + gap, cooldown));
      expect(bossGapTicks(w)).toBe(gap);
    }
  });

  it("F6: telegraph ticks never change with player count, enrage, Behemoth number or lag", () => {
    for (const players of [1, 2, 3, 4]) {
      for (const enraged of [false, true]) {
        for (const number of [1, 2, 3, 4, 5]) {
          const { w, ev } = setup();
          for (let i = 0; i < players; i++) stand(w, `p${i}`, 26, 16 + i * 0.1);
          placeBoss(w, 24, 16);
          w.boss.enraged = enraged;
          w.boss.number = number;
          expect(telegraphTicks(w, BOSS_ATTACK.SLAM)).toBe(24);
          tickN(w);
          const t = ev.find((e) => e.type === "boss.telegraph");
          if (t?.type !== "boss.telegraph") throw new Error("no telegraph");
          expect(t.hitTick - t.startTick).toBe(24);
        }
      }
    }
  });

  it("never starts before the gap is over or while the cooldown runs", () => {
    const { w } = setup();
    stand(w, "p0", 26, 16);
    placeBoss(w, 24, 16);
    w.boss.gapTicks = 5;
    expect(startBossAttack(w, BOSS_ATTACK.SLAM, { cx: 24, cy: 16, radiusM: 4.5 })).toBe(false);
    w.boss.gapTicks = 0;
    w.boss.cooldown.slam = 3;
    expect(startBossAttack(w, BOSS_ATTACK.SLAM, { cx: 24, cy: 16, radiusM: 4.5 })).toBe(false);
    w.boss.cooldown.slam = 0;
    expect(startBossAttack(w, BOSS_ATTACK.SLAM, { cx: 24, cy: 16, radiusM: 4.5 })).toBe(true);
  });

  it("the first attack waits firstGapS after the arrival", () => {
    const { w, ev } = setup();
    stand(w, "p0", 24, 6);
    w.run.phase = "wave";
    w.boss.state = BOSS_STATE.NONE;
    // Arrive at the placeholder's entry with the player right next to it.
    w.debug.bossWaves = [1];
    w.waves.number = 1;
    w.waves.size = 2;
    w.waves.queued = 0;
    tickN(w); // warning
    const p = w.players.get("p0");
    if (!p) throw new Error("no p0");
    tickN(w, ticksFor(balance.boss.warningS));
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    const arrive = w.tick - 1;
    p.x = w.boss.x + 3;
    p.y = w.boss.y;
    for (let t = 0; t < 60 && !ev.some((e) => e.type === "boss.telegraph"); t++) {
      p.x = w.boss.x + 3;
      p.y = w.boss.y;
      tickN(w);
    }
    const t0 = ev.find((e) => e.type === "boss.telegraph");
    if (t0?.type !== "boss.telegraph") throw new Error("no telegraph");
    expect(t0.startTick - arrive).toBe(ticksFor(balance.boss.firstGapS));
  });
});
