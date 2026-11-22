import { describe, expect, it } from "vitest";
import {
  AMBIENCE_CROSSFADE_S,
  AMBIENCE_GAIN,
  AMBIENCE_LOOP_S,
  AmbiencePlayer,
  ambienceLoopForStage,
  ambienceStep,
  createAmbienceState,
  synthAmbienceLoop,
  type AmbienceContext,
} from "./ambience";

/** Stories 4.6 / 4.7: the ambience follows the decay stage (pure part + the player on a fake WebAudio). */

describe("ambience state (pure)", () => {
  it("stage 1 → evening, 2+ → panic (until 4.8's rain)", () => {
    expect([1, 2, 3, 4, 5].map(ambienceLoopForStage)).toEqual(["evening", "panic", "panic", "panic", "panic"]);
  });

  it("waits for unlocked audio, starts on the stage's loop, crossfades once per change, never per frame", () => {
    const s = createAmbienceState();
    expect(ambienceStep(s, 1, false, false)).toBe("none"); // no gesture yet (mobile autoplay)
    expect(s.playing).toBe(null);
    expect(ambienceStep(s, 1, true, false)).toBe("start");
    expect(s.playing).toBe("evening");
    for (let f = 0; f < 100; f++) expect(ambienceStep(s, 1, true, false)).toBe("none");
    expect(ambienceStep(s, 2, true, false)).toBe("crossfade");
    expect(s.playing).toBe("panic");
    expect(ambienceStep(s, 2, true, false)).toBe("none");
    expect(ambienceStep(s, 3, true, false)).toBe("none"); // same loop at stage 3 for now
    expect(ambienceStep(s, 1, true, false)).toBe("crossfade"); // dev cheat back to stage 1
  });

  it("a late join starts straight on the current stage's loop; a tab hidden across the build start mutes, then catches up", () => {
    const late = createAmbienceState();
    expect(ambienceStep(late, 2, true, false)).toBe("start");
    expect(late.playing).toBe("panic");
    const s = createAmbienceState();
    ambienceStep(s, 1, true, false);
    expect(ambienceStep(s, 1, true, true)).toBe("mute");
    expect(ambienceStep(s, 2, true, true)).toBe("none"); // the stage changed while hidden: nothing plays
    expect(s.playing).toBe("evening");
    expect(ambienceStep(s, 2, true, false)).toBe("unmute");
    expect(ambienceStep(s, 2, true, false)).toBe("crossfade");
    expect(s.playing).toBe("panic");
  });
});

describe("placeholder loops (pure synthesis)", () => {
  const rate = 8000;
  it("8 s, finite, normalized, not silent, seamless at the loop point; the two loops differ", () => {
    const ev = synthAmbienceLoop("evening", rate);
    const pa = synthAmbienceLoop("panic", rate);
    for (const [name, b] of [["evening", ev], ["panic", pa]] as const) {
      expect(b.length, name).toBe(AMBIENCE_LOOP_S * rate);
      let peak = 0;
      let energy = 0;
      let maxStep = 0;
      for (let i = 0; i < b.length; i++) {
        const v = b[i] as number;
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
        energy += v * v;
        if (i > 0) maxStep = Math.max(maxStep, Math.abs(v - (b[i - 1] as number)));
      }
      expect(peak, name).toBeCloseTo(0.9, 5);
      expect(Math.sqrt(energy / b.length), name).toBeGreaterThan(0.05);
      // The loop point (last → first sample) jumps no more than the loop's own largest step.
      expect(Math.abs((b[0] as number) - (b[b.length - 1] as number)), name).toBeLessThanOrEqual(maxStep);
    }
    // Panic is sirens (high, tonal): many more zero crossings than the evening's rumble and chords.
    const crossings = (b: Float32Array) => {
      let n = 0;
      for (let i = 1; i < b.length; i++) if (((b[i] as number) >= 0) !== ((b[i - 1] as number) >= 0)) n++;
      return n;
    };
    expect(crossings(pa)).toBeGreaterThan(2 * crossings(ev));
  });
});

/** A fake AudioContext that records gain automation. */
function fakeContext() {
  const ramps: { node: number; value: number; at: number }[] = [];
  let nodes = 0;
  const param = (node: number) => ({
    value: 0,
    cancelScheduledValues() {},
    setValueAtTime(v: number) {
      this.value = v;
    },
    linearRampToValueAtTime(v: number, at: number) {
      ramps.push({ node, value: v, at });
    },
  });
  const node = () => {
    const id = nodes++;
    const n = { id, gain: param(id), connect: (to: unknown) => to, buffer: null as unknown, loop: false, started: 0, stopped: -1, start() {
      this.started++;
    }, stop(at: number) {
      this.stopped = at;
    } };
    return n;
  };
  const ctx = {
    currentTime: 10,
    destination: {},
    createGain: node,
    createBufferSource: node,
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return { ctx: ctx as unknown as AmbienceContext, ramps, count: () => nodes };
}

describe("AmbiencePlayer (fake WebAudio)", () => {
  it("nothing before the gesture; then fades the evening loop in; crossfades to panic over 3 s on stage 2; no nodes per frame; mutes while hidden", () => {
    const f = fakeContext();
    let unlocked = false;
    let hidden = false;
    const p = new AmbiencePlayer(() => (unlocked ? f.ctx : null), () => hidden, null);
    for (let i = 0; i < 10; i++) p.update(1);
    expect(f.count()).toBe(0);
    expect(p.playing).toBe(null);
    unlocked = true;
    p.update(1);
    expect(p.playing).toBe("evening");
    const built = f.count();
    expect(built).toBe(5); // bus + (source, gain) × 2 loops, once
    expect(f.ramps.map((r) => [r.value, r.at])).toEqual([
      [1, 10 + AMBIENCE_CROSSFADE_S],
      [0, 10 + AMBIENCE_CROSSFADE_S],
    ]);
    f.ramps.length = 0;
    for (let i = 0; i < 600; i++) p.update(1); // 10 s of frames
    expect(f.count()).toBe(built);
    expect(f.ramps).toEqual([]);
    p.update(2); // the build start before wave 3
    expect(p.playing).toBe("panic");
    expect(f.ramps.map((r) => r.value)).toEqual([0, 1]); // evening down, panic up
    expect(f.ramps.every((r) => r.at === 10 + AMBIENCE_CROSSFADE_S)).toBe(true);
    f.ramps.length = 0;
    hidden = true;
    p.update(2);
    expect(f.ramps).toHaveLength(1);
    expect(f.ramps[0]?.value).toBe(0); // the bus ducked
    hidden = false;
    p.update(2);
    expect(f.ramps[1]?.value).toBe(AMBIENCE_GAIN);
    expect(f.count()).toBe(built);
    p.dispose();
    expect(p.playing).toBe(null);
  });
});
