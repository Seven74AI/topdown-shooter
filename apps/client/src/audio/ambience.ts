/**
 * Stories 4.6 / 4.7: placeholder ambience that follows the decay stage (GDD › Audio: "Ambience
 * follows decay: Evening = traffic, distant music … Panic = sirens, car alarms"). Architecture ›
 * Audio: its own bus (music, SFX, ambience).
 *
 * Three layers, so Epic 9 can swap in recorded loops without touching callers:
 *
 * 1. Pure choice + state (`ambienceLoopForStage`, `ambienceStep`): what to do this frame given the
 *    stage, whether audio is unlocked and whether the tab is hidden. Unit-tested.
 * 2. Pure synthesis (`synthAmbienceLoop`): a seamless mono loop as a Float32Array (procedural
 *    placeholder; Epic 9 replaces this with decoded files of the same ids).
 * 3. `AmbiencePlayer`: the WebAudio side. One looping source + gain per loop on an ambience bus;
 *    a stage change crossfades the two gains over `AMBIENCE_CROSSFADE_S` with WebAudio ramps.
 *
 * It reads `world.decay.stage` every frame (not only the `decay.stage_changed` event), so a late
 * join, a late Game scene or a tab that slept across a build start converges to the right loop.
 * Per frame: one context check and two integer compares; nothing is allocated after the first
 * start. It starts only once the shared AudioContext runs (after a user gesture: mobile autoplay).
 */
import { audioContextIfRunning } from "./placeholderSfx";

export const AMBIENCE_LOOPS = ["evening", "panic"] as const;
export type AmbienceLoopId = (typeof AMBIENCE_LOOPS)[number];

/** Story 4.7: seconds for one loop to hand over to the next on a stage change (or to fade in). */
export const AMBIENCE_CROSSFADE_S = 3;
/** Bus level (the SFX master is 0.25; ambience sits under it). No player setting exists yet (Story 10.1). */
export const AMBIENCE_GAIN = 0.16;
/** Seconds to duck the bus when the tab is hidden / back on wake. */
export const AMBIENCE_HIDE_FADE_S = 0.25;
/** Length of each placeholder loop and the rate it is synthesized at (WebAudio resamples). */
export const AMBIENCE_LOOP_S = 8;
export const AMBIENCE_SYNTH_RATE = 22050;

/** Stage → loop. Story 4.8 maps stage 3 to its rain loop; until then every later stage keeps Panic. */
export function ambienceLoopForStage(stage: number): AmbienceLoopId {
  return stage <= 1 ? "evening" : "panic";
}

export interface AmbienceState {
  /** The loop fading in or playing (null before the first start). */
  playing: AmbienceLoopId | null;
  /** The bus is ducked because the tab is hidden. */
  muted: boolean;
}

export function createAmbienceState(): AmbienceState {
  return { playing: null, muted: false };
}

/** What `ambienceStep` asks the player to do (string constants: no allocation). */
export type AmbienceAction = "none" | "start" | "crossfade" | "mute" | "unmute";

/**
 * The pure core: updates `s` and returns the one thing to do now. Nothing happens until audio is
 * unlocked. Hidden → mute (once); visible again → unmute (the next call then catches up with a
 * stage that changed meanwhile). First start = fade in from silence; a different loop = crossfade.
 */
export function ambienceStep(s: AmbienceState, stage: number, audioRunning: boolean, hidden: boolean): AmbienceAction {
  if (!audioRunning) return "none";
  if (hidden) {
    if (s.muted) return "none";
    s.muted = true;
    return "mute";
  }
  if (s.muted) {
    s.muted = false;
    return "unmute";
  }
  const want = ambienceLoopForStage(stage);
  if (s.playing === null) {
    s.playing = want;
    return "start";
  }
  if (s.playing === want) return "none";
  s.playing = want;
  return "crossfade";
}

// ---- synthesis (pure) ----------------------------------------------------------------------------

/** Tiny LCG (deterministic noise, no Math.random). */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return (x / 4294967296) * 2 - 1;
  };
}

const TAU = Math.PI * 2;
const bump = (t: number, at: number, width: number): number => Math.exp(-(((t - at) / width) ** 2));

/** Evening: traffic rumble with three cars passing, distant muffled music (chords + a soft kick). */
function evening(out: Float32Array, rate: number): void {
  const n = out.length;
  const noise = lcg(7);
  let brown = 0;
  let hiss = 0;
  const chords = [
    [220, 261.63, 329.63], // Am
    [174.61, 220, 261.63], // F
    [196, 261.63, 329.63], // C
    [196, 246.94, 293.66], // G
  ];
  const chordS = AMBIENCE_LOOP_S / chords.length;
  const beatS = 0.5; // 120 bpm
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const w = noise();
    brown = brown * 0.995 + w * 0.05;
    hiss = hiss * 0.6 + w * 0.4;
    const cars = 0.35 + bump(t, 1.4, 0.8) + 0.8 * bump(t, 4.3, 0.6) + 0.9 * bump(t, 6.7, 0.9);
    let v = brown * 0.55 * cars + hiss * 0.025 * cars;
    const ci = Math.min(chords.length - 1, Math.floor(t / chordS));
    const ct = t - ci * chordS;
    const win = 0.5 - 0.5 * Math.cos((TAU * ct) / chordS); // 0 at each chord edge: seamless
    for (const f of chords[ci] as number[]) v += 0.03 * win * Math.sin(TAU * f * t);
    const bt = t % beatS;
    v += 0.12 * Math.exp(-bt / 0.09) * Math.sin(TAU * 55 * bt);
    out[i] = v;
  }
}

/** Panic: a wailing siren, a hi-lo siren further off, a car alarm beeping, low rumble. */
function panic(out: Float32Array, rate: number): void {
  const n = out.length;
  const noise = lcg(11);
  let brown = 0;
  let phA = 0;
  let phB = 0;
  let phC = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    brown = brown * 0.996 + noise() * 0.04;
    // Wail: 600 → 1300 Hz and back every 4 s (two cycles per loop: periodic).
    const fA = 950 - 350 * Math.cos((TAU * t) / 4);
    phA += (TAU * fA) / rate;
    // Hi-lo: 650 / 870 Hz alternating each 0.5 s, swelling in and out over the loop.
    const fB = Math.floor(t / 0.5) % 2 === 0 ? 650 : 870;
    phB += (TAU * fB) / rate;
    const swellB = 0.5 - 0.5 * Math.cos((TAU * t) / AMBIENCE_LOOP_S);
    // Car alarm: 1.1 kHz square-ish beeps, 0.15 s on / 0.15 s off, from 0.6 s to 4.8 s.
    phC += (TAU * 1100) / rate;
    const beepOn = t > 0.6 && t < 4.8 && (t - 0.6) % 0.3 < 0.15 ? 1 : 0;
    const square = Math.sin(phC) + Math.sin(3 * phC) / 3 + Math.sin(5 * phC) / 5;
    out[i] = 0.1 * Math.sin(phA) + 0.05 * swellB * Math.sin(phB) + 0.045 * beepOn * square + brown * 0.35;
  }
}

/**
 * The loop `id` as a seamless mono buffer of `AMBIENCE_LOOP_S` at `rate`: synthesized a little
 * longer, then the tail crossfaded into the head (no click at the loop point), normalized to a
 * 0.9 peak. Pure (tests); the player calls it once per loop at the first start.
 */
export function synthAmbienceLoop(id: AmbienceLoopId, rate = AMBIENCE_SYNTH_RATE): Float32Array {
  const n = Math.round(AMBIENCE_LOOP_S * rate);
  const fade = Math.round(0.25 * rate);
  const raw = new Float32Array(n + fade);
  if (id === "evening") evening(raw, rate);
  else panic(raw, rate);
  const out = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let v = raw[i] as number;
    if (i < fade) {
      const k = i / fade;
      v = v * k + (raw[n + i] as number) * (1 - k);
    }
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const scale = peak > 0 ? 0.9 / peak : 0;
  for (let i = 0; i < n; i++) out[i] = (out[i] as number) * scale;
  return out;
}

// ---- WebAudio player -----------------------------------------------------------------------------

/** The slice of the WebAudio API the player uses (a fake in tests). */
export type AmbienceContext = Pick<AudioContext, "currentTime" | "destination" | "createGain" | "createBuffer" | "createBufferSource">;

interface Voice {
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
}

function rampTo(g: GainNode, value: number, now: number, durS: number): void {
  const p = g.gain;
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.linearRampToValueAtTime(value, now + durS);
}

/**
 * Plays the ambience for the stage it is given each frame. `getContext` defaults to the shared SFX
 * context (unlocked by the HUD's first touch/click); `getHidden` to `document.hidden`, and a
 * `visibilitychange` listener ducks the bus at once (rendering stops while hidden, so `update` would
 * not run). `dispose()` fades out and stops everything (scene shutdown).
 */
export class AmbiencePlayer {
  private readonly state = createAmbienceState();
  private ctx: AmbienceContext | null = null;
  private bus: GainNode | null = null;
  private readonly voices = new Map<AmbienceLoopId, Voice>();
  private lastStage = 1;
  private readonly onVisibility = (): void => this.update(this.lastStage);
  /** Counts WebAudio node creations (tests: nothing per frame). */
  nodesCreated = 0;

  constructor(
    private readonly getContext: () => AmbienceContext | null = audioContextIfRunning,
    private readonly getHidden: () => boolean = () => typeof document !== "undefined" && document.hidden,
    private readonly doc: Pick<Document, "addEventListener" | "removeEventListener"> | null = typeof document !== "undefined" ? document : null,
  ) {
    this.doc?.addEventListener("visibilitychange", this.onVisibility);
  }

  /** The loop that is playing or fading in (tests, browser checks). */
  get playing(): AmbienceLoopId | null {
    return this.state.playing;
  }

  update(stage: number): void {
    this.lastStage = stage;
    const c = this.ctx ?? this.getContext();
    const action = ambienceStep(this.state, stage, c !== null, this.getHidden());
    if (action === "none" || c === null) return;
    if (this.ctx === null) this.build(c);
    const now = c.currentTime;
    const bus = this.bus as GainNode;
    switch (action) {
      case "mute":
        rampTo(bus, 0, now, AMBIENCE_HIDE_FADE_S);
        return;
      case "unmute":
        rampTo(bus, AMBIENCE_GAIN, now, AMBIENCE_HIDE_FADE_S);
        return;
      default:
        // start (fade in from silence) or crossfade: the wanted loop up, every other one down.
        for (const [id, v] of this.voices) rampTo(v.gain, id === this.state.playing ? 1 : 0, now, AMBIENCE_CROSSFADE_S);
    }
  }

  private build(c: AmbienceContext): void {
    this.ctx = c;
    const bus = c.createGain();
    bus.gain.value = AMBIENCE_GAIN;
    bus.connect(c.destination);
    this.bus = bus;
    this.nodesCreated++;
    for (const id of AMBIENCE_LOOPS) {
      const data = synthAmbienceLoop(id);
      const buf = c.createBuffer(1, data.length, AMBIENCE_SYNTH_RATE);
      buf.getChannelData(0).set(data);
      const source = c.createBufferSource();
      source.buffer = buf;
      source.loop = true;
      const gain = c.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(bus);
      source.start();
      this.voices.set(id, { gain, source });
      this.nodesCreated += 2;
    }
  }

  dispose(): void {
    this.doc?.removeEventListener("visibilitychange", this.onVisibility);
    const c = this.ctx;
    if (c && this.bus) {
      const now = c.currentTime;
      rampTo(this.bus, 0, now, AMBIENCE_HIDE_FADE_S);
      for (const v of this.voices.values()) v.source.stop(now + AMBIENCE_HIDE_FADE_S);
    }
    this.voices.clear();
    this.ctx = null;
    this.bus = null;
    this.state.playing = null;
    this.state.muted = false;
  }
}
