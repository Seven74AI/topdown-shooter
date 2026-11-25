import { describe, expect, it } from "vitest";
import { loadBalance, bundledBalanceFiles } from "../config/balance";
import { createWorld, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { stageForWave } from "../decay/decayState";
import { addPlayer } from "../player/player";
import { EVENT_KINDS } from "./eventState";
import { eventFits, scheduleRunEvents } from "./schedule";
import { applyStartWave } from "../run/devStartWave";
import { endlessEventCandidates } from "../run/endlessEvents";
import { skipWave, startBuild, startWave } from "../run/runStateMachine";
import { TICK_DT_S } from "../config/constants";
import { step } from "../core/world";
import type { SimEvent } from "../core/simEvents";
import { alarmCandidates } from "./carAlarm";

const balance = loadBalance();
const noPathing = { buildings: () => {} };
const ALLOWED_PAIRS = new Set(["3+6", "3+7", "3+8", "4+6", "4+7", "4+8", "6+8"]);

function world(seed: number, players: number, b = balance): World {
  const w = createWorld({ balance: b, seed, map: DOWNTOWN_MAP, systems: noPathing });
  for (let i = 0; i < players; i++) addPlayer(w, `p${i}`, 22 + i, 16);
  return w;
}

describe("Story 6.8 F2: the run's schedule", () => {
  it("10,000 seeds × 1 and 4 players: exactly 2 different events, in an allowed pair of waves, each fitting its wave's stage", () => {
    const seen = new Set<string>();
    for (const players of [1, 4]) {
      for (let seed = 1; seed <= 10_000; seed++) {
        const w = world(seed, players);
        scheduleRunEvents(w);
        const s = w.special;
        expect(s.count).toBe(2);
        const [a, b] = [s.schedule[0]!, s.schedule[1]!];
        expect(a.kind).not.toBe(b.kind);
        expect(a.wave).toBeLessThan(b.wave);
        expect(ALLOWED_PAIRS.has(`${a.wave}+${b.wave}`)).toBe(true);
        for (const e of [a, b]) {
          expect(e.wave).not.toBe(5);
          expect(e.startFraction).toBeGreaterThanOrEqual(0.2);
          expect(e.startFraction).toBeLessThanOrEqual(0.6);
          expect(eventFits(w, e.kind, e.wave)).toBe(true);
          seen.add(`${EVENT_KINDS[e.kind]}@${e.wave}`);
        }
      }
    }
    // Both kinds of this story land in every allowed wave over the seeds (liveness of the draw).
    for (const k of ["car_alarm", "stampede"]) for (const wv of [3, 4, 6, 7, 8]) expect(seen.has(`${k}@${wv}`)).toBe(true);
  });

  it("same seed → same schedule; the draw uses the events stream only", () => {
    const a = world(42, 2);
    const b = world(42, 2);
    const before = JSON.stringify({ d: a.streams.decay.getState(), s: a.streams.spawns.getState(), c: a.streams.combat.getState() });
    scheduleRunEvents(a);
    scheduleRunEvents(b);
    expect(a.special.schedule.slice(0, 2)).toEqual(b.special.schedule.slice(0, 2));
    expect(JSON.stringify({ d: a.streams.decay.getState(), s: a.streams.spawns.getState(), c: a.streams.combat.getState() })).toBe(before);
  });

  it("a 6-wave run uses waves {3, 4, 6} only (pairs 3+6, 4+6)", () => {
    const files = bundledBalanceFiles();
    (files.waves as { runWaves: number }).runWaves = 6;
    const b6 = loadBalance(files);
    for (let seed = 1; seed <= 500; seed++) {
      const w = world(seed, 2, b6);
      scheduleRunEvents(w);
      const s = w.special;
      expect(s.count).toBe(2);
      expect(["3+6", "4+6"]).toContain(`${s.schedule[0]!.wave}+${s.schedule[1]!.wave}`);
    }
  });

  it("F9 gates: the car alarm has a candidate at waves 3–8 on Downtown for every variant mask the seeds give; never a moved, removed or burning car", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const w = world(seed, 1);
      for (let wave = 3; wave <= 8; wave++) {
        const stage = stageForWave(balance, wave);
        const cars = alarmCandidates(DOWNTOWN_MAP, stage, w.decay.variants);
        expect(cars.length).toBeGreaterThan(0);
        for (const c of cars) {
          expect(c.kind).toBe("car");
          // a decay add (in the road) is never a candidate; nor an ignite target at that stage
          expect(DOWNTOWN_MAP.cover.includes(c)).toBe(true);
          for (const m of DOWNTOWN_MAP.decay) {
            if (m.target !== c.name || m.stage > stage) continue;
            if (m.variant >= 0 && (w.decay.variants & (1 << m.variant)) === 0) continue;
            expect(m.action === "remove" || m.action === "ignite").toBe(false);
          }
        }
      }
    }
  });

  it("the dev override replaces the draw (any wave, startFractionMin) and draws nothing", () => {
    const w = world(9, 1);
    w.debug.events = [
      { kind: "stampede", wave: 1 },
      { kind: "car_alarm", wave: 2 },
      { kind: "nope", wave: 3 },
    ];
    const st = w.streams.events.getState();
    scheduleRunEvents(w);
    expect(w.special.count).toBe(2);
    expect(w.special.schedule.slice(0, 2)).toEqual([
      { kind: EVENT_KINDS.indexOf("stampede"), wave: 1, startFraction: 0.2 },
      { kind: EVENT_KINDS.indexOf("car_alarm"), wave: 2, startFraction: 0.2 },
    ]);
    expect(w.streams.events.getState()).toEqual(st);
  });

  it("6.12's endless candidates are the kinds whose gate passes (eventFits), in EVENT_KINDS order", () => {
    const w = world(5, 2);
    for (let wave = 12; wave <= 40; wave += 2) {
      const ids = endlessEventCandidates(w, wave);
      const want = EVENT_KINDS.filter((_, k) => eventFits(w, k, wave));
      expect([...ids]).toEqual(want);
      expect(ids).toContain("car_alarm");
      expect(ids).toContain("stampede");
    }
  });
});

describe("Story 6.8 × 6.12: an even endless wave starts its event through 6.12's scheduler", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: the build before wave 12 picks a kind (startBuild → scheduleEndlessEvent → armEndlessEvent); wave 12 triggers it; wave 14's never repeats it`, () => {
      const w = createWorld({ balance, seed, map: DOWNTOWN_MAP });
      const p = addPlayer(w, "p0", 24, 16);
      const events: SimEvent[] = [];
      w.events.subscribe((e) => events.push(e));
      applyStartWave(w, 12);
      startBuild(w);
      const seen: string[] = [];
      for (const wave of [12, 14]) {
        expect(w.run.phase).toBe("build");
        expect(w.waves.number + 1).toBe(wave);
        const id = w.run.endlessEvent;
        expect(["car_alarm", "stampede"]).toContain(id);
        expect(w.special.extra).toMatchObject({ kind: EVENT_KINDS.indexOf(id as (typeof EVENT_KINDS)[number]), wave });
        expect(w.special.extraDone).toBe(false);
        startWave(w);
        events.length = 0;
        for (let i = 0; i < 20 * 120 && !events.some((e) => e.type === "event.triggered"); i++) {
          p.hp = p.maxHp; // the test is about the trigger, not survival
          step(w, TICK_DT_S);
        }
        expect(events.find((e) => e.type === "event.triggered"), `wave ${wave}: ${id} triggered`).toMatchObject({ type: "event.triggered", kind: id, wave });
        seen.push(id);
        // on to the build before the next even wave (the odd wave between gets none)
        skipWave(w);
        expect(w.run.endlessEvent).toBe("");
        startWave(w);
        skipWave(w);
      }
      expect(seen[0]).not.toBe(seen[1]); // 6.12 D4: never the same twice in a row
    });
  }
});
