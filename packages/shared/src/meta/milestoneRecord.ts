import type { SimEvent } from "../core/simEvents";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";

/**
 * Story 7.11 (AC 3, M-F1, M-F2): the per-seat counters milestones are checked from, kept on the player's state
 * next to 7.2's run record (so a held seat, 8.1, and a remembered seat carry them; a late joiner starts at 0).
 * Counted in the economy system's pass over the tick's events (the same place as 7.2's waves), from World
 * events only — no client message changes them:
 *
 * - `waveMask` — bit (n − 1) for every wave n ≤ 31 that ended while the seat was in the run (set in `runRecord`'s
 *   `countWaveEnded`, which also covers held seats and the wave a team wipe falls in);
 * - `kills` — own `zombie.killed` (not a turret's or a mine's: `buildingId` set) + 1 for finishing the Behemoth (D6);
 * - `revives` — `player.revived` by the reviver, in phase `wave` only (the phase at the revive, review N1), and only of
 *   a down no player caused (B31 amended: `downedBy === null`; no friendly-fire revive farm, in pairs or rotations);
 * - `downs10` — `player.downed` in phase `wave` of waves 1 … `runWaves` (D7: endless downs don't matter; review L2: a
 *   friendly-fire down in the build phase doesn't either);
 * - `barricades` — barricades this player PLACED that still stand when the next wave starts (D3: a take-back in the
 *   same build gives nothing; an upgrade or a move is no placement). Placed ids wait in `barricadesPending`.
 */

/** The barricade family: placements of these count toward M7 (5.9: reinforced and metal are upgrades of wood). */
const BARRICADES: ReadonlySet<string> = new Set(["wood_barricade", "reinforced_barricade", "metal_barricade"]);

function seat(world: World, id: string | null): PlayerState | undefined {
  if (id === null) return undefined;
  return world.players.get(id) ?? world.heldPlayers.get(id)?.player;
}

let promoting: World | null = null;
const standing = (list: readonly { readonly id: number }[], id: number): boolean => {
  for (let i = 0; i < list.length; i++) if ((list[i] as { readonly id: number }).id === id) return true;
  return false;
};
/** Module-level callbacks (no closure per wave start): pending barricades still standing → counted. */
const promote = (p: PlayerState): void => {
  const pending = p.barricadesPending;
  const list = (promoting as World).buildings.list;
  for (let i = 0; i < pending.length; i++) if (standing(list, pending[i] as number)) p.barricades = Math.min(0xffff, p.barricades + 1);
  pending.length = 0;
};
const promoteHeld = (h: { readonly player: PlayerState }): void => promote(h.player);

/** One event of the tick (called by the economy system for every pending event). */
export function countMilestoneEvent(world: World, e: SimEvent): void {
  switch (e.type) {
    case "zombie.killed": {
      if (e.buildingId !== undefined) return; // a turret's / mine's kill is not the owner's (D6)
      const p = seat(world, e.killerId);
      if (p) p.kills = Math.min(0xffffff, p.kills + 1);
      return;
    }
    case "boss.killed": {
      const p = seat(world, e.killerId);
      if (p) p.kills = Math.min(0xffffff, p.kills + 1);
      return;
    }
    case "player.revived": {
      const p = seat(world, e.reviverId);
      const downed = seat(world, e.playerId);
      // B31 amended (review round 2 L3): only a down with no player source (a teammate rotation can't farm it); N1: the phase at the revive
      if (p && (e.inWave ?? world.run.phase === "wave") && downed !== undefined && downed.downedBy === null) p.revives = Math.min(0xffff, p.revives + 1);
      return;
    }
    case "player.downed": {
      const p = seat(world, e.playerId);
      if (p && (e.inWave ?? world.run.phase === "wave") && world.waves.number <= world.balance.waves.runWaves) p.downs10 = Math.min(0xff, p.downs10 + 1);
      return;
    }
    case "building.placed": {
      if (!BARRICADES.has(e.buildingType)) return;
      const p = seat(world, e.ownerId);
      if (p) p.barricadesPending.push(e.buildingId);
      return;
    }
    case "wave.started":
      promoting = world;
      world.players.forEach(promote);
      world.heldPlayers.forEach(promoteHeld);
      promoting = null;
      return;
    default:
      return;
  }
}

/** The wave mask's bit for wave `n` (0 past wave 31: no milestone needs one). */
export const waveBit = (n: number): number => (n >= 1 && n <= 31 ? 1 << (n - 1) : 0);
/** Wave `n` ended while this seat was in the run. */
export const hadWave = (mask: number, n: number): boolean => (mask & waveBit(n)) !== 0;
