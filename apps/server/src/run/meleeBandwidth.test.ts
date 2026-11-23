import { describe, expect, it } from "vitest";
import { pack } from "msgpackr";
import {
  NEUTRAL_INPUT,
  NET_EVENT_KIND,
  PLACEHOLDER_MAP,
  bundledBalanceFiles,
  encodeNetEvent,
  loadBalance,
  setLoadout,
  spawnZombie,
  startWave,
  TICK_DT_S,
  type Balance,
  type NetEventContext,
  type RawBalanceFiles,
} from "@topdown/shared";
import { RunController } from "./RunController";

const balance = loadBalance();
const SECONDS = 10;
const TICKS = SECONDS / TICK_DT_S;
const CROWD = 6;
/** Story 5.2 AC 6: per chainsaw wielder per receiving phone with 6 zombies in the arc. */
const BUDGET_BPS = 1500;

interface Bw {
  /** `melee.swung` + `zombie.hit` (+ kills) the wielder causes, packed one by one, B/s. */
  meleeBps: number;
  swings: number;
  cuts: number;
  hitEvents: number;
}

/**
 * Story 5.2 (AC 6, brief line 11): one player (p0) holds fire with `weapon` aimed east at 6 tough
 * Walkers standing in its arc (put back every tick: they keep walking in); p1 idles far away and is
 * the receiving client. Everything the server sends p1 because of p0's weapon: its `melee.swung`
 * and `zombie.hit` events (no interest filter: the worst case).
 */
function measure(weapon: string, b: Balance = balance): Bw {
  const players = [0, 1].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance: b, seed: 3, players, pauseWaves: true, systems: { zombies: () => {} }, map: PLACEHOLDER_MAP });
  const world = c.world;
  world.debug.godMode = true;
  const p0 = world.players.get("p0");
  const p1 = world.players.get("p1");
  if (!p0 || !p1) throw new Error("players");
  p0.x = p0.prevX = 10;
  p0.y = p0.prevY = 16;
  p1.x = p1.prevX = 40;
  p1.y = p1.prevY = 28;
  setLoadout(b, p0.loadout, [weapon, null]);
  startWave(world);
  const spots: [number, number][] = [];
  for (let i = 0; i < CROWD; i++) {
    const a = ((-24 + (i * 48) / (CROWD - 1)) * Math.PI) / 180;
    const d = 0.9 + (i % 2) * 0.35;
    spots.push([10 + Math.cos(a) * d, 16 + Math.sin(a) * d]);
  }
  const ids = spots.map(([x, y]) => spawnZombie(world, "walker", x, y));
  const ctx: NetEventContext = { balance: b, zombieNetId: (id) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  let bytes = 0;
  let swings = 0;
  let cuts = 0;
  let hitEvents = 0;
  for (let t = 0; t < TICKS; t++) {
    ids.forEach((id, i) => {
      const [x, y] = spots[i] as [number, number];
      world.zombies.x[id] = x;
      world.zombies.y[id] = y;
      world.zombies.hp[id] = 1e6;
    });
    c.queueInput("p0", { ...NEUTRAL_INPUT, seq: t + 1, aimX: 1, aimY: 0, fire: true, isMouse: true });
    c.queueInput("p1", { ...NEUTRAL_INPUT, seq: t + 1 });
    for (const e of c.tick()) {
      const tu = encodeNetEvent(e, ctx);
      if (!tu) continue;
      if (tu[0] === NET_EVENT_KIND.MELEE_SWUNG) {
        swings++;
        if (e.type === "melee.swung") cuts += e.hits ?? 0;
        bytes += pack(tu).length;
      } else if (tu[0] === NET_EVENT_KIND.ZOMBIE_HIT) {
        hitEvents++;
        bytes += pack(tu).length;
      }
    }
  }
  return { meleeBps: bytes / SECONDS, swings, cuts, hitEvents };
}

/** The same balance with the Chainsaw's quiet hit path off (what one event per zombie per tick would cost). */
function loudChainsaw(): Balance {
  const raw = bundledBalanceFiles() as RawBalanceFiles & { weapons: Record<string, Record<string, unknown>> };
  (raw.weapons.chainsaw as Record<string, unknown>).quietHits = false;
  return loadBalance(raw);
}

describe("Fire Axe and Chainsaw bandwidth (Story 5.2, AC 6, brief line 11)", () => {
  it("1 chainsaw in a crowd of 6 for 10 s: ≤ 1.5 KB/s to another phone, no zombie.hit per zombie per tick", () => {
    const saw = measure("chainsaw");
    const loud = measure("chainsaw", loudChainsaw());
    const axe = measure("fire_axe");
    console.log(
      `[melee bandwidth] chainsaw: ${(saw.swings / SECONDS).toFixed(1)} ticks/s, ${(saw.cuts / saw.swings).toFixed(1)} zombies cut per tick, ${saw.hitEvents} zombie.hit → ${saw.meleeBps.toFixed(0)} B/s per receiver ` +
        `(one zombie.hit per cut would be ${loud.meleeBps.toFixed(0)} B/s); fire axe: ${(axe.swings / SECONDS).toFixed(2)} swings/s, ${axe.hitEvents} hits → ${axe.meleeBps.toFixed(0)} B/s`,
    );
    // liveness: the chainsaw really cut all six on every tick, and the axe really hit
    expect(saw.swings).toBe(SECONDS * 10);
    expect(saw.cuts).toBe(saw.swings * CROWD);
    expect(saw.hitEvents).toBe(0); // the quiet path: no event per zombie per tick
    expect(loud.hitEvents).toBe(loud.swings * CROWD); // (the comparison really was the loud path)
    expect(saw.meleeBps).toBeLessThanOrEqual(BUDGET_BPS);
    expect(saw.meleeBps).toBeLessThan(loud.meleeBps / 3);
    expect(axe.swings).toBeGreaterThanOrEqual(SECONDS);
    expect(axe.hitEvents).toBeGreaterThanOrEqual(axe.swings * CROWD - CROWD); // knocked away, put back: each swing hits all six
    expect(axe.meleeBps).toBeLessThanOrEqual(BUDGET_BPS);
  });
});
