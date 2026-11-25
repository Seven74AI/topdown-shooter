import { carAlarmModule } from "./carAlarm";
import type { EventModule } from "./common";
import { EVENT_KINDS, type EventKind } from "./eventState";
import { stampedeModule } from "./stampede";
import { gasLeakModule } from "./gasLeak";
import { supplyDropModule } from "./supplyDrop";
import { powerFailureModule } from "./powerFailure";
import { survivorModule } from "./survivor";

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
    update: () => "done" as const,
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
        case "gas_leak":
          return gasLeakModule; // Story 6.9
        case "supply_drop":
          return supplyDropModule; // Story 6.9
        case "power_failure":
          return powerFailureModule; // Story 6.10
        case "survivor":
          return survivorModule; // Story 6.10
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
