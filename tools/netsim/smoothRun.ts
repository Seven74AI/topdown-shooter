/**
 * Story 8.9 measurement (brief 13): smoothness and hits on the clean and lossy lines, through the
 * real client clock / delay / pacing and the real server RunController (`hitsSim.ts`). Not a test.
 *
 *   npx tsx tools/netsim/smoothRun.ts [seconds=60] [seeds=3]
 *
 * One JSON line per row (case × line), summed over the seeds. Story 8.10: the horde is drawn through the real
 * stream (encoder → stream decoder → HordeBuffer); `HORDE_NEAR_M=Infinity` in the env runs the all-20 Hz control.
 */
import { simulate, type Options } from "./hitsSim";

const seconds = Number(process.argv[2] ?? 60);
const seeds = Number(process.argv[3] ?? 3);

const cases: { name: string; o: Partial<Options> }[] = [
  { name: "150 walkers, standing", o: { walkers: 150, kite: false } },
  { name: "150 walkers, kiting", o: { walkers: 150, kite: true } },
  { name: "20 runners, kiting", o: { zombieType: "runner", kite: true } },
];
const lines: { name: string; o: Partial<Options> }[] = [
  { name: "clean", o: {} },
  { name: "1% x 200 ms", o: { loss: { pct: 1, stallMs: 200 } } },
  { name: "2% x 200 ms", o: { loss: { pct: 2, stallMs: 200 } } },
  { name: "1% x 200 ms + 150 ms step", o: { loss: { pct: 1, stallMs: 200 }, latencyStep: { atMs: 20_000, addMs: 150 } } },
];

const pct = (a: number, b: number): number => (b > 0 ? Math.round((1000 * a) / b) / 10 : 0);

for (const c of cases) {
  for (const l of lines) {
    if (l.name.includes("step") && c.name !== "20 runners, kiting") continue;
    let apparent = 0;
    let reversed = 0;
    let freezes = 0;
    let freezeFrames = 0;
    let back = 0;
    let estBack = 0;
    let starved = 0;
    let neverFired = 0;
    let localShots = 0;
    let drained = 0;
    let overflow = 0;
    let slow = 0;
    let qChanges = 0;
    let frames = 0;
    let rateMin = Infinity;
    let rateMax = 0;
    const p50: number[] = [];
    const p95: number[] = [];
    let dmax = 0;
    let hordeBytes = 0;
    let hordeErrors = 0;
    let keyframes = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = simulate({ seconds, oneWayMs: 75, jitterHalfMs: 10, seed, weapon: "pistol", kite: false, ...(process.env.HORDE_NEAR_M ? { hordeNearM: Number(process.env.HORDE_NEAR_M) } : {}), ...c.o, ...l.o });
      const s = r.smooth;
      apparent += r.apparentHits;
      reversed += r.reversed;
      freezes += s.freezes;
      freezeFrames += s.freezeFrames;
      back += s.renderBackSteps;
      estBack += s.estimateBackSteps;
      starved += s.starvedTicks;
      neverFired += s.neverFired;
      localShots += s.localShots;
      drained += r.drops.drained;
      overflow += r.drops.overflow;
      slow += s.slowFrames;
      qChanges += s.queuedChanges;
      frames += s.frames;
      rateMin = Math.min(rateMin, s.rateMin);
      rateMax = Math.max(rateMax, s.rateMax);
      p50.push(s.delayP50);
      p95.push(s.delayP95);
      dmax = Math.max(dmax, s.delayMax);
      hordeBytes += r.horde.bytes; // Story 8.10: the real stream
      hordeErrors += r.horde.decodeErrors;
      keyframes += r.horde.keyframes;
    }
    const per30 = (n: number): number => Math.round((n / ((seeds * (seconds - 2)) / 30)) * 10) / 10;
    process.stdout.write(
      JSON.stringify({
        case: c.name,
        line: l.name,
        freezesPer30s: per30(freezes),
        freezeFrames,
        renderBack: back,
        estimateBack: estBack,
        delayP50: p50.map(Math.round),
        delayP95: p95.map(Math.round),
        delayMax: Math.round(dmax),
        rate: [Math.round(rateMin * 1000) / 1000, Math.round(rateMax * 1000) / 1000],
        neverFiredPct: pct(neverFired, localShots),
        neverFired,
        localShots,
        starvedTicks: starved,
        drained,
        overflow,
        slowFramesPct: pct(slow, frames),
        queuedChangesPerS: Math.round((qChanges / (seeds * seconds)) * 10) / 10,
        apparent,
        reversedPct: pct(reversed, apparent),
        hordeKBps: Math.round((hordeBytes / 1024 / (seeds * seconds)) * 10) / 10,
        keyframesPerS: Math.round((keyframes / (seeds * seconds)) * 100) / 100,
        hordeDecodeErrors: hordeErrors,
      }) + "\n",
    );
  }
}
