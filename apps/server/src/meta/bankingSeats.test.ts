import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { log } from "../ops/logger";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { RunBank, type MetaPlayer } from "./banking";
import type { RunFacts } from "./runMeta";
import { lootPartKeys, type RunRewards } from "@topdown/shared";

/**
 * PR #9 re-review (8.3 H1, M and L2): the loot finder is a SEAT on every bank path. Di (p3#4) found the bag and was
 * removed; Eve (p3#6) reuses the player id. Whatever path Eve banks on (her Leave here), she gets no loot line, and the
 * two accounts hold exactly one loot item between them. Real PGlite repository.
 */
log.level = process.env.LOG_LEVEL ?? "silent";
const open: Database[] = [];
afterEach(async () => {
  for (const d of open.splice(0)) await d.close();
});

const facts: RunFacts = { district: "downtown", extractedAllFour: false, lootFoundBy: "p3", lootWave: 3, lootItemRoll: 0.5 };
const player: MetaPlayer = { waveMask: 0b111, kills: 3, revives: 0, downs10: 0, barricades: 0, bossesIn: 0 };
const rec = { wavesIn: 3, endlessWavesIn: 0, bossesIn: 0, endlessBossesIn: 0 };

async function setup() {
  const database = openPglite();
  open.push(database);
  const accounts = accountsRepo(database);
  const di = (await accounts.createGuest(randomBytes(32).toString("hex"), "Di")).id;
  const eve = (await accounts.createGuest(randomBytes(32).toString("hex"), "Eve")).id;
  const repo = progressRepo(database);
  const delivered: [string, RunRewards][] = [];
  const bank = new RunBank(1, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: (id, m) => delivered.push([id, m]), retryMs: 1 });
  const lootKeys = new Set(lootPartKeys());
  const lootOwned = async (id: string) => ((await repo.get(id))?.cosmetics ?? []).filter((k) => lootKeys.has(k));
  return { bank, di, eve, delivered, lootOwned };
}

describe("PR #9 re-review: the loot finder is a seat on every bank path", () => {
  it("M: Di (p3#4) found the bag and was removed; Eve (p3#6) reuses p3 and banks on her Leave → no loot line, one item in all", async () => {
    const { bank, di, eve, delivered, lootOwned } = await setup();
    bank.noteLootFinder("p3#4");
    await bank.bank({ playerId: "p3", seatId: "p3#4", accountId: di, record: rec, ending: "quit", meta: { player, facts } }); // Di's remove
    await bank.bank({ playerId: "p3", seatId: "p3#6", accountId: eve, record: rec, ending: "quit", meta: { player, facts } }); // Eve's Leave
    const [diLoot, eveLoot] = [await lootOwned(di), await lootOwned(eve)];
    expect(diLoot).toHaveLength(1);
    expect(eveLoot).toEqual([]);
    const eveMsg = delivered.find(([id]) => id === "p3#6")?.[1] as { loot?: unknown } | undefined;
    expect(eveMsg?.loot).toBeUndefined();
  });

  it("L2: with no finder seat noted, the finder is matched by player id (the real finder keeps its find)", async () => {
    const { bank, di, lootOwned } = await setup();
    await bank.bank({ playerId: "p3", accountId: di, record: rec, ending: "quit", meta: { player, facts } });
    expect(await lootOwned(di)).toHaveLength(1);
  });

  it("the run end: the noted finder seat gets the item, a reused id at the end gets none", async () => {
    const { bank, di, eve, lootOwned } = await setup();
    bank.noteLootFinder("p3#4");
    await bank.bank({ playerId: "p3", seatId: "p3#4", accountId: di, record: rec, ending: "quit", meta: { player, facts } });
    const world = { run: { ending: "wiped" }, players: new Map([["p3", { ...rec, ...player, lockedUsed: 255 }]]), heldPlayers: new Map(), loot: { foundBy: "p3", foundWave: 3, plan: { itemRoll: 0.5 } }, special: {}, extract: { started: false } }; // Story 12.2: runFacts reads extract
    await bank.bankRunEnd(world as never, [{ playerId: "p3", accountId: eve, seatId: "p3#6" }], []).catch(() => undefined);
    expect(await lootOwned(eve)).toEqual([]);
    expect(await lootOwned(di)).toHaveLength(1);
  });
});
