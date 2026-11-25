import { TICK_DT_S } from "../config/constants";
import { loadBalance, type Balance } from "../config/balance";
import type { SimEvent } from "../core/simEvents";
import type { Systems } from "../core/systems";
import { createWorld, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer, type PlayerState } from "../player/player";
import { EVENT_KINDS, type EventKind } from "./eventState";

/**
 * Story 6.8 test helpers (event tests only): a Downtown World frozen in wave `wave` (the wave
 * director paused: no spawns, no wave end) whose extra entry starts `kind` on the next tick.
 */
export const balance: Balance = loadBalance();

export function eventWorld(opts: { seed?: number; players?: readonly [number, number][]; systems?: Partial<Systems>; wave?: number } = {}): { world: World; players: PlayerState[]; events: SimEvent[] } {
  const world = createWorld({ balance, seed: opts.seed ?? 11, map: DOWNTOWN_MAP, systems: opts.systems ?? {} });
  const players = (opts.players ?? [[24, 16]]).map(([x, y], i) => addPlayer(world, `p${i}`, x, y));
  world.run.phase = "wave";
  world.waves.number = opts.wave ?? 3;
  world.waves.size = 100;
  world.waves.queued = 0;
  world.waves.paused = true;
  world.special.scheduled = true; // no draw: the test says what starts
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  return { world, players, events };
}

/** The next tick starts `kind` (start fraction 0: at once). */
export function startNext(world: World, kind: EventKind): void {
  const x = world.special.extra;
  x.kind = EVENT_KINDS.indexOf(kind);
  x.wave = world.waves.number;
  x.startFraction = 0;
  world.special.extraDone = false;
}

export function tickN(world: World, n = 1): void {
  for (let i = 0; i < n; i++) step(world, TICK_DT_S);
}

export function ofType<T extends SimEvent["type"]>(events: readonly SimEvent[], type: T): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}
