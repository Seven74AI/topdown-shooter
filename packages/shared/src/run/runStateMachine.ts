import type { SystemFn } from "../core/systems";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { returnOutPlayers } from "../player/downed";
import { beginWave, clearWave, updateWaves } from "../waves/waveDirector";
import { killZombie } from "../zombies/zombiePool";
import { decayFinish, decayMutate, stageForComingWave } from "../decay/decaySystem";
import { clearAcid } from "../zombies/spit";
import { clearGrenades } from "../combat/grenades";
import { clearBlasts, drainBlasts } from "../zombies/bloater";
import { resetBuildSpend } from "../buildings/buildings";

/**
 * The run state machine (Story 3.1, architecture › Run state machine; FR44):
 *
 *   Lobby ─startBuild→ Build ─startWave→ Wave ─endWave→ Build ─startWave→ Wave … ─endRun→ Results
 *
 * (Story 3.10: `endWave` of wave `waves.runWaves` goes to Results, "You held out!".)
 *
 * Phases change only through the four named transitions below; a transition from a wrong phase is a
 * bug and throws. It lives in shared code so the server (`RunController`) and solo practice
 * (`LocalSimHost`) run the same one. The room owns what is around a run (the lobby, Results
 * bookkeeping, Back to lobby, which drops the World).
 *
 * Story 3.3 (shop) and 3.4 (placement) act only while `world.run.phase === "build"`; the build timer
 * is `world.run.buildTicksLeft`. Story 3.2's economy system pays the wave-clear bonus from the
 * `wave.ended` event that `endWave` emits.
 */
export type RunPhase = "lobby" | "build" | "wave" | "results";

export interface RunState {
  phase: RunPhase;
  /** Build phase: ticks until the wave starts (0 outside a build). */
  buildTicksLeft: number;
  /** Story 3.10: the run ended because the team cleared wave `waves.runWaves` (false for a wipe). */
  heldOut: boolean;
}

export function createRunState(): RunState {
  return { phase: "lobby", buildTicksLeft: 0, heldOut: false };
}

function expectPhase(world: World, transition: string, ...from: RunPhase[]): void {
  if (!from.includes(world.run.phase)) {
    throw new Error(`${transition}: not allowed from phase "${world.run.phase}" (from ${from.join(" | ")})`);
  }
}

const clearReady = (p: PlayerState): void => {
  p.buildReady = false;
};

/**
 * Lobby | Wave → Build: a `buildPhaseS` countdown (ticks), every Ready cleared; Story 4.5: if the
 * coming wave's decay stage differs, the DecaySystem's mutations, building refunds and push-outs
 * (`decayMutate`, brief line 5); every player healed by `buildHealFrac` of max HP and downed or out
 * players back next to a teammate (`returnOutPlayers`, FR9/FR10, avoiding the new boxes); then the
 * flow fields rebuilt and `decay.stage_changed` (`decayFinish`); then `build.started { wave: next wave }`.
 * The only place the stage changes in a run: never mid-wave.
 */
export function startBuild(world: World): void {
  expectPhase(world, "startBuild", "lobby", "wave");
  world.run.phase = "build";
  world.run.buildTicksLeft = ticksFor(world.balance.waves.buildPhaseS);
  world.players.forEach(clearReady);
  resetBuildSpend(world); // Story 5.20 (F2): a new build phase: nothing paid this phase yet (take-back = 100 % only for this phase's spend)
  const from = world.decay.stage;
  const decayed = decayMutate(world, stageForComingWave(world));
  clearAcid(world); // Story 5.6 DD4: no spits, no puddles in a build phase; acid clocks restart
  clearGrenades(world.grenades); // Story 5.5: no round bursts in a build phase (no ghost blasts)
  drainBlasts(world); // Story 5.8 review L1: a Bloater killed on the wave's last tick still bursts
  clearBlasts(world); // Story 5.8: no queued blasts, no gas clouds in a build phase
  returnOutPlayers(world);
  if (decayed) decayFinish(world, from);
  world.events.emit({ type: "build.started", wave: world.waves.number + 1 });
}

/** Build → Wave: Ready cleared, the next wave begins (`wave.started`). Its first spawn batch runs this tick. */
export function startWave(world: World): void {
  expectPhase(world, "startWave", "build");
  world.run.phase = "wave";
  world.run.buildTicksLeft = 0;
  world.players.forEach(clearReady);
  beginWave(world);
}

/**
 * Wave → Build: the wave's counters cleared, `wave.ended`, then the next build phase starts (same
 * tick). Story 3.10: after wave `waves.runWaves` the run is won instead: `run.held_out { wave }`
 * (after `wave.ended`, so the bonus is paid the same tick) and Wave → Results.
 */
export function endWave(world: World): void {
  expectPhase(world, "endWave", "wave");
  clearWave(world);
  const number = world.waves.number;
  world.events.emit({ type: "wave.ended", number });
  // Story 3.2: the economy system pays the wave-clear bonus (10 × N, every player) from this event.
  if (number >= world.balance.waves.runWaves) {
    world.run.heldOut = true;
    world.events.emit({ type: "run.held_out", wave: number });
    endRun(world);
    return;
  }
  startBuild(world);
}

/** Build | Wave → Results: the run is over (team wipe, or Story 3.10's last wave cleared); nothing changes phase after this. */
export function endRun(world: World): void {
  expectPhase(world, "endRun", "build", "wave");
  world.run.phase = "results";
  world.run.buildTicksLeft = 0;
  clearGrenades(world.grenades); // Story 5.5: Results clears the rounds in flight
  clearBlasts(world); // Story 5.8: no blast or gas cloud outlives the run (FR-B: Results never bursts)
}

/**
 * A player's Ready in a build phase (FR44): a toggle. Ignored outside a build and for unknown
 * players. Takes effect at the next tick's check.
 */
export function setBuildReady(world: World, playerId: string, ready: boolean): void {
  if (world.run.phase !== "build") return;
  const p = world.players.get(playerId);
  if (p) p.buildReady = ready;
}

/** Every player in the World is Ready (and there is one). Module-level callback: no closure per tick. */
let allReady = true;
const checkReady = (p: PlayerState): void => {
  if (!p.buildReady) allReady = false;
};

function everyoneReady(world: World): boolean {
  if (world.players.size === 0) return false;
  allReady = true;
  world.players.forEach(checkReady);
  return allReady;
}

/**
 * The run system (the `waves` slot of `SYSTEM_ORDER`, after player, combat and zombies):
 * - a team wipe this tick (or earlier) → `endRun`;
 * - `waves.paused` (dev): nothing moves;
 * - build: everyone Ready, or the countdown reaching 0 → `startWave` (its first batch spawns now);
 * - wave: the wave director's tick; a cleared wave → `endWave` (→ the next build).
 */
export const updateRun: SystemFn = (world) => {
  const run = world.run;
  if (run.phase !== "build" && run.phase !== "wave") return;
  if (world.teamWiped) {
    endRun(world);
    return;
  }
  if (world.waves.paused) return;
  if (run.phase === "build") {
    if (!everyoneReady(world)) {
      run.buildTicksLeft--;
      if (run.buildTicksLeft > 0) return;
    }
    startWave(world);
  }
  if (updateWaves(world)) endWave(world);
};

/** Dev cheat (Story 1.11): kill every wave zombie and end the wave (→ the build phase). */
export function skipWave(world: World): void {
  if (world.run.phase !== "wave") return;
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    if (z.waveZombie[id] === 1) killZombie(world, id, null, "cheat");
  }
  endWave(world);
}
