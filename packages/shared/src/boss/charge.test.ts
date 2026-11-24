import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { ticksFor } from "../core/time";
import { createWorld, type World } from "../core/world";
import { changeDecayStage } from "../decay/decaySystem";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { addPlayer, type PlayerState } from "../player/player";
import { isZombieAlive, spawnZombie } from "../zombies/zombiePool";
import { BOSS_ATTACK, BOSS_STATE } from "./bossState";
import { applyBossDamage } from "./bossDamage";
import { chargeLane, sweepChargeLane } from "./charge";
import { bossStats, telegraphTicks } from "./telegraph";
import { collect, placeBoss, tickN } from "./testBoss";

/**
 * Story 6.6 (F1–F6, F10; AC 2–4, 9): the charge. The boss is placed walking with no gap and the slam
 * parked unless a test needs it; its target (most threat) stands 5–12 m away so the next tick starts
 * the charge telegraph.
 */
const balance = loadBalance();
const C = balance.boss.charge;
const R = balance.boss.radiusM;
const GRACE = balance.boss.edgeGraceM;
const HALF = C.laneWidthM / 2 - GRACE; // 2.15 m
const TELE = ticksFor(C.telegraphS);
const NO_WAVES = { waves: () => {} };

function setup(map?: typeof DOWNTOWN_MAP, stage = 1) {
  const w = createWorld({ balance, seed: 6, systems: NO_WAVES, ...(map ? { map } : {}) });
  if (stage > 1) changeDecayStage(w, stage);
  const ev = collect(w);
  return { w, ev };
}

/** Places the boss at (bx, by), its target at (tx, ty), and ticks once: the charge telegraph starts. */
function chargeAt(w: World, bx: number, by: number, tx: number, ty: number, targetId = "target"): PlayerState {
  const t = w.players.get(targetId) ?? addPlayer(w, targetId, tx, ty);
  t.x = tx;
  t.y = ty;
  placeBoss(w, bx, by);
  w.boss.cooldown.slam = 1e9;
  w.boss.cooldown.throw = 1e9;
  w.boss.targetId = targetId;
  w.boss.lastSwitchTick = w.tick;
  tickN(w);
  expect(w.boss.state, "the charge telegraph started").toBe(BOSS_STATE.TELEGRAPH);
  expect(w.boss.attack.kind).toBe(BOSS_ATTACK.CHARGE);
  return t;
}

/** Reference sweep (independent of `sweepChargeLane`: 1 cm steps, every box listed): the first box name or "edge" its body touches along the lane, and the clear length. */
function referenceSweep(w: World, x: number, y: number, dx: number, dy: number, maxM: number): { len: number; hit: string } {
  for (let cm = 0; cm <= maxM * 100; cm++) {
    const cx = x + (dx * cm) / 100;
    const cy = y + (dy * cm) / 100;
    if (cx - R < 0 || cy - R < 0 || cx + R > w.map.widthM || cy + R > w.map.heightM) return { len: (cm - 1) / 100, hit: "edge" };
    for (const s of w.obstacles.solids) if (circleOverlapsBox(cx, cy, R, s.minX, s.minY, s.maxX, s.maxY)) return { len: (cm - 1) / 100, hit: s.name };
  }
  return { len: maxM, hit: "" };
}

/** A start 5 m in front of one face of `box` (anywhere along it) whose reference sweep first touches that box; null if none works. */
function approach(w: World, box: MapBox): { x: number; y: number; dx: number; dy: number } | null {
  const opts: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const fx = box.minX + (box.maxX - box.minX) * t;
    const fy = box.minY + (box.maxY - box.minY) * t;
    opts.push({ x: box.minX - R - 5, y: fy, dx: 1, dy: 0 }, { x: box.maxX + R + 5, y: fy, dx: -1, dy: 0 }, { x: fx, y: box.minY - R - 5, dx: 0, dy: 1 }, { x: fx, y: box.maxY + R + 5, dx: 0, dy: -1 });
  }
  for (const o of opts) {
    const ref = referenceSweep(w, o.x, o.y, o.dx, o.dy, C.distM);
    if (ref.hit === box.name && ref.len > 4) return o;
  }
  return null;
}

describe("Story 6.6 charge numbers (AC 1, 3)", () => {
  it("telegraph 1.0 s = 20 ticks; rush 12 m/s = 0.6 m per tick; 10 m takes 17 ticks", () => {
    expect(TELE).toBe(20);
    expect(telegraphTicks(createWorld({ balance, seed: 1 }), BOSS_ATTACK.CHARGE)).toBe(20);
    expect(C.speedMps / 20).toBeCloseTo(0.6, 9);
    expect(Math.ceil(C.distM / 0.6)).toBe(17);
    expect(HALF).toBeCloseTo(2.15, 9);
  });
});

describe("Story 6.6 the lane sweep (F1, F2, AC 2)", () => {
  it("in the open: 10 m, no crash", () => {
    const { w } = setup();
    sweepChargeLane(w, 10, 16, 1, 0);
    expect(chargeLane).toEqual({ lenM: 10, crash: false });
  });

  it("the map edge crashes it: the lane ends where its body meets the edge", () => {
    const { w } = setup();
    sweepChargeLane(w, 40, 16, 1, 0);
    expect(chargeLane.crash).toBe(true);
    expect(chargeLane.lenM).toBeCloseTo(48 - R - 40, 6); // 6 m
  });

  it("every map solid crashes it at its face (the bus, a car, a building wall, a pump, the parking wall, sandbags, a police barrier)", () => {
    // Stage 1 boxes, then stage 3 for sandbags and the police barrier.
    const names1 = ["city_bus", "curb_car_west_n", "nw_apartments", "gas_pump_a", "parking_wall", "sw_diner", "street_car_east"];
    const names3 = ["sandbags_south", "police_line_lot"];
    for (const [stage, names] of [
      [1, names1],
      [3, names3],
    ] as const) {
      const { w } = setup(DOWNTOWN_MAP, stage);
      for (const name of names) {
        const box = w.obstacles.solids.find((s) => s.name === name);
        expect(box, name).toBeDefined();
        const a = approach(w, box as MapBox);
        expect(a, `${name}: a clear 6 m approach`).not.toBeNull();
        if (!a) continue;
        const ref = referenceSweep(w, a.x, a.y, a.dx, a.dy, C.distM);
        sweepChargeLane(w, a.x, a.y, a.dx, a.dy);
        expect(chargeLane.crash, name).toBe(true);
        // The sweep's step is 0.1 m: it stops at the last clear step (never inside the box).
        expect(chargeLane.lenM, name).toBeLessThanOrEqual(ref.len + 1e-9);
        expect(chargeLane.lenM, name).toBeGreaterThan(ref.len - C.sweepStepM - 1e-9);
      }
    }
  });

  it("rubble (Story 6.2's `rubble_*` boxes) crashes it like any map solid: the sweep reads the generic solids list", () => {
    const { w } = setup();
    const rubble: MapBox = { name: "rubble_pile_test", minX: 30, minY: 14, maxX: 32, maxY: 18 } as MapBox;
    (w.obstacles.solids as MapBox[]).push(rubble);
    sweepChargeLane(w, 20, 16, 1, 0);
    expect(chargeLane.crash).toBe(true);
    expect(chargeLane.lenM).toBeCloseTo(30 - R - 20, 6);
  });

  it("player buildings never shorten the lane or crash it (F2, F6)", () => {
    const { w } = setup();
    addBuildingAt(w, { id: 1, type: "metal_barricade", ownerId: "x", gx: 26 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 1, hp: 600 });
    addBuildingAt(w, { id: 2, type: "auto_turret", ownerId: "x", gx: 28 / BUILD_GRID_M, gy: 16 / BUILD_GRID_M, rot: 0, hp: 200 });
    sweepChargeLane(w, 20, 16, 1, 0);
    expect(chargeLane).toEqual({ lenM: 10, crash: false });
  });

  it("allocation-free and deterministic: the same lane every time", () => {
    const { w } = setup(DOWNTOWN_MAP);
    const out = { lenM: 0, crash: false };
    sweepChargeLane(w, 24, 21, -0.6, 0.8, out);
    const first = { ...out };
    for (let i = 0; i < 5; i++) sweepChargeLane(w, 24, 21, -0.6, 0.8, out);
    expect(out).toEqual(first);
  });
});

describe("Story 6.6 the charge (F1, F3, F4, F6, F10; AC 3)", () => {
  it("F1: the lane is fixed at the start toward the target's position then (no lead); the target moving changes nothing", () => {
    const { w, ev } = setup();
    const t = chargeAt(w, 14, 16, 22, 16);
    const tele = ev.find((e) => e.type === "boss.telegraph");
    expect(tele).toMatchObject({ kind: BOSS_ATTACK.CHARGE, cx: 14, cy: 16, endX: 24, endY: 16, crash: false });
    expect((tele as { hitTick: number; startTick: number }).hitTick - (tele as { startTick: number }).startTick).toBe(20);
    t.y = 26; // runs away sideways during the telegraph
    for (let i = 0; i < TELE; i++) {
      tickN(w);
      if (w.boss.state === BOSS_STATE.TELEGRAPH) expect(w.boss.x).toBe(14); // stands
    }
    // The rush follows the fixed lane, never the target.
    let maxDy = 0;
    for (let i = 0; i < 25; i++) {
      tickN(w);
      maxDy = Math.max(maxDy, Math.abs(w.boss.y - 16));
    }
    expect(maxDy).toBe(0);
    expect(w.boss.x).toBeCloseTo(24, 6);
  });

  it("the rush moves 0.6 m per tick and stops exactly at the lane's end; a clean lane recovers 1 s (no stun)", () => {
    const { w, ev } = setup();
    chargeAt(w, 14, 16, 22, 16);
    tickN(w, TELE - 1);
    const xs: number[] = [];
    for (let i = 0; i < 18; i++) {
      tickN(w);
      xs.push(w.boss.x);
    }
    expect(xs[0]).toBeCloseTo(14.6, 6); // first step on the hit tick
    expect(xs[1]).toBeCloseTo(15.2, 6);
    expect(xs[16]).toBeCloseTo(24, 6); // 17th tick: the end (10 m)
    expect(xs[17]).toBeCloseTo(24, 6);
    expect(w.boss.state).toBe(BOSS_STATE.RECOVER);
    expect(ev.some((e) => e.type === "boss.crashed")).toBe(false);
  });

  it("F3: edge grace — 2.14 m from the travel line is hit, 2.16 m never (lanes 0°–345° in 15° steps; the subject sits between two rush steps)", () => {
    for (let deg = 0; deg < 360; deg += 15) {
      for (const [perp, hit] of [
        [HALF - 0.01, true],
        [HALF + 0.01, false],
      ] as const) {
        const { w, ev } = setup();
        const a = (deg * Math.PI) / 180;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const bx = 24 - dx * 4;
        const by = 16 - dy * 4;
        // 5.3 m along (between the 4.8 and 5.4 m rush samples: a point test would miss it), `perp` to the side.
        const sx = bx + dx * 5.3 - dy * perp;
        const sy = by + dy * 5.3 + dx * perp;
        const s = addPlayer(w, "subject", sx, sy);
        chargeAt(w, bx, by, bx + dx * 9, by + dy * 9);
        for (let i = 0; i < TELE + 20; i++) {
          if (i < TELE) {
            s.x = sx;
            s.y = sy;
          }
          tickN(w);
        }
        const got = ev.some((e) => e.type === "player.damaged" && e.playerId === "subject" && e.tag === "boss");
        expect(got, `${deg}° perp ${perp}`).toBe(hit);
      }
    }
  });

  it("F3: inside the drawn length only — a player beyond the lane's end (behind a CRASH bar) is never hit", () => {
    const { w, ev } = setup(DOWNTOWN_MAP);
    const bus = w.obstacles.solids.find((s) => s.name === "city_bus") as MapBox;
    const y = (bus.minY + bus.maxY) / 2;
    // Charge east into the bus's west face; a survivor stands on the bus's far side, on the line.
    const bx = bus.minX - R - 6;
    addPlayer(w, "behind", bus.maxX + 0.5, y);
    chargeAt(w, bx, y, bx + 8, y);
    expect(w.boss.attack.crash).toBe(true);
    tickN(w, TELE + 20);
    expect(ev.some((e) => e.type === "player.damaged" && e.playerId === "behind")).toBe(false);
  });

  it("F4: once per charge — 30 damage once even if you stay in the lane; shoved 2.5 m sideways (never along)", () => {
    const { w, ev } = setup();
    const s = addPlayer(w, "subject", 18, 16.3); // 0.3 m left of the line
    chargeAt(w, 12, 16, 21, 16);
    tickN(w, TELE - 1);
    let hitAt = -1;
    let along0 = 0;
    for (let i = 0; i < 20; i++) {
      tickN(w);
      const n = ev.filter((e) => e.type === "player.damaged" && e.playerId === "subject").length;
      if (n === 1 && hitAt < 0) {
        hitAt = i;
        along0 = s.x;
        expect(s.knockTicks).toBeGreaterThan(0);
        expect(s.knockDx).toBe(0); // sideways: no x component
        expect(s.knockDy).toBe(127); // +y side (the side it stood on)
        expect(s.knockStepMm).toBe(Math.round((C.shoveM * 1000) / ticksFor(C.shoveS)));
      }
    }
    expect(hitAt).toBeGreaterThanOrEqual(0);
    const dmg = ev.filter((e) => e.type === "player.damaged" && e.playerId === "subject");
    expect(dmg.map((e) => (e.type === "player.damaged" ? e.amount : 0))).toEqual([30]);
    expect(Math.abs(s.x - along0)).toBeLessThan(1e-6); // never carried along the lane
    expect(s.y).toBeGreaterThan(16.3 + C.shoveM - 0.01);
  });

  it("F4: a survivor held in the lane all rush long is still hit only once", () => {
    const { w, ev } = setup();
    const s = addPlayer(w, "subject", 18, 16);
    chargeAt(w, 12, 16, 21, 16);
    for (let i = 0; i < TELE + 20; i++) {
      tickN(w);
      s.x = w.boss.x + 2.6; // keeps running ahead in the lane (it catches them)
      s.y = 16;
      s.knockTicks = 0;
    }
    expect(ev.filter((e) => e.type === "player.damaged" && e.playerId === "subject")).toHaveLength(1);
  });

  it("F4: once per CHARGE — the next charge hits the same survivor again (the hit set is per charge)", () => {
    const { w, ev } = setup();
    const s = addPlayer(w, "subject", 18, 16.3);
    w.debug.godMode = false;
    for (let k = 0; k < 2; k++) {
      s.x = 18;
      s.y = 16.3;
      s.knockTicks = 0;
      w.boss.cooldown.charge = 0; // the next charge at once
      chargeAt(w, 12, 16, 21, 16);
      tickN(w, TELE + 20);
    }
    expect(ev.filter((e) => e.type === "player.damaged" && e.playerId === "subject")).toHaveLength(2);
  });

  it("review L1: a survivor without a player slot (a dev room, a failed claim) is still hit at most once per charge", () => {
    const { w, ev } = setup();
    const s = addPlayer(w, "slotless", 18, 16);
    const slot = w.flameSlots.indexOf("slotless");
    if (slot >= 0) w.flameSlots[slot] = null; // no slot: bossSlotOf → −1
    chargeAt(w, 12, 16, 21, 16);
    for (let i = 0; i < TELE + 20; i++) {
      tickN(w);
      s.x = w.boss.x + 2.6; // held in front of the rush all along
      s.y = 16;
      s.knockTicks = 0;
    }
    expect(ev.filter((e) => e.type === "player.damaged" && e.playerId === "slotless")).toHaveLength(1);
  });

  it("the sideways shove stops at a barricade face (never inside a box) and a direction tie goes to +1", () => {
    const { w } = setup();
    // A metal barricade 1.5 m to the +y side of a survivor standing on the line.
    addBuildingAt(w, { id: 1, type: "metal_barricade", ownerId: "x", gx: 17 / BUILD_GRID_M, gy: 19.5 / BUILD_GRID_M, rot: 0, hp: 600 });
    const bar = w.buildings.list[0];
    if (!bar) throw new Error("no barricade");
    const s = addPlayer(w, "subject", 18, 16); // exactly on the line: sign(0) = +1 → +y
    chargeAt(w, 12, 16, 21, 16);
    tickN(w, TELE + 20);
    expect(s.y).toBeGreaterThan(16);
    expect(circleOverlapsBox(s.x, s.y, s.radiusM - 1e-6, bar.minX, bar.minY, bar.maxX, bar.maxY)).toBe(false);
  });

  it("F10: a downed or out survivor in the lane is never hit or shoved", () => {
    for (const status of ["downed", "out"] as const) {
      const { w, ev } = setup();
      const s = addPlayer(w, "subject", 18, 16.5);
      s.status = status;
      chargeAt(w, 12, 16, 21, 16);
      tickN(w, TELE + 20);
      expect(ev.some((e) => e.type === "player.damaged" && e.playerId === "subject")).toBe(false);
      expect(s.knockTicks).toBe(0);
    }
  });

  it("F6 / D2: every player building it touches is destroyed (walls, turret, trap, mine — the mine never goes off), no refund", () => {
    const { w, ev } = setup();
    addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "target", gx: 16 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 1, hp: 100 });
    addBuildingAt(w, { id: 2, type: "metal_barricade", ownerId: "target", gx: 18 / BUILD_GRID_M, gy: 17 / BUILD_GRID_M, rot: 1, hp: 600 });
    addBuildingAt(w, { id: 3, type: "auto_turret", ownerId: "target", gx: 20 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 0, hp: 200 });
    addBuildingAt(w, { id: 4, type: "spike_trap", ownerId: "target", gx: 21 / BUILD_GRID_M, gy: 15.5 / BUILD_GRID_M, rot: 0, hp: 100 });
    addBuildingAt(w, { id: 5, type: "mine", ownerId: "target", gx: 15 / BUILD_GRID_M, gy: 16 / BUILD_GRID_M, rot: 0, hp: 50 });
    expect(w.buildings.list).toHaveLength(5);
    const t = chargeAt(w, 10, 16, 21.5, 16.2);
    const wallet = t.wallet;
    t.x = 30; // the target steps out of the way (the lane is fixed)
    t.y = 28;
    tickN(w, TELE + 20);
    expect(w.buildings.list).toHaveLength(0);
    expect(ev.filter((e) => e.type === "building.destroyed")).toHaveLength(5);
    expect(ev.some((e) => e.type === "mine.exploded" || e.type === "explosion.happened")).toBe(false); // the mine broke without going off
    expect(ev.some((e) => e.type === "money.earned" && e.reason === "refund")).toBe(false);
    expect(t.wallet).toBe(wallet);
    expect(Math.hypot(w.boss.x - 10, w.boss.y - 16)).toBeCloseTo(10, 6); // the lane was not shortened (10 m)
  });

  it("D3: zombies in its path are trampled for 30 (no money), once per charge", () => {
    const { w, ev } = setup();
    const walker = spawnZombie(w, "walker", 17, 16.5);
    const brute = spawnZombie(w, "brute", 19, 15.5);
    const far = spawnZombie(w, "walker", 17, 25);
    w.zombies.state.fill(0);
    const t = chargeAt(w, 12, 16, 21, 16);
    t.y = 28;
    t.x = 40;
    const hp0 = w.zombies.hp[brute] as number;
    tickN(w, TELE + 20);
    expect(isZombieAlive(w.zombies, walker)).toBe(false);
    expect(ev.find((e) => e.type === "zombie.killed" && e.zombieId === walker)).toMatchObject({ killerId: null });
    expect(hp0 - (w.zombies.hp[brute] as number)).toBe(C.zombieDamage); // once
    expect(isZombieAlive(w.zombies, far)).toBe(true);
    expect(ev.some((e) => e.type === "money.earned")).toBe(false);
  });

  it("review N2: a zombie that walks in under the body between two rush steps is trampled too — once per charge", () => {
    const { w } = setup();
    const z = spawnZombie(w, "brute", 30, 30);
    w.zombies.state.fill(0);
    const t = chargeAt(w, 12, 16, 21, 16);
    t.x = 40;
    t.y = 28;
    const hp0 = w.zombies.hp[z] as number;
    tickN(w, TELE + 4); // 4 rush steps in (body centre ≈ 14.4 m)
    // It steps in under the body, behind the front (already inside the last step's circle).
    w.zombies.x[z] = w.boss.x - 0.3;
    w.zombies.y[z] = 16.5;
    for (let i = 0; i < 20; i++) {
      tickN(w);
      if (i < 3) {
        w.zombies.x[z] = w.boss.x - 0.3; // and keeps walking with it
        w.zombies.y[z] = 16.5;
      }
    }
    expect(hp0 - (w.zombies.hp[z] as number)).toBe(C.zombieDamage);
  });

  it("F2 + F5: into the bus — the CRASH mark is in the telegraph, it stops at the face, stuns 2 s (40 ticks), cannot attack, then walks after its gap", () => {
    const { w, ev } = setup(DOWNTOWN_MAP);
    const bus = w.obstacles.solids.find((s) => s.name === "city_bus") as MapBox;
    const y = (bus.minY + bus.maxY) / 2;
    const bx = bus.minX - R - 6;
    chargeAt(w, bx, y, bx + 8, y);
    const tele = ev.find((e) => e.type === "boss.telegraph");
    expect(tele).toMatchObject({ crash: true });
    tickN(w, TELE + 10); // 6 m = 10 rush ticks
    expect(w.boss.state).toBe(BOSS_STATE.STUN);
    const crashed = ev.filter((e) => e.type === "boss.crashed");
    expect(crashed).toHaveLength(1);
    expect(circleOverlapsBox(w.boss.x, w.boss.y, R - 1e-6, bus.minX, bus.minY, bus.maxX, bus.maxY)).toBe(false);
    expect(w.boss.x).toBeGreaterThan(bus.minX - R - C.sweepStepM - 1e-9);
    // Stunned: a survivor walks right up to it — no slam, no turn, no move.
    const tg = w.players.get("target") as PlayerState;
    w.boss.cooldown.slam = 0;
    const x0 = w.boss.x;
    const f0 = w.boss.facing;
    let stunTicks = 0;
    while (w.boss.state === BOSS_STATE.STUN) {
      tg.x = w.boss.x - 3;
      tg.y = y;
      stunTicks++;
      tickN(w);
      expect(w.boss.x).toBe(x0);
      expect(w.boss.facing).toBe(f0);
    }
    expect(stunTicks + 1).toBe(ticksFor(C.stunS)); // 40 ticks in STUN, the crash tick included
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    expect(ev.filter((e) => e.type === "boss.telegraph")).toHaveLength(1); // nothing started while stunned
    expect(w.boss.gapTicks).toBeGreaterThan(0);
  });

  it("F2: no CRASH mark means it never crashes (a clean 10 m lane ends in RECOVER)", () => {
    const { w, ev } = setup();
    chargeAt(w, 12, 16, 20, 16);
    expect(ev.find((e) => e.type === "boss.telegraph")).toMatchObject({ crash: false });
    tickN(w, TELE + 20);
    expect(ev.some((e) => e.type === "boss.crashed")).toBe(false);
  });

  it("F5: × 1.5 from every source while stunned (bullets, melee, flames, explosions, turrets, mines), × 1 otherwise", () => {
    for (const weapon of ["pistol", "machete", "flamethrower", "grenade", "auto_turret", "mine"]) {
      const { w } = setup();
      placeBoss(w, 24, 16, 1000);
      expect(applyBossDamage(w, 10, null, weapon)).toBe(10);
      w.boss.state = BOSS_STATE.STUN;
      expect(applyBossDamage(w, 10, null, weapon)).toBe(10 * C.stunDamageMult);
      expect(w.boss.hp).toBe(1000 - 10 - 15);
    }
  });

  it("cooldown 7 s from the hit tick (the rush start); the lane must be ≥ 4 m (a short lane: no charge)", () => {
    const { w } = setup();
    chargeAt(w, 12, 16, 20, 16);
    const hit = w.boss.attack.hitTick;
    tickN(w, TELE);
    expect(w.tick - 1).toBe(hit);
    expect(w.boss.cooldown.charge).toBe(ticksFor(C.cooldownS));
    // A lane under 4 m (the map edge 3 m away): it walks instead.
    const s = setup();
    addPlayer(s.w, "target", 46 - 0.5, 16);
    placeBoss(s.w, 40, 16);
    s.w.boss.cooldown.slam = 1e9;
    s.w.boss.cooldown.throw = 1e9;
    s.w.boss.targetId = "target";
    s.w.boss.lastSwitchTick = s.w.tick;
    // The target 5.1 m east, the map edge 3.5 m east of the body's reach: lane 3.5 m < 4 → no charge.
    s.w.boss.x = 42.5;
    (s.w.players.get("target") as PlayerState).x = 47.6;
    tickN(s.w);
    expect(s.w.boss.state).not.toBe(BOSS_STATE.TELEGRAPH);
  });

  it("liveness: bossStats count charges, crashes, clean charges and hits", () => {
    for (const k of Object.keys(bossStats) as (keyof typeof bossStats)[]) bossStats[k] = 0;
    const { w } = setup();
    addPlayer(w, "s", 18, 16);
    chargeAt(w, 12, 16, 21, 16);
    tickN(w, TELE + 20);
    expect(bossStats.charges).toBe(1);
    expect(bossStats.cleanCharges).toBe(1);
    expect(bossStats.chargePlayerHits).toBeGreaterThanOrEqual(1);
  });
});
