import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { THREAT_BUCKET_TICKS, THREAT_BUCKETS } from "./bossState";

/**
 * Story 6.5 (F7, DD7): who the Behemoth goes after. Each player slot (the flame slot table,
 * `world.flameSlots`) has a ring of 10 half-second damage buckets (5 s); the head advances every 10
 * ticks. The target is the standing player with the largest 5 s sum (ties → nearer → lower slot); it
 * switches at most once every `target.switchMinS`, except at once when its target goes down or leaves.
 * Never a downed or out player.
 */

/** The player slot of `playerId` (the flame slot table, 0–3), or -1. */
export function bossSlotOf(world: Readonly<World>, playerId: string | null): number {
  if (playerId === null) return -1;
  const slots = world.flameSlots;
  for (let s = 0; s < slots.length; s++) if (slots[s] === playerId) return s;
  return -1;
}

/** Adds `amount` to `playerId`'s current threat bucket (any hit on the boss by a player). */
export function recordBossThreat(world: World, playerId: string | null, amount: number): void {
  const s = bossSlotOf(world, playerId);
  if (s < 0 || !(amount > 0)) return;
  const b = world.boss;
  const i = s * THREAT_BUCKETS + b.threatHead;
  b.threat[i] = (b.threat[i] as number) + amount;
}

/** Advances the ring every `THREAT_BUCKET_TICKS` ticks (the oldest half second drops out). */
export function advanceThreat(world: World): void {
  if (world.tick % THREAT_BUCKET_TICKS !== 0) return;
  const b = world.boss;
  b.threatHead = (b.threatHead + 1) % THREAT_BUCKETS;
  for (let s = 0; s * THREAT_BUCKETS < b.threat.length; s++) b.threat[s * THREAT_BUCKETS + b.threatHead] = 0;
}

/** A slot's damage in the last 5 s. */
export function threatOf(world: Readonly<World>, slot: number): number {
  const t = world.boss.threat;
  let sum = 0;
  for (let k = 0; k < THREAT_BUCKETS; k++) sum += t[slot * THREAT_BUCKETS + k] as number;
  return sum;
}

/** A player slot left: its threat goes (the target rule then switches at once). */
export function clearBossThreatSlot(world: World, slot: number): void {
  if (slot < 0) return;
  world.boss.threat.fill(0, slot * THREAT_BUCKETS, slot * THREAT_BUCKETS + THREAT_BUCKETS);
}

const pick = { world: null as World | null, best: null as PlayerState | null, bestThreat: 0, bestD2: 0, bestSlot: 0 };
const considerPlayer = (p: PlayerState): void => {
  if (p.status !== "alive") return; // F9: never a downed or out player
  const world = pick.world as World;
  const slot = bossSlotOf(world, p.id);
  const th = slot >= 0 ? threatOf(world, slot) : 0;
  const dx = p.x - world.boss.x;
  const dy = p.y - world.boss.y;
  const d2 = dx * dx + dy * dy;
  const s = slot < 0 ? 99 : slot;
  const b = pick.best;
  if (b === null || th > pick.bestThreat || (th === pick.bestThreat && (d2 < pick.bestD2 || (d2 === pick.bestD2 && s < pick.bestSlot)))) {
    pick.best = p;
    pick.bestThreat = th;
    pick.bestD2 = d2;
    pick.bestSlot = s;
  }
};

/**
 * The target rule, once per tick while the body is on the map. Keeps the current target while it
 * stands, is in the World and was chosen less than `switchMinS` ago; else picks again (the same
 * player may win again: no event). Emits `boss.target_changed` on a change. Returns the target or null.
 */
export function pickBossTarget(world: World): PlayerState | null {
  const b = world.boss;
  const cur = b.targetId !== null ? world.players.get(b.targetId) : undefined;
  if (cur && cur.status === "alive" && world.tick - b.lastSwitchTick < ticksFor(world.balance.boss.target.switchMinS)) return cur;
  pick.world = world;
  pick.best = null;
  world.players.forEach(considerPlayer);
  const best = pick.best as PlayerState | null;
  pick.world = null;
  pick.best = null;
  const id = best ? best.id : null;
  if (id !== b.targetId) {
    b.targetId = id;
    b.lastSwitchTick = world.tick;
    world.events.emit({ type: "boss.target_changed", playerId: id });
  }
  return best;
}
