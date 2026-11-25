import { MAX_PLAYERS, MILESTONES, cosmeticPart, districtName, districtsUnlockedBy, hadWave, type CosmeticSlot, type PlayerState, type World } from "@topdown/shared";
import type { LifetimeStatsRow, RunMetaWrites } from "../db/progressRepo";
import { pickLootItem } from "./loot";
import { milestonesReached, newMilestoneParts } from "./milestones";

/**
 * Stories 7.7 + 7.11 + 7.12: what a seat's bank writes besides Supplies, built from the World at the bank and run
 * INSIDE 7.2's transaction (`RunMetaWrites`): the lifetime stats delta (7.11 AC 5), the milestone parts (7.11 AC 4),
 * the loot item for the bag's finder (7.12 AC 8; Collector when they own all ten) and District 2 for an extraction
 * from Downtown (7.7 R1). The breakdown keys it returns are what `run.rewards` shows (and replays on a retry).
 */

/** Facts of the run at this seat's bank (the same for every seat, except `extracted`). */
export interface RunFacts {
  /** The district the run was played in (7.7: `state.district` at Start). */
  readonly district: string;
  /** M8: at the extract, exactly 4 players in the World and all standing (a held seat breaks it). */
  readonly extractedAllFour: boolean;
  /** 7.12: who took the bag (null: nobody) and the wave it dropped in, and the plan's item roll. */
  readonly lootFoundBy: string | null;
  readonly lootWave: number;
  readonly lootItemRoll: number;
}

export function runFacts(world: Readonly<World>, district: string): RunFacts {
  let standing = 0;
  world.players.forEach((p) => {
    if (p.status === "alive") standing++;
  });
  const extractedAllFour = world.run.ending === "extracted" && world.players.size === MAX_PLAYERS && world.heldPlayers.size === 0 && standing === MAX_PLAYERS; // review L8
  return { district, extractedAllFour, lootFoundBy: world.loot.foundBy, lootWave: world.loot.foundWave, lootItemRoll: world.loot.plan.itemRoll };
}

/** One new item on Results ("New item: Riot helmet (first extraction)"). */
export interface NewItem {
  key: string;
  name: string;
  /** The milestone's `resultLine`. */
  reason: string;
}
/** 7.12: the find ("Found in wave 6: Traffic cone", or Collector: `key` null). */
export interface LootFind {
  wave: number;
  key: string | null;
  name: string;
}

export const partName = (key: string): string => {
  const [slot, id] = key.split(":") as [CosmeticSlot, string];
  return cosmeticPart(slot, id)?.name ?? key;
};

/** The lifetime stats this run adds (7.11 AC 5; a run counts once wave 1 ended with me in it, D4). */
export function statsDelta(p: Readonly<PlayerState>): LifetimeStatsRow {
  return { revives: p.revives, kills: p.kills, barricades: p.barricades, runs: hadWave(p.waveMask, 1) ? 1 : 0 };
}

/**
 * The seat's meta writes. `extracted`: the seat banks with ending `extracted` (it was in the run at the extract).
 * The loot item is picked from the parts owned INSIDE the transaction, after this run's milestone parts (Beat the
 * rule 6: two devices can't hand out the same item twice in one account).
 */
export function seatMeta(playerId: string, p: Readonly<PlayerState>, extracted: boolean, facts: RunFacts, lootList?: readonly string[]): RunMetaWrites {
  const run = { waveMask: p.waveMask, bossKilledWhileIn: p.bossesIn > 0, extracted, district: facts.district, extractedAllFour: facts.extractedAllFour, downsWaves1to10: p.downs10 };
  return {
    statsDelta: statsDelta(p),
    grant(statsAfter, owned, districts) {
      const reached = milestonesReached(run, statsAfter);
      const parts = newMilestoneParts(reached, owned);
      const newItems: NewItem[] = parts.map(({ id, key }) => ({ key, name: partName(key), reason: MILESTONES.find((m) => m.id === id)?.resultLine ?? "" }));
      const cosmetics = parts.map((x) => x.key);
      let loot: LootFind | undefined;
      if (facts.lootFoundBy === playerId) {
        const after = new Set(owned);
        for (const k of cosmetics) after.add(k);
        const key = pickLootItem(after, facts.lootItemRoll, lootList); // `lootList`: tests only (review L7: a catalogue where they overlap)
        loot = { wave: facts.lootWave, key, name: key === null ? "" : partName(key) };
        if (key !== null) cosmetics.push(key);
      }
      const unlocked = extracted ? districtsUnlockedBy(facts.district).filter((d) => !districts.includes(d)) : [];
      const breakdown: Record<string, unknown> = { newItems, newDistricts: unlocked.map((id) => ({ id, name: districtName(id) })) };
      if (loot) breakdown.loot = loot;
      return { cosmetics, districts: unlocked, breakdown };
    },
  };
}
