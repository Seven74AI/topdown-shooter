import { ticksFor } from "../core/time";
import { TICK_DT_S } from "../config/constants";
import type { World } from "../core/world";
import type { EventSpot } from "../map/districtMap";
import type { PlayerState } from "../player/player";
import { circleInFire, stageForWave } from "../decay/decayState";
import { boxOrFireBlocked } from "../player/freeSpot";
import { pushOutOfBuildings, pushed } from "../buildings/collision";
import { earn } from "../economy/economy";
import { EVENT_PHASE, NPC_STATE, type SurvivorState } from "./eventState";
import { centre, setEventPhase, teamCentre, type EventModule } from "./common";
import { endSpecialEvent } from "./specialEvents";

/**
 * Story 6.10 (FR43, D2–D6, D8–D10; S1–S5): the survivor NPC and its safe point.
 *
 * - Gate (F9): an open `survivor` spot and an open `safe` spot ≥ `safeMinFromNpcM` (20 m) apart.
 * - Spawn (stream `events`): the NPC among the open survivor spots ≥ `minFromTeamM` (15 m) from the
 *   team centre, free of boxes, buildings and fire (none → the farthest free one); the safe point
 *   among the open safe spots ≥ 20 m from it (none → the farthest); the look SV1/SV2/SV3.
 * - S2 leader rule: it follows the nearest STANDING player whose centre comes within `pickUpM` (3 m),
 *   until that leader is beyond `loseM` (6 m), downed or gone; then it crouches and waits.
 * - Movement (server/solo; never predicted, DD3): toward the point `followGapM` behind the leader at
 *   up to `speedMps` (4.0), never into a burning fire (it stops at the edge, DD5), pushed out of every
 *   box and building (`pushOutOfBuildings`), clamped to the map.
 * - S3: zombies target it like a player (`zombies/zombieAi.ts` target list, the chase seeding, the
 *   Spitters' list); S4: only zombies (bites, spit, acid, Bloater blasts) and fires hurt it
 *   (`damageSurvivor`).
 * - S5: its centre within `saveRadiusM` (2 m) of the flag → +`reward` to EVERY player in the run (D5,
 *   money reason "event"), it waves `waveOffS`, the event ends "done". HP 0 → "failed"; the wave's end
 *   first → "wave_end" (nobody gets anything).
 */

const LOOKS = 3;

const openSpot = (s: EventSpot, kind: EventSpot["kind"], stage: number): boolean => s.kind === kind && s.minStage <= stage;

/** S1 gate: an open survivor spot with an open safe spot ≥ `safeMinFromNpcM` away. */
export function survivorFits(world: Readonly<World>, stage: number): boolean {
  const spots = world.map.eventSpots;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i] as EventSpot;
    if (openSpot(s, "survivor", stage) && hasFarSafe(world, s, stage)) return true;
  }
  return false;
}

/** A survivor spot with an open safe spot ≥ `safeMinFromNpcM` away (S1). */
function hasFarSafe(world: Readonly<World>, s: EventSpot, stage: number): boolean {
  const spots = world.map.eventSpots;
  const m = world.balance.events.survivor.safeMinFromNpcM;
  for (let j = 0; j < spots.length; j++) {
    const t = spots[j] as EventSpot;
    if (openSpot(t, "safe", stage) && (t.x - s.x) ** 2 + (t.y - s.y) ** 2 >= m * m) return true;
  }
  return false;
}

/** Open, free of boxes / fire at `clearR` (> 0), and for the NPC one with a far-enough flag. */
function usable(world: Readonly<World>, s: EventSpot, kind: EventSpot["kind"], stage: number, clearR: number): boolean {
  if (!openSpot(s, kind, stage) || (clearR > 0 && boxOrFireBlocked(world, s.x, s.y, clearR))) return false;
  return kind !== "survivor" || hasFarSafe(world, s, stage);
}

/**
 * Picks among the open spots of `kind` (free of boxes / fire at `clearR` when `clearR` > 0) whose
 * distance from (fx, fy) is ≥ `minM`, stream `events`; none → the farthest such open spot.
 */
function pickSpot(world: World, kind: EventSpot["kind"], fx: number, fy: number, minM: number, clearR: number): EventSpot | null {
  const spots = world.map.eventSpots;
  const stage = world.decay.stage;
  const min2 = minM * minM;
  let inRange = 0;
  let farthest: EventSpot | null = null;
  let farthestD2 = -1;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i] as EventSpot;
    if (!usable(world, s, kind, stage, clearR)) continue;
    const d2 = (s.x - fx) ** 2 + (s.y - fy) ** 2;
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
    if (!usable(world, s, kind, stage, clearR)) continue;
    if ((s.x - fx) ** 2 + (s.y - fy) ** 2 < min2) continue;
    if (k-- === 0) return s;
  }
  return null; // unreachable
}

/** The living survivor zombies can target this tick (S3), or null. No allocation. */
export function survivorTarget(world: Readonly<World>): SurvivorState | null {
  const n = world.special.survivor;
  return n.status === "alive" ? n : null;
}

/**
 * S3 / S4: damage to the survivor (zombie bites, spit and acid, a Bloater blast, fire). No slow, no
 * knockback, no downed state; at 0 HP it dies (the event ends "failed" on its next tick). God mode
 * (dev) spares it like the players. Returns the damage taken.
 */
export function damageSurvivor(world: World, amount: number): number {
  const n = world.special.survivor;
  if (n.status !== "alive" || amount <= 0 || world.debug.godMode) return 0;
  const taken = Math.min(n.hp, amount);
  n.hp -= taken;
  if (n.hp <= 0) {
    n.hp = 0;
    n.status = "dead";
    n.state = NPC_STATE.DEAD;
  }
  return taken;
}

function playerInSlot(world: Readonly<World>, slot: number): PlayerState | undefined {
  const id = slot >= 0 ? world.flameSlots[slot] : null;
  return id ? world.players.get(id) : undefined;
}

/** S2: the nearest standing player within `pickUpM` of the NPC (slot order on ties), or −1. */
function nearestStandingSlot(world: Readonly<World>, n: Readonly<SurvivorState>, m: number): number {
  let best = -1;
  let bestD2 = m * m;
  for (let s = 0; s < world.flameSlots.length; s++) {
    const p = playerInSlot(world, s);
    if (!p || p.status !== "alive") continue;
    const d2 = (p.x - n.x) ** 2 + (p.y - n.y) ** 2;
    if (d2 <= bestD2 && (best < 0 || d2 < bestD2)) {
      best = s;
      bestD2 = d2;
    }
  }
  return best;
}

/** One movement tick toward the point `followGapM` behind `leader` (fire stop, push-out, clamp). */
function follow(world: World, n: SurvivorState, leader: Readonly<PlayerState>): void {
  const cfg = world.balance.events.survivor;
  let dx = n.x - leader.x;
  let dy = n.y - leader.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return;
  dx /= d;
  dy /= d;
  const tx = leader.x + dx * cfg.followGapM;
  const ty = leader.y + dy * cfg.followGapM;
  const mx = tx - n.x;
  const my = ty - n.y;
  const md = Math.sqrt(mx * mx + my * my);
  if (md < 1e-6) return;
  const step = Math.min(md, cfg.speedMps * TICK_DT_S);
  let nx = n.x + (mx / md) * step;
  let ny = n.y + (my / md) * step;
  const r = n.radiusM;
  // DD5: it never walks into a burning fire (stops at the edge).
  if (circleInFire(world.decay.fires, nx, ny, r) && !circleInFire(world.decay.fires, n.x, n.y, r)) return;
  pushOutOfBuildings(world, nx, ny, r, n.x, n.y);
  nx = pushed.x;
  ny = pushed.y;
  const { widthM, heightM } = world.map;
  n.x = Math.min(widthM - r, Math.max(r, nx));
  n.y = Math.min(heightM - r, Math.max(r, ny));
}

function clearNpc(n: SurvivorState): void {
  n.state = NPC_STATE.NONE;
  n.status = "dead";
  n.leaderSlot = -1;
  n.acidTicks = 0;
}

export const survivorModule: EventModule = {
  kind: "survivor",
  fits(world, wave) {
    const stage = world.run.phase === "wave" && world.waves.number === wave ? world.decay.stage : stageForWave(world.balance, wave, world.debug.decayStageByWave);
    return survivorFits(world, stage);
  },
  start(world) {
    if (!teamCentre(world)) return false;
    const cfg = world.balance.events.survivor;
    const at = pickSpot(world, "survivor", centre.x, centre.y, cfg.minFromTeamM, cfg.radiusM);
    if (!at) return false;
    const safe = pickSpot(world, "safe", at.x, at.y, cfg.safeMinFromNpcM, 0);
    if (!safe) return false;
    const n = world.special.survivor;
    n.x = at.x;
    n.y = at.y;
    n.prevX = at.x;
    n.prevY = at.y;
    n.hp = cfg.hp;
    n.radiusM = cfg.radiusM;
    n.state = NPC_STATE.WAITING;
    n.status = "alive";
    n.look = world.streams.events.int(0, LOOKS - 1);
    n.leaderSlot = -1;
    n.safeX = safe.x;
    n.safeY = safe.y;
    n.acidTicks = 0;
    const a = world.special.active;
    a.x = at.x;
    a.y = at.y;
    a.phase = EVENT_PHASE.WAITING;
    return true;
  },
  update(world) {
    const n = world.special.survivor;
    const a = world.special.active;
    const cfg = world.balance.events.survivor;
    if (n.state === NPC_STATE.SAVED) return world.tick - a.phaseTick >= ticksFor(cfg.waveOffS);
    if (n.state === NPC_STATE.DEAD || n.status !== "alive") {
      world.special.log.survivorsLost++;
      endSpecialEvent(world, "failed"); // S5: dead → nothing for anyone
      return false;
    }
    n.prevX = n.x;
    n.prevY = n.y;
    // S2: keep the leader while standing within loseM; else the nearest standing player within pickUpM.
    let leader = playerInSlot(world, n.leaderSlot);
    if (leader && (leader.status !== "alive" || (leader.x - n.x) ** 2 + (leader.y - n.y) ** 2 > cfg.loseM * cfg.loseM)) leader = undefined;
    if (!leader) {
      const s = nearestStandingSlot(world, n, cfg.pickUpM);
      leader = playerInSlot(world, s);
      if (n.leaderSlot !== s) {
        n.leaderSlot = s;
        n.state = s >= 0 ? NPC_STATE.FOLLOWING : NPC_STATE.WAITING;
        setEventPhase(world, s >= 0 ? EVENT_PHASE.FOLLOWING : EVENT_PHASE.WAITING, leader?.id ?? null);
      }
    }
    if (leader) follow(world, n, leader);
    a.x = n.x; // the marker follows the NPC (the room state carries npcX/npcY too)
    a.y = n.y;
    // S5: saved at the flag.
    if ((n.x - n.safeX) ** 2 + (n.y - n.safeY) ** 2 <= cfg.saveRadiusM * cfg.saveRadiusM) {
      n.state = NPC_STATE.SAVED;
      n.status = "dead"; // zombies lose interest (it is safe)
      n.leaderSlot = -1;
      for (const id of world.players.keys()) earn(world, id, cfg.reward, "event"); // D5: everyone, downed too
      world.special.log.survivorsSaved++;
      setEventPhase(world, EVENT_PHASE.SAVED, null);
      return cfg.waveOffS <= 0;
    }
    return false;
  },
  end(world, outcome) {
    const n = world.special.survivor;
    if (outcome === "wave_end" && n.state !== NPC_STATE.SAVED && n.state !== NPC_STATE.DEAD) world.special.log.survivorsLost++;
    clearNpc(n);
  },
  holdsWave() {
    return false; // the wave still ends with it alive (S5: nothing paid)
  },
};
