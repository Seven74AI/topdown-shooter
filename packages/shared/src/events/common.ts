import type { World } from "../core/world";
import { EVENT_KINDS, type EventKind, type EventOutcome } from "./eventState";

/**
 * Story 6.8: one special event (FR37). Registered in `events/registry.ts` by its `EVENT_KINDS` index;
 * 6.9 / 6.10 add theirs. The framework (`specialEvents.ts`) owns the active slot, the bus events
 * (`event.triggered` / `event.ended`) and the log; a module owns its own record and phases.
 */
export interface EventModule {
  readonly kind: EventKind;
  /** F9 gate at schedule time for `wave` (the stage that wave will have) and at trigger (the current stage). */
  fits(world: Readonly<World>, wave: number): boolean;
  /**
   * Starts it now: picks its spot (stream `events` only), writes `world.special.active` x, y, lane,
   * phase and its own record. False when it can't start now (→ `event.skipped`).
   */
  start(world: World): boolean;
  /** One tick while active. True when it is over (→ `end(world, "done")`). */
  update(world: World): boolean;
  /** Clears its record and side effects (lure, Runners) for any outcome. */
  end(world: World, outcome: EventOutcome): void;
  /** F8 / D6: the wave can't end while this is true. */
  holdsWave(world: Readonly<World>): boolean;
}

/** `teamCentre` result (reused). */
export const centre = { x: 0, y: 0 };

/** DD7: the mean position of the standing players into `centre`; false when nobody stands. */
export function teamCentre(world: Readonly<World>): boolean {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (const p of world.players.values()) {
    if (p.status !== "alive") continue;
    sx += p.x;
    sy += p.y;
    n++;
  }
  if (n === 0) return false;
  centre.x = sx / n;
  centre.y = sy / n;
  return true;
}

/** The active event moves to `phase` this tick (`event.phase_changed`; `playerId` = who did it). */
export function setEventPhase(world: World, phase: number, playerId: string | null = null): void {
  const a = world.special.active;
  a.phase = phase;
  a.phaseTick = world.tick;
  world.events.emit({ type: "event.phase_changed", kind: EVENT_KINDS[a.kind] as EventKind, phase, tick: world.tick, playerId });
}

/** The 0–3 slot of a player id in `world.flameSlots` (the player slot table), or −1. */
export function playerSlotIndex(world: Readonly<World>, id: string): number {
  const slots = world.flameSlots;
  for (let s = 0; s < slots.length; s++) if (slots[s] === id) return s;
  return -1;
}

/** Players in the run, standing, downed or out (D11: counts everyone, like the wave size). */
export function playersInRun(world: Readonly<World>): number {
  return world.players.size;
}
