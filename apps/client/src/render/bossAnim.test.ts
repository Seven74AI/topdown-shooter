/**
 * Story 9.15 (AC 6, 7; T5): the action plan's clock (`bossAnim.ts`) at the plan's composed moments
 * (`docs/art/photoreal-4/src/boss4.ts › PLAN`), the heartbeat on every 3rd footfall, the dust pool, and the warning
 * pose helpers.
 */
import { describe, expect, it } from "vitest";
import { BOSS_ATTACK, BOSS_STATE } from "@topdown/shared";
import { BOSS_ANIM, BossAnim, stepBreath, type BossAnimInput } from "./bossAnim";
import { BOSS_DUST, BossDust, dustHash } from "./bossDust";
import { throwLiftProgress, warningPoseIndex } from "./bossTelegraph";

const DT = 1 / 60;
const times = { slamRecoverS: 0.8, roarS: 1.5, stepS: 0.5, stepEnragedS: 0.65 / (1.3 * 1.3) };
const input = (): BossAnimInput => ({ state: BOSS_STATE.WALK, attackKind: BOSS_ATTACK.NONE, progress: 0, enraged: false, step: 0, stepPhase: 0, released: false, slammed: false, crashed: false });

/** Runs `a` for `s` seconds with `set(i, t)` filling the input each frame; returns the last output's copy. */
function play(a: BossAnim, i: BossAnimInput, s: number, set?: (i: BossAnimInput, t: number) => void): { glow: number; eyes: number; breath: number; red: boolean; mix: number; death: number } {
  let t = 0;
  const n = Math.round(s / DT);
  for (let k = 0; k < n; k++) {
    t += DT;
    set?.(i, t);
    a.update(DT, i);
    i.slammed = false;
    i.crashed = false;
  }
  const o = a.out;
  return { glow: o.glow, eyes: o.eyes, breath: o.breath, red: o.eyesRed, mix: o.enragedMix, death: o.deathGlow };
}

describe("Story 9.15: the action plan", () => {
  it("walk: the breath dips 1 % on each footfall (back over 0.12 s) and rises a little through the step (planAt)", () => {
    expect(stepBreath(0, 0.5)).toBeCloseTo(1 - BOSS_ANIM.breath.walkDip, 6);
    expect(stepBreath(0.12, 0.5)).toBeGreaterThan(1);
    expect(stepBreath(0.25, 0.5)).toBeCloseTo(1 + BOSS_ANIM.breath.walkRise, 6);
  });

  it("walk, enraged: the beat lands on every 3rd footfall (≈ 1.15 s at the enraged pace), eyes 75 % → 100 %", () => {
    const a = new BossAnim(times);
    const i = input();
    i.enraged = true;
    const stepS = 0.65 / (1.3 * 1.3); // 0.38 s a step
    const beats: number[] = [];
    let prevGlow = 0;
    let rising = false;
    let t = 0;
    let minEyes = 1;
    for (let k = 0; k < Math.round(6 / DT); k++) {
      t += DT;
      i.step = Math.floor(t / stepS);
      i.stepPhase = t / stepS - i.step;
      a.update(DT, i);
      if (t > 0.5) minEyes = Math.min(minEyes, a.out.eyes);
      if (a.out.glow > prevGlow + 0.05 && !rising) {
        beats.push(t);
        rising = true;
      } else if (a.out.glow < prevGlow) rising = false;
      prevGlow = a.out.glow;
    }
    expect(beats.length).toBeGreaterThanOrEqual(4);
    for (let k = 1; k < beats.length; k++) expect((beats[k] as number) - (beats[k - 1] as number)).toBeCloseTo(3 * stepS, 1);
    expect(minEyes).toBeGreaterThanOrEqual(BOSS_ANIM.eyes.enragedFloor - 1e-6); // never dimmer than calm eyes
  });

  it("standing still, enraged: the heart keeps its 1.2 s clock; between beats the glow is the floor", () => {
    const a = new BossAnim(times);
    const i = input();
    i.enraged = true;
    const o = play(a, i, 1.2 * 3 + 0.9);
    expect(o.glow).toBeCloseTo(BOSS_ANIM.glow.ember, 2);
    expect(o.eyes).toBeCloseTo(BOSS_ANIM.eyes.enragedFloor, 2);
  });

  it("calm: no glow, steady eyes at 100 %, yellow", () => {
    const o = play(new BossAnim(times), input(), 2);
    expect(o.glow).toBe(0);
    expect(o.eyes).toBe(1);
    expect(o.red).toBe(false);
  });

  it("slam: breath held and the heart racing through the warning (beats at 0, 0.55, 0.9, 1.1 s), everything peaks on the hit, then the exhale", () => {
    const a = new BossAnim(times);
    const i = input();
    i.enraged = true;
    play(a, i, 0.5);
    i.state = BOSS_STATE.TELEGRAPH;
    i.attackKind = BOSS_ATTACK.SLAM;
    const peaks: number[] = [];
    let prev = 0;
    let t0 = 0;
    for (let k = 0; k < Math.round(1.2 / DT); k++) {
      t0 += DT;
      i.progress = Math.min(1, t0 / 1.2);
      a.update(DT, i);
      expect(a.out.breath).toBe(1); // held
      if (a.out.glow > prev + 0.04 && (peaks.length === 0 || t0 - (peaks[peaks.length - 1] as number) > 0.15)) peaks.push(t0);
      prev = a.out.glow;
    }
    expect(peaks.map((p) => Math.round(p * 20) / 20)).toEqual([0, 0.55, 0.9, 1.1].map((p) => expect.closeTo(p, 1)));
    expect(a.out.eyes).toBeGreaterThan(0.95); // eyes build 75 → 100 %
    i.state = BOSS_STATE.RECOVER;
    i.slammed = true;
    a.update(DT, i);
    expect(a.out.glow).toBe(1);
    expect(a.out.eyes).toBe(1);
    expect(a.out.breath).toBeCloseTo(1 + BOSS_ANIM.breath.slamExhale, 3);
    const lit = play(a, i, 0.1);
    expect(lit.glow).toBe(1); // all lit for 0.15 s
    const o = play(a, i, 0.7);
    expect(o.breath).toBeLessThan(1.001); // exhaled
    expect(o.glow).toBeLessThan(0.6);
  });

  it("charge: eyes 100 % and the heart racing (beats at 0, 0.4, 0.7, 0.9 s), steady 60 % through the rush; the stun turns the glow off and the eyes to 30 %", () => {
    const a = new BossAnim(times);
    const i = input();
    i.enraged = true;
    i.state = BOSS_STATE.TELEGRAPH;
    i.attackKind = BOSS_ATTACK.CHARGE;
    const beats: number[] = [];
    let prev = 0;
    play(a, i, 1, (x, t) => {
      x.progress = t;
      if (a.out.glow > prev + 0.04) beats.push(Math.round(t * 10) / 10);
      prev = a.out.glow;
    });
    expect(beats).toEqual([0, 0.4, 0.7, 0.9].map((b) => expect.closeTo(b, 1)));
    expect(a.out.eyes).toBe(1);
    i.state = BOSS_STATE.RUSH;
    const r = play(a, i, 0.5);
    expect(r.glow).toBeGreaterThanOrEqual(BOSS_ANIM.glow.rush);
    expect(r.breath).toBe(1);
    i.state = BOSS_STATE.STUN;
    i.crashed = true;
    const s = play(a, i, 1);
    expect(s.glow).toBe(0);
    expect(s.eyes).toBe(BOSS_ANIM.eyes.stun);
    expect(Math.abs(s.breath - 1)).toBeLessThanOrEqual(BOSS_ANIM.breath.stunAmp);
  });

  it("throw: a beat ON the release", () => {
    const a = new BossAnim(times);
    const i = input();
    i.enraged = true;
    i.state = BOSS_STATE.TELEGRAPH;
    i.attackKind = BOSS_ATTACK.THROW;
    play(a, i, 0.6);
    i.released = true;
    a.update(DT, i);
    expect(a.out.glow).toBe(1);
  });

  it("roar: yellow eyes until 0.3 s then red; the veins and skin go calm → enraged over 0.3–1.5 s", () => {
    const a = new BossAnim(times);
    const i = input();
    i.state = BOSS_STATE.ROAR;
    const t1 = play(a, i, 0.2);
    expect(t1.red).toBe(false);
    expect(t1.mix).toBe(0);
    const t2 = play(a, i, 0.6); // 0.8 s
    expect(t2.red).toBe(true);
    expect(t2.mix).toBeGreaterThan(0.3);
    expect(t2.mix).toBeLessThan(0.6);
    const t3 = play(a, i, 0.7); // 1.5 s
    expect(t3.mix).toBeCloseTo(1, 1);
    expect(t3.glow).toBeCloseTo(BOSS_ANIM.glow.ember + BOSS_ANIM.glow.roarWave, 1);
  });

  it("death: eyes out at once, a last weak beat, the glow out by 0.4 s (only if it died enraged)", () => {
    const a = new BossAnim(times);
    const i = input();
    i.enraged = true;
    play(a, i, 0.5);
    i.state = BOSS_STATE.DEAD;
    const d1 = play(a, i, 0.15);
    expect(d1.eyes).toBe(0);
    expect(d1.death).toBeGreaterThan(0.2); // 0.4 at the death, falling
    expect(d1.death).toBeLessThanOrEqual(BOSS_ANIM.glow.deathPeak);
    const d2 = play(a, i, 0.3);
    expect(d2.death).toBe(0);
    expect(d2.breath).toBe(1);
    const calm = new BossAnim(times);
    const c = input();
    play(calm, c, 0.3);
    c.state = BOSS_STATE.DEAD;
    expect(play(calm, c, 0.1).death).toBe(0);
  });
});

describe("Story 9.15: the dust pool", () => {
  it("is deterministic, stays in its pool, and every burst dies out", () => {
    const run = (): number[] => {
      const d = new BossDust(BOSS_DUST.pool);
      d.burst(BOSS_DUST.slamFists, 10, 10);
      d.burst(BOSS_DUST.death, 10, 10);
      for (let k = 0; k < 20; k++) d.step(DT);
      return Array.from(d.x).concat(Array.from(d.y));
    };
    expect(run()).toEqual(run());
    const d = new BossDust(8);
    for (let k = 0; k < 5; k++) d.burst(BOSS_DUST.crash, 0, 0); // 80 into 8 slots
    expect(d.emitted).toBe(80);
    for (let k = 0; k < 120; k++) d.step(DT);
    expect(d.idle()).toBe(true);
    expect(dustHash(3, 1)).toBeGreaterThanOrEqual(0);
    expect(dustHash(3, 1)).toBeLessThan(1);
  });

  it("a puff grows from r to 2.6 r and fades linearly (puffsFor); a delayed one waits", () => {
    const d = new BossDust(4);
    d.emit(0, 0, 1, 0, 0.5, 1, 0.2);
    expect(d.live(0)).toBe(false); // waiting for its start
    for (let k = 0; k < Math.round(0.2 / DT) + 1; k++) d.step(DT);
    expect(d.live(0)).toBe(true);
    expect(d.size(0)).toBeCloseTo(1, 1);
    expect(d.alpha(0)).toBeCloseTo(BOSS_DUST.alpha, 1);
    for (let k = 0; k < 30; k++) d.step(DT);
    expect(d.size(0)).toBeCloseTo(2 * 0.5 * (1 + BOSS_DUST.grow * 0.5), 1);
    expect(d.alpha(0)).toBeCloseTo(BOSS_DUST.alpha * 0.5, 1);
    expect(d.x[0]).toBeCloseTo(0.5, 1); // constant speed
  });
});

describe("Story 9.15: G2 A warning poses by progress", () => {
  it("the throw's lift progress runs from the start to the release; half-way then the full pose", () => {
    expect(throwLiftProgress(100, 100, 120)).toBe(0);
    expect(throwLiftProgress(110, 100, 120)).toBe(0.5);
    expect(throwLiftProgress(130, 100, 120)).toBe(1);
    expect(throwLiftProgress(90, 100, 120)).toBe(0);
    expect(throwLiftProgress(110, 100, 100)).toBe(0);
    expect(warningPoseIndex(0.49)).toBe(0);
    expect(warningPoseIndex(0.5)).toBe(1);
  });
});
