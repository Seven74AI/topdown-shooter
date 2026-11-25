import type { World } from "../core/world";
import { EVENT_FORBIDDEN_WAVE } from "../config/balance";
import { EVENT_KINDS, EVENT_NONE, MAX_SCHEDULE } from "./eventState";
import { eventModule } from "./registry";

/**
 * Story 6.8 (F2, F3, F9, AC 3): the run's events, drawn ONCE at the run's first build start from
 * `world.streams.events` only (brief line 8):
 *
 * 1. shuffle the registered kinds (Fisher–Yates on the stream);
 * 2. take the first `perRun` (2) that fit at least one allowed wave (`events.json › waves` within the
 *    run, never 5);
 * 3. pick their waves among the allowed pairs (two waves at least 2 apart: 3+6, 3+7, 3+8, 4+6, 4+7,
 *    4+8, 6+8) where each kind's gate holds for its wave (the stage per wave from `stageForWave`,
 *    honouring `debug.decayStageByWave`);
 * 4. each one's `startFraction` in [startFractionMin, startFractionMax].
 *
 * If the first two kinds have no fitting pair, the next kinds are tried; fewer events only if no
 * pair fits at all. Same seed → same schedule (replay test). The dev override `debug.events` replaces
 * the draw (each at `startFractionMin`, any wave; draws nothing).
 */

/** `eventFits(world, kind, wave)`: kind's module says it can run in `wave` (F9). */
export function eventFits(world: Readonly<World>, kind: number, wave: number): boolean {
  const m = eventModule(kind);
  return m !== null && m.fits(world, wave);
}

/** Allowed event waves of this run, ascending (run-start scratch). */
function allowedWaves(world: Readonly<World>): number[] {
  const out: number[] = [];
  const runWaves = world.balance.waves.runWaves;
  for (const w of world.balance.events.waves) if (w <= runWaves && w !== EVENT_FORBIDDEN_WAVE && !out.includes(w)) out.push(w);
  return out.sort((a, b) => a - b);
}

export function scheduleRunEvents(world: World): void {
  const s = world.special;
  s.scheduled = true;
  s.count = 0;
  s.done = 0;
  const ev = world.balance.events;
  const dev = world.debug.events;
  if (dev !== null) {
    for (const e of dev) {
      const k = EVENT_KINDS.indexOf(e.kind as (typeof EVENT_KINDS)[number]);
      if (k < 0 || s.count >= MAX_SCHEDULE) continue;
      const slot = s.schedule[s.count++] as (typeof s.schedule)[number];
      slot.kind = k;
      slot.wave = e.wave;
      slot.startFraction = ev.startFractionMin;
    }
    return;
  }
  const rng = world.streams.events;
  const waves = allowedWaves(world);
  const kinds: number[] = EVENT_KINDS.map((_, i) => i);
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const t = kinds[i] as number;
    kinds[i] = kinds[j] as number;
    kinds[j] = t;
  }
  const fitting = kinds.filter((k) => waves.some((w) => eventFits(world, k, w)));
  const perRun = Math.min(ev.perRun, MAX_SCHEDULE);
  if (perRun <= 0 || fitting.length === 0) return;
  if (perRun === 1 || fitting.length === 1) {
    const k = fitting[0] as number;
    const ws = waves.filter((w) => eventFits(world, k, w));
    put(world, k, ws[rng.int(0, ws.length - 1)] as number);
    return;
  }
  // Two events (the designed case; perRun > 2 is not a design and takes the first pair only).
  for (let a = 0; a < fitting.length; a++) {
    for (let b = a + 1; b < fitting.length; b++) {
      const ka = fitting[a] as number;
      const kb = fitting[b] as number;
      // (wave of ka, wave of kb) pairs, each ≥ 2 apart, each gate holding.
      const pairs: [number, number][] = [];
      for (const wa of waves) for (const wb of waves) if (Math.abs(wa - wb) >= 2 && eventFits(world, ka, wa) && eventFits(world, kb, wb)) pairs.push([wa, wb]);
      if (pairs.length === 0) continue;
      const [wa, wb] = pairs[rng.int(0, pairs.length - 1)] as [number, number];
      // In wave order (the trigger looks at each entry anyway).
      if (wa < wb) {
        put(world, ka, wa);
        put(world, kb, wb);
      } else {
        put(world, kb, wb);
        put(world, ka, wa);
      }
      return;
    }
  }
}

function put(world: World, kind: number, wave: number): void {
  const s = world.special;
  const ev = world.balance.events;
  const slot = s.schedule[s.count++] as (typeof s.schedule)[number];
  slot.kind = kind;
  slot.wave = wave;
  slot.startFraction = world.streams.events.range(ev.startFractionMin, ev.startFractionMax);
}

/**
 * Story 6.8 × 6.12 (endless): `startBuild` calls this right after 6.12's `scheduleEndlessEvent` (the
 * one endless scheduler: which waves, no repeat). The picked kind (`world.run.endlessEvent`, "" =
 * none) becomes the framework's extra entry for the coming wave, with its start fraction (stream
 * `events`); it then triggers like a scheduled entry. A dev-forced event (`forceEvent`) after this
 * replaces it; one forced BEFORE it for the same wave and not yet run wins (re-review 2 RR4): the
 * endless pick is dropped and 6.12's no-repeat memory goes back to `previousLast` (what was last
 * really armed). Returns the kind index, or EVENT_NONE.
 */
export function armEndlessEvent(world: World, previousLast: string = world.run.lastEndlessEvent): number {
  const id = world.run.endlessEvent;
  if (id === "") return EVENT_NONE;
  const x = world.special.extra;
  if (x.kind !== EVENT_NONE && !world.special.extraDone && x.wave === world.waves.number + 1) {
    world.run.endlessEvent = "";
    world.run.lastEndlessEvent = previousLast;
    return EVENT_NONE;
  }
  const kind = EVENT_KINDS.indexOf(id as (typeof EVENT_KINDS)[number]);
  if (kind < 0) return EVENT_NONE;
  const s = world.special;
  const ev = world.balance.events;
  s.extra.kind = kind;
  s.extra.wave = world.waves.number + 1;
  s.extra.startFraction = world.streams.events.range(ev.startFractionMin, ev.startFractionMax);
  s.extraDone = false;
  return kind;
}
