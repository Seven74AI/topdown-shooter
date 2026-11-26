import { MAX_PLAYERS, TICK_RATE_HZ } from "@topdown/shared";
import { heliPose, type HeliPose } from "./heliPose";

/**
 * Story 12.3: the extraction's camera director. Pure (no Phaser), preallocated (no allocation per frame).
 *
 * From the run's timeline (server ticks: the extraction's start, the last boarding, the timeout cut, the lift-off)
 * and the drawn positions (the walking survivors, the pad, the helicopter) it returns the camera centre and zoom,
 * the letterbox height, a full-screen fade, the fog lift, the dawn line and whether the HUD shows. `GameScene`
 * applies it in place of the player-follow camera while it is active. Every timing is a function of the server
 * tick (`nowTick`, fractional), so every phone shows the same shot at the same moment and a phone that wakes late
 * jumps straight to the right one; the frame clock only smooths the camera toward its framing (and a gap snaps it).
 *
 * The shots are data (`EXTRACT_SHOTS`), not code branches, so a trailer tool can drive the same director later.
 *
 *   start ─ walk (bars 8 %, frame walkers + pad) ─ last aboard (bars 12 %) ─ beat ─ lift-off ─ fly-out (follow the
 *   helicopter, zoom out to 0.6×, fog lifts, dawn line sweeps west) ─ white ─ Results (held white behind the card)
 *
 *   A timeout cut: black fade timed to land on the cut tick (start + walkTimeoutS), a short hold, fade back in.
 */
export const EXTRACT_SHOTS = {
  walk: {
    /** Letterbox height (fraction of the screen, top and bottom each) and its ease-in (s). */
    bars: 0.08,
    barsInS: 0.6,
    /** Framing: every walker + the pad, this margin (m) round the bounding box. */
    marginM: 3,
    /** Zoom (× the normal 24 m view): never past 1 (the sprites are drawn for it), never below the fly-out's. */
    minZoom: 0.6,
    maxZoom: 1,
    /** The camera eases toward its framing with this time constant (s); a frame gap over `snapGapS` snaps. */
    followTauS: 0.35,
    snapGapS: 0.25,
  },
  aboard: { bars: 0.12, barsInS: 0.5 },
  cut: { outS: 0.3, holdS: 0.4, inS: 0.3, rgb: 0x000000 },
  fly: {
    zoom: 0.6,
    zoomS: 3,
    /** From the walk's last framing to the helicopter (s). */
    liftBlendS: 0.6,
    /** The fog of war lifts over this (s) from the lift-off. */
    fogLiftS: 1.5,
    /** The dawn line sweeps from the east edge across the whole map in this (s); its light eases in over `dawnInS`. */
    dawnSweepS: 6,
    dawnInS: 0.8,
    /** The white fade (s), full when the helicopter reaches the map's east edge (`heliEdge`), or when the camera's
     *  unclamped view would first pass a map edge (`viewEdge`: the strict reading); never later than the fly-out's end. */
    whiteS: 0.8,
    whiteAt: "heliEdge" as "heliEdge" | "viewEdge",
    rgb: 0xffffff,
  },
};
export type ExtractShots = typeof EXTRACT_SHOTS;

export type DirectorPhase = "off" | "walk" | "aboard" | "fly" | "done";

/** What the scene fills each frame (one reused record). Ticks are server ticks; −1 = not yet. */
export interface DirectorInputs {
  /** The extraction began this run (also true on Results after it). */
  extracting: boolean;
  /** The server tick now (fractional: `host.serverTick`). */
  nowTick: number;
  startTick: number;
  liftedAtTick: number;
  /** The walk timed out (`run.extract_cut`). */
  cut: boolean;
  /** Everyone is aboard (no walker left). */
  allAboard: boolean;
  /** The frame's length (s): only smooths the camera. */
  dtS: number;
  /** Balance: `evac.walkTimeoutS`, `liftBeatS`, `flyOutS`. */
  walkTimeoutS: number;
  liftBeatS: number;
  flyOutS: number;
  /** The map (m), the pad centre, the fly-out's east run (`flyOutDxM`). */
  mapW: number;
  mapH: number;
  padX: number;
  padY: number;
  flyDxM: number;
  /** The helicopter as drawn this frame (m). */
  heliX: number;
  heliY: number;
  /** The screen (px) and the normal pixels per metre (`pixelsPerMeter`). */
  screenW: number;
  screenH: number;
  ppm: number;
  /** The walkers (not aboard) as drawn: the first `walkers` entries. */
  walkers: number;
  readonly walkerX: Float64Array;
  readonly walkerY: Float64Array;
}

export interface DirectorOutput {
  active: boolean;
  phase: DirectorPhase;
  /** Camera centre (m), clamped so the view never leaves the map. */
  centreX: number;
  centreY: number;
  /** × the normal view (1 = the 24 m view); the camera's zoom is `ppm × zoom`. */
  zoom: number;
  /** Letterbox bar height, top and bottom each (fraction of the screen height). */
  bars: number;
  fadeRgb: number;
  fadeAlpha: number;
  hudShown: boolean;
  /** 0 → 1: the fog of war lifts. */
  fogLift: number;
  /** The dawn line's world x (m; light east of it) and its strength (0 = none). */
  dawnX: number;
  dawnAlpha: number;
  /** Seconds since the extraction began / since the lift-off (−1 = not yet). */
  walkS: number;
  /** Seconds since everyone is aboard (−1 = not yet): the crew climbs back. */
  aboardS: number;
  flyS: number;
  /** When the white is full (s after the lift-off). */
  whiteEndS: number;
}

export function createDirectorInputs(): DirectorInputs {
  return {
    extracting: false,
    nowTick: 0,
    startTick: -1,
    liftedAtTick: -1,
    cut: false,
    allAboard: false,
    dtS: 0,
    walkTimeoutS: 8,
    liftBeatS: 0.5,
    flyOutS: 8,
    mapW: 48,
    mapH: 32,
    padX: 24,
    padY: 16,
    flyDxM: 30,
    heliX: 24,
    heliY: 16,
    screenW: 844,
    screenH: 390,
    ppm: 35,
    walkers: 0,
    walkerX: new Float64Array(MAX_PLAYERS),
    walkerY: new Float64Array(MAX_PLAYERS),
  };
}

/** Smoothstep 0 → 1 over [0, 1] (clamped). */
export function ease(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The view's centre clamped like the Phaser camera bounds (a view wider than the map is centred on it). */
export function clampCentre(c: number, half: number, size: number): number {
  return size > 2 * half ? clamp(c, half, size - half) : size / 2;
}

/** Step for the edge search (s). */
const EDGE_STEP_S = 1 / 60;
/** The dawn line starts this far east of the map edge (m): its soft edge enters from off screen. */
export const DAWN_EDGE_M = 6;

export class CameraDirector {
  readonly out: DirectorOutput = {
    active: false,
    phase: "off",
    centreX: 0,
    centreY: 0,
    zoom: 1,
    bars: 0,
    fadeRgb: 0,
    fadeAlpha: 0,
    hudShown: true,
    fogLift: 0,
    dawnX: Number.NaN,
    dawnAlpha: 0,
    walkS: -1,
    aboardS: -1,
    flyS: -1,
    whiteEndS: 0,
  };
  /** The smoothed camera (m, × zoom); `have` = false snaps on the next frame. */
  private camX = 0;
  private camY = 0;
  private camZoom = 1;
  private have = false;
  /** The server tick everyone was first seen aboard (−1 = not yet). */
  private aboardTick = -1;
  private seenStart = -1;
  /** The white's end, cached per lift-off and screen. */
  private readonly whiteKey = new Float64Array(10);
  private whiteKeyOk = false;
  private whiteEnd = 0;
  /** The camera's offset from the fly-out's framing at the lift-off (blended out over `liftBlendS`); NaN = not yet. */
  private liftDx = 0;
  private liftDy = 0;
  private liftDz = Number.NaN;
  private readonly pose: HeliPose = { phase: "gone", dx: 0, dy: 0, scale: 1, alpha: 0 };

  constructor(private readonly shots: ExtractShots = EXTRACT_SHOTS) {}

  /** A new run (or the scene restarted). */
  reset(): void {
    this.have = false;
    this.aboardTick = -1;
    this.seenStart = -1;
    this.whiteKeyOk = false;
    this.liftDz = Number.NaN;
    const o = this.out;
    o.active = false;
    o.phase = "off";
    o.bars = 0;
    o.fadeAlpha = 0;
    o.hudShown = true;
    o.fogLift = 0;
    o.dawnX = Number.NaN;
    o.dawnAlpha = 0;
    o.walkS = -1;
    o.aboardS = -1;
    o.flyS = -1;
  }

  /** The tick everyone boarded: the lift-off minus the beat (server truth), else the cut, else when first seen. */
  private aboardAt(inp: DirectorInputs): number {
    if (inp.liftedAtTick >= 0) return this.aboardTick >= 0 ? Math.min(this.aboardTick, inp.liftedAtTick) : inp.liftedAtTick - inp.liftBeatS * TICK_RATE_HZ;
    if (this.aboardTick >= 0) return this.aboardTick;
    if (inp.cut) return this.cutTick(inp);
    return -1;
  }

  private cutTick(inp: DirectorInputs): number {
    return inp.startTick + Math.round(inp.walkTimeoutS * TICK_RATE_HZ);
  }

  update(inp: DirectorInputs): DirectorOutput {
    const o = this.out;
    const s = this.shots;
    if (!inp.extracting || inp.startTick < 0) {
      if (o.active) this.reset();
      return o;
    }
    if (inp.startTick !== this.seenStart) {
      this.reset(); // a new extraction (an endless run extracts again later)
      this.seenStart = inp.startTick;
    }
    o.active = true;
    o.hudShown = false;
    const now = inp.nowTick;
    const walkS = Math.max(0, (now - inp.startTick) / TICK_RATE_HZ);
    o.walkS = walkS;
    if (inp.allAboard && this.aboardTick < 0) this.aboardTick = inp.liftedAtTick >= 0 ? inp.liftedAtTick - inp.liftBeatS * TICK_RATE_HZ : inp.cut ? this.cutTick(inp) : now;
    const aboard = this.aboardAt(inp);
    const aboardS = aboard >= 0 ? Math.max(0, (now - aboard) / TICK_RATE_HZ) : -1;
    o.aboardS = aboardS;
    const flyS = inp.liftedAtTick >= 0 ? (now - inp.liftedAtTick) / TICK_RATE_HZ : -1;
    o.flyS = flyS >= 0 ? flyS : -1;

    // Bars: thin over the walk, full from the last boarding.
    const thin = s.walk.bars * ease(walkS / s.walk.barsInS);
    o.bars = aboardS >= 0 ? thin + (s.aboard.bars - thin) * ease(aboardS / s.aboard.barsInS) : thin;

    // Black: timed to be full on the cut tick (the server boards everyone left at once), hold, fade back in.
    o.fadeRgb = s.cut.rgb;
    o.fadeAlpha = this.blackAt(inp, walkS, aboard);

    // Framing target.
    const vw1 = inp.screenW / inp.ppm; // the normal view (m)
    const vh1 = inp.screenH / inp.ppm;
    let tx: number;
    let ty: number;
    let tz: number;
    if (flyS >= 0) {
      o.phase = flyS >= inp.flyOutS ? "done" : "fly";
      tx = inp.heliX;
      ty = inp.heliY;
      tz = s.walk.maxZoom + (s.fly.zoom - s.walk.maxZoom) * ease(flyS / s.fly.zoomS);
    } else {
      o.phase = aboardS >= 0 ? "aboard" : "walk";
      let x0 = inp.padX;
      let x1 = inp.padX;
      let y0 = inp.padY;
      let y1 = inp.padY;
      for (let i = 0; i < inp.walkers; i++) {
        const x = inp.walkerX[i] as number;
        const y = inp.walkerY[i] as number;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      const m = s.walk.marginM;
      tx = (x0 + x1) / 2;
      ty = (y0 + y1) / 2;
      tz = clamp(Math.min(vw1 / (x1 - x0 + 2 * m), vh1 / (y1 - y0 + 2 * m)), s.walk.minZoom, s.walk.maxZoom);
    }

    // The walk eases toward its framing (frame clock only); the first frame or a gap snaps (a woken phone is at the
    // right shot at once). The fly-out is exact (a pure function of the time since the lift-off), blended over
    // `liftBlendS` from wherever the walk left the camera (a late phone: no offset).
    if (!this.have || inp.dtS > s.walk.snapGapS) {
      this.camX = tx;
      this.camY = ty;
      this.camZoom = tz;
      this.have = true;
      if (flyS >= 0 && Number.isNaN(this.liftDz)) this.liftDx = this.liftDy = this.liftDz = 0;
    } else if (flyS >= 0) {
      if (Number.isNaN(this.liftDz)) {
        this.liftDx = this.camX - tx;
        this.liftDy = this.camY - ty;
        this.liftDz = this.camZoom - tz;
      }
      const keep = 1 - ease(flyS / s.fly.liftBlendS);
      this.camX = tx + this.liftDx * keep;
      this.camY = ty + this.liftDy * keep;
      this.camZoom = tz + this.liftDz * keep;
    } else {
      const k = 1 - Math.exp(-Math.max(0, inp.dtS) / s.walk.followTauS);
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
      this.camZoom += (tz - this.camZoom) * k;
    }
    const z = clamp(this.camZoom, s.fly.zoom < s.walk.minZoom ? s.fly.zoom : s.walk.minZoom, s.walk.maxZoom);
    o.zoom = z;
    o.centreX = clampCentre(this.camX, vw1 / z / 2, inp.mapW);
    o.centreY = clampCentre(this.camY, vh1 / z / 2, inp.mapH);

    // Fly-out: fog, dawn, white.
    o.fogLift = flyS >= 0 ? ease(flyS / s.fly.fogLiftS) : 0;
    if (flyS >= 0) {
      o.dawnX = inp.mapW + DAWN_EDGE_M - (inp.mapW + 2 * DAWN_EDGE_M) * Math.min(1, flyS / s.fly.dawnSweepS);
      o.dawnAlpha = ease(flyS / s.fly.dawnInS);
      const end = this.whiteEndFor(inp);
      o.whiteEndS = end;
      const w = ease((flyS - (end - s.fly.whiteS)) / s.fly.whiteS);
      if (w > 0) {
        o.fadeRgb = s.fly.rgb;
        o.fadeAlpha = w;
      }
    } else {
      o.dawnX = Number.NaN;
      o.dawnAlpha = 0;
    }
    return o;
  }

  /** The black fade's alpha `walkS` into the walk (0 unless a cut is due or happened). */
  private blackAt(inp: DirectorInputs, walkS: number, aboard: number): number {
    const c = this.shots.cut;
    const cutS = inp.walkTimeoutS;
    if (inp.cut) {
      if (walkS < cutS) return this.leadIn(walkS, cutS);
      return 1 - ease((walkS - cutS - c.holdS) / c.inS);
    }
    if (aboard >= 0) {
      // Everyone boarded inside the fade's lead-in (no cut): back to the picture from where it was.
      const at = (aboard - inp.startTick) / TICK_RATE_HZ;
      const a0 = this.leadIn(at, cutS);
      return a0 > 0 ? a0 * (1 - ease((walkS - at) / c.inS)) : 0;
    }
    return this.leadIn(walkS, cutS);
  }

  /** The black's lead-in: full exactly on the cut (s into the walk). */
  private leadIn(t: number, cutS: number): number {
    const outS = this.shots.cut.outS;
    return ease((t - (cutS - outS)) / outS);
  }

  /**
   * When the white is full (s after the lift-off): the first moment the helicopter is past the map's east edge
   * (`heliEdge`), or the camera's unclamped view would leave the map (`viewEdge`); at most the fly-out's length.
   * Searched once per lift-off and screen (cached), not per frame.
   */
  private whiteEndFor(inp: DirectorInputs): number {
    const s = this.shots;
    const k = this.whiteKey;
    if (this.whiteKeyOk && k[0] === inp.liftedAtTick && k[1] === inp.screenW && k[2] === inp.screenH && k[3] === inp.ppm && k[4] === inp.mapW && k[5] === inp.mapH && k[6] === inp.padX && k[7] === inp.padY && k[8] === inp.flyDxM && k[9] === inp.flyOutS) return this.whiteEnd;
    k[0] = inp.liftedAtTick;
    k[1] = inp.screenW;
    k[2] = inp.screenH;
    k[3] = inp.ppm;
    k[4] = inp.mapW;
    k[5] = inp.mapH;
    k[6] = inp.padX;
    k[7] = inp.padY;
    k[8] = inp.flyDxM;
    k[9] = inp.flyOutS;
    this.whiteKeyOk = true;
    const vw1 = inp.screenW / inp.ppm;
    const vh1 = inp.screenH / inp.ppm;
    let end = inp.flyOutS;
    for (let t = 0; t <= inp.flyOutS; t += EDGE_STEP_S) {
      const p = heliPose(t, 0, 0, true, this.pose, inp.flyOutS, inp.flyDxM);
      const x = inp.padX + p.dx;
      const y = inp.padY + p.dy;
      let past: boolean;
      if (s.fly.whiteAt === "heliEdge") past = x >= inp.mapW || y <= 0;
      else {
        const z = s.walk.maxZoom + (s.fly.zoom - s.walk.maxZoom) * ease(t / s.fly.zoomS);
        const hw = vw1 / z / 2;
        const hh = vh1 / z / 2;
        past = x + hw > inp.mapW || x - hw < 0 || y - hh < 0 || y + hh > inp.mapH;
      }
      if (past) {
        end = t;
        break;
      }
    }
    this.whiteEnd = Math.max(s.fly.whiteS, Math.min(inp.flyOutS, end));
    return this.whiteEnd;
  }
}
