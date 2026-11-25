import { describe, expect, it } from "vitest";
import { createWorld } from "../core/world";
import { darknessAlpha, isBlackout } from "../decay/lightState";
import { DOWNTOWN_MAP } from "../map/downtown";
import { snapshotWorld } from "../core/worldSnapshot";
import { EVENT_KINDS, EVENT_PHASE } from "./eventState";
import { powerFailureWave } from "./powerFailure";
import { endlessEventCandidates } from "../run/endlessEvents";
import { balance, eventWorld, ofType, startNext, tickN } from "./testEvents";

/** Story 6.10 (P1–P3, AC 1–2): the power failure. */
const noZombies = { zombies: () => {} };
const FLICKER = Math.round(balance.events.powerFailure.flickerS * 20);
const PCT = balance.decay.blackout.powerFailureLightPct;

function failing(wave = 6) {
  const t = eventWorld({ wave, systems: noZombies });
  startNext(t.world, "power_failure");
  tickN(t.world, 1);
  expect(t.world.special.active.kind).toBe(EVENT_KINDS.indexOf("power_failure"));
  return t;
}

describe("Story 6.10 P1: the lights warn you (2 s of flicker, then dark)", () => {
  it("banner event at the start, FLICKER for 40 ticks with no darkness, then DARK at the moonlit 20 %", () => {
    const { world, events } = failing();
    expect(ofType(events, "event.triggered")[0]).toMatchObject({ kind: "power_failure", phase: EVENT_PHASE.FLICKER });
    const start = world.special.active.startTick;
    for (let i = 0; i < FLICKER - 1; i++) {
      tickN(world, 1);
      expect(world.lights.blackoutPct).toBe(0);
      expect(isBlackout(world)).toBe(false);
    }
    tickN(world, 1);
    expect(world.tick - 1 - start).toBe(FLICKER);
    expect(world.special.active.phase).toBe(EVENT_PHASE.DARK);
    expect(world.lights.blackoutPct).toBe(PCT);
    expect(isBlackout(world)).toBe(true);
    expect(world.special.log.powerFailures).toBe(1);
  });
});

describe("Story 6.10 P2: same darkness for everyone, until the wave ends", () => {
  it("a mirror World given the synced blackoutPct mid-wave draws the same darkness alpha; the wave's end lights the build phase again", () => {
    const { world, events } = failing();
    tickN(world, FLICKER + 5);
    const mirror = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP });
    mirror.run.phase = "wave";
    mirror.lights.blackoutPct = world.lights.blackoutPct; // what the room state carries (6.3)
    mirror.lights.halfDark = world.lights.halfDark;
    expect(darknessAlpha(mirror)).toBeCloseTo(darknessAlpha(world), 9);
    expect(darknessAlpha(world)).toBeCloseTo(1 - PCT / 100, 9);
    world.run.phase = "build";
    tickN(world, 1);
    expect(ofType(events, "event.ended")[0]).toMatchObject({ kind: "power_failure", outcome: "wave_end" });
    expect(world.lights.powerFailure).toBe(false);
    expect(world.lights.blackoutPct).toBe(0);
  });

  it("the power-failure flag is in the replay snapshot (brief 26)", () => {
    const { world } = failing();
    tickN(world, FLICKER + 1);
    expect(JSON.stringify(snapshotWorld(world))).toContain('"powerFailure":true');
  });
});

describe("Story 6.10 P3: only in waves 6–8, never in a wave that is already a full blackout", () => {
  it("fits waves 6, 7 and 8; never 3, 4, 9, 10", () => {
    const { world } = eventWorld({});
    for (const w of [6, 7, 8]) expect(powerFailureWave(world, w)).toBe(balance.decay.blackout.lightPctByWave[w - 1]! <= 0);
    for (const w of [3, 4, 9, 10]) expect(powerFailureWave(world, w)).toBe(false);
    expect([6, 7, 8].some((w) => powerFailureWave(world, w))).toBe(true);
  });

  it("6.10 D7 / 6.12 D6: even endless waves qualify (odd ones are pitch black: never); not without endless; it then goes 20 % moonlit (6.12 D8)", () => {
    const { world } = eventWorld({ wave: 12, systems: noZombies });
    expect(powerFailureWave(world, 12)).toBe(false); // not endless
    world.run.endless = true;
    expect(powerFailureWave(world, 12)).toBe(true);
    expect(powerFailureWave(world, 13)).toBe(false);
    expect(endlessEventCandidates(world, 12)).toContain("power_failure");
    startNext(world, "power_failure");
    tickN(world, FLICKER + 2);
    expect(world.special.active.phase).toBe(EVENT_PHASE.DARK);
    expect(world.lights.blackoutPct).toBe(PCT);
    expect(world.lights.halfDark).toBe(false);
  });
});
