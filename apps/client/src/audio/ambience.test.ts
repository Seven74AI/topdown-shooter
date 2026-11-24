import { describe, expect, it } from "vitest";
import {
  AMBIENCE_CROSSFADE_S,
  AMBIENCE_GAIN,
  AMBIENCE_LOOP_S,
  AmbiencePlayer,
  ambienceLoopData,
  AMBIENCE_LOOPS,
  ambienceLoopForStage,
  ambienceLoopsReady,
  ambienceSynthStats,
  prewarmAmbience,
  synthAmbienceLoop as synthWhole,
  ambienceStep,
  createAmbienceState,
  synthAmbienceLoop,
  type AmbienceContext,
} from "./ambience";

/** Stories 4.6 / 4.7: the ambience follows the decay stage (pure part + the player on a fake WebAudio). */

describe("ambience state (pure)", () => {
  it("stage 1 → evening, 2–3 → panic, Story 6.2: 4 → ruins, Story 6.4: 5 → collapse (ash style: no rain bed)", () => {
    expect([1, 2, 3, 4, 5].map((st) => ambienceLoopForStage(st))).toEqual(["evening", "panic", "panic", "ruins", "collapse"]);
    expect([0, 1, 2, 3].map((style) => ambienceLoopForStage(5, style))).toEqual(["collapse", "collapse", "collapse_ash", "collapse"]);
  });

  it("Story 6.2 / 6.4: crossfades panic → ruins at stage 4 and ruins → collapse at stage 5 (once each)", () => {
    const s = createAmbienceState();
    expect(ambienceStep(s, 3, true, false)).toBe("start");
    expect(ambienceStep(s, 4, true, false)).toBe("crossfade");
    expect(s.playing).toBe("ruins");
    expect(ambienceStep(s, 4, true, false)).toBe("none");
    expect(ambienceStep(s, 5, true, false, 0)).toBe("crossfade");
    expect(s.playing).toBe("collapse");
    expect(ambienceStep(s, 5, true, false, 2)).toBe("crossfade"); // endless rotates into ash: the rain bed goes
    expect(s.playing).toBe("collapse_ash");
    for (const id of ["ruins", "collapse", "collapse_ash"] as const) expect(synthAmbienceLoop(id).some((v) => v !== 0)).toBe(true);
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
  const made: { id: number; stopped: number; started: number; disconnected: number; buffer: unknown }[] = [];
  const buffers: Float32Array[] = [];
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
    const n = { id, gain: param(id), connect: (to: unknown) => to, buffer: null as unknown, loop: false, started: 0, stopped: -1, disconnected: 0, start() {
      this.started++;
    }, stop(at = 0) {
      this.stopped = at;
    }, disconnect() {
      this.disconnected++;
    } };
    made.push(n);
    return n;
  };
  const ctx = {
    currentTime: 10,
    destination: {},
    createGain: node,
    createBufferSource: node,
    createBuffer: (_c: number, len: number) => {
      const data = new Float32Array(len);
      buffers.push(data);
      return { getChannelData: () => data };
    },
  };
  return { ctx: ctx as unknown as AmbienceContext, ramps, count: () => nodes, made, buffers };
}

describe("AmbiencePlayer (fake WebAudio)", () => {
  it("review M: the loops are synthesized in idle slices once per page; the player waits for them (never synthesizes at the first tap)", () => {
    const f = fakeContext();
    const waiting = new AmbiencePlayer(() => f.ctx, () => false, null);
    const queued: ((d: { timeRemaining(): number }) => void)[] = [];
    prewarmAmbience((cb) => queued.push(cb)); // the Boot scene's call (start screen)
    for (let i = 0; i < 5; i++) waiting.update(1);
    expect(waiting.playing).toBe(null); // audio runs, but the data is not there yet: wait
    expect(f.count()).toBe(0);
    let slices = 0;
    while (queued.length > 0) {
      const cb = queued.shift() as (d: { timeRemaining(): number }) => void;
      slices++;
      cb({ timeRemaining: () => 0 }); // a busy page: one slice per idle callback
    }
    expect(ambienceLoopsReady()).toBe(true);
    expect(slices).toBeGreaterThan(10); // spread over many idle callbacks
    const synthesized = ambienceSynthStats.loops;
    waiting.update(1);
    expect(waiting.playing).toBe("evening");
    waiting.dispose();
    // A second run / restart (new player, even a new context) reuses the cached data: no synthesis.
    const g = fakeContext();
    const second = new AmbiencePlayer(() => g.ctx, () => false, null);
    second.update(2);
    expect(second.playing).toBe("panic");
    expect(ambienceSynthStats.loops).toBe(synthesized); // nothing synthesized for the second run
    expect(g.buffers.map((b) => b.length)).toEqual(AMBIENCE_LOOPS.map(() => AMBIENCE_LOOP_S * 22050));
    expect(g.buffers[1]).toEqual(ambienceLoopData("panic"));
    prewarmAmbience(() => {
      throw new Error("no second prewarm");
    });
    second.dispose();
    expect(ambienceLoopData("evening")).toEqual(synthWhole("evening")); // the sliced synthesis = the one-shot one
  });

  it("review L: dispose stops both sources and disconnects every node (bus, voice gains, sources)", () => {
    const f = fakeContext();
    const p = new AmbiencePlayer(() => f.ctx, () => false, null);
    p.update(1);
    expect(f.made).toHaveLength(1 + 2 * AMBIENCE_LOOPS.length); // the bus + a gain and a source per loop
    p.dispose();
    const sources = f.made.filter((n) => n.started > 0);
    expect(sources).toHaveLength(AMBIENCE_LOOPS.length);
    for (const s of sources) expect(s.stopped).toBeGreaterThanOrEqual(0);
    for (const n of f.made) expect(n.disconnected, `node ${n.id}`).toBe(1);
    p.update(1); // after dispose a new start would build fresh nodes, never touch the old ones
    expect(f.made.slice(0, 1 + 2 * AMBIENCE_LOOPS.length).every((n) => n.disconnected === 1)).toBe(true);
  });

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
    expect(built).toBe(1 + 2 * AMBIENCE_LOOPS.length); // bus + (source, gain) per loop, once
    expect(f.ramps.map((r) => [r.value, r.at])).toEqual(AMBIENCE_LOOPS.map((id) => [id === "evening" ? 1 : 0, 10 + AMBIENCE_CROSSFADE_S]));
    f.ramps.length = 0;
    for (let i = 0; i < 600; i++) p.update(1); // 10 s of frames
    expect(f.count()).toBe(built);
    expect(f.ramps).toEqual([]);
    p.update(2); // the build start before wave 3
    expect(p.playing).toBe("panic");
    expect(f.ramps.map((r) => r.value)).toEqual(AMBIENCE_LOOPS.map((id) => (id === "panic" ? 1 : 0))); // evening down, panic up
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
