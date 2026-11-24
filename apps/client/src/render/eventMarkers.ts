import { EVENT_KINDS, EVENT_NONE, EVENT_PHASE, ticksFor, type Balance, type SimEvent, type World } from "@topdown/shared";
import { edgeArrow } from "./edgeArrow";

/**
 * Story 6.8 (AC 12; F1, F6, D10): what the event markers look like this frame — pure, tested, no
 * allocation (the view passes one record). Everything reads the World's `special.active` (solo: the
 * sim; online: the room state's copy, `net/mirrorEvent.ts`) and the server tick, never the time a
 * message arrived (a woken tab or a late join shows the right countdown).
 *
 * - Car alarm (CA3): a pulsing amber bell pin over the car, a countdown arc on the pin while ARMED
 *   (the 20 s), the car's hazard lights blinking (2 Hz armed, 6 Hz sounding). No rings (the 15 m pull
 *   is not drawn, designer).
 * - Stampede (ST1): an amber "!" pin at the lane's start edge; during the 3 s WARNING the chevrons
 *   down the lane and the dust at its start edge.
 * - Off screen: an edge arrow (D10) with the kind's icon.
 */
export interface EventMarkerLook {
  visible: boolean;
  /** `EVENT_KINDS` index (−1 none). */
  kind: number;
  /** The pin's tip, in metres. */
  x: number;
  y: number;
  pulse: boolean;
  /** Countdown left, 0–1 (−1: no arc). */
  arc: number;
  /** Car alarm: the hazard lights are lit this frame. */
  blinkOn: boolean;
  /** Stampede warning: chevrons + dust down lane `lane`. */
  chevrons: boolean;
  lane: number;
  edge: { visible: boolean; x: number; y: number; angle: number };
}

export function createEventMarkerLook(): EventMarkerLook {
  return { visible: false, kind: -1, x: 0, y: 0, pulse: false, arc: -1, blinkOn: false, chevrons: false, lane: -1, edge: { visible: false, x: 0, y: 0, angle: 0 } };
}

const CAR_ALARM = EVENT_KINDS.indexOf("car_alarm");
const STAMPEDE = EVENT_KINDS.indexOf("stampede");
/** Hazard blink rates (Hz) while armed / sounding (looks.html CA1's 2 and 6). */
export const BLINK_ARMED_HZ = 2;
export const BLINK_ALARM_HZ = 6;
const TICK_HZ = 20;

/**
 * `serverTick`: the host's estimate of the server tick now (fractional ok). (vx, vy, vw, vh): the
 * camera's world view in metres; `margin` metres keeps an edge arrow inside it.
 */
export function eventMarkerLook(world: Readonly<World>, serverTick: number, vx: number, vy: number, vw: number, vh: number, margin: number, out: EventMarkerLook): EventMarkerLook {
  const a = world.special.active;
  out.visible = false;
  out.kind = -1;
  out.arc = -1;
  out.pulse = false;
  out.blinkOn = false;
  out.chevrons = false;
  out.lane = -1;
  out.edge.visible = false;
  if (a.kind === EVENT_NONE) return out;
  const ev = world.balance.events;
  out.visible = true;
  out.kind = a.kind;
  out.x = a.x;
  out.y = a.y;
  const sincePhase = Math.max(0, serverTick - a.phaseTick);
  if (a.kind === CAR_ALARM) {
    out.pulse = true;
    if (a.phase === EVENT_PHASE.ARMED) out.arc = Math.max(0, Math.min(1, 1 - sincePhase / ticksFor(ev.carAlarm.armedS)));
    const hz = a.phase === EVENT_PHASE.ALARM ? BLINK_ALARM_HZ : BLINK_ARMED_HZ;
    out.blinkOn = Math.floor((serverTick / TICK_HZ) * hz * 2) % 2 === 0;
  } else if (a.kind === STAMPEDE) {
    out.lane = a.lane;
    out.pulse = a.phase === EVENT_PHASE.WARNING;
    out.chevrons = a.phase === EVENT_PHASE.WARNING && a.lane >= 0;
  }
  if (edgeArrow(out.x - vx, out.y - vy, vw, vh, margin, out.edge)) {
    out.edge.visible = true;
    out.edge.x += vx;
    out.edge.y += vy;
  }
  return out;
}

/** What an `event.*` message does on this phone (banner text, one-shot sound, the alarm loop). */
export interface EventCue {
  banner: string | null;
  sound: "event_car_alarm_armed" | "event_stampede_rumble" | null;
  alarm: "start" | "stop" | null;
}

export function createEventCue(): EventCue {
  return { banner: null, sound: null, alarm: null };
}

/**
 * F1 (brief 14): a fresh `event.triggered` shows its banner and plays its sound; one older than
 * `events.json › lateBannerS` (a woken tab's backlog) shows neither — the marker still comes from the
 * state. The alarm loop starts with the alarm (unless stale) and stops when the event ends.
 */
export function eventCue(e: SimEvent, balance: Balance, out: EventCue): EventCue {
  out.banner = null;
  out.sound = null;
  out.alarm = null;
  const late = balance.events.lateBannerS;
  if (e.type === "event.triggered") {
    if ((e.ageS ?? 0) > late) return out;
    out.banner = balance.events.banners[e.kind] ?? null;
    out.sound = e.kind === "car_alarm" ? "event_car_alarm_armed" : e.kind === "stampede" ? "event_stampede_rumble" : null;
  } else if (e.type === "event.phase_changed") {
    if (e.kind === "car_alarm" && e.phase === EVENT_PHASE.ALARM && (e.ageS ?? 0) <= balance.events.carAlarm.alarmS) out.alarm = "start";
  } else if (e.type === "event.ended") {
    if (e.kind === "car_alarm") out.alarm = "stop";
  }
  return out;
}
