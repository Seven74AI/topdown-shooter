import { BOSS_ATTACK, BOSS_STATE } from "@topdown/shared";

/**
 * Story 9.15 (AC 6, 7; B5): the Behemoth's action plan in the game, one clock for the breath (body scale), the
 * heartbeat, the vein + split glow level, the eye level and colour, the roar's calm → enraged crossfade and the death's
 * last beat. The spec is the approved page's action player (`docs/art/photoreal-4/src/boss4.ts › planAt`, the designer's
 * "ok" to the action plan, 2026-11-26): its numbers are `BOSS_ANIM` below, its times are shares of the game's own
 * durations (balance `boss.json`, through `BossAnimTimes` and the telegraph progress). Pure view state, never the
 * simulation; no allocation per frame. Visual numbers live here, not in the balance JSON (they never touch play, and a
 * balance change would move `balance.version`).
 *
 * The page draws the vein glow as a travelling strip (4 steps of 0.15 s after a beat); the game pulses the whole layer
 * (B4): ember + (1 − ember) × the beat's fall over the same 0.6 s.
 */
export const BOSS_ANIM = {
  breath: {
    /** Walk: a dip of `walkDip` at each footfall, back over `dipS`, and a small rise of `walkRise` riding the step. */
    walkDip: 0.01,
    dipS: 0.12,
    walkRise: 0.004,
    /** Standing (no step for a step + `standS`): a slow idle breath. */
    standS: 0.4,
    idlePeriodS: 2.6,
    idleAmp: 0.004,
    /** The slam's exhale (from this much over 1, over `slam.recoverS`). */
    slamExhale: 0.01,
    /** The throw swells this much with the lift and lets it out over `throwExhaleS`. */
    throwSwell: 0.012,
    throwExhaleS: 0.4,
    /** Stunned: slow, heavy, dazed breaths. */
    stunAmp: 0.006,
    stunPeriodS: 1.0,
    /** The roar: an inhale of `roarInhale` over the first `roarInhaleS`, held after. */
    roarInhale: 0.02,
    roarInhaleS: 0.3,
  },
  beat: {
    /** Enraged, standing still: the heart's clock (s); walking, the beat lands on every `everySteps` footfall. */
    periodS: 1.2,
    everySteps: 3,
    /** After a beat: the eyes fall back to their floor over `eyeFallS`, the veins over `veinFallS` (4 steps × 0.15 s). */
    eyeFallS: 0.25,
    veinFallS: 0.6,
    /** The racing heart through a warning, as shares of it: slam 0 / 0.55 / 0.9 / 1.1 s of 1.2 s; charge 0 / 0.4 / 0.7 / 0.9 s of 1 s. */
    slamRacing: [0, 0.55 / 1.2, 0.9 / 1.2, 1.1 / 1.2] as readonly number[],
    chargeRacing: [0, 0.4, 0.7, 0.9] as readonly number[],
  },
  glow: {
    /** Enraged, between beats (the ember). */
    ember: 0.25,
    /** The rush: steady adrenaline. */
    rush: 0.6,
    /** The slam hit: everything lit for this long (s). */
    flashS: 0.15,
    /** The roar: the slow wave adds up to this over the ember as the rage comes in. */
    roarWave: 0.6,
    /** Death: the last weak beat starts at `deathPeak` and is out by `deathOutS`. */
    deathPeak: 0.4,
    deathOutS: 0.4,
  },
  eyes: {
    /** Enraged eyes never drop below this (`EYE_FLOOR`: never dimmer than the calm ones). */
    enragedFloor: 0.75,
    calm: 1,
    stun: 0.3,
    /** The roar: the eyes snap red at this time (s); the rage comes in from then to the roar's end. */
    roarSnapS: 0.3,
  },
} as const;

/** The action durations the plan follows (from `world.balance.boss` and the walk speeds). */
export interface BossAnimTimes {
  readonly slamRecoverS: number;
  readonly roarS: number;
  /** Seconds per walk step, calm and enraged (step length / speed). */
  readonly stepS: number;
  readonly stepEnragedS: number;
}

/** What the view knows this frame (one object the view refills: no allocation). */
export interface BossAnimInput {
  state: number;
  attackKind: number;
  /** Telegraph progress 0–1 (slam, charge; the throw's lift). */
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
  /** Vein + split glow 0–1 (enraged pictures only). */
  glow: number;
  /** Eye layer 0–1 and colour (enraged = red). */
  eyes: number;
  eyesRed: boolean;
  /** Eye sprite scale (1: the page has no eye flash). */
  eyeScale: number;
  /** The enraged picture's weight over the calm one (the roar crossfades; 1 = enraged). */
  enragedMix: number;
  /** Death: the last weak beat on the dead_a glow (0–1). */
  deathGlow: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The walk's breath `sinceStepS` after a footfall of a `stepS` step (the page's dip and rise). */
export function stepBreath(sinceStepS: number, stepS: number): number {
  const b = BOSS_ANIM.breath;
  return 1 - b.walkDip * Math.max(0, 1 - sinceStepS / b.dipS) + b.walkRise * Math.sin((Math.min(sinceStepS, stepS) / stepS) * Math.PI);
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
  /** Seconds since the slam hit (the flash, the exhale) and since the throw's release (its exhale). */
  private hitAgeS = 99;
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
    this.hitAgeS = 99;
    this.releaseAgeS = 99;
    this.diedEnraged = false;
    this.wasEnraged = false;
  }

  /** The breath let out after the slam hit and the throw's release. */
  private exhale(): number {
    const B = BOSS_ANIM.breath;
    let s = 1;
    if (this.hitAgeS < this.times.slamRecoverS) s = 1 + B.slamExhale * (1 - this.hitAgeS / this.times.slamRecoverS);
    if (this.releaseAgeS < B.throwExhaleS) s = Math.max(s, 1 + B.throwSwell * (1 - this.releaseAgeS / B.throwExhaleS));
    return s;
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
    this.hitAgeS += dtS;
    this.releaseAgeS += dtS;
    const telegraph = i.state === BOSS_STATE.TELEGRAPH;
    const racing = telegraph && i.attackKind === BOSS_ATTACK.SLAM ? A.beat.slamRacing : telegraph && i.attackKind === BOSS_ATTACK.CHARGE ? A.beat.chargeRacing : null;
    // the heart: on every 3rd footfall walking, racing through a warning, on the hit and the throw's release, the clock
    // standing (not in the rush or the stun: adrenaline, then helpless)
    if (i.state === BOSS_STATE.WALK && i.step !== this.lastStep) {
      if (!Number.isNaN(this.lastStep)) {
        this.sinceStepS = 0;
        this.stepsSinceBeat++;
        if (this.stepsSinceBeat >= A.beat.everySteps) this.beat();
      }
      this.lastStep = i.step;
    }
    if (racing) {
      for (const f of racing) if (this.lastProgress < f && i.progress >= f) this.beat();
      this.lastProgress = i.progress;
    } else if (this.sinceStepS > A.beat.periodS && this.beatAgeS >= A.beat.periodS && i.state !== BOSS_STATE.RUSH && i.state !== BOSS_STATE.STUN) this.beat();
    if (i.slammed) {
      this.hitAgeS = 0;
      this.beat();
    }
    if (i.released && !this.wasReleased) {
      this.releaseAgeS = 0;
      this.beat();
    }
    this.wasReleased = i.released;
    const eyeBeat = Math.max(0, 1 - this.beatAgeS / A.beat.eyeFallS);
    const veinBeat = Math.max(0, 1 - this.beatAgeS / A.beat.veinFallS);
    // breath
    const B = A.breath;
    const stepS = i.enraged ? this.times.stepEnragedS : this.times.stepS;
    let breath = 1;
    if (i.state === BOSS_STATE.WALK) {
      breath = this.sinceStepS < stepS + B.standS ? stepBreath(this.sinceStepS, stepS) : 1 + B.idleAmp * Math.sin((this.clockS / B.idlePeriodS) * Math.PI * 2);
      breath = Math.max(breath, this.exhale());
    } else if (telegraph && i.attackKind === BOSS_ATTACK.THROW) breath = 1 + B.throwSwell * clamp01(i.progress);
    else if (i.state === BOSS_STATE.RECOVER) breath = this.exhale();
    else if (i.state === BOSS_STATE.STUN) breath = 1 + B.stunAmp * Math.sin((this.stateS / B.stunPeriodS) * Math.PI * 2);
    else if (i.state === BOSS_STATE.ROAR) breath = 1 + B.roarInhale * clamp01(this.stateS / B.roarInhaleS);
    // slam / charge warning, rush: breath held (1); dead: none
    o.breath = breath;
    const G = A.glow;
    const E = A.eyes;
    o.eyeScale = 1;
    o.deathGlow = 0;
    o.enragedMix = i.enraged ? 1 : 0;
    o.eyesRed = i.enraged;
    if (i.state === BOSS_STATE.DEAD) {
      // R4: the eyes go out at once; the heart's last weak beat is out by `deathOutS`
      o.glow = 0;
      o.eyes = 0;
      o.enragedMix = 0;
      if (this.diedEnraged) o.deathGlow = G.deathPeak * clamp01(1 - this.stateS / G.deathOutS);
      return o;
    }
    if (i.state === BOSS_STATE.ROAR) {
      const rage = i.enraged ? 1 : clamp01((this.stateS - E.roarSnapS) / Math.max(1e-6, this.times.roarS - E.roarSnapS));
      o.enragedMix = rage;
      o.glow = rage * (G.ember + G.roarWave);
      o.eyes = 1;
      o.eyesRed = i.enraged || this.stateS >= E.roarSnapS;
      return o;
    }
    if (i.state === BOSS_STATE.STUN) {
      o.glow = 0; // helpless: the glow goes out
      o.eyes = E.stun;
      return o;
    }
    // the eyes: calm steady; enraged on the beat over their floor; locked on through the charge, the rush and the lift;
    // the slam warning builds them 75 → 100 % and they hold 100 % through the flash
    let eyes: number = i.enraged ? E.enragedFloor + (1 - E.enragedFloor) * eyeBeat : E.calm;
    if (telegraph && i.attackKind === BOSS_ATTACK.SLAM) eyes = Math.max(i.enraged ? eyes : 0, E.enragedFloor + (1 - E.enragedFloor) * clamp01(i.progress)); // calm too (the page)
    else if (telegraph || i.state === BOSS_STATE.RUSH) eyes = 1;
    const flash = this.hitAgeS < G.flashS;
    if (flash) eyes = 1;
    o.eyes = eyes;
    if (!i.enraged) {
      o.glow = 0;
      return o;
    }
    o.glow = i.state === BOSS_STATE.RUSH ? G.rush : flash ? 1 : G.ember + (1 - G.ember) * veinBeat;
    return o;
  }
}
