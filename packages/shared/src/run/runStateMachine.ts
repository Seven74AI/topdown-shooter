import type { SystemFn } from "../core/systems";
import type { Balance } from "../config/balance";
import { drawAllOffers } from "../economy/shopCards";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { returnOutPlayers } from "../player/downed";
import { beginWave, clearWave, updateWaves } from "../waves/waveDirector";
import { killZombie } from "../zombies/zombiePool";
import { decayFinish, decayMutate, stageForComingWave } from "../decay/decaySystem";
import { clearAcid } from "../zombies/spit";
import { clearGrenades } from "../combat/grenades";
import { clearMolotovZones } from "../hazards/molotov";
import { clearBlasts, drainBlasts } from "../zombies/bloater";
import { resetBuildSpend } from "../buildings/buildings";
import { refreshBlackout } from "../decay/lightState";
import { endSpecialEvent, eventHoldsWave } from "../events/specialEvents";
import { scheduleEndlessEvent } from "./endlessEvents";

/**
 * The run state machine (Story 3.1, architecture › Run state machine; FR44):
 *
 *   Lobby ─startBuild→ Build ─startWave→ Wave ─endWave→ Build ─startWave→ Wave … ─endRun→ Results
 *
 * Story 6.11: clearing wave `runWaves` (10) opens the evacuation vote instead of Results:
 *
 *   … Wave 10 ─endWave→ Vote ─resolveEvacVote→ Results ("extracted")
 *                            └────────────────→ Build (wave 11, endless) ─startWave→ Wave … Wave 15 ─endWave→ Vote …
 *
 * Story 6.12: endless waves past 10; a Behemoth every 5th wave and a vote after it (`isEvacWave`);
 * a wipe after Stay ends the run "lost".
 *
 * Phases change only through the named transitions below; a transition from a wrong phase is a
 * bug and throws. It lives in shared code so the server (`RunController`) and solo practice
 * (`LocalSimHost`) run the same one. The room owns what is around a run (the lobby, Results
 * bookkeeping, Back to lobby, which drops the World).
 *
 * Story 3.3 (shop) and 3.4 (placement) act only while `world.run.phase === "build"`; the build timer
 * is `world.run.buildTicksLeft`. Story 3.2's economy system pays the wave-clear bonus from the
 * `wave.ended` event that `endWave` emits.
 */
export type RunPhase = "lobby" | "build" | "wave" | "vote" | "results";

/** Story 6.11: how a finished run ended ("none" until Results). 6.12: "lost" = a wipe after Stay. */
export type RunEnding = "none" | "wiped" | "extracted" | "lost";
export const RUN_ENDINGS: readonly RunEnding[] = ["none", "wiped", "extracted", "lost"];

/** Story 6.11: `PlayerState.vote` values (0 = no vote). */
export const VOTE_NONE = 0;
export const VOTE_EXTRACT = 1;
export const VOTE_STAY = 2;
export type EvacChoice = "extract" | "stay";

export interface RunState {
  phase: RunPhase;
  /** Build phase: ticks until the wave starts (0 outside a build). */
  buildTicksLeft: number;
  /** Story 6.11: vote phase: ticks until the vote resolves (0 outside a vote). */
  voteTicksLeft: number;
  /** Story 6.11: how the run ended (set with phase "results"). Replaces Story 3.10's `heldOut`. */
  ending: RunEnding;
  /** Story 6.11 (D-E): the team chose Stay at a vote: endless waves (Story 6.12 reads it). */
  endless: boolean;
  /** Story 6.12 (F6): the endless event scheduled for the coming wave ("" = none; `run/endlessEvents.ts`). */
  endlessEvent: string;
  /** Story 6.12 (D4): the previous endless event (never repeated next). */
  lastEndlessEvent: string;
}

export function createRunState(): RunState {
  return { phase: "lobby", buildTicksLeft: 0, voteTicksLeft: 0, ending: "none", endless: false, endlessEvent: "", lastEndlessEvent: "" };
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
  expectPhase(world, "startBuild", "lobby", "wave", "vote");
  world.run.phase = "build";
  world.run.voteTicksLeft = 0;
  world.run.buildTicksLeft = ticksFor(world.balance.waves.buildPhaseS);
  world.players.forEach(clearReady);
  resetBuildSpend(world); // Story 5.20 (F2): a new build phase: nothing paid this phase yet (take-back = 100 % only for this phase's spend)
  const from = world.decay.stage;
  const decayed = decayMutate(world, stageForComingWave(world));
  clearAcid(world); // Story 5.6 DD4: no spits, no puddles in a build phase; acid clocks restart
  clearGrenades(world.grenades); // Story 5.5: no round bursts in a build phase (no ghost blasts)
  clearMolotovZones(world); // Story 5.12 (D3): molotov fire burns in waves only
  drainBlasts(world); // Story 5.8 review L1: a Bloater killed on the wave's last tick still bursts
  clearBlasts(world); // Story 5.8: no queued blasts, no gas clouds in a build phase
  returnOutPlayers(world);
  if (decayed) decayFinish(world, from);
  drawAllOffers(world); // Story 5.13: each player's card offer, after the decay steps (loadouts final)
  scheduleEndlessEvent(world); // Story 6.12 (F6): the coming endless wave's event (events stream; none in waves 1–10)
  world.events.emit({ type: "build.started", wave: world.waves.number + 1 });
  refreshBlackout(world); // Story 6.3: the build phase's light (half dark at stage 5 once 6.4 turns it on)
}

/** Build → Wave: Ready cleared, the next wave begins (`wave.started`). Its first spawn batch runs this tick. */
export function startWave(world: World): void {
  expectPhase(world, "startWave", "build");
  world.run.phase = "wave";
  world.run.buildTicksLeft = 0;
  world.players.forEach(clearReady);
  beginWave(world);
  refreshBlackout(world); // Story 6.3: the wave's blackout level (after beginWave: it reads the new wave number)
}

/**
 * Wave → Build: the wave's counters cleared, `wave.ended`, then the next build phase starts (same
 * tick). Story 6.11: after an evacuation wave (`isEvacWave`: wave 10; 6.12: every 5th endless wave)
 * the vote opens instead (after `wave.ended`, so the bonus is paid the same tick).
 */
export function endWave(world: World): void {
  expectPhase(world, "endWave", "wave");
  clearWave(world);
  const number = world.waves.number;
  world.events.emit({ type: "wave.ended", number });
  // Story 3.2: the economy system pays the wave-clear bonus (10 × N, every player) from this event.
  if (isEvacWave(world.balance, number, world.run.endless)) {
    openEvacVote(world);
    return;
  }
  startBuild(world);
}

/**
 * Build | Wave | Vote → Results: the run is over; nothing changes phase after this. The ending:
 * "extracted" when `resolveEvacVote` set it, else a wipe ("lost" after Stay: Story 6.12 F7).
 */
export function endRun(world: World): void {
  expectPhase(world, "endRun", "build", "wave", "vote");
  const run = world.run;
  run.phase = "results";
  run.buildTicksLeft = 0;
  run.voteTicksLeft = 0;
  if (run.ending === "none") run.ending = run.endless ? "lost" : "wiped";
  clearGrenades(world.grenades); // Story 5.5: Results clears the rounds in flight
  clearMolotovZones(world); // Story 5.12
  clearBlasts(world); // Story 5.8: no blast or gas cloud outlives the run (FR-B: Results never bursts)
  refreshBlackout(world); // Story 6.3: Results are lit (→ 0)
}

/**
 * Story 6.11 (F6) / 6.12: the vote opens after clearing wave `runWaves` (10), and in endless after
 * every `evac.everyWaves`-th wave past it (15, 20, 25…). THE single place this is decided. A wave
 * past `runWaves` outside endless (a shortened test run) also opens it: a run never plays on
 * without a Stay.
 */
export function isEvacWave(balance: Balance, wave: number, endless = false): boolean {
  const first = balance.waves.runWaves;
  if (!endless) return wave >= first;
  return wave === first || (wave > first && (wave - first) % balance.waves.evac.everyWaves === 0);
}

const clearVote = (p: PlayerState): void => {
  p.vote = VOTE_NONE;
};

/**
 * Story 6.11: Wave → Vote. `voteS` of server ticks, every vote cleared, the rounds/fires/acid of the
 * cleared wave gone (as `endRun` and `startBuild` do). The light of the cleared wave stays (no
 * `refreshBlackout`: the vote is still that night). `run.vote_opened { wave, ticks }`.
 */
export function openEvacVote(world: World): void {
  expectPhase(world, "openEvacVote", "wave");
  const run = world.run;
  run.phase = "vote";
  run.buildTicksLeft = 0;
  run.voteTicksLeft = ticksFor(world.balance.waves.evac.voteS);
  world.players.forEach(clearVote);
  clearAcid(world);
  clearGrenades(world.grenades);
  clearMolotovZones(world);
  drainBlasts(world); // a Bloater killed on the wave's last tick still bursts (as startBuild)
  clearBlasts(world);
  world.events.emit({ type: "run.vote_opened", wave: world.waves.number, ticks: run.voteTicksLeft });
}

/**
 * Story 6.11 (F1, F2): a player's vote. Phase "vote" only; unknown players ignored; a new choice
 * replaces the old one until the vote ends (D2). Takes effect at the next tick's check.
 */
export function castVote(world: World, playerId: string, choice: EvacChoice): void {
  if (world.run.phase !== "vote") return;
  const p = world.players.get(playerId);
  if (!p) return;
  p.vote = choice === "stay" ? VOTE_STAY : VOTE_EXTRACT;
}

/** Story 6.11: the tally of the players in the run (module-level scratch: no allocation per tick). */
export const voteTally = { extract: 0, stay: 0, silent: 0 };
const tallyOne = (p: PlayerState): void => {
  if (p.vote === VOTE_STAY) voteTally.stay++;
  else if (p.vote === VOTE_EXTRACT) voteTally.extract++;
  else voteTally.silent++;
};

/** Counts the votes of every player in the World into `voteTally` (and returns it). */
export function countVotes(world: World): typeof voteTally {
  voteTally.extract = 0;
  voteTally.stay = 0;
  voteTally.silent = 0;
  world.players.forEach(tallyOne);
  return voteTally;
}

/** Story 6.11 (F3, D1): Stay only when MORE than half of the players in the run voted Stay; ties, silence → Extract. */
export function voteOutcome(stay: number, players: number): EvacChoice {
  return players > 0 && stay * 2 > players ? "stay" : "extract";
}

const markEvac = (p: PlayerState): void => {
  p.earnedAtEvac = p.earned;
};

/**
 * Story 6.11: Vote → Results ("extracted") or Vote → Build (Stay, F3 / F7). `run.vote_resolved`
 * first; Extract: `run.extracted { wave, endless }` then `endRun`; Stay: `run.endless` on (the first
 * Stay records each player's `earnedAtEvac`, 6.12 F7) and a normal build phase for the next wave.
 */
export function resolveEvacVote(world: World): void {
  expectPhase(world, "resolveEvacVote", "vote");
  const t = countVotes(world);
  const choice = voteOutcome(t.stay, world.players.size);
  world.events.emit({ type: "run.vote_resolved", choice, extract: t.extract, stay: t.stay, silent: t.silent });
  const run = world.run;
  run.voteTicksLeft = 0;
  if (choice === "extract") {
    run.ending = "extracted";
    world.events.emit({ type: "run.extracted", wave: world.waves.number, endless: run.endless });
    endRun(world);
    return;
  }
  if (!run.endless) world.players.forEach(markEvac);
  run.endless = true;
  startBuild(world);
}

let allVoted = true;
const checkVoted = (p: PlayerState): void => {
  if (p.vote === VOTE_NONE) allVoted = false;
};

function everyoneVoted(world: World): boolean {
  if (world.players.size === 0) return false;
  allVoted = true;
  world.players.forEach(checkVoted);
  return allVoted;
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
 * - Story 6.11: vote: the countdown (ticks), shortened once everyone voted; at 0 → `resolveEvacVote`;
 * - a team wipe this tick (or earlier) → `endRun`;
 * - `waves.paused` (dev): nothing moves;
 * - build: everyone Ready, or the countdown reaching 0 → `startWave` (its first batch spawns now);
 * - wave: the wave director's tick; a cleared wave → `endWave` (→ the next build), unless a special
 *   event holds it (Story 6.8 D6: a crossing stampede) — then it ends on the first tick after.
 */
export const updateRun: SystemFn = (world) => {
  const run = world.run;
  if (run.phase === "vote") {
    // Story 6.11 (F4): server ticks; everyone in → `allVotedHoldS` more (the last chip is seen), then resolve.
    if (everyoneVoted(world)) run.voteTicksLeft = Math.min(run.voteTicksLeft, ticksFor(world.balance.waves.evac.allVotedHoldS));
    run.voteTicksLeft--;
    if (run.voteTicksLeft <= 0) resolveEvacVote(world);
    return;
  }
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
  // Story 6.8 (D6, F8): a cleared wave waits while an event holds it (a crossing stampede); it ends the tick after.
  if (updateWaves(world) && !eventHoldsWave(world)) endWave(world);
};

/** Dev cheat (Story 1.11): kill every wave zombie and end the wave (→ the build phase). */
export function skipWave(world: World): void {
  if (world.run.phase !== "wave") return;
  endSpecialEvent(world, "wave_end"); // Story 6.8: the active event ends first (its stampede Runners go)
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    if (z.waveZombie[id] === 1) killZombie(world, id, null, "cheat");
  }
  endWave(world);
}
