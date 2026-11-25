import { addPlayer, createWorld, loadBalance, type RunRewards, type World } from "@topdown/shared";
import { describe, expect, it, vi } from "vitest";
import type { BankResult, ProgressRepo, RunPayout } from "../db/progressRepo";
import { DbUnavailableError } from "../db/timeout";
import { BANK_RETRY_MS, RunBank } from "./banking";

/** Story 7.2 (AC 3, 4, 8; S3, S6): the bank's rules with a fake repository (the SQL side: db/runRewards.test.ts). */
const ACCT = "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const ACCT2 = "11111111-2222-4333-8444-555555555555";
const rec = (wavesIn: number, bossesIn = 0, endlessWavesIn = 0, endlessBossesIn = 0) => ({ wavesIn, bossesIn, endlessWavesIn, endlessBossesIn });

/** A repository that keeps rows in memory; `fail` makes the next N calls throw like the real timeout. */
function fakeRepo(lifetime = 10_000) {
  const rows = new Map<string, BankResult>();
  let supplies = 0;
  const state = { fail: 0, calls: 0 };
  const repo: Pick<ProgressRepo, "addSupplies"> = {
    addSupplies: async (runId: string, accountId: string, pay: (l: number) => RunPayout) => {
      state.calls++;
      if (state.fail > 0) {
        state.fail--;
        throw new DbUnavailableError("progress.addSupplies", "timeout");
      }
      const key = `${runId}/${accountId}`;
      const earlier = rows.get(key);
      if (earlier) return { ...earlier, banked: false };
      const p = pay(lifetime + supplies);
      supplies += p.supplies;
      const r = { banked: true, supplies: p.supplies, newTotal: supplies, breakdown: p.breakdown, nudge: false };
      rows.set(key, r);
      return r;
    },
  };
  return { repo: repo as ProgressRepo, state, rows };
}

function bankWith(repo: ProgressRepo | null, retryMs = 1) {
  const delivered: [string, RunRewards][] = [];
  const log = { info: vi.fn(), error: vi.fn() };
  const bank = new RunBank(1234, { repo: () => repo, log, deliver: (id, m) => delivered.push([id, m]), retryMs });
  return { bank, delivered, log };
}

describe("Story 7.2: RunBank", () => {
  it("S6: banks a seat with the server's record and sends saved + the breakdown; supplies_banked {runId, accountId, total, ms}", async () => {
    const { repo } = fakeRepo();
    const { bank, delivered, log } = bankWith(repo);
    const m = await bank.bank({ playerId: "p0", accountId: ACCT, record: rec(10, 1), ending: "extracted" });
    expect(m).toMatchObject({ runId: bank.runId, seed: 1234, status: "saved", lines: { waves: 100, boss: 50, extract: 100, endless: 0, endlessBoss: 0 }, waveCount: 10, rookie: false, total: 250, newTotal: 250 });
    expect(delivered).toEqual([["p0", m]]);
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ runId: bank.runId, accountId: ACCT, total: 250, already: false, ms: expect.any(Number) }), "supplies_banked");
  });

  it("review L4: a Leave's bank says ending quit and the wave it was made in; a run-end bank says its ending, leftWave 0", async () => {
    const { repo } = fakeRepo();
    const { bank } = bankWith(repo);
    const q = await bank.bank({ playerId: "p0", accountId: ACCT, record: rec(3), ending: "quit", wave: 4 });
    expect(q).toMatchObject({ ending: "quit", leftWave: 4 });
    const e = await bank.bank({ playerId: "p1", accountId: ACCT2, record: rec(10, 1), ending: "extracted", wave: 10 });
    expect(e).toMatchObject({ ending: "extracted", leftWave: 0 });
  });

  it("S5: a rookie (lifetime < 300) gets × 2 and the flag", async () => {
    const { repo } = fakeRepo(0);
    const { bank } = bankWith(repo);
    const m = await bank.bank({ playerId: "p0", accountId: ACCT, record: rec(5), ending: "wiped" });
    expect(m).toMatchObject({ status: "saved", rookie: true, total: 100, lines: { waves: 50 } });
  });

  it("each seat banks once per run: a second call (leave, then run end) does not call the database again and re-delivers", async () => {
    const { repo, state } = fakeRepo();
    const { bank, delivered } = bankWith(repo);
    const a = await bank.bank({ playerId: "p0", accountId: ACCT, record: rec(4), ending: "quit" });
    const b = await bank.bank({ playerId: "p0", accountId: ACCT, record: rec(9, 1), ending: "extracted" });
    await Promise.resolve();
    expect(state.calls).toBe(1);
    expect(b).toBe(a);
    expect(a.total).toBe(40);
    expect(delivered.length).toBe(2);
  });

  it("AC 4: a failed write is logged and retried once after BANK_RETRY_MS (2 s) → saved", async () => {
    expect(BANK_RETRY_MS).toBe(2000);
    vi.useFakeTimers();
    try {
      const { repo, state } = fakeRepo();
      state.fail = 1;
      const { bank, log } = bankWith(repo, BANK_RETRY_MS);
      const p = bank.bank({ playerId: "p0", accountId: ACCT, record: rec(3), ending: "wiped" });
      await vi.advanceTimersByTimeAsync(BANK_RETRY_MS - 1);
      expect(state.calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      const m = await p;
      expect(state.calls).toBe(2);
      expect(m.status).toBe("saved");
      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ runId: bank.runId, accountId: ACCT, attempt: 1, ending: "wiped", record: rec(3), err: expect.any(String) }), "supplies_bank_failed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-review RR-M1: no timer of its own: a slow attempt (3 s) that commits is reported saved, and a retry starts only after a failed attempt has ended", async () => {
    vi.useFakeTimers();
    try {
      const log: string[] = [];
      let n = 0;
      const repo = {
        addSupplies: async (_run: string, _acct: string, pay: (l: number) => RunPayout) => {
          const k = ++n;
          log.push(`start${k}@${Date.now()}`);
          await new Promise((r) => setTimeout(r, 3000));
          log.push(`end${k}@${Date.now()}`);
          if (k === 1) throw new DbUnavailableError("progress.addSupplies", "error");
          const p = pay(10_000);
          return { banked: true, supplies: p.supplies, newTotal: p.supplies, breakdown: p.breakdown, nudge: false };
        },
      } as unknown as ProgressRepo;
      const t0 = Date.now();
      const { bank } = bankWith(repo, BANK_RETRY_MS);
      const p = bank.bank({ playerId: "p0", accountId: ACCT, record: rec(2), ending: "wiped" });
      await vi.advanceTimersByTimeAsync(3000 + BANK_RETRY_MS + 3000);
      const m = await p;
      expect(m.status).toBe("saved");
      expect(log).toEqual([`start1@${t0}`, `end1@${t0 + 3000}`, `start2@${t0 + 3000 + BANK_RETRY_MS}`, `end2@${t0 + 6000 + BANK_RETRY_MS}`]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC 4: two failures → logged twice, no third try, status failed (\"Couldn't save this run\")", async () => {
    const { repo, state } = fakeRepo();
    state.fail = 5;
    const { bank, log } = bankWith(repo);
    const m = await bank.bank({ playerId: "p0", accountId: ACCT, record: rec(6), ending: "wiped" });
    expect(state.calls).toBe(2);
    expect(log.error).toHaveBeenCalledTimes(2);
    expect(m).toMatchObject({ status: "failed", total: 0, newTotal: 0 });
  });

  it("a retry after a write that DID commit (the timeout fired late) finds the row: saved, paid once", async () => {
    const { repo, state, rows } = fakeRepo();
    const { bank } = bankWith(repo);
    rows.set(`${bank.runId}/${ACCT}`, { banked: true, supplies: 60, newTotal: 60, breakdown: { waves: 60, waveCount: 6, rookie: false }, nudge: false });
    const m = await bank.bank({ playerId: "p0", accountId: ACCT, record: rec(6), ending: "wiped" });
    expect(state.calls).toBe(1);
    expect(m).toMatchObject({ status: "saved", total: 60, newTotal: 60, lines: { waves: 60 }, waveCount: 6 });
  });

  it("no account (unsaved play) or no database → not_saved at once, no database call", async () => {
    const { repo, state } = fakeRepo();
    const a = bankWith(repo);
    expect(await a.bank.bank({ playerId: "p0", accountId: null, record: rec(5), ending: "wiped" })).toMatchObject({ status: "not_saved", total: 0 });
    expect(state.calls).toBe(0);
    const b = bankWith(null);
    expect(await b.bank.bank({ playerId: "p0", accountId: ACCT, record: rec(5), ending: "wiped" })).toMatchObject({ status: "not_saved" });
  });

  it("AC 3: at the run end, members in the World or held get the run's ending; remembered seats bank quit; run_supplies logged", async () => {
    const world: World = createWorld({ balance: loadBalance(), seed: 3 });
    const p0 = addPlayer(world, "p0", 10, 10);
    const p1 = addPlayer(world, "p1", 12, 10);
    Object.assign(p0, rec(10, 1));
    Object.assign(p1, rec(10, 1));
    world.players.delete("p1");
    world.heldPlayers.set("p1", { player: p1, buildIdx: 0, atTick: 0 }); // held at the extract (8.1)
    world.run.ending = "extracted";
    const { repo } = fakeRepo();
    const { bank, log } = bankWith(repo);
    const results = await bank.bankRunEnd(
      world,
      [
        { playerId: "p0", accountId: ACCT },
        { playerId: "p1", accountId: ACCT2 },
      ],
      [{ playerId: "p2", accountId: null, player: rec(4) }],
    );
    expect(results.map((r) => [r.status, r.total])).toEqual([
      ["saved", 250],
      ["saved", 250],
      ["not_saved", 0],
    ]);
    expect(results[2]?.lines.waves).toBe(40); // the remembered seat: quit (no extract)
    expect(results[2]?.lines.extract).toBe(0);
    expect(log.info).toHaveBeenCalledWith({ runId: bank.runId, supplies: { p0: 250, p1: 250, p2: 0 }, rookie: { p0: false, p1: false, p2: false }, status: { p0: "saved", p1: "saved", p2: "not_saved" } }, "run_supplies");
  });

  it("the record is copied when the bank starts: later changes to the live PlayerState don't change what is paid", async () => {
    const { repo } = fakeRepo();
    const { bank } = bankWith(repo);
    const live = rec(4);
    const p = bank.bank({ playerId: "p0", accountId: ACCT, record: live, ending: "quit" });
    live.wavesIn = 9;
    expect((await p).lines.waves).toBe(40);
  });
});

describe("Stories 8.2+8.3 review: RunBank by seat", () => {
  it("L1: a Leave's bank still in flight when the seat is reopened (it came back) delivers nothing; the top-up's result does", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const calls: boolean[] = [];
    const repo = {
      addSupplies: async (_run: string, _acct: string, pay: (l: number) => RunPayout, _meta?: unknown, topUp?: boolean) => {
        calls.push(topUp === true);
        if (topUp !== true) await gate; // the Leave's write is slow
        const p = pay(10_000);
        return { banked: true, supplies: p.supplies, newTotal: p.supplies, breakdown: p.breakdown, nudge: false };
      },
    } as unknown as ProgressRepo;
    const { bank, delivered } = bankWith(repo);
    const leave = bank.bank({ playerId: "p1", seatId: "p1#2", accountId: "a", record: rec(1), ending: "quit" });
    bank.reopen("p1#2");
    const end = await bank.bank({ playerId: "p1", seatId: "p1#2", accountId: "a", record: rec(5), ending: "wiped" });
    release();
    await leave;
    await new Promise((r) => setTimeout(r, 5));
    expect(calls).toEqual([false, true]);
    expect(delivered.map(([id, m]) => [id, m.waveCount])).toEqual([["p1#2", 5]]); // never the stale Leave result
    expect(bank.resultFor("p1#2")?.waveCount).toBe(end.waveCount);
  });

  it("H1: two seats with the same player id (a removed one and its new occupant) bank and deliver separately", async () => {
    const { repo } = fakeRepo();
    const { bank, delivered } = bankWith(repo);
    await bank.bank({ playerId: "p3", seatId: "p3#4", accountId: "di", record: rec(2), ending: "quit" });
    await bank.bank({ playerId: "p3", seatId: "p3#6", accountId: "eve", record: rec(1), ending: "wiped" });
    expect(delivered.map(([id]) => id)).toEqual(["p3#4", "p3#6"]);
    expect(bank.resultFor("p3#6")?.waveCount).toBe(1);
  });
});
