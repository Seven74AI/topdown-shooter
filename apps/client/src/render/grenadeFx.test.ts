import { describe, expect, it } from "vitest";
import { TICK_DT_S, type SimEvent } from "@topdown/shared";
import { BlastParticles, Explosions, FLAME_CORE_FRAC, GrenadeFlights, P_DUST, P_FLAME, type ParticleDraw, type RoundPose } from "./grenadeFx";
import { scorchPixels } from "./city/blastFxAtlas";

/** Story 5.5: the client's cosmetic rounds and explosions (AC 7, 15; FR-E: pending until the server agrees). */
const launched = (playerId: string, grenadeId: number, flightTicks = 12, ageS = 0, seq = 0): SimEvent => ({ type: "grenade.launched", playerId, grenadeId, x: 0, y: 0, tx: 12, ty: 0, landTick: 0, flightTicks, ageS, seq });
const exploded = (grenadeId: number): SimEvent => ({ type: "explosion.happened", kind: 0, x: 12, y: 0, radiusM: 2, sourcePlayerId: "p1", grenadeId });
const pose: RoundPose = { x: 0, y: 0, z: 0, heading: 0, landed: false };

describe("GrenadeFlights (Story 5.5)", () => {
  it("flies from the muzzle to the landing point in flightTicks, on a 1.5 m arc; waits on the ground for its event", () => {
    const f = new GrenadeFlights(4, "p0", 0.5);
    f.handle(launched("p1", 7), 10);
    expect(f.count).toBe(1);
    f.pose(0, 10 + 6 * TICK_DT_S, 1.5, pose);
    expect(pose.x).toBeCloseTo(6, 9);
    expect(pose.z).toBeCloseTo(1.5, 9); // the peak half way
    f.pose(0, 10 + 20 * TICK_DT_S, 1.5, pose);
    expect(pose.landed).toBe(true);
    expect(pose.x).toBeCloseTo(12, 9);
    expect(pose.z).toBe(0);
    f.update(10 + 12 * TICK_DT_S + 0.4);
    expect(f.count).toBe(1); // still pending
    f.handle(exploded(7), 11);
    expect(f.count).toBe(0); // the server's explosion hides it
  });

  it("a lost explosion event: hidden lostS after landing (no round stuck on screen)", () => {
    const f = new GrenadeFlights(4, "p0", 0.5);
    f.handle(launched("p1", 3), 0);
    f.update(12 * TICK_DT_S + 0.49);
    expect(f.count).toBe(1);
    f.update(12 * TICK_DT_S + 0.51);
    expect(f.count).toBe(0);
  });

  it("my local instant copy is replaced by my server echo of the SAME shot (seq): id adopted, landing snapped, then burst by its id", () => {
    const f = new GrenadeFlights(4, "p0", 0.5);
    f.launched("p0", 0, 0, 0, 12, 0, 12, 5, 41); // local: no cover known
    f.handle({ ...(launched("p0", 9, 12, 0, 41) as Extract<SimEvent, { type: "grenade.launched" }>), tx: 8, ty: 0 }, 5.2);
    expect(f.count).toBe(1);
    expect(f.snaps).toBe(1);
    f.pose(0, 99, 1.5, pose);
    expect(pose.x).toBeCloseTo(8, 9);
    expect(f.startS[0]).toBe(5); // keeps its instant start
    f.handle(exploded(9), 6);
    expect(f.count).toBe(0);
  });

  it("review L1: the echo re-times my round's landing to the server's (render time): it lands as the blast is drawn, not before", () => {
    const f = new GrenadeFlights(4, "p0", 0.5);
    f.launched("p0", 0, 0, 0, 12, 0, 12, 5, 7); // local: lands at 5.6
    expect(f.landS[0]).toBeCloseTo(5.6, 9);
    f.handle(launched("p0", 3, 12, 0, 7), 5.34); // the echo drawn 0.34 s later (≈ ?lag=150 RTT + render delay)
    expect(f.landS[0]).toBeCloseTo(5.34 + 12 * TICK_DT_S, 9); // = when the explosion event is drawn
    f.pose(0, 5.6, 1.5, pose);
    expect(pose.landed).toBe(false); // still flying where it used to lie on the ground
    f.update(5.34 + 12 * TICK_DT_S + 0.49); // at 300 ms RTT it no longer runs out its lost timer before the blast
    expect(f.count).toBe(1);
    f.handle(exploded(3), 6);
    expect(f.count).toBe(0);
  });

  it("review L1: a local copy of a shot the server never fired is not matched to the next shot's echo; it times out", () => {
    const f = new GrenadeFlights(4, "p0", 0.5);
    f.launched("p0", 0, 0, 0, 12, 0, 12, 5, 40); // a dry shot: no echo will come
    f.launched("p0", 0, 0, 0, 12, 0, 12, 6.25, 65); // the next shot
    f.handle(launched("p0", 4, 12, 0, 65), 6.5);
    expect(Array.from(f.id).filter((v) => v !== -1).sort()).toEqual([0, 4]); // the orphan is still id 0
    expect(f.seq[0]).toBe(40);
    f.update(5 + 12 * TICK_DT_S + 0.51);
    expect(f.count).toBe(1); // the orphan timed out, the matched one flies on
  });

  it("a build start drops every round (no ghost blasts after a slept tab); a stale launch starts back-dated", () => {
    const f = new GrenadeFlights(4, "p0", 0.5);
    f.handle(launched("p1", 1), 0);
    f.handle(launched("p2", 2), 0);
    f.handle({ type: "build.started", wave: 2 }, 0.1);
    expect(f.count).toBe(0);
    f.handle(launched("p1", 3, 12, 0.3), 10);
    expect(f.startS[0]).toBeCloseTo(9.7, 9);
  });

  it("a full pool reuses the oldest slot", () => {
    const f = new GrenadeFlights(2, "p0", 0.5);
    f.handle(launched("p1", 1), 0);
    f.handle(launched("p1", 2), 1);
    f.handle(launched("p1", 3), 2);
    expect(f.count).toBe(2);
    expect([...f.id].sort()).toEqual([2, 3]);
  });
});

describe("explosion particles and layers (Story 5.5, EX1 / EX2)", () => {
  it("never more live particles than the cap (the newest blast always shows), and they die out", () => {
    const p = new BlastParticles(96);
    for (let k = 0; k < 5; k++) p.burst(k % 2 ? "shockwave" : "fireball", k, 0, 2, 4, 3);
    expect(p.live()).toBe(96);
    for (let t = 0; t < 200; t++) p.step(1 / 30);
    expect(p.live()).toBe(0);
  });

  it("flames keep their bright core inside the blast circle; EX2's dust ring stops on the edge", () => {
    const p = new BlastParticles(96);
    p.burst("fireball", 5, 5, 2, 4, 3);
    p.burst("shockwave", 20, 5, 2, 4, 3);
    const d: ParticleDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, variant: 0, t: 0 };
    let flames = 0;
    let dust = 0;
    for (let t = 0; t < 40; t++) {
      p.step(1 / 60);
      for (let i = 0; i < p.capacity; i++) {
        if (!p.draw(i, d)) continue;
        const dist = Math.hypot(d.x - (p.cx[i] as number), d.y - (p.cy[i] as number));
        if (p.kind[i] === P_FLAME) {
          flames++;
          expect(dist + (FLAME_CORE_FRAC * d.w) / 2).toBeLessThanOrEqual(2 + 1e-6);
        } else if (p.kind[i] === P_DUST) {
          dust++;
          expect(dist + p.size(i) * 0.42).toBeLessThanOrEqual(2 + 1e-6);
        }
      }
    }
    expect(flames).toBeGreaterThan(100); // liveness
    expect(dust).toBeGreaterThan(100);
  });

  it("the edge ring ends exactly on the blast radius (EX2 grows to it); explosions and scorches are capped and expire", () => {
    const e = new Explosions(2, 3);
    const out = { r: 0, alpha: 0 };
    const i = e.start("shockwave", 0, 0, 2.5, 0);
    expect(e.ring(i, 0.1, out).r).toBeLessThan(2.5);
    expect(e.ring(i, 0.3, out).r).toBe(2.5);
    const j = e.start("fireball", 0, 0, 2, 0);
    expect(e.ring(j, 0.01, out).r).toBe(2);
    e.start("fireball", 1, 1, 2, 0.5);
    expect(e.started).toBe(3);
    expect([...e.active].filter((a) => a === 1)).toHaveLength(2);
    e.update(5);
    expect([...e.active].filter((a) => a === 1)).toHaveLength(0);
    expect(e.scorchAlpha(0, 1)).toBeGreaterThan(0.5);
    e.fadeScorches(2);
    e.update(3.5);
    expect([...e.scorchOn].filter((a) => a === 1)).toHaveLength(0);
  });

  it("the scorch sprite has nothing past its edge (drawn 2R wide it ends on the blast edge)", () => {
    const S = 64;
    const px = scorchPixels(S);
    let inside = 0;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const r = Math.hypot(((x + 0.5) / S) * 2 - 1, ((y + 0.5) / S) * 2 - 1);
        const a = px[(y * S + x) * 4 + 3] as number;
        if (r >= 1) expect(a).toBe(0);
        else if (a > 0) inside++;
      }
    expect(inside).toBeGreaterThan(S * S * 0.6);
  });
});
