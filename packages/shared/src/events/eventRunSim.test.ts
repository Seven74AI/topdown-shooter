import { describe, expect, it } from "vitest";
import { runHeadless } from "../bots/headlessRun";
import type { World } from "../core/world";
import { balance } from "./testEvents";
import { EVENT_KINDS } from "./eventState";

/**
 * Story 6.8 (T7, brief 9): the real 10-wave run with every system (god-mode bots: every wave is
 * played): over 8 seeds every run triggers exactly its 2 scheduled events (none skipped), in waves
 * 3–8 but never 5 or back-to-back, both kinds of this story are seen, and every run still ends on
 * Results with all 10 waves cleared (an event never makes a wave endless).
 */
describe("Story 6.8: events in the 10-wave run", () => {
  describe("8 seeds × 2 bots: 2 events each, both kinds seen, all 10 waves cleared", () => {
    // E8-A8 (no test over 30 s): one test per seed, then the totals. Same runs, order and assertions as the old single
    // test (53 s in CI); the totals need every seed test above to have run (a -t filter on one seed fails them).
    const kinds = new Set<string>();
    let casesRun = 0;
    it.each([1, 2, 3, 4, 5, 6, 7, 8])("seed %i: 2 events, all 10 waves cleared", (seed) => {
      const trig: { kind: string; wave: number }[] = [];
      let skipped = 0;
      let world: World | null = null;
      const r = runHeadless({
        balance,
        seed,
        players: 2,
        god: true,
        setup: (w) => {
          world = w;
          w.events.subscribe((e) => {
            if (e.type === "event.triggered") trig.push({ kind: e.kind, wave: e.wave });
            if (e.type === "event.skipped") skipped++;
          });
        },
      });
      expect(r.timedOut, `seed ${seed}`).toBe(false);
      expect(r.wavesCleared, `seed ${seed}`).toBe(10);
      expect(skipped, `seed ${seed}`).toBe(0);
      expect(trig, `seed ${seed}`).toHaveLength(2);
      const [a, b] = trig as [{ kind: string; wave: number }, { kind: string; wave: number }];
      expect(a.kind).not.toBe(b.kind);
      expect(b.wave - a.wave).toBeGreaterThanOrEqual(2);
      for (const t of trig) {
        expect(t.wave).toBeGreaterThanOrEqual(3);
        expect(t.wave).toBeLessThanOrEqual(8);
        expect(t.wave).not.toBe(5);
        kinds.add(t.kind);
      }
      expect((world as World | null)?.special.log.triggered).toBe(2);
      casesRun++;
    }, 120_000);

    it("the 8 seeds together: every event kind seen", () => {
      expect(casesRun, "every case above ran and passed").toBe(8);
      // Stories 6.9 + 6.10: all six kinds are in the draw now, and 8 seeds × 2 events see every one.
      expect([...kinds].sort()).toEqual([...EVENT_KINDS].sort());
    });
  });
});
