import { EVENT_KINDS, EVENT_NONE, EVENT_PHASE, NPC_STATE, crateOutcome, playerSlotOf, romanLevel, ticksFor, weaponIds, weaponName, type Balance, type CrateOutcome, type SimEvent, type World } from "@topdown/shared";
import { edgeArrow } from "./edgeArrow";
import { EVENT_AMBER, EVENT_GAS, EVENT_WHITE } from "./city/eventArt";

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
  /** Stories 6.9 / 6.10: the pin's icon. */
  icon: "bell" | "bang" | "flame" | "gun" | "person";
  /** The label over the pin ("" none; cached strings, no allocation per frame). */
  label: string;
  /** Gas leak (G1): the dashed ring round the tank (m; 0 none). */
  ringM: number;
  /** Supply drop: the crate is falling (0–1 of the last `CHUTE_S`; −1: not drawn) / on the ground. */
  crateFall: number;
  crateDown: boolean;
  /** Supply drop (G6): the claimant's fill 0–1 (−1: nobody on it). */
  fill: number;
  /** Survivor: crouched (waiting); its leader's slot (−1 none). */
  crouch: boolean;
  leaderSlot: number;
  /** Survivor (S1): the safe flag's pin and its edge arrow. */
  flag: { visible: boolean; x: number; y: number; edge: { visible: boolean; x: number; y: number; angle: number } };
  /** Power failure (P1): the lamps flicker this frame (FLICKER, from the server's phase tick). */
  flicker: boolean;
}

export function createEventMarkerLook(): EventMarkerLook {
  return {
    visible: false,
    kind: -1,
    x: 0,
    y: 0,
    pulse: false,
    arc: -1,
    blinkOn: false,
    chevrons: false,
    lane: -1,
    edge: { visible: false, x: 0, y: 0, angle: 0 },
    icon: "bell",
    label: "",
    ringM: 0,
    crateFall: -1,
    crateDown: false,
    fill: -1,
    crouch: false,
    leaderSlot: -1,
    flag: { visible: false, x: 0, y: 0, edge: { visible: false, x: 0, y: 0, angle: 0 } },
    flicker: false,
  };
}

const GAS_LEAK = EVENT_KINDS.indexOf("gas_leak");
const SUPPLY_DROP = EVENT_KINDS.indexOf("supply_drop");
const POWER_FAILURE = EVENT_KINDS.indexOf("power_failure");
const SURVIVOR = EVENT_KINDS.indexOf("survivor");
/** Story 6.9 (SD2/SD3): the crate drops on its chute over the flare's last 1.2 s (looks.html). */
export const CHUTE_S = 1.2;
/** Stories 6.9 / 6.10: the pin floats this far above the tank / crate (looks.html `y − 0.6`) and the NPC (over its HP bar). */
export const PIN_LIFT_M = 0.6;
export const NPC_PIN_LIFT_M = 0.95;
/** Story 6.10 (P1): the 2 s flicker pattern — lamps off for 0.15 s steps (keyed off the server tick: every phone in step). */
export const FLICKER_STEP_S = 0.15;
export const GAS_LABEL = "GAS LEAK";
export const GAS_LABEL_ARMED = "GAS LEAK · shoot to blow it";
export const NPC_LABEL_WAITING = "HELP!";
export const NPC_LABEL_FOLLOWING = "following";
export const NPC_LABEL_SAVED = "saved!";
/** "FLAMETHROWER · II" per (balance, weapon index, level), built once. */
const crateLabels = new Map<string, string>();
export function crateLabel(balance: Balance, weapon: number, level: number): string {
  const key = `${weapon}:${level}`;
  let s = crateLabels.get(key);
  if (s === undefined) {
    const id = weaponIds(balance)[weapon];
    s = id === undefined ? "SUPPLY DROP" : `${weaponName(balance, id).toUpperCase()} · ${romanLevel(level)}`;
    crateLabels.set(key, s);
  }
  return s;
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
  out.icon = "bell";
  out.label = "";
  out.ringM = 0;
  out.crateFall = -1;
  out.crateDown = false;
  out.fill = -1;
  out.crouch = false;
  out.leaderSlot = -1;
  out.flag.visible = false;
  out.flag.edge.visible = false;
  out.flicker = false;
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
    out.icon = "bang";
    out.lane = a.lane;
    out.pulse = a.phase === EVENT_PHASE.WARNING;
    out.chevrons = a.phase === EVENT_PHASE.WARNING && a.lane >= 0;
  } else if (a.kind === GAS_LEAK) {
    // G1 / G4: the ring from the start, the countdown arc from the server's phase tick (ends on the blast).
    out.icon = "flame";
    out.y = a.y - PIN_LIFT_M;
    out.pulse = true;
    out.ringM = ev.gasLeak.radiusM;
    out.arc = Math.max(0, Math.min(1, 1 - sincePhase / ticksFor(ev.gasLeak.hissS)));
    out.label = sincePhase >= ticksFor(ev.gasLeak.armDelayS) ? GAS_LABEL_ARMED : GAS_LABEL;
  } else if (a.kind === SUPPLY_DROP) {
    // G5: the weapon shows from the flare; the crate falls over the flare's last CHUTE_S.
    const d = world.special.supplyDrop;
    out.icon = "gun";
    out.y = a.y - PIN_LIFT_M;
    out.pulse = a.phase === EVENT_PHASE.FLARE;
    out.label = d.weapon >= 0 ? crateLabel(world.balance, d.weapon, d.level) : "";
    if (a.phase === EVENT_PHASE.FLARE) {
      const left = ticksFor(ev.supplyDrop.flareS) - sincePhase;
      const chute = ticksFor(CHUTE_S);
      if (left <= chute) out.crateFall = Math.max(0, Math.min(1, 1 - left / chute));
    } else out.crateDown = a.phase === EVENT_PHASE.LANDED;
    if (out.crateDown && d.claimSlot >= 0) out.fill = Math.max(0, Math.min(1, d.claimTicks / ticksFor(ev.supplyDrop.takeS)));
  } else if (a.kind === POWER_FAILURE) {
    // No marker (the whole map goes dark; designer: no new art): only the 2 s flicker.
    out.visible = false;
    out.flicker = a.phase === EVENT_PHASE.FLICKER && Math.floor(sincePhase / (FLICKER_STEP_S * TICK_HZ)) % 2 === 1;
    return out;
  } else if (a.kind === SURVIVOR) {
    const n = world.special.survivor;
    out.icon = "person";
    out.x = n.x;
    out.y = n.y - NPC_PIN_LIFT_M;
    out.crouch = n.state === NPC_STATE.WAITING;
    out.leaderSlot = n.leaderSlot;
    out.pulse = n.state === NPC_STATE.WAITING;
    out.label = n.state === NPC_STATE.FOLLOWING ? NPC_LABEL_FOLLOWING : n.state === NPC_STATE.SAVED ? NPC_LABEL_SAVED : NPC_LABEL_WAITING;
    out.flag.visible = n.state === NPC_STATE.WAITING || n.state === NPC_STATE.FOLLOWING || n.state === NPC_STATE.SAVED;
    out.flag.x = n.safeX;
    out.flag.y = n.safeY;
    if (out.flag.visible && edgeArrow(n.safeX - vx, n.safeY - vy, vw, vh, margin, out.flag.edge)) {
      out.flag.edge.visible = true;
      out.flag.edge.x += vx;
      out.flag.edge.y += vy;
    }
  }
  if (edgeArrow(out.x - vx, out.y - vy, vw, vh, margin, out.edge)) {
    out.edge.visible = true;
    out.edge.x += vx;
    out.edge.y += vy;
  }
  return out;
}

/** What an `event.*` message does on this phone (banner text, one-shot sound, the alarm loop). */
export type EventSound =
  | "event_car_alarm_armed"
  | "event_stampede_rumble"
  // Stories 6.9 / 6.10
  | "event_gas_hiss"
  | "event_flare_pop"
  | "event_crate_land"
  | "event_crate_taken"
  | "event_power_down"
  | "event_survivor_help"
  | "event_survivor_saved";

export interface EventCue {
  banner: string | null;
  /** Stories 6.9 / 6.10: the banner's colour (the colour rule: amber = an event you can use, yellow-green = gas, white = pick-ups and people). */
  bannerColor: string;
  sound: EventSound | null;
  alarm: "start" | "stop" | null;
}

const BANNER_COLOR: Partial<Record<string, string>> = { gas_leak: EVENT_GAS, supply_drop: EVENT_WHITE, power_failure: EVENT_WHITE, survivor: EVENT_WHITE };

const START_SOUND: Partial<Record<string, EventSound>> = {
  car_alarm: "event_car_alarm_armed",
  stampede: "event_stampede_rumble",
  gas_leak: "event_gas_hiss",
  supply_drop: "event_flare_pop",
  power_failure: "event_power_down",
  survivor: "event_survivor_help",
};

export function createEventCue(): EventCue {
  return { banner: null, bannerColor: EVENT_AMBER, sound: null, alarm: null };
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
  out.bannerColor = e.type === "event.triggered" || e.type === "event.phase_changed" || e.type === "event.ended" ? (BANNER_COLOR[e.kind] ?? EVENT_AMBER) : EVENT_AMBER;
  const late = balance.events.lateBannerS;
  if (e.type === "event.triggered") {
    if ((e.ageS ?? 0) > late) return out;
    out.banner = balance.events.banners[e.kind] ?? null;
    out.sound = START_SOUND[e.kind] ?? null;
  } else if (e.type === "event.phase_changed") {
    if (e.kind === "car_alarm" && e.phase === EVENT_PHASE.ALARM && (e.ageS ?? 0) <= balance.events.carAlarm.alarmS) out.alarm = "start";
    if ((e.ageS ?? 0) > late) return out;
    // Stories 6.9 / 6.10: the crate lands / is taken; the survivor is saved (+100 banner).
    if (e.kind === "supply_drop" && e.phase === EVENT_PHASE.LANDED) out.sound = "event_crate_land";
    else if (e.kind === "supply_drop" && e.phase === EVENT_PHASE.TAKEN) out.sound = "event_crate_taken";
    else if (e.kind === "survivor" && e.phase === EVENT_PHASE.SAVED) {
      out.banner = balance.events.banners.survivor_saved ?? null;
      out.sound = "event_survivor_saved";
    }
  } else if (e.type === "event.ended") {
    if (e.kind === "car_alarm") out.alarm = "stop";
    if (e.kind === "survivor" && (e.outcome === "failed" || e.outcome === "wave_end")) out.banner = balance.events.banners.survivor_lost ?? null;
  }
  return out;
}

/** Story 6.9 (G7): the HUD line while the local player stands on the landed crate ("" none). Cached strings. */
const replaceTexts = new Map<string, string>();
const promptOut: CrateOutcome = { slot: -1, how: "refused" };
export const CRATE_ALREADY_HAVE = "You already have it";
/**
 * Review L7: the "· step off to cancel" promise only while the server's fill is below this (a
 * step-off reaches the server ~1 RTT later: under ?lag=150 the claim keeps counting 3–4 ticks, so
 * the last fifth of the second can't be cancelled from the screen). The warning itself stays (G7).
 */
export const CRATE_CANCEL_UNTIL = 0.75;
export const CRATE_CANCEL_SUFFIX = " · step off to cancel";
export function cratePrompt(world: Readonly<World>, localId: string): string {
  const a = world.special.active;
  if (EVENT_KINDS[a.kind] !== "supply_drop" || a.phase !== EVENT_PHASE.LANDED) return "";
  const p = world.players.get(localId);
  const d = world.special.supplyDrop;
  const weapon = weaponIds(world.balance)[d.weapon];
  if (!p || p.status !== "alive" || weapon === undefined) return "";
  const r = world.balance.events.supplyDrop.takeRadiusM;
  if ((p.x - a.x) ** 2 + (p.y - a.y) ** 2 > r * r) return "";
  // Review L8: only when the claim is mine or nobody's (a teammate taking it: nothing to lose).
  if (d.claimSlot >= 0 && d.claimSlot !== playerSlotOf(localId)) return "";
  const o = crateOutcome(p.loadout, weapon, d.level, promptOut);
  if (o.how === "refused") return CRATE_ALREADY_HAVE;
  if (o.how !== "replace") return "";
  const slot = p.loadout.slots[o.slot as 0 | 1];
  if (!slot) return "";
  const fill = d.claimSlot >= 0 ? d.claimTicks / ticksFor(world.balance.events.supplyDrop.takeS) : 0;
  const cancel = fill < CRATE_CANCEL_UNTIL;
  const key = `${slot.weapon}:${slot.level}:${cancel ? 1 : 0}`;
  let s = replaceTexts.get(key);
  if (s === undefined) {
    s = `Replaces your ${weaponName(world.balance, slot.weapon)} ${romanLevel(slot.level)}${cancel ? CRATE_CANCEL_SUFFIX : ""}`;
    replaceTexts.set(key, s);
  }
  return s;
}
