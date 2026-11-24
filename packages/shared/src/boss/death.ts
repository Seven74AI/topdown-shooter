import type { World } from "../core/world";
import { earn } from "../economy/economy";
import { BOSS_ATTACK, BOSS_STATE } from "./bossState";
import { bossStats } from "./telegraph";

/**
 * Story 6.7 (F5–F7, DD3, DD4): the Behemoth dies (`applyBossDamage` at 0 HP).
 *
 * - DEAD at once: its live attack is cancelled (a telegraph never resolves, a rush stops, a chunk in
 *   flight never lands); `updateBoss` returns early on DEAD, so a kill in `combat` (or a turret in
 *   `buildings`, a Bloater blast in `zombies`) is before the boss's own system the same tick.
 * - Every player in the World (standing, downed or out) earns `killPay` through `earn` (reason
 *   "boss"), once: a second call on a dead boss does nothing.
 * - `boss.killed` names the killer (+1 kill on Results, counted by the hosts) for the "EVAC INBOUND" banner.
 * - The alive cap is back to `waves.maxAlive` this tick (`bossActive` is false for DEAD); the wave still
 *   has to be cleared (F7). The body stays (not solid, `bossBodyOn` false) until the build start.
 */
export function killBoss(world: World, killerId: string | null = null, weapon = ""): void {
  const b = world.boss;
  if (b.state === BOSS_STATE.DEAD || b.state === BOSS_STATE.NONE) return;
  b.hp = 0;
  b.state = BOSS_STATE.DEAD;
  b.stateTicks = 0;
  b.targetId = null;
  b.gapTicks = 0;
  b.crawlerTicks = 0;
  const a = b.attack;
  a.live = false; // F5
  a.kind = BOSS_ATTACK.NONE;
  bossStats.kills++;
  const pay = world.balance.boss.killPay;
  for (const p of world.players.values()) earn(world, p.id, pay, "boss"); // F6: everyone, downed and out too
  world.events.emit({ type: "boss.killed", killerId: killerId !== null && world.players.has(killerId) ? killerId : null, weapon, x: b.x, y: b.y, number: b.number });
}
