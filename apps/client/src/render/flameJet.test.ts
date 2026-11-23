import { describe, expect, it } from "vitest";
import { FLAME_STYLE, FlameJets, type JetDraw } from "./flameJet";
import { FLAME_STALE_PATCHES, FlameCues } from "./flameCues";

const out: JetDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, tint: 0, frame: 0 };
const noClip = (): number => -1;
const clipEnd = (clip: (x0: number, y0: number, x1: number, y1: number) => number, rot: number, reach: number): number => {
  const t = clip(0, 0, Math.cos(rot) * reach, Math.sin(rot) * reach);
  return t >= 0 ? t * reach : reach;
};

/** Runs a jet along +x from (0, 0) for `frames` 60 Hz frames; returns the farthest drawn point and the most alive. */
function run(jets: FlameJets, reach: number, halfRad: number, clip: (x0: number, y0: number, x1: number, y1: number) => number, frames = 120, style: 0 | 1 = FLAME_STYLE.JET, flamers = 1) {
  let maxX = 0;
  let maxAbsAngle = 0;
  let maxAlive = 0;
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < flamers; k++) jets.emit(k, 1 / 60, 90, style, 0, 0, 1, 0, reach, halfRad, 0.4, clip);
    jets.step(1 / 60);
    maxAlive = Math.max(maxAlive, jets.n);
    for (let i = 0; i < jets.cap; i++) {
      if (!jets.draw(i, f / 60, out)) continue;
      maxX = Math.max(maxX, out.x);
      maxAbsAngle = Math.max(maxAbsAngle, Math.abs(Math.atan2(out.y, out.x)));
      // the bright part (half its width either side) stays inside the cone at its distance
      const d = Math.hypot(out.x, out.y);
      expect(out.h / 2, `width at ${d.toFixed(2)} m`).toBeLessThanOrEqual(d * Math.tan(halfRad) * 1.0001 + 0.03);
      // and the bright core (half the drawn length) ends inside the reach / clip
      expect(d + out.w * 0.25).toBeLessThanOrEqual(clipEnd(clip, out.rot, reach) + 1e-6);
    }
  }
  return { maxX, maxAbsAngle, maxAlive };
}

describe("Story 5.4: flame stream particles (FS1 jet, FS2 torch)", () => {
  it("never past the cone's reach nor outside its angle (FR-A: the drawn cone is the damage cone)", () => {
    for (const [reach, deg, style] of [[6, 20, FLAME_STYLE.JET], [3, 60, FLAME_STYLE.TORCH]] as const) {
      const r = run(new FlameJets(96), reach, ((deg / 2) * Math.PI) / 180, noClip, 120, style);
      expect(r.maxX).toBeLessThanOrEqual(reach + 1e-6);
      expect(r.maxX).toBeGreaterThan(reach * 0.75); // it does reach out (liveness)
      expect(r.maxAbsAngle).toBeLessThanOrEqual(((deg / 2) * Math.PI) / 180 + 0.05);
    }
  });

  it("stops at the first shot blocker on each ray (FR-B: a car 2 m out stops the fire at its face)", () => {
    const clip = (x0: number, _y0: number, x1: number): number => (x1 > 2 ? (2 - x0) / (x1 - x0) : -1);
    const r = run(new FlameJets(96), 6, (10 * Math.PI) / 180, clip);
    expect(r.maxX).toBeLessThanOrEqual(2 + 1e-6);
    expect(r.maxX).toBeGreaterThan(1.5);
    // a nozzle against the car face: nothing flies
    const jets = new FlameJets(96);
    expect(jets.emit(0, 0.05, 90, FLAME_STYLE.JET, 0, 0, 1, 0, 6, 0.17, 0.4, () => 0.05)).toBe(0);
  });

  it("the shared pool is capped (fx.maxFlameParticles) with 4 flamers; emission is frame-rate independent", () => {
    const r = run(new FlameJets(96), 6, 0.17, noClip, 240, FLAME_STYLE.JET, 4);
    expect(r.maxAlive).toBeLessThanOrEqual(96);
    expect(r.maxAlive).toBeGreaterThan(80);
    // 90/s for 1 s at 30 fps vs 144 fps: the same count (± the carry)
    const count = (fps: number) => {
      const j = new FlameJets(10000);
      let n = 0;
      for (let f = 0; f < fps; f++) n += j.emit(0, 1 / fps, 90, FLAME_STYLE.JET, 0, 0, 1, 0, 6, 0.17, 0.4, noClip);
      return n;
    };
    expect(Math.abs(count(30) - count(144))).toBeLessThanOrEqual(1);
    expect(count(60)).toBeGreaterThanOrEqual(89);
  });

  it("the gas torch's core is blue at the nozzle, the jet's is not", () => {
    const blue = (style: 0 | 1) => {
      const j = new FlameJets(64);
      let b = 0;
      for (let f = 0; f < 30; f++) {
        j.emit(0, 1 / 60, 90, style, 0, 0, 1, 0, 3, 0.5, 0.4, noClip);
        j.step(1 / 60);
        for (let i = 0; i < j.cap; i++) if (j.draw(i, f / 60, out) && out.tint === 0x9cc4ff) b++;
      }
      return b;
    };
    expect(blue(FLAME_STYLE.TORCH)).toBeGreaterThan(0);
    expect(blue(FLAME_STYLE.JET)).toBe(0);
  });
});

describe("Story 5.4: flame cues (who is flaming)", () => {
  const started = (id: string, weapon = "flamethrower") => ({ type: "weapon.flame_started" as const, playerId: id, weapon });
  const stopped = (id: string) => ({ type: "weapon.flame_stopped" as const, playerId: id });

  it("burst edges switch a remote cone on and off", () => {
    const c = new FlameCues();
    c.predictLocal("p0");
    c.handle(started("p1", "gas_torch"));
    expect(c.flaming("p1")).toBe("gas_torch");
    c.handle(stopped("p1"));
    expect(c.flaming("p1")).toBe("");
  });

  it(`a lost flame_stopped: the cone ends once the synced fuel stopped falling for ${FLAME_STALE_PATCHES} patches (BtR 10), or the flamer is down`, () => {
    const c = new FlameCues();
    c.predictLocal("p0");
    let ammo = 120;
    c.patch("p1", ammo, true);
    c.handle(started("p1"));
    for (let i = 0; i < 10; i++) {
      ammo -= 1;
      c.patch("p1", ammo, true);
      expect(c.flaming("p1")).toBe("flamethrower");
    }
    for (let i = 1; i <= FLAME_STALE_PATCHES; i++) {
      c.patch("p1", ammo, true); // released: no stop event arrives
      expect(c.flaming("p1") === "", `patch ${i}`).toBe(i >= FLAME_STALE_PATCHES);
    }
    // a new burst (fuel falls again, then its start event)
    c.patch("p1", --ammo, true);
    c.handle(started("p1"));
    expect(c.flaming("p1")).toBe("flamethrower");
    c.patch("p1", ammo - 1, false); // downed
    expect(c.flaming("p1")).toBe("");
  });

  it("my own cone online follows my fire clock; the server's late events about me are ignored", () => {
    const c = new FlameCues();
    c.predictLocal("p0");
    c.setLocal(true, "flamethrower", 0, 1);
    expect(c.flaming("p0")).toBe("flamethrower");
    expect(c.localDir).toEqual({ x: 0, y: 1 });
    c.handle(stopped("p0"));
    expect(c.flaming("p0")).toBe("flamethrower");
    c.setLocal(false, "flamethrower", 1, 0);
    c.handle(started("p0"));
    expect(c.flaming("p0")).toBe("");
  });

  it("solo: the sim's own events drive every cone (no patches)", () => {
    const c = new FlameCues();
    c.handle(started("local"));
    expect(c.flaming("local")).toBe("flamethrower");
    c.handle(stopped("local"));
    expect(c.flaming("local")).toBe("");
  });
});
