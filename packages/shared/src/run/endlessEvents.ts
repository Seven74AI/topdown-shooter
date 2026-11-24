import type { Balance } from "../config/balance";
import type { World } from "../core/world";
import { isBossWave } from "../boss/bossState";

/**
 * Story 6.12 (F6, D4, D6): one special event in each even endless wave without a Behemoth (12, 14,
 * 16, 18, 22, 24…), never the same event as the previous endless event, drawn from the `events`
 * stream at the build start before that wave.
 *
 * MERGE POINT (Story 6.8's events framework, built in parallel): this module owns only the endless
 * rule — which waves, and "no repeat". The events themselves (gates, start window 20–60 %, banner,
 * sound, marker, power failure) are 6.8/6.10's. Until the framework lands, `endlessEventCandidates`
 * returns no candidate, so nothing is scheduled ("none"). At the merge, 6.8 makes it return the
 * event ids whose gates pass for `wave` (power failure included: 6.12 D6) and starts the chosen one
 * through its own scheduler from `world.run.endlessEvent`.
 */

/** Story 6.12: wave `wave` gets one endless event (even, past the run, no Behemoth). */
export function isEndlessEventWave(balance: Balance, wave: number, endless: boolean, bossOverride: readonly number[] | null = null): boolean {
  if (!endless || !balance.waves.endless.eventEvenWaves) return false;
  if (wave <= balance.waves.runWaves || wave % 2 !== 0) return false;
  return !isBossWave(balance, wave, true, bossOverride); // re-review N1: the dev boss override decides the boss waves here too
}

const NO_CANDIDATES: readonly string[] = [];

/**
 * The event ids that may run in endless wave `wave` (their gates pass). 6.8 fills this at the merge
 * (see the module comment); until then: none.
 */
export function endlessEventCandidates(world: Readonly<World>, wave: number): readonly string[] {
  void world;
  void wave;
  return NO_CANDIDATES;
}

/**
 * D4: one id from `candidates` other than `previous`, drawn from the `events` stream (one draw, only
 * when there is a choice of more than one); "" when none is left.
 */
export function pickEndlessEvent(world: World, candidates: readonly string[], previous: string): string {
  let n = 0;
  for (const c of candidates) if (c !== previous) n++;
  if (n === 0) return "";
  const k = n === 1 ? 0 : world.streams.events.int(0, n - 1);
  let i = 0;
  for (const c of candidates) {
    if (c === previous) continue;
    if (i === k) return c;
    i++;
  }
  return "";
}

/**
 * Called by `startBuild` (every build start): schedules the coming wave's endless event into
 * `world.run.endlessEvent` ("" = none) and remembers it as the previous one (no repeat, D4).
 * Waves 1–10 and odd/boss waves: "". No allocation.
 */
export function scheduleEndlessEvent(world: World): string {
  const run = world.run;
  const wave = world.waves.number + 1;
  run.endlessEvent = "";
  if (!isEndlessEventWave(world.balance, wave, run.endless, world.debug.bossWaves)) return "";
  const id = pickEndlessEvent(world, endlessEventCandidates(world, wave), run.lastEndlessEvent);
  run.endlessEvent = id;
  if (id !== "") run.lastEndlessEvent = id;
  return id;
}
