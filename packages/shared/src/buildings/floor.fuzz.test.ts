import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { createRng, type Rng } from "../core/rng";
import { createWorld, setInput, step, type World } from "../core/world";
import { applyDecayStage } from "../decay/applyDecayStage";
import { gameplayDecayMasks } from "../decay/decayState";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { botConfigOf, botInput, botViewFromWorld, createBotView } from "../bots/botPolicy";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { setLoadout } from "../combat/loadout";
import { setBuildReady, startBuild } from "../run/runStateMachine";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, setBuildingType, type Box, type Building, type BuildingRotation } from "./buildings";
import { circleOverlapsBox } from "./collision";
import { mineCounters } from "./mine";
import { trapCounters } from "./trap";

/**
 * Story 5.9 (brief line 7, task 8.1): the builder's fuzz for walls vs floor. Random legal layouts on
 * Downtown (every legal decay variant mask in turn, stage 1–3) × random placement-validated mixes of
 * barricades (all three tiers), turrets, spike traps (incl. a row of 2–3 adjacent traps across a
 * spot) and mines, round 1–4 god-mode bots (the shared `botInput`'s aim and fire; they hold their ground with weak
 * guns, so zombies come close) × `TICKS` of real waves (the wave director; a new wave starts as soon as a build phase begins).
 *
 * Every tick: no zombie or player centre-circle overlaps a WALL building (barricade tiers, turrets) or
 * a map solid beyond float noise; the flow field is re-rasterized ONLY when a wall changed
 * (`nav.version` follows `wallVersion`, and a tick where only `version` moved — a mine exploding, a
 * trap wearing out, an upgrade — never touches it). Per layout: zombies reached a player (a bite
 * landed or a body came within 1 m), and no wave stalled (every wave started ended within
 * `WAVE_LIMIT_S`). Liveness over all layouts: ≥ 1 mine explosion, ≥ 1 trap kill, ≥ 1 trap worn out,
 * ≥ 1 upgraded wall broken, bodies really stood on floor buildings.
 */
/** Weak guns (pistol 2 damage): zombies get close, yet the bots still end every wave. */
const balance = loadBalance(withOverrides(bundledBalanceFiles(), [["weapons", "pistol.damage", 2], ["weapons", "smg.damage", 1]]));
const map = DOWNTOWN_MAP;
const MASKS = gameplayDecayMasks(map);
const LAYOUTS = 24;
const TICKS = 2000;
const WAVE_LIMIT_S = 150;
const ZOMBIE_EPS_M = 1e-5;
const PLAYER_EPS_M = 1e-6;
const REACH_M = 1;
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function tryPlace(world: World, rng: Rng, type: string, near: { x: number; y: number }, spread: number, nextId: { v: number }): Building | null {
  const stats = buildingStats(balance, type);
  if (!stats) throw new Error(type);
  const rot = rng.int(0, 3) as BuildingRotation;
  const gx = Math.round((near.x + rng.range(-spread, spread)) / BUILD_GRID_M);
  const gy = Math.round((near.y + rng.range(-spread, spread)) / BUILD_GRID_M);
  if (footprintBlocked(world, footprint(stats, gx, gy, rot, box))) return null;
  return addBuildingAt(world, { id: nextId.v++, type, ownerId: `p${rng.int(0, 3)}`, gx, gy, rot, hp: stats.hp });
}

function layout(seed: number) {
  const rng = createRng(seed * 7919 + 13);
  const world = createWorld({ balance, seed, map });
  world.debug.godMode = true;
  world.decay.variants = MASKS[seed % MASKS.length] as number;
  applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
  const players = 1 + (seed % 4);
  const at = { x: 0, y: 0 };
  for (let slot = 0; slot < players; slot++) {
    teamSpawnPoint(world, slot, at);
    const p = addPlayer(world, `p${slot}`, at.x, at.y);
    setLoadout(balance, p.loadout, ["smg", "pistol"]);
  }
  const centre = { x: at.x, y: at.y };
  const nextId = { v: 1 };
  let turrets = 0;
  const types = ["wood_barricade", "wood_barricade", "auto_turret", "spike_trap", "mine", "mine"];
  for (let tries = 0; tries < 600 && world.buildings.list.length < 20; tries++) {
    let type = types[rng.int(0, types.length - 1)] as string;
    if (type === "auto_turret" && (seed % 2 === 0 || turrets >= 1)) type = "spike_trap"; // ≤ 1 turret: they'd kill everything far out
    const b = tryPlace(world, rng, type, centre, 9, nextId);
    if (b && b.type === "auto_turret") turrets++;
    if (b && b.type === "wood_barricade") {
      const tier = rng.int(0, 2);
      if (tier >= 1) setBuildingType(world, b, "reinforced_barricade");
      if (tier >= 2) setBuildingType(world, b, "metal_barricade");
      if (tier >= 1 && rng.int(0, 2) === 0) b.hp = 15; // liveness: some upgraded walls break inside the run
    }
    if (b && b.type === "spike_trap" && rng.int(0, 3) === 0) b.hp = 4; // liveness: worn out inside the run
  }
  // A row of adjacent traps (stacking across a spot: one slow, one clock).
  const trap = buildingStats(balance, "spike_trap");
  if (trap) {
    for (let tries = 0; tries < 60; tries++) {
      const gx = Math.round((centre.x + rng.range(-8, 8)) / BUILD_GRID_M);
      const gy = Math.round((centre.y + rng.range(-8, 8)) / BUILD_GRID_M);
      const n = rng.int(2, 3);
      let ok = true;
      for (let k = 0; k < n && ok; k++) ok = !footprintBlocked(world, footprint(trap, gx + k * 4, gy, 0, box));
      if (!ok) continue;
      for (let k = 0; k < n; k++) addBuildingAt(world, { id: nextId.v++, type: "spike_trap", ownerId: "p0", gx: gx + k * 4, gy, rot: 0, hp: trap.hp });
      break;
    }
  }
  return { world, players };
}

function wallOverlap(world: World, x: number, y: number, r: number): string | null {
  for (const s of world.obstacles.solids as readonly MapBox[]) if (circleOverlapsBox(x, y, r, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (b.solid && circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) return `${b.type} ${b.id}`;
  return null;
}

function run(seed: number) {
  const { world, players } = layout(seed);
  const view = createBotView();
  const cfg = botConfigOf(balance);
  const input: PlayerInput = { ...NEUTRAL_INPUT };
  const out = { violation: null as string | null, reached: 0, waves: 0, wavesEnded: 0, stall: false, onFloor: 0, upgradedBroken: 0, navAtWallChange: true };
  world.events.subscribe((e) => {
    if (e.type === "wave.started") out.waves++;
    else if (e.type === "wave.ended") out.wavesEnded++;
    else if (e.type === "player.damaged" && e.sourceZombieId >= 0) out.reached++;
    else if (e.type === "building.destroyed" && (e.buildingType === "reinforced_barricade" || e.buildingType === "metal_barricade")) out.upgradedBroken++;
  });
  startBuild(world);
  let waveTicks = 0;
  for (let t = 0; t < TICKS && !out.violation; t++) {
    if (world.run.phase === "build") for (const id of world.players.keys()) setBuildReady(world, id, true);
    for (const id of world.players.keys()) {
      botViewFromWorld(world, id, view);
      botInput(view, cfg, t + 1, input);
      input.moveX = input.moveY = 0; // they hold their ground (a kiting bot outruns every zombie), aim and shoot
      setInput(world, id, input);
    }
    const v0 = world.buildings.version;
    const w0 = world.buildings.wallVersion;
    const nav0 = world.pathing.nav.version;
    step(world, TICK_DT_S);
    // Flow fields follow walls only: a tick whose wall counter didn't move never re-rasterizes.
    if (world.buildings.wallVersion === w0 && world.pathing.nav.version !== nav0 && nav0 >= 0) {
      out.navAtWallChange = false;
      out.violation = `tick ${t}: nav re-rasterized without a wall change (version ${v0} → ${world.buildings.version})`;
    }
    waveTicks = world.run.phase === "wave" ? waveTicks + 1 : 0;
    if (waveTicks * TICK_DT_S > WAVE_LIMIT_S) {
      out.stall = true;
      out.violation = `wave ${world.waves.number} stalled (${world.zombies.aliveCount} alive)`;
    }
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const r = balance.zombies.types[["walker", "runner", "crawler"][z.type[id] as number] as string]?.radiusM ?? 0.3;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      const hit = wallOverlap(world, x, y, r - ZOMBIE_EPS_M);
      if (hit) out.violation ??= `tick ${t}: zombie ${id} inside ${hit} at (${x.toFixed(3)}, ${y.toFixed(3)})`;
      for (const b of world.buildings.list) if (!b.solid && circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) out.onFloor++;
      if (out.reached === 0) {
        for (const p of world.players.values()) if (p.status === "alive" && Math.hypot(p.x - x, p.y - y) < REACH_M + r + p.radiusM) out.reached++;
      }
    }
    for (const p of world.players.values()) {
      if (p.status === "out") continue;
      const hit = wallOverlap(world, p.x, p.y, p.radiusM - PLAYER_EPS_M);
      if (hit) out.violation ??= `tick ${t}: ${p.id} inside ${hit}`;
    }
  }
  return { ...out, players, buildings: world.buildings.list.length };
}

describe("Story 5.9 fuzz: walls vs floor on Downtown", () => {
  it(`${LAYOUTS} random layouts × ${TICKS} ticks of waves: no body in a wall, nav only on wall changes, zombies reach us, no stall; liveness`, () => {
    trapCounters.pulses = trapCounters.kills = trapCounters.wornOut = 0;
    mineCounters.exploded = 0;
    let onFloor = 0;
    let upgradedBroken = 0;
    let waves = 0;
    let ended = 0;
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const r = run(seed);
      expect(r.violation, `seed ${seed}`).toBeNull();
      expect(r.reached, `seed ${seed}: no zombie reached a player`).toBeGreaterThan(0);
      expect(r.waves, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(r.wavesEnded, `seed ${seed}: a wave never ended`).toBeGreaterThanOrEqual(r.waves - 1); // the last may still run at TICKS
      onFloor += r.onFloor;
      upgradedBroken += r.upgradedBroken;
      waves += r.waves;
      ended += r.wavesEnded;
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
      `[floor fuzz] ${LAYOUTS} layouts: ${waves} waves started, ${ended} ended; ${mineCounters.exploded} mines exploded, ${trapCounters.pulses} spike hits, ` +
        `${trapCounters.kills} trap kills, ${trapCounters.wornOut} traps worn out, ${upgradedBroken} upgraded walls broken, ${onFloor} body-ticks on floor buildings`,
    );
    expect(mineCounters.exploded).toBeGreaterThanOrEqual(1);
    expect(trapCounters.kills).toBeGreaterThanOrEqual(1);
    expect(trapCounters.wornOut).toBeGreaterThanOrEqual(1);
    expect(upgradedBroken).toBeGreaterThanOrEqual(1);
    expect(onFloor).toBeGreaterThan(0);
  }, 240_000);
});
