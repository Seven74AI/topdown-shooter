import { describe, expect, it } from "vitest";
import { circleInFire, loadBalance, type FireRecord } from "@topdown/shared";
import {
  BODY_EMBERS_MAX,
  BODY_FLAMES_MAX,
  BODY_SMOKE_MAX,
  BodyFire,
  CarFire,
  FIRE_EMBERS_MAX,
  FIRE_FLAMES_MAX,
  FIRE_SMOKE_MAX,
  FIRE_CULL_MARGIN_M,
  FX_MAX_DT_S,
  LOW_FX_SIZE,
  EDGE_SLOTS_MAX,
  edgeFlameDraw,
  emberDraw,
  fireInView,
  flameDraw,
  freeFlameFitR,
  smokeDraw,
  type ParticleDraw,
} from "./fireParticles";
import { CORE_MARGIN, EDGE_REACH_ALPHA, FIRE_LIGHT_STOPS, FLAME_SPRITE_PX, FLAME_TINTS, FLAME_VARIANTS, flameCoreFrac, flameCoreFracOf, flameMasks, flameReachUpOf, maskCoreFrac } from "./fireSprites";
import { fireRingRadiusM } from "./fireRing";

const balance = loadBalance();
const R = balance.decay.fire.radiusM;
const DT = 1 / 60;
const d: ParticleDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, tint: 0, frame: 0 };

/** Runs a fire `steps` frames; calls `each` after every frame. */
function run(fire: CarFire, r: number, steps: number, each?: (t: number) => void): void {
  let t = 0;
  for (let k = 0; k < steps; k++) {
    t += DT;
    fire.update(DT, t, r);
    each?.(t);
  }
}

/** The farthest bright point (alpha > 50 %) of every free flame drawn this frame, from the zone centre (its own shape's core). */
function brightEdges(fire: CarFire, r: number, out: number[]): number[] {
  out.length = 0;
  for (let i = 0; i < fire.flames.cap; i++) {
    if (!flameDraw(fire.flames, i, freeFlameFitR(r), d)) continue;
    out.push(Math.hypot(d.x, d.y) + (flameCoreFracOf(d.frame) * Math.max(d.w, d.h)) / 2);
  }
  return out;
}

/** Every drawn flame (free + edge slots) as the screen sees it: additive alpha × mask, summed. */
interface Drawn {
  x: number;
  y: number;
  w: number;
  h: number;
  c: number;
  s: number;
  a: number;
  m: Float32Array;
}
const SPX = FLAME_SPRITE_PX;
function drawnFlames(fire: CarFire, t: number, r: number, out: Drawn[]): Drawn[] {
  out.length = 0;
  const push = (): void => void out.push({ x: d.x, y: d.y, w: d.w, h: d.h, c: Math.cos(d.rot), s: Math.sin(d.rot), a: d.alpha, m: flameMasks()[d.frame] as Float32Array });
  for (let i = 0; i < fire.flames.cap; i++) if (flameDraw(fire.flames, i, freeFlameFitR(r), d) && d.alpha >= 0.01) push();
  for (let i = 0; i < EDGE_SLOTS_MAX; i++) if (edgeFlameDraw(fire, i, t, r, d)) push();
  return out;
}
function field(fl: readonly Drawn[], px: number, py: number): number {
  let sum = 0;
  for (const f of fl) {
    const dx = px - f.x;
    const dy = py - f.y;
    const u = (dx * f.c + dy * f.s) / (f.w / 2);
    const v = (-dx * f.s + dy * f.c) / (f.h / 2);
    if (u <= -1 || u >= 1 || v <= -1 || v >= 1) continue;
    sum += (f.m[Math.min(SPX - 1, Math.floor(((v + 1) / 2) * SPX)) * SPX + Math.min(SPX - 1, Math.floor(((u + 1) / 2) * SPX))] as number) * f.a;
  }
  return sum;
}

describe("Story 4.12: the code fire keeps 4.11's edge rule (your body touches the flames = you burn)", () => {
  it("the bright core fraction covers every texel of alpha ≥ 50 % of every flame sprite (+ a filtering margin)", () => {
    const core = flameCoreFrac();
    for (const m of flameMasks()) {
      const c = maskCoreFrac(m, FLAME_SPRITE_PX);
      expect(c).toBeGreaterThan(0.2); // a real flame shape, not an empty mask
      expect(core).toBeGreaterThanOrEqual(c + CORE_MARGIN - 1e-9);
      for (let y = 0; y < FLAME_SPRITE_PX; y++)
        for (let x = 0; x < FLAME_SPRITE_PX; x++) {
          if ((m[y * FLAME_SPRITE_PX + x] as number) < 0.5) continue;
          expect(Math.hypot(((x + 0.5) / FLAME_SPRITE_PX) * 2 - 1, ((y + 0.5) / FLAME_SPRITE_PX) * 2 - 1)).toBeLessThanOrEqual(core);
        }
    }
  });

  it("no drawn free flame's bright edge ever passes R + 0.02 m (many seeds, radii, car facings, both qualities)", () => {
    const edges: number[] = [];
    let drawn = 0;
    for (const low of [false, true])
      for (const r of [1, R, 3.5])
        for (const [seed, angle] of [
          [1, 0],
          [7, Math.PI / 2],
          [42, Math.PI],
          [99, -Math.PI / 2],
        ] as const) {
          const fire = new CarFire(seed, low);
          fire.setCar(angle);
          run(fire, r, 240, () => {
            for (const e of brightEdges(fire, r, edges)) {
              // review M1: the free flames' cores end ≥ 6 cm inside R (the edge slots own R; halos must not stack past it)
              expect(e).toBeLessThanOrEqual(r - 0.06);
              drawn++;
            }
          });
        }
    expect(drawn).toBeGreaterThan(80_000); // the property was checked on real flames
  });

  it("review M1: no edge-slot flame's texel of alpha ≥ 50 % lies past R + 0.02 m (exact, every shape and flicker)", () => {
    // the bright texels' outer corners per shape, in sprite units (−1..1)
    const pts = flameMasks().map((m) => {
      const out: number[] = [];
      for (let y = 0; y < SPX; y++)
        for (let x = 0; x < SPX; x++) {
          if ((m[y * SPX + x] as number) < 0.5) continue;
          for (const [cx, cy] of [
            [x, y],
            [x + 1, y],
            [x, y + 1],
            [x + 1, y + 1],
          ] as const)
            out.push((cx / SPX) * 2 - 1, (cy / SPX) * 2 - 1);
        }
      return out;
    });
    let checked = 0;
    for (const r of [1, R, 3.5]) {
      const fire = new CarFire(5);
      fire.update(DT, 0, r);
      for (let t = 0; t < 2; t += 0.07)
        for (let i = 0; i < fire.edgeN; i++) {
          expect(edgeFlameDraw(fire, i, t, r, d)).toBe(true);
          const c = Math.cos(d.rot);
          const sn = Math.sin(d.rot);
          const p = pts[d.frame] as number[];
          let worst = 0;
          for (let k = 0; k < p.length; k += 2) {
            const lx = ((p[k] as number) * d.w) / 2;
            const ly = ((p[k + 1] as number) * d.h) / 2;
            worst = Math.max(worst, Math.hypot(d.x + lx * c - ly * sn, d.y + lx * sn + ly * c));
          }
          expect(worst).toBeLessThanOrEqual(r + 0.02);
          checked++;
        }
    }
    expect(checked).toBeGreaterThan(2000);
    expect(EDGE_REACH_ALPHA).toBeLessThan(0.5); // edge flames are placed by their faint halo, not only their core
    for (let v = 0; v < FLAME_VARIANTS; v++) expect(flameReachUpOf(v)).toBeGreaterThan(0.3);
  });

  it("review M1: a body touching R stands in visible flame — within 0.1 m inside R, ≥ 90 % of directions are bright (summed alpha × mask ≥ 0.5) in EVERY frame, both qualities; and nothing that bright past R + 0.02 m", () => {
    const fl: Drawn[] = [];
    const RAYS = 120;
    for (const low of [false, true])
      for (const r of [R, 3.5]) {
        const fire = new CarFire(17, low);
        fire.setCar(0.3);
        let frames = 0;
        let worstShare = 1;
        let worstOut = 0;
        run(fire, r, 150, (t) => {
          if (t < 1 || Math.round(t / DT) % 10 !== 0) return;
          drawnFlames(fire, t, r, fl);
          let ok = 0;
          for (let j = 0; j < RAYS; j++) {
            const an = ((j + 0.5) / RAYS) * 2 * Math.PI;
            const cs = Math.cos(an);
            const sn = Math.sin(an);
            for (let q = r; q >= r - 0.1 - 1e-9; q -= 0.01)
              if (field(fl, cs * q, sn * q) >= 0.5) {
                ok++;
                break;
              }
            for (let q = r + 0.02; q <= r + 0.25; q += 0.03) worstOut = Math.max(worstOut, field(fl, cs * q, sn * q));
          }
          worstShare = Math.min(worstShare, ok / RAYS);
          frames++;
        });
        expect(frames).toBeGreaterThan(5);
        expect(worstShare, `low ${low} R ${r}`).toBeGreaterThanOrEqual(0.9);
        expect(worstOut, `low ${low} R ${r}`).toBeLessThan(0.5); // your body touches visible flame = you burn
      }
  });

  it("the edge ring has the same slots in ?fx=low (never halved) and one per ≤ 0.3 m of circumference at R = 2 m", () => {
    const a = new CarFire(1);
    const b = new CarFire(1, true);
    a.update(DT, 0, R);
    b.update(DT, 0, R);
    expect(a.edgeN).toBe(b.edgeN);
    expect((2 * Math.PI * R) / a.edgeN).toBeLessThanOrEqual(0.3);
    const zone: FireRecord = { name: "f", target: "car", x: 10, y: 8, radiusM: fireRingRadiusM({ x: 0, y: 0, radiusM: R }), stage: 3, index: 0 };
    // a body whose edge just reaches R burns; 2 cm out it does not (the sim's rule the ring marks)
    for (const pr of [balance.player.radiusM, ...Object.values(balance.zombies.types).map((z) => z.radiusM)]) {
      expect(circleInFire([zone], zone.x + R + pr - 1e-3, zone.y, pr)).toBe(true);
      expect(circleInFire([zone], zone.x + R + pr + 0.02, zone.y, pr)).toBe(false);
    }
  });

  it("flames grow hot to cool over their life (white-yellow → deep red) and fade in", () => {
    expect(FLAME_TINTS[0]).toBe(0xfff6d6);
    expect((FLAME_TINTS[FLAME_TINTS.length - 1] as number) >> 16).toBeLessThan(0x60);
  });

  it("the ground light ends exactly at its sprite edge (drawn 2R wide: no light past the zone)", () => {
    const last = FIRE_LIGHT_STOPS[FIRE_LIGHT_STOPS.length - 1] as readonly number[];
    expect(last[0]).toBe(1);
    expect(last[4]).toBe(0);
  });
});

describe("Story 4.12: particle pools are fixed and capped (phones)", () => {
  it("a car fire never holds more than its caps (≈ 200), half with ?fx=low; pools never grow", () => {
    for (const low of [false, true]) {
      const fire = new CarFire(5, low);
      let peak = 0;
      run(fire, R, 600, () => (peak = Math.max(peak, fire.count())));
      const k = low ? 0.5 : 1;
      expect(fire.flames.n).toBeLessThanOrEqual(FIRE_FLAMES_MAX * k);
      expect(fire.smoke.n).toBeLessThanOrEqual(FIRE_SMOKE_MAX * k);
      expect(fire.embers.n).toBeLessThanOrEqual(FIRE_EMBERS_MAX * k);
      expect(peak).toBeLessThanOrEqual((FIRE_FLAMES_MAX + FIRE_SMOKE_MAX + FIRE_EMBERS_MAX) * k);
      expect(peak).toBeGreaterThan(60 * k); // it really burns
      expect(fire.flames.cap).toBe(FIRE_FLAMES_MAX);
    }
    expect(FIRE_FLAMES_MAX + FIRE_SMOKE_MAX + FIRE_EMBERS_MAX).toBeLessThanOrEqual(200);
  });

  it("review L2: ?fx=low halves the spawn rate too (not only the caps): half the flames in the first 0.1 s", () => {
    const full = new CarFire(8);
    const low = new CarFire(8, true);
    run(full, R, 6);
    run(low, R, 6);
    expect(full.flames.n).toBeGreaterThan(20); // below every cap: the rate decides
    const ratio = low.flames.n / full.flames.n;
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
    expect(LOW_FX_SIZE).toBe(1); // review L3: low mode never enlarges particles (fill rate)
  });

  it("a woken tab (one 5 s frame) is one capped step, not a burst; a paused frame (dt 0) changes nothing", () => {
    const a = new CarFire(9);
    const b = new CarFire(9);
    a.update(5, 1, R);
    b.update(FX_MAX_DT_S, 1, R);
    expect(a.count()).toBe(b.count());
    const n = a.count();
    a.update(0, 2, R);
    expect(a.count()).toBe(n);
  });

  it("clear() empties a fire (a fire gone out at a stage change)", () => {
    const f = new CarFire(2);
    run(f, R, 60);
    expect(f.count()).toBeGreaterThan(0);
    f.clear();
    expect(f.count()).toBe(0);
    for (let i = 0; i < f.flames.cap; i++) expect(flameDraw(f.flames, i, R, d)).toBe(false);
  });

  it("smoke is normal-blend grey-black puffs that grow and fade; sparks are dimmer outside the zone", () => {
    const f = new CarFire(4);
    run(f, R, 240);
    let puffs = 0;
    for (let i = 0; i < f.smoke.cap; i++) {
      if (!smokeDraw(f.smoke, i, "black", 0, 0, d)) continue;
      puffs++;
      expect(d.alpha).toBeLessThanOrEqual(0.6);
      expect(d.w).toBeGreaterThan(0.6);
    }
    expect(puffs).toBeGreaterThan(10);
    for (let i = 0; i < f.embers.cap; i++) {
      if (!emberDraw(f.embers, i, R, d)) continue;
      if (Math.hypot(d.x, d.y) > R) expect(d.alpha).toBeLessThanOrEqual(0.45);
    }
  });
});

describe("Story 4.12 (perf): a fire out of view is not simulated or drawn", () => {
  it("in view while its zone plus the smoke margin touches the view rectangle; out beyond it", () => {
    const view = [10, 10, 20, 9] as const; // x, y, w, h (m)
    expect(fireInView(20, 14, R, ...view)).toBe(true);
    const m = R + FIRE_CULL_MARGIN_M;
    expect(fireInView(10 - m + 0.01, 14, R, ...view)).toBe(true); // smoke could still drift in
    expect(fireInView(10 - m - 0.01, 14, R, ...view)).toBe(false);
    expect(fireInView(20, 19 + m + 0.01, R, ...view)).toBe(false);
    expect(fireInView(30 + m - 0.01, 19 + m - 0.01, R, ...view)).toBe(true);
  });
});

describe("Story 4.12: a burning survivor (server fire events only)", () => {
  it("flames, smoke and embers while burning, on the body; they die down after the cue ends and the slot frees", () => {
    const f = new BodyFire(1);
    let t = 0;
    for (let k = 0; k < 60; k++) f.update(DT, (t += DT), 3, 4, balance.player.radiusM, true);
    expect(f.flames.n).toBeGreaterThan(5);
    expect(f.smoke.n).toBeGreaterThan(0);
    expect(f.embers.n).toBeGreaterThan(0);
    for (let i = 0; i < f.flames.cap; i++) {
      if (!flameDraw(f.flames, i, 0, d)) continue;
      expect(Math.hypot(d.x - 3, d.y - 4)).toBeLessThan(1.2); // on and just above the body
    }
    expect(f.flames.n).toBeLessThanOrEqual(BODY_FLAMES_MAX);
    expect(f.smoke.n).toBeLessThanOrEqual(BODY_SMOKE_MAX);
    expect(f.embers.n).toBeLessThanOrEqual(BODY_EMBERS_MAX);
    let k = 0;
    while (!f.idle() && k < 600) {
      f.update(DT, (t += DT), 3, 4, balance.player.radiusM, false);
      k++;
    }
    expect(f.idle()).toBe(true);
    expect(f.count()).toBe(0); // the slot frees only once every flame, puff and spark is gone
    expect(k * DT).toBeLessThan(3.5); // fade 0.9 s + the longest puff
    expect(k * DT).toBeGreaterThan(0.5); // not cut off at once
  });

  it("review L1: the flames die down over ~0.9 s after the last fire hit (not cut off)", () => {
    const f = new BodyFire(4);
    let t = 0;
    for (let k = 0; k < 30; k++) f.update(DT, (t += DT), 0, 0, 0.4, true);
    expect(f.burn).toBe(1);
    for (let k = 0; k < 27; k++) f.update(DT, (t += DT), 0, 0, 0.4, false); // 0.45 s after
    expect(f.burn).toBeGreaterThan(0.4);
    expect(f.burn).toBeLessThan(0.6);
    expect(f.flames.n).toBeGreaterThan(0); // still burning visibly, smaller
    for (let k = 0; k < 30; k++) f.update(DT, (t += DT), 0, 0, 0.4, false); // 0.95 s after
    expect(f.burn).toBe(0);
  });

  it("never burning = nothing at all (no event, no flames)", () => {
    const f = new BodyFire(2);
    for (let k = 0; k < 120; k++) f.update(DT, k * DT, 0, 0, 0.4, false);
    expect(f.count()).toBe(0);
    expect(f.idle()).toBe(true);
  });

  it("low quality halves the body caps", () => {
    const f = new BodyFire(3, true);
    for (let k = 0; k < 120; k++) f.update(DT, k * DT, 0, 0, 0.4, true);
    expect(f.flames.n).toBeLessThanOrEqual(BODY_FLAMES_MAX / 2);
  });
});
