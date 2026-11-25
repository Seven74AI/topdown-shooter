import { describe, expect, it, vi } from "vitest";
import { C2S, S2C, type RunRewards } from "@topdown/shared";
import { LAST_BANK_KEY, RewardsStore, formatSupplies, type KeyValueStore } from "./rewardsStore";
import { leaveAfterRewards } from "./lobbyStore";

/** Story 7.2 (AC 5, 6; D4): the client keeps the server's `run.rewards` and a Leave's one-time start-screen line. */
const msg = (over: Partial<RunRewards> = {}): RunRewards => ({
  runId: "0f1e2d3c-4b5a-4968-8776-655443322110",
  seed: 7,
  status: "saved",
  lines: { waves: 40, boss: 0, extract: 0, endless: 0, endlessBoss: 0 },
  waveCount: 4,
  endlessWaveCount: 0,
  rookie: false,
  total: 40,
  newTotal: 640,
  ...over,
});
function memory(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

describe("Story 7.2: rewardsStore", () => {
  it("keeps the latest valid message, tells listeners, and matches it to a run by seed (either arrival order)", () => {
    const s = new RewardsStore(() => null);
    s.setRun({ runId: msg().runId }); // run.started (RR-L1)
    const seen: (RunRewards | null)[] = [];
    s.subscribe((m) => seen.push(m));
    expect(s.forSeed(7)).toBeNull(); // Results first: "Saving…"
    s.receive(msg());
    expect(s.forSeed(7)?.total).toBe(40);
    expect(s.forSeed(8)).toBeNull(); // another run's Results never shows it
    expect(seen.length).toBe(1);
  });

  it("review L3 (B11): a message with fields from a later story is accepted and they are kept (forward compatible)", () => {
    const s = new RewardsStore(() => null);
    s.setRun({ runId: msg().runId }); // run.started (RR-L1)
    const r = s.receive({ ...msg(), items: [{ id: "riot", milestone: "M2" }], unlock: { weapon: "grenade_launcher", price: 500 } });
    expect(r).not.toBeNull();
    expect((r as unknown as { items: unknown[] }).items.length).toBe(1);
  });

  it("re-review RR-L1 (B18 amended): only the current run's rewards are accepted — a late message of the previous run is ignored even with the same seed", () => {
    const s = new RewardsStore(() => null);
    const seen: (RunRewards | null)[] = [];
    s.subscribe((m) => seen.push(m));
    expect(s.receive(msg())).toBeNull(); // before run.started: not accepted
    s.setRun({ runId: msg().runId });
    expect(s.receive(msg())?.total).toBe(40);
    const run2 = "1f1e2d3c-4b5a-4968-8776-655443322111";
    s.setRun({ runId: run2 }); // run 2 starts: run 1's rewards are forgotten
    expect(s.forSeed(7)).toBeNull();
    expect(seen.at(-1)).toBeNull();
    expect(s.receive(msg())).toBeNull(); // run 1's message arriving LATE during run 2 (dev fixed seed: same seed)
    expect(s.forSeed(7)).toBeNull();
    expect(s.receive(msg({ runId: run2 }))?.runId).toBe(run2);
    s.setRun({ runId: run2 }); // the same run again (a rejoin): its rewards stay
    expect(s.forSeed(7)?.runId).toBe(run2);
    s.setRun({ runId: "not-a-uuid" }); // garbage: ignored
    expect(s.forSeed(7)?.runId).toBe(run2);
  });

  it("ignores garbage (a hand-made message with a bad shape or a negative amount)", () => {
    const s = new RewardsStore(() => null);
    s.setRun({ runId: msg().runId }); // run.started (RR-L1)
    expect(s.receive({ total: 999999 })).toBeNull();
    expect(s.receive({ ...msg(), total: -5 })).toBeNull();
    expect(s.get()).toBeNull();
  });

  it("D4: a Leave's saved bank becomes the start screen's line once, then is gone", () => {
    const store = memory();
    const s = new RewardsStore(() => store);
    s.setRun({ runId: msg().runId }); // run.started (RR-L1)
    s.receive(msg({ total: 1240 }), true);
    expect(store.map.has(LAST_BANK_KEY)).toBe(true);
    expect(s.takeLeaveLine()).toBe("+1,240 Supplies banked from your last run");
    expect(s.takeLeaveLine()).toBeNull();
  });

  it("re-review 2 N-RR2-2: a Leave's answer is kept for the start screen even after the phone joined another run", () => {
    const store = memory();
    const s = new RewardsStore(() => store);
    s.setRun({ runId: "1f1e2d3c-4b5a-4968-8776-655443322111" }); // already in a newer run
    expect(s.receive(msg({ total: 90 }), true)).toBeNull(); // not shown on that run's Results…
    expect(s.takeLeaveLine()).toBe("+90 Supplies banked from your last run"); // …but the start-screen line is kept
  });

  it("D4: nothing to show for a failed / unsaved / empty bank, or an ordinary run end (not a Leave)", () => {
    const store = memory();
    const s = new RewardsStore(() => store);
    s.setRun({ runId: msg().runId }); // run.started (RR-L1)
    s.receive(msg({ status: "failed", total: 0 }), true);
    s.receive(msg({ status: "not_saved", total: 0 }), true);
    s.receive(msg({ total: 0 }), true);
    s.receive(msg({ total: 50 }));
    expect(s.takeLeaveLine()).toBeNull();
  });

  it("storage that throws (private window) shows nothing and never throws", () => {
    const bad: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    const s = new RewardsStore(() => bad);
    s.setRun({ runId: msg().runId }); // run.started (RR-L1)
    expect(() => s.receive(msg(), true)).not.toThrow();
    expect(s.takeLeaveLine()).toBeNull();
  });

  it("formatSupplies groups thousands", () => {
    expect(formatSupplies(1240)).toBe("1,240");
    expect(formatSupplies(0)).toBe("0");
  });
});

describe("Story 7.2 (S3, D4): the Leave path", () => {
  function fakeRoom(phase: string) {
    const handlers = new Map<string, (m: unknown) => void>();
    return {
      state: { phase },
      sent: [] as [string, unknown][],
      left: [] as boolean[],
      send(type: string, m: unknown) {
        this.sent.push([type, m]);
      },
      onMessage(type: string, cb: (m: unknown) => void) {
        handlers.set(type, cb);
        return () => handlers.delete(type);
      },
      leave(consented: boolean) {
        this.left.push(consented);
        return Promise.resolve(4000);
      },
      emit(type: string, m: unknown) {
        handlers.get(type)?.(m);
      },
      handlers,
    };
  }

  it("mid-run: sends run.leave, keeps the socket until run.rewards arrives, then the consented leave", () => {
    const room = fakeRoom("wave");
    leaveAfterRewards(room as never, 1500);
    expect(room.sent).toEqual([[C2S.RUN_LEAVE, {}]]);
    expect(room.left).toEqual([]);
    room.emit(S2C.RUN_REWARDS, msg());
    expect(room.left).toEqual([true]);
    expect(room.handlers.has(S2C.RUN_REWARDS)).toBe(false);
  });

  it("mid-run with no answer: leaves after the wait anyway (never stuck)", () => {
    vi.useFakeTimers();
    try {
      const room = fakeRoom("build");
      leaveAfterRewards(room as never, 1500);
      vi.advanceTimersByTime(1499);
      expect(room.left).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(room.left).toEqual([true]);
      room.emit(S2C.RUN_REWARDS, msg()); // late: nothing more
      expect(room.left).toEqual([true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lobby or Results: leaves at once, sends nothing", () => {
    for (const phase of ["lobby", "results"]) {
      const room = fakeRoom(phase);
      leaveAfterRewards(room as never);
      expect(room.sent).toEqual([]);
      expect(room.left).toEqual([true]);
    }
  });
});
