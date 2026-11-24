import { carAlarmModule } from "./carAlarm";
import type { EventModule } from "./common";
import { EVENT_KINDS, type EventKind } from "./eventState";
import { stampedeModule } from "./stampede";

/**
 * Story 6.8 (AC 1): every event kind's module, by `EVENT_KINDS` index. This story builds the car
 * alarm and the stampede; the others are stubs whose `fits` is false until their story lands
 * (6.9: gas_leak, supply_drop; 6.10: power_failure, survivor) — they replace their stub here.
 */
function stub(kind: EventKind): EventModule {
  return {
    kind,
    fits: () => false,
    start: () => false,
    update: () => true,
    end: () => {},
    holdsWave: () => false,
  };
}

/**
 * Built on first use (not at module load): the event modules sit in an import cycle with the wave
 * director and combat (`stampede` reads `maxAliveNow`; `firing` calls the shot hook).
 */
let modules: readonly EventModule[] | null = null;
export function eventModules(): readonly EventModule[] {
  if (modules === null) {
    modules = EVENT_KINDS.map((k) => {
      switch (k) {
        case "car_alarm":
          return carAlarmModule;
        case "stampede":
          return stampedeModule;
        default:
          return stub(k);
      }
    });
  }
  return modules;
}

export function eventModule(kind: number): EventModule | null {
  return eventModules()[kind] ?? null;
}
