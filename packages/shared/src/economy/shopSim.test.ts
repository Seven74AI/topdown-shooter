import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step } from "../core/world";
import { botConfigOf, botInput, botViewFromWorld, createBotView, type BotView } from "../bots/botPolicy";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer, type PlayerState } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { startBuild } from "../run/runStateMachine";
import { botShopPick, buyWeapon, owns, shopPrice } from "./shop";

/**
 * Epic 2 retro A10 (with Story 3.3): a seeded headless 5-wave run with the real balance and every
 * real system, 2/3/4 bots on the Story 2.10 bot policy, Pistol starts. On the first tick of every
 * build phase each bot buys from a fixed list through the real `buyWeapon` (SMG, then the Hunting
 * Rifle replacing the Pistol) and swaps to what it bought. Logs survival by wave, earnings and the
 * first purchase per player. Assertions are invariants only; the numbers go to the log (3.10 tunes).
 */
const balance = loadBalance();
const SEEDS = [1, 2, 3];
const TEAM_SIZES = [2, 3, 4];
const MAX_WAVE = 5;
const MAX_TICKS = 20 * 60 * 15;
/** The test's shopping list (bots.json › shoppingList stays empty until 3.10 tunes the bots). */
const LIST = ["smg", "hunting_rifle"];

interface RunLog {
  reached: number;
  wiped: boolean;
  earned: number[];
  firstBuy: string[];
}

function run(seed: number, players: number): RunLog {
  const world = createWorld({ balance, seed });
  const at = { x: 0, y: 0 };
  const ids: string[] = [];
  for (let slot = 0; slot < players; slot++) {
    const id = `p${slot}`;
    ids.push(id);
    teamSpawnPoint(world, slot, at);
    addPlayer(world, id, at.x, at.y);
  }
  const cfg = botConfigOf(balance);
  const views: BotView[] = ids.map(() => createBotView());
  const inputs: PlayerInput[] = ids.map(() => ({ ...NEUTRAL_INPUT }));
  const spent: Record<string, number> = {};
  const firstBuy: Record<string, string> = {};
  const swapNext = new Set<string>();
  const shop = (p: PlayerState, wave: number) => {
    const pick = botShopPick(balance, p.wallet, p.loadout, LIST);
    if (pick === null) return;
    const inHands = p.loadout.active;
    const replace = (inHands === 0 ? 1 : 0) as 0 | 1; // two weapons: replace the one not in hands … then swap to it
    const r = buyWeapon(world, p.id, pick, p.loadout.slots[1] === null ? null : replace);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    spent[p.id] = (spent[p.id] ?? 0) + (shopPrice(balance, pick) ?? 0);
    firstBuy[p.id] ??= `${pick}@W${wave}`;
    if (r.value.slot !== p.loadout.active) swapNext.add(p.id);
  };
  startBuild(world); // lobby → the first build phase, like the server's startRun
  let seq = 0;
  let lastPhase = "";
  let wavesEnded = 0;
  world.events.subscribe((e: SimEvent) => {
    if (e.type === "wave.ended") wavesEnded = e.number;
  });
  while (world.tick < MAX_TICKS && !world.teamWiped && wavesEnded < MAX_WAVE) {
    const phase = world.run.phase;
    if (phase === "build" && lastPhase !== "build") {
      for (const id of ids) {
        const p = world.players.get(id);
        if (p) shop(p, world.waves.number + 1);
      }
    }
    lastPhase = phase;
    seq++;
    ids.forEach((id, i) => {
      const view = views[i] as BotView;
      const input = inputs[i] as PlayerInput;
      botViewFromWorld(world, id, view);
      botInput(view, cfg, seq, input);
      if (swapNext.delete(id)) input.swap = true;
      setInput(world, id, input);
    });
    step(world, TICK_DT_S);
  }
  for (const id of ids) {
    const p = world.players.get(id) as PlayerState;
    expect(p.wallet).toBe(balance.economy.startingWallet + p.earned - (spent[id] ?? 0)); // money adds up
    expect(p.wallet).toBeGreaterThanOrEqual(0);
    expect(owns(p.loadout, p.loadout.slots[p.loadout.active]?.weapon ?? "")).toBe(true);
  }
  return {
    reached: world.waves.number,
    wiped: world.teamWiped,
    earned: ids.map((id) => world.players.get(id)?.earned ?? 0),
    firstBuy: ids.map((id) => firstBuy[id] ?? "none"),
  };
}

describe("shop bot sim (A10: 2/3/4 bots, Pistol starts, buying from the fixed list, seeded)", () => {
  it("logs survival by wave, earnings and the first purchase; money adds up", () => {
    const lines: string[] = [];
    for (const n of TEAM_SIZES) {
      for (const seed of SEEDS) {
        const r = run(seed, n);
        lines.push(
          `${n} players seed ${seed}: reached wave ${r.reached}${r.wiped ? " (wiped)" : " (alive after W" + MAX_WAVE + ")"}; earned ${r.earned.join("/")}; first buy ${r.firstBuy.join(", ")}`,
        );
      }
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[shop sim]\n${lines.join("\n")}`);
  }, 120_000);
});
