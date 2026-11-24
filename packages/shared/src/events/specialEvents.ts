import type { SystemFn } from "../core/systems";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { carAlarmShot, armedCarBox } from "./carAlarm";
import { gasLeakShot, gasTankArmed } from "./gasLeak";
import { EVENT_KINDS, EVENT_NONE, EVENT_PHASE, type EventKind, type EventOutcome, type ScheduleEntry } from "./eventState";
import { eventModule } from "./registry";
import { scheduleRunEvents } from "./schedule";

/**
 * Story 6.8 (AC 4): the `specialEvents` slot of `SYSTEM_ORDER` (after `waves`). Server and solo only.
 *
 * - The run's first build (or wave) phase: draw the schedule (`scheduleRunEvents`).
 * - In a wave with no active event: the wave's entry triggers once `size − queued ≥ round(size ×
 *   startFraction)` (F3) and someone stands; its gate is checked again (`fits`): can't start → the
 *   entry is skipped (`event.skipped`).
 * - The active event ticks; its module says when it is over (`event.ended`, outcome "done").
 * - Not in its wave any more (the wave ended, a wipe → Results, `skipWave`): it ends with "wave_end".
 *   An entry whose wave passed without it triggering is skipped.
 */
export const updateSpecialEvents: SystemFn = (world) => {
  const s = world.special;
  const phase = world.run.phase;
  if (!s.scheduled) {
    if (phase !== "build" && phase !== "wave") return;
    scheduleRunEvents(world);
  }
  const a = s.active;
  if (a.kind !== EVENT_NONE) {
    if (phase !== "wave" || world.waves.number !== a.wave) {
      endSpecialEvent(world, "wave_end");
    } else {
      const m = eventModule(a.kind);
      const outcome = m ? m.update(world) : "done";
      if (outcome !== null) endSpecialEvent(world, outcome);
      return; // one event at a time (DD1)
    }
  }
  // Entries whose wave is over (or that can no longer come) are skipped.
  for (let i = 0; i < s.count; i++) {
    if ((s.done & (1 << i)) !== 0) continue;
    const e = s.schedule[i] as ScheduleEntry;
    if (e.wave < world.waves.number || (e.wave === world.waves.number && phase !== "wave")) skipEntry(world, e, i);
  }
  if (s.extra.kind !== EVENT_NONE && !s.extraDone && (s.extra.wave < world.waves.number || (s.extra.wave === world.waves.number && phase !== "wave"))) skipEntry(world, s.extra, -1);
  if (phase !== "wave") return;
  // The extra (forced / endless) entry first, then the schedule.
  if (s.extra.kind !== EVENT_NONE && !s.extraDone && s.extra.wave === world.waves.number) {
    tryTrigger(world, s.extra, -1);
    return;
  }
  for (let i = 0; i < s.count; i++) {
    if ((s.done & (1 << i)) !== 0) continue;
    const e = s.schedule[i] as ScheduleEntry;
    if (e.wave !== world.waves.number) continue;
    tryTrigger(world, e, i);
    return;
  }
};

function markDone(world: World, entry: number): void {
  if (entry < 0) world.special.extraDone = true;
  else world.special.done |= 1 << entry;
}

function skipEntry(world: World, e: ScheduleEntry, entry: number): void {
  markDone(world, entry);
  world.special.log.skipped++;
  world.events.emit({ type: "event.skipped", kind: EVENT_KINDS[e.kind] as EventKind, wave: e.wave });
}

/** F3: the trigger point of a wave's entry has come (spawns counted, never alive zombies). */
export function triggerPointReached(world: Readonly<World>, e: Readonly<ScheduleEntry>): boolean {
  const w = world.waves;
  return w.size - w.queued >= Math.round(w.size * e.startFraction);
}

let standing = false;
const checkStanding = (p: PlayerState): void => {
  if (p.status === "alive") standing = true;
};
function anyoneStanding(world: Readonly<World>): boolean {
  standing = false;
  world.players.forEach(checkStanding); // per tick until the trigger: no iterator allocation
  return standing;
}

function tryTrigger(world: World, e: ScheduleEntry, entry: number): void {
  if (!triggerPointReached(world, e) || !anyoneStanding(world)) return; // DD7: nobody standing: wait
  const m = eventModule(e.kind);
  const a = world.special.active;
  a.kind = e.kind;
  a.wave = e.wave;
  a.entry = entry;
  a.lane = -1;
  a.startTick = world.tick;
  a.phaseTick = world.tick;
  a.phase = EVENT_PHASE.NONE;
  if (!m || !m.fits(world, e.wave) || !m.start(world)) {
    clearActive(world);
    skipEntry(world, e, entry); // F9 safety net (never on Downtown: test)
    return;
  }
  const log = world.special.log;
  log.triggered++;
  log.byKind[e.kind] = (log.byKind[e.kind] as number) + 1;
  world.events.emit({ type: "event.triggered", kind: EVENT_KINDS[e.kind] as EventKind, wave: e.wave, x: a.x, y: a.y, startTick: a.startTick, phase: a.phase, lane: a.lane });
}

function clearActive(world: World): void {
  const a = world.special.active;
  a.kind = EVENT_NONE;
  a.phase = EVENT_PHASE.NONE;
  a.entry = -1;
  a.lane = -1;
}

/** Ends the active event (any outcome); no-op without one. `skipWave` and the system call it. */
export function endSpecialEvent(world: World, outcome: EventOutcome): void {
  const a = world.special.active;
  if (a.kind === EVENT_NONE) return;
  const kind = a.kind;
  eventModule(kind)?.end(world, outcome);
  markDone(world, a.entry);
  clearActive(world);
  world.events.emit({ type: "event.ended", kind: EVENT_KINDS[kind] as EventKind, outcome });
}

/** F8 / D6: the wave can't end now (`updateRun`). */
export function eventHoldsWave(world: Readonly<World>): boolean {
  const a = world.special.active;
  if (a.kind === EVENT_NONE) return false;
  return eventModule(a.kind)?.holdsWave(world) ?? false;
}

/**
 * Dev (solo cheat "Force event ▸ kind", tests): the coming wave (`waves.number + 1`) gets `kind` at
 * `startFractionMin`, in place of any scheduled event of that wave. Unknown kinds are ignored.
 */
export function forceEvent(world: World, kind: string): boolean {
  const k = EVENT_KINDS.indexOf(kind as EventKind);
  if (k < 0) return false;
  const s = world.special;
  if (!s.scheduled && (world.run.phase === "build" || world.run.phase === "wave")) scheduleRunEvents(world);
  const wave = world.waves.number + 1;
  s.extra.kind = k;
  s.extra.wave = wave;
  s.extra.startFraction = world.balance.events.startFractionMin;
  s.extraDone = false;
  for (let i = 0; i < s.count; i++) if ((s.schedule[i] as ScheduleEntry).wave === wave) s.done |= 1 << i; // replaced (not "skipped": no event)
  return true;
}

/**
 * F4 / AC 8 (the shot hook, `combat/firing.ts › updateProjectiles`): whether an event exposes a
 * shootable box this tick (the armed car; 6.9 adds the gas tank). Cheap: one compare when none.
 */
export function specialShotTarget(world: Readonly<World>): boolean {
  return armedCarBox(world) || gasTankArmed(world); // Story 6.9: + the gas tank after its 3 s (G3)
}

/**
 * F4: a PLAYER projectile's step (x0, y0) → (x1, y1), stopped at `stopT` (−1: flies on), credited to
 * `ownerId`. Called only while `specialShotTarget` is true.
 */
export function onSpecialShot(world: World, x0: number, y0: number, x1: number, y1: number, stopT: number, ownerId: string | null): void {
  if (armedCarBox(world)) carAlarmShot(world, x0, y0, x1, y1, stopT, ownerId);
  else if (gasTankArmed(world)) gasLeakShot(world, x0, y0, x1, y1, stopT, ownerId); // Story 6.9
}
