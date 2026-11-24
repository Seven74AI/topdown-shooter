import { flashlightOf, isBlackout, lightRadiusOf, lightsOf, type FlashlightCone, type PlayerState, type World } from "@topdown/shared";

/**
 * Story 6.3 (AC 5; DD3): the light stamps the darkness layer erases this frame, as a preallocated
 * plan (no allocation per frame). Pure: unit-tested in node. The view adds candidates (survivor glows
 * and cones, lights, molotov zones, flashes), then `finish()` keeps at most `maxStamps`: the local
 * survivor's own glow and cone always (F2, F3), then the others nearest the camera centre first.
 * Candidates off the camera view are skipped.
 */
export const STAMP_DISC = 0;
export const STAMP_CONE = 1;
/** A survivor's glow (its own stamp: a flat full-strength core, review L1). */
export const STAMP_GLOW = 2;

/** Warm tint drawn on top of a cut-out (palette `*_TINT`). */
export const TINT_NONE = 0;
export const TINT_FIRE = 1;
export const TINT_FLOOD = 2;
export const TINT_BEAM = 3;
export const TINT_FLASH = 4;

/** Cut-out strengths (looks.html › makeBlackoutCard: a beam 0.95, a fire 0.95, a floodlight 1; the glow 1 since review L1). */
export const GLOW_STRENGTH = 1; // review L1: full strength (the art's 0.75 left a biting zombie half dark)
export const BEAM_STRENGTH = 0.95;
export const FIRE_STRENGTH = 0.95;
export const FLOOD_STRENGTH = 1;
export const FLASH_STRENGTH = 0.85;
export const MOLOTOV_STRENGTH = 0.9;

/** Candidates considered per frame at most (survivors × 2 + lights + zones + flashes fit easily). */
export const MAX_CANDIDATES = 256;

export type SurvivorStatus = "alive" | "downed" | "out";

export class DarknessPlan {
  /** Kept stamps this frame (after `finish`). */
  count = 0;
  readonly kind: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Cones: the facing angle (rad). */
  readonly angle: Float32Array;
  /** Disc radius / cone range (m). */
  readonly radius: Float32Array;
  /** Cones: the full angle (degrees). */
  readonly coneDeg: Float32Array;
  readonly strength: Float32Array;
  readonly tint: Uint8Array;
  /** Rain sparkles are drawn inside it (beams and floodlight pools, D7). */
  readonly sparkle: Uint8Array;
  // Candidates.
  private n = 0;
  private readonly cKind = new Uint8Array(MAX_CANDIDATES);
  private readonly cX = new Float32Array(MAX_CANDIDATES);
  private readonly cY = new Float32Array(MAX_CANDIDATES);
  private readonly cAngle = new Float32Array(MAX_CANDIDATES);
  private readonly cRadius = new Float32Array(MAX_CANDIDATES);
  private readonly cCone = new Float32Array(MAX_CANDIDATES);
  private readonly cStrength = new Float32Array(MAX_CANDIDATES);
  private readonly cTint = new Uint8Array(MAX_CANDIDATES);
  private readonly cSparkle = new Uint8Array(MAX_CANDIDATES);
  private readonly cKeep = new Uint8Array(MAX_CANDIDATES);
  private readonly cD2 = new Float64Array(MAX_CANDIDATES);
  private readonly taken = new Uint8Array(MAX_CANDIDATES);
  private vx = 0;
  private vy = 0;
  private vw = 0;
  private vh = 0;
  private cx = 0;
  private cy = 0;

  constructor(readonly maxStamps: number) {
    this.kind = new Uint8Array(maxStamps);
    this.x = new Float32Array(maxStamps);
    this.y = new Float32Array(maxStamps);
    this.angle = new Float32Array(maxStamps);
    this.radius = new Float32Array(maxStamps);
    this.coneDeg = new Float32Array(maxStamps);
    this.strength = new Float32Array(maxStamps);
    this.tint = new Uint8Array(maxStamps);
    this.sparkle = new Uint8Array(maxStamps);
  }

  /** Starts a frame for the camera view (m). */
  begin(viewX: number, viewY: number, viewW: number, viewH: number): void {
    this.n = 0;
    this.count = 0;
    this.vx = viewX;
    this.vy = viewY;
    this.vw = viewW;
    this.vh = viewH;
    this.cx = viewX + viewW / 2;
    this.cy = viewY + viewH / 2;
  }

  /** The circle (x, y, r) touches the view. */
  private inView(x: number, y: number, r: number): boolean {
    return x + r >= this.vx && x - r <= this.vx + this.vw && y + r >= this.vy && y - r <= this.vy + this.vh;
  }

  private push(kind: number, x: number, y: number, angle: number, r: number, coneDeg: number, strength: number, tint: number, sparkle: boolean, keep: boolean): void {
    if (this.n >= MAX_CANDIDATES) return;
    if (!keep && !this.inView(x, y, r)) return;
    const i = this.n++;
    this.cKind[i] = kind;
    this.cX[i] = x;
    this.cY[i] = y;
    this.cAngle[i] = angle;
    this.cRadius[i] = r;
    this.cCone[i] = coneDeg;
    this.cStrength[i] = strength;
    this.cTint[i] = tint;
    this.cSparkle[i] = sparkle ? 1 : 0;
    this.cKeep[i] = keep ? 1 : 0;
    const dx = x - this.cx;
    const dy = y - this.cy;
    this.cD2[i] = dx * dx + dy * dy;
  }

  /**
   * A survivor (drawn position and facing): standing → the `glowM` glow and the flashlight cone;
   * downed → the glow only (D3); out → nothing. `local` = my own survivor (never dropped at the cap).
   */
  addSurvivor(x: number, y: number, facingX: number, facingY: number, status: SurvivorStatus, cone: FlashlightCone | null, glowM: number, local: boolean): void {
    if (status === "out") return;
    this.push(STAMP_GLOW, x, y, 0, glowM, 0, GLOW_STRENGTH, TINT_NONE, false, local);
    if (status !== "alive" || !cone) return;
    if (facingX === 0 && facingY === 0) return;
    this.push(STAMP_CONE, x, y, Math.atan2(facingY, facingX), cone.rangeM, cone.coneDeg, BEAM_STRENGTH, TINT_BEAM, true, local);
  }

  /** A round light: a floodlight pool (`sparkle`), a car fire, a molotov zone, a flash. */
  addDisc(x: number, y: number, radiusM: number, strength: number, tint: number, sparkle = false): void {
    this.push(STAMP_DISC, x, y, 0, radiusM, 0, strength, tint, sparkle, false);
  }

  /** Keeps at most `maxStamps`: the kept (local) candidates first, then nearest the camera centre. */
  finish(): void {
    const n = this.n;
    const cap = this.maxStamps;
    this.taken.fill(0, 0, n);
    let out = 0;
    for (let i = 0; i < n && out < cap; i++) {
      if (this.cKeep[i] !== 1) continue;
      this.taken[i] = 1;
      this.copy(i, out++);
    }
    if (n - out <= cap - out) {
      for (let i = 0; i < n; i++) if (this.taken[i] !== 1) this.copy(i, out++);
    } else {
      while (out < cap) {
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < n; i++) {
          if (this.taken[i] === 1) continue;
          const d = this.cD2[i] as number;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best < 0) break;
        this.taken[best] = 1;
        this.copy(best, out++);
      }
    }
    this.count = out;
  }

  /** Candidates added this frame (tests). */
  get candidates(): number {
    return this.n;
  }

  private copy(i: number, o: number): void {
    this.kind[o] = this.cKind[i] as number;
    this.x[o] = this.cX[i] as number;
    this.y[o] = this.cY[i] as number;
    this.angle[o] = this.cAngle[i] as number;
    this.radius[o] = this.cRadius[i] as number;
    this.coneDeg[o] = this.cCone[i] as number;
    this.strength[o] = this.cStrength[i] as number;
    this.tint[o] = this.cTint[i] as number;
    this.sparkle[o] = this.cSparkle[i] as number;
  }
}

/**
 * Story 6.3 (AC 4, D4): short-lived flash lights (muzzle flashes 3 m for 0.1 s, explosions 5 m for
 * 0.15 s), a preallocated ring buffer fed from the events; aged by the paused-aware frame clock. A
 * full buffer replaces the oldest flash.
 */
export class FlashLights {
  private readonly fx: Float32Array;
  private readonly fy: Float32Array;
  private readonly fr: Float32Array;
  private readonly until: Float64Array;
  private next = 0;

  constructor(readonly capacity: number) {
    this.fx = new Float32Array(capacity);
    this.fy = new Float32Array(capacity);
    this.fr = new Float32Array(capacity);
    this.until = new Float64Array(capacity).fill(-Infinity);
  }

  add(x: number, y: number, radiusM: number, durationS: number, nowS: number): void {
    const i = this.next;
    this.next = (i + 1) % this.capacity;
    this.fx[i] = x;
    this.fy[i] = y;
    this.fr[i] = radiusM;
    this.until[i] = nowS + durationS;
  }

  /** Drops every flash (a new run, a blackout ending). */
  clear(): void {
    this.until.fill(-Infinity);
  }

  /** Adds the flashes still burning at `nowS` to the plan. */
  addTo(plan: DarknessPlan, nowS: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if ((this.until[i] as number) <= nowS) continue;
      plan.addDisc(this.fx[i] as number, this.fy[i] as number, this.fr[i] as number, FLASH_STRENGTH, TINT_FLASH);
    }
  }

  /** Flashes burning at `nowS` (tests). */
  live(nowS: number): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if ((this.until[i] as number) > nowS) n++;
    return n;
  }
}

/** Where a survivor is drawn this frame (PlayerView: predicted for me, interpolated for teammates; DD5). */
export interface DrawnSurvivor {
  readonly x: number;
  readonly y: number;
  readonly facingX: number;
  readonly facingY: number;
}

/** A live molotov fire zone as drawn (MolotovFires). */
export interface DrawnZone {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
}

/** Everything the plan reads besides the World (no allocation: the scene keeps one of these). */
export interface DarknessInputs {
  localId: string;
  /** The drawn pose of a survivor, or undefined (not drawn yet: the World's pose is used). */
  drawnOf: (id: string) => DrawnSurvivor | undefined;
  /** The weapon a player's flame jet is firing ("" = none). */
  flamingOf: (id: string) => string;
  molotovs: readonly DrawnZone[];
  flashes: FlashLights;
  nowS: number;
  viewX: number;
  viewY: number;
  viewW: number;
  viewH: number;
}

let ctxIn: DarknessInputs | null = null;
let ctxPlan: DarknessPlan | null = null;
let ctxWorld: World | null = null;
const addPlayer = (p: PlayerState, id: string): void => {
  const plan = ctxPlan as DarknessPlan;
  const inp = ctxIn as DarknessInputs;
  const world = ctxWorld as World;
  const b = world.balance.decay.blackout;
  const d = inp.drawnOf(id);
  const x = d ? d.x : p.x;
  const y = d ? d.y : p.y;
  const fx = d ? d.facingX : p.facingX;
  const fy = d ? d.facingY : p.facingY;
  plan.addSurvivor(x, y, fx, fy, p.status, flashlightOf(world.balance, p.gear), b.glowM, id === inp.localId);
  // D4: a flame jet lights `flameLightM` round the middle of the jet while it fires.
  if (p.status === "alive" && inp.flamingOf(id) !== "") {
    const len = Math.hypot(fx, fy);
    if (len > 0) plan.addDisc(x + (fx / len) * b.flameLightM * 0.5, y + (fy / len) * b.flameLightM * 0.5, b.flameLightM, FLASH_STRENGTH, TINT_FIRE);
  }
};

/**
 * Story 6.3 (AC 4, 5): this frame's stamps from the World and the drawn poses. Nothing while no
 * blackout (F9). Lights from `lightsOf` at `lightRadiusOf` (floodlights 6 m with sparkles, car fires
 * 4 m), live molotov zones at their own radius (D4), live flashes; every survivor's glow and cone.
 */
export function planDarkness(plan: DarknessPlan, world: World, inp: DarknessInputs): void {
  plan.begin(inp.viewX, inp.viewY, inp.viewW, inp.viewH);
  if (!isBlackout(world)) {
    plan.finish();
    return;
  }
  ctxIn = inp;
  ctxPlan = plan;
  ctxWorld = world;
  world.players.forEach(addPlayer);
  ctxIn = null;
  ctxPlan = null;
  ctxWorld = null;
  const lights = lightsOf(world);
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    if (!l) continue;
    const flood = l.kind === "floodlight";
    plan.addDisc(l.x, l.y, lightRadiusOf(world, l), flood ? FLOOD_STRENGTH : FIRE_STRENGTH, flood ? TINT_FLOOD : TINT_FIRE, flood);
  }
  if (world.balance.decay.blackout.molotovLight) {
    for (let i = 0; i < inp.molotovs.length; i++) {
      const z = inp.molotovs[i] as DrawnZone;
      plan.addDisc(z.x, z.y, z.radiusM, MOLOTOV_STRENGTH, TINT_FIRE);
    }
  }
  inp.flashes.addTo(plan, inp.nowS);
  plan.finish();
}
