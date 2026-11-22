import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer, type PlayerState } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";

/**
 * Story 3.2 (Epic 2 retro A10): a seeded headless bot run, 2 players with the Pistol only, real
 * balance and every real system. It logs each player's wallet at every wave end and the wave the
 * team reached, as early evidence for the Story 3.3 prices. Assertions are invariants only (no
 * spending yet: wallet = start + earned, and the money events add up); the numbers go to the log.
 *
 * Bot rules (simple on purpose): aim at and fire on the nearest zombie; walk away from it when it is
 * closer than KITE_M; walk to a downed teammate to revive them; otherwise drift back toward the map
 * centre. No dodging cleverness: this is a floor, not a skilled team.
 */
const balance = loadBalance();
const SEEDS = [1, 2, 3, 4, 5];
const MAX_WAVE = 5;
const MAX_TICKS = 20 * 60 * 12; // 12 min of game time per run at most
const KITE_M = 3;

interface WaveLog {
  wave: number;
  tick: number;
  wallets: Record<string, number>;
}

function nearestZombie(world: World, p: PlayerState): number {
  const z = world.zombies;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    const dx = (z.x[id] as number) - p.x;
    const dy = (z.y[id] as number) - p.y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

function botInput(world: World, p: PlayerState, seq: number) {
  const input = { ...NEUTRAL_INPUT, seq };
  if (p.status !== "alive") return input;
  let mx = 0;
  let my = 0;
  const downed = [...world.players.values()].find((o) => o !== p && o.status === "downed");
  const zid = nearestZombie(world, p);
  if (zid >= 0) {
    const dx = (world.zombies.x[zid] as number) - p.x;
    const dy = (world.zombies.y[zid] as number) - p.y;
    const d = Math.hypot(dx, dy) || 1;
    input.aimX = dx / d;
    input.aimY = dy / d;
    input.fire = true;
    if (d < KITE_M) {
      mx = -dx / d;
      my = -dy / d;
    }
  }
  if (downed) {
    mx = downed.x - p.x;
    my = downed.y - p.y;
  } else if (mx === 0 && my === 0) {
    mx = (world.map.widthM / 2 - p.x) * 0.2;
    my = (world.map.heightM / 2 - p.y) * 0.2;
  }
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  input.moveX = mx;
  input.moveY = my;
  return input;
}

function runSeed(seed: number) {
  const world = createWorld({ balance, seed });
  const at = { x: 0, y: 0 };
  for (const [slot, id] of ["p0", "p1"].entries()) {
    teamSpawnPoint(world, slot, at);
    addPlayer(world, id, at.x, at.y); // Pistol only (the default loadout)
  }
  const waves: WaveLog[] = [];
  const paid: Record<string, number> = { p0: 0, p1: 0 };
  const byReason: Record<string, number> = {};
  /** "playerId:amount" of every wave bonus paid (review: prove each wave end paid both players). */
  const bonuses: string[] = [];
  world.events.subscribe((e: SimEvent) => {
    if (e.type === "money.earned" && e.reason === "wave") bonuses.push(`${e.playerId}:${e.amount}`);
    if (e.type === "money.earned") {
      paid[e.playerId] = (paid[e.playerId] ?? 0) + e.amount;
      byReason[e.reason] = (byReason[e.reason] ?? 0) + e.amount;
    } else if (e.type === "wave.ended") {
      const wallets: Record<string, number> = {};
      world.players.forEach((p, id) => (wallets[id] = p.wallet));
      waves.push({ wave: e.number, tick: world.tick, wallets });
    }
  });
  let seq = 0;
  while (world.tick < MAX_TICKS && !world.teamWiped && waves.length < MAX_WAVE) {
    seq++;
    world.players.forEach((p, id) => setInput(world, id, botInput(world, p, seq)));
    step(world, TICK_DT_S);
  }
  return { world, waves, paid, byReason, bonuses, reached: world.waves.number, wiped: world.teamWiped };
}

describe("economy bot sim (2 players, Pistol, seeded)", () => {
  it("logs wallets at each wave end; money adds up", () => {
    const lines: string[] = [];
    for (const seed of SEEDS) {
      const r = runSeed(seed);
      for (const [id, p] of r.world.players) {
        expect(p.wallet).toBe(balance.economy.startingWallet + p.earned); // nothing spends yet
        expect(p.earned).toBe(r.paid[id]);
      }
      // Every wave end paid the bonus (10 × N) to both players, downed or not.
      const want = r.waves.flatMap((w) => ["p0", "p1"].map((id) => `${id}:${balance.economy.waveClearBonusPerWave * w.wave}`));
      expect([...r.bonuses].sort()).toEqual(want.sort());
      const ends = r.waves.map((w) => `W${w.wave}@${(w.tick / 20).toFixed(0)}s ${w.wallets.p0}/${w.wallets.p1}`).join(" · ");
      const final = [...r.world.players.values()].map((p) => p.wallet).join("/");
      lines.push(
        `seed ${seed}: reached wave ${r.reached}${r.wiped ? " (wiped)" : ""}; wave ends ${ends || "none"}; final ${final}; by reason ${JSON.stringify(r.byReason)}`,
      );
    }
    // packages/shared has no DOM/Node types (engine-free): reach the test runner's console untyped.
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[economy sim] wallets p0/p1 at each wave end\n${lines.join("\n")}`);
  }, 60_000);
});
