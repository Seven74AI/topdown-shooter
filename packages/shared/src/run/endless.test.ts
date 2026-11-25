import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance } from "../config/balance";
import type { SystemFn } from "../core/systems";
import { createWorld } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { refreshBlackout } from "../decay/lightState";
import { applyStartWave, parseStartWave } from "./devStartWave";
import { isEndlessEventWave, pickEndlessEvent, scheduleEndlessEvent } from "./endlessEvents";
import { endRun, skipWave, startBuild, startWave } from "./runStateMachine";

/** Story 6.12: the light rule (F5, D3, D6/D8), the event waves (F6, D4) and the dev start-wave switch (AC 13). */
const noop: SystemFn = () => {};
const balance = loadBalance();
const EL = balance.decay.blackout.endlessLightPct;

function endlessAt(wave: number, b = balance) {
  const world = createWorld({ balance: b, seed: 4, map: DOWNTOWN_MAP, systems: { waves: noop } });
  addPlayer(world, "p0", 24, 16);
  applyStartWave(world, wave);
  return world;
}

describe("Story 6.12 F5: odd endless waves pitch black, even waves half dark", () => {
  it("waves 11–20: odd → 5 % full strength, even → 5 % at half strength; waves 1–10 untouched", () => {
    for (let n = 11; n <= 20; n++) {
      const w = endlessAt(n);
      startBuild(w);
      startWave(w);
      expect(w.lights.blackoutPct, `wave ${n}`).toBe(EL);
      expect(w.lights.halfDark, `wave ${n}`).toBe(n % 2 === 0);
    }
    const w10 = createWorld({ balance, seed: 4, map: DOWNTOWN_MAP, systems: { waves: noop } });
    addPlayer(w10, "p0", 24, 16);
    applyStartWave(w10, 10);
    w10.run.endless = true;
    startBuild(w10);
    startWave(w10);
    expect(w10.lights.blackoutPct).toBe(balance.decay.blackout.lightPctByWave[9]); // the table's wave 10 (6.4 fills it)
  });

  it("D6/D8: a power failure in an even endless wave → powerFailureLightPct (20 %) at full strength; odd waves stay 5 %", () => {
    const even = endlessAt(12);
    startBuild(even);
    startWave(even);
    even.lights.powerFailure = true;
    refreshBlackout(even);
    expect(even.lights.blackoutPct).toBe(balance.decay.blackout.powerFailureLightPct);
    expect(even.lights.halfDark).toBe(false);
    const odd = endlessAt(13);
    startBuild(odd);
    startWave(odd);
    odd.lights.powerFailure = true;
    refreshBlackout(odd);
    expect(odd.lights.blackoutPct).toBe(EL);
  });

  it("endless build phases are half dark when 6.4's halfDarkInBuild is on; Results lit", () => {
    const files = bundledBalanceFiles();
    (files.decay as { blackout: { halfDarkInBuild: boolean } }).blackout.halfDarkInBuild = true;
    const b = loadBalance(files);
    const w = endlessAt(11, b);
    startBuild(w);
    expect(w.lights.blackoutPct).toBe(EL);
    expect(w.lights.halfDark).toBe(true);
    startWave(w);
    endRun(w);
    expect(w.lights.blackoutPct).toBe(0);
  });

  it("Story 6.11: the vote keeps the cleared wave's light (a refresh during the vote doesn't light it)", () => {
    const w = createWorld({ balance, seed: 4, map: DOWNTOWN_MAP });
    w.debug.bossWaves = [];
    addPlayer(w, "p0", 24, 16);
    applyStartWave(w, 15);
    startBuild(w);
    startWave(w);
    w.debug.bossWaves = [];
    const before = w.lights.blackoutPct;
    expect(before).toBe(EL);
    // wave 15 is a boss wave in endless: end it by hand through the dev skip (the boss is not spawned yet)
    skipWave(w);
    expect(w.run.phase).toBe("vote");
    refreshBlackout(w);
    expect(w.lights.blackoutPct).toBe(before);
  });
});

describe("Story 6.12 F6: one event on even non-Behemoth endless waves, never the same twice in a row (D4)", () => {
  it("event waves: 12, 14, 16, 18, 22, 24, 26, 28; not 20 or 30; none in waves ≤ 10 or without endless", () => {
    const list = Array.from({ length: 30 }, (_, i) => i + 1).filter((n) => isEndlessEventWave(balance, n, true));
    expect(list).toEqual([12, 14, 16, 18, 22, 24, 26, 28]);
    expect(Array.from({ length: 30 }, (_, i) => i + 1).filter((n) => isEndlessEventWave(balance, n, false))).toEqual([]);
  });

  it("pickEndlessEvent never returns the previous one; one candidate → no draw; none → \"\"; same seed → same picks", () => {
    const ids = ["car_alarm", "stampede", "gas_leak", "supply_drop", "power_failure", "survivor"];
    const picks = (seed: number) => {
      const w = createWorld({ balance, seed });
      let prev = "";
      const out: string[] = [];
      for (let i = 0; i < 200; i++) {
        const id = pickEndlessEvent(w, ids, prev);
        expect(id).not.toBe(prev);
        expect(ids).toContain(id);
        out.push(id);
        prev = id;
      }
      return out;
    };
    const a = picks(1);
    expect(new Set(a).size).toBe(ids.length); // every event comes up
    expect(picks(1)).toEqual(a);
    const w = createWorld({ balance, seed: 2 });
    const state = JSON.stringify(snapshotWorld(w).streams);
    expect(pickEndlessEvent(w, ["stampede", "car_alarm"], "car_alarm")).toBe("stampede");
    expect(JSON.stringify(snapshotWorld(w).streams)).toBe(state); // no draw for a forced pick
    expect(pickEndlessEvent(w, ["car_alarm"], "car_alarm")).toBe("");
    expect(pickEndlessEvent(w, [], "")).toBe("");
  });

  it("the build-start hook picks an event the 6.8 framework can run (eventFits) in an even endless wave, and never in waves 1–10", () => {
    const w = endlessAt(12);
    startBuild(w);
    expect(["car_alarm", "stampede"]).toContain(w.run.endlessEvent);
    const r = createWorld({ balance, seed: 4 });
    addPlayer(r, "p0", 24, 16);
    startBuild(r);
    expect(r.run.endlessEvent).toBe("");
  });
});

describe("Story 6.12 AC 13: the start-wave dev switch reaches endless", () => {
  it("?startwave=11 … 99 is accepted and starts the run in endless; ≤ 10 is a normal run", () => {
    expect(parseStartWave("25", balance)).toBe(25);
    expect(parseStartWave("100", balance)).toBe(null);
    expect(endlessAt(11).run.endless).toBe(true);
    expect(endlessAt(10).run.endless).toBe(false);
    const w = endlessAt(11);
    startBuild(w);
    startWave(w);
    expect(w.waves.number).toBe(11);
    expect(w.waves.size).toBe(Math.round(440 * (balance.waves.playerCountScale[0] as number)));
  });
});

describe("Story 6.12 re-review N1: endless events follow the dev boss override", () => {
  it("with ?bosswave=12 the endless event skips 12 (a Behemoth there) and lands on 20 (no Behemoth there)", () => {
    expect(isEndlessEventWave(balance, 12, true, [12])).toBe(false);
    expect(isEndlessEventWave(balance, 20, true, [12])).toBe(true);
    expect(isEndlessEventWave(balance, 20, true, [])).toBe(true);
    expect(isEndlessEventWave(balance, 20, true, null)).toBe(false);
  });
});

describe("Story 6.12 re-review 2 (N4): scheduleEndlessEvent honours world.debug.bossWaves", () => {
  it("with ?bosswave=12: nothing is scheduled before wave 12 (a Behemoth there), wave 20 gets one; without the override wave 20 gets none (a Behemoth)", () => {
    const fake = (): readonly string[] => ["stampede", "car_alarm"];
    const w = endlessAt(12); // the build before wave 12
    w.debug.bossWaves = [12];
    expect(scheduleEndlessEvent(w, fake)).toBe("");
    w.waves.number = 19; // the build before wave 20
    expect(["stampede", "car_alarm"]).toContain(scheduleEndlessEvent(w, fake));
    w.debug.bossWaves = null;
    w.run.lastEndlessEvent = "";
    expect(scheduleEndlessEvent(w, fake)).toBe("");
  });
});
