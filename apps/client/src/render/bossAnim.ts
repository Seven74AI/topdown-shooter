import { BOSS_ATTACK, BOSS_STATE } from "@topdown/shared";

/**
 * Story 9.15 (AC 6, 7; B5): the Behemoth's action plan (`docs/art/photoreal-4/src/boss4.ts › PLAN` + `RULES`, designer
 * "ok" 2026-11-26) as one clock: the breath (body scale), the heartbeat, the vein + split glow level, the eye level and
 * colour, the roar's calm → enraged crossfade and the death glow. Pure view state (never the simulation), no
 * allocation per frame; action durations come from the balance (`boss.json`, passed in `BossAnimTimes`), every visual
 * number from `BOSS_ANIM` below (not the balance JSON: these never touch play, and a balance change would move
 * `balance.version`).
 *
 * Rules (the plan's): R1 tells first (during a warning glow and eyes only build toward the hit), R2 one clock (the breath
 * rides the steps; enraged, the beat lands on every 3rd footfall), R3 release together (hit / crash / throw / roar peak
 * in the same ~0.15 s), R4 weak = dim (stun: glow off, eyes 30 %; death puts them out first), R5 secondary follows
 * (dust after its cause: `bossDust.ts`).
 */
export const BOSS_ANIM = {
  breath: {
    /** Walk: the body dips this much at each footfall (over the first `dipFrac` of the step), rising through the rest. */
    walkDip: 0.01,
    dipFrac: 0.16,
    /** Standing (no step for `standS`): a slow idle breath. */
    standS: 0.4,
    idlePeriodS: 2.6,
    idleAmp: 0.008,
    /** Stunned: slow, heavy, dazed breaths. */
    stunPeriodS: 1.6,
    stunAmp: 0.02,
    /** Roar: the big inhale over the first `roarInhaleS`, held after. */
    roarInhaleS: 0.3,
    roarInhale: 0.03,
    /** After the slam hit (and the throw, which swells this much with the lift): the breath let out over the recovery. */
    exhale: 0.03,
  },
  beat: {
    /** Standing still the enraged heart keeps this clock (s); walking, the beat lands on every `everySteps` footfall. */
    periodS: 1.2,
    everySteps: 3,
    /** The beat's envelope: up in `attackS`, down with a `decayS` time constant. */
    attackS: 0.06,
    decayS: 0.18,
    /** A racing heart through a slam / charge warning: beats at these shares of the warning (0, 0.55, 0.9, 1.1 s of 1.2 s). */
    racing: [0, 0.55 / 1.2, 0.9 / 1.2, 1.1 / 1.2] as readonly number[],
  },
  glow: {
    /** Enraged, between beats. */
    floor: 0.25,
    /** Through a slam / charge warning the floor builds from `warnFrom` to `warnTo` (the plan's moments 0.4 → 0.8). */
    warnFrom: 0.4,
    warnTo: 0.8,
    /** The rush: steady adrenaline. */
    rush: 0.6,
    /** Every release peaks this long (s): the slam hit, the throw's release, the crash. */
    releaseS: 0.15,
    /** Death: a last weak beat (peak, length), out by `deathOutS`. */
    deathPeak: 0.5,
    deathBeatS: 0.15,
    deathOutS: 0.4,
  },
  eyes: {
    /** Enraged eyes never drop below this (`EYE_FLOOR`: never dimmer than the calm ones). */
    enragedFloor: 0.75,
    calm: 1,
    stun: 0.3,
    /** The roar: the eyes snap red at this time (s). */
    roarSnapS: 0.3,
    /** The slam hit: the eyes flash this much bigger for `glow.releaseS`. */
    flashScale: 1.35,
  },
  roar: {
    /** The veins light and the skin crossfades calm → enraged from this time (s) to the roar's end (`enrage.roarS`). */
    fromS: 0.3,
  },
} as const;

/** The action durations the plan follows (from `world.balance.boss`). */
export interface BossAnimTimes {
  readonly slamRecoverS: number;
  readonly roarS: number;
}

/** What the view knows this frame (one object the view refills: no allocation). */
export interface BossAnimInput {
  state: number;
  attackKind: number;
  /** Telegraph progress 0–1 (slam, charge, throw). */
  progress: number;
  enraged: boolean;
  /** Walk step index (floor of distance / step length) and the step's phase 0–1. */
  step: number;
  stepPhase: number;
  /** The throw's chunk has left the hands. */
  released: boolean;
  /** The slam has just landed (`boss.slammed`), the crash happened (`boss.crashed`): edge flags of this frame. */
  slammed: boolean;
  crashed: boolean;
}

/** The plan's output for the frame. */
export interface BossAnimOut {
  /** Body scale (breath). */
  breath: number;
  /** Vein + split glow 0–1 (enraged frames only). */
  glow: number;
  /** Eye layer 0–1, colour (enraged = red) and scale. */
  eyes: number;
  eyesRed: boolean;
  eyeScale: number;
  /** Roar: the enraged body frame's weight over the calm one (1 = enraged). */
  enragedMix: number;
  /** Death: the last beat on the dead_a glow (0–1). */
  deathGlow: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The beat's envelope `t` s after it (0 before; 1 at `attackS`). */
export function beatEnvelope(t: number): number {
  const B = BOSS_ANIM.beat;
  if (t < 0) return 0;
  if (t < B.attackS) return t / B.attackS;
  return Math.exp(-(t - B.attackS) / B.decayS);
}

/** The walk's footfall dip: 1 − `walkDip` × a fast dip then a slow rise through the step (phase 0–1). */
export function stepBreath(phase: number): number {
  const b = BOSS_ANIM.breath;
  const d = phase < b.dipFrac ? phase / b.dipFrac : 1 - (phase - b.dipFrac) / (1 - b.dipFrac);
  return 1 - b.walkDip * d;
}

/** The plan, one per Behemoth view (state kept between frames; `reset` on a new Behemoth). */
export class BossAnim {
  readonly out: BossAnimOut = { breath: 1, glow: 0, eyes: 1, eyesRed: false, eyeScale: 1, enragedMix: 0, deathGlow: 0 };
  /** Seconds since the last beat (large: none yet). */
  private beatAgeS = 99;
  private stepsSinceBeat = 0;
  private lastStep = Number.NaN;
  /** Seconds since the last footfall. */
  private sinceStepS = 99;
  private lastState = -1;
  /** Seconds in the current state (view clock). */
  private stateS = 0;
  private lastProgress = -1;
  private wasReleased = false;
  /** Seconds since the last release peak (slam hit, crash, throw release). */
  private releaseAgeS = 99;
  private clockS = 0;
  /** It was enraged when it died (the last weak beat). */
  private diedEnraged = false;
  private wasEnraged = false;

  constructor(private readonly times: BossAnimTimes) {}

  /** Seconds in the current state (view clock; the roar and death dust key on it). */
  get stateTime(): number {
    return this.stateS;
  }

  reset(): void {
    this.beatAgeS = 99;
    this.stepsSinceBeat = 0;
    this.lastStep = Number.NaN;
    this.sinceStepS = 99;
    this.lastState = -1;
    this.stateS = 0;
    this.lastProgress = -1;
    this.wasReleased = false;
    this.releaseAgeS = 99;
    this.diedEnraged = false;
    this.wasEnraged = false;
  }

  private beat(): void {
    this.beatAgeS = 0;
    this.stepsSinceBeat = 0;
  }

  update(dtS: number, i: BossAnimInput): BossAnimOut {
    const A = BOSS_ANIM;
    const o = this.out;
    this.clockS += dtS;
    if (i.state !== this.lastState) {
      if (i.state === BOSS_STATE.DEAD) this.diedEnraged = this.wasEnraged || i.enraged;
      this.lastState = i.state;
      this.stateS = 0;
      this.lastProgress = -1;
    } else this.stateS += dtS;
    this.wasEnraged = i.enraged;
    this.beatAgeS += dtS;
    this.sinceStepS += dtS;
    this.releaseAgeS += dtS;
    const telegraph = i.state === BOSS_STATE.TELEGRAPH;
    const racing = telegraph && (i.attackKind === BOSS_ATTACK.SLAM || i.attackKind === BOSS_ATTACK.CHARGE);
    // the heart (R2: one clock with the steps; R1: races through a warning; R3: peaks on a release)
    if (i.state === BOSS_STATE.WALK && i.step !== this.lastStep) {
      if (!Number.isNaN(this.lastStep)) {
        this.sinceStepS = 0;
        this.stepsSinceBeat++;
        if (this.stepsSinceBeat >= A.beat.everySteps) this.beat();
      }
      this.lastStep = i.step;
    }
    if (racing) {
      for (const f of A.beat.racing) if (this.lastProgress < f && i.progress >= f) this.beat();
      this.lastProgress = i.progress;
    } else if (this.sinceStepS > A.beat.periodS && this.beatAgeS >= A.beat.periodS) this.beat(); // standing: the clock
    if (i.slammed || i.crashed || (i.released && !this.wasReleased)) {
      this.releaseAgeS = 0;
      this.beat();
    }
    this.wasReleased = i.released;
    const env = beatEnvelope(this.beatAgeS);
    const release = this.releaseAgeS < A.glow.releaseS;
    // breath
    const B = A.breath;
    let breath = 1;
    if (i.state === BOSS_STATE.WALK) breath = this.sinceStepS < B.standS ? stepBreath(i.stepPhase) : 1 + B.idleAmp * Math.sin((this.clockS / B.idlePeriodS) * Math.PI * 2);
    else if (telegraph && i.attackKind === BOSS_ATTACK.THROW) breath = 1 + B.exhale * clamp01(i.progress); // swells with the lift
    else if (i.state === BOSS_STATE.RECOVER) breath = 1 + B.exhale * (1 - clamp01(this.stateS / this.times.slamRecoverS));
    else if (i.state === BOSS_STATE.STUN) breath = 1 + B.stunAmp * Math.sin((this.stateS / B.stunPeriodS) * Math.PI * 2);
    else if (i.state === BOSS_STATE.ROAR) breath = 1 + B.roarInhale * clamp01(this.stateS / B.roarInhaleS);
    // slam / charge warning, rush: breath held (1); dead: none
    o.breath = breath;
    // glow, eyes
    const G = A.glow;
    const E = A.eyes;
    o.enragedMix = i.enraged ? 1 : 0;
    o.eyesRed = i.enraged;
    o.eyeScale = 1;
    o.deathGlow = 0;
    if (i.state === BOSS_STATE.DEAD) {
      o.glow = 0;
      o.eyes = 0;
      o.enragedMix = 0;
      const t = this.stateS;
      // R4: the heart stops first — a last weak beat (up over `deathBeatS`), out by `deathOutS`
      if (this.diedEnraged) o.deathGlow = G.deathPeak * (t < G.deathBeatS ? t / G.deathBeatS : clamp01(1 - (t - G.deathBeatS) / (G.deathOutS - G.deathBeatS)));
      return o;
    }
    if (i.state === BOSS_STATE.ROAR) {
      const k = clamp01((this.stateS - A.roar.fromS) / Math.max(1e-6, this.times.roarS - A.roar.fromS));
      o.enragedMix = i.enraged ? 1 : k;
      o.glow = i.enraged ? 1 : k;
      o.eyes = 1;
      o.eyesRed = i.enraged || this.stateS >= E.roarSnapS;
      return o;
    }
    if (i.state === BOSS_STATE.STUN) {
      o.glow = 0;
      o.eyes = E.stun;
      return o;
    }
    if (!i.enraged) {
      o.glow = 0;
      o.eyes = E.calm;
      if (release && (i.state === BOSS_STATE.RECOVER || i.slammed)) o.eyeScale = E.flashScale; // R3: the hit
      return o;
    }
    let floor: number = G.floor;
    let eyes = lerp(E.enragedFloor, 1, env);
    if (racing) {
      floor = lerp(G.warnFrom, G.warnTo, clamp01(i.progress));
      eyes = Math.max(eyes, i.attackKind === BOSS_ATTACK.CHARGE ? 1 : lerp(E.enragedFloor, 1, clamp01(i.progress)));
    } else if (telegraph || i.state === BOSS_STATE.RUSH) eyes = 1; // throw lift, the rush: locked on
    o.glow = i.state === BOSS_STATE.RUSH ? Math.max(G.rush, floor + (1 - floor) * env * 0.5) : floor + (1 - floor) * env;
    if (release) {
      o.glow = 1;
      eyes = 1;
      if (i.state === BOSS_STATE.RECOVER || i.slammed) o.eyeScale = E.flashScale;
    }
    o.eyes = eyes;
    return o;
  }
}
