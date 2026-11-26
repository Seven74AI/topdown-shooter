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
import { owns } from "./shop";
import { buyCard, cardItem, offerFor } from "./shopCards";

/**
 * Epic 2 retro A10 (with Story 3.3; Story 5.13: from cards): a seeded headless 5-wave run with the
 * real balance and every real system, 2/3/4 bots on the Story 2.10 bot policy, Pistol starts. On the
 * first tick of every build phase each bot buys the first affordable weapon card of its own offer
 * whose item is on a list (SMG, then the Hunting Rifle replacing the Pistol) through the real
 * `buyCard` and swaps to what it bought. Logs survival by wave, earnings and the
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
  wavesEnded: number;
  /** Bots that bought at least one weapon. */
  bought: number;
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
    const offer = offerFor(world, p.id);
    if (!offer) return;
    let card = -1;
    for (const id of LIST) {
      const c = offer.cards.indexOf(id);
      if (c >= 0 && !owns(p.loadout, id) && (cardItem(balance, id)?.basePrice ?? Infinity) <= p.wallet) {
        card = c;
        break;
      }
    }
    if (card < 0) return;
    const pick = offer.cards[card] as string;
    const inHands = p.loadout.active;
    const replace = (inHands === 0 ? 1 : 0) as 0 | 1; // two weapons: replace the one not in hands … then swap to it
    const before = p.wallet;
    const r = buyCard(world, p.id, offer.build, offer.rev, card, pick, p.loadout.slots[1] === null ? null : replace);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(before - p.wallet).toBe(r.value.price); // the card's price, charged once
    spent[p.id] = (spent[p.id] ?? 0) + r.value.price;
    firstBuy[p.id] ??= `${pick}@W${wave}`;
    if (r.value.slot !== null && r.value.slot !== p.loadout.active) swapNext.add(p.id);
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
    wavesEnded,
    bought: Object.keys(firstBuy).length,
    reached: world.waves.number,
    wiped: world.teamWiped,
    earned: ids.map((id) => world.players.get(id)?.earned ?? 0),
    firstBuy: ids.map((id) => firstBuy[id] ?? "none"),
  };
}

describe("shop bot sim (A10: 2/3/4 bots, Pistol starts, buying from their cards, seeded)", () => {
  describe("logs survival by wave, earnings and the first purchase; money adds up", () => {
    // E8-A8 (no test over 30 s; was 20–33 s in CI): one test per run (team size × seed), then the totals. Same runs,
    // order and assertions as the old single test; the totals need every run test above to have run.
    const lines: string[] = [];
    let anyBought = false;
    let casesRun = 0;
    it.each(TEAM_SIZES.flatMap((k) => SEEDS.map((s) => [k, s] as const)))("%i players, seed %i: the run really ran", (n, seed) => {
      const r = run(seed, n);
      // The run really ran (3.3 review: a lobby-only run must not pass silently).
      expect(r.wavesEnded).toBeGreaterThanOrEqual(1);
      if (r.bought > 0) anyBought = true;
      lines.push(
        `${n} players seed ${seed}: reached wave ${r.reached}${r.wiped ? " (wiped)" : " (alive after W" + MAX_WAVE + ")"}; earned ${r.earned.join("/")}; first buy ${r.firstBuy.join(", ")}`,
      );
      casesRun++;
    }, 120_000);

    it("the runs together: some bot bought something", () => {
      expect(casesRun, "every case above ran and passed").toBe(TEAM_SIZES.length * SEEDS.length);
      expect(anyBought).toBe(true);
      (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[shop sim]\n${lines.join("\n")}`);
    });
  });
});
