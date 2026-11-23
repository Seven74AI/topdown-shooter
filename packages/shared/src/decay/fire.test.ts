import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, type Box, type Building } from "../buildings/buildings";
import { circleOverlapsBox, segmentHitsBuildings } from "../buildings/collision";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, step, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { DecayMutation, DistrictMap, MapBox } from "../map/districtMap";
import { downPlayer } from "../player/downed";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { endRun, skipWave, startBuild, startWave } from "../run/runStateMachine";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { FLOW_UNITS_PER_M, rebuildFlowFieldNow } from "../zombies/flowField";
import { ZOMBIE_TYPES, isWindupState, type ZombieTypeId } from "../zombies/zombieTypes";
import { jitteredSpawn } from "../waves/waveDirector";
import { runHeadless } from "../bots/headlessRun";
import { createInputLog, replayRun } from "../replay/inputLog";
import { applyDecayStage } from "./applyDecayStage";
import { changeDecayStage, relocated } from "./decaySystem";
import { circleInFire, firePulseDamage } from "./fire";

/**
 * Story 4.8: car fires — the stage-3 content, the damage pulse to every target type, the 2-wave
 * expiry on the real build-start path, the flow-field cost ("around, unless there is no other way"),
 * the same seed → the same fires. Liveness in every test (brief line 9).
 */
const balance = loadBalance();
const DT = DOWNTOWN_MAP;
const FIRE = balance.decay.fire;
const noop: SystemFn = () => {};

/** The variant mask of the named candidates (by name: bit positions move when other stories add variants). */
function maskOf(map: DistrictMap, ...variantNames: string[]): number {
  let m = 0;
  for (const n of variantNames) {
    const i = map.decayVariants.findIndex((v) => v.name === n);
    if (i < 0) throw new Error(`no variant ${n}`);
    m |= 1 << i;
  }
  return m >>> 0;
}
const fireNames = (w: World) => w.decay.fires.map((f) => f.target).sort();
const PULSE_TICKS = Math.round(FIRE.pulseS / TICK_DT_S);

describe("Story 4.8 stage 3 content (FR61)", () => {
  it("balance: radius 2 m, 10 damage per second (5 per 0.5 s pulse), 2 waves, a flow cost; the schema refuses fractional pulses", () => {
    expect(FIRE).toEqual({ radiusM: 2, damagePerS: 10, pulseS: 0.5, durationWaves: 2, navCostM: 10 });
    expect(firePulseDamage(createWorld({ balance, seed: 1 }))).toBe(5);
    expect(() => loadBalance(withOverrides(bundledBalanceFiles(), [["decay", "fire.damagePerS", 3]]))).toThrow(/whole number/);
    expect(() => loadBalance(withOverrides(bundledBalanceFiles(), [["decay", "fire.pulseS", 0.07]]))).toThrow(/ticks/);
  });

  it("Downtown: 3 candidate cars, pick 2; every run burns exactly two of them at stage 3, radius from balance; sandbags at stage 3 (4.2)", () => {
    const ignites = DT.decay.filter((m) => m.action === "ignite");
    expect(ignites.map((m) => m.target).sort()).toEqual(["parked_car_1", "parked_car_2", "street_car_west"]);
    for (const m of ignites) expect(DT.decayVariants[m.variant]).toMatchObject({ group: "breakdown_car_fire", pick: 2, stage: 3 });
    expect(DT.cover.find((c) => c.kind === "sandbags")).toMatchObject({ name: "sandbags_south", minStage: 3 });
    const seen = new Set<string>();
    for (let seed = 1; seed <= 64; seed++) {
      const w = createWorld({ balance, seed, map: DT });
      expect(w.decay.fires).toEqual([]);
      applyDecayStage(w, 3, w.decay.variants);
      expect(w.decay.fires, `seed ${seed}`).toHaveLength(2);
      for (const f of w.decay.fires) {
        expect(f.radiusM).toBe(FIRE.radiusM);
        expect(w.obstacles.cover.some((c) => c.name === f.target)).toBe(true); // the car stays solid cover
      }
      expect(w.obstacles.cover.some((c) => c.kind === "sandbags")).toBe(true);
      seen.add(fireNames(w).join("+"));
      // stage 2 has none
      applyDecayStage(w, 2, w.decay.variants);
      expect(w.decay.fires).toEqual([]);
    }
    expect([...seen].sort()).toEqual(["parked_car_1+parked_car_2", "parked_car_1+street_car_west", "parked_car_2+street_car_west"]);
  });

  it("same seed → the same two cars burn (from the decay stream) and the same replay digest through a stage-3 run", () => {
    for (const seed of [3, 17, 40]) {
      const a = createWorld({ balance, seed, map: DT });
      const b = createWorld({ balance, seed, map: DT });
      changeDecayStage(a, 3);
      changeDecayStage(b, 3);
      expect(fireNames(a)).toEqual(fireNames(b));
    }
    // Replay (4.4): a bot run whose first build start enters stage 3 (a balance table, so the recorder
    // and the replay share it): the fires burn from wave 1 and go out at the build start before wave 3.
    const b3 = loadBalance(withOverrides(bundledBalanceFiles(), [0, 1, 2, 3, 4].map((i) => ["decay", `stageByWave.${i}`, 3] as const)));
    const log = createInputLog(21, 2);
    let digest = 0;
    const run = runHeadless({ balance: b3, seed: 21, players: 2, record: log, onEnd: (w) => void (digest = worldDigest(w)) });
    let fireHits = 0;
    const replayed = replayRun(b3, log, {
      afterStart: (w) => {
        expect(w.decay.fires).toHaveLength(2);
        w.events.subscribe((e) => {
          if ((e.type === "player.damaged" && e.sourceZombieId < 0) || (e.type === "zombie.killed" && e.weapon === "fire")) fireHits++;
        });
      },
    });
    expect(worldDigest(replayed)).toBe(digest);
    // Liveness: the fires really burned (the pulse clock ran) and, past wave 2, went out.
    expect(replayed.decay.burnTicks).toBeGreaterThan(20 * 30);
    expect(run.wavesCleared).toBeGreaterThanOrEqual(2);
    expect(replayed.decay.fires).toEqual([]);
    expect(replayed.decay.firesOut).not.toBe(0);
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[fire] replay: ${run.wavesCleared} waves, ${fireHits} fire hits on players/kills`);
    // The digest sees the fire state.
    const before = worldDigest(replayed);
    replayed.decay.burnTicks++;
    expect(worldDigest(replayed)).not.toBe(before);
  }, 120_000);
});

// ---- damage --------------------------------------------------------------------------------------

/** Downtown in a build phase at stage 3 with only `street_car_west` burning (centre 6.25, 14). */
function burningWorld(systems: Partial<Record<string, SystemFn>> = {}) {
  const w = createWorld({ balance, seed: 5, map: DT, systems: { waves: noop, zombies: noop, buildings: noop, combat: noop, ...systems } });
  const at = { x: 0, y: 0 };
  teamSpawnPoint(w, 0, at);
  addPlayer(w, "far", at.x, at.y);
  startBuild(w);
  applyDecayStage(w, 3, maskOf(DT, "fire_street_car_west"));
  expect(fireNames(w)).toEqual(["street_car_west"]);
  const events: SimEvent[] = [];
  w.events.subscribe((e) => events.push(e));
  return { w, events, fire: w.decay.fires[0] as { x: number; y: number; radiusM: number } };
}

/** A lattice spot whose footprint overlaps the zone, clear of boxes, buildings and `avoid` (bodies). */
function placeInFire(w: World, type: string, id: number, fire: { x: number; y: number; radiusM: number }, avoid: Box[]): Building {
  const stats = buildingStats(balance, type);
  if (!stats) throw new Error(type);
  const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  for (let gy = 0; gy < 64; gy++) {
    for (let gx = 0; gx < 96; gx++) {
      footprint(stats, gx, gy, 0, box);
      if (!circleOverlapsBox(fire.x, fire.y, fire.radiusM, box.minX, box.minY, box.maxX, box.maxY)) continue;
      // Clear of solids and other buildings (spawn clearance doesn't matter for damage).
      if (w.obstacles.solids.some((b) => box.minX < b.maxX && box.maxX > b.minX && box.minY < b.maxY && box.maxY > b.minY)) continue;
      if (w.buildings.list.some((b) => box.minX < b.maxX && box.maxX > b.minX && box.minY < b.maxY && box.maxY > b.minY)) continue;
      if (avoid.some((a) => box.minX < a.maxX + 0.5 && box.maxX > a.minX - 0.5 && box.minY < a.maxY + 0.5 && box.maxY > a.minY - 0.5)) continue;
      const b = addBuildingAt(w, { id, type, ownerId: "far", gx, gy, rot: 0, hp: stats.hp });
      if (b) {
        avoid.push({ ...box });
        return b;
      }
    }
  }
  throw new Error(`no spot in the fire for ${type}`);
}

describe("Story 4.8 fire damage: 10 per second to everything inside (FR57, FR53)", () => {
  it("each target type: standing player, downed player (spared), zombie, building, turret; touching the edge is outside", () => {
    const { w, events, fire } = burningWorld();
    const pr = balance.player.radiusM;
    const inside = addPlayer(w, "in", fire.x, fire.y + fire.radiusM + pr - 0.1); // body overlaps by 0.1 m
    const touching = addPlayer(w, "edge", fire.x, fire.y + fire.radiusM + pr + 1e-9); // touching (to float precision): outside
    const downed = addPlayer(w, "down", 5, 12.2); // north of the car, out of every teammate's revive reach
    downPlayer(w, downed);
    const zr = balance.zombies.types.walker?.radiusM ?? 0;
    const zid = spawnZombie(w, "walker", 7, 12.5);
    const avoid: Box[] = [inside, touching, downed].map((p) => ({ minX: p.x - pr, minY: p.y - pr, maxX: p.x + pr, maxY: p.y + pr }));
    avoid.push({ minX: 7 - zr, minY: 12.5 - zr, maxX: 7 + zr, maxY: 12.5 + zr });
    const wood = placeInFire(w, "wood_barricade", 1, fire, avoid);
    const turret = placeInFire(w, "auto_turret", 2, fire, avoid);
    // Preconditions (self-checking positions).
    expect(circleInFire(w.decay.fires, inside.x, inside.y, pr)).toBe(true);
    expect(circleInFire(w.decay.fires, touching.x, touching.y, pr)).toBe(false);
    expect(circleInFire(w.decay.fires, downed.x, downed.y, pr)).toBe(true);
    expect(circleInFire(w.decay.fires, w.zombies.x[zid] as number, w.zombies.y[zid] as number, zr)).toBe(true);
    const zhp = w.zombies.hp[zid] as number;
    const downedTicks = downed.downedTicksLeft;
    // One tick short of the first pulse: nothing yet.
    for (let t = 0; t < PULSE_TICKS - 1; t++) step(w, TICK_DT_S);
    expect(inside.hp).toBe(100);
    step(w, TICK_DT_S); // pulse 1
    expect(inside.hp).toBe(95);
    expect(w.zombies.hp[zid]).toBe(zhp - 5);
    expect(wood.hp).toBe(195);
    expect(turret.hp).toBe(295);
    expect(touching.hp).toBe(100);
    expect(w.players.get("far")?.hp).toBe(100);
    // The downed player is spared and their own countdown runs exactly as without fire.
    expect(downed.hp).toBe(0);
    expect(downed.status).toBe("downed");
    expect(downed.downedTicksLeft).toBe(downedTicks - PULSE_TICKS);
    step(w, TICK_DT_S); // between pulses
    expect(inside.hp).toBe(95);
    for (let t = 0; t < PULSE_TICKS - 1; t++) step(w, TICK_DT_S); // pulse 2 → the 10-HP walker dies
    expect(inside.hp).toBe(90); // 10 per second
    const dmg = events.filter((e): e is Extract<SimEvent, { type: "player.damaged" }> => e.type === "player.damaged");
    expect(dmg.map((e) => [e.playerId, e.amount, e.sourceZombieId])).toEqual([
      ["in", 5, -1],
      ["in", 5, -1],
    ]);
    // A fire kill credits nobody: no killer, weapon "fire", no money, no hit events per pulse.
    const kills = events.filter((e): e is Extract<SimEvent, { type: "zombie.killed" }> => e.type === "zombie.killed");
    expect(kills.map((e) => [e.zombieId, e.killerId, e.weapon])).toEqual([[zid, null, "fire"]]);
    expect(events.some((e) => e.type === "zombie.hit")).toBe(false);
    step(w, TICK_DT_S);
    expect(events.some((e) => e.type === "money.earned")).toBe(false);
    expect(turret.hp).toBe(290);
    expect(wood.hp).toBe(190);
  });

  it("a standing player kept in the fire goes down from it (20 pulses); a building burns down (building.destroyed)", () => {
    const { w, events, fire } = burningWorld();
    const p = addPlayer(w, "in", fire.x, fire.y + fire.radiusM);
    const wood = placeInFire(w, "wood_barricade", 1, fire, [{ minX: p.x - 0.4, minY: p.y - 0.4, maxX: p.x + 0.4, maxY: p.y + 0.4 }]);
    w.run.buildTicksLeft = 1e9; // stay in the build phase
    for (let t = 0; t < 20 * PULSE_TICKS; t++) step(w, TICK_DT_S);
    expect(p.status).toBe("downed");
    expect(events.filter((e) => e.type === "player.downed")).toHaveLength(1);
    for (let t = 0; t < 20 * PULSE_TICKS; t++) step(w, TICK_DT_S); // 200 HP → 40 pulses
    expect(w.buildings.list.some((b) => b.id === wood.id)).toBe(false);
    expect(events.filter((e) => e.type === "building.destroyed").map((e) => (e as { buildingId: number }).buildingId)).toEqual([wood.id]);
  });

  it("overlapping zones don't stack; no damage in the lobby, in Results, after a wipe, or in god mode", () => {
    const w = createWorld({ balance, seed: 5, map: DT, systems: { waves: noop, zombies: noop, buildings: noop, combat: noop } });
    const p = addPlayer(w, "gap", 14, 28.25); // between parked_car_1 and parked_car_2, inside both zones
    applyDecayStage(w, 3, maskOf(DT, "fire_parked_car_1", "fire_parked_car_2"));
    expect(w.decay.fires).toHaveLength(2);
    expect(w.decay.fires.every((f) => Math.hypot(f.x - p.x, f.y - p.y) < f.radiusM + p.radiusM)).toBe(true);
    for (let t = 0; t < 2 * PULSE_TICKS; t++) step(w, TICK_DT_S); // lobby
    expect(p.hp).toBe(100);
    w.run.phase = "wave";
    for (let t = 0; t < 2 * PULSE_TICKS; t++) step(w, TICK_DT_S);
    expect(p.hp).toBe(90); // two pulses of 5, not 2 × 2
    w.debug.godMode = true;
    for (let t = 0; t < PULSE_TICKS; t++) step(w, TICK_DT_S);
    expect(p.hp).toBe(90);
    w.debug.godMode = false;
    endRun(w);
    for (let t = 0; t < 2 * PULSE_TICKS; t++) step(w, TICK_DT_S);
    expect(p.hp).toBe(90);
    w.run.phase = "wave";
    w.teamWiped = true;
    for (let t = 0; t < 2 * PULSE_TICKS; t++) step(w, TICK_DT_S);
    expect(p.hp).toBe(90);
  });
});

// ---- expiry --------------------------------------------------------------------------------------

/** A 10-wave run (past the 5-wave Results) so stages 3 and 4 both happen. */
const LONG = loadBalance(withOverrides(bundledBalanceFiles(), [["waves", "runWaves", 10]]));
function run(seed: number, stageByWave: number[] | null) {
  const w = createWorld({ balance: LONG, seed, map: DT, systems: { waves: noop } });
  w.debug.godMode = true;
  w.debug.decayStageByWave = stageByWave;
  const at = { x: 0, y: 0 };
  for (let slot = 0; slot < 2; slot++) {
    teamSpawnPoint(w, slot, at);
    addPlayer(w, `p${slot}`, at.x, at.y);
  }
  const events: SimEvent[] = [];
  w.events.subscribe((e) => events.push(e));
  startBuild(w);
  return { w, events };
}
/** Wave → cleared → the next build start (the run state machine's own path); returns the fires burning in the wave. */
function nextBuild(w: World): number {
  startWave(w);
  for (let t = 0; t < 5; t++) step(w, TICK_DT_S);
  const burning = w.decay.fires.length;
  skipWave(w);
  step(w, TICK_DT_S);
  return burning;
}

describe("Story 4.8 expiry: a fire burns 2 waves, then goes out at a build start", () => {
  it("the real timeline: lit at the build start before wave 5, burns waves 5 and 6, out at the build start before wave 7", () => {
    const { w, events } = run(7, null);
    const atBuild: number[] = [];
    const inWave: number[] = [];
    for (let coming = 2; coming <= 7; coming++) {
      inWave.push(nextBuild(w));
      expect(w.waves.number + 1).toBe(coming);
      atBuild.push(w.decay.fires.length);
    }
    // build starts before waves 2…7; waves 1…6
    expect(atBuild).toEqual([0, 0, 0, 2, 2, 0]);
    expect(inWave).toEqual([0, 0, 0, 0, 2, 2]);
    expect(w.decay.stage).toBe(4);
    expect(w.decay.firesOut).not.toBe(0);
    // The stage event for stages 2, 3, 4 only, never for the expiry alone.
    expect(events.filter((e) => e.type === "decay.stage_changed").map((e) => (e as { stage: number }).stage)).toEqual([2, 3, 4]);
  });

  it("expiry alone (same stage): out at the build start 2 waves later, nav cost cleared and fields rebuilt then, no banner; visuals follow (obstacles.version)", () => {
    const { w, events } = run(9, [1, 3, 3, 3, 3]);
    nextBuild(w); // → coming wave 2: stage 3, lit
    expect(w.decay.stage).toBe(3);
    expect(w.decay.fires).toHaveLength(2);
    const lit = [...w.decay.fires];
    const cost = Math.round(FIRE.navCostM * FLOW_UNITS_PER_M);
    expect(w.pathing.nav.fireCost.filter((c) => c === cost).length).toBeGreaterThan(20);
    const builtAt = w.pathing.chase.rebuilds;
    nextBuild(w); // → wave 3: still burning (waves 2 and 3)
    expect(w.decay.fires).toEqual(lit);
    const v = w.obstacles.version;
    const n = events.length;
    // → wave 4: out. Checked right at the build start, before any pathing tick could rebuild anything.
    startWave(w);
    for (let t = 0; t < 5; t++) step(w, TICK_DT_S);
    const rebuildsBefore = w.pathing.chase.rebuilds;
    skipWave(w);
    expect(w.pathing.chase.rebuilds).toBe(rebuildsBefore + 1); // the DecaySystem's step 4
    expect(w.decay.fires).toEqual([]);
    expect(w.decay.firesOut).toBe(lit.reduce((m, f) => m | (1 << f.index), 0));
    expect(w.obstacles.version).toBe(v + 1); // the renderer's redraw key
    expect(w.pathing.nav.fireCost.every((c) => c === 0)).toBe(true);
    expect(w.pathing.nav.version).toBe(w.buildings.version); // rasterized at the build start (fields rebuilt)
    expect(w.pathing.chase.rebuilds).toBeGreaterThan(builtAt);
    expect(events.slice(n).some((e) => e.type === "decay.stage_changed")).toBe(false);
    nextBuild(w); // → wave 5: stays out
    expect(w.decay.fires).toEqual([]);
  });

  it("the dev cheat going back forgets the fires; going to stage 3 again lights them for 2 more waves", () => {
    const { w } = run(9, [1, 1, 1, 1, 1, 1]);
    nextBuild(w); // build before wave 2
    expect(changeDecayStage(w, 3)).toBe(true);
    expect(w.decay.fires).toHaveLength(2);
    expect([...w.decay.fireEndWave].filter((e) => e > 0)).toEqual([4, 4]);
    expect(changeDecayStage(w, 2)).toBe(true);
    expect(w.decay.fires).toEqual([]);
    expect(w.decay.firesOut).toBe(0);
    expect([...w.decay.fireEndWave].every((e) => e === 0)).toBe(true);
    expect(changeDecayStage(w, 3)).toBe(true);
    expect(w.decay.fires).toHaveLength(2);
  });
});

// ---- flow field ----------------------------------------------------------------------------------

/** Steps until zombie `id` touches a player; counts its ticks inside a fire. */
function chase(w: World, id: number, limitS: number) {
  const r = balance.zombies.types.walker?.radiusM ?? 0;
  let inFire = 0;
  for (let t = 0; t < limitS * 20; t++) {
    step(w, TICK_DT_S);
    const x = w.zombies.x[id] as number;
    const y = w.zombies.y[id] as number;
    if (circleInFire(w.decay.fires, x, y, r)) inFire++;
    for (const p of w.players.values()) if (Math.hypot(p.x - x, p.y - y) <= r + p.radiusM + 0.05) return { reached: true, inFire, s: t / 20 };
  }
  return { reached: false, inFire, s: limitS };
}

describe("Story 4.8 flow field: fire cells are very costly, not walls", () => {
  it("nav: fire cost on the cells round a burning car, never a wall, cleared when it goes out", () => {
    const w = createWorld({ balance, seed: 2, map: DT });
    applyDecayStage(w, 3, 0); // stage 3 without fires: the walls
    const walls = Array.from(w.pathing.nav.wallAt);
    applyDecayStage(w, 3, maskOf(DT, "fire_street_car_west"));
    const nav = w.pathing.nav;
    expect(Array.from(nav.wallAt)).toEqual(walls); // not a wall
    const cost = Math.round(FIRE.navCostM * FLOW_UNITS_PER_M);
    let n = 0;
    for (let c = 0; c < nav.cells; c++) {
      if (nav.fireCost[c] === 0) continue;
      n++;
      const x = ((c % nav.cols) + 0.5) * nav.cellM;
      const y = (Math.floor(c / nav.cols) + 0.5) * nav.cellM;
      expect(Math.hypot(x - 6.25, y - 14)).toBeLessThan(FIRE.radiusM + 0.35 + 1e-9);
      expect(nav.fireCost[c]).toBe(cost);
    }
    expect(n).toBeGreaterThan(40);
    rebuildFlowFieldNow(w.pathing.chase, nav, w);
    const free = (c: number) => nav.wallAt[c] === 0 && nav.fireCost[c] !== 0;
    for (let c = 0; c < nav.cells; c++) if (free(c)) expect(nav.enterCost[c] as number).toBeGreaterThanOrEqual(cost);
    applyDecayStage(w, 3, maskOf(DT, "fire_street_car_west"), 0xffffffff); // all out
    expect(nav.fireCost.every((c) => c === 0)).toBe(true);
  });

  it("zombies route around a burning car but still reach us (west street: the straight line crosses the fire)", () => {
    for (const withFire of [true, false]) {
      const w = createWorld({ balance, seed: 6, map: DT, systems: { waves: noop } });
      w.debug.godMode = true;
      const p = addPlayer(w, "p0", 12, 14.2);
      startBuild(w);
      startWave(w);
      applyDecayStage(w, 3, withFire ? maskOf(DT, "fire_street_car_west") : 0);
      decayFields(w);
      const id = spawnZombie(w, "walker", 1, 14.2);
      const r = chase(w, id, 40);
      expect(r.reached, `fire ${withFire}`).toBe(true);
      if (withFire) {
        expect(r.inFire).toBe(0); // around it, not through it
        expect(w.zombies.hp[id]).toBe(balance.zombies.types.walker?.hp);
      }
      expect(p.status).toBe("alive");
    }
  });

  it("with no other way, zombies cross the fire (a corridor fully covered by a fire zone)", () => {
    // 48 × 32 m: two blocks leave a 4 m corridor (y 14–18, x 10–30); a pillar in it burns.
    const pillar: MapBox = { name: "pillar", minX: 19.5, minY: 15.5, maxX: 20.5, maxY: 16.5 };
    const ignite: DecayMutation = { ...pillar, name: "pillar_fire", stage: 3, action: "ignite", kind: "", target: "pillar", radiusM: 0, variant: -1 };
    const map: DistrictMap = {
      ...DT,
      name: "corridor",
      solids: [{ name: "top", minX: 10, minY: 0, maxX: 30, maxY: 14 }, { name: "bottom", minX: 10, minY: 18, maxX: 30, maxY: 32 }, pillar],
      cover: [],
      hazards: [],
      decay: [ignite],
      decayVariants: [],
    };
    const w = createWorld({ balance, seed: 6, map, systems: { waves: noop, decayTimers: noop } });
    w.debug.godMode = true;
    addPlayer(w, "p0", 40, 16);
    w.run.phase = "wave";
    applyDecayStage(w, 3, 0);
    expect(w.decay.fires).toHaveLength(1);
    expect(w.decay.fires[0]?.radiusM).toBe(2); // covers the whole corridor width
    decayFields(w);
    const id = spawnZombie(w, "walker", 4, 16);
    const r = chase(w, id, 60);
    expect(r.reached).toBe(true);
    expect(r.inFire).toBeGreaterThan(0); // it went through
  });

  it("player-visible: at stage 3 every zombie type from every spawn open at stage 3 reaches the team, rarely touching fire", () => {
    let total = 0;
    let fireTicks = 0;
    let zombieTicks = 0;
    for (const seed of [4, 12]) {
      const w = createWorld({ balance, seed, map: DT, systems: { waves: noop } });
      w.debug.godMode = true;
      w.debug.decayStageByWave = [3];
      const at = { x: 0, y: 0 };
      for (let slot = 0; slot < 2; slot++) {
        teamSpawnPoint(w, slot, at);
        addPlayer(w, `p${slot}`, at.x, at.y);
      }
      startBuild(w); // the real DecaySystem path into stage 3
      expect(w.decay.fires).toHaveLength(2);
      startWave(w);
      // Story 5.7: two batches — the 0.35 m types, then the Brutes. In one crowd a 1.0 m/s Brute shoves
      // a 0.7 m/s Crawler ahead of it (it takes 80 % of their overlap) and once pushed one into the
      // street_west fire (seed 12: 1 of 95); that is the crowd, not the pathing, which this checks.
      const batches: (readonly ZombieTypeId[])[] = [ZOMBIE_TYPES.filter((t) => t !== "brute"), ["brute"]];
      let spawnedCount = 0;
      for (const batch of batches) {
        const spawned: number[] = [];
        const out = { x: 0, y: 0 };
        for (const sp of DT.spawnPoints) {
          for (const type of batch) {
            jitteredSpawn(w, sp, 0, balance.zombies.types[type]?.radiusM ?? 0, out);
            spawned.push(spawnZombie(w, type, out.x, out.y));
          }
        }
        const reached = new Set<number>();
        for (let t = 0; t < 20 * 90 && reached.size < spawned.length; t++) {
          step(w, TICK_DT_S);
          const z = w.zombies;
          for (const id of spawned) {
            if (reached.has(id) || z.alivePos[id] === -1) continue;
            const x = z.x[id] as number;
            const y = z.y[id] as number;
            zombieTicks++;
            if (isWindupState(z.state[id] as number)) reached.add(id); // Story 5.6: a Spitter "reaches" us when it winds up (in range, clear line)
            if (circleInFire(w.decay.fires, x, y, 0.35)) fireTicks++;
            for (const p of w.players.values()) if (Math.hypot(p.x - x, p.y - y) <= 3 && !segmentHitsBuildings(w, x, y, p.x, p.y, 0)) reached.add(id);
          }
          // Story 5.7: a zombie that reached us leaves (killed), so the crowd round the team never fills the 3 m
          // circle: with a 1.2 m Brute per spawn the bodies no longer fit, and late arrivals would stay outside it.
          for (const id of reached) if (z.alivePos[id] !== -1) killZombie(w, id, null, "cheat"); // Story 5.8: removed, not killed (a Bloater would burst)
        }
        expect(spawned.length).toBe(DT.spawnPoints.length * batch.length);
        expect(reached.size, `seed ${seed}: ${spawned.filter((id) => !reached.has(id)).map((id) => `${w.zombies.type[id]}@${(w.zombies.x[id] as number).toFixed(2)},${(w.zombies.y[id] as number).toFixed(2)} alive ${w.zombies.alivePos[id]}`).join(" ")}`).toBe(spawned.length);
        spawnedCount += spawned.length;
      }
      expect(spawnedCount).toBe(DT.spawnPoints.length * ZOMBIE_TYPES.length);
      total += spawnedCount;
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[fire] stage 3: ${total} zombies reached the team; ${fireTicks} of ${zombieTicks} zombie-ticks in fire`);
    expect(fireTicks / zombieTicks).toBeLessThan(0.01);
  }, 120_000);
});

/** Fields as the build start leaves them (the DecaySystem's step 4). */
function decayFields(w: World): void {
  rebuildFlowFieldNow(w.pathing.chase, w.pathing.nav, w);
  rebuildFlowFieldNow(w.pathing.flank, w.pathing.nav, w);
}

// ---- review fixes ---------------------------------------------------------------------------------

describe("Story 4.8 review fixes", () => {
  /** A one-player run whose first build start enters stage 3 with street_car_west and parked_car_1 burning. */
  function stage3Start(place: (w: World) => void) {
    const w = createWorld({ balance, seed: 5, map: DT });
    w.debug.decayStageByWave = [3, 3, 3, 3, 3];
    w.decay.variants = (w.decay.variants & ~maskOf(DT, "fire_parked_car_2")) | maskOf(DT, "fire_street_car_west", "fire_parked_car_1");
    place(w);
    const events: SimEvent[] = [];
    w.events.subscribe((e) => events.push(e));
    startBuild(w);
    expect(fireNames(w)).toEqual(["parked_car_1", "street_car_west"]);
    return { w, events };
  }

  it("M1: a player idle against street_car_west at the stage-3 build start is moved just outside the zone, never burns, and the solo run doesn't end in the build phase", () => {
    const car = DT.cover.find((c) => c.name === "street_car_west") as MapBox;
    const { w, events } = stage3Start((w) => void addPlayer(w, "solo", (car.minX + car.maxX) / 2, car.minY - balance.player.radiusM - 0.01));
    const p = w.players.get("solo");
    if (!p) throw new Error("solo");
    const f = w.decay.fires.find((g) => g.target === "street_car_west") as { x: number; y: number; radiusM: number };
    expect(relocated.outOfFire).toBe(1);
    expect(circleInFire(w.decay.fires, p.x, p.y, p.radiusM)).toBe(false);
    expect(Math.hypot(p.x - f.x, p.y - f.y)).toBeCloseTo(f.radiusM + p.radiusM, 4); // to radius + body radius
    // Idle through the whole build phase: no fire damage, and the wave starts (no wipe).
    const ticks = w.run.buildTicksLeft + 5;
    for (let t = 0; t < ticks && w.run.phase === "build"; t++) step(w, TICK_DT_S);
    expect(events.filter((e) => e.type === "player.damaged")).toEqual([]);
    expect(p.hp).toBe(p.maxHp);
    expect(w.run.phase).toBe("wave");
    expect(w.teamWiped).toBe(false);
  });

  it("M1: a downed player in a newly lit zone stays where they are (fire spares them)", () => {
    const car = DT.cover.find((c) => c.name === "street_car_west") as MapBox;
    const at = { x: 0, y: 0 };
    const { w } = stage3Start((w) => {
      teamSpawnPoint(w, 0, at);
      addPlayer(w, "up", at.x, at.y);
      const d = addPlayer(w, "down", (car.minX + car.maxX) / 2, car.minY - 0.5);
      downPlayer(w, d);
    });
    // returnOutPlayers brings downed players back at a build start: the downed one is now standing by "up".
    const d = w.players.get("down");
    expect(d?.status).toBe("alive");
    expect(relocated.outOfFire).toBe(0); // the fire step ran before the return and left the downed body alone
  });

  it("M2: at ignition, a building overlapping a new zone is destroyed with a 50 % refund (same path as blocked cells); one placed into the fire later burns", () => {
    const wood = buildingStats(balance, "wood_barricade");
    if (!wood) throw new Error("wood");
    let placed: Building | null = null;
    const { w, events } = stage3Start((w) => {
      addPlayer(w, "far", 24, 16); // the builder (placeInFire builds for "far")
      placed = placeInFire(w, "wood_barricade", 1, { x: 6.25, y: 14, radiusM: FIRE.radiusM }, []);
    });
    expect(placed).not.toBeNull();
    expect(w.buildings.list).toEqual([]);
    step(w, TICK_DT_S); // deliver the build start's events
    expect(events.filter((e) => e.type === "building.destroyed").map((e) => (e as { buildingId: number }).buildingId)).toEqual([1]);
    const refunds = events.filter((e): e is Extract<SimEvent, { type: "money.earned" }> => e.type === "money.earned" && e.reason === "refund");
    expect(refunds.map((e) => [e.playerId, e.amount])).toEqual([["far", Math.floor(wood.price * balance.decay.buildingRefundShare)]]);
    // Placed into the fire afterwards: no refund, it burns (D6).
    const later = placeInFire(w, "wood_barricade", 2, w.decay.fires.find((g) => g.target === "street_car_west") as FireRecordLike, []);
    for (let t = 0; t < PULSE_TICKS; t++) step(w, TICK_DT_S);
    expect(later.hp).toBe(wood.hp - 5);
    expect(events.filter((e) => e.type === "money.earned" && e.reason === "refund")).toHaveLength(1);
  });

  it("L4: stepping out on every pulse tick doesn't dodge: 360 of 400 ticks in fire = 36 hits (the body's own burn clock)", () => {
    const { w, events, fire } = burningWorld();
    const p = addPlayer(w, "dodger", fire.x, fire.y + fire.radiusM + 0.2);
    p.maxHp = p.hp = 1000;
    const inY = p.y;
    const outY = fire.y + fire.radiusM + p.radiusM + 0.5;
    let inside = 0;
    for (let t = 0; t < 400; t++) {
      const out = t % 10 === 9; // out exactly on the 10th tick of every cycle (the old shared pulse tick)
      p.y = p.prevY = out ? outY : inY;
      if (!out) inside++;
      step(w, TICK_DT_S);
    }
    expect(inside).toBe(360);
    const hits = events.filter((e) => e.type === "player.damaged" && e.playerId === "dodger");
    expect(hits).toHaveLength(36);
    expect(p.hp).toBe(1000 - 36 * 5);
  });

  it("L4: a body's first hit comes one pulse after it enters, whatever the world clock says", () => {
    const { w, events, fire } = burningWorld();
    for (let t = 0; t < 3; t++) step(w, TICK_DT_S); // off the old shared phase
    const p = addPlayer(w, "late", fire.x, fire.y + fire.radiusM + 0.2);
    for (let t = 0; t < PULSE_TICKS - 1; t++) step(w, TICK_DT_S);
    expect(p.hp).toBe(100);
    step(w, TICK_DT_S);
    expect(p.hp).toBe(95);
    expect(events.filter((e) => e.type === "player.damaged")).toHaveLength(1);
  });

  it("mutation C: a zombie killed by fire while others burn — every burning zombie takes its hit that tick", () => {
    const { w, events } = burningWorld();
    const spots: [number, number][] = [
      [7, 12.5],
      [5.5, 12.5],
      [6.25, 15.6],
      [5.0, 15.6],
    ];
    const ids = spots.map(([x, y]) => spawnZombie(w, "walker", x, y));
    for (const id of ids) {
      expect(circleInFire(w.decay.fires, w.zombies.x[id] as number, w.zombies.y[id] as number, 0.35)).toBe(true);
      w.zombies.hp[id] = 100;
    }
    w.zombies.hp[ids[0] as number] = 5; // dies on its first hit, mid-list
    w.zombies.hp[ids[1] as number] = 5;
    for (let t = 0; t < PULSE_TICKS; t++) step(w, TICK_DT_S);
    expect(events.filter((e) => e.type === "zombie.killed").map((e) => (e as { zombieId: number }).zombieId).sort()).toEqual([ids[0], ids[1]].sort());
    expect(w.zombies.hp[ids[2] as number]).toBe(95);
    expect(w.zombies.hp[ids[3] as number]).toBe(95);
  });

  it("L6: nothing burns while the dev waves.paused switch holds the run", () => {
    const { w, fire } = burningWorld();
    const p = addPlayer(w, "in", fire.x, fire.y + fire.radiusM + 0.2);
    w.waves.paused = true;
    for (let t = 0; t < 3 * PULSE_TICKS; t++) step(w, TICK_DT_S);
    expect(p.hp).toBe(100);
    w.waves.paused = false;
    for (let t = 0; t < PULSE_TICKS; t++) step(w, TICK_DT_S);
    expect(p.hp).toBe(95);
  });
});

type FireRecordLike = { x: number; y: number; radiusM: number };
