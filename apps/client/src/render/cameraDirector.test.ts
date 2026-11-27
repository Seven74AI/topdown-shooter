import { describe, expect, it } from "vitest";
import { TICK_RATE_HZ } from "@topdown/shared";
import { CameraDirector, EXTRACT_SHOTS, createDirectorInputs, type DirectorInputs, type ExtractShots } from "./cameraDirector";
import { heliPose, type HeliPose } from "./heliPose";
import { pixelsPerMeter } from "./camera";

/** Story 12.3: the extraction camera director (AC 1–7, 9, 13). Downtown: 48 × 32 m, pad (24, 15.9), fly-out 30 m east. */
const T = TICK_RATE_HZ;
const START = 1000;

function inputs(w = 844, h = 390): DirectorInputs {
  const inp = createDirectorInputs();
  inp.extracting = true;
  inp.startTick = START;
  inp.nowTick = START;
  inp.screenW = w;
  inp.screenH = h;
  inp.ppm = pixelsPerMeter(w, h);
  inp.mapW = 48;
  inp.mapH = 32;
  inp.padX = 24;
  inp.padY = 15.9;
  inp.flyDxM = 30;
  inp.heliX = 24;
  inp.heliY = 15.9;
  inp.dtS = 1 / 60;
  return inp;
}

const pose: HeliPose = { phase: "gone", dx: 0, dy: 0, scale: 1, alpha: 0 };
function heliAt(inp: DirectorInputs, flyS: number): void {
  if (flyS < 0) return;
  const p = heliPose(flyS, 0, 0, true, pose, inp.flyOutS, inp.flyDxM);
  if (p.phase === "gone") return; // the drawn helicopter keeps its last spot
  inp.heliX = inp.padX + p.dx;
  inp.heliY = inp.padY + p.dy;
}

/** Runs the director frame by frame at `fps` from `fromS` to `toS` (s after the start), calling `each`. */
function run(d: CameraDirector, inp: DirectorInputs, fromS: number, toS: number, fps: number, each: (s: number) => void): void {
  inp.dtS = 1 / fps;
  for (let s = fromS; s <= toS + 1e-9; s += 1 / fps) {
    inp.nowTick = START + s * T;
    if (inp.liftedAtTick >= 0) heliAt(inp, (inp.nowTick - inp.liftedAtTick) / T);
    d.update(inp);
    each(s);
  }
}

describe("cameraDirector › walk (AC 2)", () => {
  it("off outside an extraction: the HUD shows, no bars, no fade", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.extracting = false;
    const o = d.update(inp);
    expect(o.active).toBe(false);
    expect(o.hudShown).toBe(true);
    expect(o.bars).toBe(0);
    expect(o.fadeAlpha).toBe(0);
  });

  it("thin bars (8 %) ease in over 0.6 s; the HUD hides", () => {
    const d = new CameraDirector();
    const inp = inputs();
    const seen: number[] = [];
    run(d, inp, 0, 1, 60, () => seen.push(d.out.bars));
    expect(seen[0]).toBe(0);
    expect(d.out.hudShown).toBe(false);
    expect(seen[18]).toBeGreaterThan(0.02); // 0.3 s
    expect(seen[18]).toBeLessThan(0.06);
    expect(seen[36]).toBeCloseTo(0.08, 6); // 0.6 s
    expect(seen[60]).toBeCloseTo(0.08, 6);
    for (let i = 1; i < seen.length; i++) expect(seen[i] as number).toBeGreaterThanOrEqual(seen[i - 1] as number);
  });

  it("frames every walker plus the pad (box + 3 m), zoom clamped to [0.6, 1]", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.walkers = 2;
    inp.walkerX[0] = 14;
    inp.walkerY[0] = 20;
    inp.walkerX[1] = 18;
    inp.walkerY[1] = 12;
    const o = d.update(inp); // first frame snaps
    // Box x 14…24, y 12…20 (+3 m): 16 × 14 m; the 844×390 view at 1× is 24 × 11.1 m → zoom 11.1 / 14.
    const vh1 = 390 / inp.ppm;
    expect(o.zoom).toBeCloseTo(vh1 / 14, 6);
    expect(o.centreX).toBeCloseTo(19, 6);
    expect(o.centreY).toBeCloseTo(16, 6);
    // Spread across the map: never below 0.6×.
    inp.walkerX[0] = 1;
    inp.walkerY[0] = 1;
    inp.walkerX[1] = 47;
    inp.walkerY[1] = 31;
    const d2 = new CameraDirector();
    expect(d2.update(inp).zoom).toBe(EXTRACT_SHOTS.walk.minZoom);
    // Next to the pad: never past 1×.
    inp.walkers = 1;
    inp.walkerX[0] = 25;
    inp.walkerY[0] = 16;
    const d3 = new CameraDirector();
    expect(d3.update(inp).zoom).toBe(1);
  });

  it("eases between framings with no jumps (a walker boards: the box shrinks smoothly)", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.walkers = 2;
    inp.walkerX[0] = 10;
    inp.walkerY[0] = 22;
    inp.walkerX[1] = 26;
    inp.walkerY[1] = 16;
    let px = Number.NaN;
    let pz = Number.NaN;
    let maxStep = 0;
    let maxZStep = 0;
    run(d, inp, 0, 3, 60, (s) => {
      if (Math.abs(s - 1) < 1e-6) inp.walkers = 1; // the far walker boards at 1 s… no: the near one stays
      if (Math.abs(s - 1) < 1e-6) {
        inp.walkerX[0] = 26;
        inp.walkerY[0] = 16;
      }
      if (!Number.isNaN(px)) {
        maxStep = Math.max(maxStep, Math.abs(d.out.centreX - px));
        maxZStep = Math.max(maxZStep, Math.abs(d.out.zoom - pz));
      }
      px = d.out.centreX;
      pz = d.out.zoom;
    });
    expect(maxStep).toBeLessThan(0.5); // m per frame (a jump would be the whole 6 m)
    expect(maxZStep).toBeLessThan(0.02);
  });

  it("the view never leaves the map (clamped like the Phaser camera bounds)", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.walkers = 1;
    inp.walkerX[0] = 1;
    inp.walkerY[0] = 1;
    run(d, inp, 0, 2, 60, () => {
      const o = d.out;
      const hw = inp.screenW / (inp.ppm * o.zoom) / 2;
      const hh = inp.screenH / (inp.ppm * o.zoom) / 2;
      expect(o.centreX - hw).toBeGreaterThanOrEqual(-1e-9);
      expect(o.centreY - hh).toBeGreaterThanOrEqual(-1e-9);
    });
  });
});

describe("cameraDirector › boarding and the cut (AC 3, 4)", () => {
  it("the last boarding takes the bars to full (12 %) over 0.5 s", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.walkers = 1;
    inp.walkerX[0] = 20;
    inp.walkerY[0] = 16;
    run(d, inp, 0, 2, 60, () => {});
    expect(d.out.bars).toBeCloseTo(0.08, 6);
    expect(d.out.phase).toBe("walk");
    inp.walkers = 0;
    inp.allAboard = true;
    run(d, inp, 2 + 1 / 60, 2.25, 60, () => {});
    expect(d.out.phase).toBe("aboard");
    expect(d.out.bars).toBeGreaterThan(0.09);
    expect(d.out.bars).toBeLessThan(0.11);
    run(d, inp, 2.27, 2.6, 60, () => {});
    expect(d.out.bars).toBeCloseTo(0.12, 6);
    expect(d.out.fadeAlpha).toBe(0); // no cut: no black
  });

  it("a timeout cut: black full on the cut tick (start + 8 s), held 0.4 s, back in over 0.3 s", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.walkers = 1;
    inp.walkerX[0] = 5;
    inp.walkerY[0] = 25;
    const a: Record<string, number> = {};
    run(d, inp, 0, 9.5, 60, (s) => {
      if (s >= 8 - 1e-9 && !inp.cut) {
        inp.cut = true; // the server cuts and boards everyone left
        inp.walkers = 0;
        inp.allAboard = true;
      }
      a[s.toFixed(2)] = d.out.fadeAlpha;
    });
    expect(a["7.50"]).toBe(0);
    expect(a["7.85"] as number).toBeGreaterThan(0.3);
    expect(a["8.00"]).toBeCloseTo(1, 6);
    expect(a["8.30"]).toBeCloseTo(1, 6);
    expect(a["8.55"] as number).toBeLessThan(1);
    expect(a["8.55"] as number).toBeGreaterThan(0);
    expect(a["8.75"]).toBe(0);
    expect(d.out.fadeRgb).toBe(0x000000);
    expect(d.out.bars).toBeCloseTo(0.12, 6);
  });

  it("everyone boards inside the cut's lead-in (no cut): the black goes back from where it was, no pop", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.walkers = 1;
    let prev = 0;
    let maxStep = 0;
    run(d, inp, 0, 8.5, 60, (s) => {
      if (s >= 7.85 && !inp.allAboard) {
        inp.walkers = 0;
        inp.allAboard = true;
      }
      maxStep = Math.max(maxStep, Math.abs(d.out.fadeAlpha - prev));
      prev = d.out.fadeAlpha;
    });
    expect(maxStep).toBeLessThan(0.15);
    expect(d.out.fadeAlpha).toBe(0);
  });
});

describe("cameraDirector › fly-out (AC 5–7)", () => {
  function toLift(d: CameraDirector, inp: DirectorInputs, liftS: number): void {
    inp.walkers = 0;
    inp.allAboard = true;
    run(d, inp, 0, liftS, 60, () => {});
    inp.liftedAtTick = START + liftS * T;
  }

  it("follows the helicopter, zooms out to 0.6× over 3 s, never past 1×; the fog lifts", () => {
    const d = new CameraDirector();
    const inp = inputs();
    toLift(d, inp, 1);
    const zooms: number[] = [];
    run(d, inp, 1, 9, 60, () => {
      zooms.push(d.out.zoom);
      expect(d.out.zoom).toBeLessThanOrEqual(1);
      expect(d.out.zoom).toBeGreaterThanOrEqual(0.6 - 1e-9);
    });
    expect(zooms[0]).toBeCloseTo(1, 2);
    expect(zooms[180] as number).toBeLessThan(0.62); // 3 s after the lift-off (smoothing lags a little)
    expect(zooms[zooms.length - 1]).toBeCloseTo(0.6, 4);
    expect(d.out.fogLift).toBe(1);
    expect(d.out.phase).toBe("done");
  });

  it("the camera tracks the helicopter east until the map edge stops it", () => {
    const d = new CameraDirector();
    const inp = inputs();
    toLift(d, inp, 1);
    run(d, inp, 1, 2.5, 60, () => {});
    expect(d.out.phase).toBe("fly");
    const hw = inp.screenW / (inp.ppm * d.out.zoom) / 2;
    expect(d.out.centreX).toBeGreaterThan(inp.padX);
    expect(d.out.centreX).toBeLessThanOrEqual(48 - hw + 1e-9);
  });

  it("the dawn line sweeps west from past the east edge across the map; light eases in", () => {
    const d = new CameraDirector();
    const inp = inputs();
    toLift(d, inp, 1);
    const xs: number[] = [];
    run(d, inp, 1, 9, 60, () => xs.push(d.out.dawnX));
    expect(xs[0] as number).toBeGreaterThan(48);
    for (let i = 1; i < xs.length; i++) expect(xs[i] as number).toBeLessThanOrEqual(xs[i - 1] as number);
    expect(xs[xs.length - 1] as number).toBeLessThan(0);
    expect(d.out.dawnAlpha).toBe(1);
  });

  for (const [w, h] of [
    [568, 320],
    [640, 360],
    [800, 360],
    [844, 390],
  ] as const) {
    it(`fade to white before the edge, then held (${w}×${h}): white full by the time the helicopter reaches the east edge, never past the fly-out`, () => {
      const d = new CameraDirector();
      const inp = inputs(w, h);
      toLift(d, inp, 1);
      let fullAt = -1;
      run(d, inp, 1, 10, 60, (s) => {
        const o = d.out;
        const flyS = s - 1;
        const hw = inp.screenW / (inp.ppm * o.zoom) / 2;
        const hh = inp.screenH / (inp.ppm * o.zoom) / 2;
        // Nothing beyond the map is ever shown.
        expect(o.centreX + hw).toBeLessThanOrEqual(48 + 1e-9);
        expect(o.centreY - hh).toBeGreaterThanOrEqual(-1e-9);
        // The helicopter past the east edge → full white.
        if (inp.heliX >= 48) expect(o.fadeAlpha).toBeCloseTo(1, 6);
        if (fullAt < 0 && o.fadeAlpha >= 1 && o.fadeRgb === 0xffffff) fullAt = flyS;
      });
      expect(fullAt).toBeGreaterThan(3);
      expect(fullAt).toBeLessThanOrEqual(inp.flyOutS);
      expect(d.out.fadeRgb).toBe(0xffffff);
      expect(d.out.fadeAlpha).toBe(1); // held behind the Results card
    });
  }

  it("the strict reading (`viewEdge`): white full before the unclamped view would pass any map edge", () => {
    const shots: ExtractShots = { ...EXTRACT_SHOTS, fly: { ...EXTRACT_SHOTS.fly, whiteAt: "viewEdge" } };
    const d = new CameraDirector(shots);
    const inp = inputs();
    toLift(d, inp, 1);
    run(d, inp, 1, 9, 60, () => {
      const o = d.out;
      const hw = inp.screenW / (inp.ppm * o.zoom) / 2;
      if (inp.heliX + hw > 48 + 0.05) expect(o.fadeAlpha).toBeGreaterThan(0.99);
    });
    expect(d.out.whiteEndS).toBeLessThan(4);
  });
});

describe("cameraDirector › purity", () => {
  it("never writes its inputs (client only: the World it reads is untouched)", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.walkers = 2;
    inp.walkerX[0] = 10;
    inp.walkerY[0] = 20;
    inp.walkerX[1] = 30;
    inp.walkerY[1] = 10;
    inp.liftedAtTick = START + 3 * T;
    inp.cut = true;
    const before = JSON.stringify({ ...inp, walkerX: [...inp.walkerX], walkerY: [...inp.walkerY] });
    for (let s = 0; s < 14; s += 0.1) {
      inp.nowTick = START + s * T;
      d.update(inp);
    }
    inp.nowTick = START;
    expect(JSON.stringify({ ...inp, walkerX: [...inp.walkerX], walkerY: [...inp.walkerY] })).toBe(before);
  });
});

describe("cameraDirector › same on every phone (AC 9)", () => {
  it("a phone that wakes mid-fly-out jumps to the same shot as one that watched it all", () => {
    const live = new CameraDirector();
    const a = inputs();
    a.walkers = 0;
    a.allAboard = true;
    run(live, a, 0, 1, 60, () => {});
    a.liftedAtTick = START + T;
    run(live, a, 1, 4, 60, () => {});
    const late = new CameraDirector();
    const b = inputs();
    b.walkers = 0;
    b.allAboard = true;
    b.liftedAtTick = START + T;
    b.nowTick = a.nowTick;
    b.heliX = a.heliX;
    b.heliY = a.heliY;
    b.dtS = 30; // a long frame gap: snap
    const o = late.update(b);
    expect(o.bars).toBeCloseTo(live.out.bars, 6);
    expect(o.fadeAlpha).toBeCloseTo(live.out.fadeAlpha, 6);
    expect(o.dawnX).toBeCloseTo(live.out.dawnX, 6);
    expect(o.fogLift).toBeCloseTo(live.out.fogLift, 6);
    expect(o.zoom).toBeCloseTo(live.out.zoom, 2);
    expect(o.centreX).toBeCloseTo(live.out.centreX, 1);
  });

  it("a phone that wakes after the fly-out: full white at once (the Results card goes straight over it), no replay", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.allAboard = true;
    inp.liftedAtTick = START + T;
    inp.nowTick = START + 20 * T;
    inp.dtS = 60;
    const o = d.update(inp);
    expect(o.phase).toBe("done");
    expect(o.fadeRgb).toBe(0xffffff);
    expect(o.fadeAlpha).toBe(1);
    expect(o.hudShown).toBe(false);
  });

  it("two directors fed the same ticks at different frame rates agree on every timed value", () => {
    const a = new CameraDirector();
    const b = new CameraDirector();
    const ia = inputs();
    const ib = inputs();
    for (const i of [ia, ib]) {
      i.walkers = 0;
      i.allAboard = true;
      i.liftedAtTick = START + 1.5 * T;
    }
    run(a, ia, 0, 6, 60, () => {});
    run(b, ib, 0, 6, 24, () => {});
    ib.nowTick = ia.nowTick;
    b.update(ib);
    expect(b.out.bars).toBeCloseTo(a.out.bars, 6);
    expect(b.out.fadeAlpha).toBeCloseTo(a.out.fadeAlpha, 6);
    expect(b.out.dawnX).toBeCloseTo(a.out.dawnX, 6);
  });

  it("a new extraction (endless, later) starts over; leaving the phase turns it off and the HUD back on", () => {
    const d = new CameraDirector();
    const inp = inputs();
    inp.allAboard = true;
    inp.liftedAtTick = START + T;
    inp.nowTick = START + 20 * T;
    d.update(inp);
    inp.extracting = false;
    expect(d.update(inp).active).toBe(false);
    expect(d.out.hudShown).toBe(true);
    expect(d.out.fadeAlpha).toBe(0);
    inp.extracting = true;
    inp.startTick = START + 5000;
    inp.liftedAtTick = -1;
    inp.allAboard = false;
    inp.walkers = 1;
    inp.nowTick = inp.startTick;
    const o = d.update(inp);
    expect(o.phase).toBe("walk");
    expect(o.bars).toBe(0);
  });
});
