import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { assistAim } from "../combat/aimAssist";
import { rebuildGrid } from "../core/spatialGrid";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { NEUTRAL_INPUT } from "../net/input";
import { gearBit } from "../economy/gear";
import { flashlightOf } from "../player/flashlight";
import { addPlayer } from "../player/player";
import { endWave, skipWave, startBuild, startWave } from "../run/runStateMachine";
import { setLoadout } from "../combat/loadout";
import { spawnZombie } from "../zombies/zombiePool";
import { COLLAPSE_STYLES, collapseStyleAt, createFogBeam, createFogRadii, fogRadiiOf, fogVisibility, isPowerOut } from "./collapse";
import { applyDecayStage } from "./applyDecayStage";
import { legalDecayMasks } from "./decayState";
import { variantBit } from "./masks.testkit";
import { RUINS_LOOKS, RUINS_LOOK_GUTTED, isEndlessWave, ruinsLookAt } from "./ruinsLook";

/**
 * Story 6.4 (Collapse, stage 5) and the shared look picks of 6.2: every fairness rule is a test.
 * F1 power out, F2 blackout waves 9–10 (6.3's one writer), F3 the fog edge and beams, F4 aim assist
 * never into the fog, F5 (no setting changes the rule: the rule has no quality input at all).
 */
const balance = loadBalance();
const DT = DOWNTOWN_MAP;
const F = balance.decay.collapse.fog;
const QUIET = { waves: () => {}, zombies: () => {} };

/** A World at `stage` in `phase` (build: after startBuild; wave: after startWave). */
function at(stage: number, phase: "build" | "wave" | "lobby" = "wave", mask = 0): World {
  const w = createWorld({ balance, seed: 2, map: DT, systems: QUIET });
  w.debug.decayStageByWave = Array(10).fill(stage);
  w.decay.variants = mask;
  addPlayer(w, "p0", 24, 16);
  if (phase !== "lobby") startBuild(w);
  if (phase === "wave") startWave(w);
  applyDecayStage(w, stage, mask);
  return w;
}

describe("Story 6.4 F1: the power dies at stage 5 only", () => {
  it("isPowerOut is false at stages 1–4 and true at 5", () => {
    expect([1, 2, 3, 4, 5].map((s) => isPowerOut(at(s, "build")))).toEqual([false, false, false, false, true]);
    expect(balance.decay.stageByWave[8]).toBe(5); // the build start before wave 9 enters stage 5
  });
});

describe("Story 6.4 F3: the fog edge (9 → 10 m in waves, 13 → 14 m in builds) and beams", () => {
  const radii = createFogRadii();
  const none = [createFogBeam()];
  it("radii by phase and stage; no fog below stage 5, in the lobby or at results", () => {
    expect({ ...fogRadiiOf(at(5, "wave"), radii) }).toEqual({ clearM: 9, radiusM: 10 });
    expect({ ...fogRadiiOf(at(5, "build"), radii) }).toEqual({ clearM: 13, radiusM: 14 });
    expect(fogRadiiOf(at(4, "wave"), radii).radiusM).toBe(Infinity);
    expect(fogRadiiOf(at(5, "lobby"), radii).radiusM).toBe(Infinity);
    const r = at(5, "wave");
    r.run.phase = "results";
    expect(fogRadiiOf(r, radii).radiusM).toBe(Infinity);
  });

  it("the visibility table: 8.9 m → 1, 9.5 m → 0.5, 10.1 m → 0; build 13.5 m → 0.5; no fog → 1 anywhere", () => {
    const wave = { clearM: F.waveClearM, radiusM: F.waveRadiusM };
    expect(fogVisibility(wave, 0, 0, 8.9, 0, none, 0)).toBe(1);
    expect(fogVisibility(wave, 0, 0, 9.5, 0, none, 0)).toBeCloseTo(0.5, 9);
    expect(fogVisibility(wave, 0, 0, 10.1, 0, none, 0)).toBe(0);
    expect(fogVisibility({ clearM: F.buildClearM, radiusM: F.buildRadiusM }, 0, 0, 0, 13.5, none, 0)).toBeCloseTo(0.5, 9);
    expect(fogVisibility({ clearM: Infinity, radiusM: Infinity }, 0, 0, 500, 0, none, 0)).toBe(1);
    // It fades, it never pops: monotone from 9 to 10 m in 1 cm steps.
    let last = 1;
    for (let d = 9; d <= 10.001; d += 0.01) {
      const v = fogVisibility(wave, 0, 0, d, 0, none, 0);
      expect(v).toBeLessThanOrEqual(last + 1e-12);
      expect(last - v).toBeLessThan(0.011);
      last = v;
    }
  });

  it("beams: 11 m in a Tactical beam → 1; 11 m in a teammate's beam → 1; 13 m in an 8 m beam → 0", () => {
    const wave = { clearM: F.waveClearM, radiusM: F.waveRadiusM };
    const tactical = flashlightOf(balance, gearBit(balance, "tactical_flashlight"));
    const free = flashlightOf(balance, 0);
    expect([tactical.rangeM, free.rangeM]).toEqual([12, 8]);
    const mine = { ...createFogBeam(), x: 0, y: 0, facingX: 1, facingY: 0, cone: tactical };
    expect(fogVisibility(wave, 0, 0, 11, 0, [mine], 1)).toBe(1);
    expect(fogVisibility(wave, 0, 0, 0, 11, [mine], 1)).toBe(0); // outside the cone
    // A teammate 5 m north looking east with the free 8 m beam lights a zombie 11 m east of me, 5 m north.
    const mate = { ...createFogBeam(), x: 0, y: -5, facingX: 1, facingY: 0, cone: free };
    expect(fogVisibility(wave, 0, 0, 6, -5, [mine, mate], 2)).toBe(1); // 7.8 m from me: clear anyway
    expect(fogVisibility(wave, 0, 0, 7.5, -7, [{ ...mine, cone: null }, mate], 2)).toBe(1); // 10.26 m from me (hidden), 7.76 m inside the mate's beam
    expect(fogVisibility(wave, 0, 0, 7.5, -7, [{ ...mine, cone: null }], 1)).toBe(0); // without the mate's beam: hidden
    expect(fogVisibility(wave, 0, 0, 13, 0, [{ ...mine, cone: free }], 1)).toBe(0);
    expect(fogVisibility(wave, 0, 0, 11, 0, [mine], 0)).toBe(0); // only the first beamCount beams count
  });
});

describe("Story 6.4 F4: touch aim assist never snaps to a zombie your fog hides", () => {
  const O = { x: 12, y: 16 };
  const DEG = Math.PI / 180;
  function setup(stage: number, gear = 0, dist = 11.5) {
    const w = createWorld({ balance, seed: 1, systems: QUIET });
    w.debug.decayStageByWave = Array(10).fill(stage);
    const p = addPlayer(w, "p0", O.x, O.y);
    p.gear = gear;
    startBuild(w);
    startWave(w);
    applyDecayStage(w, stage, 0);
    const id = spawnZombie(w, "walker", O.x + Math.cos(4 * DEG) * dist, O.y + Math.sin(4 * DEG) * dist);
    rebuildGrid(w.zombieGrid, w.zombies.aliveIds, w.zombies.aliveCount, w.zombies.x, w.zombies.y);
    return { w, p, id };
  }
  const assist = (w: World, shooter: { x: number; y: number; gear: number } | null) => assistAim(w, O.x + 0.5, O.y, 1, 0, 17, { x: 0, y: 0 }, null, shooter);

  it("a zombie 11.5 m away at stage 5 is not assisted without a beam reaching it; inside the shooter's Tactical beam it is; stage 4 unchanged", () => {
    const hidden = setup(5);
    expect(assist(hidden.w, hidden.p)).toBe(-1);
    expect(assist(hidden.w, null)).toBe(hidden.id); // no shooter given: the old rule (dev / tests)
    const tactical = setup(5, gearBit(balance, "tactical_flashlight"));
    expect(assist(tactical.w, tactical.p)).toBe(tactical.id);
    const ruins = setup(4);
    expect(assist(ruins.w, ruins.p)).toBe(ruins.id);
    const near = setup(5, 0, 8.5); // inside the clear 9 m: assisted
    expect(assist(near.w, near.p)).toBe(near.id);
  });

  it("through the full step: a touch Hunting Rifle shot at stage 5 keeps its raw aim toward the hidden zombie; at stage 4 it bends to it", () => {
    const shotAngle = (stage: number) => {
      const { w, p } = setup(stage);
      setLoadout(balance, p.loadout, ["hunting_rifle", "pistol"]);
      p.hp = 1e9;
      const shots: SimEvent[] = [];
      w.events.subscribe((e) => e.type === "weapon.fired" && shots.push(e));
      setInput(w, "p0", { ...NEUTRAL_INPUT, aimX: 1, aimY: 0, fire: true, isMouse: false });
      step(w, TICK_DT_S);
      const s = shots[0];
      return s?.type === "weapon.fired" ? Math.atan2(s.dirY, s.dirX) / DEG : NaN;
    };
    expect(Math.abs(shotAngle(5))).toBeLessThan(0.5); // spread only, no 4° bend
    expect(shotAngle(4)).toBeGreaterThan(3);
  });
});

describe("Story 6.4 F2: waves 9 and 10 are fought in the dark (6.3's refreshBlackout, the only writer)", () => {
  it("a run through waves 8 → 9 → 10: blackoutPct 0 → (build 9: half) → 10 → (build 10: half) → 5; nothing at stages 1–4", () => {
    const w = createWorld({ balance, seed: 4, map: DT, systems: QUIET });
    w.debug.godMode = true;
    addPlayer(w, "p0", 24, 16);
    startBuild(w);
    const seen: string[] = [];
    for (let wave = 1; wave <= 10; wave++) {
      seen.push(`b${wave}:${w.lights.blackoutPct}${w.lights.halfDark ? "h" : ""}:s${w.decay.stage}`);
      startWave(w);
      seen.push(`w${wave}:${w.lights.blackoutPct}${w.lights.halfDark ? "h" : ""}`);
      skipWave(w);
      if (wave === 10 && w.run.phase === "wave") endWave(w);
    }
    expect(seen.slice(14)).toEqual(["b8:0:s4", "w8:0", "b9:10h:s5", "w9:10", "b10:5h:s5", "w10:5"]);
    expect(seen.slice(0, 14).every((s) => /:0(:s\d)?$/.test(s))).toBe(true); // waves 1–7: lit
  });
});

describe("Story 6.4 D7 / 6.2 D6: the run's weather style and Ruins material", () => {
  const MASK = legalDecayMasks(DT);
  it("collapseStyleAt: -1 below stage 5; the run's pick in waves ≤ 10; endless rotates one step per wave in order", () => {
    for (const [k, style] of COLLAPSE_STYLES.entries()) {
      const bit = variantBit(DT, `collapse_${style}`);
      const mask = MASK.find((m) => (m >>> bit) & 1) as number;
      const w = at(5, "wave", mask);
      expect(collapseStyleAt(w)).toBe(k);
      w.waves.number = 10; // review L2: wave 10 is the last of the run, not endless
      expect(collapseStyleAt(w)).toBe(k);
      w.waves.number = 11;
      expect(collapseStyleAt(w)).toBe((k + 1) % 4);
      w.waves.number = 14;
      expect(collapseStyleAt(w)).toBe((k + 4) % 4);
      expect(collapseStyleAt(at(4, "wave", mask))).toBe(-1);
    }
  });

  it("ruinsLookAt: the material bit → RU1–RU3; wave ≥ 11 → RU4 fire-gutted", () => {
    for (const [k, look] of RUINS_LOOKS.slice(0, 3).entries()) {
      const mask = MASK.find((m) => (m >>> variantBit(DT, `ruins_look_${look}`)) & 1) as number;
      const w = at(4, "wave", mask);
      expect(ruinsLookAt(w)).toBe(k);
      w.waves.number = 10; // review L2: still the run's pick at wave 10 (RU4 only from wave 11)
      expect(ruinsLookAt(w)).toBe(k);
      expect(isEndlessWave(w, 10)).toBe(false);
      expect(isEndlessWave(w, 11)).toBe(true);
      w.waves.number = 11;
      expect(ruinsLookAt(w)).toBe(RUINS_LOOK_GUTTED);
    }
  });
});
