import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { runHeadless } from "../bots/headlessRun";
import type { World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { parseDevEvents } from "./devEvents";
import { EVENT_KINDS } from "./eventState";

/**
 * Stories 6.9 + 6.10 (T5, brief 9 / 15): whole 10-wave runs with every real system and the four new
 * events forced in different waves (`DEV_EVENTS`-style: `debug.events`), 4 god-mode bots, 8 seeds.
 * Liveness: ≥ 1 gas boom that killed ≥ 1 zombie, ≥ 1 crate taken by a bot, a power failure that went
 * dark (blackout ticks counted), ≥ 1 survivor saved (+100 to everyone) and ≥ 1 lost; every run plays
 * all 10 waves (no stall: the hissing tank holds a wave only 10 s; the survivor never holds one).
 */
const balance = loadBalance();
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const FORCED = "survivor@3,supply_drop@4,power_failure@6,gas_leak@8";
const info = (msg: string): void => (globalThis as unknown as { console: { info(m: string): void } }).console.info(msg);
const IDX = (k: string): number => EVENT_KINDS.indexOf(k as (typeof EVENT_KINDS)[number]);

describe("Stories 6.9 + 6.10: the four events in whole runs", () => {
  it("8 seeds × 4 god-mode bots: every run plays all 10 waves; booms kill, bots take crates, the power fails, survivors are saved and lost", () => {
    let booms = 0;
    let gasKills = 0;
    let crates = 0;
    let dark = 0;
    let saved = 0;
    let lost = 0;
    let eventPay = 0;
    for (const seed of SEEDS) {
      let darkTicks = 0;
      const onTick = (w: World): void => {
        if (w.lights.powerFailure && w.lights.blackoutPct > 0) darkTicks++;
      };
      let end: World | null = null;
      const r = runHeadless({
        balance,
        seed,
        players: 4,
        god: true,
        setup: (w) => {
          w.debug.events = parseDevEvents(FORCED);
        },
        onTick,
        onEnd: (w) => void (end = w),
      });
      expect(r.timedOut, `seed ${seed}`).toBe(false);
      expect(r.wavesCleared, `seed ${seed}`).toBe(10);
      const w = end as unknown as World;
      const log = w.special.log;
      for (const k of ["gas_leak", "supply_drop", "power_failure", "survivor"]) expect(log.byKind[IDX(k)], `seed ${seed}: ${k} triggered`).toBe(1);
      booms += log.gasBooms;
      gasKills += log.gasKills;
      crates += log.cratesTaken;
      dark += darkTicks > 0 ? 1 : 0;
      saved += log.survivorsSaved;
      lost += log.survivorsLost;
      eventPay += r.earnedBy.event;
      expect(w.lights.powerFailure, `seed ${seed}: the flag is cleared after the wave`).toBe(false);
    }
    info(`events sim: booms ${booms}, gas kills ${gasKills}, crates ${crates}, dark ${dark}, saved ${saved}, lost ${lost}, event pay ${eventPay}`);
    expect(booms).toBe(SEEDS.length); // one blast per gas leak, never two
    expect(gasKills).toBeGreaterThan(0);
    expect(crates).toBeGreaterThan(0);
    expect(dark).toBe(SEEDS.length);
    expect(saved + lost).toBe(SEEDS.length);
    expect(saved).toBeGreaterThan(0);
    expect(eventPay).toBe(saved * 4 * balance.events.survivor.reward);
  }, 240_000);

  it("same seed + no input → the same digest through all four events (events stream only, brief 8)", () => {
    const go = (): string => {
      let d = "";
      runHeadless({ balance, seed: 5, players: 2, god: true, setup: (w) => void (w.debug.events = parseDevEvents(FORCED)), onEnd: (w) => void (d = JSON.stringify(snapshotWorld(w))) });
      return d;
    };
    const a = go();
    expect(a.length).toBeGreaterThan(100);
    expect(go()).toBe(a);
  }, 240_000);
});
