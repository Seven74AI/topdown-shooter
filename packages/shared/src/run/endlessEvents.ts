import type { Balance } from "../config/balance";
import type { World } from "../core/world";
import { isBossWave } from "../boss/bossState";
import { EVENT_KINDS } from "../events/eventState";
import { eventFits } from "../events/schedule";

/**
 * Story 6.12 (F6, D4, D6): one special event in each even endless wave without a Behemoth (12, 14,
 * 16, 18, 22, 24…), never the same event as the previous endless event, drawn from the `events`
 * stream at the build start before that wave.
 *
 * This module owns only the endless rule — which waves, and "no repeat" (the ONE endless scheduler).
 * The events themselves (gates, start window 20–60 %, banner, sound, marker) are Story 6.8's
 * framework: `endlessEventCandidates` lists the kinds whose `eventFits` gate passes for `wave` (6.9 /
 * 6.10's kinds join as they register; power failure included: 6.12 D6), and `startBuild` hands the
 * pick to the framework (`events/schedule.ts › armEndlessEvent`), which starts it like a scheduled
 * entry.
 */

/** Story 6.12: wave `wave` gets one endless event (even, past the run, no Behemoth). */
export function isEndlessEventWave(balance: Balance, wave: number, endless: boolean, bossOverride: readonly number[] | null = null): boolean {
  if (!endless || !balance.waves.endless.eventEvenWaves) return false;
  if (wave <= balance.waves.runWaves || wave % 2 !== 0) return false;
  return !isBossWave(balance, wave, true, bossOverride); // re-review N1: the dev boss override decides the boss waves here too
}

/** Reused candidate list (no allocation per build). */
const candidates: string[] = [];

/** The event ids that may run in endless wave `wave`: every registered kind whose gate passes (6.8 `eventFits`), in `EVENT_KINDS` order. */
export function endlessEventCandidates(world: Readonly<World>, wave: number): readonly string[] {
  candidates.length = 0;
  for (let k = 0; k < EVENT_KINDS.length; k++) if (eventFits(world, k, wave)) candidates.push(EVENT_KINDS[k] as string);
  return candidates;
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
export function scheduleEndlessEvent(world: World, candidatesOf: (world: Readonly<World>, wave: number) => readonly string[] = endlessEventCandidates): string {
  const run = world.run;
  const wave = world.waves.number + 1;
  run.endlessEvent = "";
  if (!isEndlessEventWave(world.balance, wave, run.endless, world.debug.bossWaves)) return "";
  const id = pickEndlessEvent(world, candidatesOf(world, wave), run.lastEndlessEvent);
  run.endlessEvent = id;
  if (id !== "") run.lastEndlessEvent = id;
  return id;
}
