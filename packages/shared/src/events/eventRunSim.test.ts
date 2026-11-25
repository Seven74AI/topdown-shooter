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
  it("8 seeds × 2 bots: 2 events each, both kinds seen, all 10 waves cleared", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
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
    }
    // Stories 6.9 + 6.10: all six kinds are in the draw now, and 8 seeds × 2 events see every one.
    expect([...kinds].sort()).toEqual([...EVENT_KINDS].sort());
  }, 300_000);
});
