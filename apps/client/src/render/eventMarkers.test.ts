import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, EVENT_KINDS, EVENT_PHASE, createWorld, loadBalance, type SimEvent } from "@topdown/shared";
import { createEventCue, createEventMarkerLook, eventCue, eventMarkerLook } from "./eventMarkers";
import { mirrorSpecialEvent } from "../net/mirrorEvent";
import { fakeState } from "../net/fakeRoom";

const balance = loadBalance();
const mirror = () => createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { buildings: () => {} } });

describe("Story 6.8 event markers (AC 12, F1, D10)", () => {
  it("nothing without an event", () => {
    const w = mirror();
    expect(eventMarkerLook(w, 100, 0, 0, 20, 12, 1, createEventMarkerLook()).visible).toBe(false);
  });

  it("the armed car: a pulsing pin over the car, the countdown arc from the SERVER's phase tick, blinking at 2 Hz; sounding: no arc, 6 Hz", () => {
    const w = mirror();
    const car = DOWNTOWN_MAP.cover.find((c) => c.name === "parked_car_1")!;
    const s = fakeState();
    Object.assign(s, { eventKind: EVENT_KINDS.indexOf("car_alarm"), eventPhase: EVENT_PHASE.ARMED, eventStartTick: 1000, eventPhaseTick: 1000, eventX: Math.round(((car.minX + car.maxX) / 2) * 100), eventY: Math.round(((car.minY + car.maxY) / 2) * 100), eventLane: 255 });
    mirrorSpecialEvent(w, s);
    expect(w.special.carAlarm.car).toBe("parked_car_1");
    const out = createEventMarkerLook();
    eventMarkerLook(w, 1200, 0, 20, 24, 13.5, 1, out); // half-way through the 20 s
    expect(out).toMatchObject({ visible: true, pulse: true, y: car.minY });
    expect(out.arc).toBeCloseTo(0.5, 6);
    expect(out.edge.visible).toBe(false);
    // a woken tab drawing late reads the same server ticks: 300 ticks in → 25 % left, whenever it arrived
    eventMarkerLook(w, 1300, 0, 20, 24, 13.5, 1, out);
    expect(out.arc).toBeCloseTo(0.25, 6);
    const blinks = new Set<boolean>();
    for (let t = 1000; t < 1010; t++) blinks.add(eventMarkerLook(w, t, 0, 20, 24, 13.5, 1, out).blinkOn);
    expect(blinks.size).toBe(2);
    Object.assign(s, { eventPhase: EVENT_PHASE.ALARM, eventPhaseTick: 1400 });
    mirrorSpecialEvent(w, s);
    eventMarkerLook(w, 1410, 0, 20, 24, 13.5, 1, out);
    expect(out.arc).toBe(-1);
    // off screen: an edge arrow inside the view, pointing at it
    eventMarkerLook(w, 1410, 30, 0, 18, 10, 1.2, out);
    expect(out.edge.visible).toBe(true);
    expect(out.edge.x).toBeGreaterThanOrEqual(30 + 1.2 - 1e-9);
    expect(out.edge.y).toBeLessThanOrEqual(10 - 1.2 + 1e-9);
  });

  it("the stampede: chevrons down its lane during the warning only; the pin at the start edge", () => {
    const w = mirror();
    const s = fakeState();
    Object.assign(s, { eventKind: EVENT_KINDS.indexOf("stampede"), eventPhase: EVENT_PHASE.WARNING, eventStartTick: 50, eventPhaseTick: 50, eventX: 100, eventY: 1600, eventLane: 0 });
    mirrorSpecialEvent(w, s);
    const out = createEventMarkerLook();
    eventMarkerLook(w, 60, 0, 10, 24, 13.5, 1, out);
    expect(out).toMatchObject({ visible: true, chevrons: true, lane: 0, pulse: true, x: 1, y: 16 });
    Object.assign(s, { eventPhase: EVENT_PHASE.RUNNING, eventPhaseTick: 110 });
    mirrorSpecialEvent(w, s);
    eventMarkerLook(w, 120, 0, 10, 24, 13.5, 1, out);
    expect(out.chevrons).toBe(false);
    Object.assign(s, { eventKind: 255 });
    mirrorSpecialEvent(w, s);
    expect(eventMarkerLook(w, 130, 0, 10, 24, 13.5, 1, out).visible).toBe(false);
  });

  it("F1 cues: a fresh start shows the banner and its sound; a woken tab's start older than lateBannerS shows neither", () => {
    const cue = createEventCue();
    const tr = (kind: "car_alarm" | "stampede", ageS: number): SimEvent => ({ type: "event.triggered", kind, wave: 3, x: 1, y: 2, startTick: 5, phase: 1, lane: -1, ageS });
    expect(eventCue(tr("car_alarm", 0.1), balance, cue)).toEqual({ banner: "CAR ALARM · shoot it to set it off", sound: "event_car_alarm_armed", alarm: null });
    expect(eventCue(tr("stampede", 2.9), balance, cue)).toEqual({ banner: "STAMPEDE!", sound: "event_stampede_rumble", alarm: null });
    expect(eventCue(tr("stampede", 3.5), balance, cue)).toEqual({ banner: null, sound: null, alarm: null });
    expect(eventCue({ type: "event.ended", kind: "car_alarm", outcome: "done" }, balance, cue).alarm).toBe("stop");
  });
});
