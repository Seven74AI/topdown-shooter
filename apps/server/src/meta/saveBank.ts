/**
 * Stories 8.4–8.6 (S4, decisions E8-S3, E8-S4): a resumable save tops up each linked seat's Supplies for the waves
 * played so far (ending "quit": never the extract bonus). The bank is a TOP-UP keyed by (run id = save id, account): a
 * save banked twice, a resume saved again, or the final Results all pay only `new − already` (8.2's E8-J6), so the
 * total over every night equals one uninterrupted run. The seats' state comes from the SAVE (restored), never from a
 * live World that may already be in the next wave. Best effort, never awaited by a tick; results go nowhere (nobody is
 * on a Results screen for a save).
 */
import { restoreRunSave, type Balance, type DistrictMap, type PlayerState, type RunRewards, type RunSave } from "@topdown/shared";
import type { ProgressRepo } from "../db/progressRepo";
import { RunBank } from "./banking";

export interface SaveBankDeps {
  readonly balance: Balance;
  readonly map: DistrictMap;
  repo(): ProgressRepo | null;
  readonly log: { info(obj: object, msg: string): void; error(obj: object, msg: string): void };
  readonly retryMs?: number;
  /** Decision 8.6-B8: the restoring code's version (the digest is checked only for the same code). */
  readonly codeVersion?: string;
}

/** Banks every seat of `save` that has an account (guests: nothing to bank). Never rejects. */
export async function bankSavedRun(save: RunSave, deps: SaveBankDeps): Promise<RunRewards[]> {
  const bank = new RunBank(save.seed, { repo: deps.repo, log: deps.log, deliver: () => {}, district: save.district, runId: save.runId, resumed: true, ...(deps.retryMs !== undefined ? { retryMs: deps.retryMs } : {}) });
  if (save.lootFinderSeat) bank.noteLootFinder(save.lootFinderSeat); // review H1: the finder is a SEAT, never a reused player id
  let restored;
  try {
    restored = restoreRunSave(save, { balance: deps.balance, map: deps.map, ...(deps.codeVersion !== undefined ? { codeVersion: deps.codeVersion } : {}) });
  } catch (e) {
    // Review M3 (8.6-B8): a save that can't be restored (another map) still pays its waves: Supplies from the saved
    // records, no meta writes (no World for the run's facts).
    deps.log.error({ runId: save.runId, why: (e as Error).message }, "save_bank_records_only");
    const seats = save.seats.filter((x) => x.accountId !== null);
    const results = await Promise.all(seats.map((x) => bank.bank({ playerId: x.playerId, seatId: `${x.playerId}#${x.seatGen}`, accountId: x.accountId, record: x.player as unknown as PlayerState, ending: "quit", wave: save.wave })));
    deps.log.info({ runId: save.runId, wave: save.wave, seats: seats.length, status: results.map((r) => r.status) }, "save_banked");
    return results;
  }
  const world = restored.world;
  const all = [...restored.present, ...restored.away].filter((r) => r.seat.accountId !== null);
  const results = await Promise.all(
    all.map(({ seat, player }) =>
      bank.bank({ playerId: seat.playerId, seatId: `${seat.playerId}#${seat.seatGen}`, accountId: seat.accountId, record: player, ending: "quit", wave: save.wave, lockedUsed: player.lockedUsed, meta: bank.seatMetaNow(world, player) }),
    ),
  );
  deps.log.info({ runId: save.runId, wave: save.wave, seats: all.length, status: results.map((r) => r.status) }, "save_banked");
  return results;
}
