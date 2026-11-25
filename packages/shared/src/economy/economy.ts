import type { SystemFn } from "../core/systems";
import type { World } from "../core/world";
import type { MoneyReason, SimEvent } from "../core/simEvents";
import { err, ok, type Result } from "../core/result";
import { MAX_PLAYERS } from "../net/messages";
import { zombieTypeOf } from "../zombies/zombiePool";
import { countBossKilled, countWaveEnded } from "../meta/runRecord";

/**
 * Story 3.2: personal wallets and rewards (GDD › Economy and Resources, FR12, FR45).
 *
 * Wallets live on the players (`PlayerState.wallet` / `earned`); this module is the only writer.
 * The economy system runs in the fixed `economy` slot (after combat, waves and the player system,
 * before the event flush) and pays from this tick's pending events, in emit order:
 *
 * - `zombie.hit` with a `sourceId` → that player is recorded as a damager of the zombie's slot;
 * - `zombie.killed` → the killer gets the type's reward, every other damager the assist share
 *   (rounded down); a kill with no killer (dev cheats) pays nothing; a turret's kill (Story 3.6,
 *   `buildingId` set) pays its owner `buildingKillShare` of the reward (rounded down), unless the
 *   owner damaged that zombie: then it is the owner's own kill (review M1, see `apply`);
 * - `player.revived` → the reviver gets `reviveReward`;
 * - `wave.ended { number }` → every player in the run (downed and out too) gets `number × waveClearBonusPerWave`.
 *
 * Events emitted between steps (a dev cheat, or Story 3.1's run state machine ending a wave) are
 * still pending at the next step, so they are paid there, exactly once.
 */

/** Most damagers remembered per zombie: one per player. */
export const MAX_DAMAGERS = MAX_PLAYERS;

export interface EconomyState {
  /** Player ids per zombie slot: `damagers[slot * MAX_DAMAGERS + k]`, `damagerCount[slot]` valid. Preallocated. */
  readonly damagers: (string | null)[];
  readonly damagerCount: Uint8Array;
}

export function createEconomyState(zombieCapacity: number): EconomyState {
  return {
    damagers: new Array<string | null>(zombieCapacity * MAX_DAMAGERS).fill(null),
    damagerCount: new Uint8Array(zombieCapacity),
  };
}

/** Remembers that `playerId` damaged the zombie in `zombieId` (once per player; extra players past MAX_DAMAGERS are ignored). */
export function recordDamager(world: World, zombieId: number, playerId: string): void {
  const e = world.economy;
  if (zombieId < 0 || zombieId >= e.damagerCount.length) return;
  const n = e.damagerCount[zombieId] as number;
  const base = zombieId * MAX_DAMAGERS;
  for (let k = 0; k < n; k++) if (e.damagers[base + k] === playerId) return;
  if (n >= MAX_DAMAGERS) return;
  e.damagers[base + n] = playerId;
  e.damagerCount[zombieId] = n + 1;
}

/** Story 3.6 review M1: whether `playerId` is a recorded damager of the zombie in `zombieId`. */
export function isDamager(world: Readonly<World>, zombieId: number, playerId: string): boolean {
  const e = world.economy;
  if (zombieId < 0 || zombieId >= e.damagerCount.length) return false;
  const n = e.damagerCount[zombieId] as number;
  const base = zombieId * MAX_DAMAGERS;
  for (let k = 0; k < n; k++) if (e.damagers[base + k] === playerId) return true;
  return false;
}

/** Forgets every damager of a zombie slot (after its kill is paid; `spawnZombie` also resets the count). */
export function clearDamagers(world: World, zombieId: number): void {
  const e = world.economy;
  if (zombieId < 0 || zombieId >= e.damagerCount.length) return;
  const base = zombieId * MAX_DAMAGERS;
  const n = e.damagerCount[zombieId] as number;
  for (let k = 0; k < n; k++) e.damagers[base + k] = null;
  e.damagerCount[zombieId] = 0;
}

/**
 * Pays `amount` into a player's wallet (and their `earned` total) and emits `money.earned`.
 * Nothing for an unknown player (left the run) or an amount ≤ 0.
 */
export function earn(world: World, playerId: string, amount: number, reason: MoneyReason): void {
  if (!(amount > 0)) return;
  // Story 8.1 (F5): a held player's turrets (and shots still in flight) pay into the held wallet.
  const p = world.players.get(playerId) ?? world.heldPlayers.get(playerId)?.player;
  if (!p) return;
  p.wallet += amount;
  p.earned += amount;
  world.events.emit({ type: "money.earned", playerId, amount, reason });
}

/**
 * Story 4.5: gives `amount` back to a player's wallet (a building a decay stage destroyed) and
 * emits `money.earned` with reason `refund`. Not counted in `earned` (money returned, not income).
 * Nothing for an unknown player (left the run) or an amount ≤ 0.
 */
export function refundMoney(world: World, playerId: string, amount: number): void {
  if (!(amount > 0)) return;
  const p = world.players.get(playerId);
  if (!p) return;
  p.wallet += amount;
  world.events.emit({ type: "money.earned", playerId, amount, reason: "refund" });
}

export type SpendError = "unknown_player" | "invalid_amount" | "insufficient_funds";

/**
 * Takes `amount` from a player's wallet (Story 3.3 shop, 3.4 buildings, 3.7 repairs: always
 * validated by the server). Returns the wallet left; on an error nothing changes. `earned` is never reduced.
 */
export function spendMoney(world: World, playerId: string, amount: number): Result<number, SpendError> {
  const p = world.players.get(playerId);
  if (!p) return err("unknown_player");
  if (!Number.isInteger(amount) || amount < 0) return err("invalid_amount");
  if (p.wallet < amount) return err("insufficient_funds");
  p.wallet -= amount;
  return ok(p.wallet);
}

/**
 * Pays the kill of the zombie in `zombieId`: `creditId` gets `floor(reward × share)` (`share` 1 for
 * a player's own kill; Story 3.6 credits a building's owner with `economy.buildingKillShare`), and
 * every other recorded damager gets `floor(reward × assistShare)`. Then the slot's damagers are
 * cleared. Call it the tick the kill happens or the next: the freed slot still holds the zombie's
 * type (slots are held ZOMBIE_SLOT_HOLD_TICKS before reuse). `creditId` null pays no one.
 */
export function payKill(world: World, zombieId: number, creditId: string | null, share: number): void {
  if (creditId !== null) {
    const stats = world.balance.zombies.types[zombieTypeOf(world.zombies, zombieId)];
    const reward = stats?.reward ?? 0;
    earn(world, creditId, Math.floor(reward * share), "kill");
    const assist = Math.floor(reward * world.balance.economy.assistShare);
    const e = world.economy;
    const n = e.damagerCount[zombieId] ?? 0;
    const base = zombieId * MAX_DAMAGERS;
    for (let k = 0; k < n; k++) {
      const id = e.damagers[base + k];
      if (id !== null && id !== undefined && id !== creditId) earn(world, id, assist, "assist");
    }
  }
  clearDamagers(world, zombieId);
}

function waveBonus(world: World, number: number): void {
  const amount = number * world.balance.economy.waveClearBonusPerWave;
  for (const id of world.players.keys()) earn(world, id, amount, "wave"); // once per wave: an iterator is fine
}

function apply(world: World, e: SimEvent): void {
  switch (e.type) {
    case "zombie.hit":
      if (e.sourceId !== null) recordDamager(world, e.zombieId, e.sourceId);
      break;
    case "zombie.killed":
      if (e.buildingId !== undefined) {
        // Story 3.6 review M1 (main session decision): a turret never steals its owner's kill. If
        // the owner damaged this zombie, the kill becomes theirs (full reward, counted as their
        // kill): the still-pending event loses its building id, so every reader after this system
        // (the kill counters, the wire, the client) sees an ordinary kill by the owner.
        if (e.killerId !== null && isDamager(world, e.zombieId, e.killerId)) {
          delete (e as { buildingId?: number }).buildingId;
          payKill(world, e.zombieId, e.killerId, 1);
        } else {
          // FR45: otherwise the owner gets `buildingKillShare` of the reward (not their kill).
          payKill(world, e.zombieId, e.killerId, world.balance.economy.buildingKillShare);
        }
        break;
      }
      payKill(world, e.zombieId, e.killerId, 1);
      break;
    case "player.revived":
      earn(world, e.reviverId, world.balance.economy.reviveReward, "revive");
      break;
    case "wave.ended":
      waveBonus(world, e.number);
      countWaveEnded(world, e.number); // Story 7.2 (S2): the same "who is in the run" moment as the money, plus held players
      break;
    case "boss.killed":
      countBossKilled(world); // Story 7.2 (S1): the Behemoth line of the run's Supplies
      break;
    default:
      break;
  }
}

/** The economy system (fixed `economy` slot). Reads this tick's pending events; its own `money.earned` are not re-read. */
export const updateEconomy: SystemFn = (world) => {
  const bus = world.events;
  const n = bus.pendingCount;
  for (let i = 0; i < n; i++) {
    const e = bus.pendingAt(i);
    if (e) apply(world, e);
  }
};
