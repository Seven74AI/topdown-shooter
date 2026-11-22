import type { World } from "../core/world";
import type { PlayerState } from "./player";

/** The search in progress (synchronous, so one shared record is enough: no closure per call). */
const search: { exclude: string; best: PlayerState | null } = { exclude: "", best: null };

function visit(p: PlayerState): void {
  if (p.status !== "alive" || p.id === search.exclude) return;
  if (search.best === null || p.id < search.best.id) search.best = p;
}

/**
 * The lowest-slot standing teammate of `playerId` (Story 2.8), or null when no one else stands.
 * Player ids are `"p" + slot` online, so the lowest id is the lowest slot.
 *
 * Used for: where an out player returns next wave, and what an out player spectates (the server's
 * horde interest and the client camera call this same function, so the streamed view always matches
 * what the camera shows). Allocation-free.
 */
export function spectateTarget(world: Readonly<World>, playerId: string): PlayerState | null {
  search.exclude = playerId;
  search.best = null;
  world.players.forEach(visit);
  const best = search.best;
  search.best = null;
  return best;
}
