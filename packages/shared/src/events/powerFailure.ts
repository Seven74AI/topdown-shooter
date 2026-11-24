import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { refreshBlackout, wavePct } from "../decay/lightState";
import { EVENT_PHASE } from "./eventState";
import { setEventPhase, type EventModule } from "./common";

/**
 * Story 6.10 (FR42, D1, D7; P1–P3): the power failure.
 *
 * - Gate (P3): the wave is one of `events.json › powerFailure.waves` (6, 7, 8) and not already a
 *   full blackout wave (`decay.json › blackout.lightPctByWave` entry 0). 6.12's even endless waves
 *   (half dark, D3/D6) qualify through its own hook.
 * - FLICKER `flickerS` (2 s = 40 ticks): banner + sound + every lamp flickering, no darkness yet (P1).
 * - DARK until the wave ends: `world.lights.powerFailure = true` and 6.3's `refreshBlackout` (the ONLY
 *   writer of `blackoutPct`, DD1) applies `blackout.powerFailureLightPct` (20 %, BL2) — synced, so
 *   every phone (a late join, a woken tab) draws the same darkness (P2, brief 26). The wave's end
 *   clears the flag and refreshes again: the next build phase has its normal light.
 * - Never holds the wave.
 */

/** P3: wave `wave` may have a power failure (6.12 calls this for endless). */
export function powerFailureWave(world: Readonly<World>, wave: number): boolean {
  return world.balance.events.powerFailure.waves.includes(wave) && wavePct(world, wave) <= 0;
}

export const powerFailureModule: EventModule = {
  kind: "power_failure",
  fits(world, wave) {
    return powerFailureWave(world, wave);
  },
  start(world) {
    world.special.active.phase = EVENT_PHASE.FLICKER;
    // The marker sits at the map's centre (no spot: the whole map goes dark).
    world.special.active.x = world.map.widthM / 2;
    world.special.active.y = world.map.heightM / 2;
    return true;
  },
  update(world) {
    const a = world.special.active;
    if (a.phase === EVENT_PHASE.FLICKER && world.tick - a.phaseTick >= ticksFor(world.balance.events.powerFailure.flickerS)) {
      setEventPhase(world, EVENT_PHASE.DARK, null);
      world.lights.powerFailure = true;
      refreshBlackout(world);
      world.special.log.powerFailures++;
    }
    return null; // dark until the wave ends (`wave_end`)
  },
  end(world) {
    if (!world.lights.powerFailure) return;
    world.lights.powerFailure = false;
    refreshBlackout(world);
  },
  holdsWave() {
    return false;
  },
};
