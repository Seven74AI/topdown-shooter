import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { circleOverlapsBox } from "../buildings/collision";
import type { Building } from "../buildings/buildings";
import type { MapBox } from "../map/districtMap";
import { knockPlayerBy } from "../player/knockback";
import { announceSpawn } from "../zombies/brute";
import { spawnZombie } from "../zombies/zombiePool";
import { BOSS_STATE, bossBodyOn } from "./bossState";
import { bossGapTicks, bossStats } from "./telegraph";

/**
 * Story 6.7 (F1–F4, DD1, DD2, DD5): enrage.
 *
 * - The first tick it WALKS (no telegraph, rush, stun, recovery or chunk in flight) with HP ≤
 *   `atHpFrac` of its max, it ROARs for `roarS` (30 ticks), standing still: every standing player
 *   within `roarRadiusM` is pushed `roarPushM` straight away through the knockback, no damage.
 * - At the roar's end `enraged` is set: walk speed × `speedMult`; every cooldown and gap set from
 *   now on goes through `bossTicks` (× 0.7, rounded once); telegraphs, recoveries and the stun never
 *   change (F2).
 * - While enraged and alive a Crawler drops `crawlerBehindM` behind its centre every
 *   `crawlerEveryS[n − 1]` (first `firstCrawlerS` after the roar), skipped when the spot is blocked
 *   (map box, a building, the map edge), a standing player is within `crawlerPlayerClearM`, or the
 *   alive cap is reached (brief 22). It is a wave zombie (D1: counts in `remaining`, pays 3).
 */

/** Starts the roar if due (call in WALK, before the gap counts down). True when it started. */
export function checkEnrage(world: World): boolean {
  const b = world.boss;
  const e = world.balance.boss.enrage;
  if (b.enraged || b.state !== BOSS_STATE.WALK || b.attack.live) return false;
  if (b.hp > b.maxHp * e.atHpFrac) return false;
  b.state = BOSS_STATE.ROAR;
  b.stateTicks = 0;
  bossStats.roars++;
  const r2 = e.roarRadiusM * e.roarRadiusM;
  for (const p of world.players.values()) {
    if (p.status !== "alive") continue;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    if (dx * dx + dy * dy > r2) continue;
    knockPlayerBy(p, b.x, b.y, e.roarPushM, e.roarPushS); // F1: no damage
  }
  world.events.emit({ type: "boss.enraged", x: b.x, y: b.y });
  return true;
}

/** ROAR, once per tick: at its end it is enraged and walks after the (enraged) gap. */
export function updateRoar(world: World): void {
  const b = world.boss;
  const e = world.balance.boss.enrage;
  if (b.state !== BOSS_STATE.ROAR || b.stateTicks < ticksFor(e.roarS)) return;
  b.enraged = true;
  b.crawlerTicks = ticksFor(e.firstCrawlerS);
  b.state = BOSS_STATE.WALK;
  b.stateTicks = 0;
  b.gapTicks = bossGapTicks(world);
}

/** `crawlerDropSpot` result (reused). */
export const crawlerSpot = { x: 0, y: 0 };

/** F4: the drop point behind its centre (DD5: the only trig, server/solo only) and whether it is clear. */
export function crawlerDropSpot(world: Readonly<World>): boolean {
  const b = world.boss;
  const e = world.balance.boss.enrage;
  const x = b.x - Math.cos(b.facing) * e.crawlerBehindM;
  const y = b.y - Math.sin(b.facing) * e.crawlerBehindM;
  crawlerSpot.x = x;
  crawlerSpot.y = y;
  const r = world.balance.zombies.types.crawler?.radiusM ?? 0.3;
  const { widthM, heightM } = world.map;
  if (x - r < 0 || y - r < 0 || x + r > widthM || y + r > heightM) return false;
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i] as MapBox;
    if (circleOverlapsBox(x, y, r, s.minX, s.minY, s.maxX, s.maxY)) return false;
  }
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const bd = list[i] as Building;
    if (circleOverlapsBox(x, y, r, bd.minX, bd.minY, bd.maxX, bd.maxY)) return false; // any building, floor ones too
  }
  const clear = e.crawlerPlayerClearM;
  for (const p of world.players.values()) {
    if (p.status !== "alive") continue;
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= clear * clear) return false;
  }
  return true;
}

/** While enraged and alive (every state, STUN included): the Crawler clock. */
export function updateCrawlerDrops(world: World): void {
  const b = world.boss;
  if (!b.enraged || !bossBodyOn(b)) return;
  if (b.crawlerTicks > 0) b.crawlerTicks--;
  if (b.crawlerTicks > 0) return;
  const e = world.balance.boss.enrage;
  const n = Math.min(e.crawlerEveryS.length, Math.max(1, world.players.size));
  b.crawlerTicks = ticksFor(e.crawlerEveryS[n - 1] as number); // the timer restarts either way
  // Brief 22: the boss lives, so the cap is `aliveCap`.
  if (world.zombies.aliveCount >= world.balance.boss.aliveCap || !crawlerDropSpot(world)) {
    bossStats.crawlerDropsSkipped++;
    return;
  }
  const id = spawnZombie(world, "crawler", crawlerSpot.x, crawlerSpot.y, true);
  if (id < 0) {
    bossStats.crawlerDropsSkipped++;
    return;
  }
  announceSpawn(world, id);
  bossStats.crawlersDropped++;
  world.events.emit({ type: "boss.crawler_dropped", x: crawlerSpot.x, y: crawlerSpot.y });
}
