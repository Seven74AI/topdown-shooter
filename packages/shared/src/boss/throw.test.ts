import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { ticksFor } from "../core/time";
import { createWorld, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { addPlayer, type PlayerState } from "../player/player";
import { isZombieAlive, spawnZombie } from "../zombies/zombiePool";
import { BOSS_ATTACK, BOSS_STATE, BOSS_THROW_SRC } from "./bossState";
import { bossCantReach, pickThrowTarget, throwSource } from "./throw";
import { telegraphTicks, windupTicks } from "./telegraph";
import { collect, placeBoss, tickN } from "./testBoss";

/**
 * Story 6.6 (F7, F8, F10, D4, D5, D7; AC 5, 9): the throw. The boss is placed walking with no gap, the
 * slam and the charge parked; a standing player more than 8 m away makes it throw on the next tick.
 */
const balance = loadBalance();
const T = balance.boss.throw;
const GRACE = balance.boss.edgeGraceM;
const LIFT = ticksFor(T.liftS);
const FLIGHT = ticksFor(T.flightS);
const NO_WAVES = { waves: () => {} };

function setup(map?: typeof DOWNTOWN_MAP) {
  const w = createWorld({ balance, seed: 7, systems: NO_WAVES, ...(map ? { map } : {}) });
  const ev = collect(w);
  return { w, ev };
}

function throwFrom(w: World, bx: number, by: number): void {
  placeBoss(w, bx, by);
  w.boss.cooldown.slam = 1e9;
  w.boss.cooldown.charge = 1e9;
  tickN(w);
  expect(w.boss.state, "the throw's lift started").toBe(BOSS_STATE.TELEGRAPH);
  expect(w.boss.attack.kind).toBe(BOSS_ATTACK.THROW);
}

const damageOf = (ev: ReturnType<typeof collect>, id: string): number[] =>
  ev.filter((e) => e.type === "player.damaged" && e.playerId === id && e.tag === "boss").map((e) => (e.type === "player.damaged" ? e.amount : 0));

describe("Story 6.6 throw (F7)", () => {
  it("numbers: lift 1.0 s + flight 0.8 s = impact 36 ticks after the start; ring 3 m, 35 damage", () => {
    const w = createWorld({ balance, seed: 1 });
    expect(LIFT).toBe(20);
    expect(FLIGHT).toBe(16);
    expect(telegraphTicks(w, BOSS_ATTACK.THROW)).toBe(36);
    expect(windupTicks(w, BOSS_ATTACK.THROW)).toBe(20);
    expect(T.radiusM).toBe(3);
    expect(T.damage).toBe(35);
  });

  it("aims at the farthest standing player more than 8 m away, at their position at the start", () => {
    const { w, ev } = setup();
    addPlayer(w, "near", 20, 16); // 4 m... out of slam? slam parked
    addPlayer(w, "mid", 24 + 9, 16); // 9 m
    addPlayer(w, "far", 24 - 14, 20); // ~14.6 m
    const downed = addPlayer(w, "downed", 46, 30);
    downed.status = "downed"; // never a target (F10)
    throwFrom(w, 24, 16);
    const tele = ev.find((e) => e.type === "boss.telegraph");
    expect(tele).toMatchObject({ kind: BOSS_ATTACK.THROW, cx: 10, cy: 20, radiusM: 3 });
    expect((tele as { hitTick: number }).hitTick - (tele as { startTick: number }).startTick).toBe(36);
  });

  it("nobody beyond 8 m: no throw (it walks); exactly 8 m: no throw", () => {
    const { w } = setup();
    addPlayer(w, "p", 24 + T.minM, 16);
    placeBoss(w, 24, 16);
    w.boss.cooldown.slam = 1e9;
    w.boss.cooldown.charge = 1e9;
    expect(pickThrowTarget(w)).toBeNull();
    tickN(w);
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
  });

  it("the landing spot is fixed: the target walks 5 m away during the lift and is not hit; impact exactly at start + 36", () => {
    const { w, ev } = setup();
    const p = addPlayer(w, "p", 36, 16);
    throwFrom(w, 24, 16);
    const start = w.boss.attack.startTick;
    for (let i = 0; i < 10; i++) {
      p.x += 0.5;
      tickN(w);
    }
    expect(w.boss.attack.cx).toBe(36);
    let impactTick = -1;
    for (let i = 0; i < 40 && impactTick < 0; i++) {
      tickN(w);
      if (ev.some((e) => e.type === "boss.thrown_impact")) impactTick = w.tick - 1;
    }
    expect(impactTick).toBe(start + 36);
    expect(damageOf(ev, "p")).toEqual([]);
  });

  it("edge grace: 2.74 m from the spot is hit for 35 (no knockback), 2.76 m never (360° in 30° steps)", () => {
    for (let deg = 0; deg < 360; deg += 30) {
      for (const [dist, hit] of [
        [T.radiusM - GRACE - 0.01, true],
        [T.radiusM - GRACE + 0.01, false],
      ] as const) {
        const { w, ev } = setup();
        const p = addPlayer(w, "p", 36, 16);
        throwFrom(w, 24, 16);
        const a = (deg * Math.PI) / 180;
        for (let i = 0; i < LIFT + FLIGHT; i++) {
          p.x = 36 + Math.cos(a) * dist;
          p.y = 16 + Math.sin(a) * dist;
          tickN(w);
        }
        expect(damageOf(ev, "p"), `${deg}° ${dist}`).toEqual(hit ? [35] : []);
        if (hit) expect(p.knockTicks).toBe(0);
      }
    }
  });

  it("the throw ignores cover: a metal barricade, and on Downtown a building between it and the spot, shield no one", () => {
    const { w, ev } = setup();
    addBuildingAt(w, { id: 1, type: "metal_barricade", ownerId: "p", gx: 34 / BUILD_GRID_M, gy: 14 / BUILD_GRID_M, rot: 1, hp: 600 });
    addPlayer(w, "p", 36, 16);
    throwFrom(w, 24, 16);
    tickN(w, LIFT + FLIGHT);
    expect(damageOf(ev, "p")).toEqual([35]);
    // Downtown: the boss in the street south of the bus, the player north of it (the bus between them).
    const d = setup(DOWNTOWN_MAP);
    const bus = d.w.obstacles.solids.find((s) => s.name === "city_bus") as MapBox;
    addPlayer(d.w, "p", 35, bus.minY - 1.5);
    throwFrom(d.w, 35, bus.maxY + 3 + 2.1);
    tickN(d.w, LIFT + FLIGHT);
    expect(damageOf(d.ev, "p")).toEqual([35]);
  });

  it("F8: a throw never changes the map — obstacles, buildings and every nav grid untouched", () => {
    const { w } = setup(DOWNTOWN_MAP);
    addBuildingAt(w, { id: 1, type: "metal_barricade", ownerId: "p", gx: 36 / BUILD_GRID_M, gy: 20 / BUILD_GRID_M, rot: 0, hp: 600 });
    addPlayer(w, "p", 36, 20.5);
    const snap = () => ({
      ov: w.obstacles.version,
      solids: w.obstacles.solids.length,
      bv: w.buildings.version,
      wv: w.buildings.wallVersion,
      hp: w.buildings.list.map((b) => b.hp).join(","),
      nav: Array.from(w.pathing.nav.wallAt).join(""),
      wide: Array.from(w.pathing.wide.wallAt).join(""),
      boss: Array.from(w.pathing.boss.wallAt).join(""),
    });
    const before = snap();
    throwFrom(w, 25, 20.5);
    tickN(w, LIFT + FLIGHT + 2);
    expect(snap()).toEqual(before);
  });

  it("D4: zombies whose centre is inside 3 m take 35 (no money); beyond, nothing", () => {
    const { w, ev } = setup();
    const p = addPlayer(w, "p", 36, 16);
    const inside = spawnZombie(w, "walker", 36, 18.9);
    const outside = spawnZombie(w, "walker", 36, 19.2);
    w.zombies.state.fill(0);
    const wallet = p.wallet;
    throwFrom(w, 24, 16);
    for (let i = 0; i < LIFT + FLIGHT; i++) {
      w.zombies.x[inside] = 36;
      w.zombies.y[inside] = 18.9;
      w.zombies.x[outside] = 36;
      w.zombies.y[outside] = 19.2;
      p.x = 30;
      p.y = 28;
      tickN(w);
    }
    expect(isZombieAlive(w.zombies, inside)).toBe(false);
    expect(ev.find((e) => e.type === "zombie.killed" && e.zombieId === inside)).toMatchObject({ killerId: null });
    expect(isZombieAlive(w.zombies, outside)).toBe(true);
    expect(p.wallet).toBe(wallet);
  });

  it("F10: a downed player on the spot is never hit", () => {
    const { w, ev } = setup();
    const p = addPlayer(w, "p", 36, 16);
    throwFrom(w, 24, 16);
    p.status = "downed";
    tickN(w, LIFT + FLIGHT + 2);
    expect(damageOf(ev, "p")).toEqual([]);
  });

  it("F5 / DD4: one attack at a time — a chunk in flight blocks a slam, even with a survivor in its face", () => {
    const { w, ev } = setup();
    addPlayer(w, "far", 36, 16);
    throwFrom(w, 24, 16);
    w.boss.cooldown.slam = 0;
    tickN(w, LIFT); // released: RECOVER while the chunk flies
    expect(w.boss.state).toBe(BOSS_STATE.RECOVER);
    expect(w.boss.attack.live).toBe(true);
    const near = addPlayer(w, "near", 26, 16); // in slam range
    w.boss.gapTicks = 0;
    for (let i = 0; i < FLIGHT - 1; i++) {
      near.x = w.boss.x + 2;
      near.y = w.boss.y;
      if (w.boss.state === BOSS_STATE.WALK) w.boss.gapTicks = 0; // even with the gap forced over
      tickN(w);
      expect(ev.filter((e) => e.type === "boss.telegraph")).toHaveLength(1);
    }
  });

  it("cooldown 6 s from the release; the boss recovers 0.6 s, then its gap", () => {
    const { w } = setup();
    addPlayer(w, "p", 36, 16);
    throwFrom(w, 24, 16);
    tickN(w, LIFT);
    expect(w.boss.cooldown.throw).toBe(ticksFor(T.cooldownS));
    expect(w.boss.state).toBe(BOSS_STATE.RECOVER);
    tickN(w, ticksFor(T.recoverS));
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    expect(w.boss.gapTicks).toBeGreaterThan(0);
  });
});

describe("Story 6.6 D5: no hiding where it can't walk", () => {
  it("a player standing where its body can't (a wall cell on the boss grid) is thrown at from 4.5 m", () => {
    const { w } = setup(DOWNTOWN_MAP);
    const nav = w.pathing.boss;
    // Find a free player spot that is a wall cell on the boss grid, with an open boss spot 5–7 m away.
    let found: { px: number; py: number; bx: number; by: number } | null = null;
    for (let c = 0; c < nav.cells && !found; c++) {
      if (nav.wallAt[c] === 0) continue;
      const cx = c % nav.cols;
      const cy = (c - cx) / nav.cols;
      const px = (cx + 0.5) * (w.map.widthM / nav.cols);
      const py = (cy + 0.5) * (w.map.heightM / nav.rows);
      if (w.obstacles.solids.some((s) => px > s.minX - 0.5 && px < s.maxX + 0.5 && py > s.minY - 0.5 && py < s.maxY + 0.5)) continue;
      for (let k = 0; k < 16 && !found; k++) {
        const a = (k * Math.PI) / 8;
        const bx = px + Math.cos(a) * 6;
        const by = py + Math.sin(a) * 6;
        if (bx < 2.1 || by < 2.1 || bx > w.map.widthM - 2.1 || by > w.map.heightM - 2.1) continue;
        if (w.obstacles.solids.some((s) => bx > s.minX - 2.1 && bx < s.maxX + 2.1 && by > s.minY - 2.1 && by < s.maxY + 2.1)) continue;
        found = { px, py, bx, by };
      }
    }
    if (!found) throw new Error("no alley spot");
    const p = addPlayer(w, "p", found.px, found.py);
    placeBoss(w, found.bx, found.by);
    expect(bossCantReach(w, p)).toBe(true);
    expect(pickThrowTarget(w)).toBe(p);
    // The same distance in the open: no throw.
    const o = setup();
    const q = addPlayer(o.w, "p", 30, 16);
    placeBoss(o.w, 24, 16);
    expect(bossCantReach(o.w, q)).toBe(false);
    expect(pickThrowTarget(o.w)).toBeNull();
  });
});

describe("Story 6.6 D7: what it throws (looks only)", () => {
  it("the road by default; a burnt car (a lit or burned-out fire slot) within 6 m of its body edge; a rubble box nearer wins", () => {
    const { w } = setup(DOWNTOWN_MAP);
    placeBoss(w, 24, 20);
    expect(throwSource(w).src).toBe(BOSS_THROW_SRC.ROAD);
    const slots = w.decay.fireSlots;
    if (slots.length > 0) {
      const f = slots[0] as (typeof slots)[number];
      w.boss.x = f.x + 2 + 5; // body edge 5 m from the car
      w.boss.y = f.y;
      expect(throwSource(w).src).toBe(BOSS_THROW_SRC.ROAD); // not burnt (never lit)
      w.decay.firesOut |= 1; // burned out
      expect(throwSource(w)).toMatchObject({ src: BOSS_THROW_SRC.CAR, x: f.x, y: f.y });
      (w.obstacles.solids as MapBox[]).push({ name: "rubble_pile_t", minX: w.boss.x + 2.5, minY: w.boss.y - 0.5, maxX: w.boss.x + 3.5, maxY: w.boss.y + 0.5 } as MapBox);
      expect(throwSource(w).src).toBe(BOSS_THROW_SRC.RUBBLE);
    }
  });
});

describe("Story 6.6 pick order (AC 6, F9)", () => {
  type Row = { name: string; players: [number, number][]; cd: [number, number, number]; target?: number; want: number };
  const rows: Row[] = [
    { name: "slam first (player in 4 m), even with a charge and a throw ready", players: [[27, 16], [33, 16], [40, 16]], cd: [0, 0, 0], target: 1, want: BOSS_ATTACK.SLAM },
    { name: "slam on cooldown → charge (target 9 m, open lane)", players: [[27, 16], [33, 16]], cd: [50, 0, 0], target: 1, want: BOSS_ATTACK.CHARGE },
    { name: "charge on cooldown → throw (a player > 8 m)", players: [[33, 16]], cd: [0, 50, 0], target: 0, want: BOSS_ATTACK.THROW },
    { name: "target 13 m (out of charge range) → throw", players: [[37, 16]], cd: [0, 0, 0], target: 0, want: BOSS_ATTACK.THROW },
    { name: "target 4.5 m (under 5 m, out of slam trigger) → nothing (walks)", players: [[28.5, 16]], cd: [0, 0, 0], target: 0, want: BOSS_ATTACK.NONE },
    { name: "target 6 m, nobody beyond 8 m, charge on cooldown → nothing", players: [[30, 16]], cd: [0, 50, 0], target: 0, want: BOSS_ATTACK.NONE },
    { name: "all on cooldown → nothing", players: [[27, 16], [33, 16], [40, 16]], cd: [5, 5, 5], target: 1, want: BOSS_ATTACK.NONE },
    { name: "target 10 m but the lane is 2.5 m (a map box in the way) → throw", players: [[34, 16]], cd: [0, 0, 0], target: 0, want: BOSS_ATTACK.THROW },
  ];
  for (const r of rows) {
    it(r.name, () => {
      const { w } = setup();
      const ps: PlayerState[] = r.players.map(([x, y], i) => addPlayer(w, `p${i}`, x, y));
      if (r.name.includes("map box")) (w.obstacles.solids as MapBox[]).push({ name: "test_box", minX: 28.5, minY: 15, maxX: 29, maxY: 17 } as MapBox);
      placeBoss(w, 24, 16);
      w.boss.cooldown.slam = r.cd[0];
      w.boss.cooldown.charge = r.cd[1];
      w.boss.cooldown.throw = r.cd[2];
      if (r.target !== undefined) {
        w.boss.targetId = (ps[r.target] as PlayerState).id;
        w.boss.lastSwitchTick = w.tick;
      }
      tickN(w);
      const kind = w.boss.state === BOSS_STATE.TELEGRAPH ? w.boss.attack.kind : BOSS_ATTACK.NONE;
      expect(kind).toBe(r.want);
    });
  }

  it("initial cooldowns at arrival: slam 0, charge 2 s, throw 3 s", () => {
    const { w } = setup();
    addPlayer(w, "p0", 24, 30);
    w.run.phase = "wave";
    w.debug.bossWaves = [1];
    w.waves.number = 1;
    w.waves.size = 2;
    w.waves.queued = 0;
    tickN(w);
    tickN(w, ticksFor(balance.boss.warningS));
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    // Set at the arrival tick, then one countdown tick per tick since.
    expect(w.boss.cooldown.slam).toBe(0);
    expect(w.boss.cooldown.charge).toBe(ticksFor(balance.boss.charge.initialCooldownS));
    expect(w.boss.cooldown.throw).toBe(ticksFor(T.initialCooldownS));
  });
});
