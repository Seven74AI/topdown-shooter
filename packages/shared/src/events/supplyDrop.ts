import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { EventSpot } from "../map/districtMap";
import type { PlayerState } from "../player/player";
import { stageForWave } from "../decay/decayState";
import { boxOrFireBlocked } from "../player/freeSpot";
import { weaponIds } from "../combat/weapons";
import { crateRefusal, giveCrateWeapon } from "../economy/shop";
import { EVENT_PHASE } from "./eventState";
import { centre, setEventPhase, teamCentre, type EventModule } from "./common";

/**
 * Story 6.9 (FR40, D6–D12, SD2 + SD3): the supply drop.
 *
 * - Gate (F9): at least one `crate` spot (6.8's `map.eventSpots`) open at the stage.
 * - Spot (D12, stream `events`): among the open crate spots ≥ `minFromTeamM` (12 m) from the team
 *   centre whose `spotClearM` circle is free of boxes, buildings and burning fire; none → the
 *   farthest free open spot. Weapon (D7, stream `events`, equal chances) from `supplyDrop.weapons`
 *   at `level` (II).
 * - FLARE 5 s (G5: the marker already shows the weapon) → LANDED (takeable) → TAKEN (the event ends)
 *   or the wave ends (G8: untaken = lost; it vanishes at the build start).
 * - Taking it (G6, DD5): the claim is one player's (`claimSlot`, `claimTicks`); the claimant keeps it
 *   while standing with its centre within `takeRadiusM` (0.8 m); otherwise the claim resets and the
 *   first standing player in range (slot order) starts at 1. A player who already carries the weapon
 *   at `level` or higher can't claim (G7). At `ticksFor(takeS)` (20 ticks) → `giveCrateWeapon`.
 * - Never holds the wave (the wave's end takes it away).
 */

const spotOpen = (s: EventSpot, stage: number): boolean => s.kind === "crate" && s.minStage <= stage;

function countSpots(world: Readonly<World>, stage: number): number {
  const spots = world.map.eventSpots;
  let n = 0;
  for (let i = 0; i < spots.length; i++) if (spotOpen(spots[i] as EventSpot, stage)) n++;
  return n;
}

/** D12: the landing spot (reads `centre`); null when no open spot is free. Stream `events` only. */
export function pickCrateSpot(world: World): EventSpot | null {
  const spots = world.map.eventSpots;
  const cfg = world.balance.events.supplyDrop;
  const stage = world.decay.stage;
  const min2 = cfg.minFromTeamM * cfg.minFromTeamM;
  let inRange = 0;
  let farthest: EventSpot | null = null;
  let farthestD2 = -1;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i] as EventSpot;
    if (!spotOpen(s, stage) || boxOrFireBlocked(world, s.x, s.y, cfg.spotClearM)) continue;
    const dx = s.x - centre.x;
    const dy = s.y - centre.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min2) inRange++;
    if (d2 > farthestD2) {
      farthestD2 = d2;
      farthest = s;
    }
  }
  if (inRange === 0) return farthest;
  let k = world.streams.events.int(0, inRange - 1);
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i] as EventSpot;
    if (!spotOpen(s, stage) || boxOrFireBlocked(world, s.x, s.y, cfg.spotClearM)) continue;
    const dx = s.x - centre.x;
    const dy = s.y - centre.y;
    if (dx * dx + dy * dy < min2) continue;
    if (k-- === 0) return s;
  }
  return null; // unreachable
}

/** The player in slot `slot` of the player slot table, or undefined. */
function playerInSlot(world: Readonly<World>, slot: number): PlayerState | undefined {
  const id = slot >= 0 ? world.flameSlots[slot] : null;
  return id ? world.players.get(id) : undefined;
}

/** G6/G7: `p` may hold the claim on the crate at (x, y) this tick. */
function canClaim(world: Readonly<World>, p: PlayerState | undefined, x: number, y: number, r2: number): p is PlayerState {
  if (!p || p.status !== "alive") return false;
  const dx = p.x - x;
  const dy = p.y - y;
  if (dx * dx + dy * dy > r2) return false;
  const d = world.special.supplyDrop;
  const weapon = weaponIds(world.balance)[d.weapon];
  return weapon !== undefined && crateRefusal(p.loadout, weapon, d.level) === null;
}

/**
 * Review M1 ("first on it keeps the claim"): every FLARE and LANDED tick, the tick each player slot
 * stepped on the crate's spot and has stood there since (−1: not on it / can't claim). The landing
 * claim then goes to the earliest arrival, not the lowest slot.
 */
function updateOnSince(world: World): void {
  const a = world.special.active;
  const d = world.special.supplyDrop;
  const r = world.balance.events.supplyDrop.takeRadiusM;
  for (let s = 0; s < d.onSince.length; s++) {
    if (canClaim(world, playerInSlot(world, s), a.x, a.y, r * r)) {
      if ((d.onSince[s] as number) < 0) d.onSince[s] = world.tick;
    } else d.onSince[s] = -1;
  }
}

/** One LANDED tick: the claim (G6); true when the crate was taken this tick. */
function updateClaim(world: World): boolean {
  const d = world.special.supplyDrop;
  const cfg = world.balance.events.supplyDrop;
  updateOnSince(world);
  let holder = d.claimSlot >= 0 && (d.onSince[d.claimSlot] as number) >= 0 ? playerInSlot(world, d.claimSlot) : undefined;
  if (holder) {
    d.claimTicks++;
  } else {
    d.claimSlot = -1;
    d.claimTicks = 0;
    // the earliest arrival still on it (ties: slot order)
    let best = -1;
    for (let s = 0; s < d.onSince.length; s++) {
      const t = d.onSince[s] as number;
      if (t >= 0 && (best < 0 || t < (d.onSince[best] as number))) best = s;
    }
    if (best >= 0) {
      d.claimSlot = best;
      d.claimTicks = 1;
      holder = playerInSlot(world, best);
    }
  }
  if (!holder || d.claimTicks < ticksFor(cfg.takeS)) return false;
  const weapon = weaponIds(world.balance)[d.weapon] as string;
  if (giveCrateWeapon(world, holder.id, weapon, d.level) < 0) return false;
  d.takenBy = holder.id;
  world.special.log.cratesTaken++;
  setEventPhase(world, EVENT_PHASE.TAKEN, holder.id);
  return true;
}

export const supplyDropModule: EventModule = {
  kind: "supply_drop",
  fits(world, wave) {
    const stage = world.run.phase === "wave" && world.waves.number === wave ? world.decay.stage : stageForWave(world.balance, wave, world.debug.decayStageByWave);
    return countSpots(world, stage) > 0;
  },
  start(world) {
    if (!teamCentre(world)) return false;
    const spot = pickCrateSpot(world);
    if (!spot) return false;
    const cfg = world.balance.events.supplyDrop;
    const ids = weaponIds(world.balance);
    const w = cfg.weapons[world.streams.events.int(0, cfg.weapons.length - 1)] as string;
    const d = world.special.supplyDrop;
    d.weapon = ids.indexOf(w);
    d.level = cfg.level;
    d.claimSlot = -1;
    d.claimTicks = 0;
    d.takenBy = null;
    d.onSince.fill(-1);
    const a = world.special.active;
    a.x = spot.x;
    a.y = spot.y;
    a.phase = EVENT_PHASE.FLARE;
    return d.weapon >= 0;
  },
  update(world) {
    const a = world.special.active;
    if (a.phase === EVENT_PHASE.FLARE) {
      updateOnSince(world); // review M1: who was on the spot first, before it lands
      if (world.tick - a.phaseTick < ticksFor(world.balance.events.supplyDrop.flareS)) return null;
      setEventPhase(world, EVENT_PHASE.LANDED, null);
    }
    if (a.phase === EVENT_PHASE.LANDED) return updateClaim(world) ? "done" : null;
    return "done";
  },
  end(world) {
    const d = world.special.supplyDrop;
    d.weapon = -1;
    d.claimSlot = -1;
    d.claimTicks = 0;
  },
  holdsWave() {
    return false; // G8: the wave's end takes it away
  },
};
