import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { DistrictMap } from "../map/districtMap";
import type { PlayerInput } from "../net/input";
import type { PlayerState } from "../player/player";
import { TICK_RATE_HZ } from "../config/constants";
import { walkDistanceFrom, walkLattice } from "../buildings/pathOpen";
import { spawnZombie } from "../zombies/zombiePool";
import { currentDecayStage } from "../map/decayStage";
import { isSpawnBuried } from "../waves/spawnPick";
import type { ZombieTypeId } from "../zombies/zombieTypes";

/**
 * Story 12.2: the extraction (run phase `extract`, between the Extract vote and Results).
 *
 *   Vote ─resolveEvacVote(extract)→ Extract: walk ─(everyone aboard)→ beat ─run.lifted→ fly-out ─run.extract_done→ Results
 *
 * Driven in the sim (every phone sees the same walk; replays get it for free, no new replay command):
 * - **Start** (`beginExtract`): inputs dropped, every standing player protected (`protectTicks`), downed players stand
 *   up where they lie (CN-3), out players and held seats are boarded at once (CN-4: no body to walk);
 * - **Walk** (`extractInputs`, before the player system): each standing, not-yet-boarded player gets a synthesized
 *   input at normal walk speed down the walking field seeded at the pad (`walkDistanceFrom`: 12.1's lattice, buildings
 *   as walls, built once at the start);
 * - **Boarding** (`updateExtract`, the run slot): within `evac.padRadiusM` of the pad once the helicopter has landed
 *   (`landTicksLeft`, set when the vote opens: `descendS`); after `walkTimeoutS` everyone left is boarded anyway
 *   (`run.extract_cut`). A boarded body stops at the pad centre (not drawn; the horde heads for it);
 * - **Lift-off**: `liftBeatS` after the last boarding, `run.lifted { tick }`; then `flyOutS` of fly-out while the
 *   extraction horde spawns from the wave spawn points (no wave, no bounty, no kills: nothing fires in this phase),
 *   then `run.extract_done` and `endRun`.
 *
 * Never saved (saves happen in build and vote only): `world.extract` is excluded from the save (WORLD_SAVE_PLAN).
 */
export interface ExtractState {
  /** The extraction began this run (stays true on Results). */
  started: boolean;
  /** Ticks until the helicopter is on the pad: `descendS` when the vote opens, counted down in the vote and the extract. 0 = landed. */
  landTicksLeft: number;
  /** Ticks since the extraction began. */
  ticks: number;
  /** The players aboard (ids). */
  readonly boarded: Set<string>;
  /** −1 until everyone is aboard; then the lift-off beat's ticks left. */
  beatTicksLeft: number;
  /** The server tick of the lift-off (−1 = still on the pad). On the wire (`liftedAtTick`): the client's fly-out. */
  liftedAtTick: number;
  /** Extraction-horde zombies spawned so far. */
  hordeSpawned: number;
  /** The walk timed out (`run.extract_cut` was emitted). */
  cut: boolean;
  /** Standing (`alive`) players when the extraction began, before the downed stood up (7.11's "all four" milestone keeps the vote's truth). */
  standingAtStart: number;
  /** The pad centre (`evacPadPoint`). */
  padX: number;
  padY: number;
  /** The walking field (lattice steps to the pad per 0.5 m vertex; −1 unreached). Built at the start. */
  dist: Int32Array;
  cols: number;
  rows: number;
  /** One reused input per player (no allocation per tick). */
  readonly inputs: Map<string, PlayerInput & { -readonly [K in keyof PlayerInput]: PlayerInput[K] }>;
}

export function createExtractState(): ExtractState {
  return { started: false, landTicksLeft: 0, ticks: 0, boarded: new Set(), beatTicksLeft: -1, liftedAtTick: -1, hordeSpawned: 0, cut: false, standingAtStart: 0, padX: 0, padY: 0, dist: new Int32Array(0), cols: 0, rows: 0, inputs: new Map() };
}

/** Tests only (AC 16): players the autopilot leaves standing (a body stuck on a corner), to reach the timeout. */
export const extractTestHooks = { stalled: new Set<string>() };

/** Protection while extracting: refreshed every tick, so it never runs out (uint8 on the wire: one change, then none). */
export const EXTRACT_PROTECT_TICKS = 255;

/** Steering carrot: this many lattice steps (0.5 m each) down the field. */
const LOOKAHEAD_STEPS = 4;

/** The pad centre: the map's `evac_pad` event spot, else the map centre (the client's helicopter draws the same point). */
export function evacPadPoint(map: Readonly<DistrictMap>, out: { x: number; y: number }): { x: number; y: number } {
  const spots = map.eventSpots;
  for (let k = 0; k < spots.length; k++) {
    const s = spots[k];
    if (s && s.kind === "evac_pad") {
      out.x = s.x;
      out.y = s.y;
      return out;
    }
  }
  out.x = map.widthM / 2;
  out.y = map.heightM / 2;
  return out;
}

const padPt = { x: 0, y: 0 };

function board(world: World, p: PlayerState): void {
  const e = world.extract;
  if (e.boarded.has(p.id)) return;
  e.boarded.add(p.id);
  // In the helicopter: the body waits at the pad centre (not drawn), so the horde comes for the noise.
  p.x = p.prevX = e.padX;
  p.y = p.prevY = e.padY;
  p.knockTicks = 0;
  world.events.emit({ type: "player.boarded", playerId: p.id });
}

/** CN-3: a downed survivor stands up where they lie (the revive's HP); CN-4 status: an out one stands too (and boards). */
function standUp(world: World, p: PlayerState): void {
  if (p.status === "alive") return;
  p.status = "alive";
  p.hp = Math.max(p.hp, Math.ceil(p.maxHp * world.balance.player.reviveHpFrac));
  p.downedTicksLeft = 0;
  p.reviveTicks = 0;
  p.reviverId = null;
  p.reviveNeedTicks = 0;
}

function calm(p: PlayerState): void {
  p.protectTicks = EXTRACT_PROTECT_TICKS;
  p.slowTicksLeft = 0;
  p.slowPct = 0;
  p.knockTicks = 0;
  p.buildReady = false;
}

/**
 * The extraction's start (`startExtract` in the run state machine, which set the phase). Fills `world.extract` and
 * the walking field; boards the out players and the held seats.
 */
export function beginExtract(world: World): void {
  const e = world.extract;
  e.started = true;
  e.ticks = 0;
  e.boarded.clear();
  e.beatTicksLeft = -1;
  e.liftedAtTick = -1;
  e.hordeSpawned = 0;
  e.cut = false;
  evacPadPoint(world.map, padPt);
  e.padX = padPt.x;
  e.padY = padPt.y;
  e.dist = walkDistanceFrom(world, e.padX, e.padY, e.dist);
  e.cols = walkLattice.cols;
  e.rows = walkLattice.rows;
  e.standingAtStart = 0;
  for (const p of world.players.values()) if (p.status === "alive") e.standingAtStart++;
  world.pendingInputs.clear(); // AC 3: no player input from here on
  world.inputs.clear();
  for (const p of world.players.values()) {
    const wasOut = p.status === "out";
    standUp(world, p);
    calm(p);
    if (wasOut) board(world, p);
  }
  for (const h of world.heldPlayers.values()) {
    standUp(world, h.player);
    calm(h.player);
    board(world, h.player);
  }
}

/** A reached vertex near (x, y): the vertex itself, else the best of its rings (≤ 2), else −1. */
function reachedVertexNear(e: ExtractState, x: number, y: number): number {
  const ci = Math.min(e.cols - 1, Math.max(0, Math.round(x / walkLattice.cellM)));
  const cj = Math.min(e.rows - 1, Math.max(0, Math.round(y / walkLattice.cellM)));
  let best = -1;
  let bestD = 0x7fffffff;
  for (let ring = 0; ring <= 2 && best < 0; ring++) {
    for (let dj = -ring; dj <= ring; dj++) {
      for (let di = -ring; di <= ring; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= e.cols || j >= e.rows) continue;
        const d = e.dist[j * e.cols + i] as number;
        if (d >= 0 && d < bestD) {
          bestD = d;
          best = j * e.cols + i;
        }
      }
    }
  }
  return best;
}

/** The point the walker at (x, y) steers at (`steer.x/y`): a carrot down the field, the pad centre near it or off the field. */
const steer = { x: 0, y: 0 };
function steerPoint(e: ExtractState, x: number, y: number): void {
  steer.x = e.padX;
  steer.y = e.padY;
  if (e.cols === 0) return;
  let v = reachedVertexNear(e, x, y);
  if (v < 0 || (e.dist[v] as number) <= LOOKAHEAD_STEPS) return;
  const cols = e.cols;
  for (let s = 0; s < LOOKAHEAD_STEPS; s++) {
    const d = e.dist[v] as number;
    const i = v % cols;
    let next = -1;
    if (i + 1 < cols && e.dist[v + 1] === d - 1) next = v + 1;
    else if (i > 0 && e.dist[v - 1] === d - 1) next = v - 1;
    else if (v + cols < e.dist.length && e.dist[v + cols] === d - 1) next = v + cols;
    else if (v - cols >= 0 && e.dist[v - cols] === d - 1) next = v - cols;
    if (next < 0) break;
    v = next;
  }
  steer.x = (v % cols) * walkLattice.cellM;
  steer.y = Math.floor(v / cols) * walkLattice.cellM;
}

const NO_INPUT = { seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: false, viewTick: -1 };

/**
 * AC 5: the autopilot, in place of the input system during `extract`: every standing player not yet aboard gets a
 * unit move toward the steer point (normal walk speed: `movePlayers` applies the speed); nobody else has an input.
 * Only + − × ÷ and sqrt. No allocation after a player's first tick.
 */
export function extractInputs(world: World): void {
  const e = world.extract;
  world.inputs.clear();
  if (e.liftedAtTick >= 0) return;
  for (const p of world.players.values()) {
    if (e.boarded.has(p.id) || p.status !== "alive" || extractTestHooks.stalled.has(p.id)) continue;
    let input = e.inputs.get(p.id);
    if (!input) {
      input = { ...NO_INPUT };
      e.inputs.set(p.id, input);
    }
    steerPoint(e, p.x, p.y);
    let dx = steer.x - p.x;
    let dy = steer.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) {
      dx = 0;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    input.moveX = dx;
    input.moveY = dy;
    world.inputs.set(p.id, input);
  }
}

/** The extraction's tick (the run slot, `updateRun`). True when the fly-out is over (the caller ends the run). */
export function updateExtract(world: World): boolean {
  const e = world.extract;
  const ev = world.balance.waves.evac;
  e.ticks++;
  if (e.landTicksLeft > 0) e.landTicksLeft--;
  for (const p of world.players.values()) calm(p); // AC 4: nobody can be hurt (refreshed: never runs out)
  for (const h of world.heldPlayers.values()) {
    calm(h.player);
    board(world, h.player); // a seat that dropped mid-walk boards on its own (CN-4)
  }
  if (e.liftedAtTick < 0) {
    if (e.landTicksLeft === 0) {
      const r2 = ev.padRadiusM * ev.padRadiusM;
      for (const p of world.players.values()) {
        if (e.boarded.has(p.id)) continue;
        const dx = p.x - e.padX;
        const dy = p.y - e.padY;
        if (dx * dx + dy * dy <= r2) board(world, p);
      }
    }
    if (e.ticks >= ticksFor(ev.walkTimeoutS) && !e.cut) {
      let left = false;
      for (const p of world.players.values()) if (!e.boarded.has(p.id)) left = true;
      if (left) {
        e.cut = true;
        world.events.emit({ type: "run.extract_cut" });
        for (const p of world.players.values()) board(world, p);
      }
    }
    if (e.beatTicksLeft < 0) {
      let allAboard = true;
      for (const p of world.players.values()) if (!e.boarded.has(p.id)) allAboard = false;
      if (allAboard) e.beatTicksLeft = ticksFor(ev.liftBeatS);
      return false;
    }
    e.beatTicksLeft--;
    if (e.beatTicksLeft > 0) return false;
    e.beatTicksLeft = 0;
    e.liftedAtTick = world.tick;
    world.events.emit({ type: "run.lifted", tick: world.tick });
    return false;
  }
  const elapsed = world.tick - e.liftedAtTick;
  spawnHorde(world, elapsed);
  if (elapsed < ticksFor(ev.flyOutS)) return false;
  world.events.emit({ type: "run.extract_done", wave: world.waves.number });
  return true;
}

/**
 * AC 10: the extraction horde. `perS` zombies a second from lift-off (integer tick math), up to `count`, round-robin
 * over the wave spawn points open at this decay stage. Not wave zombies: no wave events, no bounty; and nothing fires
 * in `extract` (no combat, no buildings), so none is ever killed (no kills in run stats or milestones).
 */
function spawnHorde(world: World, elapsed: number): void {
  const e = world.extract;
  const h = world.balance.waves.evac.flyOutHorde;
  const points = world.map.spawnPoints;
  if (points.length === 0) return;
  const due = Math.min(h.count, Math.floor(((elapsed + 1) * h.perS) / TICK_RATE_HZ));
  const stage = currentDecayStage(world);
  let guard = 0;
  while (e.hordeSpawned < due && guard < points.length * 2) {
    const idx = (e.hordeSpawned + guard) % points.length;
    const sp = points[idx];
    if (!sp || sp.minStage > stage || isSpawnBuried(world, idx)) {
      guard++;
      continue;
    }
    if (spawnZombie(world, h.type as ZombieTypeId, sp.x, sp.y, false) < 0) return; // the pool is full: no more
    e.hordeSpawned++;
  }
}
