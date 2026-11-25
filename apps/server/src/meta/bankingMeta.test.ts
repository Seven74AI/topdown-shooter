import { addPlayer, createWorld, holdPlayer, loadBalance, lootPartKeys, MILESTONES, type RunRewards, type World } from "@topdown/shared";
import { describe, expect, it, vi } from "vitest";
import type { BankResult, LifetimeStatsRow, ProgressRepo, RunMetaWrites, RunPayout } from "../db/progressRepo";
import { RunBank } from "./banking";
import { milestonesReached } from "./milestones";
import { runFacts, seatMeta, statsDelta } from "./runMeta";

/**
 * Stories 7.7 + 7.11 + 7.12 in 7.2's RunBank (a fake repository that runs the meta writes like the SQL one does —
 * the SQL side is db/metaBank.test.ts): every ending, the finder banks first and every teammate's Results names the
 * item (7.12 D1), a leaver banks with what it had then, an unsaved finder still sees the find, M8 needs all four.
 */
const balance = loadBalance();
const ACCTS = ["0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c0", "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c1", "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c2", "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c3"];

function fakeRepo() {
  const rows = new Map<string, BankResult>();
  const owned = new Map<string, Set<string>>();
  const order: string[] = [];
  const repo: Pick<ProgressRepo, "addSupplies"> = {
    addSupplies: async (runId: string, accountId: string, pay: (l: number) => RunPayout, meta?: RunMetaWrites) => {
      await new Promise((r) => setTimeout(r, accountId === ACCTS[0] ? 5 : 0)); // the finder's write is the slow one
      order.push(accountId);
      const key = `${runId}/${accountId}`;
      const earlier = rows.get(key);
      if (earlier) return { ...earlier, banked: false };
      const p = pay(10_000);
      const mine = owned.get(accountId) ?? new Set<string>();
      owned.set(accountId, mine);
      const stats: LifetimeStatsRow = meta ? meta.statsDelta : { revives: 0, kills: 0, barricades: 0, runs: 0 };
      const g = meta?.grant(stats, mine, []);
      for (const k of g?.cosmetics ?? []) mine.add(k);
      const r = { banked: true, supplies: p.supplies, newTotal: p.supplies, breakdown: { ...p.breakdown, ...(g?.breakdown ?? {}) }, nudge: false };
      rows.set(key, r);
      return r;
    },
  };
  return { repo: repo as ProgressRepo, owned, order };
}

function team(n: number, ending: "wiped" | "extracted" | "lost"): World {
  const w = createWorld({ balance, seed: 3, loot: { off: true } });
  for (let i = 0; i < n; i++) {
    const p = addPlayer(w, `p${i}`, 10 + i, 10);
    p.wavesIn = 5;
    p.waveMask = 0b11111; // waves 1–5 ended while in
  }
  w.run.ending = ending;
  return w;
}

describe("Stories 7.7 / 7.11 / 7.12 in RunBank", () => {
  it("M-F4: M1 is granted on every ending (wipe, extract, endless loss) and for a quitter", async () => {
    for (const ending of ["wiped", "extracted", "lost"] as const) {
      const { repo } = fakeRepo();
      const bank = new RunBank(1, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: () => {}, retryMs: 1 });
      const w = team(1, ending);
      const [m] = await bank.bankRunEnd(w, [{ playerId: "p0", accountId: ACCTS[0] as string }], []);
      expect((m as RunRewards).newItems?.map((i) => i.key), ending).toContain("head:fire");
    }
    const { repo } = fakeRepo();
    const bank = new RunBank(1, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: () => {}, retryMs: 1 });
    const w = team(1, "wiped");
    const p = w.players.get("p0")!;
    const q = await bank.bank({ playerId: "p0", accountId: ACCTS[0] as string, record: p, ending: "quit", wave: 6, meta: bank.seatMetaNow(w, p) });
    expect(q.newItems?.map((i) => i.key)).toContain("head:fire");
  });

  it("7.11 AC 6: a leaver banks with what it had at the Leave (later counters don't change its bank)", async () => {
    const { repo } = fakeRepo();
    const bank = new RunBank(1, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: () => {}, retryMs: 1 });
    const w = team(1, "wiped");
    const p = w.players.get("p0")!;
    p.waveMask = 0b1111; // left after wave 4
    const pending = bank.bank({ playerId: "p0", accountId: ACCTS[0] as string, record: p, ending: "quit", wave: 5, meta: bank.seatMetaNow(w, p) });
    p.waveMask = 0b11111; // the World moves on before the write lands
    expect((await pending).newItems ?? []).toEqual([]);
  });

  it("7.12 D1: the finder banks first; every teammate's Results names the find; the finder's own line is the loot", async () => {
    const { repo, order } = fakeRepo();
    const delivered: [string, RunRewards][] = [];
    const bank = new RunBank(1, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: (id, m) => delivered.push([id, m]), retryMs: 1 });
    const w = team(3, "wiped");
    w.loot.foundBy = "p0";
    w.loot.foundWave = 6;
    w.loot.plan.itemRoll = 0;
    const res = await bank.bankRunEnd(w, [0, 1, 2].map((i) => ({ playerId: `p${i}`, accountId: ACCTS[i] as string })), []);
    expect(order[0]).toBe(ACCTS[0]); // the finder's (slower) write still came first
    const loot = lootPartKeys();
    expect(res[0]?.loot).toEqual({ wave: 6, key: loot[0], name: "Floral shirt" });
    expect(res[0]?.teamLoot).toBeUndefined();
    for (const r of res.slice(1)) {
      expect(r.teamLoot).toEqual({ playerId: "p0", wave: 6, key: loot[0], name: "Floral shirt" });
      expect(r.loot).toBeUndefined();
    }
  });

  it("review M1: a finder who left (bank still in flight) is awaited; a finder never banked here → no team line (B33 override)", async () => {
    const { repo } = fakeRepo();
    const bank = new RunBank(1, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: () => {}, retryMs: 1 });
    const w = team(2, "wiped");
    w.loot.foundBy = "p0";
    w.loot.foundWave = 3;
    w.loot.plan.itemRoll = 0;
    const p0 = w.players.get("p0")!;
    void bank.bank({ playerId: "p0", accountId: ACCTS[0] as string, record: p0, ending: "quit", wave: 4, meta: bank.seatMetaNow(w, p0) }); // slow write (5 ms), not awaited
    const [r1] = await bank.bankRunEnd(w, [{ playerId: "p1", accountId: ACCTS[1] as string }], []);
    expect(r1?.teamLoot).toEqual({ playerId: "p0", wave: 3, key: lootPartKeys()[0], name: "Floral shirt" });
    const bank2 = new RunBank(2, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: () => {}, retryMs: 1 });
    const w2 = team(1, "wiped");
    w2.loot.foundBy = "p3"; // gone without a bank in this room
    w2.loot.foundWave = 3;
    const [r] = await bank2.bankRunEnd(w2, [{ playerId: "p0", accountId: ACCTS[1] as string }], []);
    expect(r?.teamLoot).toBeUndefined();
  });

  it("B33 (designer override 2026-11-25): the finder's bank fails → no team line, the finder's row says so, one loot_bank_failed line without params", async () => {
    const { repo } = fakeRepo();
    const failing: ProgressRepo = {
      ...repo,
      addSupplies: async (runId, accountId, pay, meta) => {
        if (accountId === ACCTS[0]) throw new Error('insert into "run_rewards" failed: timeout\nparams: 0f1e,secret-hash-123');
        return repo.addSupplies(runId, accountId, pay, meta);
      },
    };
    const error = vi.fn();
    const bank = new RunBank(1, { repo: () => failing, log: { info: vi.fn(), error }, deliver: () => {}, retryMs: 1 });
    const w = team(2, "wiped");
    w.loot.foundBy = "p0";
    w.loot.foundWave = 6;
    w.loot.plan.itemRoll = 0;
    const [f, t] = await bank.bankRunEnd(w, [0, 1].map((i) => ({ playerId: `p${i}`, accountId: ACCTS[i] as string })), []);
    expect(f?.status).toBe("failed");
    expect(f?.loot?.wave).toBe(6); // the finder's Results can say which find was lost
    expect(t?.status).toBe("saved");
    expect(t?.teamLoot).toBeUndefined();
    const lines = error.mock.calls.filter((c) => c[1] === "loot_bank_failed");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.[0]).toEqual({ playerId: "p0", accountId: ACCTS[0], runId: bank.runId, wave: 6, err: 'insert into "run_rewards" failed: timeout' });
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret-hash");
  });

  it("7.12: an unsaved finder (no account) still sees the find; nothing else is granted without a saved bank", async () => {
    const bank = new RunBank(1, { repo: () => null, log: { info: vi.fn(), error: vi.fn() }, deliver: () => {}, retryMs: 1 });
    const w = team(2, "extracted");
    w.loot.foundBy = "p1";
    w.loot.foundWave = 4;
    const [a, b] = await bank.bankRunEnd(w, [{ playerId: "p0", accountId: null }, { playerId: "p1", accountId: null }], []);
    expect(b?.loot?.key).toBe(lootPartKeys()[0]);
    expect(a?.teamLoot?.playerId).toBe("p1");
    expect(a?.newItems).toBeUndefined();
    expect(a?.newDistricts).toBeUndefined();
  });

  it("M8: extracting with exactly four all standing grants the laurel to all four; three, or one downed, doesn't", async () => {
    const run = async (n: number, downed: boolean) => {
      const { repo } = fakeRepo();
      const bank = new RunBank(1, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: () => {}, retryMs: 1 });
      const w = team(n, "extracted");
      if (downed) w.players.get("p1")!.status = "downed";
      const res = await bank.bankRunEnd(w, Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, accountId: ACCTS[i] as string })), []);
      return res.map((r) => (r.newItems ?? []).some((i) => i.key === "head:laurel"));
    };
    expect(await run(4, false)).toEqual([true, true, true, true]);
    expect(await run(3, false)).toEqual([false, false, false]);
    expect((await run(4, true)).some(Boolean)).toBe(false);
  });

  it("review L6: four at the extract but one held (dropped, on hold) → no M8 for anyone", async () => {
    const w = team(4, "extracted");
    expect(runFacts(w, "downtown").extractedAllFour).toBe(true);
    holdPlayer(w, "p3");
    expect(w.heldPlayers.has("p3")).toBe(true);
    expect(runFacts(w, "downtown").extractedAllFour).toBe(false);
    const { repo } = fakeRepo();
    const bank = new RunBank(1, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: () => {}, retryMs: 1 });
    const res = await bank.bankRunEnd(w, Array.from({ length: 4 }, (_, i) => ({ playerId: `p${i}`, accountId: ACCTS[i] as string })), []);
    expect(res.some((r) => (r.newItems ?? []).some((i) => i.key === "head:laurel"))).toBe(false);
  });

  it("review L5: 20 runs quit in build 1 (wave 1 never ended while in) → 0 runs, no M9; 20 with wave 1 → M9", () => {
    const w = team(1, "wiped");
    const p = w.players.get("p0")!;
    const total = (mask: number) => {
      p.waveMask = mask;
      let runs = 0;
      for (let i = 0; i < 20; i++) runs += statsDelta(p).runs;
      return runs;
    };
    expect(total(0)).toBe(0);
    expect(milestonesReached({ waveMask: 0, bossKilledWhileIn: false, extracted: false, district: "downtown", extractedAllFour: false, downsWaves1to10: 0 }, { revives: 0, kills: 0, barricades: 0, runs: total(0) })).not.toContain("m9");
    expect(total(0b1)).toBe(20);
  });

  it("review L7 (Beat the rule 6): the loot pick comes after this run's milestone parts (never the part just granted)", () => {
    const w = team(1, "wiped"); // waves 1–5 → M1 (head:fire)
    w.loot.foundBy = "p0";
    w.loot.foundWave = 3;
    w.loot.plan.itemRoll = 0; // the first unowned part of the list
    const m1 = MILESTONES[0]!;
    expect(m1.id).toBe("m1");
    const overlap = ["head:fire", ...lootPartKeys()]; // a catalogue where M1's part could also come out of the bag
    const g = seatMeta("p0", w.players.get("p0")!, false, runFacts(w, "downtown"), overlap).grant({ revives: 0, kills: 0, barricades: 0, runs: 1 }, new Set(), []);
    expect(g.cosmetics[0]).toBe("head:fire");
    expect((g.breakdown.loot as { key: string }).key).toBe(lootPartKeys()[0]);
    expect(g.cosmetics.filter((k) => k === "head:fire")).toHaveLength(1);
  });

  it("7.7 R1: District 2 for the seats at the extract; a quitter (remembered seat) gets nothing", async () => {
    const { repo } = fakeRepo();
    const bank = new RunBank(1, { repo: () => repo, log: { info: vi.fn(), error: vi.fn() }, deliver: () => {}, retryMs: 1 });
    const w = team(1, "extracted");
    const gone = addPlayer(w, "p3", 1, 1);
    w.players.delete("p3");
    const [a, q] = await bank.bankRunEnd(w, [{ playerId: "p0", accountId: ACCTS[0] as string }], [{ playerId: "p3", accountId: ACCTS[3] as string, player: gone }]);
    expect(a?.newDistricts).toEqual([{ id: "district_2", name: "District 2" }]);
    expect(q?.newDistricts).toBeUndefined();
  });
});
