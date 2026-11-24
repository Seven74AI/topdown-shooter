/**
 * Story 6.8 (FR37): the special events' state — `world.special` (not `world.events`: that is the
 * EventBus). Server truth: server and solo run `updateSpecialEvents`; the client's mirror copies the
 * active event from the room state (`eventKind` …), never the schedule (D8: the schedule is secret).
 *
 * One slot for the active event (DD1: the run's two events are in different waves; endless has one
 * per even wave), the run's schedule (fixed at the run's first build start, from `streams.events`
 * only) and a few log counters for tests. Preallocated: nothing here allocates after run start.
 */

/** Event kinds. Append only: the index goes on the wire (`eventKind`, `event.*` tuples). */
export const EVENT_KINDS = ["car_alarm", "stampede", "gas_leak", "supply_drop", "power_failure", "survivor"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** No active event (`active.kind`); the wire sends 255. */
export const EVENT_NONE = -1;
export const EVENT_KIND_NONE_WIRE = 255;

export function eventKindIndex(kind: EventKind): number {
  return EVENT_KINDS.indexOf(kind);
}

/**
 * The active event's phase. One numbering for every kind (append only: on the wire). 6.9 / 6.10
 * append theirs.
 */
export const EVENT_PHASE = {
  NONE: 0,
  /** Car alarm: the car blinks, the bell pulses; a player's bullet or the 20 s timer sets it off. */
  ARMED: 1,
  /** Car alarm: sounding (15 s); zombies within 15 m walk to it. */
  ALARM: 2,
  /** Stampede: the 3 s warning (rumble, dust, chevrons). Nothing has spawned. */
  WARNING: 3,
  /** Stampede: the 10 s crossing. */
  RUNNING: 4,
} as const;

/** How an event ended (`event.ended.outcome`). Append only: on the wire. */
export const EVENT_OUTCOMES = ["done", "failed", "skipped", "wave_end"] as const;
export type EventOutcome = (typeof EVENT_OUTCOMES)[number];

/** One event of the run's schedule (or the forced / endless extra entry). */
export interface ScheduleEntry {
  /** `EVENT_KINDS` index (EVENT_NONE: unused slot). */
  kind: number;
  wave: number;
  /** F3: starts once round(size × this) of its wave's zombies have spawned. */
  startFraction: number;
}

export interface ActiveEvent {
  /** `EVENT_KINDS` index or EVENT_NONE. */
  kind: number;
  phase: number;
  /** Tick it triggered (`event.triggered`). */
  startTick: number;
  /** Tick the current phase began. */
  phaseTick: number;
  /** Where its marker sits (car centre; a lane's start-edge centre). */
  x: number;
  y: number;
  /** The wave it runs in. */
  wave: number;
  /** Schedule index (0…) or −1 for the extra (forced / endless) entry. */
  entry: number;
  /** Stampede: the lane's index in `map.stampedeLanes` (−1 otherwise). */
  lane: number;
}

/** Story 6.8: the car alarm's own record (the armed car). */
export interface CarAlarmState {
  /** The car's map name ("" when none). */
  car: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Who set it off (null: the timer, or not yet). */
  shotBy: string | null;
}

/** Story 6.8: the stampede's own record. */
export interface StampedeState {
  /** Runners to send (12 / 18 / 24 / 30 by players in the run). */
  toSpawn: number;
  /** Runners sent so far. */
  spawned: number;
  /** Ticks to the next row. */
  rowTimer: number;
  /** STAMPEDE-state Runners alive (updated by the stampede each tick; `updateWaves` pauses normal spawns while > 0). */
  alive: number;
  /** Unit run direction. */
  dirX: number;
  dirY: number;
}

export interface SpecialEventLog {
  triggered: number;
  skipped: number;
  /** Per kind index: times triggered (tests: "both kinds seen"). */
  readonly byKind: Int32Array;
  /** The last car-alarm credit (F4). */
  alarmShotBy: string | null;
  /** Stampede totals (tests). */
  stampedeSpawned: number;
  stampedeConverted: number;
  stampedeExited: number;
  stampedeHits: number;
}

export interface SpecialEventState {
  /** The run's schedule was drawn (once, at the run's first build start). */
  scheduled: boolean;
  /** `events.json › perRun` entries (unused: kind EVENT_NONE); `count` are valid. */
  readonly schedule: ScheduleEntry[];
  count: number;
  /** Bit i = schedule entry i finished (triggered and ended, or skipped). */
  done: number;
  /** Forced (dev) or endless (6.12) entry; kind EVENT_NONE when unused. Done when `extraDone`. */
  readonly extra: ScheduleEntry;
  extraDone: boolean;
  /** 6.12: the kind of the previous endless event (never the same twice in a row, 6.12 D4). */
  lastEndlessKind: number;
  readonly active: ActiveEvent;
  readonly carAlarm: CarAlarmState;
  readonly stampede: StampedeState;
  readonly log: SpecialEventLog;
}

/** Most entries a schedule can hold (`events.json › perRun` ≤ 4, schema). */
export const MAX_SCHEDULE = 4;

export function createSpecialEventState(): SpecialEventState {
  const schedule: ScheduleEntry[] = [];
  for (let i = 0; i < MAX_SCHEDULE; i++) schedule.push({ kind: EVENT_NONE, wave: 0, startFraction: 0 });
  return {
    scheduled: false,
    schedule,
    count: 0,
    done: 0,
    extra: { kind: EVENT_NONE, wave: 0, startFraction: 0 },
    extraDone: false,
    lastEndlessKind: EVENT_NONE,
    active: { kind: EVENT_NONE, phase: EVENT_PHASE.NONE, startTick: 0, phaseTick: 0, x: 0, y: 0, wave: 0, entry: -1, lane: -1 },
    carAlarm: { car: "", minX: 0, minY: 0, maxX: 0, maxY: 0, shotBy: null },
    stampede: { toSpawn: 0, spawned: 0, rowTimer: 0, alive: 0, dirX: 0, dirY: 0 },
    log: { triggered: 0, skipped: 0, byKind: new Int32Array(EVENT_KINDS.length), alarmShotBy: null, stampedeSpawned: 0, stampedeConverted: 0, stampedeExited: 0, stampedeHits: 0 },
  };
}

/** An event is running. */
export function eventActive(s: Readonly<SpecialEventState>): boolean {
  return s.active.kind !== EVENT_NONE;
}

/** Plain-data copy for `snapshotWorld` (determinism, replays: brief line 8). */
export function snapshotSpecial(s: Readonly<SpecialEventState>) {
  return {
    scheduled: s.scheduled,
    schedule: s.schedule.slice(0, s.count).map((e) => ({ ...e })),
    done: s.done,
    extra: { ...s.extra },
    extraDone: s.extraDone,
    lastEndlessKind: s.lastEndlessKind,
    active: { ...s.active },
    carAlarm: { ...s.carAlarm },
    stampede: { ...s.stampede },
    log: { triggered: s.log.triggered, skipped: s.log.skipped, byKind: Array.from(s.log.byKind), alarmShotBy: s.log.alarmShotBy, spawned: s.log.stampedeSpawned, converted: s.log.stampedeConverted, exited: s.log.stampedeExited, hits: s.log.stampedeHits },
  };
}
