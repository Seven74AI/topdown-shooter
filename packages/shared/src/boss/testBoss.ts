import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { step, type World } from "../core/world";
import { BOSS_STATE } from "./bossState";

/**
 * Story 6.5 test helpers (used by the boss tests only): put a walking Behemoth on the map without
 * the arrival rule, and step the World.
 */
export function placeBoss(world: World, x: number, y: number, hp = 6000): void {
  world.run.phase = "wave";
  const b = world.boss;
  b.state = BOSS_STATE.WALK;
  b.x = x;
  b.y = y;
  b.hp = hp;
  b.maxHp = hp;
  b.number = Math.max(1, b.number);
  b.wave = world.waves.number;
  b.gapTicks = 0;
  b.stateTicks = 0;
}

export function tickN(world: World, n = 1): void {
  for (let i = 0; i < n; i++) step(world, TICK_DT_S);
}

export function collect(world: World): SimEvent[] {
  const out: SimEvent[] = [];
  world.events.subscribe((e) => out.push(e));
  return out;
}

/** Story 6.6: keeps a 6.5 walking/slam test to the slam (charge and throw cooldowns parked). */
export function slamOnly(world: World): void {
  world.boss.cooldown.charge = 1e9;
  world.boss.cooldown.throw = 1e9;
}
