/**
 * Story 7.2 (AC 3, 4, 8; S3, S6, brief 18 + 20): banking a run's Supplies, server only.
 *
 * One `RunBank` per run (made at Start: `runId` is a fresh UUID). The room calls it from exactly two places:
 * - `bankRunEnd` from `RunRoom.endRun` (ONE call): every seat with a `PlayerState` — members in the World or held
 *   (8.1) bank with the run's ending (`extracted` only if they were there at `run.extracted`, AC 3), remembered seats
 *   (a hold that ran out, 8.1 F8) bank `quit`;
 * - `bank` from a consented Leave mid-run (`run.leave` or `onLeave` code 4000, before the state leaves the World):
 *   ending `quit` (S3, D2: never the extract bonus).
 *
 * Each seat banks at most once per run (a second call returns the first result and delivers it again), and the
 * database makes that true across rooms and retries too: `progressRepo.addSupplies` is one transaction keyed by
 * (run_id, account_id). A seat without an account (or with no database) gets `not_saved` at once. A failed write is
 * logged `supplies_bank_failed` (with the full breakdown, so it can be granted by hand), retried once after
 * `retryMs`; a second failure is logged again and the player sees "Couldn't save this run" (no third try).
 *
 * Nothing here is awaited by the tick (7.1 AC 9): the room fires and forgets; results arrive through `deliver`.
 */
import { randomUUID } from "node:crypto";
import type { RunRewards, RunRewardsStatus } from "@topdown/shared";
import { loadBalance, runSupplies, suppliesEnding, unlockList, type RunEnding, type RunRecord, type RunSupplies, type SuppliesEnding, type World } from "@topdown/shared";
import type { ProgressRepo, RunMetaWrites } from "../db/progressRepo";
import { dbErrText } from "../db/timeout";
import { DEFAULT_DISTRICT, type PlayerState } from "@topdown/shared";
import { runFacts, seatMeta, statsDelta, type LootFind, type NewItem, type RunFacts } from "./runMeta";

/** Review M1: what every `supplies_bank_failed` line tells the person who grants a run by hand. */
export const HAND_GRANT_NOTE = "before a hand grant, check run_rewards (run_id, account_id): a row means it was banked";

/** AC 4: the one retry waits this long. */
export const BANK_RETRY_MS = 2000;

export interface BankSeat {
  readonly playerId: string;
  /**
   * Story 8.3 review H1: the seat's identity for this run (`playerId#generation`): a player id is reused when a removed
   * seat's slot is taken by someone new, so banks, results and deliveries are keyed by this. Absent = the player id.
   */
  readonly seatId?: string;
  readonly accountId: string | null;
  readonly record: RunRecord;
  readonly ending: SuppliesEnding;
  /** Review L4: the wave a Leave banked in (shown as "Banked when you left (wave N)" if the seat comes back). */
  readonly wave?: number;
  /** Story 7.4 (AC 9): `PlayerState.lockedUsed` (an unlock index, 255 none). */
  readonly lockedUsed?: number;
  /**
   * Stories 7.7 / 7.11 / 7.12: the seat's milestone counters (copied at the bank call: a leaver banks with what it had
   * then, 7.11 AC 6) and the run's facts. Absent = Supplies only (7.2's tests).
   */
  readonly meta?: { readonly player: MetaPlayer; readonly facts: RunFacts };
  /** 7.12 (D1): the bag's find, shown on every teammate's Results ("Ana found: Traffic cone"). */
  readonly teamLoot?: TeamLoot;
}

/** The PlayerState fields the meta writes read (a copy). */
export type MetaPlayer = Pick<PlayerState, "waveMask" | "kills" | "revives" | "downs10" | "barricades" | "bossesIn">;
const metaPlayer = (p: Readonly<PlayerState>): MetaPlayer => ({ waveMask: p.waveMask, kills: p.kills, revives: p.revives, downs10: p.downs10, barricades: p.barricades, bossesIn: p.bossesIn });

/** 7.12 D1: who found the bag and what came out of it (key null: Collector, or not known yet). */
export interface TeamLoot {
  playerId: string;
  wave: number;
  key: string | null;
  name: string;
}

/** Story 7.4 (K7): the item names of the bundled balance (names never change in dev overrides). */
let itemNames: Map<string, string> | null = null;
function itemName(id: string): string {
  if (!itemNames) {
    const b = loadBalance();
    itemNames = new Map();
    for (const [k, w] of Object.entries(b.weapons)) itemNames.set(k, w.name ?? k);
    for (const [k, g] of Object.entries(b.gear.items)) itemNames.set(k, g.name);
    for (const [k, t] of Object.entries(b.buildings.types)) itemNames.set(k, t.name);
    for (const [k, c] of Object.entries(b.consumables.items)) itemNames.set(k, c.name);
  }
  return itemNames.get(id) ?? id;
}

/** Story 7.4 (K7, AC 9): the Results line's unlock (`{ unlockId, name, price }`), or null. */
export function lockedUsedLine(index: number | undefined): RunRewards["lockedUsed"] {
  const u = index === undefined ? undefined : unlockList[index];
  if (!u) return null;
  return { unlockId: u.id, name: itemName(u.items[0] as string).slice(0, 40), price: u.price };
}

export interface RunBankDeps {
  /** The progress repository, or null (no database: everyone is `not_saved`). */
  repo(): ProgressRepo | null;
  log: { info(obj: object, msg: string): void; error(obj: object, msg: string): void };
  /** Sends `run.rewards` to the seat's owner if connected (the room looks the client up by seat id: `BankSeat.seatId`). */
  deliver(seatId: string, msg: RunRewards): void;
  retryMs?: number;
  nowMs?(): number;
  /** Story 7.7: the district this run is played in (`state.district` at Start; default Downtown). */
  district?: string;
}

/** What `run_rewards.breakdown` keeps: the payout, the ending and the record it came from (hand grants, later stories). */
interface Breakdown extends RunSupplies {
  ending: SuppliesEnding;
  leftWave: number;
  waveCount: number;
  endlessWaveCount: number;
  record: RunRecord;
}

const copyRecord = (r: RunRecord): RunRecord => ({ wavesIn: r.wavesIn, endlessWavesIn: r.endlessWavesIn, bossesIn: r.bossesIn, endlessBossesIn: r.endlessBossesIn });

/** Stories 7.7 / 7.11 / 7.12: the meta lines of a bank (from the breakdown it stored, or a preview when unsaved). */
interface MetaLines {
  newItems?: NewItem[];
  loot?: LootFind;
  newDistricts?: { id: string; name: string }[];
  teamLoot?: TeamLoot;
}

function message(runId: string, seed: number, status: RunRewardsStatus, b: Omit<Breakdown, "record">, newTotal: number, meta: MetaLines = {}, lockedUsed?: number): RunRewards {
  return {
    ...metaFields(meta),
    lockedUsed: lockedUsedLine(lockedUsed), // Story 7.4
    ending: b.ending,
    leftWave: b.leftWave,
    runId,
    seed,
    status,
    lines: { waves: b.waves, boss: b.boss, extract: b.extract, endless: b.endless, endlessBoss: b.endlessBoss },
    waveCount: b.waveCount,
    endlessWaveCount: b.endlessWaveCount,
    rookie: b.rookie,
    total: status === "saved" ? b.total : 0,
    newTotal: status === "saved" ? newTotal : 0,
  };
}

/** Only the meta fields that are set (an older client ignores them: `run.rewards` is passthrough). */
function metaFields(m: MetaLines): MetaLines {
  const out: MetaLines = {};
  if (m.newItems && m.newItems.length > 0) out.newItems = m.newItems;
  if (m.loot) out.loot = m.loot;
  if (m.newDistricts && m.newDistricts.length > 0) out.newDistricts = m.newDistricts;
  if (m.teamLoot) out.teamLoot = m.teamLoot;
  return out;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
/** The meta lines of a stored breakdown (shapes checked: a hand-edited row can't send garbage). */
export function storedMeta(raw: Record<string, unknown>): MetaLines {
  const out: MetaLines = {};
  if (Array.isArray(raw.newItems)) out.newItems = raw.newItems.filter((x): x is NewItem => typeof x === "object" && x !== null && typeof (x as NewItem).key === "string").map((x) => ({ key: str(x.key, 32), name: str(x.name, 32), reason: str(x.reason, 40) }));
  const l = raw.loot as Partial<LootFind> | undefined;
  if (l && typeof l === "object" && typeof l.wave === "number") out.loot = { wave: Math.max(0, Math.floor(l.wave)), key: typeof l.key === "string" ? str(l.key, 32) : null, name: str(l.name, 32) };
  if (Array.isArray(raw.newDistricts)) out.newDistricts = raw.newDistricts.filter((x): x is { id: string; name: string } => typeof x === "object" && x !== null && typeof (x as { id: unknown }).id === "string").map((x) => ({ id: str(x.id, 32), name: str(x.name, 24) }));
  return out;
}

/** A stored breakdown read back (an earlier bank of the same run): numbers only, anything missing is 0. */
function storedBreakdown(raw: Record<string, unknown>, supplies: number): Omit<Breakdown, "record"> {
  const n = (k: string): number => (typeof raw[k] === "number" && Number.isInteger(raw[k]) && (raw[k] as number) >= 0 ? (raw[k] as number) : 0);
  return {
    waves: n("waves"),
    boss: n("boss"),
    extract: n("extract"),
    endless: n("endless"),
    endlessBoss: n("endlessBoss"),
    rookie: raw.rookie === true,
    total: supplies,
    waveCount: n("waveCount"),
    endlessWaveCount: n("endlessWaveCount"),
    ending: (["wiped", "extracted", "lost", "quit"] as const).find((e) => e === raw.ending) ?? "quit",
    leftWave: n("leftWave"),
  };
}

export class RunBank {
  readonly runId: string = randomUUID();
  /** By player id: each seat banks once per run. */
  private readonly banks = new Map<string, Promise<RunRewards>>();
  /** By player id: the settled result (re-sent to a seat that comes back on Results). */
  private readonly done = new Map<string, RunRewards>();
  /** Story 8.2 (AC 13, E8-J6): seats that came back after a bank: their next bank is a top-up (pays only the difference). */
  private readonly topUps = new Set<string>();
  /** Review L1: each seat's bank generation (+1 per `reopen`). */
  private readonly gens = new Map<string, number>();
  /** Review H1: the seat that found the loot bag (`noteLootFinder`), so a reused player id is never taken for it. */
  private lootFinder: string | null = null;

  /** Review H1: the room tells the bank which SEAT found the bag (on `loot.found`). */
  noteLootFinder(seatId: string): void {
    this.lootFinder = seatId;
  }

  constructor(
    readonly seed: number,
    private readonly deps: RunBankDeps,
  ) {}

  /** This seat's settled result, if any (a reconnect on Results gets it again). */
  resultFor(seatId: string): RunRewards | undefined {
    return this.done.get(seatId);
  }

  /** Whether this seat has started banking this run. */
  has(seatId: string): boolean {
    return this.banks.has(seatId);
  }

  /**
   * Story 8.2 (AC 13, decision E8-J6): a seat that banked (its consented Leave) rejoined (a remembered seat, 8.1 F8)
   * and plays on: its next bank runs again as a TOP-UP — the database raises the run's `run_rewards` row to the new
   * total and adds only `new − already` (never negative), in the same transaction. A no-op for a seat that never banked.
   */
  reopen(seatId: string): void {
    const earlier = this.banks.get(seatId);
    if (!earlier) return;
    this.banks.delete(seatId);
    this.done.delete(seatId);
    this.gens.set(seatId, (this.gens.get(seatId) ?? 0) + 1); // review L1: the earlier bank, still in flight, delivers nothing
    this.topUps.add(seatId);
  }

  /**
   * Story 8.2 review M2: a late joiner still WAITING when the run ended played nothing: a zero `not_saved` result is
   * delivered at once (its Results never wait on "Saving…"). Once per seat, like a bank.
   */
  nothingFor(seatId: string, ending: SuppliesEnding): void {
    if (this.banks.has(seatId)) return;
    const m = message(this.runId, this.seed, "not_saved", { waves: 0, boss: 0, extract: 0, endless: 0, endlessBoss: 0, rookie: false, total: 0, waveCount: 0, endlessWaveCount: 0, ending, leftWave: 0 }, 0);
    this.banks.set(seatId, Promise.resolve(m));
    this.done.set(seatId, m);
    this.deps.deliver(seatId, m);
  }

  /** Banks one seat (once per run; a repeat delivers the first result again). Never rejects. */
  bank(seat: BankSeat): Promise<RunRewards> {
    const key = seatKeyOf(seat);
    const earlier = this.banks.get(key);
    if (earlier) {
      void earlier.then((m) => this.deps.deliver(key, m));
      return earlier;
    }
    const gen = this.gens.get(key) ?? 0;
    const p = this.run(seat).then((m) => {
      if ((this.gens.get(key) ?? 0) !== gen) return m; // review L1: reopened meanwhile (a top-up follows): not this result
      this.done.set(key, m);
      this.deps.deliver(key, m);
      return m;
    });
    this.banks.set(key, p);
    return p;
  }

  /**
   * AC 3, 4: the run ended. Seats in the World or held bank with the run's ending; remembered seats bank `quit`.
   * Logs `run_supplies {runId, supplies, rookie, status}` per player once every bank settled (AC 8).
   */
  bankRunEnd(
    world: Readonly<World>,
    members: Iterable<{ readonly playerId: string; readonly accountId: string | null; readonly seatId?: string }>,
    remembered: Iterable<{ readonly playerId: string; readonly accountId: string | null; readonly seatId?: string; readonly player: RunRecord & { readonly lockedUsed?: number } }>,
  ): Promise<RunRewards[]> {
    const ending: RunEnding = world.run.ending;
    const facts = runFacts(world, this.deps.district ?? DEFAULT_DISTRICT); // Stories 7.7 / 7.11 / 7.12
    const seats: BankSeat[] = [];
    for (const m of members) {
      const p = world.players.get(m.playerId) ?? world.heldPlayers.get(m.playerId)?.player;
      if (!p) continue;
      seats.push({ playerId: m.playerId, ...(m.seatId ? { seatId: m.seatId } : {}), accountId: m.accountId, record: copyRecord(p), ending: suppliesEnding(ending, true), lockedUsed: p.lockedUsed, meta: { player: metaPlayer(p), facts } });
    }
    for (const s of remembered) {
      // 8.1 F8 + 7.12: a remembered seat's state stays in the room; its PlayerState is the seat's own.
      const p = (s as { readonly player: RunRecord & Partial<PlayerState> }).player;
      const meta = typeof p.waveMask === "number" ? { player: metaPlayer(p as PlayerState), facts } : undefined;
      seats.push({ playerId: s.playerId, ...(s.seatId ? { seatId: s.seatId } : {}), accountId: s.accountId, record: copyRecord(p), ending: "quit", ...(p.lockedUsed !== undefined ? { lockedUsed: p.lockedUsed } : {}), ...(meta ? { meta } : {}) });
    }
    // 7.12 D1: the finder banks first (or banked when it left), so every teammate's Results names the item.
    const finder = facts.lootFoundBy;
    // Review H1 (8.3): the finder is a SEAT. A new occupant of a removed finder's player id is not the finder: its facts
    // name nobody, and the teammates' line comes from the finder's own (earlier) bank.
    const finderKey = finder === null ? null : (this.lootFinder ?? finder);
    for (let i = 0; i < seats.length; i++) {
      const x = seats[i] as BankSeat;
      if (finder !== null && x.playerId === finder && seatKeyOf(x) !== finderKey && x.meta) seats[i] = { ...x, meta: { ...x.meta, facts: { ...x.meta.facts, lootFoundBy: null } } };
    }
    const finderSeat = finderKey === null ? undefined : seats.find((x) => seatKeyOf(x) === finderKey);
    const first: Promise<RunRewards | undefined> = finderSeat ? this.bank(finderSeat) : (finderKey === null ? undefined : this.banks.get(finderKey)) ?? Promise.resolve(undefined); // review M1: await a bank still in flight
    const all: Promise<RunRewards>[] = seats.map((seat) =>
      seat === finderSeat
        ? (first as Promise<RunRewards>)
        : first.then((f) => {
            const teamLoot = finder === null ? undefined : teamLootOf(finder, f);
            return this.bank(teamLoot ? { ...seat, teamLoot } : seat);
          }),
    );
    const ids = seats.map((x) => x.playerId);
    return Promise.all(all).then((results) => {
      const supplies: Record<string, number> = {};
      const rookie: Record<string, boolean> = {};
      const status: Record<string, RunRewardsStatus> = {};
      results.forEach((r, i) => {
        const id = ids[i] as string;
        supplies[id] = r.total;
        rookie[id] = r.rookie;
        status[id] = r.status;
      });
      this.deps.log.info({ runId: this.runId, supplies, rookie, status }, "run_supplies");
      return results;
    });
  }

  /** Stories 7.7 / 7.11 / 7.12: a leaver's meta writes (the room's `bankLeaver`), with the run's facts now. */
  seatMetaNow(world: Readonly<World>, p: Readonly<PlayerState>): { player: MetaPlayer; facts: RunFacts } {
    return { player: metaPlayer(p), facts: runFacts(world, this.deps.district ?? DEFAULT_DISTRICT) };
  }

  private async run(seat: BankSeat): Promise<RunRewards> {
    const record = copyRecord(seat.record);
    const leftWave = seat.ending === "quit" ? Math.max(0, Math.floor(seat.wave ?? 0)) : 0;
    const repo = this.deps.repo();
    const writes: RunMetaWrites | undefined = seat.meta ? seatMeta(seat.playerId, seat.meta.player as PlayerState, seat.ending === "extracted", seat.meta.facts) : undefined;
    const team = seat.teamLoot ? { teamLoot: seat.teamLoot } : {};
    // Unsaved / failed: nothing is written; the find still shows what it would have been (7.12: starter parts only owned).
    const preview = (): MetaLines => ({ ...team, ...(writes ? storedMeta(writes.grant(statsDelta(seat.meta?.player as PlayerState), new Set(), []).breakdown) : {}) });
    if (seat.accountId === null || repo === null) {
      const est = runSupplies(record, seat.ending, Number.POSITIVE_INFINITY); // no rookie guess: the lifetime is unknown
      return message(this.runId, this.seed, "not_saved", { ...est, waveCount: record.wavesIn, endlessWaveCount: record.endlessWavesIn, ending: seat.ending, leftWave }, 0, lootOnly(preview()), seat.lockedUsed);
    }
    const accountId = seat.accountId;
    const now = this.deps.nowMs ?? (() => performance.now());
    const pay = (lifetimeBefore: number) => {
      const s = runSupplies(record, seat.ending, lifetimeBefore);
      const breakdown: Breakdown = { ...s, ending: seat.ending, leftWave, waveCount: record.wavesIn, endlessWaveCount: record.endlessWavesIn, record };
      return { supplies: s.total, breakdown: breakdown as unknown as Record<string, unknown> };
    };
    let lastErr = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = now();
      try {
        const r = await repo.addSupplies(this.runId, accountId, pay, writes, this.topUps.has(seatKeyOf(seat)));
        const b = storedBreakdown(r.breakdown, r.supplies);
        const meta = storedMeta(r.breakdown);
        this.deps.log.info({ runId: this.runId, accountId, total: r.supplies, ms: Math.round((now() - t0) * 10) / 10, already: !r.banked }, "supplies_banked");
        if (r.banked && (meta.newItems?.length || meta.loot || meta.newDistricts?.length)) {
          // 7.11 / 7.12 / 7.7 log lines (keys and ids only; no names a player typed)
          this.deps.log.info({ runId: this.runId, accountId, items: meta.newItems?.map((x) => x.key) ?? [], loot: meta.loot ? { wave: meta.loot.wave, collector: meta.loot.key === null } : null, districts: meta.newDistricts?.map((x) => x.id) ?? [] }, "meta_granted");
        }
        const m = message(this.runId, this.seed, "saved", b, r.newTotal, { ...meta, ...team }, seat.lockedUsed);
        return r.nudge ? { ...m, nudge: true } : m; // Story 7.6 (AC 10): the one-time "Save my progress" line
      } catch (e) {
        const err = dbErrText(e); // review L5: never a query's parameters
        lastErr = err;
        // Review M1 / RR-M1 / RR2-L1: the attempt has really ended (boundedTransaction never reports early). Only a lost
        // COMMIT reply with the database then unreachable can mean "failed" although paid: the retry's duplicate key
        // or the hand-grant check (run_rewards first, docs/deploy.md › Database) covers it.
        this.deps.log.error({ runId: this.runId, accountId, err, attempt, ending: seat.ending, record, handGrant: HAND_GRANT_NOTE }, "supplies_bank_failed");
        if (attempt === 1) await new Promise((r) => setTimeout(r, this.deps.retryMs ?? BANK_RETRY_MS));
      }
    }
    // B33 (designer override 2026-11-25): a find whose bank failed is lost; one greppable line per failed find (no params).
    if (seat.meta && seat.meta.facts.lootFoundBy === seat.playerId) {
      this.deps.log.error({ playerId: seat.playerId, accountId, runId: this.runId, wave: seat.meta.facts.lootWave, err: lastErr }, "loot_bank_failed");
    }
    const est = runSupplies(record, seat.ending, Number.POSITIVE_INFINITY);
    return message(this.runId, this.seed, "failed", { ...est, waveCount: record.wavesIn, endlessWaveCount: record.endlessWavesIn, ending: seat.ending, leftWave }, 0, lootOnly(preview()), seat.lockedUsed);
  }
}

/** Unsaved / failed: only the find is shown (no item was granted; milestone and district lines need a saved bank). */
function lootOnly(m: MetaLines): MetaLines {
  const out: MetaLines = {};
  if (m.loot) out.loot = m.loot;
  if (m.teamLoot) out.teamLoot = m.teamLoot;
  return out;
}

/**
 * 7.12 D1: the teammates' line from the finder's result. B33 (designer override 2026-11-25): when the finder's item
 * isn't known — its bank failed (or timed out), or it never banked here — there is NO team line (no item is guessed,
 * no nameless "found the bag"). Review round 2 L1: only a SAVED find is named to teammates (`not_saved` too: no line).
 */
function teamLootOf(finder: string, r: RunRewards | undefined): TeamLoot | undefined {
  const l = (r as { loot?: LootFind } | undefined)?.loot;
  if (!l || r?.status !== "saved") return undefined; // review round 2 L1: only a saved find names an item
  return { playerId: finder, wave: l.wave, key: l.key, name: l.name };
}

/** Review H1 (8.3): a seat's bank key — its seat id, else its player id. */
function seatKeyOf(seat: { readonly playerId: string; readonly seatId?: string }): string {
  return seat.seatId ?? seat.playerId;
}
