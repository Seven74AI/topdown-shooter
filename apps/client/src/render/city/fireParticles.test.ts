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
  emberDraw,
  fireInView,
  flameDraw,
  smokeDraw,
  type ParticleDraw,
} from "./fireParticles";
import { CORE_MARGIN, FIRE_LIGHT_STOPS, FLAME_SPRITE_PX, FLAME_TINTS, flameCoreFrac, flameMasks, maskCoreFrac } from "./fireSprites";
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

/** The farthest bright point (alpha > 50 %) of every flame drawn this frame, from the zone centre. */
function brightEdges(fire: CarFire, r: number, out: number[]): number[] {
  out.length = 0;
  const core = flameCoreFrac();
  for (let i = 0; i < fire.flames.cap; i++) {
    if (!flameDraw(fire.flames, i, r, d)) continue;
    out.push(Math.hypot(d.x, d.y) + (core * Math.max(d.w, d.h)) / 2);
  }
  return out;
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

  it("no drawn flame's bright edge ever passes R + 0.02 m (many seeds, radii, car facings, both qualities)", () => {
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
              expect(e).toBeLessThanOrEqual(r + 0.02);
              drawn++;
            }
          });
        }
    expect(drawn).toBeGreaterThan(100_000); // the property was checked on real flames
  });

  it("a clear ring of flames marks the edge: bright edges reach R in every direction", () => {
    const fire = new CarFire(3);
    const SECTORS = 16;
    const hits = new Int32Array(SECTORS);
    let frames = 0;
    let maxEdge = 0;
    run(fire, R, 60); // warm up 1 s
    run(fire, R, 120, () => {
      frames++;
      const seen = new Uint8Array(SECTORS);
      const core = flameCoreFrac();
      for (let i = 0; i < fire.flames.cap; i++) {
        if (!flameDraw(fire.flames, i, R, d)) continue;
        const e = Math.hypot(d.x, d.y) + (core * Math.max(d.w, d.h)) / 2;
        maxEdge = Math.max(maxEdge, e);
        if (e < R - 0.25) continue;
        const a = Math.atan2(d.y, d.x);
        seen[Math.floor(((a + Math.PI) / (2 * Math.PI)) * SECTORS) % SECTORS] = 1;
      }
      for (let k = 0; k < SECTORS; k++) hits[k] = (hits[k] as number) + (seen[k] as number);
    });
    expect(maxEdge).toBeGreaterThan(R - 0.03); // the visible edge lies ON the radius, not inside it
    for (let k = 0; k < SECTORS; k++) expect((hits[k] as number) / frames, `sector ${k}`).toBeGreaterThan(0.75);
  });

  it("a body reaching the outermost flame's bright edge is inside the zone (circleInFire); one 2 cm farther is not", () => {
    const zone: FireRecord = { name: "f", target: "car", x: 10, y: 8, radiusM: R, stage: 3, index: 0 };
    const fire = new CarFire(11);
    run(fire, fireRingRadiusM(zone), 90);
    const core = flameCoreFrac();
    let checked = 0;
    for (let i = 0; i < fire.flames.cap; i++) {
      if (!flameDraw(fire.flames, i, R, d)) continue;
      const dist = Math.hypot(d.x, d.y);
      const e = dist + (core * Math.max(d.w, d.h)) / 2;
      if (e < R - 0.02 || dist < 1e-6) continue; // the flames that mark the edge
      const ux = d.x / dist;
      const uy = d.y / dist;
      for (const r of [balance.player.radiusM, ...Object.values(balance.zombies.types).map((z) => z.radiusM)]) {
        expect(circleInFire([zone], zone.x + ux * (e + r - 1e-3), zone.y + uy * (e + r - 1e-3), r)).toBe(true);
        expect(circleInFire([zone], zone.x + ux * (e + r + 0.02 + 1e-3), zone.y + uy * (e + r + 0.02 + 1e-3), r)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
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
