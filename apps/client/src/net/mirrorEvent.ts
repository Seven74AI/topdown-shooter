import { EVENT_KIND_NONE_WIRE, EVENT_KINDS, EVENT_NONE, EVENT_PHASE, type RunStateView, type World } from "@topdown/shared";

/**
 * Story 6.8 (AC 6, brief 14): copies the room state's active-event fields into the mirror World's
 * `special.active` (and the armed car's box from the map, found by the marker = the car's centre),
 * so `EventView` draws the same marker, countdown and lane in solo and online — also after a late
 * join or a woken tab (it reads the server's ticks, never the arrival time). `?? ` for an older server.
 * The schedule is never on the wire (D8).
 */
export function mirrorSpecialEvent(world: World, state: Readonly<RunStateView>): void {
  const a = world.special.active;
  const kind = state.eventKind ?? EVENT_KIND_NONE_WIRE;
  if (kind === EVENT_KIND_NONE_WIRE || kind >= EVENT_KINDS.length) {
    a.kind = EVENT_NONE;
    a.phase = EVENT_PHASE.NONE;
    a.lane = -1;
    world.special.carAlarm.car = "";
    return;
  }
  a.kind = kind;
  a.phase = state.eventPhase ?? 0;
  a.startTick = state.eventStartTick ?? 0;
  a.phaseTick = state.eventPhaseTick ?? 0;
  a.x = (state.eventX ?? 0) / 100;
  a.y = (state.eventY ?? 0) / 100;
  a.wave = state.wave;
  const lane = state.eventLane ?? 255;
  a.lane = lane === 255 ? -1 : lane;
  const car = world.special.carAlarm;
  if (EVENT_KINDS[kind] === "car_alarm") {
    if (car.car === "" || Math.abs((car.minX + car.maxX) / 2 - a.x) > 0.02 || Math.abs((car.minY + car.maxY) / 2 - a.y) > 0.02) {
      const c = world.map.cover.find((o) => o.kind === "car" && Math.abs((o.minX + o.maxX) / 2 - a.x) < 0.02 && Math.abs((o.minY + o.maxY) / 2 - a.y) < 0.02);
      car.car = c?.name ?? "";
      car.minX = c?.minX ?? a.x;
      car.minY = c?.minY ?? a.y;
      car.maxX = c?.maxX ?? a.x;
      car.maxY = c?.maxY ?? a.y;
    }
  } else car.car = "";
}
