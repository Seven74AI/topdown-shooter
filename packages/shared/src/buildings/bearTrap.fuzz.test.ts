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
import { parseWaveMix } from "../waves/waveMix";
import { zombieTypeOf } from "../zombies/zombiePool";
import { BEAR_TRAP_STATE, addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type Building, type BuildingRotation } from "./buildings";
import { circleOverlapsBox } from "./collision";
import { bearTrapCounters, resetBearTrapCounters } from "./bearTrap";

/**
 * Story 5.14 (brief line 7): the builder's fuzz for bear traps. Random legal Downtown layouts (every
 * legal decay variant mask in turn, stage 1–3) × random placement-validated mixes of bear traps
 * (single, a touching row of 2–4 across a spot, next to walls and spike traps), wood barricades,
 * spike traps and mines, 1–4 god-mode bots holding their ground and shooting, every other layout
 * with Brutes, Spitters and Bloaters cycled into the waves (`world.debug.waveMix`), and bot p0 walking
 * to the nearest sprung trap to re-arm it (beat-the-rule B1/B2: going into the choke to reset it).
 *
 * Every tick: no zombie or player body inside a wall or map solid; a held zombie never moves while
 * held and is never held longer than its type's hold; every HOLDING trap holds one alive zombie (or
 * lets go the next tick); no two traps hold the same zombie; nav is re-rasterized only on a wall
 * change. Per layout: zombies reached a player, no wave stalled. Liveness over all layouts: catches,
 * Brute catches, releases, stand-on re-arms, traps worn out, kills by a snap, held body-ticks.
 */
/** Weak guns (as the 5.9 floor fuzz): zombies get close, yet the bots still end every wave. */
const balance = loadBalance(withOverrides(bundledBalanceFiles(), [["weapons", "pistol.damage", 2], ["weapons", "smg.damage", 1]]));
const map = DOWNTOWN_MAP;
const MASKS = gameplayDecayMasks(map);
const LAYOUTS = 16;
const TICKS = 2000;
const WAVE_LIMIT_S = 150;
const ZOMBIE_EPS_M = 1e-5;
const PLAYER_EPS_M = 1e-6;
const REACH_M = 1;
const HOLD_TICKS = Math.round((balance.buildings.types.bear_trap?.bearTrap?.holdS ?? 0) / TICK_DT_S);
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const MIX = parseWaveMix("walker,brute,runner,spitter,walker,bloater,crawler,walker", balance);

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
  const rng = createRng(seed * 104729 + 7);
  const world = createWorld({ balance, seed, map });
  world.debug.godMode = true;
  if (seed % 2 === 0) world.debug.waveMix = MIX;
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
  const types = ["bear_trap", "bear_trap", "bear_trap", "wood_barricade", "spike_trap", "mine"];
  for (let tries = 0; tries < 600 && world.buildings.list.length < 18; tries++) {
    const type = types[rng.int(0, types.length - 1)] as string;
    const b = tryPlace(world, rng, type, centre, rng.int(0, 1) === 0 ? 3 : 8, nextId);
    if (b && b.type === "bear_trap" && rng.int(0, 2) === 0) b.hp = 25; // liveness: some wear out inside the run
  }
  // A touching row of bear traps across a spot (one zombie each, B4).
  const bt = buildingStats(balance, "bear_trap");
  if (bt) {
    for (let tries = 0; tries < 80; tries++) {
      const gx = Math.round((centre.x + rng.range(-6, 6)) / BUILD_GRID_M);
      const gy = Math.round((centre.y + rng.range(-6, 6)) / BUILD_GRID_M);
      const n = rng.int(2, 4);
      let ok = true;
      for (let k = 0; k < n && ok; k++) ok = !footprintBlocked(world, footprint(bt, gx + k * 2, gy, 0, box));
      if (!ok) continue;
      for (let k = 0; k < n; k++) addBuildingAt(world, { id: nextId.v++, type: "bear_trap", ownerId: "p0", gx: gx + k * 2, gy, rot: 0, hp: bt.hp });
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

/** Bot p0's way to the nearest sprung trap (unit move), or false when there is none. */
function towardSprung(world: World, input: PlayerInput): boolean {
  const p = world.players.get("p0");
  if (!p || p.status !== "alive") return false;
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of world.buildings.list) {
    if (b.trapState !== BEAR_TRAP_STATE.SPRUNG) continue;
    const d = Math.hypot((b.minX + b.maxX) / 2 - p.x, (b.minY + b.maxY) / 2 - p.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (!best || bestD > 12) return false;
  const dx = (best.minX + best.maxX) / 2 - p.x;
  const dy = (best.minY + best.maxY) / 2 - p.y;
  const d = Math.hypot(dx, dy);
  input.moveX = d > 0.05 ? dx / d : 0;
  input.moveY = d > 0.05 ? dy / d : 0;
  return true;
}

function run(seed: number) {
  const { world, players } = layout(seed);
  const view = createBotView();
  const cfg = botConfigOf(balance);
  // One input per bot: `setInput` keeps the reference (a shared object would give every bot the last one's move).
  const inputs = new Map<string, PlayerInput>();
  for (const id of world.players.keys()) inputs.set(id, { ...NEUTRAL_INPUT });
  const out = { violation: null as string | null, reached: 0, waves: 0, wavesEnded: 0, heldTicks: 0, snapKills: 0 };
  world.events.subscribe((e) => {
    if (e.type === "wave.started") out.waves++;
    else if (e.type === "wave.ended") out.wavesEnded++;
    else if (e.type === "player.damaged" && e.sourceZombieId >= 0) out.reached++;
    else if (e.type === "zombie.killed" && e.weapon === "bear_trap") out.snapKills++;
  });
  const z = world.zombies;
  const heldRun = new Int32Array(z.capacity);
  const heldX = new Float32Array(z.capacity);
  const heldY = new Float32Array(z.capacity);
  startBuild(world);
  let waveTicks = 0;
  for (let t = 0; t < TICKS && !out.violation; t++) {
    if (world.run.phase === "build") for (const id of world.players.keys()) setBuildReady(world, id, true);
    for (const id of world.players.keys()) {
      const input = inputs.get(id) as PlayerInput;
      botViewFromWorld(world, id, view);
      botInput(view, cfg, t + 1, input);
      input.moveX = input.moveY = 0; // they hold their ground, aim and shoot…
      if (id === "p0" && players > 1) towardSprung(world, input); // …but p0 goes to re-arm sprung traps
      setInput(world, id, input);
    }
    const w0 = world.buildings.wallVersion;
    const nav0 = world.pathing.nav.version;
    step(world, TICK_DT_S);
    // (nav0 < w0: a wall broke late last tick, after the pathing pass: caught up this tick, legitimately.)
    if (world.buildings.wallVersion === w0 && nav0 === w0 && world.pathing.nav.version !== nav0) out.violation = `tick ${t}: nav re-rasterized without a wall change (phase ${world.run.phase}, wave ${world.waves.number}, stage ${world.decay.stage}, nav ${nav0}→${world.pathing.nav.version}, wall ${w0})`;
    waveTicks = world.run.phase === "wave" ? waveTicks + 1 : 0;
    if (waveTicks * TICK_DT_S > WAVE_LIMIT_S) out.violation = `wave ${world.waves.number} stalled (${z.aliveCount} alive)`;
    const heldBy = new Map<number, number>();
    for (const b of world.buildings.list) {
      if (b.trapState !== BEAR_TRAP_STATE.HOLDING) continue;
      if (heldBy.has(b.heldZombie)) out.violation ??= `tick ${t}: zombie ${b.heldZombie} held by two traps`;
      heldBy.set(b.heldZombie, b.id);
    }
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const r = balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0.3;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      const hit = wallOverlap(world, x, y, r - ZOMBIE_EPS_M);
      if (hit) out.violation ??= `tick ${t}: zombie ${id} inside ${hit} at (${x.toFixed(3)}, ${y.toFixed(3)})`;
      // A held body never moves, and is held at most one full hold (+1 tick: caught in the buildings slot).
      if ((z.holdTicks[id] as number) > 0 || heldBy.has(id)) {
        out.heldTicks++;
        if (heldRun[id] === 0) {
          heldX[id] = x;
          heldY[id] = y;
        } else if (heldX[id] !== Math.fround(x) || heldY[id] !== Math.fround(y)) out.violation ??= `tick ${t}: held zombie ${id} moved`;
        heldRun[id] = (heldRun[id] as number) + 1;
        if ((heldRun[id] as number) > HOLD_TICKS + 1) out.violation ??= `tick ${t}: zombie ${id} held ${heldRun[id]} ticks`;
      } else heldRun[id] = 0;
      if (out.reached === 0) for (const p of world.players.values()) if (p.status === "alive" && Math.hypot(p.x - x, p.y - y) < REACH_M + r + p.radiusM) out.reached++;
    }
    for (const p of world.players.values()) {
      if (p.status === "out") continue;
      const hit = wallOverlap(world, p.x, p.y, p.radiusM - PLAYER_EPS_M);
      if (hit) out.violation ??= `tick ${t}: ${p.id} inside ${hit}`;
    }
  }
  return { ...out, players };
}

describe("Story 5.14 fuzz: bear traps on Downtown", () => {
  describe(`${LAYOUTS} random layouts × ${TICKS} ticks: no body in a wall, held = still and bounded, one trap per zombie, nav only on walls, zombies reach us, no stall; liveness`, () => {
    // E8-A8 (no test over 30 s; was 27 s in CI, close): the same run in 4 parts of 4 layouts — the body is a generator
    // that yields after every 4th layout, and each part resumes it (same seeds, order and checks; the last part asserts).
    function* steps(): Generator<void, void, void> {
      resetBearTrapCounters();
      let waves = 0;
      let ended = 0;
      let held = 0;
      let snapKills = 0;
      for (let seed = 1; seed <= LAYOUTS; seed++) {
        const r = run(seed);
        expect(r.violation, `seed ${seed}`).toBeNull();
        expect(r.reached, `seed ${seed}: no zombie reached a player`).toBeGreaterThan(0);
        expect(r.waves, `seed ${seed}`).toBeGreaterThanOrEqual(1);
        expect(r.wavesEnded, `seed ${seed}: a wave never ended`).toBeGreaterThanOrEqual(r.waves - 1);
        waves += r.waves;
        ended += r.wavesEnded;
        held += r.heldTicks;
        snapKills += r.snapKills;
        if (seed % 4 === 0 && seed < LAYOUTS) yield; // E8-A8: one test part ends here
      }
      const c = bearTrapCounters;
      (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
        `[bear trap fuzz] ${LAYOUTS} layouts: ${waves} waves started, ${ended} ended; ${c.catches} catches (${c.bruteCatches} Brutes), ${c.releases} releases, ` +
          `${c.rearms} stand-on re-arms, ${c.wornOut} worn out, ${snapKills} snap kills, ${held} held body-ticks`,
      );
      expect(c.catches).toBeGreaterThanOrEqual(10);
      expect(c.bruteCatches).toBeGreaterThanOrEqual(1);
      expect(c.releases).toBeGreaterThanOrEqual(1);
      expect(c.rearms).toBeGreaterThanOrEqual(1);
      expect(c.wornOut).toBeGreaterThanOrEqual(1);
      expect(held).toBeGreaterThan(HOLD_TICKS);
    }
    const parts = steps();
    it.each(Array.from({ length: 4 }, (_, i) => i + 1))("part %i of 4", (part) => {
      expect(parts.next().done, "the run reached this part's end (and no further)").toBe(part === 4);
    }, 120_000);
  });
});
